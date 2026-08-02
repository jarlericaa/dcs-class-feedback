# Product Requirements

> **Status:** Detailed product specification. The repository now contains an
> implementation foundation; current behavior is tracked in
> [CURRENT_STATE.md](CURRENT_STATE.md). Some decisions remain open.
> **Label key:** Every substantive statement is tagged **[Confirmed]** (owner-stated requirement), **[Implemented]** (evidenced by the repository), **[Recommended]** (proposed, not yet approved), **[Assumption]** (inferred, needs validation), **[Deferred]** (intentionally postponed), or **[Open]** (unresolved — see [open-decisions.md](open-decisions.md)).
> Recommendations must never be treated as approved requirements. See [AGENTS.md](../AGENTS.md).

This is the master requirements document. It states the problem, goals, and confirmed requirements at a high level, then links to the owning document for each area. Detailed rules live in the linked docs — this file avoids duplicating them.

## 1. Background

**[Confirmed]** The current workflow uses Google Forms plus manually prepared answer documents:

1. Students submit weekly feedback and questions through Google Forms.
2. Teachers review the linked spreadsheet, reading submissions one by one.
3. Teachers decide which questions to answer.
4. Teachers compile selected questions and answers into a separate document.
5. Teachers send that document to the class.

This is convenient for **collection** but inefficient for reviewing feedback, answering questions, publishing anonymized answers, tracking weekly participation, reusing templates, searching past Q&A, managing answerable-but-unanswered questions, and preserving the link between a public answer and the original student submission.

## 2. Product goal

**[Confirmed]** Build a centralized web platform where each class section has a recurring weekly feedback form. Students complete one form per class section per week. Teachers review responses, answer students privately, publish anonymized Q&A publicly to the class, track participation, reuse templates, and manage question backlogs from current and legacy sources.

## 3. Core academic structure

**[Confirmed]** The system distinguishes three levels. Full entity model in [domain-model.md](domain-model.md).

- **Course** — a reusable academic course; may have multiple class sections, shared lessons/topics, shared templates, a course-level question backlog, authorized teachers, and course materials (materials are post-MVP — see §8).
- **Class Section** — a specific offering of a course, with its own students, staff, weekly schedule, cycles, responses, participation records, private responses, and public Q&A archive.
- **Weekly Feedback Cycle** — a weekly instance of a class feedback form, created automatically from a teacher-configured recurring schedule. "Automatically generated" means schedule-driven creation, **not** AI-generated content. Details in [weekly-form-workflow.md](weekly-form-workflow.md).

## 4. User roles (summary)

**[Confirmed]** Four roles: Student, Teacher, Teaching Assistant / Co-Teacher (permissions configurable per class section), and Platform Administrator. Teachers administer only the courses and sections they manage; only selected accounts are platform administrators. Full definitions, the TA permission catalog, and the authorization model are in [roles-and-permissions.md](roles-and-permissions.md).

## 5. Confirmed requirements by area

Each bullet is confirmed by the owner; the owning document holds the detailed rules.

- **Authentication & enrollment** — Google SSO restricted to authorized university accounts; roster CSV contains only student number + full name (no email); name-based account matching with teacher confirmation. See [account-matching.md](account-matching.md).
- **Class-list import** — CSV import with validation, column mapping, duplicate detection, preview, row-level errors, summary, safe re-import, audit logging; never silently overwrite enrollment. See [account-matching.md](account-matching.md).
- **Weekly forms** — one completed form per student per section per cycle; teacher-created questions plus an always-present student-originated section; no edits after submit; no late submission. See [weekly-form-workflow.md](weekly-form-workflow.md).
- **Question types & templates** — common Google Forms question types; required/optional; reusable templates that snapshot on apply. See [weekly-form-workflow.md](weekly-form-workflow.md).
- **Review, private & public responses** — teacher review dashboard; private responses; anonymous public answers; rewording (original never destroyed); merge; scheduled publication; source links. See [public-qa-and-source-linking.md](public-qa-and-source-linking.md).
- **Course-level backlog** — separate from the weekly dashboard; explicit per-section publish. See [question-backlog.md](question-backlog.md).
- **Legacy import** — historical questions imported anonymous-by-default; never count toward participation. See [legacy-question-import.md](legacy-question-import.md).
- **Participation** — derived from valid submissions; teacher invalidation (audited); students do not see validity in MVP; CSV exports. See [participation-rules.md](participation-rules.md).
- **Audit history** — actor, action, timestamp, affected entity, before/after values for all important actions. See [domain-model.md](domain-model.md#audit-events).
- **AI** — strictly post-MVP; human approval mandatory; no student identity to AI services. See [ai-future-plan.md](ai-future-plan.md).

## 6. Assumptions register

**[Assumption]** items that shape design but are not owner-confirmed. Validate before relying on them; several are also listed as open decisions.

| # | Assumption | Impact if wrong |
|---|-----------|-----------------|
| A1 | A student may be enrolled in multiple sections (even of the same course); participation is tracked per section. | Enrollment key and participation scope change. |
| A2 | The student number, once a match is confirmed, is the permanent internal identity; later display-name changes never unlink it. | Identity model changes. |
| A3 | Institution operates in a single timezone for MVP. | Scheduling correctness. (See [Open D7](open-decisions.md).) |
| A4 | Platform administrators grant the Teacher role; teachers then self-serve courses/sections. | Onboarding flow. (See [Open D3](open-decisions.md).) |
| A5 | Students authenticate but see only sections where a confirmed match/enrollment exists. | Access control. |

## 7. Security & privacy risk register

These are the priority risks. Mitigations are detailed in the linked docs; they are summarized here so they are visible in one place.

| # | Risk | Severity | Summary of mitigation | Owning doc |
|---|------|----------|----------------------|-----------|
| R1 | **Name-match impersonation** — any university account whose Google display name matches a roster name could claim that student's identity; display names are user-editable. | **High** | Matching produces candidates only; no silent verification under uncertainty; **teacher-confirm-all** recommended for MVP; auto-confirm and join-code are open decisions. | [account-matching.md](account-matching.md) |
| R2 | **Small-class anonymity failure** — a single asker, or a highly specific/personal question, can remain identifiable after "anonymization." | **High** | Rewording must strip identifying context; publish UI warns teacher before publishing highly specific/personal questions; merged wording must not imply a single asker unless safe and intentional. | [public-qa-and-source-linking.md](public-qa-and-source-linking.md) |
| R3 | **Anonymity leak via merge/rewording** — a public entry reveals or implies a source student. | **High** | Public text carries no source identity; every source link is internal-only; merge invariants enforced. | [public-qa-and-source-linking.md](public-qa-and-source-linking.md) |
| R4 | **Identity-bearing exports** — CSV exports contain student numbers/names. | Medium | Only authorized staff access identity-bearing exports; access audited. | [participation-rules.md](participation-rules.md) |
| R5 | **Cross-tenant access** — a teacher reaching courses/sections/students they do not manage. | High | Resource-scoped, deny-by-default authorization; no automatic access to unrelated resources. | [roles-and-permissions.md](roles-and-permissions.md) |
| R6 | **Student sees internal state** — validity, no-response decisions, drafts, notes, audit. | Medium | Student-visible projections are explicitly defined; internal state never exposed. | [domain-model.md](domain-model.md), [public-qa-and-source-linking.md](public-qa-and-source-linking.md) |
| R7 | **Legacy identity leak** — imported historical data still contains student identifiers. | Medium | Anonymous-by-default import; identity preserved only on explicit teacher choice. | [legacy-question-import.md](legacy-question-import.md) |
| R8 | **Student PII sent to AI services** (future). | High | Names/numbers/identities never sent to AI; enforced at the AI boundary. | [ai-future-plan.md](ai-future-plan.md) |

## 8. Explicit non-goals (MVP)

**[Confirmed]** Out of scope unless separately approved: student file attachments; editing a submitted form; multiple submissions per student per section per cycle; student comments; discussion threads; question voting; native mobile apps; automatic AI replies; automatic AI publication; PDF/Word exports of published answers; public access for unenrolled users; individual staff task-assignment of submissions; microservices; dedicated AI infrastructure; model fine-tuning. Course-material **management** is post-MVP (the model stays compatible with future materials). Unpublishing is **not** an MVP feature. Full boundary in [mvp-scope.md](mvp-scope.md).

## 9. Related documents

[mvp-scope.md](mvp-scope.md) · [domain-model.md](domain-model.md) · [roles-and-permissions.md](roles-and-permissions.md) · [weekly-form-workflow.md](weekly-form-workflow.md) · [participation-rules.md](participation-rules.md) · [account-matching.md](account-matching.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [question-backlog.md](question-backlog.md) · [legacy-question-import.md](legacy-question-import.md) · [ai-future-plan.md](ai-future-plan.md) · [open-decisions.md](open-decisions.md) · [architecture-proposal.md](architecture-proposal.md)
