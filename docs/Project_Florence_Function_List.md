# Project Florence — Lean Function List

**Version:** 0.6 · **Date:** 2026-11-07 · **Status:** Agreed V1 scope; implementation details noted below

## 1. Purpose and boundaries

This list defines the V1 product scope, roles, access and business rules. The [navigation map](Project_Florence_Navigation_Map.md) groups these capabilities without prescribing individual screens. Use short implementation tasks and acceptance checks rather than a separate comprehensive requirements document.

This is not a backlog, screen inventory, schema, estimate or claim of completed functionality. Descriptions state agreed behavior. Deferred details and options marked **Proposed** are not additional approved features. Section 6 summarizes decisions and remaining implementation details.

- Preserve function IDs `FL-001`–`FL-048` when reorganizing headings.
- A function may appear in several workspaces; it is defined once here. A row does not require its own screen, modal, table or API route.
- The [architecture](Florence_Architecture.md) and [design tokens](Florence_Design_Tokens.md) define technical and visual foundations, not additional features.
- The [academic policy extract](Academic_Policies_Pages_7-9_Excluding_Cheating.md) remains unchanged source material. Product choices do not amend institutional policy or prove institutional approval.
- This Markdown is the maintained function catalog.

## 2. Roles and access

A **role** determines permitted actions; a **position** is a descriptive Council label; an **account** is one person's login with only the permitted combinations below. Roles are fixed, not user-configurable permission sets.

### Role catalog

| User / assignment | Agreed scope |
|---|---|
| Student | Own profile, QR, events/attendance, disciplinary and financial records; submit payment proof, apply merits, answer event satisfaction form and generate own report. |
| Council Executive | Full Council functions, including non-Executive member management, payment-account management, identified event feedback/results and waiving Council-generated demerits. Full Council access is not platform administration or Faculty authority. |
| Council Operations | Council functions except member management, payment-account management and Council demerit waivers, which are reserved to Executives. Includes viewing identified event responses and summaries. Intended for Treasurer, Assistant Treasurer and Auditor. |
| Council Representative | View all events and record attendance across all events, not only assigned events. Only attendance-required student lookup; no general roster, finance, disciplinary reports, member management or event feedback/results access. |
| Academic Instructor | Give merits, approve assigned Council endorsements, log own Office demerits, waive own entries, and manage Office service sessions/credits. |
| Clinical Instructor | Equivalent instructor functions in RLE. Merit awards can ultimately offset either bucket. |
| Academic Coordinator | Added assignment on an Academic Instructor account: review student disciplinary history and confirm Academic clearance after Council clearance. No authority to waive another instructor's entries. |
| RLE Coordinator | Added assignment on a Clinical Instructor account: review history, record external CI merits/demerits, waive external demerits they entered and confirm RLE clearance after Council clearance. No authority to waive another instructor's entries merely because of coordinator status. |
| Platform Admin | Manage Faculty accounts/coordinator assignments, Council Executive access and the misconduct catalog. Catalog maintenance does not authorize issuing or waiving demerits. No automatic Council, financial or disciplinary decision authority. |

**Positions are labels; access uses fixed presets.** President, Vice President, Secretary and Assistant Secretary are intended Executive labels; Treasury/Auditor labels share the Operations preset. There is no per-member capability editor. Platform Admin alone provisions/removes Executive access. “Preset” means a fixed access category, not editable permissions. Council member management does not permit promotion to Executive. Executives may reassign existing members between Operations and Representative as responsibilities change. Promotions to or demotions from Executive require Platform Admin. Position-label edits alone never change access.

### Council positions and access

| Position label | Intended access role |
|---|---|
| President | Council Executive |
| Vice President | Council Executive |
| Secretary | Council Executive |
| Assistant Secretary | Council Executive |
| Treasurer | Council Operations |
| Assistant Treasurer | Council Operations |
| Auditor | Council Operations |
| Representative | Council Representative |

Maintain position and access together when responsibilities change, but editing the label alone never grants authority.

### Account combinations

```text
Student
└── Optional: one Council role
    ├── Council Executive
    ├── Council Operations
    └── Council Representative

Academic Instructor
└── Optional: Academic Coordinator

Clinical Instructor
└── Optional: RLE Coordinator

Platform Admin
└── Technical administration and misconduct catalog maintenance only
```

### Assignment rules

- One person uses one account; workspace switching changes presentation, not identity or permissions.
- A Council member retains Student access and holds at most one Council role at a time. Removing Council access preserves Student access and history.
- Academic Instructor and Clinical Instructor are mutually exclusive. Do not create duplicate accounts to bypass this restriction.
- Academic Coordinator requires Academic Instructor; RLE Coordinator requires Clinical Instructor. Coordinators retain their underlying instructor capabilities and cannot hold a mismatched coordinator assignment.
- Removing a coordinator assignment preserves the underlying instructor access. An instructor assignment cannot be removed while leaving its dependent coordinator assignment active.
- Faculty are not student identities in the current model. Platform Admin is not an implicit business-role superuser.
- No custom roles, per-account permission switches or unrestricted role-combination builder.
- Enforce assignment restrictions and action authorization server-side, not only through workspace menus.

### Who changes assignments?

| Change | Authorized actor |
|---|---|
| Add/remove Operations or Representative access | Council Executive |
| Reassign Operations ↔ Representative | Council Executive |
| Grant/remove Executive access, including promotion/demotion | Platform Admin |
| Add, edit or archive Faculty accounts | Platform Admin |
| Grant/remove matching coordinator assignments | Platform Admin |

### Visibility and self-benefit boundaries

**Visibility:** Council disciplinary views/reports contain Council-generated demerits and Council-origin merit endorsements/awards only. Representatives do not inherit those views. Instructors may see the student directory, but this does not establish a right to browse all Faculty history; directory access is limited to students' personal information, alongside the instructor's own activity, not other instructors' disciplinary records. Limited zero/nonzero balance inference from a Council waiver result is accepted. Coordinators review student disciplinary history, with the current semester as default.

**Self-benefit:** staff may not record their own attendance/cash payment, verify or correct their own payment, waive their own debt/demerit, clear themselves or endorse themselves for merit. Apply the same principle to recording their own refund. Student self-submission of transfer proof and self-application of merits are intentionally allowed. Enforce actor/beneficiary checks server-side using the linked identity, not browser-provided logger IDs.

## 3. Function catalog

### Access and personal account

| ID | Function | Users | Description / scope |
|---|---|---|---|
| FL-001 | Accept invitation and set password | Invited users | Receive an invitation email and establish a password for first access. Only a Pending, valid invitation can be accepted; Accepted, Expired or Cancelled invitations cannot be reused. Authorized provisioning users may cancel pending invitations within their existing provisioning scope. No public self-registration or shared temporary password. |
| FL-002 | Sign in and access permitted workspace | All account holders | Sign in with email/password and use only authorized Student, Council, Faculty or administration functions. One login supports the agreed additive assignments. |
| FL-003 | Recover or change password | Account holder | Recover a forgotten password through email and change the password while signed in. |
| FL-004 | View personal information | Account holder | View own account/profile information. Student view includes semester enrollment context. No general self-editing of protected identity details is implied. |
| FL-005 | Sign out | Account holder | End the authenticated session. |

### Student records, semester and user administration

| ID | Function | Users | Description / scope |
|---|---|---|---|
| FL-006 | Manage semesters | Executive / Operations | Create a semester and explicitly activate the current semester. Creation alone does not change record attribution. Existing records retain their original semester; new ordinary academic records use the active context. |
| FL-007 | Maintain student roster | Executive / Operations | Import a semester roster using a fixed CSV format, add students individually and edit details. Preview validation/conflicts before applying. Preserve identity continuity and prior record relationships. Year levels are 1–4; academic statuses are Regular/Irregular. |
| FL-008 | Invite roster students | Executive / Operations | Send individual or bulk invitations to new students and cancel pending student invitations when they should no longer be usable. Roster import and invitation delivery have separate outcomes; failed email delivery must not masquerade as failed roster creation. |
| FL-009 | Search and view student directory | Executive / Operations; instructors; coordinators | Find students and inspect permitted details. Reuse the roster for event, fee, fine and disciplinary contexts rather than separate student stores. Representatives use only the minimal attendance lookup under FL-017. |
| FL-010 | Manage Council membership | Executive; Platform Admin for executive provisioning | View Council member details, add/remove non-Executive Council access and maintain position labels. Only Platform Admin provisions/removes Executive access. No editable capabilities or custom presets. Removal does not delete student identity/history. Reassign members between Operations and Representative for promotions/demotions; changes involving Executive access are handled by Platform Admin. |
| FL-011 | Manage Faculty and executive accounts | Platform Admin | View users by category; add, edit and archive Faculty accounts and Council executive access. Assign one mutually exclusive instructor role and, optionally, its matching coordinator assignment: Academic Coordinator for Academic Instructor, RLE Coordinator for Clinical Instructor. Preserve these combinations when changing access. Cancel pending invitations within this provisioning scope when needed. Archiving preserves related records; remove Council assignments rather than archiving the whole account when Student access must remain. |
| FL-012 | View personal attendance QR | Student | Display a persistent identifier-only QR resolved by the authorized attendance operation. Do not encode contact information or use QR possession as login authorization. Use the university student number in `XX-1-XXXXX` format (X is a digit), resolved to the student's internal identity. Enforce unique student numbers and preserve record relationships through the stable internal identity. Render the current university number; correction/reissue mechanics are implementation details, not a token-management feature. The number is not a secret. |

### Events, attendance and satisfaction

| ID | Function | Users | Description / scope |
|---|---|---|---|
| FL-013 | Manage events and audience | Executive / Operations | Create, edit, view and archive events. Select year levels and academic statuses, attendance windows and applicable fine/demerit rules. Preserve the applicable audience/rules once used; archiving is not deletion of attendance or consequences. |
| FL-014 | Manage fine definitions | Executive / Operations | Create, edit, view and archive reusable fine definitions for event consequences. Future-use edits do not silently rewrite generated student obligations. |
| FL-015 | View events and own attendance | Student; permitted Council users | Students see upcoming/past events they belong to and their own attendance. Council views events and permitted participant information; representatives can view all events. |
| FL-016 | Configure event consequences | Executive / Operations | Attach absence/late fines and demerits to an event. Configure attendance/consequence criteria through event fields, rather than a rule-builder subsystem. Provide time-in thresholds, time-out thresholds and a lateness threshold of N time units after the configured time-in reference. A time-in past that lateness threshold is automatically late, without discretionary exceptions. Exact field units and boundary validation are implementation details. No penalties merely from opening a page. |
| FL-017 | Record event attendance | Executive / Operations / Representative | Log time-in/out through QR, manual search or a fixed CSV import. Apply the same student/event eligibility and duplicate checks across methods. Imported actual attendance time is distinct from import time. No self-logging; no offline synchronization engine. |
| FL-018 | Generate event consequences | Executive / Operations | Preview and explicitly generate applicable fines and individual one-day demerit records. Select Office or RLE during generation. Retain the selected bucket for that event, including zero-demerit outcomes. Retries must not change the selection or duplicate consequences; the selection does not become a default for other events. Repeated clicks/retries must not duplicate consequences. Successful explicit generation locks attendance even when zero consequences result. Block further attendance changes through every capture method, including CSV. Event and service attendance may share capture/validation components, but event consequence generation and service-credit creation remain distinct workflows. |
| FL-019 | Submit and review post-event satisfaction | Participating student; Executive / Operations for results | Submit a satisfaction response for an event they belong to. Use a fixed identified questionnaire linked to the responding student and event. Enforce one response per student per event server-side, including concurrent submissions and retries. Submitted answers are final and cannot be edited in this release. Council Executives and Operations may view identified responses and summaries; Representatives cannot. Clearly tell students that responses are not anonymous and that Executives and Operations can view them. Question wording and submission-window details are deferred until implementation. No separate anonymous participation mechanism or survey builder is included. |

### Fees, fines and payments

| ID | Function | Users | Description / scope |
|---|---|---|---|
| FL-020 | Manage fee definitions | Executive / Operations | Create, edit, view and archive fee definitions. Definition changes affect future use, not existing student obligations. |
| FL-021 | Publish fee obligations | Executive / Operations | Select the semester and year-level/academic-status audience, preview and generate the students' fee obligations. Preserve the published audience/amounts and prevent duplicate generation. Event fines use FL-018. |
| FL-022 | View obligations and payment history | Student; Executive / Operations | Students see own fees, fines, amounts still payable and payment outcomes. Council sees permitted student financial accounts and histories. Old unpaid obligations remain collectible after a new semester or clearance. |
| FL-023 | Submit transfer evidence | Student | Use a payment wizard to select complete obligations and submit transfer reference/proof. One submission may cover multiple selected items; no installments or payment gateway. Use payment accounts maintained under FL-047. Each payment covers obligations from one semester only; show a semester-specific selection, including older unpaid semesters. Enforce the same-semester rule in both the selection UI and server validation. Council manually rejects duplicate submissions; no reservation or duplicate-review workflow is required. A pending submission does not itself settle an obligation. |
| FL-024 | Record cash payment | Executive / Operations | Record money actually collected against complete selected obligations and show the payment result. Select obligations from one semester per payment and enforce that restriction server-side. Prevent self-recording and duplicate settlement. No cash-custody/handover subsystem is implied. |
| FL-025 | Verify or reject transfer submission | Executive / Operations | Review reference/proof and actual receipt of funds, then verify or reject and notify the student. Prevent self-verification and duplicate settlement. Reject only when no money was received or received money has already been returned outside the platform. The operator is responsible for checking this before rejection; no refund approval workflow. Rejection must not count the submission as settled revenue. Manually reject duplicate submissions. Count each actual transfer once: duplicate proof of one transfer does not create another receipt or refund. If an additional transfer was actually received and returned, retain it in gross receipts and refund totals even when its submission is rejected. Discrepancies are handled off-platform. |
| FL-026 | Waive unpaid obligation | Executive / Operations | Waive an unpaid fee/fine obligation with attributable context. This changes what is owed, not money already received. Prevent self-waiver. Waiver also covers the agreed cancellation use case; no separate cancellation action. |
| FL-027 | Record completed refund | Executive / Operations | Record a full-payment refund actually made outside the platform, with note/reason. Preserve gross received, refunds and net totals. Active obligations become payable again; a separate waiver is needed to remove debt. No refund approval engine or partial refunds. |
| FL-028 | Correct erroneous payment record | Executive / Operations | Enter a corrected replacement with a note; link and mark the previous record Superseded. Update current totals and allocations together, retaining history. A correction does not itself return or move money. |

### Merits, demerits and service

| ID | Function | Users | Description / scope |
|---|---|---|---|
| FL-029 | View disciplinary records and balances | Student; scoped Council; instructors; coordinators | Show permitted merits, demerits, service completions/credits and detail/history. Students see their own Office/RLE balances; coordinators review student histories. Council sees only its generated demerits and origin merit activity, not whole-ledger Office/RLE balances or Faculty services. The server checks aggregate waiver eligibility without returning the underlying Faculty ledger. Ordinary instructors see students' personal information and their own activity, not unrestricted disciplinary history. Limited balance inference through waiver outcomes is accepted. |
| FL-030 | Award merits | Academic / Clinical Instructor | Give whole-day merits to students, attributed to the awarder and award date. Awarded units expire one year from that date and may offset either bucket. No additional approval for this direct-award route. |
| FL-031 | Endorse students for merit | Executive / Operations | Select students and an instructor to review a Council-origin merit endorsement. An endorsement is not usable merit. Block self-endorsement. |
| FL-032 | Decide assigned merit endorsement | Assigned Academic / Clinical Instructor | Approve or reject an assigned endorsement; approval creates the awards once. View own decisions. No additional approver or automatic coordinator approval. |
| FL-033 | Log demerits | Academic / Clinical Instructor; RLE Coordinator for external CI records | Record whole-day units in the applicable bucket. A sanction worth three days creates three one-day demerit records sharing source context. Council generation uses FL-018, not a new general manual Council sanction function. Select from a misconduct catalog where every entry, including Other, defaults to one demerit. Other requires a description of the misconduct. The default is not a change to institutional policy or the one-record-per-unit rule. Platform Admin maintains the catalog under FL-048; instructors select from it but do not gain catalog-management authority. |
| FL-034 | Waive own or Council-generated demerit | Issuing instructor; Council Executive for Council entries; RLE Coordinator for entered external-CI records | Mark individual demerit units Waived, retain actor/time/reason and exclude them from the balance. Any active Council Executive may waive an eligible Council-generated demerit, regardless of which Council member generated it. Council Operations and Representatives cannot waive demerits. Faculty entries remain restricted to the issuing instructor; external-CI entries remain restricted to the RLE Coordinator who entered them. Coordinator status does not override issuer restrictions. Self-waiver is prohibited. Waivers may not exceed the current matching-bucket balance; zero-balance waivers are blocked. |
| FL-035 | Record external CI merits and demerits | RLE Coordinator | Enter externally given merits/demerits with external source attribution and the actual entering actor. No external-CI account or extra approval workflow. The entering RLE Coordinator owns waiver authority for these external-CI entries; this does not grant authority over another instructor's internally issued entries. |
| FL-036 | Apply available merits | Student | Choose Office or RLE and a whole-day amount. Consume earliest-expiring available units first; cap at available merits and matching outstanding balance. Original demerit entries remain. Applied or expired units cannot be spent again. |
| FL-037 | Manage service session and attendance | Academic / Clinical Instructor in applicable bucket | Create a one-day duty session, select students and record actual time-in/out. Coordinator assignments retain their underlying instructor capabilities. Reuse relevant event attendance capture, time-in/out threshold and lateness-validation components rather than duplicating them. Service completion still uses FL-038, not event consequence generation; shared components do not automatically adopt event fines or late-service credit deductions. Permit corrections before ending; absent students may be excluded. |
| FL-038 | End service session | Session issuer | Explicitly finalize valid attendance once. Missing/invalid attendance for included students blocks completion. Grant one matching-bucket credit only if a positive balance remains; otherwise retain completed service with zero credit. Supervisor decides the duty day is complete; no fractional/hour-based automatic credit. |
| FL-039 | Revoke service credit | Credit issuer only | Mark an erroneous credit Revoked with a reason, retaining the original completion/history. Remove its balance reduction; do not edit finalized attendance or automatically regenerate credit. Coordinator title grants no issuer override. |

### Clearance

| ID | Function | Users | Description / scope |
|---|---|---|---|
| FL-040 | Confirm Council clearance | Executive / Operations | Review the student and permanently record Council clearance for a semester. Outstanding fees/fines do not automatically block the action and remain payable afterward. No self-clearance. |
| FL-041 | Confirm Faculty clearance | Relevant Academic / RLE Coordinator | Review merits, demerits, service and Council status. Require Council clearance for the same student/semester; Academic and RLE decisions do not depend on each other. Permanently record the decision; balances remain visible but are not automatic blockers. |
| FL-042 | View clearance results | Student; permitted Council/Faculty users | Show separate Council, Academic and RLE semester confirmations, actor/time and permitted current context. Later debt/balance changes do not reverse a confirmation or make it a promise of zero current balance. No withdrawal or signature-tracking workflow. |

### Dashboards, notifications and reports

| ID | Function | Users | Description / scope |
|---|---|---|---|
| FL-043 | View dashboard and quick actions | Student; users where needed for their workspace | Summarize permitted records and provide navigation. Reuse underlying calculations; no elaborate analytics/chart suite is implied. |
| FL-044 | Receive and view business notifications | Student | Notify on merit received, demerit incurred, service recorded, fees/fines due, payment verification/rejection and Council access granted, changed or removed (FL-010). In-app delivery is included in V1. Business email delivery is not adopted by this decision. Invitations/recovery use email under FL-001/003. |
| FL-045 | Generate own disciplinary report | Student | Generate a semester or academic-year document showing own merits/demerits and relevant balance context. Print-friendly output is Proposed; no signature certification or permanent PDF archive is implied. |
| FL-046 | Generate Council summary and student reports | Executive / Operations | Generate semester/year summaries and student listings of fees, fines, Council-generated demerits and Council-origin merits. Respect source visibility in exports; no unrelated Faculty-entry details or configurable report builder. |

### Payment account administration

| ID | Function | Users | Description / scope |
|---|---|---|---|
| FL-047 | Manage payment accounts | Council Executive | Add, edit and archive the destination accounts and instructions used for student transfers. Archived accounts are unavailable for new submissions, but existing submissions remain valid and retain their destination details. Archive rather than delete accounts. All Executives have access; Operations and Representatives do not manage destinations. Later changes must not silently rewrite the destination associated with an existing submission. No bank integration is implied. |

### Misconduct catalog administration

| ID | Function | Users | Description / scope |
|---|---|---|---|
| FL-048 | Manage misconduct catalog | Platform Admin | Add, edit and archive misconduct options. Every option defaults to one demerit. Preserve an available Other option, requiring a specific misconduct description when used. Catalog edits/archiving must not rewrite existing demerit descriptions, quantities or history. Catalog maintenance does not grant authority to issue or waive demerits or amend institutional source policy. |

## 4. Business states and meaning

These are agreed business states, not a requirement for one database enum per row. **Stored states** change through authorized actions; **calculated conditions** come from dates or related records; **independent dimensions** may coexist. Derived conditions must not become conflicting editable flags. Physical storage, exact time boundaries and validation details are implementation choices; they do not add workflows.

| Record / dimension | States / conditions | Meaning and transition rules |
|---|---|---|
| Account | Active / Archived | Archived accounts cannot access the platform even if role assignments remain active; preserve history. Account archiving is distinct from removing one role. |
| Role assignment | Active / Removed | Removal disables only the affected role and preserves unrelated access/history, subject to the coordinator dependency rules in section 2. |
| Invitation | Pending / Accepted / Expired / Cancelled | Pending → Accepted on valid use, Expired when its lifetime ends, or Cancelled by an authorized provisioning actor before acceptance. Non-Pending invitations cannot be accepted. Expiry/cancellation does not delete the roster entry or archive the account. |
| Semester | Current / Not current | Exactly one active context for ordinary new academic entries. Creation and activation are separate. No elaborate lifecycle/sign-off states assumed. |
| Semester roster entry | No lifecycle state | Records membership in that semester's roster; no approval lifecycle. Regular/Irregular and year levels 1–4 are classifications, not account or workflow states. |
| Event — visibility | Active / Archived | Archive preserves history and does not itself cancel the event, finalize attendance or waive consequences. |
| Event — schedule | Upcoming / Ongoing / Past | Calculated from start/end times, independently of archive and attendance-lock state. |
| Event — attendance finalization | Open / Locked | Open → Locked when explicit consequence generation succeeds, including a zero-consequence result. No capture, CSV import or correction afterward. |
| Event attendance — arrival | Not recorded / On time / Late | Derived from time-in and configured threshold; past the lateness threshold is automatically Late. |
| Event attendance — departure | Not recorded / Recorded | Derived from time-out independently of arrival; a late student can also lack time-out. |
| Event attendance — final absence | Absent / Not absent | Calculated under configured criteria during consequence generation, not merely from no attendance on a future event. Missing time-out is not automatically absence unless the configured rule says so. |
| Event feedback participation | Not submitted / Submitted | Derived from whether a response exists for the student/event. One identified response, immutable after submission. The response itself needs no Draft, Approved or Reviewed lifecycle. |
| Fee/fine definition | Active / Archived | Availability for future use, not the balance of an existing obligation. |
| Payment account | Active / Archived | Archived accounts cannot be selected for new submissions; existing submissions retain their destination and validity. Archive rather than delete. |
| Misconduct catalog option | Active / Archived | Controls future selection; existing demerit records retain their original details. Other remains available. |
| Endorsement | Pending / Approved / Rejected | Pending → Approved or Rejected. A pending endorsement is not an issued merit. Approval creates awards once; rejection creates none. |
| Merit unit | Available / Applied / Expired | One whole day. Available means unapplied and before one-year award-date expiry; Available → Applied on use or Expired when unused at expiry. Applied takes precedence over date-based expiry and remains an offset. No Revoked or Restored state. |
| Demerit unit | Recorded / Waived | Recorded → Waived, subject to issuer authority and sufficient matching-bucket balance. One whole day per record. No waiver reversal. No individual Paid, Served or Cleared state: offsets operate on the aggregate bucket. Waived entries remain visible but no longer count. |
| Service session | Open / Ended | Open → Ended after explicit valid completion; attendance editable before ending, read-only afterward. Generate eligible credits once. No separate credit-certification queue. |
| Service participation/completion | Pending completion / Excluded / Completed with credit / Completed without credit | Included participants are Pending completion while the session is open; absent participants may be Excluded. Ending produces a completion outcome for each included student. Zero-credit completion is retained, not banked for future demerits. Attendance/lateness is separate. A later credit revocation does not rewrite Completed with credit; show Credit revoked alongside the original outcome. |
| Service credit | Valid / Revoked | Valid → Revoked by the issuer only, with reason. Revocation removes the one-day offset while preserving completion/history; no automatic regeneration. No credit row is needed merely to represent zero-credit completion. |
| Obligation — lifecycle | Active / Waived | Waive an unpaid obligation explicitly. A refund note cannot waive it. No distinct Cancelled state. |
| Obligation — payment standing | Unpaid / Paid | Calculated from effective allocations and refunds, not a manually editable flag. A refunded active obligation is payable again. No Partially paid state: installments are outside scope. Display Waived for waived obligations rather than implying they were paid. |
| Obligation — submission indicator | Has pending submission / No pending submission | Calculated separately; display Unpaid · Payment pending review where applicable. Pending proof is not settlement. Council rejects duplicates manually; server checks prevent double settlement. No reservation workflow. |
| Transfer submission | Pending / Verified / Rejected | Pending → Verified or Rejected. A later refund does not change Verified to Rejected. Rejection relies on the operator checking that no money was received or that it was already returned; the status alone is not independent evidence of a refund. Actual receipts and returns remain in gross/refund totals even for a rejected submission; duplicate evidence alone creates no new money movement. Cash does not need a pending verification stage. |
| Received payment — record validity | Current / Superseded | Current → Superseded when a linked corrected replacement is created. Old records do not double-count current totals; correction does not move money. |
| Received payment — refund condition | Not refunded / Refunded | Independent of record validity; a corrected record may have refund history. Record an actual full return, preserving gross receipts and refunds while excluding the returned amount from net collections. No Requested, Approved or Processing refund workflow. Cash needs no transfer-verification stage. |
| Clearance component | Not yet cleared / Cleared | Not yet cleared → Cleared, permanently, for each Council/Academic/RLE component per student/semester. Absence of a confirmation represents Not yet cleared, not formal rejection or automatic ineligibility. Academic/RLE each require Council clearance, not one another. Balances do not automatically block. No Withdrawn, Expired or Reopened state. |

**Balance interpretation:** recorded demerit units minus applied merit units minus valid service credits, separately for Office/RLE. Waived demerits and revoked credits do not contribute. Waiver, merit application and service-credit creation must coordinate on the same current balance to prevent negative results or duplicate spending. Database commit order, not browser click time, determines which operation takes effect first.

**Audience interpretation:** selected year levels are ORed, selected academic statuses are ORed, and the two groups are combined with AND. Preserve the published/generated audience; later roster changes do not silently rewrite existing attendance obligations or charges. Explicit all-values selection is preferable to an ambiguous empty selection.

## 5. Accepted limitations and essential safeguards

| Choice | Risk / limitation carried |
|---|---|
| Fixed broad Council presets; no routine second approver | A trusted operator can make consequential mistakes. Self-benefit checks do not prevent collusion or account compromise. |
| Permanent clearance | Incorrect confirmations cannot be withdrawn in the application. Later refunds or revoked credits may increase balances while clearance remains recorded. Discrepancies are settled off-platform. |
| Automatic credit on explicit session end | The issuer is responsible for complete duty and valid attendance; time entries alone do not prove work. A waiver committed first can leave real completed service with no credit. |
| No ordinary edits after service completion | Correct credit effect through issuer revocation, not rewritten attendance. No automatic future allocation of zero-credit service. |
| Zero-balance demerit waiver blocked | An unjustified entry may remain recorded after offsets were used. No automatic merit restoration or surplus-service scheme is agreed. |
| Identifier-only static QR | Copied or manually supplied identifiers do not prove physical presence. Sharing prevention is deferred; capture still requires authorized staff and eligibility checks. |
| Manual transfer/refund verification | Proof or a note does not independently establish actual money movement. Staff must check receipt/return; the app is not a bank reconciliation or complete accounting system. |
| Full selected-item payment; full-payment refunds | No installments or partial refunds. Unsupported financial exceptions need an explicit manual boundary, not fabricated settlement. |
| One current semester for ordinary entries | No general backdating workflow. Legitimate omitted academic records may need off-platform handling. Payments can settle old obligations using their actual payment date. |
| Identified satisfaction responses | One response per student/event is simpler to enforce, but identification may discourage candid feedback. Submitted answers cannot be corrected in this release. Disclose identification/finality and restrict result access. |
| Shared attendance components | Reusing capture and threshold logic does not unify event consequences with service-credit policy or grant Council access to service sessions. |
| Downloaded reports and broad roster handling | Exports cannot be recalled; report scope and minimum necessary fields still matter. No blanket Faculty disclosure to Council. |

Keep server-side authorization, private payment evidence, identity continuity, transaction/duplicate protection and small attributable histories of consequential actions. Retain who/when and correction reasons on the relevant records; do not build a general audit dashboard, signature system, role builder or workflow engine. Essential validation is not an additional approval layer.

Preserve deployed data, access safeguards and applied migrations. Inspect the separate application and plan migration before adapting implementation. This document does not claim application or deployment validation.

## 6. Scope decisions and implementation details

The following decisions define V1. They do not claim implementation is complete. Resolve deferred details before the affected feature ships, within the agreed scope.

| ID | Status | Settled decision |
|---|---|---|
| Q1 | Resolved | Fixed access categories, no capability editor. Reassignment for promotions/demotions is allowed. Executives manage Operations/Representative assignments; Platform Admin handles changes involving Executive access. Position labels alone do not grant permissions. |
| Q2 | Resolved | Ordinary instructors see student personal information and their own activity, not other instructors' history. Limited disclosure from Council waiver outcomes is accepted. |
| Q3 | Resolved | QR contains the university student number in `XX-1-XXXXX` format, resolved to a stable internal student identity. No encrypted-token or anti-sharing feature. |
| Q4 | Resolved | Configurable time-in, time-out and lateness thresholds; arrivals past the lateness threshold are automatically late. No attendance edits or CSV capture after event consequences. Service sessions reuse relevant attendance mechanics but retain their separate completion/credit rules. |
| Q5 | Resolved | Fixed identified form; one final, non-editable response per student per event. Responses are linked to students and disclosed as identified. Executives and Operations may view responses and summaries; Representatives cannot. |
| Q6 | Resolved | Executives manage payment accounts. Each payment covers one semester. Council manually rejects duplicates; prevent double settlement. Return received funds before rejection and retain actual receipts/refunds in totals. Duplicate proof is not duplicate money. No reservation or refund approval workflow. |
| Q7 | Resolved | Waiver is sufficient; no distinct obligation cancellation action. Refund notes do not waive debt. |
| Q8 | Resolved | Platform Admin adds, edits and archives misconduct options under FL-048 without changing existing demerit records. Every entry, including Other, defaults to one demerit; Other remains available and requires a description when used. The entering RLE Coordinator owns external-entry waivers without authority over other instructors' internally issued entries. |
| Q9 | Resolved — in-app delivery adopted; report details deferred | In-app business notifications are included in V1. Business email delivery is not adopted; invitations/recovery retain email. Report output format and period-selection details remain deferred to development; printable reports remain a proposal. |

**Implementation details, not reopened scope questions:** QR correction/reissue mechanics; exact attendance threshold units and boundary validation; fixed questionnaire wording and submission window; and the remaining Q9 report presentation/period-selection choices. In-app notification delivery is adopted, not deferred. Role combinations, feedback-result viewers and Platform Admin catalog maintenance are settled above, not deferred. Deferral does not authorize extra roles, management screens or workflows.

Use this catalog with the navigation map, schema and architecture. Verify shared data contracts against the separate application before implementation or migration. Record feature-specific details and acceptance checks in short tasks; deferred details do not authorize additional workflows.
