# Domain Model

> **Status:** Domain specification aligned with the current Drizzle schema and
> migrations. The model remains the conceptual owner of relationships and state
> rules; current implementation coverage is tracked in
> [CURRENT_STATE.md](CURRENT_STATE.md).
> This document **owns** the entity model, identity rules, all state dimensions, and the audit-event shape. Other docs link here rather than redefining these.
> Label key as in [product-requirements.md](product-requirements.md).

## 1. Entities

Fields listed are conceptual, not a schema. "→" denotes a reference to another entity.

### Identity & people

- **User** — an authenticated Google identity. Fields: Google subject id, **normalized** university email (unique), display name (mutable, and never used for identity), platform role flags, active flag. A User is a student exactly when their email is on a class list.
- **StudentRecord** — a roster row for a student, reusable across every section and course that imports the same person. Fields: student number (permanent internal identity, **[Assumption A2]**), **normalized roster email (unique — the access key)**, full name (as imported, a label only), → ImportBatch that created it. Student number is the stable key across name and email changes.

  There is **no linking entity.** `User → StudentRecord` is resolved live by `user.email = studentRecord.rosterEmail`, so a roster imported after the account existed grants access with no second login and nothing to reconcile. See [student-identity.md](student-identity.md).

### Academic structure

- **Course** — reusable course. Fields: title, code, owner → User, active flag. Owns templates, backlog, lessons/topics, (future) course materials.
- **CourseStaff** — a teacher authorized on a Course. Fields: → Course, → User, course role (`teacher` / `co_teacher`). A row is **course-wide standing**: full Instructor capability on *every* ClassSection of that Course, including sections created later, with no permission flags to narrow it. Unique on `(Course, User)`. Only the course owner may create or delete one, and the owner's own standing comes from `Course.owner` rather than a row, so it cannot be deleted. Removing a row leaves any separate SectionStaff row intact. See [roles-and-permissions.md §2.5](roles-and-permissions.md#25-where-staff-standing-comes-from-two-tiers) and [ADR-0004](decisions/ADR-0004-course-wide-staff-standing.md).
- **ClassSection** — an offering of a Course. Fields: → Course, term/semester label, title, timezone (default from institution; per-section override **deferred** — D7 closed 2026-08-03, [open-decisions.md](open-decisions.md)), active flag.
- **SectionStaff** — staff membership on a section with per-section permission flags (the TA permission catalog). Fields: → ClassSection, → User, role (teacher/TA/co-teacher), permission flag set. Unique on `(ClassSection, User)`. This is the **only** tier that carries the permission catalog, so a Student Assistant is always scoped to named sections: someone assisting 3 of 8 sections holds three rows, granted in one action but auditable per section. See [roles-and-permissions.md](roles-and-permissions.md).
- **Enrollment** — a StudentRecord's membership in a ClassSection. Fields: → ClassSection, → StudentRecord, status (active/deactivated), source → ImportBatch. A student may appear in multiple sections **[Assumption A1]**.

### Forms & templates

- **Lesson / Topic** — course-level content unit. Fields: → Course, title, kind (lesson/lecture/module/topic), order.
- **FormTemplate** — a reusable **form definition** ("template" is the historical name). Fields: → Course, owner → User, title, description, optional purpose label, visibility (private-by-default / course-shared), archived flag. A definition does **not** own a delivery pattern: weekly is one of four delivery modes and lives on the schedule. See [FORMS-AUDIENCE-DYNAMIC-INSTANCES.md](FORMS-AUDIENCE-DYNAMIC-INSTANCES.md).
- **TemplateVersion** — an immutable snapshot of a definition's questions/settings. Generating an instance copies from a version; later edits create new versions and never mutate an already-generated instance.
- **RecurrenceSchedule** — the **delivery configuration** of one form. Fields: → Course, delivery mode (`one_time` / `weekly` / `custom_recurring` / `manual`), audience mode, interval weeks, open day/time, deadline day/time, start date, end date or occurrence count, one-time open/deadline instants, → FormTemplate (source), timezone, active flag. `→ ClassSection` survives only as the legacy anchor of a schedule created before audiences existed.
- **FormScheduleSections** — the **audience** of a delivery configuration: which sections receive instances generated from it. Explicit rows, never inferred.
- **FormInstance** (physical table `weekly_cycles`) — the questionnaire students actually answer. Fields: → Course, delivery mode, sequence number, open-at, deadline-at, → source RecurrenceSchedule, → source TemplateVersion, → snapshot of questions (see FormQuestion), optional per-occurrence title, optional focus label and → Lesson/Topic, customized-at/by, state (§3.1). A uniqueness constraint on `(schedule, sequence)` plus an audience-overlap check makes generation idempotent.
- **FormInstanceSections** — the **audience** of one instance: every section whose students may answer it. This is what access decisions read; `FormInstance → ClassSection` is a legacy anchor and is not consulted.
- **FormQuestion** — a question *as snapshotted into an instance* (not the live definition question). Fields: → FormInstance (or → TemplateVersion for definition-side), prompt, description, type (§ question types in [weekly-form-workflow.md](weekly-form-workflow.md)), choices/scale settings, required flag, display order, → default category, → Lesson/Topic, validation rules, **origin** (inherited / modified for this occurrence / added to this occurrence only), stable key.

### Submissions & responses

- **FormResponse** — one student's completed form instance. Fields: → FormInstance, → StudentRecord, **→ ClassSection (the attribution section — the audience section the student answered through)**, submission timestamp, state (§3.2), participation validity (§3.3), invalidation reason (staff-only). **Unique on (FormInstance, StudentRecord)** — one submission per student per form instance. The section is deliberately **not** part of that key, so a student enrolled in two targeted sections still has exactly one response ([FORMS-AUDIENCE-DYNAMIC-INSTANCES.md §2.4](FORMS-AUDIENCE-DYNAMIC-INSTANCES.md)).
- **QuestionAnswer** — an answer to one FormQuestion within a FormResponse. Fields: → FormResponse, → FormQuestion, value(s) (stores stable option ids *and* labels where applicable), free text.
- **StudentSubmissionItem** — the student-originated question/feedback/concern/clarification/suggestion within a FormResponse. Fields: → FormResponse, submission type (student-selected, staff-correctable), broad category (Content/Logistics/Misc), → Lesson/Topic (for content), original text (**immutable**), review state (§3.4), response disposition (§3.5).
- **ResponseRead** — **[Confirmed 2026-09-07 — GitHub issue #6]** one staff member has read one response. Fields: → FormResponse (cascade), → User (the reader, cascade), read-at. **Unique on (FormResponse, User)**, which is what makes marking idempotent. It is **per reader on purpose**: a shared marker would let one assistant's skim hide a submission from the instructor who still has to decide on it. It is bookkeeping about the READER — see [§3.10](#310-read-state--about-the-reader-not-the-submission).

### Responses & publishing

- **PrivateResponse** — a private reply to a StudentSubmissionItem. Fields: → StudentSubmissionItem, author → User (staff), body, timestamp. Visible only to the asker and authorized staff.
- **PublicAnswer** — a published/publishable anonymous Q&A entry. Fields: → ClassSection, reworded public question text, answer body, public-answer state (§3.6), scheduled-at, published-at, failure info, → category/topic for archive organization, source origin (current/legacy). Never stores source identity in public-visible fields.
- **SourceLink** — internal link between a PublicAnswer and its source(s). Fields: → PublicAnswer, → StudentSubmissionItem **or** → BacklogQuestion, created-by, timestamp. **Many-to-one on PublicAnswer** (supports merge). Internal-only; drives "your question was answered" without exposing identity to other students. See [public-qa-and-source-linking.md](public-qa-and-source-linking.md).

### Backlog & import

- **BacklogQuestion** — a course-level question awaiting possible public answering. Fields: → Course, text, → optional category/topic, state (§3.7), source provenance (current-copied / legacy-import), → optional source StudentSubmissionItem (only if intentionally linked), identity-preservation flag, → ImportBatch (if imported). Belongs to the **course**, not a section. See [question-backlog.md](question-backlog.md).
- **SectionBacklogVisibility** — records that a BacklogQuestion has been made visible/publishable to a specific ClassSection. Fields: → BacklogQuestion, → ClassSection, made-visible-by. Explicit and per-section; no automatic public exposure.
- **ImportBatch** — a roster or legacy import event. Fields: kind (roster/legacy), source description, → Course or → ClassSection, importer → User, row counts/summary, timestamp. See [student-identity.md](student-identity.md) and [legacy-question-import.md](legacy-question-import.md).

### Added 2026-08-03 for the full `project-specs.md` scope

- **FormResponseRevision** — the content trail for §3.1a. Fields: → FormResponse, revision number,
  action, actor (null = system lock), before/after snapshots, timestamp.
- **SubmissionValidityEvent** — the per-response validity timeline for §3.3, including the separate
  student-visible reason channel.
- **BonusPeriod** — a **course-scoped** long-exam bucket. Fields: → Course, name, required valid
  count, start/end dates, default flag, archived flag. A FormInstance carries → BonusPeriod plus an
  assignment source (`auto`/`staff_override`) so an override is never overwritten.
- **PromptAnalysisNote** — a staff-authored summary/theme note on one prompt (identified by the
  question's stable key so it survives template re-snapshots). No AI involvement.
- **BacklogRecommendation** — an SA's recommendation to add or remove a backlog question, plus the
  Instructor's decision. Partial uniqueness on pending rows makes repeated `Will Answer` idempotent.
- **QuestionMergeGroup / QuestionMergeMember** — the durable, reversible merge object. Members are
  never deleted; each records its pre-merge disposition and review state, which is what makes
  unmerge lossless. `SourceLink` remains the publication projection.
- **PublicQARevision** — prior public question text, prior answer body, editor, timestamp, for every
  edit of a published entry.
- **PublicAnswerApproval** — the requested/approved/rejected decision record naming the responsible
  Instructor.
- **EmailOutbox** — one queued notification. Fields: event type, idempotency key (unique),
  → recipient User (never an address), scope ids, content-free subject, body, authenticated link
  path, delivery state, attempts, availability time, lease owner/expiry, provider message id, error.
- **LegacyImportRow** — one staged legacy row. Always retains the verbatim source text, so per-row
  errors never discard the rest of the file.
- **PublicAnswerReaction / PublicAnswerComment** — course-only reactions and moderated comments.
  Commenters are pseudonymous to classmates (`Student N`, scoped per answer) and identifiable to
  staff. Comments are `Pending` until staff approve.

### Future (post-MVP, model kept compatible only)

- **CourseMaterial** — post-MVP entity. Not managed in MVP; the model reserves course-level ownership and topic tagging so materials can attach later. See [ai-future-plan.md](ai-future-plan.md).

### Cross-cutting

- **AuditEvent** — see §4.

## 2. Key relationships (text ERD)

```
Course 1─* FormTemplate 1─* TemplateVersion
Course 1─* RecurrenceSchedule *─* ClassSection   (audience, via FormScheduleSections)
Course 1─* FormInstance      *─* ClassSection   (audience, via FormInstanceSections)
FormInstance 1─* FormResponse *─1 ClassSection   (attribution)
FormInstance 1─* FormResponse 1─* QuestionAnswer
Course 1─* ClassSection
Course 1─* CourseStaff *─1 User
Course 1─* Lesson/Topic
Course 1─* BacklogQuestion *─* ClassSection   (via SectionBacklogVisibility)
ClassSection 1─* SectionStaff *─1 User
ClassSection 1─* Enrollment *─1 StudentRecord
ClassSection 1─* PublicAnswer
FormResponse 1─* StudentSubmissionItem 1─* PrivateResponse
StudentSubmissionItem *─* PublicAnswer   (via SourceLink; many sources per answer = merge)
BacklogQuestion *─* PublicAnswer          (via SourceLink)
User 1─1 StudentRecord   (resolved by normalized email; no join row)
ImportBatch 1─* StudentRecord | BacklogQuestion | Enrollment
```

## 3. State models

**[Confirmed]** design principle: **avoid one large status field.** Each concern is an independent dimension. A FormResponse, for example, carries *both* a response state and a validity state; they change independently.

Notation: transitions as `From → To (actor / condition)`. "Student-visible" lists what the student sees, if anything.

### 3.1 Form-instance state

States: `Draft`, `Scheduled`, `Open`, `Closed`, `Archived`, `Skipped`.

| From | To | Actor / trigger |
|------|-----|-----------------|
| (none) | Draft | staff create an instance to open by hand (`manual` delivery) |
| (none) | Scheduled | generated from a delivery configuration |
| Draft | Scheduled | staff schedule it |
| Draft/Scheduled | Open | scheduler at open-at, **or** staff open it (`manual` delivery is never opened by the scheduler) — idempotent; reconciled if the scheduler was down (see [weekly-form-workflow.md](weekly-form-workflow.md)) |
| Draft/Scheduled | Skipped | staff skip this occurrence |
| Skipped | Scheduled | staff restore it — safe because a skipped instance has never opened and holds no response |
| Open | Closed | scheduler at deadline; or staff close early (which locks the responses and moves the deadline, audited) |
| Closed | Open | staff reopen (audited; hard-deadline policy [D5](open-decisions.md)) |
| Closed | Archived | staff or end-of-term archive |

- Invalid: `Skipped → Open`; `Archived → *` (except un-archive if later supported). Students may submit only while `Open` and before deadline.
- Student-visible: whether a form is open and its deadline, plus its title and optional focus. Never the audience, another section, a count, or `Draft`/`Skipped` internals.
- Lifecycle transitions on a SHARED instance require the capability on **every** audience section: opening, closing, skipping, reopening and re-windowing affect all of them at once. Read models use the looser "any audience section" rule and filter their rows instead ([FORMS-AUDIENCE-DYNAMIC-INSTANCES.md §4](FORMS-AUDIENCE-DYNAMIC-INSTANCES.md)).

### 3.1a Response lifecycle

States: `Draft`, `Submitted`, `Locked`. Independent of §3.2 and §3.3.

| From | To | Actor / trigger |
|------|-----|-----------------|
| (none) | Draft | student saves a draft |
| (none) | Submitted | student submits without ever saving a draft |
| Draft | Submitted | student submits |
| Submitted | Submitted | student edits before the deadline (revision increments) |
| Submitted | Locked | cycle closes at the deadline (same transaction as `Open → Closed`) |
| Locked | Submitted | staff reopens the cycle (`manage_weekly_cycles`, audited — the only post-deadline edit path) |

- A `Draft` never earns participation credit and never appears in any staff review queue, export,
  or student history.
- `submittedAt` is written **once**, on the first submit, and is the participation anchor — editing
  cannot mint a second credit.
- Every draft save, submit, edit, lock, and unlock writes a `FormResponseRevision` (before/after)
  plus an `AuditEvent` in the same transaction.
- Original student wording is immutable: an edit may replace an *untouched* submission item by
  withdrawing and superseding it, and is refused for an item that already has a private reply, a
  source link, or a non-`New` review state.
- Student-visible: whether their response is a draft, submitted (with a last-edited time), or
  locked.

### 3.2 Form response review state

States: `Submitted`, `Under review`, `Reviewed`, `Archived`.

| From | To | Actor |
|------|-----|-------|
| (none) | Submitted | student submits |
| Submitted | Under review | staff opens it |
| Under review | Reviewed | staff finishes |
| any | Archived | staff/end-of-term |

- Student-visible: a neutral "Submitted" label only. Review progress is not shown.

### 3.3 Participation validity

States: `Valid`, `Flagged`, `Invalid`. Independent of §3.1a and §3.2.

| From | To | Action | Actor |
|------|-----|--------|-------|
| Valid | Flagged | `flag` (reason required) | SA with `flag_validity`, or an Instructor |
| Flagged | Invalid | `confirm_flag` (student-visible reason required) | **Instructor only** |
| Flagged | Valid | `reject_flag` | **Instructor only** |
| Valid | Invalid | `invalidate` (both reasons required) | **Instructor only** |
| Invalid | Valid | `restore` | **Instructor only** |

- Default on submit: `Valid`.
- `Flagged` **keeps** participation credit — a flag is an unconfirmed suspicion, so credit changes
  exactly once, when an Instructor decides (decision D15).
- A Student Assistant can never finalize invalidation, and cannot acquire that power through the
  `mark_validity` flag: finalizing additionally requires a non-TA section role.
- Every transition writes a `SubmissionValidityEvent` (actor, actor role, timestamp, prior value,
  new value, internal reason, staff note, student-visible reason) **and** an `AuditEvent`, in the
  same transaction, behind a state guard so two concurrent decisions cannot both apply.
- Student-visible: the student sees the validity of **their own** submission and, when `Invalid`,
  the separate student-visible reason. They never see the `Flagged` state, the internal reason
  enum, the staff note, the actor, or any other student's validity. **[Confirmed —
  project-specs.md §4.3, §6.5]**

### 3.4 Student-question review state

States: `New`, `Under review`, `Resolved`, `Archived`, `Moved to backlog`.

| From | To | Actor |
|------|-----|-------|
| New | Under review | staff |
| Under review | Resolved | staff (after private and/or public response, or a no-response decision) |
| Under review | Moved to backlog | staff copies/moves to course backlog (see [question-backlog.md](question-backlog.md)) |
| any | Archived | staff |

- Student-visible: neutral "Submitted"/"Answered" only (see §3.6 mapping). Never `no-response` decisions or `Under review`.

### 3.5 Response disposition

States: `Undecided`, `Private response`, `Public response`, `Private and public response`, `No response`, `Merged`.

- Set by staff during review; describes how a StudentSubmissionItem was handled. `Merged` means its content was combined into a PublicAnswer with other items (source link preserved).
- Student-visible: only the positive outcomes surface, and only as neutral labels — "Answered" when a private and/or public response exists. `No response` and `Undecided` are **never** shown as such. **[Confirmed]**

### 3.6 Public-answer state

States: `No draft`, `Draft`, `Awaiting approval`, `Scheduled`, `Published`, `Unpublished`.

| From | To | Actor / trigger |
|------|-----|-----------------|
| No draft | Draft | staff drafts a public answer (idempotent per request token) |
| Draft | Awaiting approval | a Student Assistant submits their draft for review |
| Awaiting approval | Published | **Instructor** approves and publishes |
| Awaiting approval | Draft | **Instructor** rejects with a required reason |
| Draft | Scheduled | staff schedules publication |
| Draft | Published | staff publishes immediately — refused for a TA-authored draft, which must go through approval |
| Scheduled | Published | scheduler at scheduled-at (idempotent; failure → see below) |
| Scheduled | Draft | staff cancels/edits schedule |
| Scheduled | (Scheduled, failure-flagged) | job fails; staff resolves/retries |
| Published | Published | **Instructor or `publish_public_answers` holder** edits — writes a `PublicQARevision` and bumps the last-updated time |
| Published | Unpublished | **Instructor only**, reason required, audited |
| Unpublished | Published | **Instructor only** (restore), audited |

- Scheduled-publication failure handling and idempotency are detailed in [public-qa-and-source-linking.md](public-qa-and-source-linking.md) and [architecture-history.md](architecture-history.md).
- Student-visible (to the asker, via source link): whether their question reached `Published`, plus
  the reworded public text, the answer, and a last-updated timestamp. Drafts, drafts awaiting
  approval, rejected drafts, schedules, unpublished entries, revision text, the editor's identity,
  and the revision count are **never** shown.
- Unpublishing removes the entry from the class archive **and** from the linked asker's history
  (decision D16). The private thread and the asker's immutable original question survive.

### 3.7 Backlog question state

States: `Imported`, `Needs review`, `Answerable`, `Drafting`, `Scheduled`, `Published`, `Archived`, `Not suitable`.

| From | To | Actor |
|------|-----|-------|
| (import) | Imported | import process |
| Imported | Needs review | staff triage |
| Needs review | Answerable / Not suitable | staff decision |
| Answerable | Drafting | staff begins public answer |
| Drafting | Scheduled / Published | via a PublicAnswer (states mirror §3.6) |
| any | Archived | staff |

- Backlog questions never auto-appear in any public archive; publishing to a section is explicit (SectionBacklogVisibility + a PublicAnswer). See [question-backlog.md](question-backlog.md).

### 3.8 Student identity — deliberately not a state model

**[Confirmed 2026-08-07]** Student identity has **no states**. The former account-match dimension
(`Unmatched` · `Candidate` · `Ambiguous` · `Confirmed` · `Rejected` · `Correction-pending`) was
removed with the name-matching workflow that produced it.

There is one question — *does an account's normalized email equal a class list's roster email?* —
and it is answered on every read. Nothing is pending, nothing is proposed, nothing needs
confirming, and there is no stored value that can drift out of step with the class list. Access
begins when a teacher imports the address and ends when they remove it.

Full rule, import validation, and migration behaviour in [student-identity.md](student-identity.md).

### 3.9 Invalid combinations (illustrative)

- A `FormResponse` cannot be `Invalid` and still contribute to participation counts.
- A `PublicAnswer` cannot be `Published` with zero `SourceLink`s **unless** it is a staff-curated/legacy entry with no source by design (see [legacy-question-import.md](legacy-question-import.md)).
- A `StudentSubmissionItem` disposition `Merged` requires at least one `SourceLink` to the merged `PublicAnswer`.
- A `FormInstance` cannot accept a `FormResponse` unless it is `Open` and before its deadline.
- A `FormInstance` must have at least one audience section. Enforced by the three services that create instances and asserted by integration tests — a `CHECK` cannot span tables.
- A `FormResponse`'s attribution section must be one of its instance's audience sections.

### 3.10 Read state — about the reader, not the submission

**[Confirmed 2026-09-07 — GitHub issue #6]** Whether a response has been read is **not** a state
dimension of the response, which is why it is a separate table rather than a column and why it does
not appear in §7 of [../AGENTS.md](../AGENTS.md) beside the review and validity dimensions.

A response has no single read state. It has one per staff member who can see it, and those disagree
by design — the point of the feature is that each reader resumes where *they* left off. A column
would force one shared answer, and the shared answer is the harmful one.

What it never touches: participation credit, validity, review state, disposition, publication, or
anything a student can see. **A student is never told whether staff have opened their submission** —
that would be a claim the product does not make and a pressure it should not apply.

Distinct from `src/lib/reviewed-session.ts`, which answers "did I act on this in *this sitting*?"
and is deliberately a session cookie: it keeps a post you have just answered in place under the
"needs a reply" view instead of letting it vanish under the cursor. Read state is the persistent
question, and the two are independent.

<a id="audit-events"></a>

## 4. Audit events

**[Confirmed]** Every important action produces an **AuditEvent** recording: **actor** (→ User), **action** (typed), **timestamp**, **affected entity** (type + id), and **important before/after values**. Audit records are staff/admin-visible only; never student-visible (R6).

Audited actions **[Confirmed]** include: course creation; class creation; class-list import
(including preview edits); roster row additions, deactivations, refusals, and
**email linkage changes**; staff-permission changes; template creation/edits;
form delivery configuration and **audience** changes; per-occurrence window overrides; per-occurrence question customization, rewording, and reset; per-occurrence focus changes; form-instance generation; **draft save,
submission, edit, lock, and unlock**; every validity transition; bonus-period creation/edit and
cycle-to-period assignment; private responses **and student follow-ups**; comment moderation and
discussion locks; public-question rewording; **submit-for-approval, approval, and rejection**;
answer edits (with a revision record); merging **and unmerging**; backlog recommendations and
**Instructor confirmations**; moving/copying to backlog; legacy question import (stage, per-row
edit, identity-preservation choice, commit); source-link creation/correction; scheduled
publication; publication; **unpublishing and restoration**; **course archive, restore, and clone**;
every export; and each email send attempt.

Audit rows never carry private message bodies, comment bodies, or student numbers — only
identifiers, state transitions, reasons, and content lengths/digests.

### 4.1 How the log is READ **[Confirmed 2026-09-08 — GitHub issue #16]**

The log's shape is a domain concern; how a teacher reads it is a separate decision, taken here
because the same rules bind every future surface over these rows.

- **One sentence per entry — actor, verb, object.** `src/lib/audit-story.ts` maps each action to a
  past-tense predicate and each entity type to a noun, so an entry reads "Maria Santos published an
  answer to *When will the practice set be available?*" rather than `public_answer.published`. An
  action with no predicate yet still forms a sentence from its existing label.
- **No student is ever named, in any position.** Three places, because the first implementation
  closed only one of them:
  - the *object* is resolved only for course-shaped entities — a public question's reworded text, a
    class list, a course, a form, an occurrence — and every student-shaped entity
    (`form_response`, `student_submission_item`, `student_record`, `enrollment`,
    `private_response`) resolves to a noun instead. The subject map is keyed by **entity type and
    id**, never id alone, so a student-shaped row cannot inherit a label resolved for a
    course-shaped one; and each lookup is constrained to this section or its course, so an id that
    reached the log by another route resolves to nothing;
  - the *actor* of the actions a student performs (submit, edit, save a draft, withdraw, follow up
    privately, comment) reads as "A student", **and is masked in the read model** — `actor` comes
    back null and the projected event carries no `actorUserId`, so no surface over it can print a
    name it was never given;
  - the *actor filter* offers staff, the scheduler, and **"Students" as a group**. A person is
    offered only when they wrote at least one row as staff, so a teacher who is also enrolled keeps
    their option and a student never gains one. Filtering by a guessed student id returns nothing:
    the clause admits that account's staff rows only, so the filter cannot be turned into a
    per-student activity view one id at a time.

  The reader holds `view_student_identities` by role, so none of this prevents an escalation; it
  keeps the log's default reading about what happened rather than about who a student is. Which
  student a submission belongs to stays answerable where it belongs — beside the submission, in the
  review inbox. The audit ROW itself is untouched and append-only; what is withheld is this read
  model's projection of it.
- **Changes are named fields, not a payload.** `before`/`after` render as a
  before → after list per changed field, with only the fields that differ. A value that is a
  structure is described (`3 items`, `changed`) rather than serialized inline, and a value longer
  than 80 characters is truncated.

- **What the default diff will not print [Confirmed 2026-09-08 — GitHub issue #16].** The rows do
  carry identity for the writes whose whole purpose is to record it: `roster.row_added` stores
  `fullName` and `rosterEmail`, `roster.email_linked` stores both sides of `rosterEmail`,
  `student_record.name_corrected` stores the name, and `staff.assigned` stores an `email`. Those
  rows are right to hold them — the imported UP email **is** the access grant, and an audit log that
  did not say what was granted would not be one. But a teacher scanning a history to find out that
  an import happened should not be reading a list of names and addresses to do it. So the default
  view states the FACT and **withholds the value**, showing the field's label and the word
  `withheld`; absence still reads as `not set`, because that discloses nothing and is the fact a
  reader needs. Prose fields (`answerBody`, `body`, `text`, `note`, `originalText`, …) are reported
  by length. Both are enforced by an explicit list **and** by name patterns, so a field a future
  writer adds is withheld until somebody classifies it — the safe direction for a display.

  One deliberate exception: `publicQuestionText` prints on both sides, because
  `public_answer.reworded` is the single most useful diff in the log, both sides are staff-authored
  wording already published to that whole class, and the student's original words are immutable and
  never in that payload.

- **The raw payload is retained, as a staff-only exception.** It sits behind a labelled, closed
  disclosure — *"Technical details, exactly as stored"*, with a line saying the list above withholds
  names, addresses and message text. Keeping it unredacted is a decision, not an oversight: "what
  did the system actually store" is the question an audit log exists to answer when something has
  gone wrong, and a redacted copy could not. It is safe here because the page already requires
  **non-TA section standing**, and an instructor holds `view_student_identities` by role — so it
  contains no name or address they cannot already read on the class list. Nothing about the stored
  row changes: the log is append-only and everything above is a projection of it.
- **A teacher-facing allowlist decides what is shown by default.** Derived from `AUDIT_ACTIONS` by
  subtracting the platform's own records — occurrence generation, response locking, email delivery,
  per-reader read state, source linking, student-number ops, import mechanics, the platform-admin
  teacher-role grant, and the removed claim/match codes. Derived from a denylist so a newly added
  action is teacher-facing until somebody decides otherwise. **Withheld is never deleted:** the log
  is append-only and the view offers an explicit "everything, including system records" scope.
- **Every narrowing is a SQL clause.** Action, actor, and an inclusive date range in the section's
  own timezone, all applied to the same predicate the count and the offset use — so a filtered view
  cannot advertise a page it has nothing to fill. Requesting a withheld action inside the default
  scope returns nothing rather than silently dropping the filter, and the action selector is built
  from the set the CURRENT scope can show — the allowlist by default, all of `AUDIT_ACTIONS` under
  "everything" — so the control never advertises a record it cannot then select. Only the exact
  string `all` widens the scope: any other value normalizes to the default, so an unrecognised
  parameter cannot open the log up.
- **Scope is three disjoint cases**, decided by how much scope the WRITER recorded, not by id
  uniqueness:
  1. `section_id` names this section — the row is ours;
  2. `section_id IS NULL AND course_id` names this course — a **course-level** record. The writers
     that own course-level entities record only the course (`course.created`, `course.updated`,
     `template.created`, `template.version_created`, `form.delivery_configured`,
     `form.audience_set`, `cycle.*`, `staff.course_*`, `legacy.imported`, `backlog.*`) because a
     section's forms, templates, schedules and backlog all live there. None of those entities is
     reachable from a section by id, so without this clause a section's own history silently
     omitted every one of them. No student data is written at course scope;
  3. both columns NULL — the legacy path, reached by fanning out from the section to the entity ids
     it owns. The audit table gained its scope columns after rows already existed; this case reaches
     the rows written before that.

  `section_id IS NULL` on cases 2 and 3 is the safety: without it a row that explicitly says
  "section B" would reach section A by sharing a course or by naming a colliding entity id. Case 3
  additionally requires no course, so a row from another course cannot arrive through a collision.
- **Every writer records its own scope, and two kinds of writer must.** A course-owned entity is
  reachable from no section, and an entity **deleted in the same transaction** (`staff.removed`)
  can never be found by fanning out again — so both record the column rather than relying on case
  3. One deliberate exception: `user.teacher_role_changed` is platform administration, owned by no
  course, and stays unscoped (it is also withheld from the default view).
- **Nothing rendered is markup.** A subject label may be staff-authored rich text and arrives
  flattened by the read model; every value reaches the page as plain text in a JSX text node.

Audit implementation approach (append-only, before/after capture) is discussed in [architecture-history.md](architecture-history.md#audit).

## 5. Related documents

[product-requirements.md](product-requirements.md) · [roles-and-permissions.md](roles-and-permissions.md) · [weekly-form-workflow.md](weekly-form-workflow.md) · [participation-rules.md](participation-rules.md) · [student-identity.md](student-identity.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [question-backlog.md](question-backlog.md) · [legacy-question-import.md](legacy-question-import.md) · [open-decisions.md](open-decisions.md) · [architecture-history.md](architecture-history.md)
