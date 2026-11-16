# Project Florence agent guidance

Rules for agents working in this repository. Sections are ordered by when
you need them: sources first, then hard limits, then rules per kind of change.

## 1. Sources of truth

Read `README.md`, then `docs/Florence_Architecture.md`, before working.

| Source | Defines | Does not |
|---|---|---|
| `docs/Project_Florence_Function_List.md` | Agreed V1 scope and fixed roles | — |
| `docs/Florence_Architecture.md` | Code responsibilities, security boundaries, rendering rules | — |
| `docs/Project_Florence_Navigation_Map.md` | Destinations per workspace | Grant permissions |
| `docs/database/schema.dbml` | Canonical schema documentation (dbdocs is its published view) | Apply SQL |
| `docs/database/schema.dbdiagram` | Diagram artifact | Act as a separate schema contract |
| `supabase/migrations/` | Executable database changes | Prove what is deployed |
| `docs/Florence_Design_Tokens.md` | Colour, type and motion values | — |

Exclude archived specifications from routine searches. Consult them only for
an explicit historical question or a targeted provenance check.

## 2. Hard limits

Never do these without explicit instruction from the user:

- Commit, publish documentation, push migrations or change deployed resources.
- Add roles, workflows, automation or dependencies beyond agreed requirements.
- Rewrite applied migrations, reset shared databases or discard retained history.
- Disable a safeguard to make a migration or workflow succeed.
- Trust a browser-provided actor ID, or attach user cookies/sessions to the
  privileged client.
- Expose privileged keys, provider credentials or signed URLs in browser code,
  public variables, responses or logs.
- Enable public signup or use it to bypass provisioning and invitation flows.
- Edit generated database types by hand.
- Change the meaning of the academic policy extract. Product decisions do not
  amend institutional policy.

## 3. Writing application code

### Scope and structure

- Keep changes focused and preserve existing developer work.
- Follow the feature-based architecture. Do not add empty files,
  forwarding-only layers or a generic repository framework.
- Keep domain rules and calculations in their owning feature.
- Reuse shared UI and utilities; do not duplicate business models across
  workspaces.

### Rendering and navigation

Details and reasons: architecture §3, "Rendering and navigation".

- Navigate with `<Link>`. A clickable row may add `router.push`, but must
  keep a real link inside it.
- Put secondary or slow data behind `<Suspense>` so the page frame and
  primary content are not held back by it.
- Keep view-only state (tabs, open panels) on the client, using
  `history.replaceState` when the URL should reflect it.
- Show pending states inside the affected area. Do not cover the whole
  screen while a page loads.
- Pages currently export `instant = false` because each page renders its own
  `WorkspaceShell`. Keep it on new pages until the shell moves into the
  workspace layouts.

### Caching

Details: architecture §4, "Caching and authorization".

- `"use cache"` cannot read cookies, so it never runs under the RLS user
  client. Cache with it only data every signed-in user may see, after an
  authorization review.
- Per-user data may use `"use cache: private"` at most. A cached result is
  never an authorization check.
- Writes refresh affected data with `revalidatePath`, or `updateTag` for
  tagged cache entries.

### Types and contracts

- Parameterize both database clients with the generated `Database` type.
- Extract database types where needed; share aliases only when useful.
- A database-derived subset can itself be a shared contract. Do not
  duplicate identical shapes across model, DTO and response definitions.
- Infer input types from runtime validation schemas.
- Prefer query inference for selected fields and joins when sufficient.
- Types do not replace validation, authorization or explicit response field
  selection. A `Pick` annotation does not remove runtime fields.
- Keep shared schemas and contracts free of secrets and server-only runtime
  dependencies.

## 4. Authorization and privacy

- Resolve the actor from a verified session and a linked active profile.
- Ordinary reads use the request-scoped user client, RLS and explicit fields.
- Protected commands use a separate server-only service-role client after
  actor/action authorization. Service-role access bypasses RLS.
- RLS filters rows, not columns. Use permitted projections and restricted
  query interfaces.
- Expose storage keys only where explicitly authorized. A key is never
  permission to access an object; never sign arbitrary submitted keys.
- Never include private records in public assets.
- Auth accounts, navigation visibility and workspace names do not grant
  business authority.
- Preserve self-benefit restrictions and archived-profile denial.

## 5. Database changes

### Writing migrations

- Use new, versioned SQL migrations in `supabase/migrations/`. Generated
  migration files start empty; populate and review them.
- In RLS policies, call row-independent helpers as
  `(select f_access_private.me())` so they run once per statement, not per
  row. Helpers that take a row column, such as `event_visible(id)`, cannot be
  wrapped this way.
- Preserve constraints, restricted RPC execution, immutable histories,
  idempotency and shared locking protocols.
- Use one real transaction or transactional RPC for coordinated operations.
  Separate Supabase requests are not atomic.
- Do not expose private helper/configuration schemas through the Data API.
- Provision real Auth identities through supported Auth APIs or approved
  administration flows, not manual password/token inserts.
- After database-interface changes, update `docs/database/schema.dbml` and
  regenerate `src/server/db/database.types.ts`.

### Running the Supabase CLI

- This machine has no Docker or local Supabase stack, and Docker is not
  needed for remote pushes.
- Pass `--remote` to commands that target a database, for example
  `supabase migration list --remote`, `supabase db push --remote` and
  `supabase gen types --remote`. `--remote` is the CLI 3.x flag that replaces
  `--linked`; without it, commands target the local database.
- Confirm the linked target and inspect pending migrations before applying.
- Migration-history repair changes recorded history, not database objects.
  Investigate mismatches before using it.

## 6. Domain rules

- Council selects Office/RLE during event consequence generation. Retain the
  selection per event, including zero-demerit outcomes, and include it in
  retry identity. There is no global Council event bucket.
- Institutional date-sensitive behavior uses `Asia/Manila`.
- Any active Council Executive may waive eligible Council-generated demerits
  regardless of the original Council issuer. Operations and Representatives
  cannot waive.
- Faculty entries keep issuer-specific waiver restrictions. Coordinator
  status does not override them. Self-waiver is prohibited.
- Preserve both the actual issuer and the waiver actor. Displaying “Council”
  does not replace historical attribution.
- Preserve received-money, refund, correction and permanent-clearance
  history according to the documented contracts.

## 7. Documentation, verification and reporting

- Write concise, standalone current guidance. Do not describe proposed
  behavior as implemented.
- Keep one canonical DBML source; publishing it does not migrate SQL.
- Update affected references when filenames or contracts change.
- Record finalized user journeys in the documented format, including the author.
- Use existing checks and focused verification. Do not add a large testing
  framework just to start scaffolding. A full seed dataset is not required
  for every focused check.
- Verify critical permission and integrity behavior before releasing the
  affected workflows.
- Report commands run, results and limitations honestly. Migration success
  does not prove every business workflow works. Do not claim deployed
  resources were inspected or changed without doing and verifying it.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
