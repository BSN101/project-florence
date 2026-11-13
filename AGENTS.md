# Project Florence agent guidance

## Start here

- Before working, read `README.md`, then `docs/Florence_Architecture.md`
  and any other relevant project instructions.
- The function list defines agreed V1 scope and fixed roles.
- The architecture defines code responsibilities and security boundaries.
- The navigation map defines destinations, not permissions.
- `docs/database/schema.dbml` is the canonical schema-documentation source;
  dbdocs is its published view. The adjacent `schema.dbdiagram` is a diagram
  artifact, not an independently maintained schema contract.
- `supabase/migrations/` contains executable changes. Do not assume local
  files establish the state of a deployed database.
- Exclude archived specifications from routine searches. Consult them only
  for an explicit historical question or targeted provenance check.

## Scope and implementation

- Ask before adding roles, workflows, automation or dependencies beyond
  agreed requirements.
- Keep changes focused and preserve existing developer work.
- Follow the feature-based architecture without requiring empty files,
  forwarding-only layers or a generic repository framework.
- Keep domain rules and calculations in their owning feature.
- Reuse shared UI and utilities without duplicating business models across
  workspaces.
- Keep the academic policy extract unchanged in meaning. Product decisions
  do not amend institutional policy.

## Authorization and privacy

- Resolve the actor from a verified session and linked active profile.
  Never trust a browser-provided actor ID.
- Ordinary reads use the request-scoped user client, RLS and explicit fields.
- Protected commands use a separate server-only service-role client after
  actor/action authorization. Service-role access bypasses RLS.
- Do not attach user cookies or sessions to the privileged client.
- Keep privileged keys and provider credentials out of browser code, public
  variables, responses and logs.
- Expose storage keys only where explicitly authorized. Never treat a key
  as permission to access an object or sign arbitrary submitted keys.
- Do not log signed URLs or include private records in public assets.
- RLS filters rows, not columns. Use permitted projections and restricted
  query interfaces.
- Auth accounts, navigation visibility and workspace names do not grant
  business authority.
- Preserve self-benefit restrictions and archived-profile denial.
- Keep public signup disabled; use approved provisioning and invitation
  flows. Do not substitute public signup to bypass those flows.

## Database changes

- Use new, versioned SQL migrations. Never rewrite applied migrations,
  reset shared databases or discard retained history.
- Generated migration files start empty; populate and review them.
- Confirm the linked target and inspect pending migrations before applying
  changes. Do not push remote changes without explicit authorization.
- Docker is not required for linked remote migration pushes.
- This machine has no Docker or local Supabase stack. Pass `--remote` to
  Supabase CLI commands that target a database, for example
  `supabase migration list --remote`, `supabase db push --remote` and
  `supabase gen types --remote`. `--remote` is the CLI 3.x flag; it replaces
  `--linked`. Without it, those commands target the local database.
- Preserve constraints, restricted RPC execution, immutable histories,
  idempotency and shared locking protocols.
- Use one real transaction or transactional RPC for coordinated operations.
  Separate Supabase requests do not provide atomicity.
- Never disable safeguards merely to make a migration or workflow succeed.
- Migration-history repair changes recorded history, not database objects.
  Investigate mismatches before using it.
- Update `docs/database/schema.dbml` and regenerate
  `src/server/db/database.types.ts` after relevant database-interface changes.
- Keep executable changes in `supabase/migrations/`. Documentation changes
  do not apply SQL, and publication does not verify deployment.
- Do not expose private helper/configuration schemas through the Data API.
- Provision real Auth identities through supported Auth APIs or approved
  administration flows, not manual password/token inserts.

## Domain distinctions

- Council selects Office/RLE during event consequence generation. Retain
  the selection per event, including zero-demerit outcomes, and include it
  in retry identity. There is no global Council event bucket.
- Institutional date-sensitive behavior uses `Asia/Manila`.
- Any active Council Executive may waive eligible Council-generated
  demerits regardless of original Council issuer. Operations and
  Representatives cannot waive.
- Faculty entries retain issuer-specific waiver restrictions. Coordinator
  status does not override them. Self-waiver is prohibited.
- Preserve both the actual issuer and waiver actor. Displaying “Council”
  does not replace historical attribution.
- Preserve received-money, refund, correction and permanent-clearance
  history according to the documented contracts.

## Types and contracts

- Do not manually edit generated database types.
- Parameterize both database clients with the generated `Database` type.
- Extract database types where needed; share aliases only when useful.
- A database-derived subset can itself be a shared contract. Do not
  duplicate identical shapes across model, DTO and response definitions.
- Infer input types from runtime validation schemas.
- Prefer query inference for selected fields and joins when sufficient.
- Types do not replace validation, authorization or explicit response
  field selection. A `Pick` annotation does not remove runtime fields.
- Keep shared schemas/contracts free of secrets and server-only runtime
  dependencies.

## Documentation and verification

- Write concise, standalone current guidance.
- Keep one canonical DBML source; publishing it does not migrate SQL.
- Update affected current references when filenames or contracts change.
- Record finalized user journeys using the documented format, including
  the author. Do not describe proposed behavior as implemented.
- Use existing checks and focused verification. Do not introduce a large
  testing framework merely to begin scaffolding.
- Verify critical permission and integrity behavior before releasing the
  affected workflows. A comprehensive seed dataset is not a prerequisite
  for every focused check.
- Report commands run, results and limitations honestly. Migration success
  is not proof that every business workflow works.
- Do not claim deployed resources were inspected or changed without
  performing and verifying those operations.
- Do not commit, publish documentation or change deployed resources unless
  explicitly requested.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
