# Implementation Plan — open GitHub issues #4–#17

> **Partly historical since 2026-09-12.** [ADR-0005](../decisions/ADR-0005-course-scoped-teaching-workflow.md)
> made the publication queue and Class Q&A **course**-owned, so the route and
> symbol names quoted below are stale: `/sections/[id]/qa` is now
> `/courses/[id]/qa`, `/teach/sections/[id]/publications` is now
> `/teach/courses/[id]/publications`, and `listSectionQa` is `listCourseQa`. The
> issues' substance (copy, filters, linking a published question to its entry)
> was delivered and is unaffected; the line references are kept as written
> rather than rewritten, because they describe where the work was found at the
> time. Current routes: [current-state.md](../engineering/current-state.md).

**Status: current.** This is the working plan for the open issue set, written
2026-09-07 after reading every live issue body with `gh` and reconciling each
against [current-state.md](../engineering/current-state.md),
[specification.md](../product/specification.md),
[decisions/open-decisions.md](../decisions/open-decisions.md) and the actual source under `src/`.

Issue #17 is **already implemented** (course-wide vs section staff standing,
owner-only assignment, atomic batch assignment with audit in the same
transaction, archived-course read-only, paginated teaching-team reads). Its
invariants are load-bearing for several issues below and are **not** to be
relaxed — see [§6](#6-invariants-that-must-survive-every-milestone).

---

## 1. What the issues actually are, against the source

Each row is what the code says today, not what the issue body assumes.

| # | Issue | What the source actually shows | Verdict |
|---|---|---|---|
| 4 | Typst/LaTeX support | **Body is empty.** LaTeX math is already implemented end-to-end: `remark-math` + `rehype-katex` with `trust:false` in `src/modules/richtext/render.ts`, the KaTeX classes are allowlisted in `src/modules/richtext/schema.ts`, `katex/dist/katex.min.css` is imported in `src/app/layout.tsx`, and the student form renders prompts through it (`src/app/forms/[id]/page.tsx:189`). **Typst is not implemented anywhere.** Two incompatible readings: render Typst markup, or parse legacy Typst files (`P1`, product/specification.md §14) | **Ambiguous — investigate, do not close.** [§4](#4-4-typstlatex--ambiguous) |
| 5 | Automated production backups | No backup tooling exists. `scripts/` has `migrate.ts`, `reset-db.ts`, `seed.ts`, `backfill-student-numbers.ts`. `docs/engineering/deployment.md` §5 already has an unticked "verify database backups and a restore test". The hosting provider is **[Open D12]** and PRODUCT.md:157 records the backup service as **[Open]** | **Blocked on production credentials.** Safe local piece + documented restore procedure. [§5](#5-blockers-that-need-the-owner-or-production-access) |
| 6 | Seen/unseen review state | `src/lib/reviewed-session.ts` is a **session cookie of response ids**, capped at 150, deliberately not persisted ("a property of one person's afternoon"). It marks a post the reader *acted on*, not one they *read*. No `response_reads` table. Nothing persists across devices | Real gap. Needs a migration. **M3** |
| 7 | Admin impersonation | No impersonation path. `src/auth.ts` resolves one session identity; `src/modules/authz` is deny-by-default and resource-scoped; `student_number.revealed` is the only "look at a student" audit action declared, and it is never written | **Security-sensitive.** Design + non-delegable authz decision needed. [§5](#5-blockers-that-need-the-owner-or-production-access) |
| 8 | Export who has responded | `src/modules/participation/index.ts` has three CSVs; the closest is `participantListCsv`, which is **whole-section, deduplicated across a cycle range** — not "this week's responders". `src/modules/exports/tabular.ts` already has `toXlsxBuffer`, currently unused by any route | Real gap. Shares its filter model with #15. **M5** |
| 9 | Responses grid too cramped | The review surface is `/teach/courses/[id]/responses` (the section route is a redirect). `.post` in `globals.css:2179` is a 3-column grid separated by a 1px hairline inside one panel, `padding: var(--s5)`; `.post__words` has no measure cap and no long-answer handling | Real. Same surface as #6/#10; the issue says design with #6. **M2** |
| 10 | Review renders real encoded questions | Driven by the **snapshot**, not hardcoded: `reviewQueue` reads `formQuestions` for the occurrence `orderBy displayOrder` and joins `questionAnswers` (`src/modules/review/index.ts:387–503`). Three real defects: (a) prompts render as **plain strings** (`{answer.prompt}`, and `shortPrompt()` cuts to 32 chars) while the student form renders the same prompts as rich text, so an authored Markdown/LaTeX prompt is unreadable to staff; (b) a question with **no answer is silently dropped** — `unansweredCount` is computed and never rendered, so "not asked" and "skipped" look identical; (c) `question.description` never appears | Real bug behind a "verify" title. **M2** |
| 11 | Nav: section link grid, course tabs, group order | (1) `src/app/teach/courses/[id]/sections/page.tsx:214–234` renders `staffSectionTabGroups` as a per-card link grid — the same destinations as the contextual column. (2) `staffSectionTabGroups` never includes course tabs, so entering a section drops Forms/Responses/Class lists; `courseTabGroups` already does the inverse fold-in. (3) Group order is Review → Class list → Weekly review → Reports → Setup | Real, all three. **M1** |
| 12 | Class list: numbers, counts, CSV dialog | `Student number ending 0001` at `roster/page.tsx:220`; the two `.tally` spans at `:139–147` render as `2 on the list2 signed in`; `Import` is a nav row (`nav.ts:346`) and a full page with an editable preview/confirm step; the importer accepts XLSX **and** pasted CSV. Seed uses `2026-0001` (4-digit tail), which is why the mask reads `…0001` | Real. Note the format finding in [§3](#3-decisions-this-plan-makes-and-the-owner-may-reverse). **M4** |
| 13 | Link published question to its answer | `publications/page.tsx:372` renders the title as `<strong>`; the `Live to this section` stamp at `:382` is the only affordance. The target href already exists and is used by the review feed: `/sections/[id]/qa?selected=<answerId>` | Real, small. **M1** |
| 14 | Class Q&A copy and filter | All five items confirmed at `src/app/sections/[id]/qa/page.tsx:302`, `:322`, `:303`, `:334–337`, `:41`. Two need more than copy: the answering teacher's name is **not in the projection** (`listSectionQa` returns no author), and `Anonymous` unqualified is currently forbidden by CONTENT-VOICE P3 | Real; two policy calls in [§3](#3-decisions-this-plan-makes-and-the-owner-may-reverse). **M1** |
| 15 | Participation around week/answer filters | `participation/page.tsx` renders four figures (including `averageWeeks`) plus the whole-section matrix; `participants` is one of three export buttons. `getParticipationOverview` takes no filter arguments and `deriveParticipation` returns the full matrix | Real. Answer-filtering needs a new read path over `questionAnswers`. **M5** |
| 16 | Readable audit history | `src/lib/audit-labels.ts` already maps ~130 action codes to sentences, so item 1 is largely done. Not done: the entry is a label plus a meta list, not a sentence naming actor and object; `before`/`after` render as `JSON.stringify(...)` in a `<pre>` (`audit/page.tsx:125`); the only filter is action, and its options come from the visible page; every action reachable from the section is shown to everyone with non-TA standing | Real. **M6** |
| 17 | Section setup add-staff dialog + staffing model | **Implemented.** Two tiers, owner-only assignment (`requireCourseOwner`), atomic batch with one `batchId` audit, archived courses offer no mutation, both catalog reads paginate at the database | Done — protect, do not revisit |

---

## 2. Milestones, in order

Each milestone is independently shippable, lands its own regression tests, and
leaves no route unreachable. Every server contract lands before the UI that
offers it.

### M1 — Navigation and the read views · #11, #13, #14 — **shipped**

Chosen first because navigation is the frame every other fix is read through,
because none of it needs a migration, and because #9 must be designed together
with #6 (the issue says so) and #6 needs schema. Three issues close completely.

- `nav.ts`: prepend the course strip to `staffSectionTabGroups` when the reader
  has course standing, suppressed when `courseTabGroups` is already the caller
  (otherwise the single-section fold-in would print the strip twice); reorder
  Weekly review above Class list; keep `firstStaffSectionHref` stable by
  preferring a destination other than the always-present Q&A archive.
- `courses/[id]/sections/page.tsx`: drop the per-card link grid, make the card
  identify and enter the section.
- `publications/page.tsx`: title becomes the link to the Q&A entry; the stamp
  becomes a plain status marker.
- `qa/page.tsx` + `listSectionQa`: the five copy/filter items, with the
  answering staff name added to the projection.
- **Deliberately not in M1:** removing `Import` from the nav group. That row is
  #12's, and removing it before #12's dialog exists would leave the import
  route reachable only by typing the URL.

### M2 — The review surface · #10, #9 — **shipped**

Delivered as planned, with two deviations, both recorded here rather than
left as surprises:

- **Authored order is now preserved.** The plan kept the old
  measurements-above-prose grouping; that grouping read the form back to a
  teacher in an order nobody had authored, which is precisely what #10 objects
  to. Runs of *adjacent* measurements are still grouped into one aligned block,
  so a scale stays comparable down the page, but a block never jumps a question
  that came before it.
- **The clamp is a client component, not a pure-CSS `<details>`.** A
  disclosure's accessible name is its summary's content, so the `<details>`
  form would have named the button with the entire answer and left a screen
  reader with no separate text to read. `LongText` clamps only after
  hydration, so nothing a student wrote is hidden from a reader whose
  JavaScript did not run.

Also: prompts and help text render through the shared sanitizing renderer, the
meter label is a `richTextToPlain` projection because a cell label must not
carry markup, an asked-and-blank question is stated instead of dropped, and the
seed's demo week now contains real authored content — LaTeX in a prompt, a long
answer, and a skipped optional question — which is #10's fourth checkbox.

### M3 — Seen/unseen review state · #6 — **shipped**

Delivered as planned: migration `0006` adds `response_reads`, the service lives
in `src/modules/review/reads.ts` behind the same `reviewResponses` gate the
queue uses, and `reviewed-session.ts` stays because "acted on in this sitting"
is a different question from "read".

The issue's three open questions, answered — each the least surprising default,
and each one edit away from being reversed:

1. **What counts as read?** A person pressing **Mark as read**, or resolving the
   post (replying, publishing, declining, deciding validity) — which one cannot
   do without having read it. **Viewport tracking is deliberately not built**:
   scrolling past something is not reading it, and a queue that empties itself
   as you scroll is worse than one that does not empty at all. It would also
   need an intersection observer plus one write per row on a server-rendered
   page, and nothing in the existing suite could test it.
2. **Per user or shared?** **Per reader.** A shared marker would let one
   assistant's skim hide a submission from the instructor who still has to
   decide on it, so the queue could empty with nothing answered.
3. **An escape hatch?** Both: a per-response **Mark as unread**, and a
   **Mark N as read** that clears exactly what the current filters show — never
   silently reaching past the screen.

One deviation from the issue's wording. It suggests seen responses could be
"collapsed or filtered out **by default**"; they are not. Unread leads the
column and the count says how much is left, but nothing is hidden on arrival:
hiding two thirds of a week makes "where did the rest go?" the first question a
teacher asks, and puts the number on the page at odds with the count in the
navigation. `Unread only` is one click away and lives in the URL.

Audit: the deliberate marks are audited (who opened whose submission is a
privacy-relevant access record); a read implied by resolving a post is not,
because the resolving action already has its own row. A mark-all writes ONE row
carrying a count rather than forty rows saying the same thing — the audit log is
already the subject of #16.

### M4 — Class list and CSV import · #12 — **shipped**

All four parts delivered: the whole student number for `viewStudentIdentities`
holders, one count phrase, the import as a CSV-only modal that applies in one
step, and `Import` out of the nav group. **No migration** — nothing about this
needed schema.

Two things worked out better than planned:

- **The outcome screen needed no new persistence.** The plan said the result
  screen would have to report blocked and deactivated rows, which looked like
  extending `ImportSummary`. It did not: the commit already writes
  `roster.row_rejected` audit rows carrying the file line and the reason codes,
  and `roster.row_deactivated` rows carrying the student record id. So
  `getRosterImportOutcome` assembles the whole screen from what was already
  persisted, and **nothing had to be added to the audit log** — which matters,
  because those rows deliberately carry no student number, name or address.
- **The display formatter is narrower than "reformat a number".** It restores
  the separator for exactly one shape — four-digit entry year, five-digit
  serial — and prints anything else verbatim. A mis-split identifier is worse
  than an unpunctuated one, and this formatter must never be the reason two
  students look alike.

Deliberate consequences, recorded rather than left to be discovered:

1. **Viewing a whole number is not audited.** Consistent with
   `getParticipationOverview`: the capability is granted and revoked under
   audit, and one log row per page view — per reload, per search — would bury
   the events the log exists for. Producing a **file** stays audited.
   `student_number.revealed` remains declared and unwritten, reserved for a
   per-student reveal action if one is ever added.
2. **The import now needs JavaScript.** It was a plain server-rendered form on
   its own page; as a modal it sits behind the `Dialog` primitive, which mounts
   after hydration. That makes it consistent with every other deliberate staff
   action in the app — invalidate, flag, reply, publish, add staff — rather than
   an exception, and it is recorded in `engineering/current-state.md`'s "Not present" list.
3. **`previewRosterImport`, `applyPreviewEdits` and `parseRosterXlsx` all
   survive** with no caller in `src/`. They are real capability — the
   registrar's export is a spreadsheet — and the issue asked to drop the UI, not
   the parser. `previewRosterImport` also remains the planner the integration
   tests hold to account.

### M5 — Participation filters and the responder export · #15, #8 — **shipped**

The page now opens on **one week** — the last one anybody answered — with a
question/answer filter beside it, and `All weeks` as an explicit choice that
gives the whole-term matrix. `averageWeeks` and the participating-students
figure are gone. The responder export is one click, CSV or XLSX, optionally
carrying non-responders.

Deviations from the plan, and the reasoning:

- **`deriveParticipation` was left alone.** The plan said it would gain a cycle
  filter. It computes the whole matrix in memory, which is right for a matrix
  and wrong for a filtered list — and the instruction for this milestone was
  genuine database pagination. So the week view is a new query
  (`listCycleParticipation`) that pages and counts in Postgres, and the matrix
  keeps its own read model for the view that genuinely wants every cell.
- **Correlated sub-selects, not a join.** A checkbox answer has one row per
  chosen option, so joining `question_answers` would multiply a student across
  pages and break both the count and the pagination. The scope builder resolves
  the response, the timestamp, the validity and the answer labels as
  sub-selects, which keeps the row count one per student by construction.
- **Answer filtering is per week, and only for enumerable questions.** A
  question belongs to one occurrence's snapshot, so "that answer" has no meaning
  across a term whose forms may differ; and a free-text question has nothing to
  enumerate, so it is not offered rather than offered and then unable to answer.
- **A filter that cannot be honoured returns NOTHING.** A bad answer key, a
  question from another occurrence, an option id that does not exist: all yield
  an empty list. Widening a filter silently is how a teacher contacts the wrong
  students, so it is a tested property.
- **Student numbers are written in the reading format in every export**, not
  only the new ones. `2026-00001` is what the encoding sheet holds; the
  normalized `202600001` would not match on a lookup. One helper, one place.

Default, as chosen and documented: the **most recent occurrence anybody
answered**; the whole-term matrix when a section has collected nothing, since
"this week" has no meaning yet. Both are one explicit choice apart in the URL.

### M6 — Readable audit history · #16 — **shipped**

All five items: a sentence per entry, a named-field before → after diff, the
raw payload behind a disclosure, action/actor/date-range filters applied in
SQL, and an explicit teacher-facing allowlist. Rules recorded in
[domain/domain-model.md](../domain/domain-model.md#41-how-the-log-is-read-confirmed-2026-09-08--github-issue-16).

Four things worth naming:

- **The allowlist is derived, not hand-kept.** `AuditAction` was a union type,
  which cannot be enumerated at runtime — so the filter would have had to
  repeat it. It is now `AUDIT_ACTIONS`, a const array in its own importless
  module, with the type derived FROM the list; the allowlist subtracts a named
  denylist of the platform's own records. A newly added action is therefore
  teacher-facing until somebody decides otherwise, which is the safe direction.
- **No student is named as the ACTOR either.** The object was the obvious half
  — student-shaped entities resolve to a noun — but the actor of a submission
  *is* the student, and the first draft happily printed "Juan Dela Cruz
  submitted a form" in a browser check. The handful of student-performed
  actions now read "A student", keyed on the action so a staff member who is
  also enrolled cannot defeat it. Accountability is not lost: the row keeps its
  actor, and the review inbox names the student against the submission.
- **`richTextToPlain` had to leave the server-only module.** A subject label may
  be staff-authored rich text and must arrive flattened, but importing the
  flattener pulled `server-only` into the audit module — and broke `db:seed`,
  `db:migrate` and the scheduler, none of which run under a bundler that can
  resolve it. It now lives in `src/modules/richtext/plain.ts`, importless, with
  `render.ts` re-exporting it so every existing import is unchanged. Caught by
  running the seed, not by any test.
- **Reading the log made a WRITE-side gap visible.** The predicate was correct
  and the history was still incomplete, because a row is only reachable if the
  writer recorded a scope or the entity is still findable from the section.
  Neither held for course-owned entities (`course.created`, `course.updated`,
  `template.version_created`, `legacy.imported`, `backlog.*` — a backlog
  question or a form version belongs to no section) or for `staff.removed`,
  whose `section_staff` row is deleted in the same transaction. Those writers
  now record `course_id`/`section_id` from the resource their own
  authorization check already validated, in the transaction they already had.
  `user.teacher_role_changed` stays deliberately unscoped: it is platform
  administration, owned by no course. Publication and review rows were already
  reachable through the fan-out and now say so on the row, so scoping no longer
  rests on the legacy path.
- **Date bounds are the section's calendar days.** `from` starts at local
  midnight and `to` ends at the next local midnight, so `from == to` is one
  whole day and a row at 00:30 Manila is not filed under the previous UTC day —
  a boundary a UTC comparison gets wrong by up to a day.

### M7 — Investigations, not implementations · #4, #5, #7

Findings, blockers and the safe local pieces named in [§4](#4-4-typstlatex--ambiguous)
and [§5](#5-blockers-that-need-the-owner-or-production-access). Nothing here is
reported as a closed issue without an owner decision.

### M8 — Documentation and verification sweep

`engineering/current-state.md` routes/UI-maturity/verification rows,
`engineering/testing.md` counts and invariants, and the link/anchor check, once
behaviour has stopped moving.

---

## 3. Decisions this plan makes, and the owner may reverse

These are places where an issue asks for something a current document forbids
or a current invariant protects. Each is implemented **as the issue asks**,
because the issue is owner-stated, and each is recorded here so the reversal is
one edit rather than an archaeology exercise.

1. **`Anonymous` in the Q&A archive (#14).** CONTENT-VOICE P3 forbids the bare
   word because it "would imply a guarantee the system does not make"; the code
   comment at `qa/page.tsx:296` says the same. The issue asks for exactly that
   word. Implemented as asked; CONTENT-VOICE is corrected to record the
   owner's call rather than left contradicting the running app.
2. **The answering teacher's name becomes student-visible (#14).** Today staff
   names are staff-facing only — `src/modules/review/index.ts:403` says the
   student's view stays "your teaching team". Naming the answerer is a
   deliberate widening, limited to the **answer author** on a **published**
   entry. The asker's anonymity is untouched, and no source link, draft or
   identity is added to the projection.
3. **Full student numbers on screen (#12).** The plaintext is normalized before
   sealing (`normalizeStudentNumber` strips the dash), so `2026-00001` is
   **not** recoverable from the ciphertext — only `202600001` is. The list will
   therefore reformat a 9-digit number as `YYYY-NNNNN` for display. That is a
   presentation-level assumption about UP's format, stated here rather than
   hidden in a helper. Page reads stay unaudited, consistent with
   `getParticipationOverview` ("viewing is not audited; producing a file is").
4. **Dropping the roster preview/confirm step (#12).** The preview is what
   currently shows a teacher which rows are blocked and which enrolments will
   be deactivated before anything is written. `commitRosterImport` re-derives
   every action inside its own transaction, so correctness does not depend on
   the preview — but the teacher loses the chance to correct a file first. The
   result screen must therefore report blocked and deactivated rows in full.

---

## 4. #4 Typst/LaTeX — ambiguous

The issue has **no body**. The repository supports the two readings differently:

- **LaTeX math: already implemented.** `renderRichText` runs
  `remark-math → sanitize → rehype-katex` with `trust:false`, `maxExpand:1000`
  and `maxSize:50`; the three `language-math` / `math-inline` / `math-display`
  classes are allowlisted so sanitizing cannot silently turn a formula into
  inline code; `katex.min.css` ships from the root layout. Teacher-authored
  prompts, descriptions and public answers all go through it. **Student text
  never does, by design** (product/specification.md §11) and that must not change.
  The one real defect is that the **staff review view does not use the
  renderer** — which is #10, and is fixed in M2.
- **Typst: not implemented, and two different features.** Rendering Typst
  markup in prompts would mean a second content pipeline beside the one
  sanctioned sanitizer, which AGENTS.md §13 forbids adding casually. Parsing
  legacy `.typ` files is approved scope (`P1`) but only paste-only anonymous
  import exists today (`docs/engineering/current-state.md`, `domain/legacy-question-import.md`).

**Required from the owner:** which of the two #4 means. Nothing is built for it
until then; M7 reports the above and no more.

---

## 5. Blockers that need the owner or production access

| # | Blocker | Why it cannot be closed locally | Safe local piece |
|---|---|---|---|
| 5 | Backup mechanism, retention policy, schedule, test restore | The hosting provider is **[Open D12]** and the backup service is **[Open]** (PRODUCT.md:157). Provider snapshots vs scheduled `pg_dump` is a hosting decision, and a *proven* backup needs credentials for the real database and its object store. A test restore against the local dev cluster proves the script, not the production path | A `pg_dump`/restore script plus a written, step-by-step restore procedure in `docs/`, verified against a scratch local database, with the production wiring left explicitly unticked |
| 7 | Admin impersonation | Three things need owner decisions before code: whether impersonation is read-only (the issue says "unless that is explicitly decided otherwise"), which capability grants it — this is a **non-delegable** platform-admin power and AGENTS.md §13 forbids widening a non-delegable capability with a flag — and how it interacts with **[Open D13]** data retention, since impersonation reads real student data. Also needs a new audit action pair and a session-carried impersonation marker that `requireEnrolledStudent` cannot be fooled by | Write the design against the existing authz seams (session identity, `AuthzError`, audit) as an ADR proposal; build nothing until D3/D13 and the read-only question are answered |
| 15 | Default participation view with no filter applied | The issue asks the question and does not answer it | M5 defaults to the **current week** and states so in the UI; one line to change if the owner prefers the full matrix |
| 6 | "What counts as read", and the manual escape hatch | Two of the issue's three open questions | M3 implements **explicit** marking plus mark-all — viewport tracking needs client JS on a server-rendered surface and cannot be tested by the existing suite — and per-reader state, which is the privacy-safe answer to the second question |

---

## 6. Invariants that must survive every milestone

Issue #17's guarantees, and the repository rules they rest on:

- Student identity is the **normalized UP email**, exact equality, nothing else
  (D23). No milestone here adds a name match, a claim, or a confirmation step.
- Only the **course owner** grants or revokes staff standing, at either scope.
  Course-wide standing is refused role `ta`.
- Adding several people stays **atomic**: one unusable address writes nothing.
- Every mutation is **audited in the same transaction**, and an archived course
  is **read-only inside the authorization helpers**, not merely in the UI.
- **Every list is paginated** at the database, through
  `parsePageParams`/`buildPage`. A cap with a "see more" link is not pagination.
- Student-authored text is **never rendered as markup**, and
  `src/components/rich-text.tsx` stays the only `dangerouslySetInnerHTML`.
- No student ever sees another student's identity, any validity or flag
  decision, a draft, a source link, or an audit row.
