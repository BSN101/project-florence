-- Platform Admin detail lookup for one in-scope profile. Same scope as
-- florence_provisioning_directory, plus the structured names the edit form needs.
-- Returns whether an Auth account is linked, never the Auth user id itself.
begin;

create function public.florence_provisioning_profile(p_profile uuid)
returns table(id uuid, university_id text, email text, first_name text, middle_name text,
    last_name text, suffix text, account_status text, account_linked boolean)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
    if not f_access_private.has_role('Platform Admin') then
        raise exception 'Provisioning access denied' using errcode = '42501';
    end if;
    return query select p.id, p.university_id, p.email, p.first_name, p.middle_name, p.last_name,
        p.suffix, p.account_status, p.auth_user_id is not null
    from public.profiles p
    where p.id = p_profile and (p.university_id is null or exists (
        select 1 from public.council_memberships c where c.profile_id = p.id and c.access_role = 'executive'));
end $$;
revoke all on function public.florence_provisioning_profile(uuid) from public, anon, authenticated, service_role;
grant execute on function public.florence_provisioning_profile(uuid) to authenticated;

commit;
