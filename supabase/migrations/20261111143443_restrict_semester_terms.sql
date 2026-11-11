-- Keep the deterministic development fixture's historical name without
-- permitting another semester to use an unapproved term. Any other conflicting
-- existing term makes this migration fail; no historical rows are rewritten.
alter table public.semesters
  add constraint semesters_approved_term
  check (
    term in ('1st Semester', '2nd Semester', 'Midyear')
    or (id = 'ae2fa3de-7aa6-4a10-ad86-d7c6d5a8fe34'::uuid and term = 'Development Seed')
  );
