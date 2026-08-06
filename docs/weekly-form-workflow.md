# Form Workflow

> **Status:** Product workflow specification with an implemented foundation.
> This document **owns** the dynamic form/question schema, the question types, the
> validation rules, and the submission flow. **Form ownership, audiences, the four
> delivery modes, and per-occurrence customization are owned by
> [FORMS-AUDIENCE-DYNAMIC-INSTANCES.md](FORMS-AUDIENCE-DYNAMIC-INSTANCES.md)** —
> this document links there rather than restating them. State definitions live in
> [domain-model.md](domain-model.md#3-state-models); scheduling infrastructure in
> [architecture-proposal.md](architecture-proposal.md#scheduling).
> Label key as in [product-requirements.md](product-requirements.md).

## 1. Delivery configuration **[Confirmed]**

A form belongs to a **course**, and its delivery configuration names an explicit
**audience** — all sections of the course, several of them, or one
([D18/D19](open-decisions.md)). Weekly is one of four delivery modes, not the
shape of the product:

| Mode | Instances | Window |
|---|---|---|
| `one_time` | exactly one | an explicit open/deadline instant |
| `weekly` | one per week | open day+time, deadline day+time, start, end **or** count |
| `custom_recurring` | one every N weeks (N ≥ 2) | as weekly, plus the interval |
| `manual` | created by staff, one at a time | staff-entered window; staff open and close it |

Example: open every Monday, close every Sunday, repeat until the end of the
semester, delivered to every section of `CS 33` — configured once, not once per
section.

A shared instance has **one** window. Sections in different timezones are refused
rather than silently resolved; per-section windows are [D22](open-decisions.md).

Timezone: **[Recommended]** institution timezone by default; per-section override
is [Open D7](open-decisions.md). All open/deadline/schedule times are stored and
evaluated in that timezone.

## 2. Instance generation & auto-open **[Confirmed]**

"Automatically generated forms" means the system **creates and opens** form
instances from the teacher's delivery configuration. It does **not** mean
AI-generated content.

### 2.1 Generation

- The scheduler materializes upcoming instances from each active delivery
  configuration, copying the configuration's **audience** onto each instance and
  snapshotting the selected definition version into the instance's
  `FormQuestion`s (see §4, §5).
- `manual` delivery is deliberately excluded: nothing reaches a student until a
  person opens it.
- **Idempotent generation:** a uniqueness constraint on `(schedule, sequence)`,
  plus an audience-overlap check scoped to the same **form**, guarantees
  re-running generation never creates a duplicate occurrence. Two *different*
  forms of one course may legitimately open at the same moment, so the check is
  per-form rather than per-course. Generation is safe to run repeatedly.

### 2.2 Auto-open

- **[Confirmed]** Scheduled instances open automatically at their opening time
  (`Scheduled → Open`, [domain-model.md](domain-model.md#31-form-instance-state)).
- The deadline closes the instance (`Open → Closed`), locking its responses in the
  same transaction.
- A `manual` instance is opened and closed by staff, and is audited as such.

### 2.3 Scheduler-down / failure behavior **[Recommended]**

- The open/close transitions are **idempotent** (guarded by the instance's current state and timestamps).
- If the scheduler is down at an open-at or deadline moment, a **reconciliation poller** on restart scans for instances past their open-at but still `Scheduled` (opens them, flagged **late** in audit) and past their deadline but still `Open` (closes them). No duplicate opens occur because transitions check current state.
- Duplicate-prevention and reconciliation are shared infrastructure with scheduled publication — see [architecture-proposal.md](architecture-proposal.md#scheduling).

## 3. Preview, modify, and the edit-lock rule

- **[Confirmed]** Teachers can preview and modify a generated form **before** any
  student submits. `Preview as student` renders the exact current snapshot through
  the real student form component and saves nothing.
- **[Confirmed — D4] Post-first-submission edit lock:** once **≥1** student has
  submitted an instance, **structural** edits are refused — adding, removing or
  reordering questions, changing a question's type or required flag, or changing
  choices/scale/validation. Structural changes after submissions would invalidate
  already-collected answers and participation.
  - Cosmetic fixes (a typo in a prompt, a description, or an option **label**)
    remain allowed and are **audited**, with the pre-edit wording preserved in the
    audit row. An option's stable id never changes, so a stored answer still
    resolves.
  - A closed, skipped or archived instance is refused structural change regardless
    of its response count.
  - The lock is global to the **instance**: one response anywhere in its audience
    freezes the structure for every section.
- **Per-occurrence customization** — varying one week's questions without touching
  the base form or any other week — is owned by
  [FORMS-AUDIENCE-DYNAMIC-INSTANCES.md §5](FORMS-AUDIENCE-DYNAMIC-INSTANCES.md).

## 4. Weekly form model **[Confirmed]**

Each weekly form has two parts:

1. **Teacher-created questions** (see §5).
2. **A student-created feedback/question section** — always included.

A `FormResponse` contains: student identity, form instance, attribution section, answers to teacher-created questions, the student-originated item(s), lifecycle state, first-submission timestamp, last-edited timestamp, revision number, participation validity, linked private responses, and linked public answers when applicable ([domain-model.md](domain-model.md)).

**[Confirmed]** Rules:
- One response per student per **form instance** — enforced by a **unique
  constraint** on `(FormInstance, StudentRecord)`. That single row is the draft,
  the submission, and the locked version in turn; there is never a second row.
- The response's **attribution section** is recorded separately and is
  deliberately **not** in that key, so a student enrolled in two targeted sections
  of a shared form still has exactly one response
  ([FORMS-AUDIENCE-DYNAMIC-INSTANCES.md §2.4](FORMS-AUDIENCE-DYNAMIC-INSTANCES.md)).
- **A student may save a draft, submit, and then edit that same response until the deadline**
  (`project-specs.md` §4.3, §6.3, §7 B3). At the deadline the latest submitted version locks.
- No submission or edit after the deadline (instance not `Open`). Reopening a closed
  instance is the only override; it requires `manage_weekly_cycles` on **every**
  audience section and is audited.
- A draft is not a submission: it earns no participation credit and appears in no staff queue,
  export, or history.
- The first-submission timestamp is written once, so editing can never mint a second credit.
- Every draft save / submit / edit / lock / unlock writes a revision record with before/after data
  plus an audit event, in the same transaction.
- Original student wording is immutable. An edit may replace an **untouched** submission item by
  withdrawing and superseding it; an item that already has a private reply, a source link, or a
  non-`New` review state is refused, and the student is told which one.
- Concurrent saves are race-safe: the instance row is share-locked (interlocking with the close
  transaction), the response row is exclusively locked, and a stale revision number is rejected.
- Submitting a complete form counts as participation unless later marked invalid — see [participation-rules.md](participation-rules.md).

### 4.1 Student-originated items **[Confirmed — project-specs.md §5.2, §5.5, §7 D1]**

- A template configures how many repeatable **Ask a Question** entries a form offers (0–10) and
  whether a distinct **general comment** field is shown and required.
- Every non-empty question entry becomes its **own** immutable `StudentSubmissionItem`, so each can
  be triaged, answered, merged, or published independently.
- The general comment is a **separately identifiable** item kind — at most one per response. It is
  excluded from the Question Inbox and can never be published as a Q&A entry.
- Submitting more question entries than the template allows, or omitting a required general
  comment, is refused server-side regardless of what the client posts.

## 5. Teacher-created questions & dynamic form schema **[Confirmed]**

Supported question types (reproducing common Google Forms types):

- Short answer
- Paragraph
- Multiple choice
- Checkboxes
- Dropdown
- Linear scale / rating
- Yes/No
- Date (if justified)
- Time (if justified)

Each `FormQuestion` may carry: prompt, description, question type, choices or scale settings, required/optional, display order, category, lesson/topic association, validation rules.

### 5.1 Conceptual question shape (not a schema)

```
FormQuestion {
  prompt, description
  type: short_answer | paragraph | multiple_choice | checkboxes |
        dropdown | linear_scale | yes_no | date | time
  required: bool
  order: int
  category: Content | Logistics | Misc
  topicRef?: Lesson/Topic
  # type-specific:
  options?: [ { stableId, label, order } ]      # choice/checkbox/dropdown
  scale?: { min, max, minLabel?, maxLabel?, step }  # linear_scale
  validation?: { minLen?, maxLen?, minSelections?, maxSelections?, pattern? }
}
```

- **[Recommended]** Options carry a **stable internal id** separate from the display label, so exports and analytics stay stable when labels are edited. Answers store the chosen option ids *and* the labels at submission time (see [participation-rules.md](participation-rules.md#detailed-response-export)).

### 5.2 Validation **[Confirmed]**

- Students must complete all **required** questions before submitting.
- Client-side validation is helpful; **server-side validation is required** and authoritative.

## 6. Form definitions **[Confirmed]**

Teachers create reusable **form definitions** (`FormTemplate` + `TemplateVersion`,
[domain-model.md](domain-model.md)). "Template" is the historical table name; the
product calls them forms.

- **Private by default**; shareable with other teachers authorized for the **same course**.
- **Snapshot on generate:** generating an instance **copies** the definition's
  questions into it. Later edits to the definition **must not** change an
  already-generated instance (they produce a new `TemplateVersion`, which only
  future instances read).

A definition owns: title; description; optional purpose label; ordered questions;
question types; required/optional; student-question section settings; default
categories; default lesson/topic associations; ownership; course-level sharing;
versioning/snapshot behavior; archiving. It does **not** own a delivery pattern —
`weekly` is a delivery mode (§1).

## 7. Student-originated questions & feedback **[Confirmed]**

Each weekly form always lets a student submit their own question, feedback, concern, clarification request, or suggestion (`StudentSubmissionItem`).

- The student initially selects the **type** and **broad category** (Content / Logistics / Miscellaneous).
- Teachers may correct type/category during review.
- Content-related items may associate with a lesson/lecture/module/topic.
- The **original text is immutable** — see rewording rules in [public-qa-and-source-linking.md](public-qa-and-source-linking.md).

## 8. Submission flow (happy path)

1. The form instance is `Open` (auto-opened per §2, or opened by staff for `manual` delivery).
2. Student answers required + optional teacher questions and (optionally) submits a student-originated item with type/category.
3. Server-side validation passes; a `FormResponse` is created with a unique `(instance, student)` key and its attribution section resolved server-side.
4. Response state `Submitted`; participation validity `Valid` by default.
5. Student sees a neutral "Submitted" confirmation and can keep editing until the deadline; afterwards it is visible, not editable, in their history.

## 9. Open decisions affecting this workflow

- [D5] Grace period / reopen policy — closed: hard deadline, audited reopen.
- [Open D7] Timezone (institution vs per-section).
- [D8] Whether merge may span occurrences within a section — closed: yes.
- [D21] Physical rename of the `weekly_cycles` table.
- [Open D22] Per-section windows for one shared form.

See [open-decisions.md](open-decisions.md).

## 10. Related documents

[FORMS-AUDIENCE-DYNAMIC-INSTANCES.md](FORMS-AUDIENCE-DYNAMIC-INSTANCES.md) · [domain-model.md](domain-model.md) · [participation-rules.md](participation-rules.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [architecture-proposal.md](architecture-proposal.md) · [open-decisions.md](open-decisions.md)
