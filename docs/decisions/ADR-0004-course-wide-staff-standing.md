# ADR-0004 — Course-wide staff standing is an owner-granted, Instructor-only tier

**Status:** Accepted / provisional (extends [ADR-0003](ADR-0003-course-owner-controls-staff-permissions.md); depends on [Open D3](open-decisions.md))
**Date:** 2026-09-06

## Context

`CS 33` is a course with several lecture and lab sections under it. Two tiers of
staff standing already existed in the schema and in
[domain/roles-and-permissions.md](../domain/roles-and-permissions.md):

- a `course_staff` row (or being `courses.owner_user_id`), which
  `requireSectionStaff` admits **before** it looks at any section row — so it is
  full instructor capability on every section of the course;
- a `section_staff` row, which is standing on exactly one section, carrying the
  TA permission catalog.

Only the second tier had a write path. `course_staff` rows came from
`createCourse` (the owner's own row) and from the seed script, and nothing in
the product could grant, show, or revoke one. That left three questions
unanswered, raised as [issue #17](https://github.com/duckycodess/dcs-class-feedback/issues/17) item 2:

1. Does a course-level teacher automatically staff every section, and is that
   visible anywhere a teacher can see?
2. How is a lab instructor who teaches 3 of 8 sections added — once per section,
   or once with a section picker?
3. Where does someone see "who has access to this course, and to which
   sections" as one view?

## Decision

1. **Course-wide standing is a real, grantable tier, and only the course owner
   may grant it.** `assignCourseStaff` requires `requireCourseOwner`, the same
   gate ADR-0003 put on section assignment and for a stronger reason: this grant
   is wider, so a co-teacher able to write one could escalate further than they
   could at section scope.
2. **Course-wide standing is Instructor-only: no TA role, no permission flags.**
   It confers full capability on every section of the course, *including sections
   created later*, so there is nothing for a flag to narrow — a course-wide TA
   would be a TA whose permissions could never be scoped to anything. A
   course-wide grant with role `ta` is refused with the coded reason
   `role_not_allowed_for_scope`.
3. **Section-scoped TAs stay per-section.** A Student Assistant is a delegation
   on one class list, with the permission catalog attached. Someone who assists
   3 of 8 sections is three `section_staff` rows — granted in one action by
   `assignSectionStaffBatch`, with one section picker, but still three auditable
   rows scoped to the sections they were given.
4. **No invitation system.** Neither scope creates an account. An address with
   no active account is refused by name (`no_account` / `inactive_account`),
   exactly as ADR-0003 decided for section assignment. A grant is atomic across
   the whole request: one bad address grants nobody anything.
5. **The owner cannot remove their own standing.** Their access comes from
   `courses.owner_user_id`, not from a row, so deleting their `course_staff` row
   would change nothing about their access while making the Teaching team view
   misreport who owns the course. `removeCourseStaff` refuses it; the answer to
   a departing owner is an owner-transfer feature, not this control.
6. **Revoking course-wide standing leaves explicit section grants intact.**
   `removeCourseStaff` deletes one `course_staff` row and nothing else. A
   `section_staff` row is a separate, narrower grant somebody made deliberately;
   revoking the wide one returns that person to exactly the sections they were
   explicitly given, rather than silently removing them from those too. Nothing
   they already did is deleted.
7. **Everyone with access is enumerated in one paginated view** — the course's
   Teaching team page — with each row stating its own scope. One list rather
   than a panel per tier, because the two tiers answer the same question and a
   heading printed once cannot survive a page boundary. Revoking course-wide
   standing lives there, because that is the only view where such a row is
   visible at all.

Both writes are audited in the same transaction as the change, with the
denormalized `courseId` set and a shared batch id in metadata:
`staff.course_assigned` and `staff.course_removed`.

## Alternatives considered

- **Leave course standing implicit and un-grantable.** The status quo. Rejected:
  the tier already decided who could reach every section, so leaving it
  invisible and unwritable meant the widest access in the product could only be
  arranged by seeding the database.
- **Give course-wide standing the TA permission catalog.** Rejected: the flags
  would apply to sections that do not exist yet, so no reviewer could tell what
  the grant would eventually permit. Narrow delegation is what section scope is
  for.
- **Let any course instructor grant course-wide standing.** Rejected on the same
  Risk R5 grounds as ADR-0003, more strongly — the grant is transitive, so one
  co-teacher could widen the set of people who can widen the set.
- **Invite by email, creating a pending account.** Rejected for now: it adds an
  account-provisioning path and a pending state to a product whose identity rule
  is "the address is on a list, and the account exists". It remains open as a
  product question (issue #17 item 1).
- **Add course-wide standing on the section setup page.** Rejected: a course-wide
  grant made from inside one section reads as a grant to that section, which is
  the misreading this whole tier already suffered from.

## Consequences

- An account with **no teacher role** can now hold a course. `primaryNav` shows
  the "My courses" group whenever the account holds a course, not only when it
  has the teacher capability — without that, a grantee had a course they could
  open and no row anywhere leading to it. The course *index* stays
  capability-gated, because that is where courses are created.
- The Teaching team view is the one place course-wide standing is visible, so it
  is load-bearing rather than informational.
- Revoke is per row, and a person may legitimately appear in the list several
  times (one course row, several section rows). Each row identifies itself.
- `course_staff.role` remains a free-text column with a `(course_id, user_id)`
  unique index. Re-granting to the same person updates that one row and is
  counted as `unchanged` or `updated`; no migration was needed and none was
  added.

## Follow-up

- The **Add staff** dialog (issue #17 item 1) is **built**: one dialog, one
  permission set, several people per action, with a course-wide/per-section
  scope choice on the course Teaching team page and a section-locked variant on
  section setup. This ADR settled the model it was designed against.
- Owner sign-off on [Open D3](open-decisions.md) (who grants the teacher
  role) still stands open, and now also governs how a non-teacher grantee is
  expected to be provisioned.
- Whether an invitation/pending-account flow should exist is unresolved and
  deliberately not decided here.
- The product documents ([domain/roles-and-permissions.md](../domain/roles-and-permissions.md)
  §2.5 and [domain/domain-model.md](../domain/domain-model.md) `CourseStaff` / `SectionStaff`)
  **have been updated** to describe the two tiers, so they — not this ADR — are
  now the reference for the model.
