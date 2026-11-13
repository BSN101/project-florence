-- T-040 (FL-048): Platform Admin adds, edits and archives misconduct options.
-- Demerits copy the option label into their own description when logged, so edits
-- and archiving never rewrite existing records. Other is always available: it
-- cannot be edited or archived. Every option is one demerit per unit (no stored
-- default sanction days). No restore from archive in this version.
begin;

-- One active option per label (case and surrounding spaces ignored).
create unique index misconduct_catalog_active_label on public.misconduct_catalog (lower(btrim(label)))
    where archived_at is null;

create function public.f_cmd_misconduct_label(p_label text) returns text
language plpgsql immutable set search_path = pg_catalog as $$
declare v text := btrim(p_label);
begin
    if v is null or v = '' or length(v) > 200 then
        raise exception 'Label must be 1 to 200 characters' using errcode = '22023';
    end if;
    return v;
end $$;

-- Create (p_option null) or rename an active, non-Other option.
create function public.save_misconduct_option(p_key uuid, p_actor uuid, p_option uuid, p_label text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_label text := public.f_cmd_misconduct_label(p_label); m public.misconduct_catalog%rowtype;
begin
    perform public.f_cmd_platform_admin(p_actor);
    v_result := public.f_cmd_begin(p_key, 'save_misconduct_option', p_actor,
        jsonb_build_object('option', p_option, 'label', v_label));
    if v_result is not null then return v_result; end if;
    begin
        if p_option is null then
            insert into public.misconduct_catalog(label, is_other, created_by, updated_at)
                values (v_label, false, p_actor, now()) returning * into m;
        else
            select * into m from public.misconduct_catalog where id = p_option for update;
            if not found then raise exception 'Misconduct option not found' using errcode = '22023'; end if;
            if m.is_other then raise exception 'The Other option cannot be edited' using errcode = '55000'; end if;
            if m.archived_at is not null then raise exception 'Archived options cannot be edited' using errcode = '55000'; end if;
            update public.misconduct_catalog set label = v_label, updated_at = now() where id = m.id returning * into m;
        end if;
    exception when unique_violation then
        raise exception 'An active option already has this label' using errcode = '22023';
    end;
    return public.f_cmd_finish(p_key, jsonb_build_object('option_id', m.id, 'label', m.label));
end $$;

create function public.archive_misconduct_option(p_key uuid, p_actor uuid, p_option uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; m public.misconduct_catalog%rowtype;
begin
    perform public.f_cmd_platform_admin(p_actor);
    v_result := public.f_cmd_begin(p_key, 'archive_misconduct_option', p_actor, jsonb_build_object('option', p_option));
    if v_result is not null then return v_result; end if;
    select * into m from public.misconduct_catalog where id = p_option for update;
    if not found then raise exception 'Misconduct option not found' using errcode = '22023'; end if;
    if m.is_other then raise exception 'The Other option must stay available' using errcode = '55000'; end if;
    if m.archived_at is not null then raise exception 'Option is already archived' using errcode = '55000'; end if;
    update public.misconduct_catalog set archived_at = now(), updated_at = now() where id = m.id;
    return public.f_cmd_finish(p_key, jsonb_build_object('option_id', m.id, 'archived_at', now()));
end $$;

-- Initial catalog: the policy extract's misconduct headings plus Other, credited to
-- the active Platform Admin. Skipped when there is none (e.g. a fresh database).
insert into public.misconduct_catalog(label, is_other, created_by, updated_at)
select v.label, v.label = 'Other', admin.id, now()
from (select p.id from public.profiles p join public.role_assignments r on r.profile_id = p.id
        where r.role = 'Platform Admin' and r.removed_at is null and p.account_status = 'active'
        order by r.assigned_at limit 1) admin
cross join (values
    ('Tardiness'),
    ('Going out of or leaving class/duty without CI approval'),
    ('Absence'),
    ('Entertaining visitors unnecessarily'),
    ('Loitering in the clinical area'),
    ('Reading non-professional magazines and other resources while on class/duty'),
    ('Sleeping during class/duty'),
    ('Dishonesty'),
    ('Leaving personal belongings in the classroom/clinical area after class/duty'),
    ('Not wearing the prescribed uniform'),
    ('Improper grooming'),
    ('Not following CI instruction/direction'),
    ('Gross insubordination'),
    ('Use of cellphone, laptop and other electronic gadgets, unless allowed by the Clinical Instructor'),
    ('Failure to submit complete clinical requirements'),
    ('Incomplete ward/CHN kit'),
    ('Failure to attend orientation, evaluation, scheduled conference and other activities'),
    ('Failure to maintain cleanliness and orderliness of classrooms/student lounge and all other identified learning areas'),
    ('Other')) v(label)
where not exists (select 1 from public.misconduct_catalog);

revoke all on function public.f_cmd_misconduct_label(text) from public, anon, authenticated, service_role;
revoke all on function public.save_misconduct_option(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.save_misconduct_option(uuid, uuid, uuid, text) to service_role;
revoke all on function public.archive_misconduct_option(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.archive_misconduct_option(uuid, uuid, uuid) to service_role;

commit;
