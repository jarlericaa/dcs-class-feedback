# Web App Build Plan

**Status:** [Recommended] starting plan for the next implementation phase.

The repository already has domain services and a functional foundation. Build
the web app in vertical slices around those services so each slice produces a
usable workflow and can be verified end to end.

## Information architecture

### Shared entry points

| Route | Purpose |
|---|---|
| `/signin` | University sign-in and local-only development sign-in |
| `/` | Role-aware home: sections, pending actions, and recent updates |
| `/sections/[id]` | Student section home and current weekly cycle |
| `/teach/sections/[id]` | Staff section workspace shell |
| `/admin` | Future platform-admin access and system controls |

### Student workspace

| Route | Primary job |
|---|---|
| `/sections/[id]` | Complete the current cycle or see that it is closed/submitted |
| `/sections/[id]/history` | Review personal submissions, private replies, and answer status |
| `/sections/[id]/qa` | Search published anonymous answers for the section |

### Staff workspace

| Route | Primary job |
|---|---|
| `/teach/sections/[id]/review` | Review incoming submissions and respond |
| `/teach/sections/[id]/roster` | Read the class list and its UP-email link status |
| `/teach/sections/[id]/import` | Import and reconcile a roster |
| `/teach/sections/[id]/setup` | **Planned:** section details, staff, schedule, and templates |
| `/teach/sections/[id]/backlog` | **Planned:** triage and publish course questions |
| `/teach/sections/[id]/participation` | **Planned:** participation view and exports |
| `/teach/courses/[id]/templates` | **Planned:** course-level template authoring |

Keep student and staff navigation visibly separate. A teacher may also be an
enrolled student, but the interface should make the current workspace and
privacy boundary obvious.

## Build slices

### Slice 0 — App shell and visual foundation

Build:

- responsive app shell with a compact sidebar/header;
- section switcher and role-aware navigation;
- shared typography, color, spacing, focus, button, input, card, badge, and
  alert styles;
- loading, empty, error, and success patterns;
- accessible page landmarks and keyboard navigation;
- a clear sign-out and account menu.

Done when:

- every existing route renders inside the same shell;
- navigation never exposes a link the current user cannot access;
- the layout works at mobile, tablet, and desktop widths;
- no business rule moves from `src/modules/` into a component.

### Slice 1 — Student weekly feedback loop

Build:

- section overview with current cycle state and deadline;
- form sections with question labels, descriptions, required markers, and
  clear validation messages;
- optional student-originated item with privacy explanation;
- submit confirmation that states the real rule — the response stays editable
  until the deadline, then locks — and that the student's own question reaches
  staff on submit and cannot be unsent (decision B4; **do not** write copy
  claiming the submission is immutable);
- submission history with neutral “submitted/answered” states;
- searchable Q&A archive with empty and no-result states.

Done when a seeded student can sign in, open a section, submit, edit that same
response before the deadline, return to history, and find a published answer
without seeing internal fields or another student's identity.

### Slice 2 — Teacher review loop

Build:

- review inbox grouped by cycle with filters for new, under review, answered,
  invalid, and backlog candidates;
- submission/item card that keeps student context visible to authorized staff;
- private response composer;
- public answer composer with original text separated from editable public text;
- explicit anonymity review/confirmation before publish;
- publish success/failure state and clear retry affordance when applicable;
- merge UI only after the single-item flow is stable.

Done when a teacher can review a submission, invalidate/revalidate it, reply
privately, publish a safe anonymous answer, and see the result reflected in the
student's history and class archive.

### Slice 3 — Section setup

Build:

- course and section creation/editing;
- staff assignment and TA permission editor;
- template authoring with version preview;
- recurrence schedule configuration;
- cycle preview and structural edit-lock messaging.

Done when a teacher can set up a new section without database scripts and the
next cycle is generated from the selected template.

### Slice 4 — Identity and roster safety

Build:

- roster import wizard: upload/paste → map → validate → preview → confirm;
- row-level errors and reconciliation summary;
- ~~pending-match queue with clear candidate/ambiguous/unmatched states;~~
- ~~correction flow for an already-confirmed match;~~
- staff-only identity warnings and audit history.

> **Struck by decision D23 (2026-08-07).** Identity is exact normalized UP-email
> equality against the class list, so there are no candidates, no ambiguity and
> nothing to confirm — those two surfaces must **not** be built. The work they
> represented moved into the import preview, where a missing, malformed,
> off-domain, duplicated or already-taken email is corrected or refused before
> commit. See [student-identity.md](student-identity.md).

Done when a teacher can safely import a roster, correct a wrong UP email before
committing it, and see that a removed roster row is deactivated rather than
deleted.

### Slice 5 — Backlog, participation, and operations

Build:

- backlog triage and provenance display;
- explicit section publication from the course backlog;
- participation dashboard derived from valid responses;
- CSV export previews and downloads;
- scheduled-publication review/retry surface;
- audit-history browsing.

Done when the platform replaces the remaining manual spreadsheet/document work
for one pilot section.

### Slice 6 — Hardening

Build:

- browser end-to-end tests for student, teacher, and authorization journeys;
- responsive and keyboard QA;
- rate limits and production OAuth configuration;
- backup/retention/deployment runbooks;
- privacy review with representative small-class examples.

## UI component inventory

Prefer a small shared vocabulary over one-off page markup:

- `AppShell`, `Sidebar`, `MobileHeader`, `WorkspaceSwitcher`;
- `SectionHeader`, `CycleStatus`, `DeadlineLabel`, `Breadcrumbs`;
- `StatCard`, `EmptyState`, `ErrorState`, `Skeleton`;
- `QuestionBlock`, `AnswerField`, `FormSection`, `SubmitConfirmation`;
- `ReviewQueue`, `SubmissionCard`, `ResponseComposer`, `AnonymityCheck`;
- `StatusBadge`, `PermissionBadge`, `SourceLinkNotice`, `AuditNotice`;
- `SearchField`, `FilterBar`, `Pagination`, `DownloadButton`.

Components should receive already-authorized data and emit user intent. Server
actions or domain services remain responsible for authorization, validation,
transactions, and audit writes.

## Interaction rules

- Make the next action obvious: complete, review, respond, publish, or resolve.
- Use neutral language for student-facing states. Do not show “no response,”
  internal validity reasons, or staff review progress to students.
- Put privacy explanations next to the action that changes visibility.
- Preserve user input when validation fails.
- Never use color alone for status.
- Prefer explicit confirmation for irreversible actions: invalidate, publish,
  and deactivate. Submitting is **not** one of them — the response stays
  editable until the deadline (B4) — but the free-text item reaching staff *is*
  one-way, so the confirmation belongs at that field, not at the whole form.
  (Identity is not among them either — there is nothing to confirm; see decision
  D23 and the note in Slice 4.)
- Design mobile-first for students and desktop-first for teacher review.

## Suggested first coding task

Implement Slice 0 and the visual parts of Slice 1 first. Do not rewrite the
domain modules or add a new API layer just to style the existing pages. The
first reviewable change should contain:

1. app shell and tokens;
2. redesigned sign-in;
3. redesigned dashboard;
4. redesigned student section/form states;
5. one responsive Q&A archive state;
6. screenshots or a short manual verification note.

Then implement the teacher review shell as the next vertical slice.
