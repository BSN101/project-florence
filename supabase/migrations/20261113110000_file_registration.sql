-- T-016: private file registration and download authorization (FL-007, FL-023, FL-047).
-- Objects live in private R2; this records metadata and decides who may read it.
-- The server builds every storage key as <purpose>/<actor>/<request key>.<ext>, so a
-- retry targets the same object and one user can never write over another's key.
-- Stored type/size describe the compressed object the server actually wrote.
begin;

create function public.register_file(p_key uuid, p_actor uuid, p_purpose text, p_storage_key text,
    p_media_type text, p_byte_size bigint) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_id uuid; v_ext text; v_type text; v_max bigint;
begin
    select x.ext, x.type, x.max into v_ext, v_type, v_max from (values
        ('roster_import', 'csv', 'text/csv', 1048576::bigint),
        ('payment_proof', 'webp', 'image/webp', 4194304::bigint),
        ('payment_account_qr', 'png', 'image/png', 2097152::bigint)) x(purpose, ext, type, max)
        where x.purpose = p_purpose;
    if v_ext is null then raise exception 'Unknown file purpose' using errcode = '22023'; end if;
    if p_key is null or p_storage_key is distinct from p_purpose || '/' || p_actor || '/' || p_key || '.' || v_ext
        or p_media_type is distinct from v_type or p_byte_size is null or p_byte_size <= 0 or p_byte_size > v_max then
        raise exception 'Invalid file metadata' using errcode = '22023';
    end if;

    if p_purpose = 'roster_import' then
        perform public.f_cmd_council(p_actor);
    elsif p_purpose = 'payment_account_qr' then
        perform public.f_cmd_council(p_actor, false, true);
    else
        perform public.f_cmd_actor(p_actor);
        if not exists (select 1 from public.enrollments where student_id = p_actor) then
            raise exception 'Only students can upload payment proof' using errcode = '42501';
        end if;
    end if;

    v_result := public.f_cmd_begin(p_key, 'register_file', p_actor, jsonb_build_object(
        'purpose', p_purpose, 'storage_key', p_storage_key, 'media_type', p_media_type, 'byte_size', p_byte_size));
    if v_result is not null then return v_result; end if;
    insert into public.files(uploader_id, purpose, storage_key, media_type, byte_size)
        values (p_actor, p_purpose, p_storage_key, p_media_type, p_byte_size) returning id into v_id;
    return public.f_cmd_finish(p_key, jsonb_build_object('file_id', v_id));
end $$;

-- Returns the object locator only when the actor may read the file; otherwise no row.
--   roster_import:      Executive/Operations.
--   payment_proof:      the uploading student; Executive/Operations once a payment uses it.
--   payment_account_qr: Executive; students while an active payment account uses it.
create function public.file_download_key(p_actor uuid, p_file uuid)
returns table(storage_key text, media_type text, purpose text)
language sql stable security definer set search_path = pg_catalog as $$
    with actor as (
        select p.id,
            exists (select 1 from public.council_memberships m where m.profile_id = p.id and m.removed_at is null
                and m.access_role in ('executive', 'operations')) as council,
            exists (select 1 from public.council_memberships m where m.profile_id = p.id and m.removed_at is null
                and m.access_role = 'executive') as executive,
            exists (select 1 from public.enrollments n where n.student_id = p.id) as student
        from public.profiles p
        where p.id = p_actor and p.account_status = 'active' and p.auth_user_id is not null
    )
    select f.storage_key, f.media_type, f.purpose
    from public.files f cross join actor a
    where f.id = p_file and case f.purpose
        when 'roster_import' then a.council
        when 'payment_proof' then f.uploader_id = a.id
            or (a.council and exists (select 1 from public.payments y where y.proof_file_id = f.id))
        when 'payment_account_qr' then a.executive
            or (a.student and exists (select 1 from public.payment_accounts c
                where c.qr_file_id = f.id and c.archived_at is null))
        else false end
$$;

revoke all on function public.register_file(uuid, uuid, text, text, text, bigint) from public, anon, authenticated, service_role;
grant execute on function public.register_file(uuid, uuid, text, text, text, bigint) to service_role;
revoke all on function public.file_download_key(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.file_download_key(uuid, uuid) to service_role;

commit;
