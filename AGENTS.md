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
- Break a rule in §4 (navigation, layout and caching).
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

## 4. Navigation, layout and caching (required for new features)

These rules keep navigation instant and app-like. Each one fixes a measured
problem; breaking one silently brings it back. Reasons and details:
architecture §3 "Rendering and navigation" and §4 "Caching and authorization".

### Pages and layouts

- A workspace page renders `WorkspaceShell` and nothing else from the shell.
  It is the access gate (redirects, not-found, destination and `semester`
  checks) and the page frame. Never skip it or copy its checks into a page.
- The sidebar, header and phone tab bar come only from `WorkspaceChrome` in
  the workspace `layout.tsx`. Never render them from a page.
- A page that needs no chrome (full-screen tools such as the QR station)
  goes in its own route group, like `council/(station)/`, not in a branch
  inside the chrome.
- Derive the current destination on the client with `usePathname()` against
  the navigation list. Do not pass it down from pages.
- Pages and workspace layouts export `instant = false`; keep it until
  session reads move behind `<Suspense>` or a private cache.

### Loading, errors and pending states

- Workspace `loading.tsx` renders `ContentLoading` and `error.tsx` renders
  `PortalError`, both inside the layout so the chrome stays on screen.
- Write `loading.tsx`, `error.tsx` and other route files as plain function
  components. `export { X as default } from "…"` breaks in Turbopack dev.
- Never cover the whole screen while something loads. Show pending state in
  the affected area: the clicked row, the control that changed, or the
  content skeleton. Use `useTransition` to keep the current view visible.
- Navigate with `<Link>`. A clickable row may add `router.push`, but keeps a
  real link inside it for prefetching, new tabs and keyboard users.
- Put secondary or slow data behind `<Suspense>`: start the read without
  awaiting it, pass the promise down and read it with `use()`.
- Keep view-only state (tabs, open panels) on the client, using
  `history.replaceState` when the URL should reflect it.

### Back navigation and preserved pages

- Next.js keeps the last three visited routes alive (hidden with
  `<Activity>`), so Back is instant. Never key a layout-level wrapper by
  pathname or otherwise re-mount the routes: that discards them.
- Page transitions go inside the page (`PageTransition` in `WorkspaceShell`),
  not around the layout's children.
- Hidden pages keep their state and stay in the DOM. Reset transient UI
  explicitly (open menus, stale success messages, "tapped" highlights) when
  the URL changes, and never rely on `document.getElementById` finding the
  visible copy. Effects run cleanup when a page is hidden.
- Sign-out must load `/sign-in` in full. Use `SignOutForm`; never sign out
  with a soft redirect.

### Caching and freshness

- `staleTimes.dynamic` is 30 s: a link revisit within 30 s reuses the last
  render. Every write action calls `revalidatePath` (or `updateTag`) for the
  pages it changes, so the user's own changes show at once.
- Screens that show changes made by other people (payment review,
  attendance, clearance queues) include `RefreshButton` with the render time.
- `"use cache"` cannot read cookies, so it never runs under the RLS user
  client. Cache with it only data every signed-in user may see, after an
  authorization review.
- Per-user data may use `"use cache: private"` at most. A cached result is
  never an authorization check; commands always read current state.
- No service workers or disk caches for signed-in data.

### Verify before finishing a navigation or layout change

- In a production build (`next build && next start`): Back to a visited page
  makes no server request and keeps the page; the sidebar never turns into
  a skeleton; the page title, header title and active item match the URL.
- Allow and deny checks for each affected role still pass (signed out,
  wrong workspace, wrong destination, invalid `semester`).
- On a phone width: the tab bar highlights the current page after Back, and
  the header turns frosted when the title scrolls under it.

## 5. Authorization and privacy

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

## 6. Database changes

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

## 7. Domain rules

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

## 8. Documentation, verification and reporting

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
