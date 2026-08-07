# Claude Implementation Report — pilot-usable full-stack pass

> ## ⚠ HISTORICAL — describes the removed account-matching flow
>
> This document is a **dated, point-in-time record**, not a specification to
> build from. It was written while student identity worked by matching Google
> display names against roster names, with a `/claim` page and teacher
> confirmation of suggested matches.
>
> **That whole workflow was removed on 2026-08-07.** Student access is now exact
> normalized UP-email matching against the teacher-uploaded class list. Anything
> below about account matches, match candidates, claiming, or confirming a
> student is history — **do not rebuild it.** The current rule is
> [student-identity.md](student-identity.md).


**Date:** 2026-08-02
**Model / tooling:** Claude Opus 5 (`claude-opus-5[1m]`) running in Claude Code.
**Plan:** [CLAUDE_IMPLEMENTATION_PLAN.md](CLAUDE_IMPLEMENTATION_PLAN.md).
**Language:** TypeScript. Per the handoff, "Fable" means Claude tooling; no
F#/Fable stack was introduced and D1 was not reopened.

---

## 1. Backend audit

Traced every pilot workflow from route to service to persistence before
changing anything. The existing foundation was sound and was **not** rewritten:
schema and migrations, Auth.js with a production-impossible dev login,
deny-by-default resource-scoped authorization, name matching, roster import,
template versioning, cycle generation/open/close, submission with server-side
validation and the one-per-cycle constraint, review and validity, private
responses, public answers with source links, anonymity warnings, scheduled
publication with reconciliation, derived participation with three CSVs, and
append-only audit writes.

What the audit found missing was a **write path for setup** and a **read model
for operations** — not gaps in the rules, but gaps in reachability. Evidence
used: audit action names declared in `modules/audit` that no code ever emitted
(`course.created`, `section.created`, `staff.permissions_changed`,
`recurrence.configured`), and services with no caller outside the seed script
(`createTemplate`, `reopenCycle`, `skipCycle`, `cycleHasSubmissions`,
`schedulePublication`, the backlog services).

### Completed workflows

| Workflow | Status |
|---|---|
| Platform admin grants the teacher role | **new** |
| Teacher creates a course and section | **new** |
| Teacher assigns staff and configures TA permissions | **new** |
| Teacher authors a form template and revises it as a new version | **new** |
| Teacher configures the weekly schedule; cycles generate and open | **new** (schedule); reconciliation already existed |
| Teacher manages cycles (reopen, skip) and sees the edit lock | **new** surface over existing services |
| Teacher imports a roster and reconciles it | rebuilt |
| Teacher confirms/rejects account matches | rebuilt |
| Student signs in, sees their section and cycle state | rebuilt |
| Student submits once, with errors that preserve input | **fixed** (see §5) |
| Student sees history, private replies, and published answers | rebuilt |
| Student searches the section Q&A archive | rebuilt |
| Staff review submissions, set validity, reply privately | rebuilt |
| Staff draft, reword, schedule, publish, and retry public answers | **new** queue over existing services |
| Staff triage the course backlog and import legacy questions | **new** |
| Staff view participation and download the three CSVs | **new** surface + download route |
| Staff browse section audit history | **new** |

---

## 2. Changes by area

### Modules (`src/modules/`)

- **authz** — `requireCourseOwner`, `requireTeacher`, `SECTION_PERMISSIONS` +
  labels, and `getSectionAccess`, a navigation-only read model that resolves
  effective permissions and never authorizes a mutation.
- **catalog** — `createCourse`, `updateCourse`, `createSection`,
  `updateSection`, `assignSectionStaff`, `removeSectionStaff`,
  `setTeacherRole`, `listAccountsForAdmin`, `listCoursesForUser`,
  `listSectionStaff`, `listSectionRoster`, `getSectionWithCourse`.
- **forms/schedules.ts** (new) — `configureRecurrence`, `deactivateSchedule`,
  `getActiveSchedule`, `listCyclesForSection`, `DAY_NAMES`.
- **forms/templates.ts** — `listTemplatesForCourse`, `listTemplatesForSection`,
  `getTemplateDetail`.
- **review** — `getReviewQueue`, `getSubmissionDetail`; audit writes added to
  `setResponseReviewState` and `setItemReviewState`.
- **publishing** — `listPublicationQueue`, `getPublicAnswerForEditing`.
- **backlog** — `listBacklogForCourse`.
- **participation** — `getParticipationOverview`.
- **audit** — `listSectionAuditEvents`, plus six new action names.

### Routes (`src/app/`)

New: `/admin`, `/teach/courses`, `/teach/courses/[id]/templates`,
`/teach/sections/[id]/setup`, `/teach/sections/[id]/participation`,
`/teach/sections/[id]/participation/export`,
`/teach/sections/[id]/publications`, `/teach/sections/[id]/backlog`,
`/teach/sections/[id]/audit`.

Rebuilt: `/signin`, `/`, `/sections/[id]`, `/sections/[id]/history`,
`/sections/[id]/qa`, `/teach/sections/[id]/review`,
`/teach/sections/[id]/matches`, `/teach/sections/[id]/import`.

### UI

`src/app/globals.css` (design system), `src/components/layout/`
(AppShell + permission-derived nav), `src/components/ui/`,
`src/components/student/weekly-form.tsx`,
`src/components/staff/{template-editor,roster-import}.tsx`,
`src/lib/{session,staff-section,datetime}.ts`.

### Migrations

**None.** Every field required by this pass already existed. No migration was
added, and no destructive operation was run.

### Tests

`tests/integration/catalog.test.ts` (21) and
`tests/integration/operations.test.ts` (26). Integration tests: 43 → 90.

---

## 3. Privacy and authorization checks performed

- **Every new service authorizes before reading or writing**, using the
  existing `require*` helpers. `getSectionAccess` is used only to decide what
  to render; each action re-checks.
- **Identity masking is in the data, not the markup.** `getReviewQueue` and
  `getSubmissionDetail` omit the student object entirely for a TA without
  `view_student_identities`; a test asserts the name and student number are
  absent from the serialized payload.
- **Staff assignment cannot be self-escalated** — course-owner only (ADR-0003),
  with tests asserting a TA's flags are unchanged after a refused attempt.
- **Audit browsing is section-scoped** by collecting that section's entity ids;
  a test asserts a private response from another section never appears, and
  that a staff member of another section is refused outright.
- **Participation is identity-bearing**, so the dashboard requires the same
  `export_participation` capability as the CSVs; the download route sets
  `cache-control: no-store, private` and the service writes the audit event.
- **Student-facing pages were checked against a live database** for the
  original wording, other students' names, student numbers, validity, review
  state, and dispositions. None appear. The only student name in a student page
  is the signed-in user's own, in their account box.
- **RSC payload narrowed.** `AppShell` was receiving the whole `users` row, so
  `google_sub` and the admin flags were being serialized to the browser.
  `toShellUser()` now passes only the display name and email; verified absent
  from the rendered payload.
- **Dev login remains impossible in production** — unchanged, and the env unit
  test still covers it.
- **No PII leaves the system.** No AI service, no external call was added.

---

## 4. Commands run

| Command | Result |
|---|---|
| `npm run lint` | **Pass** |
| `npm run typecheck` | **Pass** (failed at baseline — see §5) |
| `npm test` | **Pass** — 5 files, 41 tests |
| `npm run test:integration` | **Pass** — 8 files, 90 tests |
| `npm run build` | **Pass** — 20 routes |
| `npm run db:migrate` / `npm run db:seed` | **Pass** |
| `npm run dev` + scripted HTTP matrix | **Pass** — 32/32 assertions |
| `docker compose up -d` | **Blocked by environment** — Docker Desktop's WSL integration is disabled in this distro, so the documented `db`/`db-test` containers could not be started |

**Environment workaround, stated plainly:** rather than skip integration
testing, a user-owned PostgreSQL 18 cluster was initialised in the session
scratchpad and `TEST_DATABASE_URL` was pointed at its `feedback_test` database.
The tests are real and really passed; only the container path was unavailable.
Nothing about the repository's documented Docker workflow was changed.

---

## 5. Defects found and fixed

Three defects survived `typecheck`, `lint`, and a successful production
`build`, and were caught only by driving the running application:

1. **Server actions captured a helper function.** Five pages defined a `back()`
   URL helper in the component body and used it inside `"use server"`
   closures. Everything such a closure captures is serialized, so Next threw
   *"Functions cannot be passed directly to Client Components"* and the setup,
   publications, backlog, matches, and templates pages rendered partially or
   500'd. Fixed by moving the helpers to module scope.
2. **A `"use client"` export called on the server.** The templates page called
   `emptyQuestion()` during server rendering, where an export of a client
   module is a client reference rather than a function. The page returned 500.
   The editor now seeds its own empty row and the helper is not exported.
3. **Over-broad RSC payload** — see §3.

Two further issues fixed as part of the rebuild:

4. **The weekly form discarded student input on a validation error.** The old
   page redirected with the message in the query string, losing everything
   typed. It now returns per-question errors to a controlled client component
   that keeps every value.
5. **Roster CSV was round-tripped through the query string**, which breaks on a
   real class list and writes student names into browser history and server
   logs. The CSV now stays in the form.

Also corrected: `setResponseReviewState` and `setItemReviewState` were the only
staff mutations writing no audit event.

---

## 6. Manual verification matrix

No browser test harness exists in the repository (Slice 6 defers Playwright),
so verification was scripted over HTTP against `npm run dev` with a seeded
database, driving real sessions through the dev-login provider.

**Authorization and rendering — 32/32 passed**

| Area | Assertions |
|---|---|
| Anonymous | `/` redirects to sign-in; sign-in states the archive is not internet-public; dev login shown only when enabled |
| Teacher | dashboard renders; all 11 staff routes return 200; review shows the staff-only cue; matches lists the pending account and the "nothing is verified automatically" notice; setup exposes the TA permission catalog and the generated cycles; audit shows recorded actions; participation CSV downloads with the expected header |
| Student, unconfirmed | sees the pending-confirmation state; denied the section form, the Q&A archive, the review inbox, participation, the CSV (**403**), platform admin, and course management |

**Pilot loop** — driven through the same services the server actions call,
then asserted on the rendered pages:

| Step | Result |
|---|---|
| Teacher confirms the pending account match | Pass |
| Student submits the open weekly form with a question | Pass |
| Teacher replies privately | Pass |
| Teacher publishes a reworded anonymous answer | Pass |
| Dashboard shows "Submitted" | Pass |
| Section page shows the immutable-submission state and offers no edit control | Pass |
| History shows the private reply, the published version, and "Answered" | Pass |
| Q&A archive shows the published answer and says "visible to this section only" | Pass |
| **Q&A archive contains no original wording, no student name, no student number** | Pass |
| **History exposes no validity, review state, or disposition** | Pass |
| **Student dashboard shows no staff review counters** | Pass |

No screenshots: no browser or screenshot tool was available in this
environment. All data used was seeded and synthetic.

---

## 7. Specification changes

One durable decision needed recording; nothing else changed a product rule.

- **ADR-0003 — the course owner alone controls staff assignment and TA
  permissions** (new, *accepted / provisional*). Owning document:
  [roles-and-permissions.md](roles-and-permissions.md) §2.3, which says TA
  permissions are "controlled by the class owner" but did not say whether a
  co-teacher counts, what is stored for role-based staff, or whether assignment
  may create an account. This is a **clarification** of an existing confirmed
  rule, resolved in the safest direction. Owner: product and technical owner.
  - Old behaviour: no write path existed at all.
  - New behaviour: owner-only assignment; teacher/co-teacher rows store all
    flags granted; assignment never creates an account.
  - Migration impact: none.
  - Remaining question: [Open D3](open-decisions.md) — who grants the teacher
    role. Implemented as "a platform admin does", the documented recommendation.

Updated: [CURRENT_STATE.md](CURRENT_STATE.md),
[REPOSITORY_MAP.md](REPOSITORY_MAP.md),
[DOCUMENT_MANIFEST.yaml](DOCUMENT_MANIFEST.yaml),
[decisions/README.md](decisions/README.md).

---

## 8. Assumptions recorded

Each is the least surprising documented default; none silently became a
product requirement.

1. **Audit browsing is not delegable to a TA.** The confirmed permission
   catalog has no audit flag, so it requires teacher/co-teacher/course-staff
   standing. Adding a flag would promote a recommendation into a requirement.
2. **Viewing the participation dashboard requires `export_participation`.** It
   is as identity-bearing as the CSV. Viewing is not audited; producing a file
   is, matching the existing rule.
3. **Reconfiguring a schedule retires the old one** rather than mutating it, so
   cycles already generated keep their provenance and their
   `(schedule, cycle_index)` uniqueness guarantee.
4. **One active schedule per section.** The schema permits more; the product
   describes one recurring weekly form.
5. **The section creator is recorded as its teacher**, otherwise a course-staff
   member could create a section they cannot then staff.
6. **Legacy bulk import stays anonymous**, matching the confirmed
   anonymous-by-default rule; per-item identity preservation was not exposed.

## 9. Unresolved pilot decisions

Unchanged and still owner-blocking before real student data:
**D2** (match auto-confirm — implemented as teacher-confirm-all),
**D3** (teacher-role granting), **D4** (edit-lock scope),
**D5** (grace/reopen), **D7** (institution timezone — `Asia/Manila`),
**D8** (merge scope), **D10** (deactivated-student access),
**D13** (retention). See [open-decisions.md](open-decisions.md).

## 10. Intentionally deferred

Out of scope for this pass and untouched: notifications, all AI features,
unpublishing, course-material management, comments/threads/reactions/voting,
attachments, PDF/Word export, LMS integration, native mobile clients,
microservices, Redis, pg-boss, a second API layer, a message broker, and a
vector database.

Deferred within scope, with the service layer already in place: the merge UI,
cycle question editing, match correction from the UI, backlog identity
preservation, a course-level backlog route, review-queue pagination, browser
end-to-end tests, and production deployment automation.

## 11. Commits

```
19e19a2 chore(build): exclude docs design drafts from type-checking
4400817 feat(modules): complete the pilot-critical service layer
634d433 feat(ui): add the app shell, design system, and student workspace
a71d6ee feat(staff): add the full teaching workspace
8686325 fix(ui): correct three defects found by running the app
e7d7533 test(modules): cover the new services and their authorization negatives
```
(plus the documentation commit carrying this report)

## 12. Recommended next action

Get owner sign-off on D2, D3, D5, D7 and D10 — they gate a real pilot but not
further local work — and add a Playwright suite for the three highest-risk
journeys: submit-once enforcement, the anonymity acknowledgment before publish,
and the negative-authorization matrix in §6. Both are more valuable than any
remaining feature.

**This is not a claim of production readiness.** Lint, typecheck, tests and
build passing means the code does what it says under seeded conditions. It has
not been through a security review, a load test, a backup/restore drill, or a
privacy review with a real small class.
