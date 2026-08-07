# Forms, Audiences, and Dynamic Instances

> **Status:** Design + implementation record for the course-level form model.
> This document **owns** the form-definition / audience / form-instance split, the
> delivery modes, the per-instance customization rules, and the migration from the
> section-and-week-shaped model.
>
> It does **not** restate state machines ([domain-model.md](domain-model.md#3-state-models)),
> authorization ([roles-and-permissions.md](roles-and-permissions.md)), publication
> rules ([public-qa-and-source-linking.md](public-qa-and-source-linking.md)), or
> participation derivation ([participation-rules.md](participation-rules.md)) — it
> links to them.
>
> Label key as in [product-requirements.md](product-requirements.md).

---

## 1. Why the model changed

The previous model made `ClassSection` and `WeeklyCycle` the primary user-facing
objects. Two consequences did not match how the product is used:

1. **A section is an access context, not a work object.** A course such as `CS 33`
   runs one weekly feedback form. Section A and Section B answer the *same* form.
   The teacher wants to read the responses together. Rendering one equally
   prominent dashboard card per section invented a separation students never
   experience, and forced the teacher to configure the same schedule twice.
2. **Not every form is a weekly check-in.** A course also needs a one-time
   long-exam feedback form, a course evaluation, a lesson-specific form, and forms
   staff open by hand. `RecurrenceSchedule` was per-section and weekly-only, and
   `WeeklyCycle` named the delivery pattern in the entity itself, so a one-time LE
   form could only exist as a "weekly cycle" — a lie in both the UI and the data.

The snapshot/version machinery that already existed was *right* and is preserved
in full: immutable `TemplateVersion`s, per-instance question snapshots, stable
question keys, answer validation, hard deadlines, response locking, immutable
student wording, and the audit trail. What changed is **who owns a form** (the
course), **who receives it** (an explicit audience), and **how it is delivered**
(a delivery mode, of which weekly is one).

---

## 2. The three concepts, and the answers to the Phase-0 questions

### 2.1 What is the difference between a form definition, a form instance, and an audience? (Q1)

| Concept | Table(s) | Owns | Lifetime |
|---|---|---|---|
| **Form definition** | `form_templates` + `template_versions` | Course, title, description, optional purpose label, owner, visibility, archived flag, and an **immutable ordered list of versions** (questions + student-section settings per version) | The whole course; reused across terms via course clone |
| **Audience** | `form_schedule_sections`, `form_instance_sections` | *Which sections may receive this form.* Explicit rows, never inferred from the page a teacher happens to be on | Recorded per schedule and copied onto each instance at generation time |
| **Form instance** | `weekly_cycles` (see §6.1 on the physical name) + `form_questions` where `cycle_id IS NOT NULL` | The actual questionnaire students answer: its own audience, open/deadline timestamps, lifecycle state, **the exact question snapshot**, optional sequence number, optional topic/focus, its source definition version, and audit metadata | One per delivery occurrence |

The delivery configuration is a fourth, smaller thing: `recurrence_schedules`
now carries a **delivery mode**, a course, an audience, and the window controls
that mode needs. It is not a user-facing object — the teacher sees "Every week,
opens Monday 08:00, closes Sunday 23:59", attached to the form.

`weekly` is **not** part of a form's identity. It is a delivery mode.

### 2.2 Can one form instance target multiple sections? (Q2)

**Yes.** `form_instance_sections` is a many-to-many between an instance and the
sections that may receive it, with `UNIQUE (instance_id, section_id)`. An
instance's audience is exactly the set of rows in that table — there is no
"primary section" that access decisions consult.

`weekly_cycles.section_id` is now **nullable** and is retained only as the legacy
anchor/provenance column for rows created before this change. Making it nullable
was deliberate: it turns every place that used to assume a single section into a
TypeScript type error, so the compiler enumerated the call sites instead of a
human trying to remember them.

An audience of one section is the ordinary case and is represented the same way —
one row. There is no second code path for single-section forms.

### 2.3 What happens if the targeted sections have different deadlines or staff? (Q3)

- **Deadlines.** A form instance has **one** open/deadline window, in one
  timezone. If two sections genuinely need different windows, they need two
  instances, which means two schedules (or a selected-sections audience per
  schedule). The teacher is told this at the point of choosing the audience,
  rather than discovering it later. The institution runs a single timezone
  ([D7](open-decisions.md)), so the window is unambiguous in the pilot.
  The instance's timezone comes from the first audience section by title; every
  audience section of a course shares the institution timezone today, and a
  mismatch is refused when the schedule is saved.
- **Staff.** Staff permissions stay **per section** and are unchanged. A shared
  instance is visible to a staff member if they hold the relevant permission on
  **at least one** audience section, and the rows they can read are filtered to
  **exactly** the audience sections they are authorized for. A TA on Section A
  reviewing a course-wide form sees Section A's responses and nothing else, even
  though the form is shared. This is the load-bearing privacy rule of the whole
  change (§4).

### 2.4 How is a student's response deduplicated if they belong to two targeted sections? (Q4)

Structurally, by the key that already existed:

```
UNIQUE (cycle_id, student_record_id)   -- one response per student per instance
```

A `StudentRecord` is global and keyed on the student number, so a student
enrolled in Sections A and B has **one** record and therefore **one** possible
response row per instance. Duplication is impossible at the database level; there
is no client-side or service-side dedup to get wrong.

`form_responses.section_id` is new and records the **attribution section** — the
audience section through which the student submitted. It is resolved server-side
at submit time and is *not* part of the uniqueness key, precisely so that a
second membership cannot mint a second response. When a student is in more than
one audience section, attribution is deterministic: the audience section they are
actively enrolled in, ordered by `(title, id)`, first one wins. That is recorded
once, on the first save, and never re-derived, so a later roster change cannot
silently move an existing response between sections.

### 2.5 Which data is aggregated at the course/form level, and which stays section-specific? (Q5)

| Aggregated at course/form/instance level | Stays section-specific |
|---|---|
| The form definition and its versions | Enrollments and rosters |
| The instance, its window, its state, its question snapshot | Staff membership and the TA permission catalog |
| Response counts on the teacher's form list and the review inbox | Class-list import and email-based student access |
| The review inbox itself (one inbox per form, filterable by section) | The public Q&A archive (`public_answers.section_id`) |
| Bonus periods (already course-scoped, [D14](open-decisions.md)) | Participation exports (per section) |
| The question backlog and lessons/topics (already course-scoped) | Private replies (scoped by the asker's own response) |

### 2.6 How does a teacher filter responses by section when needed? (Q6)

The review inbox is course/form-oriented and carries a **Section** filter
alongside its existing State, Form, and Occurrence filters. The default is
"All sections" — that is, the sections the actor is authorized for. Choosing a
section narrows `form_responses.section_id`. The filter only appears when the
authorized audience actually spans more than one section, so a single-section
course never sees a control with one option.

### 2.7 How does a specific week's question override the base form? (Q7)

By editing **that instance's own snapshot**, which is the mechanism the schema
already had (`form_questions.cycle_id`). See §5.

### 2.8 What is locked after the first response, and what remains editable? (Q8)

Unchanged policy ([D4](open-decisions.md)), now stated in code and tests:

| Instance has ≥1 non-draft response | Allowed | Refused |
|---|---|---|
| No | Add / remove / reorder / retype questions, change required flags, choices, scale, validation; change the window; restore to base | — |
| Yes | Cosmetic edits to a question's prompt/description and to option **labels** (audited); focus/topic label; window is already frozen | Adding, removing, or reordering questions; changing a question's type, required flag, validation, scale; adding/removing options; changing an option's `stableId`; restoring to base |

A closed or locked instance is refused all structural edits regardless of
response count. Editing the **base definition** never rewrites a generated
instance — it produces a new `TemplateVersion`, which only future instances read.

### 2.9 How do the existing entities map to the new model? (Q9)

| Existing | New role | Change |
|---|---|---|
| `form_templates` | **Form definition** | `+ purpose` (optional free-text label) |
| `template_versions` | Immutable definition version | unchanged |
| `recurrence_schedules` | **Delivery configuration** | `+ course_id`, `+ delivery_mode`, `+ audience_mode`, `+ interval_weeks`, `+ first_open_at/first_deadline_at`; `section_id` and the weekly day/time columns become nullable |
| `form_schedule_sections` | Schedule audience | **new** |
| `weekly_cycles` | **Form instance** | `+ course_id`, `+ delivery_mode`, `+ title`, `+ focus_label`, `+ topic_id`, `+ customized_at/customized_by_user_id`; `section_id` becomes nullable (legacy anchor); `cycle_index` is exposed as `sequenceNumber` |
| `form_instance_sections` | Instance audience | **new** |
| `form_questions` | Definition-side **or** instance-side question | `+ origin` (`inherited` / `modified` / `instance_only`), set on instance-side rows only |
| `form_responses` | unchanged meaning | `+ section_id` (attribution), same `UNIQUE (cycle_id, student_record_id)` |

Nothing is dropped. No `ClassSection`, `Enrollment`, `StudentRecord`,
`WeeklyCycle`, `FormResponse`, or answer row is deleted or rewritten by the
migration beyond backfilling the new columns.

---

## 3. Delivery modes

`form_delivery_mode` is a **new** enum (rather than values added to
`recurrence_frequency`, which would have forced a second migration file for the
`ALTER TYPE` — see the note in `src/db/schema/enums.ts`).

| Mode | Instances | Window source | Notes |
|---|---|---|---|
| `one_time` | exactly 1 | `first_open_at` / `first_deadline_at` | The LE-feedback case. No sequence number is shown. |
| `weekly` | one per week | open/deadline day+time, `start_date`, end date **or** occurrence count | The existing behaviour, unchanged. |
| `custom_recurring` | one every `interval_weeks` weeks | as `weekly`, plus `interval_weeks` ≥ 2 | Deliberately the *smallest* honest generalization of the existing controls. Nothing else about the recurrence is configurable, and the UI does not imply otherwise. |
| `manual` | created by staff, one at a time | staff-entered window, or open-now | The instance is created `draft`; staff open and close it explicitly. The scheduler never touches it. |

`recurrence_frequency` stays in the schema with its single `weekly` value; it is
superseded by `delivery_mode` and is no longer read.

### Not implemented, recorded as future scope

The linked reference form suggests features this product does **not** have.
They are listed here rather than half-built:
sections/pages inside a form, conditional branching, per-question images or
video, file upload, response limits per respondent beyond the existing
one-per-instance rule, quiz grading, and email collection. The nine question
types in [weekly-form-workflow.md](weekly-form-workflow.md#5-teacher-created-questions--dynamic-form-schema)
remain the complete supported set.

---

## 4. Authorization and privacy under a shared audience

Every rule below is enforced server-side in `src/modules/forms/audience.ts` and
re-checked by the existing `require*` helpers. Hiding a control is never the
enforcement point.

- **Student → instance.** `requireAudienceStudent(instanceId)` admits a user only
  if their normalized UP email is on a class list **and** they hold an active `Enrollment` in at
  least one audience section of that instance. It returns the bound
  `StudentRecord` and the resolved attribution section. A student outside the
  audience is refused with the same message as a missing instance.
- **Staff → instance.** `authorizedAudienceSections(instanceId, permission)`
  intersects the instance audience with the sections on which the actor holds the
  permission. Empty intersection ⇒ `AuthzError`. Every staff read model is
  filtered by that intersection, so a shared form never widens what a
  section-scoped staff member can see.
- **Responses.** Staff read models filter on
  `form_responses.section_id IN (authorized sections)`. Aggregate counts shown to
  a staff member are computed over the same filtered set — a TA on Section A is
  never shown a course-wide total that lets them infer Section B's volume.
- **Public Q&A stays section-scoped.** A published answer is written to exactly
  one section: the **asker's own attribution section**. This preserves
  [ADR-0002](decisions/ADR-0002-section-scoped-public-qa.md) unchanged. Sharing a
  form across sections does not broaden a publication, and there is no code path
  that publishes to an audience. Cross-section reuse continues to go through the
  course backlog, exactly as [D8](open-decisions.md) says.
- **Students see nothing new.** The student projection of an instance carries the
  course code, the form title, the optional focus label, the window, the
  questions, and their own response. It carries no audience list, no other
  section's identity, no counts, no review state, no validity internals, and no
  staff notes.
- **Audience changes are audited.** Creating or changing a schedule's audience
  writes `form.audience_set` with the before/after section id lists;
  instance-level audience copies are recorded on `cycle.generated`.
  Unauthorized staff cannot create or change an audience: the schedule service
  requires course-staff standing on the course **and** `manageWeeklyCycles` on
  every section being added.

---

## 5. Dynamic per-instance questions

### 5.1 Representation

The chosen representation is the one the schema already supported, extended with
an origin marker:

1. When an instance is generated, the source `TemplateVersion`'s questions are
   **copied** into `form_questions` rows owned by the instance
   (`cycle_id = instance`), carrying each question's `stable_key` forward and
   marked `origin = 'inherited'`.
2. `customizeInstanceQuestions` edits **only that instance's rows**. A row whose
   text/settings diverge from the inherited copy becomes `origin = 'modified'`; a
   row with no counterpart in the base version becomes `origin = 'instance_only'`.
   A question kept identical stays `inherited`.
3. The base `TemplateVersion` and every other instance are untouched, because
   they are different rows. This is a property of the schema, not of the service
   remembering to be careful.
4. `stable_key` is preserved for every question that survives an edit, so
   analytics and the detailed export can still relate "Week 4's pace question" to
   the base pace question. A genuinely new instance-only question gets a new key.
5. The instance records `customized_at` / `customized_by_user_id`, and the edit
   writes `cycle.questions_customized` with the before/after prompt list to the
   audit log in the same transaction — so the pre-edit snapshot survives in
   history.

No override table and no second question system were added. The prompt's
preferred default and the existing schema agreed.

### 5.2 Teacher interaction

The instance editor (`/teach/courses/[id]/forms/[formId]/instances/[instanceId]`)
shows the instance's label and window, whether it still matches the base form,
the focus/topic for this occurrence, the inherited questions, the
instance-specific ones, and the edit/add/remove/reorder/restore controls that its
lock state allows. It states its scope in one line — *"Changes apply to Week 4
only."* — and offers **Preview as student**, which renders the exact current
snapshot through the student form component without saving or submitting
anything.

### 5.3 Topic / focus

An instance may carry `focus_label` (free text, e.g. *"Normalization"*) and
`topic_id` referencing the course's existing `lessons_topics`. Both are optional;
an ordinary form shows neither. When present, the focus is shown to the teacher on
the instance list and to the student under the form title — because in that case
it explains what the week's extra question is about. An instance question can be
associated with a topic through the same `form_questions.topic_id` column that
already existed.

No AI, no generated questions, no automatic topic inference. The teacher authors
the variation.

---

## 6. Migration

### 6.1 Physical names

`weekly_cycles` keeps its physical table name and `cycle_index` keeps its column
name. The **domain** type is `formInstances` / `sequenceNumber`, the UI says
"form" and "occurrence"/"Week N" only where a sequence genuinely exists, and no
user-facing surface says "cycle". Renaming the table is a pure
`ALTER TABLE … RENAME TO`, available at any time at zero product cost; it was
deferred because it would have required hand-editing drizzle-kit's snapshot
(rename detection is interactive) with fifteen dependent foreign keys, and that
risk buys nothing a user can see. This is recorded as a deliberate decision, not
an oversight — see also §8.

### 6.2 Migration `0003_forms_audience_instances.sql`

Ordered so no statement can fail against populated tables:

1. Create the three new enums and the two new audience tables.
2. Add every new column **nullable**.
3. Backfill:
   - `weekly_cycles.course_id` and `recurrence_schedules.course_id` from
     `class_sections.course_id`;
   - `form_responses.section_id` from the response's instance's `section_id`;
   - `form_instance_sections` from each existing instance's `section_id`;
   - `form_schedule_sections` from each existing schedule's `section_id`;
   - `weekly_cycles.delivery_mode = 'weekly'`,
     `recurrence_schedules.delivery_mode = 'weekly'`,
     `recurrence_schedules.audience_mode = 'selected_sections'`,
     `recurrence_schedules.interval_weeks = 1`;
   - `form_questions.origin = 'inherited'` for every existing instance-side row.
4. Apply `SET NOT NULL` to the three columns that must be total
   (`weekly_cycles.course_id`, `recurrence_schedules.course_id`,
   `form_responses.section_id`) and add their foreign keys and indexes.
5. `ALTER COLUMN … DROP NOT NULL` on `weekly_cycles.section_id`,
   `recurrence_schedules.section_id`, and the four weekly day/time columns plus
   `start_date`.

Every existing row therefore ends up as a single-section, weekly-delivery form —
which is exactly what it was — and continues to render and accept submissions
throughout. That is the compatibility layer: it is data, not a code branch.

### 6.3 What is *not* enforced by a constraint

An instance must have at least one audience row. A `CHECK` cannot span tables and
a trigger was judged worse than the alternative, so this is enforced in the
services that create instances (generation, manual creation, one-time creation)
and asserted by integration tests. The audience tables' own `UNIQUE` and foreign
keys enforce everything else.

---

## 7. Affected routes, modules, and tests

### Modules

| File | Change |
|---|---|
| `src/db/schema/enums.ts` | `+ formDeliveryMode`, `formAudienceMode`, `instanceQuestionOrigin` |
| `src/db/schema/forms.ts` | audience tables, new columns, nullability |
| `src/db/schema/responses.ts` | `form_responses.section_id` |
| `src/modules/forms/audience.ts` | **new** — audience resolution and the authorization helpers of §4 |
| `src/modules/forms/instances.ts` | **new** — instance read models, customization, focus, manual open/close, preview |
| `src/modules/forms/schedules.ts` | delivery modes, course-level schedules, schedule audience, form-level read models |
| `src/modules/forms/cycles.ts` | generation for all four modes, audience copy, origin markers, audience-aware authorization |
| `src/modules/forms/submission.ts` | audience-based access, attribution section, instance-keyed student state |
| `src/modules/forms/templates.ts` | `purpose`, course-level form list with delivery/audience/state |
| `src/modules/review/index.ts` | course-level review core; section view is a filter over it |
| `src/modules/review/validity.ts` | section resolved from the response, not the instance |
| `src/modules/publishing/index.ts` | publication section = the asker's attribution section |
| `src/modules/participation/index.ts` | per-section derivation over audience-visible instances |
| `src/modules/email/outbox.ts` | recipients across the audience; instance-keyed links |
| `src/modules/audit/index.ts` | new actions; audit fan-out via the audience table |
| `src/modules/authz/index.ts` | `requireItemAsker` resolves the section from the response |

### Routes

| Route | Change |
|---|---|
| `/` | course-code-first cards, deduplicated by form instance |
| `/forms/[id]` | **new** — the student's form, keyed by instance |
| `/sections/[id]` | resolver: redirects to the open instance, or shows the quiet empty state |
| `/teach/courses` | course code primary, forms summary, no per-section cards |
| `/teach/courses/[id]` | **new** — the course workspace (forms first) |
| `/teach/courses/[id]/forms/new` | **new** — details → audience → delivery → questions |
| `/teach/courses/[id]/forms/[formId]` | **new** — form detail: audience, delivery, occurrences |
| `/teach/courses/[id]/forms/[formId]/instances/[instanceId]` | **new** — the per-occurrence editor |
| `/teach/courses/[id]/responses` | **new** — the course/form review inbox with a section filter |
| `/teach/courses/[id]/sections` | **new** — sections, class lists, and access |
| `/teach/courses/[id]/templates` | redirects to the forms list |
| `/teach/sections/[id]/review` | redirects into the course inbox, section preselected |
| `/teach/sections/[id]/setup` | section details, staff, and class lists only; delivery moved to the form |

### Tests

`tests/integration/forms-audience.test.ts` (new) covers audience targeting,
shared submission, aggregated and filtered counts, cross-section isolation,
publication scoping, and the duplicate-response case.
`tests/integration/form-delivery.test.ts` (new) covers the four delivery modes
and old weekly data.
`tests/integration/instance-customization.test.ts` (new) covers inheritance,
per-week isolation, stable keys, locking, cosmetic edits, and preview.
Existing suites (`forms`, `submission-lifecycle`, `participation`,
`review-findings`, `review-publishing`, `operations`, `email-outbox`, `authz`)
are updated for the new fixtures and asserted unchanged in behaviour.

---

## 8. Implementation status

Implemented on 2026-08-06 (branch `fix/ui-ux`).

| Checkpoint | State | Evidence |
|---|---|---|
| A — document the model | done | this document; [domain-model.md](domain-model.md), [weekly-form-workflow.md](weekly-form-workflow.md), [IA-STRUCTURE.md](IA-STRUCTURE.md), [open-decisions.md](open-decisions.md), [AGENTS.md](../AGENTS.md), and the two JOURNEY files reconciled where they were actually affected |
| B — preserve current behaviour | done | compatibility by backfill (§6.2). All **172 pre-existing tests pass unchanged** on the new model; `form-delivery.test.ts` adds an explicit regression test that a pre-migration-shaped weekly schedule still generates, opens, closes, and accepts answers |
| C — schema + services | done | migration `0003_forms_audience_instances.sql`, applied against a **populated** database and its backfill verified row by row |
| D — course/form UI | done | routes in §7; the course code is the `<h1>`, forms are the work objects, class lists are one destination, the review inbox is course-scoped with a section filter |
| E — per-occurrence customization | done | `instance-customization.test.ts` (10 tests) |
| F — verify | done | see below |

### Verification run

- `npx eslint .` — clean, 0 errors 0 warnings.
- `npx tsc --noEmit` — clean.
- `npm run test` — 79 unit tests pass.
- `npm run test:integration` — **203 tests pass** (172 pre-existing + 31 new
  across `forms-audience`, `form-delivery`, `instance-customization`,
  `forms-privacy`).
- `npm run build` — production build succeeds; 28 routes.
- `scripts/verify/http-matrix.sh` — **50 checks pass, 0 fail**, driven over HTTP
  as the seeded teacher and student. The script was updated for the new IA and
  now takes a `BASE` override. Its stale assertions were corrected, including
  three that had already drifted before this work (the root is an entry screen
  rather than a redirect; the matches page's reassurance copy changed; audit
  actions render human labels).
- Every route was exercised against the seeded database with no server-side
  error in the dev log, including the two compatibility redirects
  (`/teach/sections/[id]/review` → the course inbox with the section
  preselected, `/teach/courses/[id]/templates` → the forms list).

### Not verified: the visual pass at three widths

**A visual inspection at desktop/tablet/phone widths was not performed.** Chromium
cannot launch in this environment (`libnspr4.so` is missing and installing it
needs interactive `sudo`), so no screenshots were taken and no rendered layout was
looked at.

What was checked instead, which is weaker and should not be mistaken for it:

- every CSS class used by the new surfaces is already defined in
  `src/app/globals.css` — **no new CSS was added**, so the new pages inherit the
  existing responsive rules, including the 860px pane collapse and the 720/560/400px
  breakpoints;
- both new wide tables (the course form list and the occurrence list) are inside
  `.table-scroll`, which is the project's `overflow-x: auto` container, so a wide
  table scrolls inside itself rather than widening the page.

**A human should still look at these eight teacher screens and two student screens
at the three widths before this ships.** The routes are listed in §7.

### Decisions recorded

Resolved by this work, in [open-decisions.md](open-decisions.md):

- **D18 — a form is owned by the COURSE**, with an explicit audience naming the
  sections that receive it.
- **D19 — one instance may target several sections.** One window, one snapshot,
  one review queue; uniqueness stays `(instance, student_record)`.
- **D20 — a publication stays section-scoped** to the asker's own section.
  Widening it would be a privacy-surface change and needs owner approval.

Left open, also in [open-decisions.md](open-decisions.md):

- **D21 — physical rename of `weekly_cycles` → `form_instances`.** Deferred for
  the migration-risk reason in §6.1; nothing user-facing depends on it.
- **D22 — per-section windows for one shared form.** Today a shared instance has
  one window, and sections in different timezones are refused rather than
  silently resolved; a course needing staggered deadlines uses selected-section
  audiences.

---

## 9. Related documents

[domain-model.md](domain-model.md) · [weekly-form-workflow.md](weekly-form-workflow.md) ·
[roles-and-permissions.md](roles-and-permissions.md) ·
[participation-rules.md](participation-rules.md) ·
[public-qa-and-source-linking.md](public-qa-and-source-linking.md) ·
[IA-STRUCTURE.md](IA-STRUCTURE.md) · [open-decisions.md](open-decisions.md) ·
[project-specs.md](project-specs.md)
