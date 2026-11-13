-- FL-008 / T-018: record Florence's own email send outcome per invitation.
-- Invitations stay immutable; the outcome lives in an insert-only table with one row per invitation.
-- A failed or unconfirmed send never changes the invitation; Council reissues instead.
begin;

create table public.invitation_deliveries (
    invitation_id uuid primary key references public.invitations on delete restrict,
    -- unknown: invitations created before delivery was recorded.
    status text not null check (status in ('sent', 'failed', 'unknown')),
    recorded_at timestamptz not null default now()
);

alter table public.invitation_deliveries enable row level security;
revoke all on table public.invitation_deliveries from public, anon, authenticated;

create trigger invitation_delivery_retained before update or delete on public.invitation_deliveries
    for each row execute function f_access_private.append_only();

insert into public.invitation_deliveries (invitation_id, status, recorded_at)
    select id, 'unknown', now() from public.invitations;

-- Private helper (never granted) ----------------------------------------------

-- 'failed' when the send failed, 'unconfirmed' when nothing was recorded within 10 minutes
-- (the server stopped between creating the invitation and sending), otherwise null.
create function public.f_invitation_delivery_problem(p_invitation uuid, p_created_at timestamptz)
 returns text
 language sql
 stable security definer
 set search_path to 'pg_catalog'
as $$
    select case
        when d.status = 'failed' then 'failed'
        when d.status is null and p_created_at < clock_timestamp() - interval '10 minutes' then 'unconfirmed'
    end
    from (select 1) one
    left join public.invitation_deliveries d on d.invitation_id = p_invitation
$$;

revoke all on function public.f_invitation_delivery_problem(uuid, timestamptz) from public, anon, authenticated;

-- Command (service_role only) -------------------------------------------------

-- Called by the server after it attempts the email. Retrying is harmless: the first outcome stays.
create function public.record_invitation_delivery(p_invitation uuid, p_status text)
 returns void
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $$
begin
    if p_status is null or p_status not in ('sent', 'failed') then
        raise exception 'Delivery status must be sent or failed' using errcode = '22023';
    end if;
    if not exists (select 1 from public.invitations where id = p_invitation) then
        raise exception 'Invitation not found' using errcode = '22023';
    end if;
    insert into public.invitation_deliveries (invitation_id, status)
        values (p_invitation, p_status)
        on conflict (invitation_id) do nothing;
end $$;

revoke all on function public.record_invitation_delivery(uuid, text) from public, anon, authenticated;
grant execute on function public.record_invitation_delivery(uuid, text) to service_role;

-- Bulk skip only protects a live invitation whose email may have arrived -------

create or replace function public.roster_invite_student(
    p_key uuid,
    p_actor uuid,
    p_student uuid,
    p_token_hash text,
    p_expires_at timestamp with time zone,
    p_skip_pending boolean default false
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

    v_semester := public.f_cmd_current_semester();
    if not exists (select 1 from public.enrollments where student_id = p.id and semester_id = v_semester) then
        raise exception 'This student is not enrolled in the current semester' using errcode = '55000';
    end if;

    -- Skip a live invitation unless its email failed or was never confirmed.
    if p_skip_pending and exists (
        select 1 from public.invitations i
        where i.profile_id = p.id and i.status = 'pending' and i.expires_at > clock_timestamp()
          and public.f_invitation_delivery_problem(i.id, i.created_at) is null
    ) then
        return public.f_cmd_finish(p_key, jsonb_build_object(
            'profile_id', p.id, 'skipped', true, 'replayed', false));
    end if;

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
        'skipped', false,
        'replayed', false
    ));
end $$;

-- Roster shows 'undelivered' / 'unconfirmed' for a live invitation with a delivery problem --

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
            when inv.status = 'pending' and inv.problem = 'failed' then 'undelivered'
            when inv.status = 'pending' and inv.problem = 'unconfirmed' then 'unconfirmed'
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
        select i.id, i.status, i.expires_at,
            public.f_invitation_delivery_problem(i.id, i.created_at) as problem
        from public.invitations i
        where i.profile_id = p.id and i.purpose = 'student_access'
        order by i.created_at desc, i.id desc
        limit 1
    ) inv on true
    where n.semester_id = p_semester
    order by n.year_level, p.last_name, p.first_name, p.id;
end $$;

commit;
