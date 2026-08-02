# MVP Scope

> **Status:** Product scope specification. The current implementation covers a
> foundation subset; see [CURRENT_STATE.md](CURRENT_STATE.md).
> These lists reproduce the owner's stated MVP / post-MVP / out-of-scope boundary. **No item is silently added or promoted.** Where an item is a recommendation rather than a confirmed requirement, it is tagged and linked to [open-decisions.md](open-decisions.md).
> See [product-requirements.md](product-requirements.md) for goals and [AGENTS.md](../AGENTS.md) for the rule that recommendations are not requirements.

## 1. MVP features (in scope)

**[Confirmed]** unless noted. The "Owning doc / acceptance note" column points to where the detailed rule and its acceptance-level definition live.

| Feature | Owning doc / acceptance note |
|--------|------------------------------|
| Google SSO restricted to authorized university accounts | [account-matching.md](account-matching.md) |
| Name-based account matching **with teacher confirmation** | [account-matching.md](account-matching.md). MVP policy recommendation: teacher-confirm-all (auto-confirm is [Open D2](open-decisions.md)). |
| Courses and class sections | [domain-model.md](domain-model.md), [roles-and-permissions.md](roles-and-permissions.md) |
| CSV class-list import | [account-matching.md](account-matching.md) — validation, mapping, duplicate detection, preview, row errors, summary, safe re-import, audit. |
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

- Notifications
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
- Advanced legacy-file parsing
- Automated Typst parsing
- Automated old-spreadsheet parsing
- **Course-material management** (see note below)
- **Unpublishing** published answers (see note below)

> **Course materials:** Mentioned in product context and future AI retrieval, but **not** an MVP implementation requirement. MVP only keeps the data model compatible (course-level ownership, category/topic tags). See [ai-future-plan.md](ai-future-plan.md) and [domain-model.md](domain-model.md).

> **Unpublish:** The owner's spec says "Unpublished, if later supported." MVP promises nothing about unpublishing. An `Unpublished` state is documented only as a *possible future state* in the public-answer state model; whether/when to support it is [Open D6](open-decisions.md).

## 3. Out of scope (unless separately approved)

**[Confirmed]** excluded:

- Student file attachments
- Editing a submitted weekly form
- Multiple weekly submissions by the same student in the same class/cycle
- Student comments
- Discussion threads
- Follow-up replies on public answers
- Question voting / upvotes / "I also have this question"
- Public student identities
- Native mobile applications
- Automatic AI replies
- Automatic AI publication
- PDF or Word exports of published answers
- Public access for unenrolled users
- Individual task-assignment of submissions to staff
- Microservices
- Dedicated AI infrastructure (incl. dedicated vector DB, standalone AI service)
- Model fine-tuning

## 4. Scope-change process

**[Confirmed]** Anything in §2 or §3 requires explicit owner approval before implementation. Agents must not promote a post-MVP or out-of-scope item into MVP work on their own — see [AGENTS.md](../AGENTS.md).
