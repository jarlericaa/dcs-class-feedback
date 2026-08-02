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

- **User** — an authenticated Google identity. Fields: Google subject id, university email, display name (mutable), platform role flags, active flag. A User is *not* a student until matched.
- **StudentRecord** — a roster row for a student in a section context. Fields: student number (permanent internal identity, **[Assumption A2]**), full name (as imported), normalized-name fields, → ImportBatch that created it. Student number is the stable key across name changes.
- **AccountMatch** — links a User to a StudentRecord. Fields: → User, → StudentRecord, match state (see §3.8), match method (auto/teacher/manual-correction), confidence signals, confirmed-by → User (staff), timestamps. Correctable after verification. See [account-matching.md](account-matching.md).

### Academic structure

- **Course** — reusable course. Fields: title, code, owner → User, active flag. Owns templates, backlog, lessons/topics, (future) course materials.
- **CourseStaff** — a teacher authorized on a Course. Fields: → Course, → User, course role.
- **ClassSection** — an offering of a Course. Fields: → Course, term/semester label, title, timezone (default from institution; per-section override is [Open D7](open-decisions.md)), active flag.
- **SectionStaff** — staff membership on a section with per-section permission flags (the TA permission catalog). Fields: → ClassSection, → User, role (teacher/TA/co-teacher), permission flag set. See [roles-and-permissions.md](roles-and-permissions.md).
- **Enrollment** — a StudentRecord's membership in a ClassSection. Fields: → ClassSection, → StudentRecord, status (active/deactivated), source → ImportBatch. A student may appear in multiple sections **[Assumption A1]**.

### Forms & templates

- **Lesson / Topic** — course-level content unit. Fields: → Course, title, kind (lesson/lecture/module/topic), order.
- **FormTemplate** — reusable question set. Fields: → Course (or → owning User for private), title, description, visibility (private-by-default / course-shared), archived flag. See [weekly-form-workflow.md](weekly-form-workflow.md).
- **TemplateVersion** — an immutable snapshot of a template's questions/settings. Applying a template copies from a version; later template edits create new versions and never mutate already-generated cycles.
- **RecurrenceSchedule** — per-section recurring config. Fields: → ClassSection, frequency, open day/time, deadline day/time, start date, end date or occurrence count, → FormTemplate (source), timezone, active flag.
- **WeeklyCycle** — a weekly instance. Fields: → ClassSection, cycle index/sequence, open-at, deadline-at, → source RecurrenceSchedule, → snapshot of questions (see FormQuestion), state (§3.1). A uniqueness constraint prevents duplicate cycles for the same section+window (idempotent generation).
- **FormQuestion** — a question *as snapshotted into a cycle* (not the live template question). Fields: → WeeklyCycle (or → TemplateVersion for template-side), prompt, description, type (§ question types in [weekly-form-workflow.md](weekly-form-workflow.md)), choices/scale settings, required flag, display order, → default category, → Lesson/Topic, validation rules.

### Submissions & responses

- **FormResponse** — one student's completed form for a cycle. Fields: → WeeklyCycle, → StudentRecord, submission timestamp, state (§3.2), participation validity (§3.3), invalidation reason (staff-only). **Unique on (WeeklyCycle, StudentRecord)** — enforces one submission per student per section per cycle.
- **QuestionAnswer** — an answer to one FormQuestion within a FormResponse. Fields: → FormResponse, → FormQuestion, value(s) (stores stable option ids *and* labels where applicable), free text.
- **StudentSubmissionItem** — the student-originated question/feedback/concern/clarification/suggestion within a FormResponse. Fields: → FormResponse, submission type (student-selected, staff-correctable), broad category (Content/Logistics/Misc), → Lesson/Topic (for content), original text (**immutable**), review state (§3.4), response disposition (§3.5).

### Responses & publishing

- **PrivateResponse** — a private reply to a StudentSubmissionItem. Fields: → StudentSubmissionItem, author → User (staff), body, timestamp. Visible only to the asker and authorized staff.
- **PublicAnswer** — a published/publishable anonymous Q&A entry. Fields: → ClassSection, reworded public question text, answer body, public-answer state (§3.6), scheduled-at, published-at, failure info, → category/topic for archive organization, source origin (current/legacy). Never stores source identity in public-visible fields.
- **SourceLink** — internal link between a PublicAnswer and its source(s). Fields: → PublicAnswer, → StudentSubmissionItem **or** → BacklogQuestion, created-by, timestamp. **Many-to-one on PublicAnswer** (supports merge). Internal-only; drives "your question was answered" without exposing identity to other students. See [public-qa-and-source-linking.md](public-qa-and-source-linking.md).

### Backlog & import

- **BacklogQuestion** — a course-level question awaiting possible public answering. Fields: → Course, text, → optional category/topic, state (§3.7), source provenance (current-copied / legacy-import), → optional source StudentSubmissionItem (only if intentionally linked), identity-preservation flag, → ImportBatch (if imported). Belongs to the **course**, not a section. See [question-backlog.md](question-backlog.md).
- **SectionBacklogVisibility** — records that a BacklogQuestion has been made visible/publishable to a specific ClassSection. Fields: → BacklogQuestion, → ClassSection, made-visible-by. Explicit and per-section; no automatic public exposure.
- **ImportBatch** — a roster or legacy import event. Fields: kind (roster/legacy), source description, → Course or → ClassSection, importer → User, row counts/summary, timestamp. See [account-matching.md](account-matching.md) and [legacy-question-import.md](legacy-question-import.md).

### Future (post-MVP, model kept compatible only)

- **CourseMaterial** — post-MVP entity. Not managed in MVP; the model reserves course-level ownership and topic tagging so materials can attach later. See [ai-future-plan.md](ai-future-plan.md).

### Cross-cutting

- **AuditEvent** — see §4.

## 2. Key relationships (text ERD)

```
Course 1─* ClassSection 1─* WeeklyCycle 1─* FormResponse 1─* QuestionAnswer
Course 1─* CourseStaff *─1 User
Course 1─* FormTemplate 1─* TemplateVersion
Course 1─* Lesson/Topic
Course 1─* BacklogQuestion *─* ClassSection   (via SectionBacklogVisibility)
ClassSection 1─* SectionStaff *─1 User
ClassSection 1─* Enrollment *─1 StudentRecord
ClassSection 1─* RecurrenceSchedule
ClassSection 1─* PublicAnswer
FormResponse 1─* StudentSubmissionItem 1─* PrivateResponse
StudentSubmissionItem *─* PublicAnswer   (via SourceLink; many sources per answer = merge)
BacklogQuestion *─* PublicAnswer          (via SourceLink)
User 1─* AccountMatch *─1 StudentRecord
ImportBatch 1─* StudentRecord | BacklogQuestion | Enrollment
```

## 3. State models

**[Confirmed]** design principle: **avoid one large status field.** Each concern is an independent dimension. A FormResponse, for example, carries *both* a response state and a validity state; they change independently.

Notation: transitions as `From → To (actor / condition)`. "Student-visible" lists what the student sees, if anything.

### 3.1 Weekly cycle state

States: `Draft`, `Scheduled`, `Open`, `Closed`, `Archived`, `Skipped`.

| From | To | Actor / trigger |
|------|-----|-----------------|
| Draft | Scheduled | staff schedules; or generated from recurrence |
| Scheduled | Open | scheduler at open-at (idempotent; reconciled if scheduler was down — see [weekly-form-workflow.md](weekly-form-workflow.md)) |
| Draft/Scheduled | Skipped | staff skips this occurrence |
| Open | Closed | scheduler at deadline; or staff closes early |
| Closed | Open | staff reopens (audited; grace/reopen policy is [Open D5](open-decisions.md)) |
| Closed | Archived | staff or end-of-term archive |

- Invalid: `Skipped → Open`; `Archived → *` (except un-archive if later supported). Students may submit only while `Open` and before deadline.
- Student-visible: whether the current cycle is open and its deadline. Not `Draft`/`Skipped` internals.

### 3.2 Form response state

States: `Submitted`, `Under review`, `Reviewed`, `Archived`.

| From | To | Actor |
|------|-----|-------|
| (none) | Submitted | student submits |
| Submitted | Under review | staff opens it |
| Under review | Reviewed | staff finishes |
| any | Archived | staff/end-of-term |

- Student-visible: a neutral "Submitted" label only. Review progress is not shown.

### 3.3 Participation validity

States: `Valid`, `Invalid`. Independent of §3.2.

- Default on submit: `Valid` (a complete submitted form counts). `Valid → Invalid` and back by authorized staff, **always audited**, with an invalidation reason (staff-only). See [participation-rules.md](participation-rules.md).
- Student-visible: **nothing** in MVP — students do not see validity or the reason. **[Confirmed]**

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

States: `No draft`, `Draft`, `Scheduled`, `Published`, `Unpublished` (**future only — [Open D6](open-decisions.md); not an MVP promise**).

| From | To | Actor / trigger |
|------|-----|-----------------|
| No draft | Draft | staff drafts a public answer |
| Draft | Scheduled | staff schedules publication |
| Draft | Published | staff publishes immediately |
| Scheduled | Published | scheduler at scheduled-at (idempotent; failure → see below) |
| Scheduled | Draft | staff cancels/edits schedule |
| Scheduled | (Scheduled, failure-flagged) | job fails; staff resolves/retries |
| Published | Unpublished | **future only** |

- Scheduled-publication failure handling and idempotency are detailed in [public-qa-and-source-linking.md](public-qa-and-source-linking.md) and [architecture-proposal.md](architecture-proposal.md).
- Student-visible (to the asker, via source link): whether their question reached `Published`, plus the reworded public text and the answer. Drafts/schedules are not shown.

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

### 3.8 Account-match state

States: `Unmatched`, `Candidate`, `Ambiguous`, `Confirmed`, `Rejected`, `Correction-pending`.

- `Unmatched` (SSO account, no roster candidate) → held as pending verification, visible to teacher.
- `Candidate` (one plausible match) / `Ambiguous` (multiple similar names) → require teacher confirmation; no silent verification. **[Confirmed / Recommended policy: teacher-confirm-all]**
- `Confirmed` → the User is bound to the StudentRecord (student number is now the identity).
- `Correction-pending` → a previously-confirmed match is being re-verified after a teacher-initiated correction (audited).
- Full flow and threat model in [account-matching.md](account-matching.md).

### 3.9 Invalid combinations (illustrative)

- A `FormResponse` cannot be `Invalid` and still contribute to participation counts.
- A `PublicAnswer` cannot be `Published` with zero `SourceLink`s **unless** it is a staff-curated/legacy entry with no source by design (see [legacy-question-import.md](legacy-question-import.md)).
- A `StudentSubmissionItem` disposition `Merged` requires at least one `SourceLink` to the merged `PublicAnswer`.
- A `WeeklyCycle` cannot accept a `FormResponse` unless it is `Open` and before its deadline.

## 4. Audit events

**[Confirmed]** Every important action produces an **AuditEvent** recording: **actor** (→ User), **action** (typed), **timestamp**, **affected entity** (type + id), and **important before/after values**. Audit records are staff/admin-visible only; never student-visible (R6).

Audited actions **[Confirmed]** include: course creation; class creation; class-list import; student-account matching; manual match correction; staff-permission changes; template creation/edits; recurrence-config changes; weekly-cycle generation; form submission; validity changes; private responses; public-question rewording; answer edits; merging; moving/copying to backlog; legacy question import; source-link creation/correction; scheduled publication; publication; unpublishing (if later supported).

Audit implementation approach (append-only, before/after capture) is discussed in [architecture-proposal.md](architecture-proposal.md#audit).

## 5. Related documents

[product-requirements.md](product-requirements.md) · [roles-and-permissions.md](roles-and-permissions.md) · [weekly-form-workflow.md](weekly-form-workflow.md) · [participation-rules.md](participation-rules.md) · [account-matching.md](account-matching.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [question-backlog.md](question-backlog.md) · [legacy-question-import.md](legacy-question-import.md) · [open-decisions.md](open-decisions.md) · [architecture-proposal.md](architecture-proposal.md)
