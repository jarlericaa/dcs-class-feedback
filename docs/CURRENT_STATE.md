# Current State

**Snapshot date:** 2026-08-05
**Repository phase:** implementing the full [project-specs.md](project-specs.md)
scope. The setup, student and staff loops are pilot-usable; several Epic C–F and
post-pilot surfaces are **not built yet** and are listed plainly below.

This is a factual snapshot. Scope is in [mvp-scope.md](mvp-scope.md); resolved
decisions are in [open-decisions.md](open-decisions.md).

**The interface was redesigned in full on 2026-08-05.** The visual system is now
the departmental noticeboard described in [DESIGN.md](../DESIGN.md), which is the
design authority; [UX-DESIGN-BRIEF.md](UX-DESIGN-BRIEF.md) is the earlier
[Recommended] direction it grew out of, and
[CLAUDE_UI_SCREEN_SPEC.md](CLAUDE_UI_SCREEN_SPEC.md) still owns the screen-level
acceptance criteria and information architecture. Where their token tables
disagree with DESIGN.md, DESIGN.md wins. The before/after, verification results
and open items are in
[CLAUDE_UI_REDESIGN_REPORT.md](CLAUDE_UI_REDESIGN_REPORT.md).

## Feature status against project-specs.md

`complete` = reachable through an authorized UI/API workflow **and** tested.
`service only` = the service and its tests exist, but no UI reaches it.

| ID | Feature | Status |
|---|---|---|
| A1 | Google SSO, domain allowlist | **complete** |
| A2 | Courses, sections, co-instructors, TA permission catalog | **complete** |
| A3 | CRS **XLSX** roster import, CSV fallback, editable preview, per-row warnings, ignored/denied columns | **complete** |
| A4 | Student roster claim (student-facing), unlink | **complete** — `/claim`, throttled, non-disclosing; staff review, confirm-to-a-different-record, reject, and audited unlink on the matches page |
| A5 | Student numbers encrypted at rest + keyed lookup hash | **complete** — including an idempotent, self-verifying backfill script (`npm run db:backfill:student-numbers`) |
| B1 | Template builder, question types, required/optional | **complete** |
| B2 | Sanitized Markdown / code / links / https images / KaTeX, one shared renderer | **complete** |
| B3 | Repeatable student questions + distinct general comment | **complete** |
| B4 | Draft → submit → edit → deadline lock, revision trail, race safety | **complete** |
| B5 | Recurrence idempotency, timezone, pause/skip/reopen, per-occurrence override | **complete** |
| C1 | Response Analysis route (per-prompt grouping, charts, notes, XLSX/PDF) | **missing** |
| C2 | Valid / Flagged / Invalid workflow, flag-vs-finalize split, student-visible reason | **complete** |
| C3 | Course-scoped bonus periods and progress views | **schema only** |
| D1 | Item-level Question Inbox with triage actions | **missing** |
| D2 | Instructor-confirmed backlog (recommend → confirm), priority/assignee/target date | **schema only** — `copyOrMoveToBacklog` still has no UI |
| D3 | Merge + unmerge | **schema only** — `draftPublicAnswer` merges N items (tested), no unmerge, no UI |
| E1 | Private threads with student follow-ups | **partial** — staff→student replies work; follow-ups not built |
| E2 | Public approval, revisions, unpublish/restore | **schema only** |
| E3 | Q&A archive filters (full-text, date, cycle, period, pagination) | **partial** — search + category only |
| F1 | Email notifications (SMTP/fake/log adapters, idempotent outbox, reconciliation) | **complete** for form-opened, deadline reminders, and validity changes; private-answer / public-answer-linked / approval enqueues exist but their triggering workflows are not wired |
| F2 | Exports | **partial** — three identity-bearing CSVs; XLSX/PDF/bonus/backlog-status not built |
| F3 | Course archive + clone | **partial** — read-only enforcement is built into the authorization layer; archive/restore/clone services and UI are not |
| P1 | Legacy import (Typst/CSV/XLSX, preview, mapping) | **partial** — paste-only anonymous import; schema for staged rows exists |
| P2 | Reactions + moderated comments | **schema only** |
| — | Browser/E2E suite | **missing** — `scripts/verify/http-matrix.sh` is the only end-to-end check |
| — | Backup/restore scripts + verification procedure | **missing** |

## Implemented routes

| Route | What works |
|---|---|
| `/signin` | Google OAuth when configured; dev-login outside production |
| `/` | Role-aware dashboard with per-section cycle state and staff attention counts |
| `/claim` | **Student roster claim**: enter a student number; the reply is identical whether or not it matched, so the page cannot be used to look up a classmate |
| `/sections/[id]` | Weekly form: **save draft → submit → edit until the deadline**, repeatable questions, distinct general comment, read-only once locked, sanitized rich prompts with KaTeX |
| `/sections/[id]/history` | Student's own submissions, private replies, published-answer status |
| `/sections/[id]/qa` | Section-scoped Q&A archive with search and category filter |
| `/admin` | Platform-admin account list and teacher-role grants |
| `/teach/courses` | Course and section creation |
| `/teach/courses/[id]/templates` | Template authoring, rich content help, student-question and general-comment configuration; saving creates a new immutable version |
| `/teach/sections/[id]/review` | Queue + detail inbox, filters, **three-state validity with the flag-vs-finalize split and a validity timeline**, private reply, public draft/publish |
| `/teach/sections/[id]/setup` | Section details, teaching team + TA permissions, weekly schedule, cycle management |
| `/teach/sections/[id]/matches` | Teacher-confirm-all match review, **student claim requests with both names side by side**, **audited unlink**, and the class list (last-4 numbers only) |
| `/teach/sections/[id]/import` | **XLSX upload or pasted CSV → editable preview → confirm** |
| `/teach/sections/[id]/participation` | Derived participation matrix (last-4 student numbers on screen) |
| `/teach/sections/[id]/participation/export` | Three participation CSVs, `no-store`, audited |
| `/teach/sections/[id]/publications` | Drafts, scheduled answers, failed publications, retry/reschedule/cancel |
| `/teach/sections/[id]/backlog` | Course backlog triage, per-section drafting, anonymous legacy paste-import |
| `/teach/sections/[id]/audit` | Section-scoped, **paginated** append-only audit history |
| `/api/internal/scheduler/tick` | Secret-protected sweep: cycles, response locking, reminders, publication, **email delivery** |

## UI maturity

Every route renders inside the same workspace chrome — a white top bar, a rail
derived from the same effective permissions the server enforces, landmarks, a
skip link, breadcrumbs and a privacy note in the rail footer.

Present:

- responsive layout verified at 320, 390, 768, 1024 and 1440: a persistent rail
  at desktop, a keyboard-accessible `<details>` drawer below 860px, and a
  URL-driven list/detail stack for the Q&A archive and the review inbox;
- one token set, a strict 4px spacing scale, 0/2/3px radii, hairline borders and
  no resting shadows;
- two type registers — self-hosted Charter for text a human wrote, the platform
  sans for everything the system says;
- a drawn SVG icon set; no Unicode glyph or emoji stands in for an icon;
- empty, error, success, unauthorized, closed-week and no-results states, each
  with copy naming what to do next;
- a visible global focus ring on every control including date and time inputs,
  `aria-invalid` + `aria-describedby` on failing fields **and grouped choices**,
  and status conveyed as a word plus a drawn shape plus a tone — never colour
  alone;
- an accessible publication acknowledgment guard that preserves the teacher's
  public-question and answer fields while the service remains the security
  backstop;
- review, category and week filters, and audit/backlog pagination, all in the
  URL.

Not present:

- loading skeletons — pages are server-rendered per navigation, so the browser's
  own progress is the loading state. DESIGN.md §9 specifies what a structural
  `loading.tsx` should look like when one is added;
- a browser end-to-end suite (see below).

## Notable invariants now enforced by the database

- One response per `(cycle, student)`; the draft, the submission and the locked
  version are the same row, so an edit cannot mint a second credit.
- `lifecycle = 'draft'` **iff** `submitted_at IS NULL`; `'locked'` **iff**
  `locked_at IS NOT NULL`.
- An `invalid` response must carry a **student-visible reason**.
- One live general comment per response; question items carry an ordinal.
- `weekly_cycles (section_id, open_at)` is unique — the last duplicate-week race
  is closed at the database level rather than by a read-then-insert guard.
- `student_records.student_number_hash` is unique, so student-number uniqueness
  survives encryption.
- `email_outbox.idempotency_key` is unique, so a retried sweep cannot double-send.

## Verification snapshot

| Check | Result |
|---|---|
| `npm run lint` | **Pass** |
| `npm run typecheck` | **Pass** |
| `npm test` | **Pass** — 6 files, 66 unit tests |
| `npm run test:integration` | **Pass** — 12 files, 171 integration tests |
| `npm run build` | **Pass** — 21 routes |
| `impeccable detect` | **Pass** — 0 findings across `src/` |
| Migrations, clean database | **Pass** — `0000` → `0001` → `0002` from an empty schema, 38 tables |
| Migrations, existing database | **Pass** — `0001` + `0002` applied over the live `0000` schema, with backfills |
| `npm run test:e2e` | **Not implemented** |
| Backup/restore verification | **Not implemented** |

Integration tests need PostgreSQL: `docker compose up -d db db-test`.

## Migration notes

Migrations must be applied in order and, where noted, in separate runs, because
drizzle's migrator wraps all pending files in one transaction:

1. `0001` adds **only** the `public_answer_state.awaiting_approval` enum value.
   Postgres forbids *using* a value added in the same transaction, so nothing
   else may live in that file.
2. `0002` carries every table, column, constraint and index, plus hand-written
   backfills that must run **before** the new CHECK constraints are added, and a
   pre-check that fails with an actionable message if duplicate weeks already
   exist.
3. The student-number plaintext column is still present and nullable. Run
   `npm run db:backfill:student-numbers` (idempotent; refuses to finish unless it
   can prove there are no unsealed rows, no hash collisions, and that a sample
   decrypts correctly), then drop the column with a third migration applied as its
   own `db:migrate` run — the script prints the exact steps.

## Immediate next work

1. The missing Epic C–F surfaces in the table above, in that order.
2. A Playwright suite for the required journeys.
3. Backup/restore scripts with the non-destructive verification procedure.
