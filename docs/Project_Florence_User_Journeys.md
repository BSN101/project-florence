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
3. In Step 1 (Obligations), the student chooses a term from a list showing each term's payable item count and outstanding total (prior overdue terms first; the picker is hidden when only one term is payable), then selects one or more complete obligations. Obligations already on a pending transfer are shown but cannot be selected. The system enforces the single-semester rule and live-calculates the full payable sum.
4. In Step 2 (Method), the student chooses an active Council payment account (e.g., GCash, Landbank).
5. In Step 3 (Payment), the student sees the chosen account's name, account number (with Copy), instructions and QR code if available, together with the amount to transfer.
6. In Step 4 (Proof), the student enters the bank/e-wallet transfer reference number and uploads a screenshot/photo of their receipt (JPEG/PNG/WebP, max 4 MB).
7. In Step 5 (Review), the student reviews the semester, selected dues, total amount, destination, reference number, and receipt preview, then submits.
8. The system compresses the proof image, uploads it to private R2 storage (`payment_proof`), executes the atomic `submit_transfer_payment` RPC capturing immutable destination snapshots and same-semester items, and sets payment status to `pending`.
9. The student sees the confirmation screen and can switch directly to Payment History to track their submission.

### System involvement

- Table `payments`: inserts a pending transfer record with captured snapshot columns (`destination_label`, `destination_account_name`, `destination_account_reference`), `proof_file_id`, and `request_key`.
- Table `payment_items`: records one row per selected obligation, enforcing composite foreign keys (`student_id`, `semester_id`).
- Private R2 Storage: validates, strips EXIF metadata, compresses, and stores the receipt image under purpose `payment_proof`.
- RPC `submit_transfer_payment`: validates active destination account status under `FOR SHARE` lock, proof ownership, same-semester non-waived obligation validity, that no selected obligation is on a current pending transfer, and that the reference number is not on a current pending or verified transfer to the same account.

### Outcome

The student creates a pending transfer submission covering selected obligations for one semester. The submission does not settle obligations until Council manually verifies it.

### Important alternatives

- **Cross-Semester Selection Block:** The UI and server both enforce that an individual transfer covers obligations from exactly one semester. Switching semesters in the wizard clears previous selections.
- **Archived Destination Account:** If a destination account is archived while a student is submitting, the atomic transaction rejects the submission and prompts the student to choose an active account.
- **Obligation Already Pending:** An obligation on a current pending transfer cannot be submitted again. It becomes selectable again once Council rejects that transfer.
- **Reused Reference Number:** A reference number already on a current pending or verified transfer to the same account (compared without spaces, punctuation or case) is refused with "This reference number has already been submitted." A rejected submission frees its reference. Duplicates that still reach Council (e.g. a different reference for the same money) are rejected manually during verification.

### Acceptance checks

- A student can select complete obligations from only one semester per submission.
- Selecting obligations across different semesters is blocked in both UI and server validation.
- Destination account details are immutably snapshotted onto the payment record.
- Uploaded receipt proof is private and accessible only by the student and authorized Council reviewers.
- Pending submissions do not settle obligations until Council manual verification.
- Submitting the same obligation twice while the first transfer is pending is refused.
- Reusing a pending or verified reference number on the same account is refused; after rejection it is accepted.
- "View Proof" in Payment History opens the payment record (status, term, destination, reference, covered items, total, dates) beside the receipt image. Council sees the same record with the student's name and ID.
- The student can save the record and receipt image as one photo (share sheet on phones, download otherwise). Records that are not verified say "Submission record, not an official receipt."

## Award direct merits to students

- **Author:** Andrei Catigan
- **Actors:** Academic Instructor, Clinical Instructor (including Coordinators in their instructor capacity).
- **Starts at:** Faculty workspace > My entries (`/faculty/my-merits-and-demerits`) or a student's details on the Students page; user must hold an active Academic Instructor or Clinical Instructor role.
- **References:** FL-030, FL-044; Schema section 9.2 (`merits`), Schema section 12 (`notifications`).

### Main flow

1. The Instructor opens My entries in the Faculty workspace, or chooses "Award merits" in a student's details on the Students page.
2. The system verifies instructor access and shows the instructor's direct awards for the selected semester with an "Award merits" action.
3. The Instructor chooses "Award merits". The award page (`?award`) opens on the Students step, with the student already selected when started from that student's details.
4. **Students:** the Instructor searches the current semester roster (`florence_roster`, excluding the instructor) and selects one or more students.
5. **Details:** the Instructor enters whole days per student, the award date (default: today in `Asia/Manila`, limited to the current semester and not in the future) and the reason. The page shows the resulting expiry date.
6. **Review:** the page lists every selected student, the days, award date, expiry and reason. The Instructor confirms with a button naming the total (for example, "Award 2 days to 3 students").
7. The system validates the input server-side and runs `award_merits` once per student through the command client. Each student has its own request key, made when the student was selected.
8. The database inserts one row per whole-day unit into `public.merits` with `source = 'direct'` and `expires_on` one year after `awarded_on`, and creates an in-app notice (`merit_received`) for each recipient.
9. The result page lists the students awarded and any not recorded, with the reason. My entries is revalidated, so the new awards show at once.

### System involvement

- Table `merits`: inserts `p_days` whole-day rows per student with `award_request_key` and unit ordinal index `1..p_days`, `awarded_by = actor.profile.id`, and `expires_on = (awarded_on + interval '1 year')::date`.
- Table `notifications`: atomically inserts in-app notification rows with `kind = 'merit_received'` for each awarded student via `f_cmd_notice`.
- Procedure `award_merits`: enforces instructor role, non-self award (`p_student <> p_actor`), positive whole-day units, active semester enrollment, non-future date bounds, and request-level idempotency (`f_cmd_begin`/`f_cmd_finish`).
- Server actions enforce faculty role authorization via `requireWorkspace("faculty")`.

### Outcome

The awarded merits appear immediately in the instructor's history, students receive an in-app notification, and the units become available in the students' disciplinary ledgers as bucket-agnostic merits valid for 1 year.

### Important alternatives

- **Historical semester:** "Award merits" is disabled with a notice that merits can only be awarded in the current semester.
- **Self-award:** the instructor is not offered as a recipient, and the action and `award_merits` reject `p_student = p_actor`.
- **Date out of range:** the Details step and `award_merits` reject dates before the semester starts, after it ends or in the future.
- **Some students fail:** awards already recorded stay recorded. The result page names each student not recorded and why, and the Instructor can review and confirm again for only those students.
- **Double-click or lost connection:** each student's request key is kept until that student is awarded, so confirming again replays the recorded award through `f_cmd_begin` instead of repeating it. Changing the details for an already-recorded key is rejected with a message to check My entries.

### Acceptance checks

- Academic and Clinical Instructors can award whole-day direct merits to one or multiple enrolled students.
- Multi-day awards create the corresponding number of 1-day merit rows in the database, attributed to `awarded_by` and `source = 'direct'`.
- Awarded units expire exactly one year from `awarded_on` and remain bucket-agnostic until applied.
- Recipient students receive an in-app notification upon award.
- Self-awards, non-integer/negative units, future dates, and awards outside the active semester are prevented and return readable errors.
- When one of several students fails, the others are still awarded and the failed students are named; confirming again does not duplicate recorded awards.

## Log faculty demerits with misconduct catalog selection

- **Author:** Andrei Catigan
- **Actors:** Academic Instructor, Clinical Instructor (including Coordinators in their instructor capacity).
- **Starts at:** Faculty workspace > My entries (`/faculty/my-merits-and-demerits`) or a student's row/details on the Students page; user must hold an active Academic Instructor or Clinical Instructor role.
- **References:** FL-033, FL-044; Schema section 8.1 (`misconduct_catalog`), Schema section 8.2 (`demerits`), Schema section 12.1 (`notifications`).

### Main flow

1. The Instructor opens My entries in the Faculty workspace, or chooses "Log demerit" in a student's row or details on the Students page.
2. The system verifies instructor access and shows the instructor's issued demerits and merits for the selected semester with "Log demerit" and "Award merits" actions.
3. The Instructor chooses "Log demerit". The demerit page (`?demerit`) opens on the Students step, with the student already selected when started from that student's details or directory row.
4. **Students:** the Instructor searches the current semester roster (`florence_roster`, excluding the instructor) and selects one or more students.
5. **Details:** the page shows the bucket fixed by the instructor role (Office for Academic Instructors, RLE for Clinical Instructors); the Instructor selects an active catalog misconduct violation (standard options listed alphabetically, with "Other" listed last), enters whole-day units (defaulting to 1), sets the incident date (default: today in `Asia/Manila`, limited to the current semester and not in the future), and enters incident details (required for "Other", optional for standard catalog items).
6. **Review:** the page lists the applicable bucket, violation, units, incident date, details, and every selected student. The Instructor confirms with a button naming the total (for example, "Log 2 days for 3 students").
7. The system validates the input server-side and runs `log_demerits` once per student through the command client. Each student has its own request key, made when the student was selected.
8. The database inserts one row per whole-day unit into `public.demerits` sharing the `incident_group_id` with `source = 'faculty'`, `incident_unit_index` 1..N, attributed to `issued_by`, and creates an in-app notice (`demerit_incurred`) for each recipient.
9. The result page lists the students logged and any not recorded, with the reason. My entries is revalidated, so the new demerit entries show at once in the Issued Demerits table.

### System involvement

- Table `demerits`: inserts `p_days` whole-day rows per student sharing `incident_group_id = p_key` with unit ordinal index `1..p_days`, `issued_by = actor.profile.id`, `source = 'faculty'`, and `bucket = p_bucket`.
- Table `misconduct_catalog`: verifies that the chosen misconduct option is active (`archived_at is null`) and enforces description requirements when `is_other = true`.
- Table `notifications`: atomically inserts in-app notification rows with `kind = 'demerit_incurred'` for each recipient student via `f_cmd_notice`.
- Procedure `log_demerits`: enforces instructor role to bucket matching (`f_cmd_instructor`), non-self sanction (`p_student <> p_actor`), positive whole-day units, active semester enrollment, non-future date bounds, and request-level idempotency (`f_cmd_begin`/`f_cmd_finish`).
- The server action checks Faculty access via `requireWorkspace("faculty")` and derives the bucket from the instructor role; the browser does not choose it.

### Outcome

The issued demerits appear immediately in the instructor's history under the Demerits tab (with active vs. waived breakdown ready for waivers), recipient students receive an in-app notification, and the units are added to the students' disciplinary ledger in the designated bucket.

### Important alternatives

- **Historical semester:** "Log demerit" is disabled or hidden with an informative notice that demerits can only be logged in the current semester.
- **Bucket-to-role mismatch:** an Academic-only instructor cannot log RLE demerits, and a Clinical-only instructor cannot log Office demerits.
- **Other misconduct option:** selecting "Other" requires a specific description of the misconduct ($\ge 3$ characters); standard catalog items allow optional context.
- **Self-sanction:** the instructor is excluded from the student picker, and the server action and `log_demerits` RPC reject `p_student = p_actor`.
- **Date out of range:** the Details step and `log_demerits` reject dates before the semester starts, after it ends, or in the future.
- **Some students fail:** demerits already recorded stay recorded. The result page names each student not recorded and why, and the Instructor can review and confirm again for only those students without repeating completed records. Details stay fixed after a confirm attempt; changing them means starting over.
- **Double-click or lost connection:** each student's request key is kept until that student is recorded, so confirming again replays the recorded demerits through `f_cmd_begin` instead of duplicating them.

### Acceptance checks

- Academic Instructors can log Office demerits; Clinical Instructors can log RLE demerits.
- Selecting "Other" strictly requires an incident description ($\ge 3$ characters); standard violations allow optional notes.
- Multi-day incident sanctions create individual 1-day demerit records sharing `incident_group_id` with sequential `incident_unit_index` 1..N and `source = 'faculty'`.
- Recipient students receive an in-app notification (`demerit_incurred`) upon logging.
- Self-sanctions, non-integer/negative units, future dates, and incidents outside the active semester are prevented and return readable errors.
- Deep-links from the student directory and student detail modal open the 4-step wizard with the selected student preselected.
- Demerits table accurately reflects issued units, active vs. waived status, bucket badges, and violation details with zero layout shift.

## Record student cash payment

- **Author:** Reipoh Gabriel Arradaza
- **Actors:** Council Executive, Council Operations, Student (beneficiary).
- **Starts at:** Council workspace > Payments (`/council/payments`), inside a selected student's ledger; user must hold an active Council Executive or Operations role.
- **References:** FL-024, FL-022, FL-044; database schema (`docs/database/schema.dbml`: `obligations`, `payment_receipts`, `payments`, `payment_items`, `notifications`).

### Main flow

1. The Council Executive or Operations officer navigates to Payments in the Council workspace, clicks "View" on a student in the roster table, and clicks "Record Cash Payment" in the student's ledger.
2. In Step 1 (Obligations), the officer chooses a term from the student's unpaid semesters (when more than one term has unpaid dues) and selects one or more complete unpaid obligations from that single semester. The system enforces the same-semester rule and calculates the exact total payable amount.
3. In Step 2 (Confirm), the officer reviews the student's identity, academic term, itemized obligations, and total cash amount, sets the actual receipt date and time (defaulting to current `Asia/Manila` time, not in the future), and checks the physical cash collection confirmation.
4. The officer confirms the payment. The system validates the input server-side and executes the atomic `record_cash_payment` RPC with a generated idempotency request key.
5. The database locks the selected obligations, verifies they belong to the same student and semester and remain unsettled and non-waived, creates a `payment_receipts` row, inserts a verified cash payment (`method = 'cash'`, `status = 'verified'`), links the covered items in `payment_items`, and creates an in-app `payment_verified` notification for the student.
6. In Step 3 (Done), the dialog displays the verified payment result, including the student details, academic term, receipt timestamp, payment ID, receipt ID, covered obligations, and total amount collected, with buttons to view Payment History or close and see the refreshed ledger.

### System involvement

- Table `payment_receipts`: inserts the cash receipt record (`request_key`, `received_at`, `recognized_by = actor`).
- Table `payments`: inserts a verified cash record (`method = 'cash'`, `status = 'verified'`, `record_status = 'current'`, `receipt_id`, `is_receipt_record = true`, `submitted_by = actor`, `decided_by = actor`) with `request_key`.
- Table `payment_items`: inserts one settlement link per selected obligation, enforcing composite foreign keys (`student_id`, `semester_id`).
- Table `notifications`: atomically inserts an in-app notification (`kind = 'payment_verified'`) for the student via `f_cmd_notice`.
- Procedure `record_cash_payment`: enforces Executive or Operations authority (`f_cmd_council`), non-self recording (`p_student <> p_actor`), non-future collection timestamp (`p_received_at <= clock_timestamp()`), row-level obligation locking (`f_cmd_lock_obligations`), same-semester unpaid non-waived item validation (`f_cmd_item_total`), and request-level idempotency (`f_cmd_begin`/`f_cmd_finish`).

### Outcome

The selected obligations are immediately settled in full, the student's outstanding payable balance decreases by the recorded amount, the verified cash payment appears in both the Council and Student payment histories, and the student receives an in-app notification.

### Important alternatives

- **Self-Recording Blocked:** When an officer opens their own student financial ledger, the "Record Cash Payment" button is disabled with a self-recording restriction notice, and both the server action and `record_cash_payment` RPC reject `studentId === actor.profile.id`.
- **Cross-Semester Selection Blocked:** Only obligations from one semester can be selected per cash payment; switching terms in the dialog clears selections from the previous semester, and the server action and RPC reject mixed-semester obligation sets.
- **Obligation With Pending Transfer:** An obligation on a transfer awaiting review is shown with "Transfer pending · Decide the transfer first" and cannot be selected, and `record_cash_payment` rejects it (`"Selected obligation has a pending transfer"`). Recording cash would make `verify_payment` reject the whole transfer and could charge the student twice. Once the transfer is rejected, the obligation is unpaid again and can be collected in cash; once verified, it is settled.
- **Duplicate Settlement or Concurrent Recording:** If another officer settles or waives a selected obligation before confirmation, the row-level lock and settlement check abort the transaction with an error message; retrying with the same `requestKey` replays the recorded result idempotently through `f_cmd_begin`/`f_cmd_finish`.

### Acceptance checks

- Council Executive and Operations officers can record full cash payments for complete obligations from a single semester and immediately see the verified payment result and updated ledger.
- Partial amounts and cross-semester obligation selections are prevented in both the UI and server/database validation.
- Officers cannot record cash payments for their own student account (blocked in the UI, server action, and database RPC).
- Council Representatives and non-Council roles cannot access the cash recording workflow or invoke the server action.
- Recording cash settles the selected obligations immediately, updates payable and settled totals, and creates a `payment_verified` in-app notification for the student.

## Endorse students for merit (Council)

- **Author:** Andrei Catigan
- **Actors:** Council Executive, Council Operations.
- **Starts at:** Council workspace > Merit endorsements and Council demerits (`/council/merit-endorsements-and-council-demerits`) or a student's row/details on the Students page (`/council`); user must hold an active Council Executive or Operations role.
- **References:** FL-031; Schema section 8.3 (`merit_endorsements`), Schema section 8.4 (`merits`), Schema section 12.1 (`notifications`).

### Main flow

1. The Council Executive or Operations officer navigates to Merit endorsements and Council demerits in the Council workspace, or clicks "Endorse for merit" in a student's row or details on the Students page.
2. The system verifies Council Executive or Operations access and shows the Council disciplinary ledger for the selected semester. If the selected semester is the current semester, the "Endorse for merit" action is active; for historical semesters, it remains visible as disabled with an explanatory tooltip.
3. The officer chooses "Endorse for merit". The in-page endorsement flow (`?endorse`) opens on the Students step, with the student already selected when deep-linked from directory rows or details.
4. **Students:** the officer searches the current semester roster (`florence_roster`, excluding the officer's own student profile and archived students) and selects one or more candidate students.
5. **Details:** the officer selects an assigned reviewer from the list of active Academic and Clinical Instructors (`florence_instructor_choices`), enters whole-day requested units (1 to 7, defaulting to 1), and enters the basis / justification (at least 3 characters). An informational callout clarifies that endorsements create pending recommendations awaiting instructor decision.
6. **Review:** the page summarizes the recipient count, total requested units, assigned reviewer name and role, justification, and pending status. The officer confirms with a button naming the recipient count (for example, "Submit endorsement for 2 students").
7. The system validates the input server-side, checks that the actor is not among the recipients, and runs `endorse_merit` once per student through the command client. Each recipient carries an independent client-generated request key created when the student was picked.
8. The database inserts a row with `status = 'pending'`, `requested_days = p_days`, `assigned_instructor_id = p_instructor`, and `submitted_by = p_actor` into `public.merit_endorsements` for each student.
9. The result page lists the students successfully endorsed and any that failed, with the specific reason. The ledger page is revalidated, and navigating back returns to the Merit Endorsements tab (`?tab=endorsements`).

### System involvement

- Table `merit_endorsements`: inserts rows with `status = 'pending'`, `requested_days`, `description`, `assigned_instructor_id`, `submitted_by = actor.profile.id`, and `semester_id = current_semester`.
- Function `florence_instructor_choices`: retrieves active, Auth-linked Academic and Clinical Instructors without exposing arbitrary profile records.
- Procedure `endorse_merit`: enforces Council access (`f_cmd_council`), active instructor assignment (`f_cmd_instructor`), non-self endorsement (`p_student <> p_actor`), positive whole-day units, active semester enrollment, and command-level idempotency (`f_cmd_begin`/`f_cmd_finish`). No student notification is dispatched on submission; notifications occur upon instructor approval in FL-032.
- Server action `submitMeritEndorsementsAction`: checks Council Executive/Operations access via `requireWorkspace("council")`, rejects self-endorsement and archived recipients server-side, runs each recipient in an isolated `try...catch`, and revalidates paths.

### Outcome

Submitted merit endorsements appear in `public.merit_endorsements` with `status = 'pending'` and show under the Merit Endorsements tab in the Council disciplinary view. They become visible to the assigned instructor for decision in FL-032 / T-044.

### Important alternatives

- **Historical semester:** "Endorse for merit" is rendered as disabled with a tooltip explaining that endorsements can only be submitted for the active semester context.
- **Self-endorsement prevention:** the Council officer is excluded from the student picker, the directory row hides the button on their own row, and the server action and `endorse_merit` RPC strictly reject `p_student = p_actor`.
- **Some students fail:** endorsements already submitted remain recorded. The result page names each failed student and the reason, and the officer can retry or start over without duplicating recorded entries. Details lock after an attempt to prevent request key parameter drift.
- **Connection drop or double-click:** each student's request key is bound to the submission payload, so replaying through `f_cmd_begin` returns the existing result instead of creating duplicates.

### Acceptance checks

- Only Council Executive and Operations officers can submit merit endorsements; Council Representatives and non-Council actors are denied.
- Active Academic and Clinical Instructors populate the reviewer selector via `florence_instructor_choices`.
- Self-endorsement is prevented at all layers (candidate picker, directory rows, server action, and RPC).
- Requested units are whole days from 1 to 7 per student, enforced in the form and the server action.
- Submitted endorsements enter `status = 'pending'` without triggering student notifications prematurely.
- The 4-step wizard runs in-page within `WorkspaceShell` under `?endorse`, preserving `?tab=endorsements` upon completion with zero layout shifts.
- Roster table and student detail dialog in `/council` provide contextual "Endorse for merit" triggers that collapse to icon-only on mobile.

## Verify or reject student transfer submission

- **Author:** Reipoh Gabriel Arradaza
- **Actors:** Council Executive, Council Operations, Student (beneficiary).
- **Starts at:** Council workspace > Payments (`/council/payments`), either from the semester's "Transfers awaiting review" queue or inside a selected student's ledger; user must hold an active Council Executive or Operations role.
- **References:** FL-025, FL-022, FL-023, FL-044; database schema (`docs/database/schema.dbml`: `payments`, `payment_items`, `payment_receipts`, `payment_refunds`, `obligations`, `notifications`).

### Main flow

1. The Council Executive or Operations officer opens Payments in the Council workspace, views the "Transfers awaiting review" queue (or opens an individual student's ledger where their pending transfers appear at the top), and clicks "Review" on a pending transfer submission.
2. The system opens the review dialog showing the student's name and university ID, the destination account snapshot, reference number, submission date, itemized covered obligations, total amount, and a short-lived signed preview of the uploaded receipt proof image.
3. The officer checks the actual receipt of funds against the destination account statement and selects one of four decision modes:
   - **Verify (`received`):** confirms the money was received and enters the actual receipt date and time (`Asia/Manila`, not in the future).
   - **Reject — no money received (`no_receipt`):** enters the rejection reason when no funds arrived.
   - **Reject — duplicate of a recorded transfer (`duplicate`):** selects the student's existing authoritative receipt for that transfer and enters the reason, counting the actual transfer only once without creating a second receipt or refund.
   - **Reject — received and returned externally (`returned`):** enters the actual receipt timestamp, the external refund timestamp (`refunded_at >= received_at`, not in the future), and the reason when an extra transfer was actually received and returned outside the platform.
4. The officer checks the operator attestation confirming they verified the actual receipt or external return of funds and submits the decision.
5. The system validates the mode-specific input server-side and executes the atomic `verify_payment` RPC with a generated idempotency request key (`requestKey`).
6. In one transaction, the database locks the pending transfer and its covered obligations, creates or links the `payment_receipts` row (and inserts a `payment_refunds` row when mode is `returned`), updates the `payments` row to `verified` or `rejected` with the deciding officer and timestamp, and inserts a `payment_verified` or `payment_rejected` in-app notification for the student.

### System involvement

- Table `payments`: transitions a current pending transfer (`method = 'transfer'`, `status = 'pending'`, `record_status = 'current'`) to `verified` (`is_receipt_record = true`) or `rejected` (`is_receipt_record = true` only for `returned`; `false` for `no_receipt` and `duplicate`), recording `receipt_id`, `decided_by`, `decided_at`, and `decision_reason` under `f_access_private.payment_guard`.
- Table `payment_receipts`: inserts a new receipt record (`request_key`, `received_at`, `recognized_by = actor`) for `received` and `returned` modes, or locks and links `p_existing_receipt` for `duplicate` mode.
- Table `payment_refunds`: inserts a refund record (`receipt_id`, `payment_id`, `amount`, `reason`, `recorded_by`, `refunded_at`) when `p_mode = 'returned'`, retaining both the gross receipt and refund history while keeping the submission rejected.
- Table `notifications`: atomically inserts an in-app notification (`payment_verified` or `payment_rejected`) for the student via `f_cmd_notice`.
- Procedure `verify_payment`: enforces Executive or Operations authority (`f_cmd_council`), self-decision prohibition (`p.student_id <> p_actor`), operator fact confirmation (`p_facts_confirmed = true`), mode-specific timestamp and receipt constraints, obligation payable/settlement checks (`f_cmd_check_items`), same-student duplicate receipt ownership, and request-level idempotency (`f_cmd_begin`/`f_cmd_finish`).

### Outcome

When verified, the transfer receives a stable receipt, the covered obligations become settled, and the student's outstanding payable balance decreases. When rejected, the submission never counts as settled revenue, its covered obligations remain payable (unless already settled by another payment), any actual extra transfer that was returned is retained in receipt and refund records, and the student receives an in-app notification linking to `/student/fees-and-fines`.

### Important alternatives

- **Self-Decision Blocked:** If an Executive or Operations officer has a pending transfer on their own student account, the review queue displays a "Your submission" badge instead of a "Review" button, and both `decideTransfer` and `verify_payment` (plus the `payment_guard` trigger) reject self-verification or self-rejection.
- **Obligations Already Settled or Waived:** If one of the transfer's obligations was settled by another payment or waived while the transfer was pending (cash and waivers are refused for obligations on a pending transfer, so this only arises from earlier data), `verify_payment` blocks verification (`received`); the officer must reject the transfer (`duplicate`, `no_receipt`, or `returned` according to actual money movement).
- **Duplicate Mode Without Existing Receipt:** If the student has no authoritative receipt in the semester, the "duplicate" option is disabled in the dialog, and the RPC rejects missing or cross-student receipt links.
- **Concurrent Decision or Retry:** Locking the `payments` row with `FOR UPDATE` ensures only one officer can decide a pending transfer; a second officer receives an "already decided" message. Retrying an unchanged submission reuses the locked `requestKey` and replays the original result via `f_cmd_begin`/`f_cmd_finish`.

### Acceptance checks

- Council Executive and Operations officers can review pending transfer submissions from `/council/payments` (both in the semester queue and inside a student's ledger) and inspect the private proof image via a short-lived signed URL.
- Officers cannot verify or reject their own transfer submissions (blocked in the UI, server action, RPC, and trigger).
- All four decision modes (`received`, `no_receipt`, `duplicate`, `returned`) enforce operator confirmation and their required timestamps, reasons, and receipt selections.
- Rejected transfers (`no_receipt`, `duplicate`, `returned`) never count toward settled revenue; `duplicate` creates no second receipt or refund, and `returned` retains both the receipt and refund record.
- Verifying or rejecting a transfer immediately creates a `payment_verified` or `payment_rejected` in-app notification for the student and refreshes the Council and Student financial views.

## Waive unpaid student obligation

- **Author:** Reipoh Gabriel Arradaza
- **Actors:** Council Executive, Council Operations, Student (beneficiary).
- **Starts at:** Council workspace > Payments (`/council/payments`), inside a selected student's ledger under the "Obligations & Dues" tab; user must hold an active Council Executive or Operations role.
- **References:** FL-026, FL-021, FL-022, FL-023; database schema (`docs/database/schema.dbml`: `obligations`, `payments`, `payment_items`).

### Main flow

1. The Council Executive or Operations officer opens Payments in the Council workspace, selects the "Student Financial Accounts & Payments" tab, and clicks "View" on a student to open their individual financial ledger.
2. In the "Obligations & Dues" tab, the officer locates an `unpaid` obligation and clicks "Waive" in the row's Details column.
3. The system opens the "Waive unpaid obligation" confirmation dialog displaying the student's name and university ID, the obligation description, category (`Fee` or `Fine`), academic term, and full amount to waive.
4. The officer enters an attributable reason for the waiver or obligation cancellation (1–500 characters) and submits the waiver.
5. The system validates the input server-side, verifies Council Executive or Operations authority, and calls the `waive_obligation` RPC with a client-generated idempotency request key (`requestKey`).
6. In one transaction, the database locks the obligation row, verifies it belongs to another student, remains unsettled and non-waived, and is not on a current pending transfer, records `waived_at = now()`, `waived_by = actor`, and `waiver_reason`, and creates an `obligation_waived` in-app notification for the student.
7. The dialog confirms that the obligation has been waived and removed from the student's payable balance; the ledger refreshes, changing the row's standing to "Waived" with a "Waiver Info" audit button.

### System involvement

- Table `obligations`: updates an unsettled, non-waived row with `waived_at = now()`, `waived_by = actor`, and `waiver_reason = reason` under `f_access_private.obligation_guard` and `f_access_private.obligation_settled_check` (which ensures a waived obligation is never simultaneously settled by a verified current payment).
- Procedure `waive_obligation`: enforces Executive or Operations authority (`f_cmd_council`), row-level obligation locking (`f_cmd_lock_obligations`), self-waiver prohibition (`o.student_id <> p_actor`), unsettled and non-waived precondition (`not f_cmd_settled(o.id) and o.waived_at is null`), no current pending transfer on the obligation, the `obligation_waived` student notice (`f_cmd_notice`), non-blank reason validation, and request-level idempotency (`f_cmd_begin`/`f_cmd_finish`).
- Server action `waiveObligation`: enforces `assertAuthorizedCouncilManager()`, validates input with `waiveObligationSchema`, sanitizes database errors, and revalidates `/council/payments`, `/council/clearance`, `/student/fees-and-fines`, and `/student/notifications`. Self-waiver is checked against the obligation's real owner in the RPC.

### Outcome

The obligation's standing becomes `waived`, reducing what the student owes (`totalOutstandingPayable` and `currentSemesterPayable` or `priorSemestersOverduePayable`) and increasing `totalWaivedAmount` without altering any money already received. Both Council officers and the recipient student can inspect the waiver date and documented reason via the "Waiver Info" dialog. Because waiver also covers the agreed obligation cancellation use case, no separate cancellation or deletion action exists.

### Important alternatives

- **Self-Waiver Blocked:** When a Council Executive or Operations officer inspects their own student financial account, a self-restriction notice is shown, no "Waive" button is shown on their own obligations, and the `waive_obligation` RPC (plus `obligation_guard`) rejects `student_id = actor`.
- **Settled Obligations Protected:** Obligations already settled by a verified current cash or transfer payment display the "Settled" badge with no "Waive" action, and `waive_obligation` / `obligation_settled_check` reject waiving settled debt.
- **Obligation Included on a Pending Transfer:** The obligation cannot be waived while a current transfer that includes it awaits review: the row shows "Transfer pending · Decide the transfer first" instead of "Waive", and `waive_obligation` rejects it (`"Obligation has a pending transfer"`). Waiving it would make `verify_payment` reject the whole transfer, including its other items. The officer verifies or rejects the transfer first; if it is rejected, the obligation becomes `unpaid` and can then be waived.
- **Concurrent Settlement or Retry:** Locking the obligation row prevents concurrent settlement and waiver; if another officer already waived or settled the row, the action returns a clear status message. Retrying an unchanged request reuses the locked `requestKey` and replays the original result via `f_cmd_begin`/`f_cmd_finish`.

### Acceptance checks

- Council Executive and Operations officers can waive unpaid fee and fine obligations (including obligations from prior terms), but not obligations on a transfer awaiting review, with a required attributable reason.
- Council Representatives, Faculty, Platform Admins, and Students cannot invoke the waiver workflow or server action.
- Officers cannot waive obligations on their own student account (enforced in the UI, RPC, and database trigger).
- Settled obligations cannot be waived; waivers only change what is owed, never money already received.
- Waived obligations immediately update payable and waived summary totals and expose their recorded waiver timestamp and reason in both the Council and Student workspaces.
- Each waiver creates one `obligation_waived` notification for the student, linking to Fees and Fines.

## Record completed payment refund

- **Author:** Reipoh Gabriel Arradaza
- **Actors:** Council Executive, Council Operations, Student (beneficiary).
- **Starts at:** Council workspace > Payments (`/council/payments`), inside a selected student's ledger under the "Payment History" tab; user must hold an active Council Executive or Operations role.
- **References:** FL-027, FL-022, FL-026, FL-044; database schema (`docs/database/schema.dbml`: `payment_receipts`, `payments`, `payment_refunds`, `obligations`, `notifications`).

### Main flow

1. The Council Executive or Operations officer opens Payments in the Council workspace, selects the "Student Financial Accounts & Payments" tab, opens a student's financial ledger, and switches to the "Payment History" tab.
2. On a current, verified, unrefunded payment receipt row, the officer clicks "Refund".
3. The system opens the "Record completed refund" dialog showing the student's name and university ID, payment method, destination/reference, original receipt date (`Asia/Manila`), academic term, covered obligations, and full refund amount.
4. The officer enters the actual refund date and time (`Asia/Manila`, bounded between the payment's `received_at` and now), enters a required reason (1–500 characters), checks the attestation confirming that the full amount has already been returned outside Florence, and submits.
5. The system validates the input server-side, verifies Council Executive or Operations authority and non-self ownership, and calls the `record_refund` RPC with a client-generated idempotency request key (`requestKey`).
6. In one transaction, the database locks the request, receipt, current receipt-record payment, and covered obligations in deterministic order, verifies the payment is verified and unrefunded, inserts a full-amount row into `payment_refunds` without altering `payments.status` or waiving any obligation, and creates a `payment_refunded` in-app notification for the student.
7. The dialog confirms the refund; the ledger refreshes so the payment row displays the "Refunded" badge with its refund date and reason, the summary cards show Net Received alongside retained Gross received and Refunds totals, and active covered obligations return to "Unpaid".

### System involvement

- Table `payment_refunds`: inserts one immutable full-amount refund row per `receipt_id` (`UNIQUE (receipt_id)`) attributed to `recorded_by = actor` with `refunded_at` and trimmed `reason`. Original `payments` and `payment_receipts` history is never overwritten or deleted.
- Procedure `record_refund`: enforces Executive or Operations authority (`f_cmd_council`), trimmed 1–500 character reason, non-future `refunded_at >= payment_receipts.received_at`, `facts_confirmed = true`, self-refund prohibition (`p.student_id <> p_actor`), verified current receipt-record status, receipt refund uniqueness, deterministic lock ordering (`request -> receipt -> payment -> sorted obligations`), request-level idempotency (`f_cmd_begin`/`f_cmd_finish`), and atomic `payment_refunded` notice dispatch (`f_cmd_notice`).
- Server action `recordRefund`: enforces `assertAuthorizedCouncilManager()`, validates input with `recordRefundSchema`, performs an early RLS-scoped owner check (`canRecordRefundForStudent`), sanitizes database errors (`sanitizeRecordRefundError`), and revalidates `/council/payments`, `/council/clearance`, `/student/fees-and-fines`, and `/student/notifications`.
- Shared calculations (`calculatePaymentMoneyTotals`, `calculateStudentFinancialSummary`, `determineObligationStatus`): retain gross received, refunds, and net received totals using integer cents while excluding refunded receipts from obligation settlement.

### Outcome

The student's account and the Council ledger retain full gross received, refund, and net totals alongside the original verified payment record. Active obligations covered by the refunded payment become `unpaid` (payable again) and re-enter outstanding payable or prior-term carryover balances; obligations that were separately waived remain `waived`. Removing debt still requires a separate obligation waiver (FL-026). The student receives a `payment_refunded` notification linking to `/student/fees-and-fines`.

### Important alternatives

- **Self-Refund Blocked:** When a Council Executive or Operations officer views their own student financial account, no "Refund" button is shown, a self-restriction notice is displayed, and both `recordRefund` and `record_refund` reject `student_id = actor`.
- **Non-Verified, Superseded, or Already-Refunded Payments:** Pending, rejected, superseded, and already-refunded payments do not offer a "Refund" button, and `record_refund` enforces verified current receipt status and single-refund uniqueness (`Receipt already refunded`).
- **Invalid Chronology or Future Time:** Entering a refund timestamp earlier than `payment_receipts.received_at` or in the future is rejected both in the dialog and in `record_refund`.
- **Retry Safety:** Retrying an unchanged refund submission reuses `requestKey` and replays the original `{ refund_id, receipt_id, amount }` without creating duplicate refund rows or notifications; editing any field or receiving a rolled-back validation/state error rotates the key.

### Acceptance checks

- Council Executive and Operations officers can record a completed full-payment refund on another student's verified payment with an actual refund time, reason, and external-return confirmation.
- Council Representatives, Faculty, Platform Admins, and Students cannot invoke the refund workflow or server action; officers cannot refund their own payments.
- Gross received, refunds, and net totals are preserved in both Council and Student views without overwriting or deleting received-money history.
- Active obligations covered by the refunded payment become payable again (`unpaid`) and are not automatically waived; already-waived obligations remain `waived`.
- Each recorded refund creates one `payment_refunded` in-app notification for the student linking to `/student/fees-and-fines`, and retrying with the same `requestKey` is idempotent while a second refund with a new key is rejected.

## Apply student merits to offset demerit sanctions

- **Author:** Andrei Catigan
- **Actors:** Student (primary).
- **Starts at:** Student workspace > Conduct (`/student/merits-demerits-and-services`); user must have an active student profile, at least one unexpired unapplied merit, and outstanding active demerit debt (balances are cumulative across semesters), while viewing the current semester.
- **References:** FL-036, FL-029; database schema (`docs/database/schema.dbml`: `merits`, `merit_applications`, `demerits`, `service_credits`).

### Main flow

1. The student navigates to Conduct in the Student workspace (`/student/merits-demerits-and-services`).
2. The system checks student workspace access and presents the authoritative disciplinary balance cards (Office Duty, Clinical (RLE) Duty, Available Merits, and Overall Standing) along with the tabulated records for the selected semester. If the student has at least 1 available merit, active demerit debt, and is viewing the institutionally current semester, the "Apply merits" action is enabled in the header (otherwise the reason is shown beneath it) and contextual "Apply merits →" links appear on buckets with outstanding sanctions.
3. The student triggers the application flow via the header button (opening `?apply`) or a balance card link (opening `?apply&bucket=office` or `?apply&bucket=rle`).
4. **Step 1 (Configure):** The student selects the duty bucket to offset (Office Duty or Clinical/RLE Duty). Buckets with zero debt are disabled with clear feedback. The student enters whole-day units to apply or clicks "Apply max", dynamically bounded by `Math.min(availableMerits.length, bucketDebt)`. The student clicks "Continue to review".
5. **Step 2 (Review):** The system displays a side-by-side Current vs. Projected balance breakdown across the selected bucket, available merits, and overall standing. An alert explicitly highlights that merit applications are permanent and cannot be undone or transferred. The student reviews a live earliest-expiring (FIFO) preview showing the exact merit units that will be consumed (description, award date, and expiry date).
6. The student clicks "Confirm & apply". The system sets an idempotency lock on client inputs and invokes `applyMeritsAction` with a unique request key (`requestKey`).
7. The database executes the atomic `apply_merits` command. In a single transaction, it takes advisory locks on both of the student's bucket balances, row-locks the merits it will consume, verifies positive whole-day units and sufficient unexpired merits, validates that the election does not exceed the outstanding bucket balance, identifies earliest-expiring units (`expires_on ASC, id ASC`), and inserts matching consumption rows into `public.merit_applications` sharing a unique `application_group_id`.
8. The server action revalidates affected paths (`/student/merits-demerits-and-services`, `/student`, and `/student/clearance`) and redirects (replacing the wizard history entry) to `/student/merits-demerits-and-services?applied=<applicationGroupId>`.
9. The system renders the completion card summarizing applied units, target bucket badge, reference group ID, and applied timestamp formatted in Philippine Standard Time (`Asia/Manila`), alongside the current balances. Clicking "Return to conduct ledger" returns to `/student/merits-demerits-and-services?tab=merits`, where consumed merit units now reflect their applied bucket badge.

### System involvement

- Table `merit_applications`: inserts consumption records linking each individual `merit_id` to the student, target `bucket`, `applied_at` timestamp, and shared `application_group_id`.
- Table `merits`: units are evaluated via `evaluateMeritState` and `getAvailableMeritsFifo` against active applications. Consumed units transition from available to applied, displaying `Applied (Office)` or `Applied (RLE)` in ledger views.
- Table `demerits`: original demerit rows remain intact for immutable audit history; net duty balances are recalculated dynamically via authoritative command balance calculation (`activeDemerits - appliedMerits - activeServiceCredits`).
- Procedure `apply_merits`: enforces student actor authority (`f_cmd_actor`), positive whole-day election, bucket validity (`office` or `rle`), active outstanding balance constraints (`balance >= p_days`), unexpired unapplied merit availability (`available >= p_days`), strict FIFO consumption ordering (`expires_on ASC, id ASC`), and command idempotency (`f_cmd_begin`/`f_cmd_finish`).
- Server action `applyMeritsAction`: validates input with `applyMeritsSchema`, executes the command via the command client, revalidates paths, and triggers a clean Next.js router redirect to the URL-backed result state.

### Outcome

Applied merit units offset active demerit debt in the chosen bucket, immediately updating the student's cumulative Office or Clinical duty balance, clearance eligibility, and dashboard overview. Consumed merits cannot be applied again or transferred to another bucket, while original demerit entries remain permanently recorded for attribution.

### Important alternatives

- **Ineligible Cold Visit:** If a student attempts to navigate directly to `?apply` while having zero available merits, zero demerit debt, or viewing a past semester, the server immediately redirects back to the base conduct ledger (`redirect(baseHref)`), preventing wizard flash or broken states.
- **Malformed or Unauthorized Result ID:** If `?applied=<uuid>` contains an invalid UUID or an ID not belonging to the student, `getMyMeritApplicationGroup` safely returns `null` and the server redirects to the base ledger URL without database errors.
- **Connection Interruption or Double-Click:** Client-side lock (`locked = true`) prevents multiple submissions. If a network error occurs, the exact same `requestKey` is retained so that clicking "Retry application" replays idempotently without double-spending merits. If the command is rejected (for example, the balance changed after the page loaded), the wizard refreshes the figures and returns to Configure with a new request key. Choosing "Start over" clears the lock, regenerates a fresh UUID, and resets the form.
- **Exit Hygiene:** The student can cancel or exit the wizard at any time via "← Back to conduct ledger" or "Cancel", which use direct Next.js links to return cleanly to the ledger without triggering rendering hangs.

### Acceptance checks

- Only authenticated students can apply merits; non-student workspaces are denied.
- Merits can only be applied toward buckets with active positive demerit debt (zero-debt buckets are disabled).
- Application amount is whole days, strictly bounded by the minimum of available unexpired merits and the selected bucket's outstanding debt.
- Merit units are consumed in strict earliest-expiring (FIFO) order (`expires_on ASC, id ASC`), with a live preview shown on the review step.
- Application is atomic, permanent, and idempotent; retrying an interrupted request does not duplicate applications.
- Submissions revalidate the student conduct ledger, student dashboard, and student clearance views immediately.
- Consumed merits display their applied bucket badge (`Applied (Office)` or `Applied (RLE)`) in the conduct ledger's Merits tab.
- The wizard and result card render responsively on mobile (390px viewport) with zero horizontal overflow.

## Create service session and record attendance

- **Author:** Andrei Catigan
- **Actors:** Academic Instructor (`office`), Clinical Instructor (`rle`), dual-role Instructor (holding both Academic Instructor and Clinical Instructor roles); Academic Coordinator and RLE Coordinator (viewing permitted semester sessions in read-only mode for sessions they did not create).
- **Starts at:** Faculty workspace > Services (`/faculty/service-sessions`); user must hold an active Academic Instructor or Clinical Instructor role, or an Academic Coordinator or RLE Coordinator role, while viewing the current semester to create sessions or edit attendance.
- **References:** FL-037; database schema (`docs/database/schema.dbml`: `service_sessions`, `service_participants`, `enrollments`, `role_assignments`).

### Main flow

1. The instructor navigates to Services in the Faculty workspace (`/faculty/service-sessions`).
2. The system checks Faculty workspace access, confirms the user holds instructor privileges, and presents the session list for the selected semester. If viewing the institutionally active current semester and holding an Academic Instructor or Clinical Instructor role, the "Create service session" action is enabled in the header (otherwise an accessible explanation is displayed beneath the disabled button via `aria-describedby`).
3. The instructor clicks "Create service session" (`?create`). The in-page creation flow renders:
   - **Bucket Selection:** If the instructor has a single track, the bucket (`office` for Academic Instructor, `rle` for Clinical Instructor) is pre-assigned with a read-only badge indicator. If dual-role, an explicit radio selector allows picking between Office Duty and Clinical (RLE) Duty.
   - **Schedule & Windows:** The instructor selects a one-day duty date (`Asia/Manila`, defaulting to today in PST, bounded by semester dates if available), scheduled start time (default `08:00`), scheduled end time (default `17:00`), optional location (up to 255 chars), lateness grace period in minutes (default `15`, integer `0..2147483647`), and check-in/check-out window times (default check-in `07:30 – 09:00`, check-out `16:30 – 17:30`). Helper text and client validation enforce `Asia/Manila` (`+08:00`) same-day duty constraints (`scheduled_end > scheduled_start`, `time_in_until >= time_in_from`, and `time_out_until >= time_out_from`).
4. The instructor confirms with "Create service session". The system sets an idempotency lock, constructs full `Asia/Manila` (`+08:00`) ISO strings, and invokes `createServiceSessionAction` with a unique request key (`requestKey`).
5. The database executes the atomic `create_service_session` command via the service-role command client: verifies active instructor assignment for the chosen bucket (`f_cmd_instructor`), retrieves institutional timezone (`f_cmd_timezone`), verifies the duty date falls within the current active semester (`f_cmd_current_semester`), enforces same-day schedule and window bounds (`p_end > p_start`, `p_time_in_until >= p_time_in_from`, `p_time_out_until >= p_time_out_from`), and guarantees idempotency (`f_cmd_begin`/`f_cmd_finish`). It inserts the new session into `public.service_sessions` with `ended_at IS NULL` (open session).
6. Upon successful creation, the server action revalidates `/faculty/service-sessions` and redirects via `RedirectType.replace` to `/faculty/service-sessions?session=<sessionId>`, opening the session detail view.
7. **Session Detail & Adding Participants:** The instructor views session metadata (duty date, bucket badge, status badge, scheduled hours, location, creator) and summary metric cards (Total Participants, Completed, In Progress / Pending, Missing Timestamps). The list and detail headers include a `RefreshButton` with the render time, because changes by other people may not show for up to 30 seconds. The instructor clicks "Add participants", opening `AddParticipantsDialog`.
8. The instructor searches enrolled, non-archived students for the active semester (`getAvailableServiceStudents`), filters by year level, selects candidate students, and clicks "Add selected (N)". Only students still in the available list are sent, and closing the dialog clears the selection, so an existing participant is never re-sent and overwritten. If the student list fails to load, the dialog says so instead of reporting that everyone is assigned. The system invokes `setServiceParticipantsAction` with `requestKey` and an upsert payload, recording newly selected students in `public.service_participants` with `time_in = null`, `time_out = null`, and `excluded_at = null`. The dialog resets and the participant table updates immediately.
9. **Recording & Correcting Attendance:** The participant table has a fixed height with a sticky header and a search box that filters rows by name or student number (edits on hidden rows are kept and saved). The instructor enters or adjusts `Time-In` and `Time-Out` using native 128px time inputs (`w-32 tabular-nums`), or stamps the live Philippine Standard Time via the "Now" button (`Asia/Manila` `+08:00`). Live client evaluations (`evaluateAttendanceStatus`) immediately reflect status badges:
   - `Not Recorded` (both timestamps null)
   - `In Progress` (time-in recorded, time-out null, before check-out window expires)
   - `On Time` (time-in recorded at or before `scheduled_start + late_after_minutes` and valid time-out recorded)
   - `Late` (time-in recorded after grace threshold within check-in window and valid time-out recorded)
   - `Missing Time-Out` (time-in recorded, time-out null after check-out window ends)
   - `Missing Time-In` (invalid state where time-out is present without time-in)
   - `Excluded` (participant excluded from credit)
10. The instructor can also exclude a student before session finalization by clicking "Exclude" (or "Re-include" to restore). Exclusion changes only `excluded_at`; recorded times are kept, so re-including restores the attendance. Time-in and time-out stamped in the same minute are rejected with a message asking for at least one minute between them. A sticky save bar tracks dirty changes ("N unsaved participant changes"). Clicking "Save attendance (N)" pre-validates window and non-future bounds client-side (`isTimeWithinWindow`), then invokes `setServiceParticipantsAction` with an upsert payload of participants and timestamps.
11. The database executes `set_service_participants`: verifies instructor authority (`f_cmd_instructor`), acquires a row-level lock on the session parent (`SELECT ... FOR UPDATE`), verifies session ownership (`s.created_by = p_actor`), verifies the session is open (`s.ended_at IS NULL`), validates each student's current enrollment (`f_cmd_student`), forbids self-attendance (`x.student_id <> p_actor`), verifies timestamps are within scheduled windows and not in the future (`time_in <= clock_timestamp()`, `time_out <= clock_timestamp()`), and upserts attendance records. The page revalidates and reflects persisted timestamps with zero data loss.

### System involvement

- Table `service_sessions`: inserts records (`id`, `semester_id`, `created_by`, `bucket`, `duty_on`, `scheduled_start`, `scheduled_end`, `location`, `late_after_minutes`, `time_in_from`, `time_in_until`, `time_out_from`, `time_out_until`, with `ended_at IS NULL` denoting an open, editable session). Note that `service_sessions` has no `status` column; open (`ended_at IS NULL`) versus ended (`ended_at IS NOT NULL`) lifecycle state is derived from `ended_at`.
- Table `service_participants`: upserts participant attendance rows (`session_id`, `student_id`, `time_in`, `time_out`, `excluded_at`). Records are never physically deleted on participant updates; exclusion and re-inclusion are tracked via `excluded_at`.
- Table `enrollments`: ensures only non-archived students actively enrolled in the current semester can be added to the session roster (`getAvailableServiceStudents`).
- Table `role_assignments`: verifies that the actor holds the appropriate active instructor assignment (`Academic Instructor` for `office`, `Clinical Instructor` for `rle`) under `f_cmd_instructor`.
- Function `florence_discipline_names`: resolves peer instructor/creator display names under `profiles` RLS (while student candidate and roster names come from `getRoster`).
- Procedure `create_service_session`: enforces faculty actor authority and bucket alignment (`f_cmd_instructor`), active current semester duty date (`f_cmd_current_semester`), valid single-calendar-day window sequence (`scheduled_end > scheduled_start`, `time_in_until >= time_in_from`, `time_out_until >= time_out_from`), and request-level idempotency (`f_cmd_begin`/`f_cmd_finish`).
- Procedure `set_service_participants`: enforces instructor authority (`f_cmd_instructor`), session ownership (`s.created_by = p_actor`), open session status (`s.ended_at IS NULL`), row-level locking on the parent session (`SELECT ... FOR UPDATE`), active semester enrollment per student (`f_cmd_student`), self-attendance prohibition (`x.student_id <> p_actor`), window inclusion (`time_in` within `[time_in_from, time_in_until]`, `time_out` within `[time_out_from, time_out_until]`), temporal sequence (`time_out > time_in`), non-future timestamp bounds (`<= clock_timestamp()`), and atomic upsert semantics without row deletion.
- Server actions `createServiceSessionAction` and `setServiceParticipantsAction`: validate input schemas (`createServiceSessionSchema`, `setServiceParticipantsSchema`), manage idempotency keys (retaining `requestKey` on retryable network errors while generating a fresh key on deterministic failures), execute database RPCs via privileged command client, and revalidate affected paths.

### Outcome

The instructor successfully creates a duty session and maintains an accurate, pre-validated participant roster with Philippine Standard Time check-in/check-out timestamps and pre-end exclusions. Live status summaries provide real-time visibility into attendance counts, preparing the session for eventual end/finalization in FL-038.

### Important alternatives

- **Cold-Visit & Ineligible Guards:** An invalid or unknown `semester` returns 404 from `WorkspaceShell` before any redirect runs. If a non-instructor visits `?create` or an instructor attempts to access `?create` in a past semester, the server immediately redirects back to the base list (`redirect(baseHref)`). Similarly, if `?session=<id>` is invalid, non-existent, or inaccessible, the server redirects back to the session list.
- **Read-Only / Coordinator Mode:** Academic Coordinators and RLE Coordinators (and instructors viewing historical semesters or sessions created by peers) can inspect session details and participant rosters in read-only mode; creation triggers, "Add participants", and attendance editing controls are omitted.
- **Pre-Validation of Future / Window Violations:** Client-side pre-validation catches timestamps that fall outside check-in/check-out windows or exist in the future relative to local clock time, surfacing clear inline feedback before submission. The database RPC strictly enforces `clock_timestamp()` checks to prevent future attendance recording.
- **Retry & Idempotency Key Hygiene:** On retryable network failures, the client retains the current `requestKey` so retry attempts do not duplicate actions. On deterministic validation failures or when restarting the flow, a fresh UUID is generated to prevent parameter drift.
- **Separation of Concerns (FL-038 & FL-039 Boundary):** Finalizing sessions to issue service credits (`end_service_session` / FL-038) and revoking service credits (`revoke_service_credit` / FL-039) are distinct operational workflows outside this journey. Open sessions (`ended_at IS NULL`) remain editable until finalized.

### Acceptance checks

- Academic Instructors can create `office` sessions, Clinical Instructors can create `rle` sessions, and dual-role instructors can select either bucket.
- Academic Coordinators, RLE Coordinators, and non-instructors cannot create service sessions or modify attendance; they can only inspect permitted semester sessions in read-only mode.
- Duty session schedules and check-in/check-out windows must be strictly on the same calendar day in `Asia/Manila` (`+08:00`) with valid bounds (`scheduled_end > scheduled_start`, `time_in_until >= time_in_from`, `time_out_until >= time_out_from`, and `late_after_minutes` between `0` and `2147483647`).
- Only students with active enrollments in the current semester can be added to session rosters.
- Adding participants uses upsert semantics and never deletes existing attendance records; pre-end exclusions and restorations toggle `excluded_at` via "Exclude" and "Re-include" without clearing recorded times.
- Participant attendance can be stamped via current time ("Now") or typed manually into 128px time inputs without AM/PM or icon truncation.
- Live attendance evaluations immediately compute and display the correct badge among all 7 possible states (`Not Recorded`, `In Progress`, `On Time`, `Late`, `Missing Time-In`, `Missing Time-Out`, `Excluded`).
- Attendance saves pre-validate time windows and non-future constraints before invoking the server action, preventing future timestamps from reaching the database.
- Idempotency keys (`requestKey`) are retained on retryable network errors and refreshed on deterministic rejections, preventing duplicate records or parameter drift.
- Past-semester views, ended sessions (`ended_at IS NOT NULL`), and cold-visits with invalid query parameters redirect or disable creation/editing gracefully.

## Log attendance with a selfie

- **Author:** Jamir
- **Actors:** Student (any enrolled student, including Council members as students).
- **Starts at:** Student workspace > Events (`/student/events`); a published event the student belongs to, with its time-in or time-out window open.
- **References:** FL-049, FL-015, FL-017; schema §6.5 (`event_attendance_claims`), §16.9, §5.1 (`files`).

### Main flow

1. While a window is open, the student's event row shows **Log time-in** (or **Log time-out** once time-in is recorded or awaiting verification).
2. The student opens it and reads the consent notice: purpose, who sees the photo, storage, deletion and the QR/manual alternative. Nothing else is enabled until they tick the agreement and continue.
3. The student types their student number (`XX-1-XXXXX`). The front camera starts; **Take photo** works only while exactly one face is in view. They can retake.
4. The student submits. The server checks the number against their own account, re-encodes the photo and records a pending claim at the database time.
5. The row shows the side as awaiting verification. After review it shows the recorded time, or the rejection reason.

### System involvement

- The browser captures an 800 px JPEG; `uploadFile` re-encodes it to WebP without metadata under purpose `attendance_selfie` (≤ 1 MB) with a server-generated key.
- `submit_attendance_claim` locks the event and checks publication, lock, window, participation, the typed number, consent, the photo's owner and any existing pending or verified claim for that side. It stores `submitted_at`, `consented_at` and `consent_version`; the typed number is not stored.
- Face detection runs only in the browser (self-hosted `@mediapipe/tasks-vision`); the server never relies on it.

### Outcome

The claim waits in the event's Council Verification tab. Attendance is recorded only if it is verified, at `submitted_at`.

### Important alternatives

- **Declined consent or no camera:** the student cancels, or sees a message to ask Council for QR or manual capture.
- **Wrong student number:** refused before the photo is stored.
- **Rejected claim:** the student gets an in-app notice and may submit again while the window is open.
- **Retry after a lost response:** the same request key returns the first claim; the extra photo is discarded.
- **Council records the side first (QR, manual or CSV):** the pending claim is superseded and its photo deleted.

### Acceptance checks

- The camera does not start before consent, and stops when the dialog closes, the photo is taken or the page is hidden.
- The shutter stays disabled with no face or with two faces.
- A claim outside the window, for a non-participant, with a wrong number, without consent or after locking is refused.
- A second pending claim for the same side is refused; a time-out claim needs a recorded or pending time-in.
- Still to verify on real devices (iOS Safari, Android Chrome): camera permission, face gate, poor signal and retry.

## Verify selfie attendance claims

- **Author:** Jamir
- **Actors:** Council Executive, Operations or Representative (never the claimant).
- **Starts at:** Council workspace > Events > an event > **Verification** tab. Representatives see it while capture is open; Executive and Operations until attendance locks.
- **References:** FL-050, FL-018, FL-044; schema §6.5, §16.1, §16.9.

### Main flow

1. The reviewer opens the Verification tab, labelled with the pending count. Claims are listed oldest first with name, student number, side and submission time.
2. The reviewer opens a claim. The photo loads through a short-lived link issued only while the claim is pending.
3. The reviewer verifies, or rejects with a reason (quick picks or free text).
4. The system records the decision and moves to the next claim. A verified claim records the side at `submitted_at`, method Selfie, with the reviewer as recorder. A rejected claim records nothing and notifies the student.
5. After the decision, the photo is deleted from storage and the deletion is recorded.

### System involvement

- `review_attendance_claim` locks the event, refuses self-review and already-reviewed claims, and verifies through the shared attendance helper, so a time-out cannot be verified before its time-in. Rejecting a time-in also rejects the student's pending time-out claim.
- Photo deletion runs after the transaction commits (`florence_undeleted_claim_photos`, `mark_claim_photo_deleted`). QR, manual and CSV capture and consequence generation run the same cleanup.
- Consequence generation is refused while any claim is pending; the Consequences tab shows the count and disables **Generate and lock**.

### Outcome

The claim leaves the queue. The student sees the recorded time, or the rejection reason and an in-app notice. No photo remains once its claim is decided or superseded.

### Important alternatives

- **Own claim:** shown as "Your claim" with no review button; the database refuses self-review.
- **Claim decided elsewhere first:** the decision is refused as already reviewed; refresh to see the current queue.
- **Photo no longer available:** the dialog says so and verification stays disabled.
- **Failed storage deletion:** `photo_deleted_at` stays empty and the next review, capture or generation for the event retries it.

### Acceptance checks

- Verify writes attendance at the submission time with method Selfie; reject writes none and sends one notice.
- No photo link is issued after a claim is reviewed or superseded.
- Generation is blocked while claims are pending and succeeds once they are reviewed.
- Still to verify in a production build: Back keeps the page, the tab survives in the URL, and the queue refreshes with **Refresh**.

## Confirm Faculty clearance

- **Author:** Israel
- **Actors:** Academic Coordinator (Academic clearance) or RLE Coordinator (RLE clearance).
- **Starts at:** Faculty workspace > Academic Clearance (`/faculty/academic-clearance`) or RLE Clearance (`/faculty/rle-clearance`), defaulting to the current semester; any listed semester can be selected.
- **References:** FL-041, FL-042, FL-029; schema §11.1 (`clearances`), `florence_bucket_balances`, `florence_clearance_names`.

### Main flow

1. The coordinator opens their clearance page. Summary cards show enrolled students, Council cleared, cleared and pending for the component, and students with debt in the matching bucket (Office for Academic, RLE for RLE).
2. Each row shows the student, year level and status, the bucket balance, and separate Academic and RLE statuses. A cleared status shows who confirmed it and when.
3. The coordinator may open the student's disciplinary ledger (merits, demerits, service credits) from the balance.
4. For a student with Council clearance in that semester, the coordinator selects **Grant clearance**, reviews the student, Council status and any outstanding balance, and confirms.
5. The row shows **Granted**; the clearance is permanent.

### System involvement

- Balances are cumulative across semesters and computed by `florence_bucket_balances` under the caller's RLS. Confirmer names come from `florence_clearance_names`; no university numbers are returned.
- `confirmFacultyClearanceAction` validates input, requires the matching Coordinator role and refuses self-clearance. `confirm_clearance` re-checks the role, enrollment and same-semester Council clearance under a per-student lock, and is idempotent per request key.
- The action revalidates the component's page. The page has **Refresh** because Council and other coordinators change clearances too.

### Outcome

A permanent Academic or RLE clearance for that student and semester, with the actual confirmer and time. Later balance changes do not reverse it.

### Important alternatives

- **No Council clearance yet:** the action shows **Needs Council** and is disabled; the database also refuses it.
- **Own student record:** shown as **Your record** and disabled; the database refuses self-clearance.
- **Outstanding balance:** shown as a warning in the dialog; it does not block confirmation.
- **Past semester:** allowed, like Council clearance, if the student was enrolled in it.
- **Retry after a lost response:** the same request key returns the first confirmation.

### Acceptance checks

- Only the matching coordinator can open each page and confirm; other faculty, Council and signed-out users are denied.
- Confirmation without same-semester Council clearance, or for oneself, is refused.
- Academic and RLE clearances do not depend on each other.
- Balances match the student's ledger for the bucket.
- Still to verify in a production build: Back keeps the page, and the confirmer name appears in the status tooltip.

## View student clearance results

- **Author:** Israel
- **Actors:** Nursing Student.
- **Starts at:** Student workspace > Clearance (`/student/clearance`), defaulting to the current semester (or latest enrolled term); any enrolled semester can be selected.
- **References:** FL-042; schema §11.1 (`clearances`), `florence_clearance_names`.

### Main flow

1. The student opens the Clearance page from the student navigation.
2. A hero progress banner displays the overall progress (e.g. "1 of 3 clearances confirmed" with a visual meter, or a green "Semester Clearance Complete" banner when all three are cleared).
3. Three component cards display the separate status for Council Clearance (prerequisite), Academic Clearance, and RLE Clearance.
4. For confirmed clearances, the card shows a green checkmark, the confirmation timestamp (Asia/Manila time), and the confirming officer or coordinator's display name.
5. For pending clearances, the card displays clear guidance and actionable deep links:
   - Council links to `/student/fees-and-fines` to review balances.
   - Academic and RLE link to `/student/merits-demerits-and-services` to review disciplinary records.
   - Each pending card states that outstanding balances are shown to the reviewer but do not automatically block clearance (FL-040, FL-041).
   - If Council clearance is pending, Academic and RLE cards explicitly state that Council clearance is required first.
6. A note on every semester states that a confirmation is permanent and is not a promise of a zero current balance.
7. The student may switch to any enrolled semester to review its clearance records.

### System involvement

- Reads `clearances` constrained by `student_id = me()` and the selected `semester_id`.
- Confirmer names are resolved via `florence_clearance_names` without exposing private profile fields.
- Only enrolled semesters can be selected; `WorkspaceShell` returns not-found for any other `semester` value.
- If confirmer names cannot be loaded, the page shows its error notice instead of cards without a confirmer.
- Clearance records are permanent; later fee or demerit balance changes do not alter historical clearance confirmations (FL-042).

### Outcome

The student has full transparency over their clearance progress, understands prerequisite sequencing, and has direct routes to review balances and disciplinary records.

### Important alternatives

- **No enrolled semester:** Displays a message that there are no clearance records to show.
- **Council prerequisite pending:** Academic and RLE cards explain that Council sign-off is required before coordinators can act.

### Acceptance checks

- Student sees only their own clearance records; unauthorized or unauthenticated users are gated.
- Cleared cards show exact confirmer display names and timestamps formatted in Asia/Manila time.
- Action buttons meet touch targets (minimum 44px on mobile) and navigate directly to the fees and disciplinary record pages.
- No card wording says balances must be paid before clearance, and a confirmed card says "Confirmed", not that requirements are fulfilled.

