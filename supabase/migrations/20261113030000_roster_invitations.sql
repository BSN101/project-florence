-- FL-008 / T-018: Individual/bulk roster invitations and scoped pending-invitation cancellation
-- Council Executive and Council Operations only.
begin;

-- Private helper (never granted) ----------------------------------------------

create or replace function public.f_cmd_student_target(p_profile uuid)
 returns public.profiles
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
 set "TimeZone" to 'UTC'
as $$
declare p public.profiles%rowtype;
begin
    select * into p from public.profiles where id = p_profile for update;
    if not found or p.university_id is null then
        raise exception 'Student profile not found' using errcode = '22023';
    end if;
    return p;
end $$;

-- Commands (service_role only) --------------------------------------------------

create or replace function public.roster_invite_student(
    p_key uuid,
    p_actor uuid,
    p_student uuid,
    p_token_hash text,
    p_expires_at timestamp with time zone
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
 set "TimeZone" to 'UTC'
as $$
declare
    v_result jsonb;
    v_semester uuid;
    p public.profiles%rowtype;
    v_invitation uuid;
    v_closed boolean := false;
begin
    perform public.f_cmd_council(p_actor);
    v_result := public.f_cmd_begin(p_key, 'roster_invite_student', p_actor, jsonb_build_object('student', p_student));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;

    perform public.f_cmd_token(p_token_hash, p_expires_at);

    p := public.f_cmd_student_target(p_student);
    if p.account_status <> 'active' then
        raise exception 'This student''s account is archived. Contact a Platform Admin.' using errcode = '55000';
    end if;
    if p.auth_user_id is not null then
        raise exception 'This student already has an active account' using errcode = '55000';
    end if;
    if p.email is null or btrim(p.email) = '' then
        raise exception 'Student profile has no email address' using errcode = '22023';
    end if;

    -- Verify current semester enrollment
    v_semester := public.f_cmd_current_semester();
    if not exists (select 1 from public.enrollments where student_id = p.id and semester_id = v_semester) then
        raise exception 'This student is not enrolled in the current semester' using errcode = '55000';
    end if;

    -- Close any prior pending invitation
    v_closed := public.f_cmd_close_pending_invitation(p.id);

    insert into public.invitations (profile_id, email, purpose, status, token_hash, expires_at, created_by)
        values (p.id, lower(btrim(p.email)), 'student_access', 'pending', p_token_hash, p_expires_at, p_actor)
        returning id into v_invitation;

    return public.f_cmd_finish(p_key, jsonb_build_object(
        'profile_id', p.id,
        'invitation_id', v_invitation,
        'email', lower(btrim(p.email)),
        'first_name', p.first_name,
        'previous_closed', v_closed,
        'replayed', false
    ));
end $$;

create or replace function public.roster_cancel_invitation(
    p_key uuid,
    p_actor uuid,
    p_invitation uuid
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
 set "TimeZone" to 'UTC'
as $$
declare
    v_result jsonb;
    v_profile uuid;
    i public.invitations%rowtype;
begin
    perform public.f_cmd_council(p_actor);
    v_result := public.f_cmd_begin(p_key, 'roster_cancel_invitation', p_actor, jsonb_build_object('invitation', p_invitation));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;

    select profile_id into v_profile from public.invitations where id = p_invitation;
    if not found then
        raise exception 'Invitation not found' using errcode = '22023';
    end if;

    perform 1 from public.profiles where id = v_profile for update;
    select * into i from public.invitations where id = p_invitation for update;

    if not found or i.purpose <> 'student_access' then
        raise exception 'Invitation is outside Council scope' using errcode = '42501';
    end if;
    if i.status <> 'pending' then
        raise exception 'Only pending invitations can be cancelled' using errcode = '55000';
    end if;

    update public.invitations set status = 'cancelled', cancelled_at = now() where id = i.id;

    return public.f_cmd_finish(p_key, jsonb_build_object(
        'invitation_id', i.id,
        'profile_id', v_profile,
        'replayed', false
    ));
end $$;

-- Query functions (authenticated) ----------------------------------------------

create or replace function public.florence_invitation_statuses(p_profile uuid)
 returns table(
    id uuid,
    status text,
    email text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone,
    accepted_at timestamp with time zone,
    cancelled_at timestamp with time zone
 )
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $$
begin
    if not exists(
        select 1 from public.profiles p
        where p.id = p_profile and (
            (f_access_private.council() and p.university_id is not null)
            or (f_access_private.has_role('Platform Admin') and (
                p.university_id is null or exists(
                    select 1 from public.council_memberships c
                    where c.profile_id = p.id and c.access_role = 'executive'
                )
            ))
        )
    ) then
        raise exception 'Invitation status lookup denied' using errcode = '42501';
    end if;

    return query
    select i.id, i.status, i.email, i.expires_at, i.created_at, i.accepted_at, i.cancelled_at
    from public.invitations i
    where i.profile_id = p_profile
    order by i.created_at desc, i.id;
end $$;

create or replace function public.florence_roster(p_semester uuid)
 returns table(
    enrollment_id uuid,
    student_id uuid,
    semester_id uuid,
    university_id text,
    first_name text,
    middle_name text,
    last_name text,
    suffix text,
    email text,
    year_level smallint,
    academic_status academic_status,
    account_status text,
    has_account boolean,
    invitation_state text,
    pending_invitation_id uuid,
    invitation_expires_at timestamp with time zone
 )
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
 set "TimeZone" to 'UTC'
as $$
begin
    if not (f_access_private.council() or f_access_private.faculty()) then
        raise exception 'Roster access denied' using errcode = '42501';
    end if;

    return query
    select
        n.id,
        p.id,
        n.semester_id,
        p.university_id,
        p.first_name,
        p.middle_name,
        p.last_name,
        p.suffix,
        p.email,
        n.year_level,
        n.academic_status,
        p.account_status,
        p.auth_user_id is not null as has_account,
        case
            when p.auth_user_id is not null then 'accepted'
            when inv.id is null then null
            when inv.status = 'pending' and inv.expires_at <= clock_timestamp() then 'expired'
            else inv.status
        end as invitation_state,
        case
            when p.auth_user_id is null and inv.status = 'pending' and inv.expires_at > clock_timestamp()
                then inv.id
            else null
        end as pending_invitation_id,
        inv.expires_at as invitation_expires_at
    from public.enrollments n
    join public.profiles p on p.id = n.student_id
    left join lateral (
        select i.id, i.status, i.expires_at
        from public.invitations i
        where i.profile_id = p.id and i.purpose = 'student_access'
        order by i.created_at desc, i.id desc
        limit 1
    ) inv on true
    where n.semester_id = p_semester
    order by n.year_level, p.last_name, p.first_name, p.id;
end $$;

-- ACL -------------------------------------------------------------------------

revoke all on function public.f_cmd_student_target(uuid) from public, anon, authenticated;

grant execute on function public.roster_invite_student(uuid, uuid, uuid, text, timestamptz) to service_role;
revoke all on function public.roster_invite_student(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;

grant execute on function public.roster_cancel_invitation(uuid, uuid, uuid) to service_role;
revoke all on function public.roster_cancel_invitation(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.florence_invitation_statuses(uuid) to authenticated;
revoke all on function public.florence_invitation_statuses(uuid) from public, anon;

commit;
