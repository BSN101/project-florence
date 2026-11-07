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
   privileged key.
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
