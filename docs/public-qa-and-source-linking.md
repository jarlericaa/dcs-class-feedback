# Public Q&A & Source Linking

> **Status:** Planning / pre-implementation.
> This document **owns** private/public responses, rewording rules, source-link invariants, small-class anonymity rules, scheduled publication, the public archive, and the student submission-history view. States: [domain-model.md](domain-model.md#3-state-models). Scheduling infrastructure: [architecture-proposal.md](architecture-proposal.md#scheduling).
> Label key as in [product-requirements.md](product-requirements.md).

## 1. Response types **[Confirmed]**

A student-originated question (`StudentSubmissionItem`) may receive: a private response, a public response, both, or no response (`Response disposition`, [domain-model.md](domain-model.md#35-response-disposition)).

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
- These rules back Risks R2 and R3 in [product-requirements.md](product-requirements.md#7-security--privacy-risk-register).

## 4. Source link between question and public answer **[Confirmed]**

When a teacher publishes a student-originated question publicly, the public entry stays **internally linked** to the source submission via `SourceLink` ([domain-model.md](domain-model.md)). This link is used so that:

- The submitting student can see that their question was answered.
- The submitting student can see the reworded public version.
- Authorized staff can trace the public answer back to the original submission.
- The class sees the question **anonymously**.
- Student identity stays hidden from other students.

**Invariant:** `SourceLink` is internal-only; no source identity ever appears in any student-visible public field.

## 5. Merging multiple submissions **[Confirmed]**

When multiple submissions merge into one public answer:

- **Every** source submission remains linked (many `SourceLink`s → one `PublicAnswer`).
- **Every** source student can see that their question contributed to a public answer.
- The public version must **not reveal any source student identity**.
- The public wording must **not imply it came from exactly one student** unless that is safe and intentional.

- **[Recommended]** Merge scope for MVP is within a single class section; cross-cycle merge within a section is [Open D8](open-decisions.md). Merging is a publishing concern only — each source student's per-cycle participation is unaffected (see [participation-rules.md](participation-rules.md#3-participation-derivation)).

## 6. Student submission-history view **[Confirmed]**

Students can view: their submitted weekly forms; their answers; their student-originated questions/feedback; submission timestamps; private responses to them; whether their question was publicly answered; the public reworded version of their question (when published); the public answer linked to their original question (when published); and neutral status labels such as "Submitted" or "Answered."

Students must **not** see: invalidity status; invalidation reason; no-response decisions; internal notes; draft answers; staff audit records; participation totals (MVP). See [roles-and-permissions.md](roles-and-permissions.md#4-student-visibility-guarantees-cross-reference) and Risk R6.

- **[Recommended]** State→label mapping for students: any of `Private response` / `Public response` / `Private and public response` → "Answered"; `Undecided` / `No response` → remains "Submitted" (never surfaced as "no response").

## 7. Scheduled public answers **[Confirmed]**

Teachers can: publish immediately; schedule for a future date/time; edit a scheduled post; cancel scheduled publication; view scheduled posts; see whether scheduled publication succeeded; and resolve failed scheduled-publication jobs. Public-answer states: [domain-model.md](domain-model.md#36-public-answer-state).

- **[Confirmed]** Scheduling uses the class/institution timezone ([Open D7](open-decisions.md) picks which).
- **[Confirmed]** Prefer **database-backed scheduling** before recommending message brokers — see [architecture-proposal.md](architecture-proposal.md#scheduling).

### 7.1 Idempotency & failure handling **[Recommended]**

- **Idempotent publication:** the publish job checks the `PublicAnswer`'s current state before acting and uses a unique job key per answer; re-running never double-publishes.
- **Scheduler-down:** on restart, the reconciliation poller finds `Scheduled` answers past their scheduled-at and publishes them late (flagged **late** in audit).
- **Failure surfacing:** a failed job leaves the answer `Scheduled` with a failure flag/reason, visible to staff, with retry/resolve actions. The MVP has no notifications ([mvp-scope.md](mvp-scope.md)), so failures surface **in-app** on the scheduled-posts view.

## 8. Public class Q&A archive **[Confirmed]**

Each class section has a **searchable, public-to-class** archive of published Q&A. It replaces the manually compiled answer documents.

Entries may be organized by: Content / Logistics / Miscellaneous; lesson/lecture/module/topic; publication date; weekly cycle; legacy vs current source.

- **[Confirmed]** Teachers choose which imported legacy/backlog questions become visible to the current class — nothing from the backlog appears automatically (see [question-backlog.md](question-backlog.md)).
- **MVP excludes:** comments, discussion threads, follow-up replies, voting/upvotes, "I also have this question," and public student identities ([mvp-scope.md](mvp-scope.md)).

## 9. Open decisions affecting this area

- [Open D6] Unpublish support (post-MVP; `Unpublished` state reserved only).
- [Open D7] Timezone for scheduling.
- [Open D8] Cross-cycle merge within a section.

See [open-decisions.md](open-decisions.md).

## 10. Related documents

[domain-model.md](domain-model.md) · [question-backlog.md](question-backlog.md) · [legacy-question-import.md](legacy-question-import.md) · [participation-rules.md](participation-rules.md) · [roles-and-permissions.md](roles-and-permissions.md) · [architecture-proposal.md](architecture-proposal.md) · [open-decisions.md](open-decisions.md)
