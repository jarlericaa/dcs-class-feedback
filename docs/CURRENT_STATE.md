# Current State

**Snapshot date:** 2026-08-02  
**Repository phase:** pilot-usable application; setup, the student loop, the
staff loop, and operations surfaces are implemented end to end.

This is a factual snapshot of the extracted repository. It is intentionally
separate from the full product scope in [mvp-scope.md](mvp-scope.md).

## Implemented routes

| Route | Status | What works |
|---|---|---|
| `/signin` | **[Implemented]** | Google OAuth when configured; local dev-login outside production; access explanation and auth-error alert |
| `/` | **[Implemented]** | Role-aware dashboard with real per-section cycle state, staff attention counts, and match status |
| `/sections/[id]` | **[Implemented]** | Student weekly form; inline per-question validation that preserves typed input; submitted confirmation |
| `/sections/[id]/history` | **[Implemented]** | Student's own submissions, private replies, and published-answer status |
| `/sections/[id]/qa` | **[Implemented]** | Section-scoped list/detail Q&A archive with search and category filter |
| `/admin` | **[Implemented]** | Platform-admin account list and teacher-role grants |
| `/teach/courses` | **[Implemented]** | Course and section creation |
| `/teach/courses/[id]/templates` | **[Implemented]** | Template authoring; saving creates a new immutable version |
| `/teach/sections/[id]/review` | **[Implemented]** | Queue + detail inbox, filters, validity, private reply, public draft/publish with anonymity acknowledgment |
| `/teach/sections/[id]/setup` | **[Implemented]** | Section details, teaching team + TA permission catalog, weekly schedule, cycle management with edit-lock state |
| `/teach/sections/[id]/matches` | **[Implemented]** | Teacher-confirm-all match review grouped by account, plus the class list |
| `/teach/sections/[id]/import` | **[Implemented]** | Roster CSV paste → grouped preview → confirm |
| `/teach/sections/[id]/participation` | **[Implemented]** | Derived participation matrix and summary |
| `/teach/sections/[id]/participation/export` | **[Implemented]** | The three participation CSVs, `no-store`, audited |
| `/teach/sections/[id]/publications` | **[Implemented]** | Drafts, scheduled answers, failed publications, retry/reschedule/cancel |
| `/teach/sections/[id]/backlog` | **[Implemented]** | Course backlog triage, per-section drafting, anonymous legacy import |
| `/teach/sections/[id]/audit` | **[Implemented]** | Section-scoped append-only audit history |
| `/api/auth/[...nextauth]` | **[Implemented]** | Auth.js callback route |
| `/api/internal/scheduler/tick` | **[Implemented]** | Secret-protected scheduler tick |

## Implemented domain foundations

- Identity, users, roster records, enrollments, account matching, and name
  normalization.
- Course, class-section, course-staff, section-staff, and TA permission fields.
- Form templates, immutable template versions, recurrence schedules, weekly
  cycles, and cycle-level question snapshots.
- Form response validation across the supported question types.
- One-response-per-student-per-cycle database enforcement.
- Separate response review state and participation-validity state.
- Private responses and public answers with source links.
- Course backlog/import schema foundations.
- Append-only audit events for important mutations.
- Reconciliation logic for cycle transitions and scheduled publication.

## Partial or incomplete surfaces

These exist in the model or service layer but are not yet a complete user
workflow:

- **Merge UI** for combining related submissions into one public answer.
  `draftPublicAnswer` accepts several source items and the merge is fully
  implemented and tested in the service layer, but the review inbox only
  offers the single-item flow.
- **Cycle question editing.** The structural edit-lock state is computed and
  displayed, but there is no UI for editing a generated cycle's questions, so
  the lock has nothing to refuse yet.
- **Backlog identity preservation.** `copyOrMoveToBacklog` supports moving a
  live submission into the backlog with an optional source link; the backlog
  page currently exposes triage, per-section drafting and anonymous legacy
  import only.
- **Match correction.** `correctMatch` rebinds an already-confirmed identity
  and is tested, but the matches page exposes confirm and reject only.
- **Course-level backlog route.** The backlog is reached through a section;
  there is no standalone `/teach/courses/[id]/backlog`.

## Not implemented in this phase

- Email or in-app notifications.
- AI features.
- Course-material management.
- Unpublishing.
- Comments, threads, reactions, and voting.
- Attachments and document exports.
- LMS integration.
- Native mobile clients.
- Browser end-to-end tests (no browser harness exists in the repository; a
  scripted HTTP verification matrix stands in — see the implementation report).
- Production deployment automation.

## UI maturity

Every route renders inside a shared `AppShell` with landmarks, a skip link,
breadcrumbs, a workspace-specific privacy note, and navigation derived from the
same effective permissions the server enforces. The design system lives in
`src/app/globals.css` and follows [UX-DESIGN-BRIEF.md](UX-DESIGN-BRIEF.md).

Present:

- responsive layout: sidebar at desktop, a keyboard-accessible `<details>`
  drawer on phones, single-column collapse for the staff queue/detail split;
- design tokens, buttons, cards, badges, alerts, tables, and form controls;
- empty, error, success, unauthorized, closed-cycle, and no-results states;
- a visible global focus ring, `aria-invalid` + `aria-describedby` on failing
  fields, status conveyed by text and shape rather than colour alone;
- review filters and week scoping.

Not present:

- pagination and bulk actions in the review queue (all rows render);
- optimistic/loading skeletons — pages are server-rendered per navigation;
- a browser end-to-end suite (see below).

## Known documentation drift corrected by this snapshot

Several earlier docs still say “pre-implementation,” “no code exists,” or
“conceptual model only.” Those statements are now historical and should be
read as describing the original planning phase. The detailed requirements and
state models remain useful, but current implementation truth is this document
plus the source code, migrations, and tests.

## Immediate next milestone

The student and teacher loops are complete. The next work is hardening rather
than new surface area:

1. a browser end-to-end suite for the highest-risk journeys (Slice 6);
2. the merge UI on top of the existing merge service;
3. production deployment automation and OAuth configuration;
4. owner sign-off on the decisions listed in
   [open-decisions.md](open-decisions.md) before real student data is used.

Acceptance criteria and build order: [WEB-APP-BUILD-PLAN.md](WEB-APP-BUILD-PLAN.md).

## Verification snapshot

| Check | Result |
|---|---|
| `npm run lint` | **Pass** |
| `npm run typecheck` | **Pass** |
| `npm test` | **Pass** — 5 files, 41 unit tests |
| `npm run test:integration` | **Pass** — 8 files, 90 integration tests |
| `npm run build` | **Pass** — 20 routes |
| Manual verification matrix | **Pass** — 32 HTTP assertions plus a scripted student→teacher→student loop; see [CLAUDE_IMPLEMENTATION_REPORT.md](CLAUDE_IMPLEMENTATION_REPORT.md) |

Integration tests need PostgreSQL. Docker was unavailable in the session that
produced this snapshot, so a user-owned PostgreSQL 18 cluster served the
`feedback_test` database and `TEST_DATABASE_URL` pointed at it. The documented
`docker compose up -d` path is unchanged for normal use.
