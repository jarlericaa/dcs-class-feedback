# UI precision pass

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


A follow-up to [UI-CORRECTION-LIST.md](UI-CORRECTION-LIST.md). That pass fixed
where actions live and what the palette means. This one fixes what the interface
**says** and how its editors **behave** — the places where the product still
reads as generated rather than authored.

Evidence: the running app with seeded data plus a second real course
(`CS 33 / Data Structures and Algorithms II`, section `THX`), inspected at
1440 / 1280 / 1024 / 768 / 390 / 320.

Priority: **P0** the reader is misinformed, or an authoring task is materially
harder than it should be · **P1** language or hierarchy that costs attention ·
**P2** craft.

---

## P0

| # | Route | Observed | Why it is poor | Correction |
|---|---|---|---|---|
| 1 | `/` (teacher) | `1 submission · 1 answered` under each section card, beside a `NOTHING WAITING` stamp. | Two facts joined by a middle dot, stating in metadata what the stamp already states, and neither tells the teacher what to do. Reads as generated telemetry. On the `THX` card it is worse: `0 submissions · 0 answered` next to `NOTHING WAITING` implies work is done when nothing has arrived. | One semantic status line, chosen from the real counts: `N submissions need replies` / `All submissions answered` / `No submissions yet`. The stamp and the line never restate each other. `Review inbox` stays the row-end action. |
| 2 | `/teach/courses`, `/`, breadcrumbs, `/sections/*` | `AY2026-1`, and on the course row `AY2026-1 · Asia/Manila`. | `AY2026-1` is a storage key shown to a teacher. The timezone is not a fact anyone scans a course list for, and gluing it to the term with a dot makes the row's only metadata line unreadable. | A term adapter formats stored values for people: `2026-2027 · 1st semester`, rendered as two separate metadata elements. Timezone moves to section setup. Unparseable legacy values fall back to the raw string rather than being hidden or rewritten. |
| 3 | Section create + section settings | A single free-text `Term` field. The teacher types `AY2026-1` by hand. | Nothing tells the teacher the expected format, so the stored value is whatever each person invents. It also asks for information the product can derive. | A term builder: a start-year input, a semester select (`1st semester`, `2nd semester`, `Midyear`), and the derived academic year shown live as `2026-2027`. No `AY` prefix typed, no end year typed. Submits the existing stored representation — no schema change. |
| 4 | Template editor | Choice options are authored in one `Options — one per line` textarea. | Each option looks like an accidental line break. Removing the middle option means selecting exactly one line and its newline. There is no per-option affordance at all, and re-ordering is impossible. | One single-line input per option, numbered, with a per-row remove and an `Add option` button beside the list. At least two options, validated inline. Serializes to the existing `QuestionDefinition` shape. |
| 5 | Template editor | No way to see the form before saving. | The teacher is authoring a form for forty students and can only find out what it looks like by saving an immutable version and opening a section. | A `Preview form` dialog rendering the **current unsaved** editor state through the real student form presentation. Never submits, never calls a server action, loses no typed value. |
| 6 | Template editor | Option `stableId` is derived from the label on every save, and `initialQuestions` drops the ids entirely when loading a template to edit. | A teacher fixing a typo in an option label silently changes that option's identity. Answers store `optionIds`; the ids are the join key for exports. | The draft model carries each option's existing `stableId` and reuses it. New options get a fresh id. Ordering comes from position. |

## P1

| # | Route | Observed | Why it is poor | Correction |
|---|---|---|---|---|
| 7 | `/teach/courses` | `Section setup` is a `button--quiet` — text with no border, beside a bordered `Review inbox`. | It is a real destination rendered as if it were incidental. Quiet is for actions that should not compete; this one is half of what a teacher does with a section. | Becomes a secondary button, matching `Review inbox`. |
| 8 | `/teach/courses/[id]/templates` | Empty state explains what a template is and how immutable versions work, in a paragraph. | Instructors do not need a definition of a template. The version rule matters, but at the moment of saving, not on an empty page. | Empty state is the [CONTENT-VOICE](CONTENT-VOICE.md) §5 pattern: `No templates yet` + one sentence + the action. The version rule becomes one contextual note beside the save button. |
| 9 | Template list | `4 questions · version 2 · 5 Aug 2026`. | Three unrelated facts in one run-on metadata sentence. | Separate aligned elements: question count, version, updated date. Stacks on narrow screens. |
| 10 | Template editor | A paragraph of Markdown/LaTeX syntax guidance on every editor screen. | Reference material shown permanently to someone who has already learned it. | Behind a `Formatting` disclosure. |
| 11 | Template editor | Fieldset `Student questions and general comment` with a 3-line explanation of internal triage mechanics. | The heading names two settings instead of one idea, and the body explains how staff tooling works, which is not the teacher's decision here. | `Student additions`, with only the fact that bears on the decision. |
| 12 | Template editor | `Add another question` at the very bottom, next to `Create template`. | The list's own action sits at the end of the whole form, competing with submit. Also inconsistent with `Add option`. | `Add question` beside the question-list heading. One label everywhere. |
| 13 | Template editor | `Answer type` and `Helper text` in one `.form-grid` with `align-items: end`; a textarea beside a select drags the labels out of alignment. `How many questions may a student add?` wraps to two lines while its siblings do not, breaking the baseline again. | Fields that share a row must share a left edge and a baseline. This is the alignment defect visible at every width. | Grid aligns to `start`; helper text moves under the prompt where it belongs; labels shortened so a row does not wrap only on one cell. |
| 14 | `/` (student), `/sections/*` | `Week 7 · closes Sunday 9 Aug, 11:59 pm · 4 days left`. | Same dot-chain defect on the student side, and the deadline appears twice in one line in two formats. | Week as its own element, the deadline as its own, the remaining time only when it is short enough to matter. |
| 15 | Publications page | `Scheduled. The reconciliation poller publishes it.` | [CONTENT-VOICE §4 A1](CONTENT-VOICE.md) records this as a P1 defect and never got implemented: `reconciliation poller` is a module name shown to a teacher, and it omits the only fact wanted — when. | The replacement copy from that document. |
| 16 | Publications page | `describe()` returns `err.message` for any `Error`. | [CONTENT-VOICE §3](CONTENT-VOICE.md) register rule: all 35 module strings can reach a teacher verbatim. Documented as violated, still violated. | Known cases map to user copy; the fallback is one honest generic. |
| 17 | Several | `Nothing waiting to publish`, `Nothing in the backlog`, `Published to this section, anonymously.` | [CONTENT-VOICE §5](CONTENT-VOICE.md) fixes one empty-state pattern (`No X`, never `Nothing X`) and forbids `anonymous` unqualified. Both are still violated in shipped copy. | Apply the documented pattern and name whose name is absent. |

## P2

| # | Route | Observed | Correction |
|---|---|---|---|
| 18 | Template editor | `Move up` / `Move down` / `Remove` are three quiet buttons in a right-floating span. | One aligned action row that wraps deliberately on narrow screens. |
| 19 | Template editor | Question fieldsets are `notice notice--pad` — a card per question inside a card. | Hairline-divided rows, consistent with how the student form now reads. |
| 20 | `/` (teacher) | Section cards show the course code and term but not which is which. | Code and term as separate metadata elements with the section title as the object title. |

---

## Explicitly not changed

- **No schema change.** `class_sections.term` is `text` with `z.string().trim().min(1).max(64)`, so the existing contract already stores everything the new UI produces. The builder submits the same `AY{year}-{1|2|M}` representation the seed and the shipped rows use, so no migration, no consumer update, and no risk to existing data. Recorded here rather than in [SPEC-RECONCILIATION.md](SPEC-RECONCILIATION.md) because nothing was reconciled — the contract was already sufficient.
- Backend behaviour, server actions, authorization, privacy projections, audit records, URLs, one-submission-per-cycle, deadlines, edit locks, identity matching, template snapshotting and version immutability are untouched.
- The preview is editor-local. It is not a saved feature and adds no route, table or server action.

---

## What changed

New shared pieces, so none of this is duplicated per route:

| Piece | Purpose |
|---|---|
| [src/lib/term.ts](../src/lib/term.ts) | Term adapter: `encodeTerm` produces the existing stored form, `termParts` / `formatTerm` / `academicYearLabel` read it back as words, `derivedAcademicYear` drives the live hint. Unparseable values pass through. 10 unit tests in [tests/unit/term.test.ts](../tests/unit/term.test.ts). |
| [TermFields](../src/components/ui/term-fields.tsx) | Start year + semester + the derived academic year said back via `role="status"`. Submits a hidden `term`. Leaving the fields alone on an unrecognized term resubmits the original string. |
| `MetaList` | Metadata as separate elements. No middle dots at all — whitespace separates, so a fact can be dropped without a stray dot and rows wrap between facts. |
| `ReviewStatusLine` | The semantic status sentence, chosen from real counts. |
| `Disclose` | Reused for the `Formatting` disclosure. |
| [TemplatePreview](../src/components/staff/template-preview.tsx) | Portals the real `WeeklyForm` into a native `<dialog>`. |

Per-route changes match the P0/P1/P2 tables above. Three additional defects were
found while implementing and fixed:

- **A hydration mismatch in the template editor.** Row keys came from a
  module-level counter. That module lives for the whole process on the server, so
  the counter kept climbing across requests while a fresh client restarted at
  zero — the server sent `htmlFor="prompt-q-1"` and the client rendered
  `prompt-q-8`, which breaks the label/input association React refuses to patch.
  SSR-rendered rows now derive their key from the index; the counter is used only
  for rows created after mount.
- **`.form-grid` bottom-aligned its cells** (`align-items: end`), which is what
  dragged the `Answer type` and `Helper text` labels out of line. Now `start`.
- **Publications leaked module errors and named a module in success copy.** Both
  are recorded as violated in [CONTENT-VOICE](CONTENT-VOICE.md) §3 and §4 A1 and
  had never been implemented.

Also implemented from CONTENT-VOICE, which documented the decisions but shipped
neither: the single empty-state pattern (`No X`, never `Nothing X` or `You have
not X`), the success-message table, and **the ban on unqualified "anonymous"** —
`Asked anonymously`, `Published to your class anonymously` and
`Published to this section, anonymously.` all claimed a guarantee the product
does not make and are now specific about whose name is absent.

## Verified

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | 79 passed (10 new term tests) |
| `npm run test:integration` | 172 passed — privacy, authorization, version snapshotting untouched |
| `npx next build` | 21 routes compiled |
| `impeccable detect` | no findings |
| Console / page errors | none on any route, including the hydration warning above |

**Viewports.** 13 routes × 1440 / 1280 / 1024 / 768 / 390 / 320 = 78 screenshots,
**zero horizontal overflow** at every width. Routes: `/` (teacher and student),
`/teach/courses`, `/teach/courses?new=1`, templates empty + list + `?new=1` +
`?edit=`, `/teach/sections/[id]/setup`, review inbox, `/sections/[id]`,
`/sections/[id]/history`, `/sections/[id]/qa`, `/claim`.

**Interaction, driven in a real browser at 1440 and 390:**

- switching a question to Multiple choice seeds two option rows; `Add option`
  appends a third; removing is disabled at two rows;
- switching to Paragraph hides the choices and switching back restores the typed
  labels;
- `Preview form` opens, shows the typed prompt and all three choices, contains
  **no** `type="submit"` control, and closing it preserves the template name,
  every option label and the question count;
- the term builder shows `Academic year 2027-2028` while typing `2027`, and
  creating a section with `2nd semester` stored **`AY2027-2`** — the same
  representation already in the database — and rendered `2027-2028 2nd semester`;
- saving a new version after **renaming** an option kept that option's
  `stableId` (`too-slow-0` in both version 2 and version 3), so the identity
  answers and exports join on survived the edit. This was the bug in item 6.

The section created for the term test was removed afterwards; the database holds
the same two sections it started with.

## Remaining issues

1. **Markdown prompts render as plain text in the preview.** The sanitizer
   deliberately does not run in the browser, so the preview cannot show rendered
   Markdown or LaTeX without shipping a second trusted HTML path. Stated in the
   preview rather than left as a surprise. Fixing it properly means pre-rendering
   prompt HTML through a server action on demand — worth doing, out of scope here.
2. **The register rule is fixed at one catch site.** [CONTENT-VOICE §3](CONTENT-VOICE.md)
   applies to every server action that catches a module error; this pass fixed
   `publications`, which was the one the document names. The other `describe()`
   helpers narrow to their own domain error types and are much less exposed, but
   they have not been audited one by one.
3. **`Midyear` is stored as `AY{year}-M`.** No shipped row uses it yet, so
   nothing needed migrating, but any external consumer that assumed
   `AY\d{4}-[12]` would need to accept `M`. No such consumer exists in this
   repository — `roster-import` only ever *reads* a term string from a
   spreadsheet and never parses this format.
