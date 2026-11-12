-- Platform Admin account tables: every Faculty profile (not Platform Admin) and
-- every student with CURRENT Executive access. Not a student roster: other
-- students stay reachable only by exact university number (FL-011 scope).
-- Returns whether an Auth account is linked, never the Auth user id itself.
begin;

-- Superseded by the list below; the per-profile page that used it is removed.
drop function public.florence_provisioning_profile(uuid);

create function public.florence_provisioning_accounts()
returns table(id uuid, university_id text, email text, first_name text, middle_name text, last_name text,
    suffix text, account_status text, account_linked boolean, roles text[],
    council_role public.council_access_role, position_label text,
    invitation_state text, pending_invitation_id uuid, invitation_expires_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
    if not f_access_private.has_role('Platform Admin') then
        raise exception 'Provisioning access denied' using errcode = '42501';
    end if;
    return query
    select p.id, p.university_id, p.email, p.first_name, p.middle_name, p.last_name, p.suffix,
        p.account_status, p.auth_user_id is not null,
        coalesce((select array_agg(r.role order by r.role) from public.role_assignments r
            where r.profile_id = p.id and r.removed_at is null), array[]::text[]),
        m.access_role, m.position_label,
        -- Usability depends on expires_at, not only the stored status.
        case when li.id is null then null
            when li.status = 'pending' and li.expires_at <= now() then 'expired'
            else li.status end,
        case when li.status = 'pending' and li.expires_at > now() then li.id end,
        li.expires_at
    from public.profiles p
    left join public.council_memberships m on m.profile_id = p.id and m.removed_at is null
    left join lateral (select i.id, i.status, i.expires_at from public.invitations i
        where i.profile_id = p.id order by i.created_at desc, i.id desc limit 1) li on true
    where (p.university_id is null and not exists (select 1 from public.role_assignments a
            where a.profile_id = p.id and a.role = 'Platform Admin' and a.removed_at is null))
        or m.access_role = 'executive'
    order by p.last_name, p.first_name, p.id;
end $$;
revoke all on function public.florence_provisioning_accounts() from public, anon, authenticated, service_role;
grant execute on function public.florence_provisioning_accounts() to authenticated;

commit;
