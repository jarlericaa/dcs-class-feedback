# Public Q&A & Source Linking

> **Status:** Product/privacy rule specification with an implemented foundation.
> This document **owns** private/public responses, rewording rules, source-link invariants, small-class anonymity rules, scheduled publication, the public archive, and the student submission-history view.
>
> **Scope: the COURSE owns public Q&A** ([ADR-0005](../decisions/ADR-0005-course-scoped-teaching-workflow.md), 2026-09-12). One publication is one entry, read by every student holding an active enrolment in any eligible section of the course. ADR-0002, which made the archive section-scoped, is superseded on that point only — every anonymity and source-linking rule it set is retained and matters more, because a published entry now reaches a larger audience. States: [domain/domain-model.md](domain-model.md#3-state-models). Scheduling infrastructure: [engineering/architecture-history.md](../engineering/architecture-history.md#scheduling).
> Label key as in [product/requirements.md](../product/requirements.md).

## 1. Response types **[Confirmed]**

A student-originated question (`StudentSubmissionItem`) may receive: a private response, a public response, both, or no response (`Response disposition`, [domain/domain-model.md](domain-model.md#35-response-disposition)).

- **Private response** — visible only to the student who submitted the question and authorized staff.
- **Public response** — visible to the class, with the asker **anonymous**.

Public publishing is mainly for **student-originated questions**, not ordinary answers to teacher-created form questions. **[Confirmed]**

## 2. Rewording public questions **[Confirmed]**

Teachers may reword a student's question before publishing to: fix typos, correct grammar, improve clarity, remove personal/identifying context, recontextualize, generalize for the class, or combine related questions.

- Students do **not** need to approve the reworded version before publication.
- The **original wording is never overwritten or destroyed** — the reworded text lives on the `PublicAnswer`; the original stays on the `StudentSubmissionItem`.
- The original asker can see **both** their original question and the public reworded version, linked from their submission history (§6).

## 3. Small-class anonymity rules (Risk R2) **[Recommended]**

Anonymization is not automatic safety. With few students, or a highly specific/personal question, the asker can remain identifiable even after rewording. Therefore:

- **Rewording must remove identifying context** — names, personal circumstances, and details that point to one person. This is the primary mitigation.
- **Pre-publish warning:** the publish/schedule UI **warns the teacher** before publishing a highly specific or personal question, prompting them to generalize or keep it private. (Heuristics for "highly specific" are a design detail; the requirement is that the warning exists.)
- **Merge wording must not imply a single asker** unless that is safe and intentional (§5).
- These rules back Risks R2 and R3 in [product/requirements.md](../product/requirements.md#7-security--privacy-risk-register).

## 4. Source link between question and public answer **[Confirmed]**

When a teacher publishes a student-originated question publicly, the public entry stays **internally linked** to the source submission via `SourceLink` ([domain/domain-model.md](domain-model.md)). This link is used so that:

- The submitting student can see that their question was answered.
- The submitting student can see the reworded public version.
- Authorized staff can trace the public answer back to the original submission.
- The class sees the question **anonymously**.
- Student identity stays hidden from other students.

**Invariant:** `SourceLink` is internal-only; no source identity ever appears in any student-visible public field.

**The source section survives here and only here.** A `PublicAnswer` records no section; which class a question came from is reachable internally as `SourceLink → StudentSubmissionItem → FormResponse.sectionId`, for staff traceability and audit. It is never a visibility key, never a publishing target, and never part of a student payload ([ADR-0005](../decisions/ADR-0005-course-scoped-teaching-workflow.md)). Rows published before that change may carry `origin_section_id` as historical provenance, which is read by nothing.

<a id="5-merging-multiple-submissions"></a>

## 5. Merging multiple submissions **[Confirmed]**

When multiple submissions merge into one public answer:

- **Every** source submission remains linked (many `SourceLink`s → one `PublicAnswer`).
- **Every** source student can see that their question contributed to a public answer.
- The public version must **not reveal any source student identity**.
- The public wording must **not imply it came from exactly one student** unless that is safe and intentional.

- **[Confirmed — D8, closed 2026-08-03; scope widened by [ADR-0005](../decisions/ADR-0005-course-scoped-teaching-workflow.md) 2026-09-12]** Merge scope is within a single **course**, and it **may span cycles and sections**. One course, one answer: merging Lab A's and Lab B's versions of the same question is now the ordinary case rather than something that had to detour through the backlog.
  - **Authorization does not widen with it.** The actor must hold `draft_public_answers` on **every** source submission's own section, so a merge cannot become a way to reach a class list they were never authorized to review.
  - Merging remains a publishing concern only — each source student's per-cycle participation is unaffected (see [participation.md](participation.md#3-participation-derivation)).

## 6. Student submission-history view **[Confirmed]**

Students can view: their submitted weekly forms; their answers; their student-originated questions/feedback; submission timestamps; private responses to them; whether their question was publicly answered; the public reworded version of their question (when published); the public answer linked to their original question (when published); and neutral status labels such as "Submitted" or "Answered."

Students must **not** see: invalidity status; invalidation reason; no-response decisions; internal notes; draft answers; staff audit records; participation totals (MVP). See [domain/roles-and-permissions.md](roles-and-permissions.md#4-student-visibility-guarantees-cross-reference) and Risk R6.

- **[Recommended]** State→label mapping for students: any of `Private response` / `Public response` / `Private and public response` → "Answered"; `Undecided` / `No response` → remains "Submitted" (never surfaced as "no response").

<a id="7-scheduled-public-answers"></a>

## 7. Scheduled public answers **[Confirmed]**

Teachers can: publish immediately; schedule for a future date/time; edit a scheduled post; cancel scheduled publication; view scheduled posts; see whether scheduled publication succeeded; and resolve failed scheduled-publication jobs. Public-answer states: [domain/domain-model.md](domain-model.md#36-public-answer-state).

- **[Confirmed]** Scheduling uses the institution timezone — **D7** closed 2026-08-03; per-section overrides are deferred ([decisions/open-decisions.md](../decisions/open-decisions.md)).
- **[Confirmed — [ADR-0005](../decisions/ADR-0005-course-scoped-teaching-workflow.md)]** A publication is course-owned, so its timezone is resolved at **course** scope by one rule (`resolveCourseTimezone`): the sections' shared timezone when they all agree, and the configured `INSTITUTION_TIMEZONE` otherwise. Reading "the first section" would give one course different answers depending on which query ran.
- **[Confirmed]** Prefer **database-backed scheduling** before recommending message brokers — see [engineering/architecture-history.md](../engineering/architecture-history.md#scheduling).

### 7.1 Idempotency & failure handling **[Recommended]**

- **Idempotent publication:** the publish job checks the `PublicAnswer`'s current state before acting and uses a unique job key per answer; re-running never double-publishes.
- **Scheduler-down:** on restart, the reconciliation poller finds `Scheduled` answers past their scheduled-at and publishes them late (flagged **late** in audit).
- **Failure surfacing:** a failed job leaves the answer `Scheduled` with a failure flag/reason, visible to staff, with retry/resolve actions. Failures surface **in-app** on the scheduled-posts view: email notifications (`F1`) are approved and built for form-opened, deadline reminders and validity changes, but **no publication-failure notification exists**, so in-app is still the only channel for this.

## 8. Public class Q&A archive **[Confirmed]**

Each **course** has one **searchable, public-to-class** archive of published Q&A ([ADR-0005](../decisions/ADR-0005-course-scoped-teaching-workflow.md)). It replaces the manually compiled answer documents.

**One course, one archive.** A course running three laboratory sections publishes a useful answer **once**; students in all three read that same entry. Publishing the same answer once per section — the previous model — is the defect this replaced, not a feature to preserve.

Entries may be organized by: Content / Logistics / Miscellaneous; lesson/lecture/module/topic; publication date; weekly cycle; legacy vs current source.

- **[Confirmed]** Teachers choose which imported legacy/backlog questions are answered publicly — nothing from the backlog appears automatically (see [domain/question-backlog.md](question-backlog.md)). What they no longer choose is a **target section**: answering a backlog question produces one course entry.
- **[Confirmed]** Archive filters: full-text search over the public question and answer, topic and
  category, date range, source form/cycle, and bonus period, with pagination. Access requires
  staff standing on the course, or an **active enrolment in any one of its sections** — a student in
  Lab B reads an answer that originated in Lab A, which is the point of a shared archive.
- **[Confirmed — [ADR-0005](../decisions/ADR-0005-course-scoped-teaching-workflow.md)]** There is **no section filter** on the archive, and adding one would be a regression. Which class a question came from is not part of navigating a shared archive, and offering it as a facet would invite exactly the inference §3's anonymity rules exist to prevent. The student payload carries no origin section at all.
- **[Confirmed]** Each entry shows a last-updated timestamp when it has been edited. Staff-only
  revision metadata — the prior text, the editor, and the revision count — is **never** in the
  student payload.
- **[Confirmed 2026-09-07 — GitHub issue #14]** Each published answer is **signed with the display
  name of the staff member who published it**. This is the one place a staff name reaches a student:
  a private reply is still attributed to "your teaching team" rather than to a person
  ([student submission-history view](#6-student-submission-history-view-confirmed)). It changes
  nothing about the **asker**, who stays anonymous, and adds no source link, draft or revision
  metadata to the student payload. The asker line on an entry reads **`Anonymous`** — a scoped
  exception to CONTENT-VOICE P3, recorded there.
- **Still excluded:** voting/upvotes, "I also have this question," and public student identities
  ([product/scope.md](../product/scope.md)). Reactions and moderated comments are **approved** as `P2` — see §8A.
- **[Confirmed — [ADR-0005](../decisions/ADR-0005-course-scoped-teaching-workflow.md)]** Reactions and comments follow their subject: any eligible enrolled student of the course may react or comment under the existing moderation rules, comments stay pseudonymous to classmates, staff always see the real author, and no discussion is bound to the entry's origin section.

## 8A. Approval, revision, and unpublishing **[Confirmed — product/specification.md §6.8, §10]**

- A draft written by a **Student Assistant** enters `Awaiting approval`; only an **Instructor** may
  approve and publish it. An attempt to publish a TA-authored draft directly is refused by the
  service, not merely hidden in the UI.
- An **Instructor**'s own draft may be published directly.
- Approval and rejection are recorded with the responsible Instructor; rejection requires a reason
  and returns the entry to `Draft`.
- The anonymity warning and the immutability of the original student wording are unchanged, and the
  warning is re-checked when a published question is edited.
- Editing a published entry writes a revision record holding the prior public question text, the
  prior answer body, the editor, and the timestamp, and updates the student-visible last-updated
  time.
- **Unpublishing** is Instructor-only, requires a reason, is audited, and is reversible by restore.
  An unpublished entry leaves the class archive **and** the linked asker's history (decision D16);
  the private thread and the asker's original question survive.
- Drafts, drafts awaiting approval, rejected drafts, scheduled answers, unpublished entries, source
  links, and identities never enter a student-facing payload.
- Draft creation and publish attempts are safe to retry: drafting is idempotent per request token
  and source-link insertion cannot duplicate.

## 8B. Reactions and moderated comments **[Confirmed — product/specification.md §8 P2]**

- Only enrolled course members and authorized staff may react or comment.
- A comment is `Pending` until staff approve it; the author sees their own pending comment and
  nobody else does.
- Commenters are pseudonymous to classmates (`Student N`, scoped to a single entry so the label
  cannot be correlated across the archive) and identifiable to staff.
- Staff with `moderate_discussion` may approve, reject, remove, and **lock** a discussion. Locking
  stops new comments and leaves existing approved comments visible.
- Every moderation action is audited by identifier and state transition; comment bodies never enter
  audit rows.

## 9. Decisions affecting this area

D6 (unpublish — **approved**; not yet built, see [engineering/current-state.md](../engineering/current-state.md) E2), D7 (institution timezone), D8 (cross-cycle merge —
**now within a course**, see §5), D16 (unpublish hides from the asker too) are **closed**. See
[decisions/open-decisions.md](../decisions/open-decisions.md).

[ADR-0005](../decisions/ADR-0005-course-scoped-teaching-workflow.md) (2026-09-12) moved public Q&A,
the publication queue and the backlog's publishing step from section scope to **course** scope, and
supersedes [ADR-0002](../decisions/ADR-0002-section-scoped-public-qa.md) on scope alone.

## 10. Related documents

[decisions/ADR-0005](../decisions/ADR-0005-course-scoped-teaching-workflow.md) · [domain/domain-model.md](domain-model.md) · [domain/question-backlog.md](question-backlog.md) · [domain/legacy-question-import.md](legacy-question-import.md) · [participation.md](participation.md) · [domain/roles-and-permissions.md](roles-and-permissions.md) · [engineering/architecture-history.md](../engineering/architecture-history.md) · [decisions/open-decisions.md](../decisions/open-decisions.md)
