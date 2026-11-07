# Project Florence — Navigation Map

**Version:** 0.1 · **Date:** 2026-11-07 · **Status:** V1 navigation guide

## Purpose and boundaries

This map groups the [function-list](Project_Florence_Function_List.md) capabilities by workspace. The function list defines scope, roles and business states; this map does not grant permissions or add features.

- Destinations are navigation groups, not mandatory pages, URLs or separate implementations.
- Detail views, forms and confirmations are contextual. Developers choose pages, tabs, modals or drawers as appropriate.
- Grouping and labels may change during development without changing scope. FL references identify related capabilities, not blanket access to every action in a function.
- Shared implementations can serve several workspaces with different authorized data. Hiding a menu item is not authorization; enforce access server-side.
- No screen IDs, modal catalog, extra dashboard analytics or workflow specification is introduced.

## Workspace map

```text
Shared access and account
├── Sign in / invitation acceptance / password recovery
└── Personal information / password change / sign out

Student
├── Home and attendance QR
├── Events
├── Fees and fines
├── Merits, demerits and services
├── Clearance
└── Notifications

Council
├── Students
├── Events
├── Fees and fines
├── Payments
├── Merit endorsements and Council demerits
├── Clearance
├── Reports
├── Semesters
├── Council members                 [Executive only]
└── Payment accounts                [Executive only]

Faculty
├── Students
├── My merits and demerits
├── Merit endorsements
├── Service sessions
├── Clearance                       [matching Coordinator only]
└── External CI records             [RLE Coordinator only]

Platform administration
├── Users and access
└── Misconduct catalog
```

Representatives see **Events only** in the Council workspace, alongside shared account controls. Their Student workspace remains available. The full Council tree above is not their menu.

## Shared access and workspace switching

| Destination / behavior | Users | Related FL IDs |
|---|---|---|
| Sign in, accept invitation, recover password | Existing or invited users, as applicable; no public signup | FL-001–003 |
| Account controls: personal information, password change, sign out | All account holders; own information only | FL-003–005 |
| Student/Council workspace switch | Students with one active Council assignment | FL-002, FL-010 |
| Faculty workspace | Academic **or** Clinical Instructor, optionally with the matching coordinator assignment | FL-002, FL-011 |
| Platform administration workspace | Platform Admin | FL-002, FL-011 |

- One account and identity across permitted workspaces; switching changes presentation, not authority.
- Student-only users need no workspace chooser. Council members can switch between Student and Council; do not duplicate their account.
- Coordinators use the Faculty workspace, not a separate coordinator application. Academic and Clinical Instructor assignments are mutually exclusive.
- Show only available workspaces. Removing a Council assignment removes Council access, not Student access.
- Keep the relevant semester visible for semester-scoped work. Choosing a historical view does not activate a semester or authorize backdating.
- The exact initial landing destination is an implementation choice. Staff can land on an existing permitted list rather than require a new dashboard.

## Student destinations

All student views are limited to the signed-in student's records.

| Destination | What belongs here | Related FL IDs |
|---|---|---|
| Home and attendance QR | Summary, quick links and university-number attendance QR; profile through shared account controls | FL-004, FL-012, FL-043 |
| Events | Upcoming/past eligible events, own attendance and identified post-event feedback submission | FL-015, FL-019 |
| Fees and fines | Semester-specific obligations, transfer submission, payment history and outcomes | FL-022–023 |
| Merits, demerits and services | Own Office/RLE records and balances, merit application and own disciplinary report | FL-029, FL-036, FL-045 |
| Clearance | Own Council, Academic and RLE semester confirmations | FL-042 |
| Notifications | Agreed business notices with links to permitted records | FL-044 |

Notifications uses FL-044 in-app delivery. Business email, read-state and notification-management workflows are not included.

## Council destinations

**E = Executive; O = Operations; R = Representative.** Access below is constrained by the FL's self-benefit and source-visibility rules.

| Destination | Visible to | What belongs here | Related FL IDs |
|---|---|---|---|
| Students | E, O | Roster import/add/edit, invitations and directory; contextual links to permitted student records | FL-007–009 |
| Events | E, O, R | All events and attendance capture. E/O also manage events, configure/generate consequences and view identified feedback/results. R has no event-management, consequence-generation or feedback-result access | FL-013, FL-015–019 |
| Fees and fines | E, O | Fee/fine definitions, fee publication, student obligations and unpaid-obligation waiver | FL-014, FL-020–022, FL-026 |
| Payments | E, O | Transfer review, cash recording, actual refunds, payment correction and histories | FL-022, FL-024–025, FL-027–028 |
| Merit endorsements and Council demerits | E, O | Council-origin endorsements/awards and generated demerits; submit endorsements. Only E may waive Council-generated demerits | FL-029, FL-031, FL-034 |
| Clearance | E, O | Review and permanently confirm Council clearance; view permitted confirmation context | FL-040, FL-042 |
| Reports | E, O | Council summaries and student listings within the agreed financial/Council-origin disciplinary scope | FL-046 |
| Semesters | E, O | Create semesters and activate the current semester | FL-006 |
| Council members | E | Maintain non-Executive membership/assignments and position labels; Executive assignment changes belong to Platform Admin | FL-010 |
| Payment accounts | E | Add/edit/archive transfer destinations and instructions | FL-047 |

Representatives' student lookup stays inside attendance capture. It is not a shortcut to a general student directory. Council disciplinary destinations do not expose Faculty incidents, service histories or whole-ledger balances.

## Faculty destinations

Academic/Clinical instructors share the navigation structure; actions use the corresponding Office/RLE scope. Coordinators retain their underlying instructor destinations.

| Destination | Visible to | What belongs here | Related FL IDs |
|---|---|---|---|
| Students | Instructors and coordinators | Student directory/personal information. Instructors reach their permitted own-entry actions; coordinators can additionally review student disciplinary history and balances | FL-009, FL-029–030, FL-033–034 |
| My merits and demerits | Instructors and coordinators in their instructor capacity | Own awards, own demerits and permitted waiver actions; contextual student selection for entry | FL-029–030, FL-033–034 |
| Merit endorsements | Instructors, including coordinators in their instructor capacity | Assigned Council endorsements and own approval/rejection decisions | FL-032 |
| Service sessions | Instructors and coordinators in their instructor capacity | Applicable-bucket sessions, participant attendance, explicit completion and issuer-only credit revocation | FL-037–039 |
| Clearance | Academic/RLE Coordinators only | Student history and Council status; confirm only the corresponding Faculty component | FL-029, FL-041–042 |
| External CI records | RLE Coordinator only | Attributed external merits/demerits and waivers of external demerits entered by that coordinator | FL-034–035 |

The student directory does not grant ordinary instructors access to another instructor's history. Coordinator status does not override issuer-only waiver/revocation restrictions. Student detail and own-activity views may reuse components rather than become duplicate modules.

## Platform administration destinations

| Destination | What belongs here | Related FL IDs |
|---|---|---|
| Users and access | Faculty accounts, matching coordinator assignments, Executive access and invitation cancellation within that provisioning scope | FL-001, FL-010–011 |
| Misconduct catalog | Add/edit/archive options while preserving Other and existing demerit history | FL-048 |

Platform Admin has no implied payment verification, clearance, merit-award or demerit-waiver access. Managing the catalog is not authority to amend institutional policy.

## Contextual navigation, not additional menu items

- Open an event's attendance and feedback/results from that event, subject to role access.
- Open payment evidence, decision details, refunds and corrections from the relevant payment.
- Open student financial/disciplinary details only from authorized lists and within the viewer's scope.
- Open a service session's attendance and completion actions from the session.
- Keep confirmations such as waive, archive, end session or clear inside the owning feature. A confirmation is not an approval queue.
- Reuse shared account controls rather than creating separate profile/security features per workspace.

## Implementation

All FL-001–048 capabilities are mapped above. A destination may cover several functions, and a function may appear in several authorized contexts. Names and grouping do not prescribe layouts or route counts.

Use the schema and architecture for shared data contracts, and short implementation tasks for feature details and acceptance checks. Document finalized goal-based flows using the [user-journey guide](Project_Florence_User_Journeys.md); this navigation map remains focused on destinations and visibility. Verify the separate application and database before implementation or migration; this map does not claim either has been inspected or changed.
