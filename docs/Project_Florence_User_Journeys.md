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
3. The Executive clicks "Add Payment Account", specifies the destination label (e.g., GCash, Landbank), account holder name, account number, and optionally uploads a QR code image (PNG, JPEG or WebP, max 2 MB).
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

## View student obligations and payment history

- **Author:** Reipoh Gabriel Arradaza
- **Actors:** Student.
- **Starts at:** Student workspace > Fees & fines (`/student/fees-and-fines`); user must have an active student profile.
- **References:** FL-022; Schema sections 7.3 (`obligations`), 7.5 (`payments`), 7.6 (`payment_items`), 7.7 (`payment_refunds`), 4.1 (`semesters`).

### Main flow

1. The Student navigates to Fees & fines in the Student workspace.
2. The system loads the student's financial summary, obligations, and payment history for the selected semester, along with any unpaid obligations carried over from prior semesters.
3. The student reviews the financial summary metrics: total outstanding payable balance, current semester dues, prior semester overdue amounts, verified settled totals, and payments under review.
4. If unpaid debt remains from prior semesters, the system displays a multi-semester overdue notice explaining that older obligations remain collectible across terms and clearances.
5. The student inspects the obligations list for fee publications and fine assessments, filtering by standing (All Dues, Unpaid, Under Review, Settled, Waived), and can open waiver details (waiver date and documented reason) on waived items.
6. The student switches to the Payment history tab to inspect submitted transfers, recorded cash payments, receipt metadata, and any refund or rejection reasons.
7. The student may use the workspace semester selector to view obligations and payments scoped to any earlier semester.

### System involvement

- Table `obligations`: reads fee and fine records scoped to the student's active profile via RLS; obligation standing is derived dynamically rather than stored as a status column.
- Tables `payments`, `payment_items`, and `payment_refunds`: joins settlement and refund records so that only current verified payments without a refund settle active debt.
- Shared financial calculations compute balances, semester breakdowns, and carryovers using integer-cent precision.
- Ordinary reads use the request-scoped user client respecting RLS.

### Outcome

The student sees their current debt standing, amounts still payable, pending transfer verifications, settled payments, and any prior-semester carryovers.

### Important alternatives

- **Carryover Unpaid Debt Across Semesters:** Unpaid obligations from older semesters do not expire upon a new semester or clearance; they remain collectible in the prior-semester overdue balance.
- **Waived Obligations:** Waived obligations are marked as waived, excluded from the payable balance, and show their recorded waiver date and reason.
- **Refunded Payments:** When a verified payment has a linked refund record, the underlying obligation returns to unpaid status, the payable balance updates accordingly, and the refund details appear in payment history.
- **Pending Transfer Verification:** Transfer payments awaiting Council verification mark linked obligations as under review without settling the debt until verified.

### Acceptance checks

- A student sees only their own obligations, balance metrics, and payment records.
- Outstanding payable balances accurately distinguish current-semester dues from prior-semester overdue carryovers.
- Dynamic obligation standings reflect active debt, transfers under review, verified settlements, and approved waivers.
- Refunded and rejected payments do not settle debt, and their reasons are visible in payment history.

## Inspect student financial accounts and payment history

- **Author:** Reipoh Gabriel Arradaza
- **Actors:** Council Executive, Council Operations.
- **Starts at:** Council workspace > Payments (`/council/payments`); user must hold an active Council Executive or Operations role.
- **References:** FL-022; Schema sections 7.3 (`obligations`), 7.5 (`payments`), 7.6 (`payment_items`), 7.7 (`payment_refunds`), 4.1 (`semesters`), 4.2 (`enrollments`), 3.1 (`profiles`).

### Main flow

1. The Council Executive or Operations officer navigates to Payments in the Council workspace.
2. The system displays a paginated table of students enrolled in the selected semester, showing each student's payable amount, amount under review and standing (Unpaid, Under Review or Cleared).
3. The officer can search the table by name, university ID, or institutional email, and filter it by year level, academic status and payment standing (Unpaid, Prior-Term Balance, Under Review or Cleared).
4. The officer selects a student, and the system opens that student's financial summary, obligations ledger, and payment history. "All students" returns to the table.
5. The officer reviews the financial summary metrics, including total outstanding payable balance, current semester dues, prior semester carryovers, settled totals, and payments under review.
6. The officer inspects individual obligations (fees and fines), filters by standing, and can inspect waiver details (waiver date and documented reason) on waived items.
7. The officer switches to the Payment history tab to audit payment receipts, reference numbers, timestamps, decision notes, and any issued refunds.

### System involvement

- Authorization checks at both the page and query layers enforce that the actor holds an active Council Executive or Operations role. Representatives and Faculty are denied.
- Tables `enrollments` and `profiles`: the student table uses the restricted `florence_roster` RPC, and the selected student's identity comes from the restricted `florence_finance_student` RPC, rather than broad profile reads.
- Tables `obligations`, `payments`, `payment_items`, and `payment_refunds`: the table totals and the selected student's records use the same shared financial calculations and integer-cent math as the student workspace.

### Outcome

Council Executive and Operations officers can inspect permitted student financial accounts, audit payment histories, and verify whether prior-semester dues remain collectible.

### Important alternatives

- **Unauthorized Council Access:** If a Council Representative or non-authorized member navigates to `/council/payments`, the system displays an Officer Access Required notice and blocks student lookup and ledger inspection.
- **Student With Prior Overdue Balance:** If the selected student has unpaid obligations from older semesters, the system displays a multi-semester overdue notice with the collectible carryover amount.
- **Changing Semester Context:** The officer can use the workspace semester selector to filter the selected student's obligations and payments to a specific semester while keeping cumulative prior overdue totals visible.

### Acceptance checks

- Council Executive and Operations officers can browse and search the semester's students, see each student's standing, and inspect their financial accounts and payment histories.
- Council Representatives and non-Council roles are denied access to student financial ledgers.
- Financial figures, obligation standings, and payment histories match between the student view and the council ledger view.
- Waiver details and refund records are accurately displayed.

## Submit student transfer evidence

- **Author:** Reipoh Gabriel Arradaza
- **Actors:** Student.
- **Starts at:** Student workspace > Fees & fines (`/student/fees-and-fines`); user must have an active student profile.
- **References:** FL-023, FL-047, FL-022; Schema sections 7.3 (`obligations`), 7.4 (`payment_accounts`), 7.5 (`payments`), 7.6 (`payment_items`), 5 (`files`).

### Main flow

1. The Student navigates to Fees & fines in the Student workspace and clicks "Submit Transfer Evidence".
2. The system opens the multi-step payment wizard.
3. In Step 1 (Obligations), the student selects an academic term with unpaid obligations (including older unpaid semesters) and selects one or more complete obligations. The system enforces the single-semester rule and live-calculates the full payable sum.
4. In Step 2 (Destination), the student selects an active Council payment account (e.g., GCash, Landbank), copies the account number or scans the QR code image if available.
5. In Step 3 (Proof), the student enters the bank/e-wallet transfer reference number and uploads a screenshot/photo of their receipt (JPEG/PNG/WebP, max 4 MB).
6. In Step 4 (Review), the student reviews the semester, selected dues, total amount, destination snapshot, reference number, and receipt thumbnail, then submits.
7. The system compresses the proof image, uploads it to private R2 storage (`payment_proof`), executes the atomic `submit_transfer_payment` RPC capturing immutable destination snapshots and same-semester items, and sets payment status to `pending`.
8. The student sees the confirmation screen and can switch directly to Payment History to track their submission.

### System involvement

- Table `payments`: inserts a pending transfer record with captured snapshot columns (`destination_label`, `destination_account_name`, `destination_account_reference`), `proof_file_id`, and `request_key`.
- Table `payment_items`: records one row per selected obligation, enforcing composite foreign keys (`student_id`, `semester_id`).
- Private R2 Storage: validates, strips EXIF metadata, compresses, and stores the receipt image under purpose `payment_proof`.
- RPC `submit_transfer_payment`: validates active destination account status under `FOR SHARE` lock, proof ownership, and same-semester non-waived obligation validity.

### Outcome

The student creates a pending transfer submission covering selected obligations for one semester. The submission does not settle obligations until Council manually verifies it.

### Important alternatives

- **Cross-Semester Selection Block:** The UI and server both enforce that an individual transfer covers obligations from exactly one semester. Switching semesters in the wizard clears previous selections.
- **Archived Destination Account:** If a destination account is archived while a student is submitting, the atomic transaction rejects the submission and prompts the student to choose an active account.
- **Duplicate Submissions:** Duplicate submissions covering the same obligation are permitted in pending status; Council manually reviews and resolves duplicates during verification without automated reservation locks.

### Acceptance checks

- A student can select complete obligations from only one semester per submission.
- Selecting obligations across different semesters is blocked in both UI and server validation.
- Destination account details are immutably snapshotted onto the payment record.
- Uploaded receipt proof is private and accessible only by the student and authorized Council reviewers.
- Pending submissions do not settle obligations until Council manual verification.
