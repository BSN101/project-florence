-- FL-007 / T-017: Roster CSV validation preview and atomic retry-safe application.
-- Council Executive and Council Operations only.
-- Validates targeting the current semester only.
-- In preview mode (p_apply = false):
--   - Analyzes rows against existing profiles.
--   - Detects new students to create, existing students to re-enroll or update.
--   - Detects conflicts (e.g. name mismatch with existing profile) and invalid rows.
--   - Returns summary counts (ready, conflicts, invalid) and detailed row statuses.
-- In apply mode (p_apply = true):
--   - Validates all-or-nothing atomicity (fails if any invalid or conflict rows).
--   - Re-enrolling preserves student identity continuity.
--   - Request-key idempotency via f_cmd_begin / f_cmd_finish.

begin;

create function public.roster_import_csv(
    p_key uuid,
    p_actor uuid,
    p_rows jsonb,
    p_apply boolean
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
    v_semester uuid;
    v_result jsonb;
    v_rows jsonb := '[]'::jsonb;
    v_ready integer := 0;
    v_conflicts integer := 0;
    v_invalid integer := 0;
    v_created_count integer := 0;
    v_reenroll_count integer := 0;
    v_updated_count integer := 0;
    x record;
    p public.profiles%rowtype;
    e public.enrollments%rowtype;
    v_issue text;
    v_message text;
    v_is_conflict boolean;
    v_status text;
    v_action text;
    v_clean_last text;
    v_clean_first text;
    v_clean_middle text;
    v_clean_suffix text;
    v_clean_email text;
    v_profile_id uuid;
begin
    perform public.f_cmd_council(p_actor);

    if p_apply is null or jsonb_typeof(p_rows) is distinct from 'array'
        or jsonb_array_length(p_rows) not between 1 and 10000 then
        raise exception 'Invalid roster import batch' using errcode = '22023';
    end if;

    if exists (
        select 1 from jsonb_array_elements(p_rows) r(v)
        where jsonb_typeof(v) <> 'object'
            or v - array['row','university_id','last_name','first_name','middle_name','suffix','email','year_level','academic_status']::text[] <> '{}'::jsonb
            or not (v ?& array['row','university_id','last_name','first_name','year_level','academic_status'])
    ) then
        raise exception 'Invalid roster import row shape' using errcode = '22023';
    end if;

    v_semester := public.f_cmd_current_semester();

    if p_apply then
        v_result := public.f_cmd_begin(p_key, 'roster_import_csv', p_actor, jsonb_build_object('rows', p_rows));
        if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
        perform pg_advisory_xact_lock(hashtextextended('florence:roster_import', 0));
    end if;

    for x in select t.*,
            count(*) over (partition by t.university_id) as copies,
            case when nullif(btrim(t.email), '') is not null
                then count(*) filter (where nullif(btrim(t.email), '') is not null)
                     over (partition by lower(btrim(t.email)))
                else 1 end as email_copies
        from jsonb_to_recordset(p_rows) as t(
            "row" integer,
            university_id text,
            last_name text,
            first_name text,
            middle_name text,
            suffix text,
            email text,
            year_level integer,
            academic_status text
        )
        order by t."row" loop

        v_issue := null;
        v_message := null;
        v_is_conflict := false;
        v_status := null;
        v_action := null;
        v_clean_last := nullif(btrim(x.last_name), '');
        v_clean_first := nullif(btrim(x.first_name), '');
        v_clean_middle := nullif(btrim(x.middle_name), '');
        v_clean_suffix := nullif(btrim(x.suffix), '');
        v_clean_email := lower(nullif(btrim(x.email), ''));

        -- Format and file-level checks
        if x.copies > 1 then
            v_issue := 'Student appears more than once in the file';
        elsif v_clean_email is not null and x.email_copies > 1 then
            v_issue := 'Email appears more than once in the file';
        elsif x.university_id is null or x.university_id !~ '^[0-9]{2}-1-[0-9]{5}$' then
            v_issue := 'Student number must use the format XX-1-XXXXX';
        elsif v_clean_last is null or v_clean_first is null then
            v_issue := 'First and last name are required';
        elsif x.year_level is null or x.year_level not between 1 and 4 then
            v_issue := 'Year level must be between 1 and 4';
        elsif x.academic_status is null or lower(btrim(x.academic_status)) not in ('regular', 'irregular') then
            v_issue := 'Academic status must be regular or irregular';
        elsif v_clean_email is not null and v_clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
            v_issue := 'Invalid email address';
        end if;

        -- Database checks
        if v_issue is null then
            if p_apply then
                select * into p from public.profiles where university_id = x.university_id for update;
            else
                select * into p from public.profiles where university_id = x.university_id;
            end if;

            if p.id is not null then
                -- Existing profile checks
                if p.id = p_actor then
                    v_issue := 'You cannot enroll yourself in the roster';
                elsif p.account_status <> 'active' then
                    v_issue := 'This student''s account is archived. Contact a Platform Admin.';
                elsif lower(btrim(p.last_name)) <> lower(v_clean_last)
                   or lower(btrim(p.first_name)) <> lower(v_clean_first) then
                    v_is_conflict := true;
                    v_issue := format('Name conflicts with existing profile (%s, %s)', p.last_name, p.first_name);
                elsif v_clean_email is not null and exists (
                    select 1 from public.profiles where email = v_clean_email and id <> p.id
                ) then
                    v_is_conflict := true;
                    v_issue := 'Email already belongs to another student profile';
                else
                    -- Check enrollment in current semester
                    if p_apply then
                        select * into e from public.enrollments
                            where student_id = p.id and semester_id = v_semester for update;
                    else
                        select * into e from public.enrollments
                            where student_id = p.id and semester_id = v_semester;
                    end if;

                    if e.id is not null then
                        v_action := 'update';
                        v_message := 'Existing student enrollment updated';
                    else
                        v_action := 're_enroll';
                        v_message := 'Existing student re-enrolled';
                    end if;
                end if;
            else
                -- New student checks
                if v_clean_email is not null and exists (
                    select 1 from public.profiles where id = p_actor and email = v_clean_email
                ) then
                    v_issue := 'You cannot enroll yourself in the roster';
                elsif v_clean_email is not null and exists (
                    select 1 from public.profiles where email = v_clean_email
                ) then
                    v_is_conflict := true;
                    v_issue := 'Email already belongs to another student profile';
                else
                    v_action := 'create';
                    v_message := 'New student to be created';
                end if;
            end if;
        end if;

        -- Record findings
        if v_issue is not null then
            if v_is_conflict then
                v_conflicts := v_conflicts + 1;
                v_status := 'conflict';
            else
                v_invalid := v_invalid + 1;
                v_status := 'invalid';
            end if;
        else
            v_ready := v_ready + 1;
            v_status := 'ready';
            if v_action = 'create' then
                v_created_count := v_created_count + 1;
                if p_apply then
                    insert into public.profiles (
                        university_id, last_name, first_name, middle_name, suffix, email, account_status, updated_at
                    ) values (
                        x.university_id, v_clean_last, v_clean_first, v_clean_middle, v_clean_suffix, v_clean_email, 'active', now()
                    ) returning id into v_profile_id;
                    insert into public.enrollments (
                        student_id, semester_id, year_level, academic_status, updated_at
                    ) values (
                        v_profile_id, v_semester, x.year_level::smallint, lower(btrim(x.academic_status))::public.academic_status, now()
                    );
                end if;
            elsif v_action = 're_enroll' then
                v_reenroll_count := v_reenroll_count + 1;
                if p_apply then
                    update public.profiles set
                        middle_name = coalesce(profiles.middle_name, v_clean_middle),
                        suffix = coalesce(profiles.suffix, v_clean_suffix),
                        email = coalesce(profiles.email, v_clean_email),
                        updated_at = now()
                        where id = p.id;
                    insert into public.enrollments (
                        student_id, semester_id, year_level, academic_status, updated_at
                    ) values (
                        p.id, v_semester, x.year_level::smallint, lower(btrim(x.academic_status))::public.academic_status, now()
                    );
                end if;
            elsif v_action = 'update' then
                v_updated_count := v_updated_count + 1;
                if p_apply then
                    update public.profiles set
                        middle_name = coalesce(profiles.middle_name, v_clean_middle),
                        suffix = coalesce(profiles.suffix, v_clean_suffix),
                        email = coalesce(profiles.email, v_clean_email),
                        updated_at = now()
                        where id = p.id;
                    update public.enrollments set
                        year_level = x.year_level::smallint,
                        academic_status = lower(btrim(x.academic_status))::public.academic_status,
                        updated_at = now()
                        where id = e.id;
                end if;
            end if;
        end if;

        if not p_apply then
            v_rows := v_rows || jsonb_build_object(
                'row', x."row",
                'university_id', x.university_id,
                'name', concat_ws(' ', v_clean_first, v_clean_last),
                'action', coalesce(v_action, 'none'),
                'status', v_status,
                'message', coalesce(v_issue, v_message)
            );
        end if;
    end loop;

    if not p_apply then
        return jsonb_build_object(
            'semester_id', v_semester,
            'ready', v_ready,
            'conflicts', v_conflicts,
            'invalid', v_invalid,
            'created', v_created_count,
            're_enrolled', v_reenroll_count,
            'updated', v_updated_count,
            'rows', v_rows
        );
    end if;

    if v_invalid > 0 or v_conflicts > 0 then
        raise exception 'Import has % invalid and % conflicting row(s); preview the file and resolve them',
            v_invalid, v_conflicts using errcode = '22023';
    end if;

    if v_ready = 0 then
        raise exception 'No valid student rows to import' using errcode = '22023';
    end if;

    return public.f_cmd_finish(p_key, jsonb_build_object(
        'semester_id', v_semester,
        'total', v_ready,
        'created', v_created_count,
        're_enrolled', v_reenroll_count,
        'updated', v_updated_count,
        'replayed', false
    ));
end $$;

do $acl$
declare f record;
begin
    for f in select p.oid::regprocedure::text as signature from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = 'roster_import_csv' loop
        execute format('alter function %s set TimeZone = %L', f.signature, 'UTC');
        execute format('revoke all on function %s from public, anon, authenticated, service_role', f.signature);
        execute format('grant execute on function %s to service_role', f.signature);
    end loop;
end $acl$;

commit;
