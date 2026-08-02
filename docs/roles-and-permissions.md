# Roles & Permissions

> **Status:** Authorization specification with an implemented foundation.
> This document **owns** the role definitions, the authorization model, and the TA permission catalog. Entity references are defined in [domain-model.md](domain-model.md).
> Label key as in [product-requirements.md](product-requirements.md).

## 1. Authorization model (recommended)

**[Recommended]** Role- **and** resource-based authorization, **deny-by-default**. A permission check answers: *does this User hold the required capability on this specific resource (course/section/entity)?* — never a global role check alone.

- **[Confirmed]** Teachers administer only the courses and sections they manage. A teacher must **not** automatically gain access to unrelated courses, sections, students, or submissions (Risk R5).
- **[Recommended]** Every resource-scoped action resolves the actor's membership (`CourseStaff` / `SectionStaff`) and permission flags for *that* resource before proceeding. No ambient authority.
- **[Recommended]** Platform-admin capability is separate from teaching capability; being a platform admin does not implicitly grant course/section content access, and vice versa.

Enforcement layers are described in [architecture-proposal.md](architecture-proposal.md#authorization).

## 2. Roles

### 2.1 Student **[Confirmed]**

**May:** sign in with an authorized university Google account; access verified sections; complete the weekly form for each class taken; answer teacher-created questions; submit their own question/feedback/concern/clarification/suggestion; submit one completed form per section per cycle; view previous submissions; view private teacher responses to them; view whether their own question was publicly answered; view the reworded public version of their own question; search the class's published anonymous Q&A archive.

**May not:** see another student's identity; edit a submitted form; submit after the deadline; see internal validity decisions; see internal no-response decisions; see teacher drafts; see private staff notes; see staff audit records; see weekly participation totals (MVP); vote or comment on public answers; attach files (MVP).

Student-visible state projections are defined in [domain-model.md](domain-model.md#3-state-models) and [public-qa-and-source-linking.md](public-qa-and-source-linking.md).

### 2.2 Teacher **[Confirmed]**

A teacher is the administrator of the courses/sections they own or are assigned to. They **may:** create/manage courses and sections; import class lists; confirm student-account matches; correct mappings; assign teaching staff; configure TA permissions; create recurring schedules; create/manage templates; author form questions; configure required/optional questions; review responses; view student identities; correct submission types/categories; mark responses valid/invalid; send private responses; draft public answers; reword public question text; publish immediately; schedule publication; merge similar questions; import/record legacy questions; manage the course-level backlog; choose which backlog questions become visible to a section; export participation records; manage course materials (post-MVP capability); view audit history.

> Note: "manage course materials" is listed by the owner under teacher capabilities, but course-material **management** is a post-MVP feature — see [mvp-scope.md](mvp-scope.md). The capability is reserved, not built in MVP.

### 2.3 Teaching Assistant / Co-Teacher **[Confirmed]**

TA permissions are **configurable per class section**, controlled by the class owner. The permission catalog (each independently grantable):

| Permission flag | Grants |
|-----------------|--------|
| `view_student_identities` | See student identities on responses |
| `review_responses` | Review form responses |
| `send_private_responses` | Send private replies |
| `draft_public_answers` | Draft public answers |
| `reword_public_questions` | Edit public question wording |
| `publish_public_answers` | Publish immediately |
| `schedule_publication` | Schedule publication |
| `mark_validity` | Mark responses valid/invalid |
| `export_participation` | Export participation CSVs (identity-bearing — see R4) |
| `manage_weekly_cycles` | Manage cycles/recurrence |
| `manage_templates` | Manage templates |
| `manage_backlog_imports` | Manage imported question backlogs |
| `manage_course_materials` | Manage course materials (post-MVP) |

- **[Recommended]** Flags are independent; the class owner grants each explicitly. A TA without `view_student_identities` reviews content with identities masked.
- **[Recommended]** Some capabilities imply an identity exposure (e.g. `export_participation` produces identity-bearing files); granting them should surface that implication to the owner.

### 2.4 Platform Administrator **[Confirmed]**

Only selected accounts. **May manage:** platform-wide settings; user-access issues; account troubleshooting; system troubleshooting; platform-level audit access. Platform admins do not automatically gain teaching content access to arbitrary courses/sections.

## 3. Permission → action matrix (summary)

`Y` = yes, `C` = configurable per section (TA), `—` = no. Teacher column assumes ownership/assignment on the resource.

| Action | Student | Teacher | TA (per section) | Platform Admin |
|--------|:------:|:------:|:----------------:|:--------------:|
| Complete weekly form | Y | — | — | — |
| View own submission history | Y | — | — | — |
| Search public Q&A archive | Y | Y | Y | — |
| Create/manage course | — | Y | — | — |
| Create/manage section | — | Y | — | — |
| Import class list | — | Y | C (`manage_backlog_imports` is separate) | — |
| Confirm/correct account match | — | Y | C (`view_student_identities`) | assist |
| Assign staff / set TA permissions | — | Y (owner) | — | — |
| Configure recurrence/cycles | — | Y | C (`manage_weekly_cycles`) | — |
| Manage templates | — | Y | C (`manage_templates`) | — |
| View student identities | — | Y | C (`view_student_identities`) | assist |
| Review responses | — | Y | C (`review_responses`) | — |
| Mark validity | — | Y | C (`mark_validity`) | — |
| Send private response | — | Y | C (`send_private_responses`) | — |
| Draft/reword public answer | — | Y | C (`draft_public_answers` / `reword_public_questions`) | — |
| Publish / schedule | — | Y | C (`publish_public_answers` / `schedule_publication`) | — |
| Merge questions | — | Y | C (`draft_public_answers`) | — |
| Manage backlog / legacy import | — | Y | C (`manage_backlog_imports`) | — |
| Export participation | — | Y | C (`export_participation`) | — |
| View audit history | — | Y (own resources) | C | Y (platform-level) |
| Platform settings/troubleshooting | — | — | — | Y |

## 4. Student-visibility guarantees (cross-reference)

Students never see: another student's identity, validity/invalidation, no-response/undecided decisions, drafts, private staff notes, audit records, participation totals (MVP). Full projections: [domain-model.md](domain-model.md#3-state-models), [public-qa-and-source-linking.md](public-qa-and-source-linking.md). This backs Risk R6.

## 5. Open decisions affecting roles

- **[Open D3]** Who grants the Teacher role (recommend: platform admin grants; teachers self-serve thereafter). See [open-decisions.md](open-decisions.md).
- **[Open D10]** Access for a deactivated (dropped) student — read-only history vs no access.

## 6. Related documents

[domain-model.md](domain-model.md) · [account-matching.md](account-matching.md) · [participation-rules.md](participation-rules.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [architecture-proposal.md](architecture-proposal.md) · [open-decisions.md](open-decisions.md)
