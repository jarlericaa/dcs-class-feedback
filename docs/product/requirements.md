# Product Requirements

> **Status:** Detailed product specification. The repository now contains an
> implementation foundation; current behavior is tracked in
> [engineering/current-state.md](../engineering/current-state.md). Some decisions remain open.
> **Label key:** Every substantive statement is tagged **[Confirmed]** (owner-stated requirement), **[Implemented]** (evidenced by the repository), **[Recommended]** (proposed, not yet approved), **[Assumption]** (inferred, needs validation), **[Deferred]** (intentionally postponed), or **[Open]** (unresolved — see [decisions/open-decisions.md](../decisions/open-decisions.md)).
> Recommendations must never be treated as approved requirements. See [AGENTS.md](../../AGENTS.md).

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

**[Confirmed]** The system distinguishes three levels. Full entity model in [domain/domain-model.md](../domain/domain-model.md).

- **Course** — a reusable academic course; may have multiple class sections, shared lessons/topics, shared templates, a course-level question backlog, authorized teachers, and course materials (materials are post-MVP — see §8).
- **Class Section** — a specific offering of a course, with its own students, staff, weekly schedule, cycles, responses, participation records, private responses, and public Q&A archive.
- **Weekly Feedback Cycle** — a weekly instance of a class feedback form, created automatically from a teacher-configured recurring schedule. "Automatically generated" means schedule-driven creation, **not** AI-generated content. Details in [domain/form-workflow.md](../domain/form-workflow.md).

## 4. User roles (summary)

**[Confirmed]** Four roles: Student, Teacher, Teaching Assistant / Co-Teacher, and Platform Administrator. Teachers administer only the courses and sections they manage; only selected accounts are platform administrators.

**[Confirmed]** The two halves of that third role are not the same thing, and only one of them is configurable:

- a **co-teacher / co-instructor** holds **every** capability on what they are assigned to — `product/specification.md` §4.1: "all instructors assigned to a course have equal permissions", and story A2: "add equal-permission co-instructors";
- a **Student Assistant** holds an owner-configured subset, and that subset is **per class section** — there is no course-wide Student Assistant.

**[Confirmed]** Staff standing comes from one of two scopes: course-wide (every section of the course, including sections added later) or one named class section. Only the course owner grants either. Full definitions, the two-tier model, the TA permission catalog, and the authorization model are in [domain/roles-and-permissions.md §2](../domain/roles-and-permissions.md) — which owns them — and the scope decision is [ADR-0004](../decisions/ADR-0004-course-wide-staff-standing.md).

## 5. Confirmed requirements by area

Each bullet is confirmed by the owner; the owning document holds the detailed rules.

- **Authentication & enrollment** — Google SSO restricted to authorized university accounts; the class list carries student number, full name, and **UP email**; a signed-in account becomes a student by exact normalized email match against that list, with no claiming and no manual confirmation. See [domain/student-identity.md](../domain/student-identity.md).
- **Class-list import** — CSV import with validation, column mapping, duplicate detection, preview, row-level errors, summary, safe re-import, audit logging; never silently overwrite enrollment. See [domain/student-identity.md](../domain/student-identity.md).
- **Weekly forms** — one completed form per student per section per cycle; teacher-created questions plus an always-present student-originated section; a student may save a draft, submit, and keep editing **that same response until the deadline**, at which point the latest version locks; no late submission and no late edit, and an edit never mints a second credit. See [domain/form-workflow.md](../domain/form-workflow.md).
- **Question types & templates** — common Google Forms question types; required/optional; reusable templates that snapshot on apply. See [domain/form-workflow.md](../domain/form-workflow.md).
- **Review, private & public responses** — teacher review dashboard; private responses; anonymous public answers; rewording (original never destroyed); merge; scheduled publication; source links. See [domain/public-qa.md](../domain/public-qa.md).
- **Course-level backlog** — separate from the weekly dashboard; explicit per-section publish. See [domain/question-backlog.md](../domain/question-backlog.md).
- **Legacy import** — historical questions imported anonymous-by-default; never count toward participation. See [domain/legacy-question-import.md](../domain/legacy-question-import.md).
- **Participation** — derived from valid submissions; teacher invalidation (audited); students do not see validity in MVP; CSV exports. See [domain/participation.md](../domain/participation.md).
- **Audit history** — actor, action, timestamp, affected entity, before/after values for all important actions. See [domain/domain-model.md](../domain/domain-model.md#audit-events).
- **AI** — strictly post-MVP; human approval mandatory; no student identity to AI services. See [product/ai-future-plan.md](ai-future-plan.md).

## 6. Assumptions register

**[Assumption]** items that shape design but are not owner-confirmed. Validate before relying on them; several are also listed as open decisions.

| # | Assumption | Impact if wrong |
|---|-----------|-----------------|
| A1 | A student may be enrolled in multiple sections (even of the same course); participation is tracked per section. | Enrollment key and participation scope change. |
| A2 | The student number is the permanent internal identity; later display-name changes never unlink it. Access, however, is granted by the **normalized UP email** on the class list, not by the number — there is no match to confirm (decision **D23**). | Identity model changes. |
| A3 | Institution operates in a single timezone for MVP. | Scheduling correctness. The *model* is settled — **D7** closed 2026-08-03 on one institution timezone, per-section overrides deferred — but the configured value needs confirming before production if the institution is not on `Asia/Manila` ([decisions/open-decisions.md](../decisions/open-decisions.md)). |
| A4 | Platform administrators grant the Teacher role; teachers then self-serve courses/sections. | Onboarding flow. (See [Open D3](../decisions/open-decisions.md).) |
| A5 | Students authenticate but see only sections where their **normalized UP email equals a class-list `roster_email`** *and* that record holds an **active enrollment**. No confirmation step exists (decision **D23**; [domain/student-identity.md](../domain/student-identity.md)). | Access control. |

## 7. Security & privacy risk register

These are the priority risks. Mitigations are detailed in the linked docs; they are summarized here so they are visible in one place.

| # | Risk | Severity | Summary of mitigation | Owning doc |
|---|------|----------|----------------------|-----------|
| R1 | **Mis-imported UP email** — a wrong address in an uploaded class list gives that account the wrong student's classes, history, and private replies. Name-match impersonation, the original form of this risk, was **eliminated** on 2026-08-07: display names are no longer used for identity at all. | **High** | The email is the only key, normalized and unique (DB constraint). Rows with a missing, malformed, off-domain, duplicated, or already-owned address are refused, not guessed. A section's import cannot rewrite the address of a student enrolled only elsewhere. Every linkage change is audited with before/after. | [domain/student-identity.md](../domain/student-identity.md) |
| R2 | **Small-class anonymity failure** — a single asker, or a highly specific/personal question, can remain identifiable after "anonymization." | **High** | Rewording must strip identifying context; publish UI warns teacher before publishing highly specific/personal questions; merged wording must not imply a single asker unless safe and intentional. | [domain/public-qa.md](../domain/public-qa.md) |
| R3 | **Anonymity leak via merge/rewording** — a public entry reveals or implies a source student. | **High** | Public text carries no source identity; every source link is internal-only; merge invariants enforced. | [domain/public-qa.md](../domain/public-qa.md) |
| R4 | **Identity-bearing exports** — CSV exports contain student numbers/names. | Medium | Only authorized staff access identity-bearing exports; access audited. | [domain/participation.md](../domain/participation.md) |
| R5 | **Cross-tenant access** — a teacher reaching courses/sections/students they do not manage. | High | Resource-scoped, deny-by-default authorization; no automatic access to unrelated resources. | [domain/roles-and-permissions.md](../domain/roles-and-permissions.md) |
| R6 | **Student sees internal state** — validity, no-response decisions, drafts, notes, audit. | Medium | Student-visible projections are explicitly defined; internal state never exposed. | [domain/domain-model.md](../domain/domain-model.md), [domain/public-qa.md](../domain/public-qa.md) |
| R7 | **Legacy identity leak** — imported historical data still contains student identifiers. | Medium | Anonymous-by-default import; identity preserved only on explicit teacher choice. | [domain/legacy-question-import.md](../domain/legacy-question-import.md) |
| R8 | **Student PII sent to AI services** (future). | High | Names/numbers/identities never sent to AI; enforced at the AI boundary. | [product/ai-future-plan.md](ai-future-plan.md) |

## 8. Explicit non-goals (MVP)

**[Confirmed]** Out of scope unless separately approved: student file attachments; editing a submitted form **after its deadline** (it stays editable until then — B4); multiple submissions per student per section per cycle; **unmoderated** student comments and open discussion threads; question voting; native mobile apps; automatic AI replies; automatic AI publication; **Word** exports of published answers; public access for unenrolled users; individual staff task-assignment of submissions; microservices; dedicated AI infrastructure; model fine-tuning. Course-material **management** is post-MVP (the model stays compatible with future materials). Unpublishing is **no longer out of scope**: decision **D6** closed 2026-08-03 approving it — Instructor-only, reason required, audited, reversible by restore, and removing the entry from the class archive *and* the linked asker's history (**D16**). It is approved but **not yet built** ([engineering/current-state.md](../engineering/current-state.md) E2 is `schema only`); the rules are owned by [domain/public-qa.md §8A](../domain/public-qa.md). **Reactions and staff-moderated comments on published answers are likewise no longer out of scope**: `P2` was approved by [specification.md](specification.md) §8 and recorded in the scope-expansion table in [scope.md](scope.md). They are **not built** — [engineering/current-state.md](../engineering/current-state.md) `P2` is `schema only`, and a comment requires staff approval before anyone else sees it. What stays excluded is *unmoderated* commenting and open threads. **PDF exports are also no longer out of scope**: XLSX and PDF exports were approved (`C1`, `F2`) in the scope-expansion table in [scope.md](scope.md), owned by [domain/participation.md](../domain/participation.md). They are **not built** — [engineering/current-state.md](../engineering/current-state.md) has `C1` as `missing` and `F2` as `partial` (three identity-bearing CSVs; XLSX/PDF/bonus/backlog-status not built). **Word** exports remain excluded. Full boundary in [scope.md](scope.md).

## 9. Related documents

[scope.md](scope.md) · [domain/domain-model.md](../domain/domain-model.md) · [domain/roles-and-permissions.md](../domain/roles-and-permissions.md) · [domain/form-workflow.md](../domain/form-workflow.md) · [domain/participation.md](../domain/participation.md) · [domain/student-identity.md](../domain/student-identity.md) · [domain/public-qa.md](../domain/public-qa.md) · [domain/question-backlog.md](../domain/question-backlog.md) · [domain/legacy-question-import.md](../domain/legacy-question-import.md) · [product/ai-future-plan.md](ai-future-plan.md) · [decisions/open-decisions.md](../decisions/open-decisions.md) · [engineering/architecture-history.md](../engineering/architecture-history.md)
