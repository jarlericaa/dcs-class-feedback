# ADR-0003 — The course owner alone controls staff assignment and TA permissions

**Status:** Accepted / provisional (depends on [Open D3](../open-decisions.md))
**Date:** 2026-08-02

## Context

[roles-and-permissions.md](../roles-and-permissions.md) §2.3 states that TA
permissions are "configurable per class section, controlled by the class
owner", and the permission→action matrix marks "assign staff / set TA
permissions" as `Y (owner)` for teachers and `—` for TAs. Until this change
there was no write path at all: `section_staff` rows only ever came from the
seed script, so the rule had never been encoded anywhere.

Implementing staff assignment forced three questions the documents did not
answer precisely enough to implement from:

1. May a co-teacher, who otherwise holds every capability on a section, assign
   staff or change permissions?
2. What is stored in the permission columns for a teacher or co-teacher, whose
   capabilities come from their role rather than from flags?
3. May assigning staff create an account for an address that has never signed
   in?

## Decision

1. **Only the course owner** may assign section staff or change permissions.
   `requireCourseOwner` is a distinct check from `requireCourseStaff`; a
   co-teacher with full operational capability on a section still cannot alter
   who else has access. This closes the escalation path where a staff member
   grants themselves `export_participation` or `view_student_identities`.
2. **Teacher and co-teacher rows store every flag as granted.** Their access
   already derives from their role in `requireSectionStaff`, so leaving the
   columns `false` would make the stored row contradict the effective
   permission. TA rows store exactly what was granted.
3. **Assignment never creates an account.** The target must already exist and
   be active. A mistyped address fails loudly instead of silently provisioning
   access for an address nobody controls, and a real student's first sign-in
   can never land on a pre-created staff row.

Audit browsing is deliberately **not delegable**: the MVP permission catalog
has no `view_audit_history` flag, so `listSectionAuditEvents` requires
teacher/co-teacher/course-staff standing and refuses TAs.

## Alternatives considered

- **Any section teacher may assign staff.** Simpler, and convenient when the
  owner is away, but it makes the permission catalog self-modifiable by the
  people it constrains. Rejected on Risk R5 grounds.
- **Platform admins may assign staff.** Rejected: it contradicts the confirmed
  rule that platform administration grants no content access.
- **Adding a `manage_staff` TA flag.** Rejected — it is not in the confirmed
  permission catalog, and adding it would promote a recommendation into a
  requirement.

## Consequences

- A course with an absent owner cannot change its teaching team. This is the
  intended trade-off for the pilot; if it hurts in practice the answer is an
  owner-transfer feature, not a wider grant.
- `getSectionAccess` reports effective permissions for navigation, but it is a
  read model: hiding a link is never the enforcement point.
- The stored-flags decision means reading a `section_staff` row tells the whole
  truth about that person's capability without also knowing their role.

## Follow-up

- Owner sign-off on [Open D3](../open-decisions.md) (who grants the teacher
  role). The implementation currently assumes a platform admin does.
- Revisit if the institution needs course-owner transfer or departmental
  administration.
