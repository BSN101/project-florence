# Project Florence

Faculty of Nursing student records, Council events and payments, merits,
demerits, service and clearance.

## Documentation

Read these before implementing a feature:

| Reference | Purpose |
|---|---|
| [Function list](docs/Project_Florence_Function_List.md) | V1 scope, roles, permissions and business rules |
| [Architecture](docs/Florence_Architecture.md) | Code organization and application boundaries |
| [Navigation map](docs/Project_Florence_Navigation_Map.md) | Destinations and workspace visibility |
| [User journeys](docs/Project_Florence_User_Journeys.md) | Finalized goal-based workflows and writing format |
| [Design tokens](docs/Florence_Design_Tokens.md) | Visual foundations |
| [Academic policy](docs/Academic_Policies_Pages_7-9_Excluding_Cheating.md) | Institutional reference; product decisions do not amend policy |
| [Database model](docs/database/schema.dbml) | Editable schema documentation, published to dbdocs |
| [Migrations](supabase/migrations/) | Executable database changes |

`docs/database/schema.dbml` is the canonical schema-documentation source.
The adjacent `schema.dbdiagram` is a diagram artifact, not a separate schema
contract.

DBML documents intended structure and rules. Migrations implement database
changes. The live database shows what is deployed in a particular environment.
Investigate differences rather than silently treating them as equivalent.

## Technology

- Next.js 16 and TypeScript.
- Supabase Auth and PostgreSQL.
- Cloudflare R2 for private files.
- Vercel for application hosting.
- Custom SMTP for Auth email; Mailtrap is used for current testing.

In-app notifications are included. Realtime, queues and Edge Functions are
not prerequisites.

## Project layout

```text
docs/
├── database/
│   ├── schema.dbml
│   └── schema.dbdiagram
├── Academic_Policies_Pages_7-9_Excluding_Cheating.md
├── Florence_Architecture.md
├── Florence_Design_Tokens.md
├── Project_Florence_Function_List.md
├── Project_Florence_Navigation_Map.md
└── Project_Florence_User_Journeys.md

supabase/
├── config.toml
└── migrations/
```

The architecture describes the suggested application structure. Create
feature files and folders when useful, not merely to match an example tree.

## Development setup

1. Install dependencies using the package manager and lockfile committed
   to this repository.
2. Obtain development environment values through the team's secure channel.
   Use the repository's environment example when available.
3. Configure the Supabase URL, public client key and separate server-only
   privileged key. Semester activation also requires a server-only `DATABASE_URL`
   pointing to that same project's direct PostgreSQL or Supavisor connection.
   Use verified TLS (set `NODE_EXTRA_CA_CERTS` if your project requires its CA).
   The development seed's `SEED_DATABASE_URL` is not used by the application.
4. Run the development command defined in `package.json`.

Never commit credentials. The privileged key must never use a public
environment-variable prefix, reach browser code, or appear in logs.

### Authentication

Public signup must remain disabled. Accounts are provisioned through the
approved invitation/admin flows.

Configure the intended Auth redirect URLs and SMTP provider for each
environment. Invitation acceptance and password recovery still require
their application flows; SMTP configuration alone does not implement them.

An Auth user alone does not establish Florence access. It must be linked
to an active profile with the relevant assignments or enrollment.

Testing accounts need both their Auth identity and the corresponding
Florence records. Do not commit passwords or production account data.

The public landing page links to `/sign-in` and `/forgot-password`. The
request-scoped SSR client needs `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the existing
`NEXT_PUBLIC_SUPABASE_ANON_KEY` fallback); never use `SUPABASE_SECRET_KEY` for
interactive sessions. Sign-in checks the verified Auth user, RLS-visible active
profile and current assignments before selecting a workspace. `/student`,
`/council`, `/faculty`, `/admin` and the shared `/account` destination are
server-guarded; switching a workspace changes navigation, not authority. An
inactive seed semester does not block sign-in, but current-semester workflows
are unavailable until a valid context exists. `/account` shows permitted,
read-only identity details, provides current-password-confirmed password changes
and allows navigation back to every authorized workspace.

Password recovery emails redirect to `<application-origin>/reset-password/callback`.
Add that exact URL to the development project's Supabase Auth redirect URL
allowlist, configure SMTP and test the callback on the intended app origin.
For SSR recovery, configure the Supabase **Reset password** email template to
link to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`; the callback
only accepts recovery token hashes (or PKCE codes) and never accepts a
user-submitted destination. Default email templates that return credentials in
URL fragments cannot complete a server-only callback. Do not change hosted
Auth settings without reviewing the intended project first.
The callback issues a signed, short-lived recovery-intent cookie using
`AUTH_RECOVERY_INTENT_SECRET` when configured, with `SUPABASE_SECRET_KEY` as the
existing server-only fallback. Signed-in password changes and email recovery use
separate actions; recovery signs out after completion. Reset and invitation
acceptance must be tested separately from the dev seed.
The `/invitation` page currently explains that acceptance is unavailable; it
is not a provisioning flow. Do not enable public signup to bypass it. The
workspace pages remain placeholders for domain data/actions, and local static
checks do not establish deployed RLS behavior.

### Development-only account seed

Use Node.js 24+ and `npm install`. The CLI seed uses the Auth Admin API and
Postgres.js (a development dependency); it is not an application provisioning
or invitation flow. Run it only against an explicitly approved development
project. Keep public signup disabled.

Add the entries documented in `.env.example` to your ignored `.env.local`
without overwriting existing settings, or supply them through the process
environment. Required configuration:

- `ENABLE_DEV_ACCOUNT_SEED=true` and `SEED_EXPECTED_PROJECT_REF`.
- `NEXT_PUBLIC_SUPABASE_URL` for that exact hosted project and its server-only
  `SUPABASE_SECRET_KEY` (the existing environment convention).
- `SEED_DATABASE_URL`: that project's direct PostgreSQL or Supavisor connection,
  using the `postgres` database/user (pooler username `postgres.<ref>`).
  URL-encode credentials; omit query parameters. TLS certificate verification
  is mandatory. If needed, configure `NODE_EXTRA_CA_CERTS` with the trusted
  project CA PEM path; do not disable certificate verification.
- Nine distinct password values, each 12–72 UTF-8 bytes:
  `SEED_ADMIN_PASSWORD`, `SEED_EXECUTIVE_PASSWORD`, `SEED_OPERATIONS_PASSWORD`,
  `SEED_STUDENT_PASSWORD`, `SEED_REPRESENTATIVE_PASSWORD`,
  `SEED_ACADEMIC_INSTRUCTOR_PASSWORD`, `SEED_ACADEMIC_COORDINATOR_PASSWORD`,
  `SEED_CLINICAL_INSTRUCTOR_PASSWORD`, and `SEED_RLE_COORDINATOR_PASSWORD`.
  There are no default passwords; keep them out of Git and logs. The five new
  Representative/Faculty variables are listed here even if your environment
  template still contains only the original four.
- `SEED_SEMESTER_YEAR`, `SEED_SEMESTER_TERM`, `SEED_SEMESTER_STARTS_ON`,
  `SEED_SEMESTER_ENDS_ON`, and explicit `SEED_SEMESTER_IS_CURRENT=true|false`.
  Dates use `YYYY-MM-DD`. Once the semester-term migration is applied, the
  accepted terms are `1st Semester`, `2nd Semester` and `Midyear`.

Validate configuration locally without network access, then seed **only after
approval of the target**:

```sh
npm run seed:dev-accounts -- --check-config
npm run seed:dev-accounts
```

| Synthetic login | Florence records |
|---|---|
| `florence.dev.admin@example.com` | Active non-student profile; Platform Admin assignment |
| `florence.dev.executive@example.com` | Active student `99-1-99001`; enrollment; Executive membership, President label |
| `florence.dev.operations@example.com` | Active student `99-1-99002`; enrollment; Operations membership, Treasurer label |
| `florence.dev.student@example.com` | Active student `99-1-99003`; enrollment; no staff/Council assignments |
| `florence.dev.representative@example.com` | Active student `99-1-99004`; enrollment; Representative membership and label |
| `florence.dev.academic_instructor@example.com` | Active non-student profile; Academic Instructor assignment |
| `florence.dev.academic_coordinator@example.com` | Active non-student profile; Academic Instructor then Academic Coordinator assignments |
| `florence.dev.clinical_instructor@example.com` | Active non-student profile; Clinical Instructor assignment |
| `florence.dev.rle_coordinator@example.com` | Active non-student profile; Clinical Instructor then RLE Coordinator assignments |

All nine are synthetic, email-confirmed Auth accounts explicitly linked by Auth
UUID to active Florence profiles. The four students are first-year Regular
enrollments in one synthetic semester. Faculty and Platform Admin have no
university numbers, enrollments or Council memberships. A fresh run inserts
24 Florence rows: nine profiles, seven role assignments, three Council
memberships, four enrollments and one semester.

The administrator is bootstrapped first, with the explicitly permitted
self-attributed initial assignment; subsequent roles and memberships use that
administrator for attribution. Each coordinator's underlying instructor
assignment is inserted first. This bootstrap exception is not an application
capability.

The seed checks existing Auth and database state before creating accounts,
then rechecks database state under locks before inserting. It never replaces
another current semester. Choose `false` to create an inactive synthetic
semester alongside an existing context; current-context workflows may then
remain unavailable for these enrollments. Choose `true` only when there is no
other current semester. Existing seed semester configuration must match exactly;
rerunning is not an activation/deactivation mechanism.

Keep configuration unchanged on reruns. Stable fixture IDs plus server-managed
Auth metadata identify seed-owned accounts; matching email alone is never
accepted. Conflicting/archived profiles, changed links, removed/extra assignments,
and unrelated university-number/year-term collisions stop the run without
repairing records. Partial Florence fixture sets are rejected because all seed
Florence rows commit together; only partial Auth-only creation is resumable.
An already-created four-account database fixture from the earlier script is
also rejected as incomplete; this version does not automatically upgrade it
or restore missing privileges. Inspect such a target before arranging a
separately reviewed extension.
Existing passwords and rows are never updated. A successful
second run should report zero new Auth users and zero inserted Florence rows.

Auth creation and Florence writes are **not atomic together**. All Florence
inserts use one real transaction with the semester-context lock and existing
constraints/triggers. Auth users created before a failure remain marked for
safe reuse on rerun; the script reports the failed stage and never deletes
accounts. An ambiguous network/commit result must be inspected by rerunning,
not by cleanup. Do not run account-management changes concurrently with seeding.
No migration, invitation, recovery, UI, RLS permission test, or sign-in flow is
performed by this script. Verify those separately before release.

Focused offline checks: `npm run test:seed`, `npm run lint`, and
`npx tsc --noEmit`. Account creation and twice-run idempotency require separate
verification against the approved development target.

## Database migrations

The team uses code-first SQL migrations against a linked development project.
Docker is optional unless running the local Supabase stack.

### Link a development project

```sh
npx supabase login
npx supabase link
```

Confirm the intended project before applying changes. Do not assume a linked
project is safe to reset or contains only disposable records.

### Create and apply changes

```sh
npx supabase migration new describe_the_change
```

Populate the generated SQL file before pushing. Generated migration files
start empty.

Review migration history and pending changes:

```sh
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

Apply the reviewed migrations:

```sh
npx supabase db push --linked
```

Do not rewrite applied migrations, replay fresh-install SQL over existing
objects, or reset a shared database. Use a new forward migration.

Migration-history repair is exceptional: it changes recorded history,
not database objects. Do not use it to conceal missing or failed SQL.

### Database types

After changing database interfaces, regenerate types from the linked
development project. Ensure the destination directory exists first:

```sh
npx supabase gen types typescript --linked --schema public > src/server/db/database.types.ts
```

Commit the generated file; do not edit it manually. Use its `Database` type
in both database clients.

### Database documentation

Update `docs/database/schema.dbml` alongside relevant migrations. Publish it
to the existing dbdocs project:

```sh
dbdiagram build document --from-file ./docs/database/schema.dbml --project WORKSPACE/PROJECT
```

Replace `WORKSPACE/PROJECT` with the existing publication destination.
Run this command from the repository root.

Publication updates documentation only; it does not apply SQL to Supabase.
Do not maintain a duplicate schema at `supabase/schema.dbml` or in a separate
Markdown schema document.

## Implementation conventions

- Organize code by feature. The documented stack is guidance, not a
  requirement to create empty or forwarding-only files.
- Ordinary reads use the request-scoped user client, RLS and explicit fields.
- Protected commands use the isolated server-only privileged client after
  actor and action authorization. Service-role access bypasses RLS.
- Derive the actor from the verified session, never submitted form data.
- Coordinated writes use a real PostgreSQL transaction or transactional RPC.
  Separate Supabase requests are not one transaction.
- Reuse generated database types where appropriate. A selected subset can
  serve directly as a frontend/server contract; do not duplicate it.
- Infer input types from runtime validation schemas.
- Types do not validate requests, filter response objects or grant access.

### Event consequences and waivers

Council Executive/Operations users select Office or RLE when generating
event consequences. Retain the selection for that event, including
zero-demerit outcomes, and include it in retry identity. It is not a global
default and cannot be changed by retrying generation.

Any active Council Executive may waive an eligible Council-generated
demerit, regardless of its original Council issuer. Operations and
Representatives cannot waive. Faculty issuer-only restrictions remain
separate. Self-waiver is prohibited.

Keep the actual issuer and waiver actor for traceability, even when the
interface displays the source as “Council”.

Institutional date-sensitive behavior uses `Asia/Manila`.

## Before merging

- Review changed migrations and generated types.
- Keep DBML and affected documentation aligned.
- Run the repository's available checks relevant to the change.
- Verify consequential workflows incrementally before release, including
  authorization, rollback and retries.
- Document finalized journeys with an author.
- State what was verified and what remains pending.
- Exclude secrets, real student data and temporary artifacts.

Migration success and documentation publication do not establish that all
business workflows are implemented or verified.
