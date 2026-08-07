# Claude Implementation Plan — pilot-usable full-stack pass

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


**Status:** working plan for the current implementation session.
**Owner document for outcomes:** [CLAUDE_IMPLEMENTATION_REPORT.md](CLAUDE_IMPLEMENTATION_REPORT.md).

This plan follows the autonomous full-stack handoff in
`CLAUDE_AUTONOMOUS_FULLSTACK_IMPLEMENTATION_PROMPT.md`. It is deliberately
short and is updated as reality changes.

## Baseline evidence (verified in this checkout, not assumed)

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | **Fail before this pass** — `docs/page.tsx`, `docs/page(1).tsx` are design-reference drafts importing a component that does not exist |
| `npm test` (unit) | Pass — 5 files, 41 tests |
| `npm run test:integration` | Pass — 6 files, 43 tests (see environment note) |
| `npm run build` | Pass |

**Environment note.** Docker is unavailable in this WSL distro, so
`docker compose up -d` cannot provide the documented `db`/`db-test`
containers. PostgreSQL 18 is installed locally, so this session runs a
user-owned cluster from the scratchpad directory on port 5432 with `feedback`
and `feedback_test` databases, and passes
`TEST_DATABASE_URL=postgres://feedback:feedback@127.0.0.1:5432/feedback_test`
to the integration project. Test coverage is therefore real, not simulated.

## Backend audit summary

Already implemented and **not** to be rewritten: schema/migrations, Auth.js
Google + hard-disabled-in-production dev login, deny-by-default resource-scoped
authorization, name normalization/matching, roster import, template versioning,
cycle generation/open/close, submission with server-side validation and the
one-per-cycle constraint, review/validity, private responses, public answers
with source links, anonymity warnings, scheduled publication with
reconciliation, derived participation and the three CSV exports, append-only
audit writes.

Pilot-critical gaps confirmed by reading the source (service missing, not just
UI missing):

| Gap | Evidence |
|---|---|
| Course/section creation | `src/modules/catalog/` is read-only; audit actions `course.created` / `section.created` are declared but never emitted |
| Staff assignment + TA permission editing | `staff.permissions_changed` declared, never emitted; no service writes `section_staff` outside the seed |
| Teacher-role grant (D3) | `users.isTeacher` is only ever set by the seed |
| Recurrence schedule configuration | `recurrence.configured` declared, never emitted; schedules only exist via the seed |
| Template listing/authoring surface | `createTemplate` / `createTemplateVersion` exist with no caller besides the seed |
| Cycle management surface | `reopenCycle` / `skipCycle` / `cycleHasSubmissions` exist with no caller |
| Publication queue + retry | `schedulePublication`, `cancelScheduledPublication`, `publishFailed` have no read model and no UI |
| Backlog triage / legacy import surfaces | services exist with no read model and no UI |
| Participation dashboard + CSV download | services exist with no route that can deliver a file |
| Audit browsing | no read service at all |
| Student input preservation on validation failure | `src/app/sections/[id]/page.tsx` redirects with a query-string error, discarding everything the student typed |

## Slices, in build order

1. **Baseline safety** — exclude `docs/` from type-checking, write this plan.
2. **Catalog services** — courses, sections, section staff + TA permission
   catalog, platform-admin teacher grant, section context read model.
3. **Forms services** — recurrence schedule configuration, cycle listing with
   edit-lock state, template listing/authoring reads.
4. **Operations services** — publication queue + retry, section/course audit
   browsing, backlog listing, participation read model.
5. **Design system + app shell** — tokens and shared components from
   `UX-DESIGN-BRIEF.md` / `CLAUDE_UI_SCREEN_SPEC.md`, applied to every route.
6. **Student loop** — sign-in, dashboard, weekly form with preserved input and
   inline errors, submitted confirmation, history, Q&A archive.
7. **Staff workspace** — review inbox/detail, setup (section, staff, schedule,
   templates, cycles), roster import + matches, participation + exports,
   backlog + legacy import, publication queue, audit history.
8. **Tests** — integration coverage for every new service, positive and
   negative authorization.
9. **Verification and documentation** — full check run, manual verification
   matrix, `CURRENT_STATE.md` / manifest / ADR updates, implementation report.

## Rules held constant

Section-scoped "public"; no student ever sees identity, validity, disposition,
drafts, notes or audit; submissions immutable; participation derived; roster
matching teacher-confirmed and audited; authorization server-side only; dev
login impossible in production; every important mutation audited; no AI, no
deferred features.
