# Florence Architecture

**Version:** 1.2 · **Updated:** 2026-11-07 · **Status:** Implementation baseline

## 1. System overview

Florence is a feature-based modular monolith: one Next.js 16 application, deployed on Vercel.

| Technology | Purpose |
|---|---|
| Next.js | Pages, server actions and HTTP endpoints |
| Supabase Auth | Authentication and account recovery |
| Supabase PostgreSQL | Records, constraints, read policies and atomic operations |
| Cloudflare R2 | Private files |
| SMTP provider | Supabase Auth email delivery; Mailtrap for current testing, Brevo for the planned business-email integration |

The function list defines capabilities and permissions. The schema defines records and transaction rules. This document defines code organization and application boundaries.

Build a fresh application against these baselines. Reuse UI, auth flows, provider adapters and utilities only after checking their behavior against the current contracts. Application setup does not authorize resetting a database or deleting applied migrations or data. Plan database migration separately.

## 2. Project structure

```text
florence/
├── docs/
│   ├── database/
│   │   ├── schema.dbml
│   │   └── schema.dbdiagram
│   ├── Project_Florence_Function_List.md
│   ├── Project_Florence_Navigation_Map.md
│   ├── Project_Florence_User_Journeys.md

│   ├── Florence_Architecture.md
│   ├── Florence_Design_Tokens.md
│   └── Academic_Policies_Pages_7-9_Excluding_Cheating.md
├── src/
│   ├── proxy.ts
│   ├── app/
│   │   ├── (auth)/
│   │   ├── (portal)/
│   │   │   ├── account/
│   │   │   ├── student/
│   │   │   ├── council/
│   │   │   ├── faculty/
│   │   │   └── admin/
│   │   ├── api/
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── features/
│   │   ├── access/
│   │   ├── account/
│   │   ├── auth/
│   │   ├── students/
│   │   ├── semesters/
│   │   ├── events/
│   │   ├── finance/
│   │   ├── discipline/
│   │   ├── services/
│   │   ├── clearance/
│   │   └── notifications/
│   ├── components/
│   │   ├── ui/
│   │   └── layout/
│   ├── server/
│   │   ├── auth/
│   │   ├── db/
│   │   │   └── database.types.ts
│   │   ├── storage/
│   │   └── email/
│   └── lib/
│       ├── validation/
│       └── utils/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── seed.sql
│   └── tests/
├── tests/
│   └── e2e/
├── public/
└── README.md
```

This is a suggested layout, not a list of empty folders to create. Developers may combine or split features when useful. Tables do not need matching modules or API routes. No separate backend service, monorepo or generic repository framework is required.

### Documentation

The tree shows the documentation set to include in the application workspace; it does not claim those files have already been copied there.

| Document | Responsibility |
|---|---|

| [Function list](Project_Florence_Function_List.md) | V1 capabilities, roles, business states and safeguards |
| [Navigation map](Project_Florence_Navigation_Map.md) | Destinations and workspace visibility |
| [User journeys](Project_Florence_User_Journeys.md) | Format and developer-maintained records of finalized workflows |
| Schema documentation | Application `docs/database/schema.dbml`, published to dbdocs: tables, relationships, integrity and transaction rules |
| [Architecture](Florence_Architecture.md) | Code responsibilities and security boundaries |
| [Design tokens](Florence_Design_Tokens.md) | Visual values, usage and pending design choices |
| [Academic policy](Academic_Policies_Pages_7-9_Excluding_Cheating.md) | Institutional source text; product decisions do not amend it |


The application root `README.md` covers setup, commands, environment configuration and links directly to the files in `docs/`; a separate documentation index is not required. Keep one maintained documentation set. In the application repository, `docs/database/schema.dbml` is the editable schema-documentation source and dbdocs is its published view; do not maintain a parallel Markdown schema. The adjacent `schema.dbdiagram` is a diagram artifact, not a second independently maintained schema contract. The [DBML handoff in this repository](database/florence.dbml) must not become an independently edited competing copy after handoff. SQL migrations define executable changes; inspect the target database to establish what is deployed. Do not require deprecated documents in the developer workspace.

## 3. Application responsibilities

### Routes and entry points

- `src/proxy.ts` refreshes Supabase SSR cookies and performs early sign-in redirects. Validate authentication rather than trusting cookie presence. Skip static assets through its matcher.
- Pages compose screens and call feature queries. Layouts provide shared shells. Route groups and workspace names do not grant permissions.
- `src/app/(portal)/account/` is the shared protected account destination outside every workspace. It displays the signed-in user's permitted identity fields and owns no workspace authority; `src/features/account/` owns signed-in account actions such as current-password-confirmed password changes.
- `src/app/(auth)/reset-password/` and its callback are public recovery entry points. Recovery uses a verified Supabase session plus a signed, short-lived, HTTP-only recovery-intent marker; it does not reuse the authenticated account password action.
- Server actions validate form input, resolve the actor and run an authorized command.
- API route handlers support downloads or other actual HTTP integration needs. Do not create an endpoint for every feature or make server code fetch its own API.
- Add loading, error and not-found screens where needed.

| Need | Default entry point |
|---|---|
| Page data | Server Component → feature query |
| Form submission | Server Action → feature command/service |
| Download | Route handler → domain export function |
| Adopted external integration | Route handler → authorized feature workflow |

### Features and shared code

Features own domain rules, queries, commands and components. Student and Council finance screens share finance rules rather than implementing separate payment models.

Shared UI belongs in `components/ui/`; navigation and shells belong in `components/layout/`. Pure formatting and common validation helpers belong in `lib/`. Keep feature-specific rules in their feature.

Reports initially belong to the domain that owns their calculations. Share CSV/print formatting where useful; do not duplicate balance or collection calculations in a reporting layer.

Use `import 'server-only'` in trusted modules and `'use server'` in Server Action entry files. Do not import secrets or privileged clients into browser code. Public assets must never include student records or payment evidence.

## 4. Authentication and database access

### Actor resolution

Validate the user's session and resolve the linked active Florence profile and current assignments. An Auth user alone does not establish application access. The shared `/account` route uses the same active-profile requirement as workspaces, while password recovery may restore an inactive linked Auth identity without granting Florence workspace access.

Every command checks action scope, beneficiary restrictions and current state. Deny archived profiles even if a session or assignment remains active. Never accept a browser-provided actor ID as identity. Session redirects do not replace authorization in pages, queries, actions, handlers or services.

Signed-in password changes belong to `features/account/`, require the current password through Supabase Auth and keep the verified session active. Email recovery belongs to `features/auth/`, requires callback-established recovery intent, clears that marker after use and signs the recovery session out. The marker distinguishes intent but never replaces verification of the Supabase user session.

### Separate database clients

| Client | Purpose |
|---|---|
| `server/db/user-client.ts` | Request-scoped user context for authentication and ordinary reads |
| `server/db/command-client.ts` | Isolated service-role access for authorized server commands |

Ordinary reads use explicit field lists and user-context RLS. RLS filters rows, not columns: use restricted projections, column privileges or secured query functions for minimum-field lookups. Views must preserve the intended authorization boundary.

**Service-role access bypasses RLS.** Application authorization is the primary boundary for protected writes. Keep the privileged client server-only and separate from cookie/session handling; disable session persistence and token refresh and never replace its credentials with a user session. Do not expose its key through public environment variables, responses or logs.

Do not use service-role access for ordinary directory or report reads. A narrow internal check, such as Council waiver eligibility, may inspect otherwise hidden records but returns only the permitted result—not the underlying ledger.

Florence tables use PostgreSQL's `public` schema with explicit grants. Revoke direct authenticated-client writes on protected tables. Preserve database constraints even for privileged commands. Attribute changes to the resolved human actor, not the service-role identity.

### Transactions and RPCs

Simple authorized commands may use constrained table writes. Coordinated operations use one real PostgreSQL transaction or one transactional RPC. Separate Supabase requests are not one transaction; service-role access does not change that.

Follow the schema's shared locking and idempotency contracts for:
- Event capture, audience/rule freezing and consequence generation.
- Service participation and finalization.
- Merit use, demerit waiver and service-credit balance changes.
- Settlement, obligation waiver, refund and payment correction.

Use code-first SQL migrations under `supabase/migrations/`. Create a new migration for changes to a shared database; never rewrite applied migrations. Review `supabase migration list --linked` and `supabase db push --linked --dry-run` before pushing to the linked development project. Docker is required for a local Supabase stack, not for this remote workflow. Populate generated migration files before pushing. Regenerate database types and update DBML after database-interface changes; publishing DBML does not apply SQL.

Council event consequence generation takes an explicit Office/RLE bucket selected by Executive/Operations at generation time. Retain it per event, including zero-demerit outcomes, and include it in retry identity; there is no global event bucket. The institutional timezone is `Asia/Manila`. Any active Council Executive may waive eligible Council-generated demerits regardless of original Council issuer; Faculty issuer-only restrictions and the self-waiver prohibition remain unchanged.

RPCs that trust server authorization are executable only by the server role. Revoke default `PUBLIC`, `anon` and `authenticated` execution. Any deliberately client-callable function must perform its own actor/action checks. `SECURITY DEFINER` functions use a fixed safe `search_path` and qualified object names.

## 5. Files, email and notifications

### Private files

Storage helpers configure R2 and issue short-lived URLs. The owning feature authorizes each upload/download and resolves the allowed object key. Never sign arbitrary browser-provided keys, expose credentials or log signed URLs.

### Authentication email

Support customized invitations, acceptance and password recovery/reset. The access feature owns provisioning authority, invitation expiry/cancellation, identity linkage and acceptance. The provider adapter handles delivery only.

Use the approved Auth integration for token generation/verification. Coordinate custom delivery with Supabase Auth configuration to avoid duplicate messages. Delivery failure must not undo successful roster creation or create duplicate identities on retry. Accepted or cancelled invitations cannot be reused.

Operational email for payments, merits or demerits is not included by this auth-email support.

### In-app notifications and history

In-app business notices are included. Create them server-side alongside their originating change in the same transaction where applicable, with retry-safe duplicate protection. Read them through recipient-scoped access; a navigation link does not grant access to its target. Realtime, queues and worker services are not prerequisites.

Keep the schema's actor, timestamp, reason, source, refund and supersession records. No general audit engine is required. Do not duplicate authoritative history in application logging.

## 6. Feature implementation guide

Document the standard stack so developers share the same responsibilities:

```text
features/finance/
├── components/
│   ├── payment-form.tsx
│   └── payment-list.tsx
├── schemas.ts
├── contracts.ts
├── actions.ts
├── queries.ts
├── service.ts
└── service.test.ts
```

| File | Responsibility |
|---|---|
| `components/` | Forms and record presentation; client components only where interaction requires them |
| `schemas.ts` | Client/server-safe runtime input validation and inferred input types; not authorization |
| `contracts.ts` | Client/server-safe output DTOs and action-result types shared across the feature boundary |
| `actions.ts` | Server entry points, validation and actor resolution |
| `queries.ts` | Authorized reads and limited output fields |
| `service.ts` | Workflow authorization, orchestration and transaction calls |
| `service.test.ts` | Workflow behavior, denial and failure tests |

This is guidance, not a rigid file requirement. Developers may combine small implementations or extract additional files. Do not add empty files or forwarding-only layers to match the example. Security and transaction rules apply regardless of placement.

**Read:** page → feature query → actor/user client → scoped data → components.

**Write:** form → server action → authorized feature command/service → command client → constrained write or transactional RPC → refresh affected data.

An API handler reuses the same workflow rather than copying its rules. A service checks its own authorization requirements instead of assuming every caller already did so. Keep cross-feature calls explicit and avoid circular dependencies.

### Types and contracts

A contract defines accepted input, returned fields and expected success/failure results. TypeScript describes these shapes at compile time; runtime validation, authorization and business rules remain server responsibilities.

- Keep input schemas in `schemas.ts` and infer their types rather than duplicating definitions. Define deliberate output DTOs and action-result unions in `contracts.ts`; do not expose entire database rows by default.
- Keep shared schemas and contracts free of secrets, privileged clients and server-only imports. Use type-only imports for type dependencies. Shared shapes do not grant access to their fields.
- Generate the full Supabase definition into `src/server/db/database.types.ts` from the database after applying migrations. Commit the generated file, do not edit it manually, and regenerate it when tables, enums or RPC signatures change. Parameterize both database clients with its `Database` type.
- Extract `Tables<'payments'>`, `TablesInsert<'payments'>`, `TablesUpdate<'payments'>` or enum types where needed. Do not maintain a central catalogue of aliases for every table. Move genuinely reused feature types into a feature-local `types.ts`; no such file is required by default.
- Let selected queries and joins infer their results. Use Supabase's `QueryData<typeof query>` when an explicit query-result type is useful; do not label a partial selection as a full row.
- Generated database types describe persistence; a selected subset can also serve as a frontend contract. For example, `Pick<Tables<'profiles'>, 'id' | 'first_name' | 'last_name'>` may be exported from `contracts.ts` when shared by frontend and server. Do not duplicate identical shapes or predefine hypothetical projections. Define local subsets where used, share them when needed, and add custom fields or result types only when the workflow requires them.
- Types do not filter runtime objects. Select allowed columns explicitly and map responses where necessary; a `Pick` annotation does not remove extra fields. The server maps validated business input to allowed database writes and returns only authorized fields.

The generated type file contains no credentials; its directory is organizational, not a security control. Privileged runtime modules still require `server-only`. Add explicit contracts at meaningful boundaries, not wrappers around every internal function.

## 7. Tests and delivery

- Colocate unit/workflow tests with the feature.
- Use `supabase/tests/` for constraints, read policies, restricted RPC permissions, atomicity, retries and concurrency.
- Test both user-context denial and application authorization before service-role commands.
- Use `tests/e2e/` for cross-feature journeys, including customized auth flows.
- Keep executable schema changes in versioned migrations and use non-sensitive development seeds.
- Validate migration against the actual database before deployment. Documentation acceptance is not proof of application or deployment readiness.
