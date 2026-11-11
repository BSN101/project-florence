-- Council catalog projection: reveal only fine definitions and their creator's
-- current display name; do not broaden profile RLS or expose other profile fields.
begin;

create function public.florence_fine_definitions()
returns table (
    id uuid,
    name text,
    amount numeric,
    archived_at timestamptz,
    created_by uuid,
    created_at timestamptz,
    updated_at timestamptz,
    creator_name text
)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
    if not f_access_private.council() then
        raise exception 'Fine definition catalog access denied' using errcode = '42501';
    end if;

    return query
    select f.id, f.name, f.amount, f.archived_at, f.created_by,
        f.created_at, f.updated_at,
        concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix)
    from public.fine_definitions f
    join public.profiles p on p.id = f.created_by
    order by f.created_at desc, f.id;
end $$;

revoke all on function public.florence_fine_definitions()
    from public, anon, authenticated, service_role;
grant execute on function public.florence_fine_definitions() to authenticated;

commit;
