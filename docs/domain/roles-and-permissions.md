# Roles & Permissions

> **Status:** Authorization specification with an implemented foundation.
> This document **owns** the role definitions, the authorization model, and the TA permission catalog. Entity references are defined in [domain/domain-model.md](domain-model.md).
> Label key as in [product/requirements.md](../product/requirements.md).

## 1. Authorization model (recommended)

**[Recommended]** Role- **and** resource-based authorization, **deny-by-default**. A permission check answers: *does this User hold the required capability on this specific resource (course/section/entity)?* — never a global role check alone.

- **[Confirmed]** Teachers administer only the courses and sections they manage. A teacher must **not** automatically gain access to unrelated courses, sections, students, or submissions (Risk R5).
- **[Confirmed]** Staff standing comes from one of **two tiers** — the course, or one section. Which tier someone holds decides what they can reach and whether permission flags apply at all. See [§2.5](#25-where-staff-standing-comes-from-two-tiers).
- **[Recommended]** Every resource-scoped action resolves the actor's membership (`CourseStaff` / `SectionStaff`) and permission flags for *that* resource before proceeding. No ambient authority.
- **[Recommended]** Platform-admin capability is separate from teaching capability; being a platform admin does not implicitly grant course/section content access, and vice versa.

Enforcement layers are described in [engineering/architecture-history.md](../engineering/architecture-history.md#authorization).

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

Student-visible state projections are defined in [domain/domain-model.md](domain-model.md#3-state-models) and [public-qa.md](public-qa.md).

### 2.2 Teacher **[Confirmed]**

A teacher is the administrator of the courses/sections they own or are assigned to. They **may:** create/manage courses and sections; import class lists (the imported UP email is what gives each student access); assign teaching staff; configure TA permissions; create recurring schedules; create/manage templates; author form questions; configure required/optional questions; review responses; view student identities; correct submission types/categories; mark responses valid/invalid; send private responses; draft public answers; reword public question text; publish immediately; schedule publication; merge similar questions; import/record legacy questions; manage the course-level backlog; choose which backlog questions become visible to a section; export participation records; manage course materials (post-MVP capability); view audit history.

> Note: "manage course materials" is listed by the owner under teacher capabilities, but course-material **management** is a post-MVP feature — see [product/scope.md](../product/scope.md). The capability is reserved, not built in MVP.

### 2.3 Teaching Assistant / Co-Teacher **[Confirmed]**

**The two halves of this heading are not the same role, and only one is configurable.** A **co-teacher** holds *every* capability on whatever they are assigned to — `product/specification.md` §4.1 ("all instructors assigned to a course have equal permissions") and story A2 ("equal-permission co-instructors"). Nothing below narrows a co-teacher; their stored flags are all granted, matching their effective access. Everything below is about the **Student Assistant**.

Student Assistant permissions are **configurable per class section**, controlled by the class owner. The permission catalog is **fourteen independently grantable flags**, each a boolean column on `section_staff`, plus one capability the owner named that is reserved and not implemented:

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
| `export_participation` | Export the three **pre-existing** participation CSVs (identity-bearing — see R4). Does **not** reach the exports added after D17 — see the non-delegable table |
| `manage_weekly_cycles` | Manage cycles/recurrence, including per-occurrence overrides |
| `manage_templates` | Manage templates |
| `manage_backlog_imports` | Manage imported question backlogs and recommend backlog changes |
| `moderate_discussion` | Approve/reject/remove comments and lock a discussion |
| ~~`manage_course_materials`~~ | **Reserved, not implemented.** Course-material management is post-MVP, so this flag has **no column** on `section_staff` and is **not** one of the fourteen. It is listed here only because the owner named the capability; it becomes grantable by migration if and when the feature is approved. |

- **[Confirmed]** This catalog exists only at **section** scope. There is no course-wide Student Assistant, and no flag on course-wide standing — see [§2.5](#25-where-staff-standing-comes-from-two-tiers).
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
| Every export added after 2026-08-03: the filtered-week CSV, the responder list (CSV and XLSX), bonus records, PDF summaries, backlog status | Identity/grade bearing | §6.10, §11 |
| Flip legacy-import identity preservation | Privacy decision | §8 P1 |
| View section audit history | Already non-delegable in the implementation | — |

> **Known deviation from `product/specification.md` §11 (decision D17).** The specification says export
> endpoints are Instructor-only. The **three pre-existing** participation CSVs
> (weekly matrix, participant list, detailed responses) continue to honour the
> `export_participation` TA flag, because removing a capability already granted to real TAs was
> judged worse than the deviation. Every export added after 2026-08-03 is Instructor-only.
> Recorded in [decisions/open-decisions.md](../decisions/open-decisions.md) D17.

### 2.4 Platform Administrator **[Confirmed]**

Only selected accounts. **May manage:** platform-wide settings; user-access issues; account troubleshooting; system troubleshooting; platform-level audit access. Platform admins do not automatically gain teaching content access to arbitrary courses/sections.

### 2.5 Where staff standing comes from (two tiers)

A course (`CS 33`) has several lecture and lab sections under it. A person's
standing on a section comes from exactly one of two places, and the difference
decides what they can reach. Settled in
[ADR-0004](../decisions/ADR-0004-course-wide-staff-standing.md).

| | **Course-wide standing** | **Section standing** |
|---|---|---|
| What it is | Being `courses.owner_user_id`, or holding a `CourseStaff` row | Holding a `SectionStaff` row on one section |
| Reaches | **Every section of the course, including sections created later** | Exactly that one section |
| Roles | Teacher / co-teacher only — the **Instructor** tier | Teacher, co-teacher, or Student Assistant |
| Permission flags | None. Full capability by standing | Teacher/co-teacher: full. Student Assistant: exactly the granted flags (§2.3) |
| Granted by | The course owner alone | The course owner alone |
| Revoked by | Removing the `CourseStaff` row | Removing the `SectionStaff` row |

- **[Confirmed]** Course-wide standing is **Instructor-only**: there is no
  course-wide Student Assistant. The flags in §2.3 would have to apply to
  sections that do not exist yet, so nothing could be scoped or reviewed. A
  Student Assistant is always a delegation on named class lists.
- **[Confirmed]** Someone who assists **some** sections of a course — a lab
  instructor on 3 of 8 — holds one `SectionStaff` row per section. They are
  added in **one action with a section picker**, not once per section, but the
  result is still separate auditable rows scoped to the sections they were
  given.
- **[Confirmed]** Both tiers are granted by the **course owner only**
  ([ADR-0003](../decisions/ADR-0003-course-owner-controls-staff-permissions.md)),
  so nobody can widen their own access or anyone else's.
- **[Confirmed]** Removing course-wide standing deletes that row and nothing
  else. Any section grant the person was separately given stays, so revoking the
  wide grant returns them to exactly the sections they were explicitly named on.
  Nothing they already did is deleted.
- **[Confirmed]** The course owner's own standing cannot be removed — it comes
  from `courses.owner_user_id`, not from a row. A departing owner needs an
  owner-transfer feature, which does not exist yet.
- **[Confirmed]** Neither tier creates an account. An address with no active
  account is refused by name, and a request granting several people is
  **atomic**: one unusable address grants nobody anything. Whether an invitation
  flow should exist is **[Open D24]** — see [decisions/open-decisions.md](../decisions/open-decisions.md).
- **[Confirmed]** Who holds which standing is readable in one place: the
  course's **Teaching team** view, one paginated list where each row states its
  own scope. A section's own setup page shows that section's `SectionStaff` rows
  plus a count of the course-wide instructors who also reach it.
- **[Confirmed 2026-09-08]** The **owner appears once**, from
  `courses.owner_user_id`. The rows the platform writes for them by itself are
  suppressed there, because neither says anything that row does not and neither
  is removable while they own the course: their `CourseStaff` row (written by
  `createCourse`) always, and their `SectionStaff` row **only when it grants
  everything** — a `teacher` or `co_teacher` row, which is what `createSection`
  writes for whoever created the section. A `ta` row for the owner is **kept**:
  somebody wrote a narrower role deliberately, it is not removable, and the
  owner still holds every capability regardless, so a reader has to be able to
  see that it exists. The suppression reaches the owner and nobody else — a
  non-owner keeps every course row and every section grant, since each is a
  separate grant somebody chose to make and can separately remove.

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
| Grant course-wide standing (every section, incl. future ones) | — | Y (owner) | — | — |
| Revoke course-wide standing (never the owner's own) | — | Y (owner) | — | — |
| See who has access to the course, and to which sections | — | Y | — | — |
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
| Filtered-week CSV, responder list (CSV/XLSX), bonus, PDF, backlog-status exports | — | Y | **—** (non-delegable) | — |
| Moderate comments, lock a discussion | — | Y | C (`moderate_discussion`) | — |
| React / comment on a published entry | Y | Y | Y | — |
| Archive / restore / clone a course | — | Y | **—** (non-delegable) | — |
| View audit history | — | Y (own resources) | **—** (non-delegable) | Y (platform-level) |
| Platform settings/troubleshooting | — | — | — | Y |

## 4. Student-visibility guarantees (cross-reference)

Students never see: another student's identity, **anyone else's** validity, the existence of a
flag, the internal invalidation reason or staff note, no-response/`Will Not Answer`/undecided
decisions, drafts or drafts awaiting approval, rejected drafts, scheduled answers, unpublished
entries, source links, staff-only revision metadata (editor, revision count, prior text), another
commenter's identity, or audit records.

Students **do** see: their own submission's validity and its student-visible reason, their own
bonus progress, their own private thread, and the published wording linked to their own question.

Full projections: [domain/domain-model.md](domain-model.md#3-state-models),
[public-qa.md](public-qa.md),
[participation.md](participation.md). This backs Risk R6.

## 5. Archived courses

An archived course is **read-only**. The check lives inside the authorization helpers with an
inverted default: every `require*` helper rejects a write on an archived course unless the caller
explicitly opts in with `allowArchived`. Only reads, exports, restore, and clone-from opt in, so a
future mutation that forgets to think about archiving is refused rather than silently allowed.
Hiding a button is never the enforcement mechanism.

## 6. Decisions affecting roles

- **[Open D3]** Who grants the Teacher role (recommend: platform admin grants; teachers self-serve thereafter). See [decisions/open-decisions.md](../decisions/open-decisions.md).
- **[Open D24]** Whether adding an address with no account should create an invitation or a pending staff row. Today it is refused by name; see [decisions/open-decisions.md](../decisions/open-decisions.md).
- **D10 — closed:** a dropped student's enrollment is deactivated; their own history stays readable.
- **D17 — closed:** export authorization, including the documented deviation above.
- **ADR-0003:** the course owner alone assigns staff and sets TA permissions.
- **ADR-0004:** course-wide standing is an owner-granted, Instructor-only tier (§2.5).

## 6. Related documents

[domain/domain-model.md](domain-model.md) · [domain/student-identity.md](student-identity.md) · [participation.md](participation.md) · [public-qa.md](public-qa.md) · [engineering/architecture-history.md](../engineering/architecture-history.md) · [decisions/open-decisions.md](../decisions/open-decisions.md)
