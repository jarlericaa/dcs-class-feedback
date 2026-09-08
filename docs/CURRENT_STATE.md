# Current State

**Snapshot date:** 2026-09-07
**Repository phase:** implementing the full [project-specs.md](project-specs.md)
scope. The setup, student and staff loops are pilot-usable; several Epic C–F and
post-pilot surfaces are **not built yet** and are listed plainly below.

This is a factual snapshot. Scope is in [mvp-scope.md](mvp-scope.md); resolved
decisions are in [open-decisions.md](open-decisions.md).

**The interface was redesigned in full on 2026-08-05.** The visual system is the
departmental noticeboard described in [DESIGN.md](../DESIGN.md), and **DESIGN.md
is the live design authority** — it wins over every other design document.
The live implementation handoff is
[CLAUDE_AUTONOMOUS_FULLSTACK_IMPLEMENTATION_PROMPT.md](../CLAUDE_AUTONOMOUS_FULLSTACK_IMPLEMENTATION_PROMPT.md).

The following are **historical records**, useful for reasoning but not to build
from: [UX-DESIGN-BRIEF.md](UX-DESIGN-BRIEF.md) (the earlier [Recommended]
direction DESIGN.md grew out of),
[CLAUDE_UI_SCREEN_SPEC.md](CLAUDE_UI_SCREEN_SPEC.md) (screen-level criteria
written in the account-matching era — its `/teach/sections/[id]/matches` section
describes a **removed** route and must never be implemented), and
[CLAUDE_UI_REDESIGN_REPORT.md](CLAUDE_UI_REDESIGN_REPORT.md) (the before/after
and verification record of that pass).

## Feature status against project-specs.md

`complete` = reachable through an authorized UI/API workflow **and** tested.
`service only` = the service and its tests exist, but no UI reaches it.

| ID | Feature | Status |
|---|---|---|
| A1 | Google SSO, domain allowlist | **complete** |
| A2 | Courses, sections, co-instructors, TA permission catalog | **complete** — both staff standing tiers are now grantable and visible: course-wide standing (owner-granted, Instructor-only, every section including future ones) and per-section grants carrying the TA catalog. Several people can be added in one action, with a section picker for the narrow scope. Settled in [ADR-0004](decisions/ADR-0004-course-wide-staff-standing.md); before 2026-09-06 a `course_staff` row could only be created by `createCourse` or the seed script, so the co-instructor half of this row was **not** in fact reachable |
| A3 | CRS roster import, per-row warnings, ignored/denied columns | **complete** as capability. The class-list screen accepts the official CRS-style `.xlsx`, uploaded CSV, or pasted CSV in one step, then reports the outcome; the editable preview remains available to service callers and tests |
| A4 | Deterministic UP-email student access | **complete** — a signed-in account resolves to the class-list row whose UP email equals its normalized email; no claim page, no confirmation step. Roster claims and account matching were **removed** 2026-08-07 ([student-identity.md](student-identity.md)) |
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
| `/claim` | **Removed** — redirects to `/`. Access follows from the UP email on the class list; there is nothing to claim |
| `/sections/[id]` | Weekly form: **save draft → submit → edit until the deadline**, repeatable questions, distinct general comment, read-only once locked, sanitized rich prompts with KaTeX |
| `/sections/[id]/history` | Student's own submissions, private replies, published-answer status |
| `/sections/[id]/qa` | Section-scoped Q&A archive with search, category and published-date filters. The asker reads **`Anonymous`**; each answer is **signed with the name of the staff member who published it** (issue #14) |
| `/forms/[id]` | One form instance as the student answers it, reached through its audience rather than through a section |
| `/admin` | Platform-admin account list and teacher-role grants |
| `/teach/courses` | Course and section creation |
| `/teach/courses/[id]` | The course workspace: its forms, their audience, delivery mode, state and response counts |
| `/teach/courses/[id]/forms/new` | Create a form and configure its delivery and audience |
| `/teach/courses/[id]/forms/[formId]` | One form: its questions, versions, schedule, audience, and generated occurrences |
| `/teach/courses/[id]/forms/[formId]/instances/[instanceId]` | One occurrence, including per-occurrence question customization |
| `/teach/courses/[id]/responses` | Course-scoped review queue across a form's whole audience. Renders the **occurrence's own question snapshot in its authored order**, prompts and help text through the shared sanitizing renderer (Markdown, code, KaTeX), a question the student left blank stated rather than dropped, and a long written answer collapsed with an expand (issues #10, #9). **Per-reader read state**: unread first, an `Unread only` filter in the URL, an unread count, a per-response read/unread toggle and a mark-all — persistent across sessions and devices, and each reader's own (issue #6) |
| `/teach/courses/[id]/sections` | Class lists of the course. Each card identifies its section and enters it; the per-card grid of the section's own destinations is gone, because the contextual column beside it already carried them (issue #11) |
| `/teach/courses/[id]/staff` | **Teaching team**: who has access to this course and to which sections, as one paginated list — course-wide standing and every section grant, each row stating its own scope. The owner appears once: the rows the platform writes for them by itself are suppressed, but a `ta` row somebody wrote for them deliberately is kept, because it is not removable and the owner holds everything anyway. Course staff read it; the owner alone adds staff at either scope and revokes a course-wide row |
| `/teach/courses/[id]/templates` | Template authoring, rich content help, student-question and general-comment configuration; saving creates a new immutable version |
| `/teach/sections/[id]` | Section entry point; redirects to the first view the reader's permissions allow |
| `/teach/sections/[id]/review` | Queue + detail inbox, filters, **three-state validity with the flag-vs-finalize split and a validity timeline**, private reply, public draft/publish |
| `/teach/sections/[id]/setup` | Section details; this section's teaching team — its own staff rows, their TA permissions, adding people to **this** class list, and a count of the course-wide instructors who also reach it. Course-wide standing is granted on the course's Teaching team page, not here |
| `/teach/sections/[id]/roster` | **Class list**: imported students with their UP email, the **whole student number** in UP format, dropped state, and whether that address has signed in. **Paginated, filtered and counted in the database** — only the rows on the page have their student number decrypted. Searchable by name, class-list name, email, and student number: a WHOLE number in either form (`2026-00001` or `202600001`, matched through the keyed lookup hash) or its last four. An arbitrary substring of a number cannot be searched — the plaintext is in no column (§11), and that trade is pinned by a test. The **import opens here as a modal** — official CRS-style XLSX, uploaded or pasted CSV, one step, then a panel naming the lines it refused and the students now dropped. No approve/reject/confirm/unlink controls |
| `/teach/sections/[id]/import` | **Removed** — forwards to the class list, where the import now lives as a modal |
| `/teach/sections/[id]/participation` | Built around **week and answer filters** (issue #15): one occurrence at a time, defaulting to the last one anybody answered, with a question/answer narrowing that reports what each student said, **paginated in the database**. `All weeks` gives the whole-term matrix. The section average and the participating-students figure are gone — neither named anybody to follow up |
| `/teach/sections/[id]/participation/export` | Five reports, `no-store`, audited. The three pre-existing CSVs — whole-term matrix, detailed responses, participating-student list — keep honouring the `export_participation` TA flag (decision **D17**). The two added in 2026-09 — **this week under the active filter** and the **responder list for encoding** (issue #8, CSV or XLSX, optionally including non-responders) — are **Instructor-only**: a Student Assistant holding the flag reads the dashboard and gets the three older files, and is refused these two |
| `/teach/sections/[id]/publications` | Drafts, scheduled answers, failed publications, retry/reschedule/cancel. A recently published question links to its entry in the class Q&A (issue #13) |
| `/teach/sections/[id]/backlog` | Course backlog triage, per-section drafting, anonymous legacy paste-import |
| `/teach/sections/[id]/audit` | Section-scoped, **paginated** append-only audit history, readable (issue #16): one sentence per entry naming actor, verb and object; a named-field before → after diff with the raw payload behind a disclosure; server-side filters for action (from the set the current scope can show, not the visible page), actor, and an inclusive date range in the section's timezone; the platform's own records withheld by default with an explicit "everything" scope. Scope includes the owning **course's** course-level records — where a section's forms, templates, schedules and backlog live, each writer recording `course_id` because those entities are reachable from no section — while a row naming a sibling section is excluded. A writer whose entity is deleted in the same transaction (`staff.removed`) records `section_id` for the same reason. No student is named as object, as actor, or in the actor filter's options — which offers staff, the scheduler, and "Students" as a group |
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
  URL;
- a contextual column that **keeps the course strip while the reader is inside
  one of that course's sections** — gated on course standing, since a delegated
  assistant has no course workspace — with the section's own groups below it in
  the order Weekly review · Class list · Reports · Setup (issue #11);
- an audit history a teacher can read: a sentence per entry, a named-field
  diff, the raw payload folded away, and action/actor/date filters that narrow
  in the database;
- participation around the week and answer filters a teacher can act on, with
  the filtered list paginated in the database and every export following the
  filter that produced it;
- the class list's import as a modal on the page it changes, applying in one
  step and then naming the file lines it refused and the students it dropped;
- per-reader read state on the review column: unread responses lead, an
  `Unread only` filter and the reader's position both live in the URL, an
  unread count sits beside the still-needs-a-reply figure, and every post
  carries a reversible read/unread toggle with a mark-all beside the count.
  **Each reader's own** — one assistant's reading never clears an instructor's
  queue — and never shown to a student (issue #6);
- a review column sized for bulk reading: a 68-character measure on every
  student's words, `pre-wrap` so a pasted list keeps its breaks, three
  distinguishable levels per question (prompt · help text · answer), and an
  answer past 520 characters or 8 lines collapsed behind a toggle. The clamp is
  applied **after hydration**, so nothing a student wrote is ever hidden from a
  reader whose JavaScript did not run (issue #9).

Not present:

- loading skeletons — pages are server-rendered per navigation, so the browser's
  own progress is the loading state. DESIGN.md §9 specifies what a structural
  `loading.tsx` should look like when one is added;
- a no-JavaScript path for staff MUTATIONS. Every deliberate staff action —
  invalidate, flag, reply privately, publish, add staff, and now import a class
  list — sits behind the `Dialog` primitive, which mounts its portal after
  hydration. Reading is entirely server-rendered and unaffected; the roster
  import lost the no-JS form it used to have as its own page when it became a
  modal (GitHub issue #12), which makes it consistent with every other staff
  action rather than an exception;
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
| `npm test` | **Pass** — **213 unit tests in 14 tracked files.** A local run also picks up an untracked `tests/unit/form-errors.test.ts` (6 tests), giving 219 in 15 files; **213 is the reproducible number for a clean checkout** |
| `npm run test:integration` | **Pass** — 22 files, **388** integration tests. Run with an explicit local Postgres URL rather than the Compose default: `TEST_DATABASE_URL=postgres://feedback:feedback@127.0.0.1:5432/feedback_test npm run test:integration` |
| `npm run build` | **Pass** — 26 application routes (29 build entries, including `/_not-found` and the two `/api` handlers) |
| `bash scripts/verify/http-matrix.sh` | **Pass** — 133 checks against a seeded database, including the negative-authorization cases |
| `impeccable detect` | **Pass** — 0 findings across `src/` |
| Migrations, clean database | **Pass** — `0000` → `0006` from an empty schema |
| Migrations, existing database | **Pass** — `0006` applied over a live `0000`–`0005` schema |
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
3. `0003` adds course-level forms, shared audiences and generalized form
   instances (hand-ordered: drizzle-kit emits `ADD COLUMN … NOT NULL` for three
   totals that must be backfilled first). See
   [FORMS-AUDIENCE-DYNAMIC-INSTANCES.md](FORMS-AUDIENCE-DYNAMIC-INSTANCES.md).
4. `0004` adds the deterministic UP-email identity column, hand-edited to carry
   its backfill ([student-identity.md](student-identity.md)).
5. `0005` drops the account-matching schema — `account_matches`, `roster_claims`
   and the normalized-name columns — with decision **D23**.
6. `0006` adds one table, `response_reads` — per-reader read state for the
   review column (GitHub issue #6). Additive and reversible: nothing is added to
   an existing table and no data is touched, so an older build runs unchanged
   against this schema and `DROP TABLE "response_reads"` is a complete rollback.
7. `0000`–`0006` are the migrations that exist today. The student-number
   plaintext column is still present and nullable: run
   `npm run db:backfill:student-numbers` (idempotent; refuses to finish unless it
   can prove there are no unsealed rows, no hash collisions, and that a sample
   decrypts correctly), then drop the column in a **follow-up migration after the
   backfill, applied as its own `db:migrate` run**. That migration has not been
   written yet; the script prints the exact steps.

## Immediate next work

1. The missing Epic C–F surfaces in the table above, in that order.
2. A Playwright suite for the required journeys.
3. Backup/restore scripts with the non-destructive verification procedure.
