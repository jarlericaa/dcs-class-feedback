# MVP Scope

> **Status:** Product scope specification. The current implementation covers a
> foundation subset; see [CURRENT_STATE.md](CURRENT_STATE.md).
> These lists reproduce the owner's stated MVP / post-MVP / out-of-scope boundary. **No item is silently added or promoted.** Where an item is a recommendation rather than a confirmed requirement, it is tagged and linked to [open-decisions.md](open-decisions.md).
> See [product-requirements.md](product-requirements.md) for goals and [AGENTS.md](../AGENTS.md) for the rule that recommendations are not requirements.

> ## Scope expansion approved 2026-08-03 — [project-specs.md](project-specs.md) is the acceptance target
>
> The owner approved [project-specs.md](project-specs.md) as the authoritative product
> specification and explicitly authorized implementing every Epic A–F plus the post-pilot
> stories `P1` (legacy import) and `P2` (reactions and moderated comments). Where this
> document previously conflicted with it, **project-specs.md wins** and the lists below have
> been corrected. Promoted from post-MVP / out-of-scope into approved scope:
>
> | Item | Was | Now | Owning doc |
> |---|---|---|---|
> | Editing a submitted form until the deadline | out of scope §3 | **approved** (`B3`) | [weekly-form-workflow.md](weekly-form-workflow.md) |
> | Student-visible validity + invalidity reason | excluded (students see nothing) | **approved** (`C2`) | [participation-rules.md](participation-rules.md) |
> | Long-exam bonus periods + student progress | absent | **approved** (`C3`) | [participation-rules.md](participation-rules.md) |
> | Email notifications | post-MVP §2 | **approved** (`F1`) | [project-specs.md](project-specs.md) §6.9 |
> | Unpublishing published answers | post-MVP §2, [Open D6] | **approved** (`E2`) | [public-qa-and-source-linking.md](public-qa-and-source-linking.md) |
> | Public-answer approval + version history | absent | **approved** (`E2`) | [public-qa-and-source-linking.md](public-qa-and-source-linking.md) |
> | XLSX and PDF exports | out of scope §3 (PDF) | **approved** (`C1`, `F2`) | [participation-rules.md](participation-rules.md) |
> | Course archive + clone | absent | **approved** (`F3`) | [project-specs.md](project-specs.md) §6 |
> | Typst / XLSX legacy parsing | post-MVP §2 | **approved** (`P1`) | [legacy-question-import.md](legacy-question-import.md) |
> | Reactions, comments, moderation | out of scope §3 | **approved** (`P2`) | [project-specs.md](project-specs.md) §8 |
>
> Still **out** of scope: all AI features (`P3`), student file attachments, course-material
> management, LMS integration, native mobile apps, public access for unenrolled users,
> microservices, model fine-tuning.

## 1. MVP features (in scope)

**[Confirmed]** unless noted. The "Owning doc / acceptance note" column points to where the detailed rule and its acceptance-level definition live.

| Feature | Owning doc / acceptance note |
|--------|------------------------------|
| Google SSO restricted to authorized university accounts | [student-identity.md](student-identity.md) |
| **Exact normalized UP-email matching** against the teacher-uploaded class list | [student-identity.md](student-identity.md). Confirmed 2026-08-07; replaced name matching, roster claims, and teacher confirmation outright. |
| Courses and class sections | [domain-model.md](domain-model.md), [roles-and-permissions.md](roles-and-permissions.md) |
| CSV class-list import | [student-identity.md](student-identity.md) — validation, mapping, duplicate detection, preview, row errors, summary, safe re-import, audit. |
| Student, Teacher, TA, Platform-Admin roles | [roles-and-permissions.md](roles-and-permissions.md) |
| Configurable TA permissions (per section) | [roles-and-permissions.md](roles-and-permissions.md) |
| Recurring weekly form schedules | [weekly-form-workflow.md](weekly-form-workflow.md) |
| Weekly cycles that auto-open on schedule | [weekly-form-workflow.md](weekly-form-workflow.md) — schedule-driven, idempotent, reconciliation on scheduler downtime. |
| Reusable templates (snapshot on apply) | [weekly-form-workflow.md](weekly-form-workflow.md) |
| Common Google Forms question types | [weekly-form-workflow.md](weekly-form-workflow.md) |
| Required and optional questions | [weekly-form-workflow.md](weekly-form-workflow.md) — server-side validation required. |
| One submission per student per section per cycle | [weekly-form-workflow.md](weekly-form-workflow.md) — enforced by DB constraint. |
| Student-originated feedback & questions section (always present) | [weekly-form-workflow.md](weekly-form-workflow.md) |
| Teacher review dashboard | [public-qa-and-source-linking.md](public-qa-and-source-linking.md), [participation-rules.md](participation-rules.md) |
| Private responses | [public-qa-and-source-linking.md](public-qa-and-source-linking.md) |
| Public anonymous answers | [public-qa-and-source-linking.md](public-qa-and-source-linking.md) |
| Teacher rewording of public questions (original preserved) | [public-qa-and-source-linking.md](public-qa-and-source-linking.md) |
| Source links between submissions and public answers | [public-qa-and-source-linking.md](public-qa-and-source-linking.md) |
| Scheduled public posting (DB-backed) | [public-qa-and-source-linking.md](public-qa-and-source-linking.md), [architecture-proposal.md](architecture-proposal.md) — idempotent, failure recovery. |
| Searchable class Q&A archive | [public-qa-and-source-linking.md](public-qa-and-source-linking.md) |
| Separate course-level question backlog area | [question-backlog.md](question-backlog.md) |
| Basic legacy & backlog import (manual, CSV, copy-paste) | [legacy-question-import.md](legacy-question-import.md) |
| Legacy questions imported anonymous-by-default | [legacy-question-import.md](legacy-question-import.md) — identity preserved only on explicit choice. |
| Participation validity | [participation-rules.md](participation-rules.md) |
| Weekly participation tracking | [participation-rules.md](participation-rules.md) — derived from valid submissions. |
| Participation CSV exports (3 reports) | [participation-rules.md](participation-rules.md) |
| Student submission history | [public-qa-and-source-linking.md](public-qa-and-source-linking.md) |
| Audit history | [domain-model.md](domain-model.md#audit-events) |

### Merging submissions

**[Confirmed]** Merging similar student questions into one public answer is in MVP, with all source links preserved. Merge scope is **[Recommended]** to be within a single class section for MVP; cross-cycle merge within a section is [Open D8](open-decisions.md). See [public-qa-and-source-linking.md](public-qa-and-source-linking.md).

## 2. Post-MVP features (not in the first release)

**[Confirmed]** deferred:

- AI answer suggestions
- AI rewriting
- AI classification (category/type suggestions)
- AI duplicate detection
- AI retrieval from course materials
- External AI research
- AI fact-checking
- Teacher-style adaptation
- Student-facing participation totals
- Advanced analytics
- LMS integration
- **Course-material management** (see note below)

> **Course materials:** Mentioned in product context and future AI retrieval, but **not** an MVP implementation requirement. MVP only keeps the data model compatible (course-level ownership, category/topic tags). See [ai-future-plan.md](ai-future-plan.md) and [domain-model.md](domain-model.md).

> **Notifications, unpublishing, and legacy Typst/spreadsheet parsing** were deferred here and
> are now **approved** — see the scope-expansion table at the top of this document.

## 3. Out of scope (unless separately approved)

**[Confirmed]** excluded:

- Student file attachments
- Multiple weekly submissions by the same student in the same class/cycle
- Question voting / upvotes / "I also have this question"
- Public student identities
- Native mobile applications
- Automatic AI replies
- Automatic AI publication
- Word exports of published answers
- Public access for unenrolled users
- Individual task-assignment of submissions to staff
- Microservices
- Dedicated AI infrastructure (incl. dedicated vector DB, standalone AI service)
- Model fine-tuning

## 4. Scope-change process

**[Confirmed]** Anything in §2 or §3 requires explicit owner approval before implementation. Agents must not promote a post-MVP or out-of-scope item into MVP work on their own — see [AGENTS.md](../AGENTS.md).
