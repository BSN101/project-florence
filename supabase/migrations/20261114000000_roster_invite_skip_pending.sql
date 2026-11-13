-- FL-008 / T-018: bulk invite must not reissue a live invitation another run just sent.
-- p_skip_pending returns skipped = true instead of closing a live pending invitation.
-- The profile row lock in f_cmd_student_target serializes concurrent runs per student.
begin;

drop function if exists public.roster_invite_student(uuid, uuid, uuid, text, timestamptz);

create function public.roster_invite_student(
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

    if p_skip_pending and exists (
        select 1 from public.invitations
        where profile_id = p.id and status = 'pending' and expires_at > clock_timestamp()
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

revoke all on function public.roster_invite_student(uuid, uuid, uuid, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.roster_invite_student(uuid, uuid, uuid, text, timestamptz, boolean) to service_role;

commit;
