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
- **Obligation With Pending Transfer:** Because a pending transfer submission does not settle debt (FL-023), an obligation on an unverified transfer remains selectable for cash collection; once settled by cash, verifying the duplicate transfer cannot double-settle the debt.
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
- **Obligations Already Settled or Waived:** If one of the transfer's obligations was settled by another payment (such as an in-person cash payment) or waived while the transfer was pending, `verify_payment` blocks verification (`received`); the officer must reject the transfer (`duplicate`, `no_receipt`, or `returned` according to actual money movement).
- **Duplicate Mode Without Existing Receipt:** If the student has no authoritative receipt in the semester, the "duplicate" option is disabled in the dialog, and the RPC rejects missing or cross-student receipt links.
- **Concurrent Decision or Retry:** Locking the `payments` row with `FOR UPDATE` ensures only one officer can decide a pending transfer; a second officer receives an "already decided" message. Retrying an unchanged submission reuses the locked `requestKey` and replays the original result via `f_cmd_begin`/`f_cmd_finish`.

### Acceptance checks

- Council Executive and Operations officers can review pending transfer submissions from `/council/payments` (both in the semester queue and inside a student's ledger) and inspect the private proof image via a short-lived signed URL.
- Officers cannot verify or reject their own transfer submissions (blocked in the UI, server action, RPC, and trigger).
- All four decision modes (`received`, `no_receipt`, `duplicate`, `returned`) enforce operator confirmation and their required timestamps, reasons, and receipt selections.
- Rejected transfers (`no_receipt`, `duplicate`, `returned`) never count toward settled revenue; `duplicate` creates no second receipt or refund, and `returned` retains both the receipt and refund record.
- Verifying or rejecting a transfer immediately creates a `payment_verified` or `payment_rejected` in-app notification for the student and refreshes the Council and Student financial views.
