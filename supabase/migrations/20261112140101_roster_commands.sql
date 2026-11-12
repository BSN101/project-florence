-- FL-007 / T-015: individual roster entry and student/enrollment editing.
-- Council Executive/Operations only. Writes target the current semester only
-- (no backdating), refuse archived and non-student profiles, and an officer
-- cannot enroll themselves or change their own year level/academic status.
begin;

-- Private helper (never granted) ----------------------------------------------

-- Trimmed, blank-to-NULL names and email, validated like the profile checks.
create function public.f_cmd_roster_identity(p_last text, p_first text, p_middle text, p_suffix text, p_email text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v jsonb;
begin
    v := jsonb_build_object('last_name', nullif(btrim(p_last), ''), 'first_name', nullif(btrim(p_first), ''),
        'middle_name', nullif(btrim(p_middle), ''), 'suffix', nullif(btrim(p_suffix), ''),
        'email', nullif(btrim(p_email), ''));
    if v->>'last_name' is null or v->>'first_name' is null then
        raise exception 'First and last name are required' using errcode = '22023';
    end if;
    if v->>'email' is not null and v->>'email' !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'Invalid email address' using errcode = '22023';
    end if;
    return v;
end $$;

create function public.f_cmd_roster_enrollment(p_year integer, p_status text) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
    if p_year is null or p_year not between 1 and 4 then
        raise exception 'Year level must be between 1 and 4' using errcode = '22023';
    end if;
    if p_status is null or p_status not in ('regular', 'irregular') then
        raise exception 'Academic status must be regular or irregular' using errcode = '22023';
    end if;
end $$;

-- Commands (service_role only) --------------------------------------------------

-- Reuses an existing student profile (identity continuity; submitted names are
-- ignored and changed through roster_update_student) or creates a new one.
create function public.roster_add_student(p_key uuid, p_actor uuid, p_university_id text,
    p_last_name text, p_first_name text, p_middle_name text, p_suffix text, p_email text,
    p_year_level integer, p_academic_status text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_names jsonb; v_semester uuid; v_profile uuid; p public.profiles%rowtype;
    v_created boolean := false; v_enrollment uuid;
begin
    perform public.f_cmd_council(p_actor);
    if p_university_id is null or p_university_id !~ '^[0-9]{2}-1-[0-9]{5}$' then
        raise exception 'Student number must use the format XX-1-XXXXX' using errcode = '22023';
    end if;
    v_names := public.f_cmd_roster_identity(p_last_name, p_first_name, p_middle_name, p_suffix, p_email);
    perform public.f_cmd_roster_enrollment(p_year_level, p_academic_status);
    v_result := public.f_cmd_begin(p_key, 'roster_add_student', p_actor, v_names || jsonb_build_object(
        'university_id', p_university_id, 'year_level', p_year_level, 'academic_status', p_academic_status));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    v_semester := public.f_cmd_current_semester();

    -- Serializes concurrent first entries of the same number.
    perform pg_advisory_xact_lock(hashtextextended('florence:roster:' || p_university_id, 0));
    select id into v_profile from public.profiles where university_id = p_university_id;
    if v_profile is null then
        insert into public.profiles (university_id, last_name, first_name, middle_name, suffix, email, account_status, updated_at)
            values (p_university_id, v_names->>'last_name', v_names->>'first_name', v_names->>'middle_name',
                v_names->>'suffix', v_names->>'email', 'active', now())
            returning id into v_profile;
        v_created := true;
    end if;
    p := public.f_cmd_student_target(v_profile);
    if p.account_status <> 'active' then
        raise exception 'This student''s account is archived. Contact a Platform Admin.' using errcode = '55000';
    end if;
    if p.id = p_actor then
        raise exception 'You cannot add yourself to the roster' using errcode = '55000';
    end if;
    if exists (select 1 from public.enrollments where student_id = p.id and semester_id = v_semester) then
        raise exception 'This student is already enrolled in the current semester' using errcode = '55000';
    end if;
    insert into public.enrollments (student_id, semester_id, year_level, academic_status, updated_at)
        values (p.id, v_semester, p_year_level::smallint, p_academic_status::public.academic_status, now())
        returning id into v_enrollment;
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', p.id, 'enrollment_id', v_enrollment,
        'profile_created', v_created, 'replayed', false));
end $$;

-- Updates names/email and the current-semester enrollment together.
create function public.roster_update_student(p_key uuid, p_actor uuid, p_student uuid,
    p_last_name text, p_first_name text, p_middle_name text, p_suffix text, p_email text,
    p_year_level integer, p_academic_status text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_names jsonb; v_semester uuid; p public.profiles%rowtype; n public.enrollments%rowtype;
begin
    perform public.f_cmd_council(p_actor);
    v_names := public.f_cmd_roster_identity(p_last_name, p_first_name, p_middle_name, p_suffix, p_email);
    perform public.f_cmd_roster_enrollment(p_year_level, p_academic_status);
    v_result := public.f_cmd_begin(p_key, 'roster_update_student', p_actor, v_names || jsonb_build_object(
        'student', p_student, 'year_level', p_year_level, 'academic_status', p_academic_status));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    v_semester := public.f_cmd_current_semester();
    p := public.f_cmd_student_target(p_student);
    if p.account_status <> 'active' then
        raise exception 'This student''s account is archived. Contact a Platform Admin.' using errcode = '55000';
    end if;
    select * into n from public.enrollments where student_id = p.id and semester_id = v_semester for update;
    if not found then
        raise exception 'This student is not enrolled in the current semester' using errcode = '55000';
    end if;
    if p.id = p_actor and (n.year_level <> p_year_level or n.academic_status::text <> p_academic_status) then
        raise exception 'You cannot change your own year level or academic status' using errcode = '55000';
    end if;
    update public.profiles set last_name = v_names->>'last_name', first_name = v_names->>'first_name',
        middle_name = v_names->>'middle_name', suffix = v_names->>'suffix', email = v_names->>'email', updated_at = now()
        where id = p.id;
    update public.enrollments set year_level = p_year_level::smallint, academic_status = p_academic_status::public.academic_status, updated_at = now()
        where id = n.id;
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', p.id, 'enrollment_id', n.id, 'replayed', false));
end $$;

-- Reads (authenticated, Executive/Operations-guarded) ---------------------------
-- enrollment_read admits Council, but own_profile hides other students' names,
-- so the roster needs a restricted read function. The Auth link stays private.

create function public.florence_roster(p_semester uuid)
returns table(enrollment_id uuid, student_id uuid, semester_id uuid, university_id text, first_name text,
    middle_name text, last_name text, suffix text, email text, year_level smallint,
    academic_status public.academic_status, account_status text, has_account boolean)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
    if not f_access_private.council() then raise exception 'Roster access denied' using errcode = '42501'; end if;
    return query
    select n.id, p.id, n.semester_id, p.university_id, p.first_name, p.middle_name, p.last_name, p.suffix, p.email,
        n.year_level, n.academic_status, p.account_status, p.auth_user_id is not null
    from public.enrollments n join public.profiles p on p.id = n.student_id
    where n.semester_id = p_semester
    order by n.year_level, p.last_name, p.first_name, p.id;
end $$;

-- One student by exact number, for the add-student preview.
create function public.florence_roster_candidate(p_university_id text)
returns table(id uuid, university_id text, first_name text, middle_name text, last_name text, suffix text,
    email text, account_status text, enrolled_in_current boolean)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
    if not f_access_private.council() then raise exception 'Roster access denied' using errcode = '42501'; end if;
    return query
    select p.id, p.university_id, p.first_name, p.middle_name, p.last_name, p.suffix, p.email, p.account_status,
        exists (select 1 from public.enrollments n join public.semesters s on s.id = n.semester_id
            where n.student_id = p.id and s.is_current)
    from public.profiles p where p.university_id = p_university_id;
end $$;

do $acl$
declare f record;
begin
    for f in select p.oid::regprocedure::text as signature, p.proname from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = any(array[
            'f_cmd_roster_identity','f_cmd_roster_enrollment','roster_add_student','roster_update_student']) loop
        execute format('alter function %s set TimeZone = %L', f.signature, 'UTC');
        execute format('revoke all on function %s from public, anon, authenticated, service_role', f.signature);
        if left(f.proname, 6) <> 'f_cmd_' then
            execute format('grant execute on function %s to service_role', f.signature);
        end if;
    end loop;
end $acl$;

revoke all on function public.florence_roster(uuid) from public, anon, authenticated, service_role;
grant execute on function public.florence_roster(uuid) to authenticated;
revoke all on function public.florence_roster_candidate(text) from public, anon, authenticated, service_role;
grant execute on function public.florence_roster_candidate(text) to authenticated;

commit;
