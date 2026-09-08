# Participation Rules

> **Status:** Product rule specification with an implemented foundation.
> This document **owns** the participation model, the validity/invalidation rules, participation derivation, and the CSV export specifications. States are defined in [domain-model.md](domain-model.md#3-state-models).
> Label key as in [product-requirements.md](product-requirements.md).

## 1. Confirmed participation rules **[Confirmed]**

- Submitting the weekly form counts as participation.
- A student can count **at most once per weekly cycle**.
- A complete submitted form counts as participation **by default**.
- Answer quality does not block participation **unless** a teacher marks the response invalid.
- Teachers may mark a response invalid; invalid responses do not count.
- Validity changes must be **audited**.
- Students **do** see the validity of their **own** submission and a student-visible reason when
  it is invalid ([project-specs.md](project-specs.md) §4.3, §6.5). They never see internal staff
  notes, the actor's identity, the internal reason enum, or any other student's validity.
- A draft response is not a submission and earns no credit.
- Participation is **derived** from weekly form responses that are not `Invalid`.
- The system tracks which weeks each student participated.
- The system calculates total participated weeks per student.

## 2. Validity model

Validity is an independent state dimension on `FormResponse` with **three** states
([project-specs.md](project-specs.md) §10):

| State | Meaning | Credit | Student sees |
|---|---|---|---|
| `Valid` | Default on submit | counts | "counted" |
| `Flagged` | A Student Assistant suspects it does not qualify; no Instructor has decided | **still counts** | "counted" — the flag is **never** revealed |
| `Invalid` | An Instructor finalized the decision | none | "not counted" + the student-visible reason |

### 2.1 Who may do what

| Transition | Actor |
|---|---|
| `Valid → Flagged` (reason required) | Student Assistant with `flag_validity`, or an Instructor |
| `Flagged → Invalid` (confirm the flag) | **Instructor only** |
| `Flagged → Valid` (reject the flag) | **Instructor only** |
| `Valid → Invalid` (invalidate directly) | **Instructor only** |
| `Invalid → Valid` (restore) | **Instructor only** |

A Student Assistant **cannot** finalize invalidation, and cannot gain that power by being granted
`mark_validity` — finalizing requires a non-TA section role **in addition to** the permission.
"Instructor" means a section `teacher`/`co_teacher` or course staff.

### 2.2 Recording every change

Every transition writes, in one transaction: the state-guarded update, a
`SubmissionValidityEvent` row (actor, actor role, timestamp, prior value, new value, reason,
staff-only note, student-visible reason), and an `AuditEvent`. Two concurrent decisions cannot
both apply — the second is refused because the guard no longer matches.

### 2.3 Possible invalidation reasons **[Confirmed]**

Spam · abusive content · empty or meaningless answers · completely irrelevant responses · attempts to gain credit without completing the form in good faith.

- The internal reason is required when flagging or invalidating, chosen from the above, plus an
  optional staff-only note. **Neither is shown to students.**
- Invalidating additionally requires a separate **student-visible reason** written for the
  student. That field is the only reason text a student can ever read.

## 2A. Bonus periods **[Confirmed — project-specs.md §6.5]**

Bonus periods are configurable long-exam grading buckets. They are **course-scoped**
(decision D14 in [open-decisions.md](open-decisions.md)); section-scoped weekly cycles are
assigned to one period each.

- Each period has a name, a required number of valid submissions, a start and end date, and its
  set of included cycles.
- A new cycle is assigned automatically to the period whose window contains its open date, else
  to the course default period. Staff may override the assignment; a later automatic pass never
  overwrites an override.
- Each non-invalid response contributes **at most one** credit to its cycle's period. This is
  structural: one response per `(cycle, student)` and one period per cycle. There is no counter
  column anywhere.
- Students see, per period: their valid count, the requirement, which cycles counted, which
  cycles were invalidated, and the student-visible reason for each invalidation.
- Instructors get per-student and per-form breakdowns and exports.

<a id="3-participation-derivation"></a>

## 3. Participation derivation **[Recommended]**

Participation is **not** a separately maintained, mutable table — it is computed from the source of truth (valid `FormResponse`s):

> A student **participated** in a cycle **iff** there exists a `FormResponse` for `(cycle, student)` whose lifecycle is `Submitted`/`Locked` (never `Draft`) **and** whose validity is **not** `Invalid` (so `Valid` and `Flagged` both count — decision D15).

- **[Recommended]** Compute on demand for dashboards/exports; optionally materialize a cached view for performance later. Because it derives from responses + validity, marking a response invalid immediately removes that week's credit with no separate bookkeeping.
- Legacy imported questions never contribute (see [legacy-question-import.md](legacy-question-import.md)).
- Merged submissions still each count for their own author's participation — merging is a publishing concern, not a participation concern (see [public-qa-and-source-linking.md](public-qa-and-source-linking.md)).

<a id="4-participation-csv-exports"></a>

## 4. Participation exports **[Confirmed]**

Five reports, all **identity-bearing**, and they split into two authorization tiers:

| Report | Gate |
|---|---|
| §4.1 Weekly participation matrix (`report=weekly_matrix`) | `export_participation` — delegable to a TA |
| §4.2 Participating-student list (`report=participants`) | `export_participation` — delegable to a TA |
| §4.3 Detailed response export (`report=detailed`) | `export_participation` — delegable to a TA |
| §4.4 One week, filtered (`report=week`) | **Instructor-only** |
| §4.5 Responder list, CSV and XLSX (`report=responders`) | **Instructor-only** |

Per decision **D17** the first three keep honouring the `export_participation` TA flag. Every
**newer** export — the filtered week file and both responder formats above, plus bonus records, any
XLSX variant, PDF response summaries, and the backlog/question status export — is
**Instructor-only**: the flag alone does not suffice, and a Student Assistant holding it reads the
dashboard but does not take the file away. Access is audited either way (Risk R4). All export
responses are `cache-control: no-store, private`, are generated in memory, and neutralize leading
`= + - @` in every cell so a spreadsheet cannot execute exported text.

### 4.1 Weekly participation matrix

Columns (example): Student number · Student name · Week 1 · Week 2 · Week 3 · … · Total weeks.

- Each week cell indicates whether the student had **one valid submitted form** that cycle.
- **[Recommended]** Column headers map to cycle identifiers (with dates) so weeks are unambiguous across sections.

### 4.2 Participating-student list

A **deduplicated** list of students who participated during a selected week, date range, or term.

> **No longer offered on screen [Confirmed 2026-09-07 — GitHub issue #15].** The service and the
> `report=participants` download remain, but the dashboard no longer carries a
> Participating-students figure or button: it answered "how many", and the actionable question is
> *who*. §4.4 and §4.5 answer that, per week and by name.

<a id="detailed-response-export"></a>

### 4.3 Detailed response export

Columns (example): Student number · Student name · Course · Class section · Weekly cycle · Submission timestamp · Form question identifier · Question text · Student answer · Student-originated question/feedback · Submission type · Category · Lesson/topic · Validity · Invalidation reason · Private-response indicator · Public-publication indicator.

- **[Confirmed]** For multiple-choice, checkbox, dropdown, and scale answers, export **both** readable labels **and** stable internal question/option identifiers where useful (see stable-id design in [weekly-form-workflow.md](weekly-form-workflow.md#51-conceptual-question-shape-not-a-schema)).
- The invalidation reason column is staff-only output (these exports are staff-only by definition).

<a id="week-and-answer-filters"></a>

### 4.4 One week, filtered **[Confirmed 2026-09-07 — GitHub issue #15]**

The dashboard is built around the two questions a teacher actually has: **who answered this week**,
and **who said that**.

- **Week filter.** One occurrence at a time, chosen from the occurrences this section actually
  received. The default is the **most recent occurrence anybody answered** — landing on next week's
  empty form would be technically correct and useless, which is the same rule the review column
  uses. A section that has collected nothing has no "this week", so it opens on the whole-term
  matrix instead. `All weeks` is always one explicit choice away, and every filter is in the URL.
- **Answer filter.** A question on that occurrence, and one of its answers. Offered **only** for
  questions whose answers form a finite set — multiple choice, checkboxes, dropdown, yes/no, and a
  linear scale of at most twenty steps. A free-text question has nothing to enumerate, so it is not
  offered rather than offered and then unable to answer.
- **Per week, not per term.** A question belongs to one occurrence's snapshot, so "that answer" has
  no meaning across a term whose forms may differ.
- **A filter narrows; it never widens.** The answer key must be one the question **actually offers**
  — it is checked against the same enumerated list the selector is built from — so a question from
  another occurrence, an option id that does not exist, or a scale value that is out of range, off
  step, or merely parses to a number (`2abc`, `1e1`, `2.9`) all yield **nothing**, not everyone.
  A **half-specified** filter — a question with no answer, or an answer with no question — is
  refused the same way, and a blank or whitespace query-string value counts as absent rather than as
  a value. Silently widening a filter is how a teacher contacts the wrong students.
- The list is **paginated in the database**, one row per student even when the filtered answer is a
  multi-select, and ordered by name so page boundaries are stable.
- **Both halves or neither.** A question with no answer chosen, or an answer with no question, is
  not a filter and is refused the same way a bad key is — it yields **nothing**. The screen's own
  two-step selector sends neither half until both are chosen (and says so on the intermediate
  step), so this is the rule for a hand-edited or stale URL and for the download that shares the
  same scope builder.
- The export follows whatever filter is active, because it runs the same scope query. Columns:
  Student number · Student name · Form occurrence · Participated · Submitted at · Validity ·
  Enrolment, plus **Answer** when an answer filter is applied. It is **Instructor-only** (see §4
  above): it is one of the exports added after D17, so `export_participation` does not reach it.

### 4.5 Responder list, for encoding **[Confirmed 2026-09-07 — GitHub issue #8]**

One click, one occurrence: the students who submitted, in the columns an encoding sheet wants.

- Columns: **Student number · Student name · UP email · Submitted at**, in that order.
- **Ordered by student number**, not by name, because that is the column the sheet is keyed on.
  The number is sealed, so the sort happens after decryption; a row whose number cannot be read
  sorts last under its name rather than silently first.
- **Optionally includes non-responders**, adding *Responded* and *Enrolment* columns, so the gap is
  visible in one file instead of two to diff.
- Available as **CSV or XLSX**, both through the shared `modules/exports/tabular` path, so both
  neutralize spreadsheet formula injection the same way.
- **Instructor-only** in both formats (see §4): it carries a name, a UP email and a full student
  number per row — the widest identity payload of any export here — so `export_participation` does
  not reach it. **Audited** as `export.responses` with the occurrence, the format, the row count and
  whether non-responders were included — never a name, an address or a student number.

Student numbers in **every** export here are written in the reading format (`2026-00001`) rather
than the normalized stored form (`202600001`): each of these files is opened by a person or pasted
into a sheet whose own numbers carry the separator, and a column that will not match on a lookup has
to be repaired by hand. See `src/lib/student-number.ts` — the separator is restored only for the one
shape it is known to belong to.

## 5. Student-facing participation **[Confirmed — project-specs.md §4.3, §6.5]**

Students see their **own** bonus progress per period: valid count, the requirement, which cycles
counted, which were invalidated, and the student-visible reason for each. They still never see
another student's participation, any raw participation matrix, staff notes, actor identities, or
the existence of a flag.

## 6. Decisions affecting participation

D5 (hard deadline; reopen unlocks, audited), D8 (merge never alters per-cycle participation),
D14 (bonus periods are course-scoped), D15 (`Flagged` keeps credit), D17 (export authorization)
are all **closed** — see [open-decisions.md](open-decisions.md).

## 7. Related documents

[domain-model.md](domain-model.md) · [weekly-form-workflow.md](weekly-form-workflow.md) · [roles-and-permissions.md](roles-and-permissions.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [legacy-question-import.md](legacy-question-import.md) · [open-decisions.md](open-decisions.md)
