# Weekly Form Workflow

> **Status:** Product workflow specification with an implemented foundation.
> This document **owns** the recurring-schedule model, cycle generation & auto-open behavior, the dynamic form/question schema, template semantics, and the submission flow. State definitions live in [domain-model.md](domain-model.md#3-state-models); scheduling infrastructure in [architecture-proposal.md](architecture-proposal.md#scheduling).
> Label key as in [product-requirements.md](product-requirements.md).

## 1. Recurring schedule configuration **[Confirmed]**

Teachers configure a `RecurrenceSchedule` **per class section**, even when sections share a course:

- Recurrence frequency
- Opening day and time
- Deadline day and time
- Start date
- End date **or** number of occurrences
- Template used for newly created weekly forms

Example: open every Monday, close every Friday, repeat until end of semester, using a selected template.

Timezone: **[Recommended]** institution timezone by default; per-section override is [Open D7](open-decisions.md). All open/deadline/schedule times are stored and evaluated in that timezone.

## 2. Cycle generation & auto-open **[Confirmed]**

"Automatically generated weekly forms" means the system **creates and opens** `WeeklyCycle`s from the teacher's schedule. It does **not** mean AI-generated content.

### 2.1 Generation

- The scheduler materializes upcoming cycles from each active `RecurrenceSchedule`, snapshotting the selected template version into the cycle's `FormQuestion`s (see §4, §5).
- **[Recommended] Idempotent generation:** a uniqueness constraint on `(ClassSection, cycle window / index)` guarantees re-running generation never creates duplicate cycles. Generation is safe to run repeatedly (on a timer and on demand).

### 2.2 Auto-open

- **[Confirmed]** Cycles open automatically at the scheduled opening time (`Scheduled → Open`, [domain-model.md](domain-model.md#31-weekly-cycle-state)).
- Deadline closes the cycle (`Open → Closed`).

### 2.3 Scheduler-down / failure behavior **[Recommended]**

- The open/close transitions are **idempotent** (guarded by the cycle's current state and timestamps).
- If the scheduler is down at an open-at or deadline moment, a **reconciliation poller** on restart scans for cycles that are past their open-at but still `Scheduled` (opens them, flagged **late** in audit) and past their deadline but still `Open` (closes them). No duplicate opens occur because transitions check current state.
- Duplicate-prevention and reconciliation are shared infrastructure with scheduled publication — see [architecture-proposal.md](architecture-proposal.md#scheduling).

## 3. Preview, modify, and the edit-lock rule

- **[Confirmed]** Teachers can preview and modify a generated form **before** any student submits.
- **[Recommended] Post-first-submission edit lock:** once **≥1** student has submitted a cycle, **structural** edits are locked — adding/removing questions, changing question type, changing required/optional, or changing choices/scale. Rationale: structural changes after submissions invalidate already-collected answers and participation.
  - Cosmetic fixes (typo in a prompt/description) **[Recommended]** are allowed after submissions but are **audited**, and must not change the meaning of a question.
  - The owner's spec says structural edits "should be restricted or carefully handled"; this concrete rule is a recommendation pending approval ([Open D4](open-decisions.md)).

## 4. Weekly form model **[Confirmed]**

Each weekly form has two parts:

1. **Teacher-created questions** (see §5).
2. **A student-created feedback/question section** — always included.

A `FormResponse` contains: student identity, weekly cycle, answers to teacher-created questions, the student-originated item(s), lifecycle state, first-submission timestamp, last-edited timestamp, revision number, participation validity, linked private responses, and linked public answers when applicable ([domain-model.md](domain-model.md)).

**[Confirmed]** Rules:
- One response per student per section per cycle — enforced by a **unique constraint** on
  `(WeeklyCycle, StudentRecord)`. That single row is the draft, the submission, and the locked
  version in turn; there is never a second row.
- **A student may save a draft, submit, and then edit that same response until the deadline**
  (`project-specs.md` §4.3, §6.3, §7 B3). At the deadline the latest submitted version locks.
- No submission or edit after the deadline (cycle not `Open`). Reopening a closed cycle is the only
  override; it requires `manage_weekly_cycles` and is audited.
- A draft is not a submission: it earns no participation credit and appears in no staff queue,
  export, or history.
- The first-submission timestamp is written once, so editing can never mint a second credit.
- Every draft save / submit / edit / lock / unlock writes a revision record with before/after data
  plus an audit event, in the same transaction.
- Original student wording is immutable. An edit may replace an **untouched** submission item by
  withdrawing and superseding it; an item that already has a private reply, a source link, or a
  non-`New` review state is refused, and the student is told which one.
- Concurrent saves are race-safe: the cycle row is share-locked (interlocking with the close
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

## 6. Templates **[Confirmed]**

Teachers create reusable templates (`FormTemplate` + `TemplateVersion`, [domain-model.md](domain-model.md)).

- **Private by default**; shareable with other teachers authorized for the **same course**.
- **Snapshot on apply:** applying a template to a weekly form **copies/snapshots** its questions into the cycle. Later template edits **must not** silently change already-generated cycles (they produce a new `TemplateVersion`).

Templates support: title; description; ordered questions; question types; required/optional; student-question section settings; default categories; default lesson/topic associations; ownership; course-level sharing; versioning/snapshot behavior; archiving.

## 7. Student-originated questions & feedback **[Confirmed]**

Each weekly form always lets a student submit their own question, feedback, concern, clarification request, or suggestion (`StudentSubmissionItem`).

- The student initially selects the **type** and **broad category** (Content / Logistics / Miscellaneous).
- Teachers may correct type/category during review.
- Content-related items may associate with a lesson/lecture/module/topic.
- The **original text is immutable** — see rewording rules in [public-qa-and-source-linking.md](public-qa-and-source-linking.md).

## 8. Submission flow (happy path)

1. Cycle is `Open` (auto-opened per §2).
2. Student answers required + optional teacher questions and (optionally) submits a student-originated item with type/category.
3. Server-side validation passes; a `FormResponse` is created with a unique `(cycle, student)` key.
4. Response state `Submitted`; participation validity `Valid` by default.
5. Student sees a neutral "Submitted" confirmation and can view (not edit) the submission in history.

## 9. Open decisions affecting this workflow

- [Open D4] Exact edit-lock rule after first submission.
- [Open D5] Grace period / cycle reopen policy.
- [Open D7] Timezone (institution vs per-section).
- [Open D8] Whether merge may span cycles within a section.

See [open-decisions.md](open-decisions.md).

## 10. Related documents

[domain-model.md](domain-model.md) · [participation-rules.md](participation-rules.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [architecture-proposal.md](architecture-proposal.md) · [open-decisions.md](open-decisions.md)
