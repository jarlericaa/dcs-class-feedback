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

**May also:** save a draft and edit their own submission until the deadline; add several separately
tracked questions plus a distinct general comment; see whether their **own** submission is valid
and the student-visible reason when it is not; track their own bonus progress per long-exam
period; send a private follow-up on their own question; react to and comment on published
entries (comments require staff approval before anyone else sees them).

**May not:** see another student's identity; submit or edit after the deadline; see the validity
of anyone else's submission; see that a submission was *flagged*; see the internal invalidation
reason enum or staff notes; see internal no-response / `Will Not Answer` decisions; see teacher
drafts, drafts awaiting approval, rejected drafts, scheduled answers, or unpublished entries; see
source links; see another commenter's identity; see staff audit records; attach files.

Student-visible state projections are defined in [domain-model.md](domain-model.md#3-state-models) and [public-qa-and-source-linking.md](public-qa-and-source-linking.md).

### 2.2 Teacher **[Confirmed]**

A teacher is the administrator of the courses/sections they own or are assigned to. They **may:** create/manage courses and sections; import class lists (the imported UP email is what gives each student access); assign teaching staff; configure TA permissions; create recurring schedules; create/manage templates; author form questions; configure required/optional questions; review responses; view student identities; correct submission types/categories; mark responses valid/invalid; send private responses; draft public answers; reword public question text; publish immediately; schedule publication; merge similar questions; import/record legacy questions; manage the course-level backlog; choose which backlog questions become visible to a section; export participation records; manage course materials (post-MVP capability); view audit history.

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
| `flag_validity` | **Flag** a submission as potentially invalid, with a required reason |
| `mark_validity` | Participate in validity decisions — see the non-delegable note below |
| `export_participation` | Export the three participation CSVs (identity-bearing — see R4) |
| `manage_weekly_cycles` | Manage cycles/recurrence, including per-occurrence overrides |
| `manage_templates` | Manage templates |
| `manage_backlog_imports` | Manage imported question backlogs and recommend backlog changes |
| `moderate_discussion` | Approve/reject/remove comments and lock a discussion |
| `manage_course_materials` | Manage course materials (post-MVP) |

- **[Recommended]** Flags are independent; the class owner grants each explicitly. A TA without `view_student_identities` reviews content with identities masked — masked in the **data** the service returns, not merely hidden in the UI.
- **[Recommended]** Some capabilities imply an identity exposure (e.g. `export_participation` produces identity-bearing files); granting them should surface that implication to the owner.

#### Capabilities that are NOT delegable to a Student Assistant

A permission flag is necessary but not sufficient for these. Each additionally requires a non-TA
section role (`teacher`/`co_teacher`) or course staff — collectively "**Instructor**". A TA who
holds the flag is still refused:

| Action | Why non-delegable | Spec |
|---|---|---|
| Finalize invalidation (`confirm_flag`, `invalidate`, `reject_flag`, `restore`) | A TA may only *flag* | §4.2, §6.5 |
| Approve/publish a TA-authored public draft | Instructor approval is the whole point of the gate | §6.8 |
| Unpublish or restore a published entry | Retracts what the class already saw | §10 |
| Confirm a backlog addition or removal | TAs *recommend*; Instructors confirm | §6.6, §7 D3 |
| Create/edit bonus periods | Grading policy | §6.5 |
| Include identities in a PDF summary | Identity exposure | §6.4 |
| Bonus-record, XLSX, PDF, and backlog-status exports | Identity/grade bearing | §6.10, §11 |
| Flip legacy-import identity preservation | Privacy decision | §8 P1 |
| View section audit history | Already non-delegable in the implementation | — |

> **Known deviation from `project-specs.md` §11 (decision D17).** The specification says export
> endpoints are Instructor-only. The **three pre-existing** participation CSVs
> (weekly matrix, participant list, detailed responses) continue to honour the
> `export_participation` TA flag, because removing a capability already granted to real TAs was
> judged worse than the deviation. Every export added after 2026-08-03 is Instructor-only.
> Recorded in [open-decisions.md](open-decisions.md) D17.

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
| Read the class list and its UP-email link status | — | Y | C (`view_student_identities`) | assist |
| Assign staff / set TA permissions | — | Y (owner) | — | — |
| Configure recurrence/cycles | — | Y | C (`manage_weekly_cycles`) | — |
| Manage templates | — | Y | C (`manage_templates`) | — |
| View student identities | — | Y | C (`view_student_identities`) | assist |
| Review responses | — | Y | C (`review_responses`) | — |
| Flag a submission as potentially invalid | — | Y | C (`flag_validity`) | — |
| Finalize invalidity (confirm/reject/invalidate/restore) | — | Y | **—** (non-delegable) | — |
| Send private response | — | Y | C (`send_private_responses`) | — |
| Send a private follow-up on one's own question | Y | — | — | — |
| Draft/reword public answer | — | Y | C (`draft_public_answers` / `reword_public_questions`) | — |
| Publish / schedule own draft | — | Y | C (`publish_public_answers` / `schedule_publication`) | — |
| Approve/publish a TA-authored draft | — | Y | **—** (non-delegable) | — |
| Edit a published entry (creates a revision) | — | Y | C (`publish_public_answers`) | — |
| Unpublish / restore a published entry | — | Y | **—** (non-delegable) | — |
| Merge / unmerge questions | — | Y | C (`draft_public_answers`) | — |
| Manage backlog / legacy import | — | Y | C (`manage_backlog_imports`) | — |
| Recommend a backlog addition/removal | — | Y | C (`manage_backlog_imports`) | — |
| Confirm a backlog addition/removal | — | Y | **—** (non-delegable) | — |
| Create/edit bonus periods | — | Y | **—** (non-delegable) | — |
| Response Analysis (identity-masked without the flag) | — | Y | C (`review_responses`) | — |
| Export the three participation CSVs | — | Y | C (`export_participation`) | — |
| Bonus / XLSX / PDF / backlog-status exports | — | Y | **—** (non-delegable) | — |
| Moderate comments, lock a discussion | — | Y | C (`moderate_discussion`) | — |
| React / comment on a published entry | Y | Y | Y | — |
| Archive / restore / clone a course | — | Y | **—** (non-delegable) | — |
| View audit history | — | Y (own resources) | C | Y (platform-level) |
| Platform settings/troubleshooting | — | — | — | Y |

## 4. Student-visibility guarantees (cross-reference)

Students never see: another student's identity, **anyone else's** validity, the existence of a
flag, the internal invalidation reason or staff note, no-response/`Will Not Answer`/undecided
decisions, drafts or drafts awaiting approval, rejected drafts, scheduled answers, unpublished
entries, source links, staff-only revision metadata (editor, revision count, prior text), another
commenter's identity, or audit records.

Students **do** see: their own submission's validity and its student-visible reason, their own
bonus progress, their own private thread, and the published wording linked to their own question.

Full projections: [domain-model.md](domain-model.md#3-state-models),
[public-qa-and-source-linking.md](public-qa-and-source-linking.md),
[participation-rules.md](participation-rules.md). This backs Risk R6.

## 5. Archived courses

An archived course is **read-only**. The check lives inside the authorization helpers with an
inverted default: every `require*` helper rejects a write on an archived course unless the caller
explicitly opts in with `allowArchived`. Only reads, exports, restore, and clone-from opt in, so a
future mutation that forgets to think about archiving is refused rather than silently allowed.
Hiding a button is never the enforcement mechanism.

## 6. Decisions affecting roles

- **[Open D3]** Who grants the Teacher role (recommend: platform admin grants; teachers self-serve thereafter). See [open-decisions.md](open-decisions.md).
- **D10 — closed:** a dropped student's enrollment is deactivated; their own history stays readable.
- **D17 — closed:** export authorization, including the documented deviation above.

## 6. Related documents

[domain-model.md](domain-model.md) · [student-identity.md](student-identity.md) · [participation-rules.md](participation-rules.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [architecture-proposal.md](architecture-proposal.md) · [open-decisions.md](open-decisions.md)
