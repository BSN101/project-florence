# Project Florence — User Journeys

## Purpose

Record how users complete goals across the application. The [function list](Project_Florence_Function_List.md) defines scope and permissions, the [navigation map](Project_Florence_Navigation_Map.md) identifies destinations, and the [schema](Project_Florence_Schema.md) defines data and transaction rules. Journeys connect these references without replacing them.

This document provides writing guidance and finalized journeys. It is not a prerequisite for scaffolding.

## When and how to write

- Developers work through a feature's journey during implementation and document it here once its behavior is finalized. Do not present proposed behavior as implemented or verified.
- Write one journey per meaningful user goal, not per screen, table or button. Several roles may participate in one journey.
- Use plain language and usually 4–7 main steps. Describe user actions and meaningful system responses, not every click, modal or internal function.
- Include only consequential alternatives: permission denial, rejection, changed state, retry or recovery where relevant. Do not list every possible validation error.
- Identify relevant records, files and notifications at a high level. Reference existing rules rather than copying SQL, field lists or authorization matrices.
- Stay within agreed scope. Raise unresolved product decisions before finalizing a journey; documenting a flow does not authorize new roles, actions or automation.
- Keep the journey aligned when behavior changes. Use it to guide acceptance checks; it is not a substitute for tests.

## Entry format

Copy this template for each finalized journey. Author is required; omit other fields only when they genuinely do not apply.

```markdown
## <User goal>

- **Author:** Name of the developer documenting this journey.
- **Actors:** Primary user and any participating roles.
- **Starts at:** Navigation destination and necessary preconditions.
- **References:** Relevant FL IDs; schema sections where useful.

### Main flow

1. The user ...
2. The system ...
3. ...

### System involvement

Relevant records, files, authorization/state checks and notification effects.
Keep this brief; link to authoritative rules rather than restating them.

### Outcome

What changed and what each relevant user can see or do next.

### Important alternatives

- **<Situation>:** What happens and how the user proceeds.

### Acceptance checks

- Observable successful outcome.
- Important denial, failure or retry behavior.
```

## Finalized journeys

Add completed entries below as features are finalized. Do not prepopulate speculative flows or claim application verification from documentation alone.

## Manage payment transfer destination accounts

- **Author:** Reipoh Gabriel Arradaza
- **Actors:** Council Executive.
- **Starts at:** Council workspace > Payment accounts (`/council/payment-accounts`); user must hold an active Council Executive role.
- **References:** FL-047, FL-023; Schema section 7.4 (`payment_accounts`), Schema section 5 (`files`).

### Main flow

1. The Council Executive navigates to Payment accounts in the Council workspace.
2. The system loads active and archived payment accounts using permitted projections, respecting column grants.
3. The Executive clicks "Add Payment Account", specifies the destination label (e.g., GCash, Landbank), account holder name, reference number, and optionally uploads a QR code image (PNG, JPEG or WebP, max 2 MB).
4. The system validates inputs, stores the private QR image in R2 under purpose `payment_account_qr`, records the account with the Executive's profile attribution, and displays the new destination in the active list.
5. The Executive may edit an active destination's details or replace its QR image. The system updates the account record without rewriting historical payment snapshots.
6. The Executive may archive an active account through a confirmation dialog. The system sets `archived_at`, moves the account to the archived list and keeps the record.

### System involvement

- Table `payment_accounts`: rows inserted, updated, or archived (`archived_at = now()`). The workflow provides no delete action.
- New transfer payments (not corrections) must reference an active account; the database rejects archived ones.
- Table `files`: private QR image stored in R2 and registered via `register_file` under purpose `payment_account_qr`.
- Server actions enforce Council Executive authority via `assertAuthorizedCouncilExecutive()`. Operations and Representatives are denied.
- Existing submissions retain their captured snapshot (`destination_label`, `destination_account_name`, `destination_account_reference`) on table `payments`.

### Outcome

Active accounts appear in the active list; archived accounts move to the archived list and stay retained. Student transfer submission is not part of this journey.

### Important alternatives

- **Non-Executive Council Access:** If an Operations member or Representative navigates to `/council/payment-accounts`, the system renders an Executive Access Required notice and blocks all mutation actions.
- **Modifying an Archived Account:** The system blocks editing archived accounts (`archived_at is not null`), preventing stale or conflicting reactivations without creating a new account.
- **Viewing Stored QR Code:** Executives can click "View QR" on any account with an attached file to request a temporary signed URL and preview the image.

### Acceptance checks

- A Council Executive can create, edit, archive, and view active/archived payment accounts and optional QR codes.
- Council Operations and Representatives are denied access at both the page and server action layers.
- Archived accounts move to the archived list and can no longer be edited.
- Edits to an active account do not rewrite destination snapshots on existing payments.
- The workflow offers no way to delete an account.
