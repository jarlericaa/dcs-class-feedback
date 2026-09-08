# Open Decisions

> **Status:** Active decision register. The repository has an implementation
> baseline, but unresolved product, privacy, and operational choices remain.
> Every unresolved product/technical decision. **Agents must read this before any implementation work** ([AGENTS.md](../../AGENTS.md)) and must not resolve a "wait for owner" item on their own.
> Each entry: **Question · Options · Trade-offs · Recommended choice · Wait for owner approval?**

> ## Resolved 2026-08-03 by the approval of [product/specification.md](../product/specification.md)
>
> `product/specification.md` is now the acceptance target. The following entries are **closed**;
> their resolutions are recorded inline below and in the owning documents.
>
> | # | Resolution |
> |---|---|
> | D1 | **Closed — TypeScript baseline.** "Fable" referred to Claude tooling. The Next.js + Drizzle + Auth.js stack is the approved implementation. |
> | D2 | **Superseded and REMOVED 2026-08-07** — see the block below. Name matching no longer exists, so neither does the question. |
> | D4 | **Closed — (a).** Structural edits lock once a cycle has a non-draft response; per-occurrence open/deadline overrides are allowed and audited. |
> | D5 | **Closed — (a) hard deadline, no grace.** `reopenCycle` remains the audited teacher escape hatch and now also unlocks locked responses (`manage_weekly_cycles`). |
> | D6 | **Closed — unpublish is APPROVED.** Instructor-only, reason required, audited, and reversible via restore. An unpublished entry leaves the class archive *and* the linked asker's history (D16). **Approved, not yet built** — [engineering/current-state.md](../engineering/current-state.md) E2 is `schema only`. |
> | D7 | **Closed — single institution timezone,** repository default `Asia/Manila`, stored per section and used consistently. |
> | D8 | **Closed — (a).** Merge is within a section and may span cycles; cross-section reuse goes through the course backlog. Merging never alters per-cycle participation. |
> | D10 | **Closed — (a).** A dropped student's enrollment is deactivated and their own history stays readable; no data is deleted. |
> | D11 | **Closed — Drizzle.** |
>
> ### New decisions recorded 2026-08-03
>
> | # | Question | Decision |
> |---|---|---|
> | D14 | Are bonus periods course- or section-scoped? | **Course-scoped** (`bonus_periods.course_id`). Section-scoped cycles carry a nullable `bonus_period_id` plus an assignment source so a staff override is never overwritten by a later automatic pass. |
> | D15 | Does a `Flagged` submission keep bonus credit while an Instructor decides? | **Yes, and the flag is invisible to the student.** Only Instructor-confirmed `Invalid` removes credit, so credit changes exactly once and internal staff process never leaks. |
> | D16 | What does a linked asker see after an entry is unpublished? | **Nothing** — it leaves their history too. The private thread and their immutable original question survive. |
> | D17 | Are all exports Instructor-only, per `product/specification.md` §11? | **Partially — a knowing deviation.** The three pre-existing participation CSVs keep honouring the `export_participation` TA flag (removing a shipped capability was judged worse than the deviation). Every **new** export — bonus records, XLSX, PDF summaries, backlog status — is Instructor-only. Recorded in [domain/roles-and-permissions.md](../domain/roles-and-permissions.md). |

> ### New decisions recorded 2026-08-06 (course-level forms and audiences)
>
> Model, rationale and migration: [domain/forms-and-audiences.md](../domain/forms-and-audiences.md).
>
> | # | Question | Decision |
> |---|---|---|
> | D18 | Is a form owned by a section or by a course? | **By the course.** A form definition belongs to a Course; an explicit **audience** (`form_instance_sections`) says which sections receive each instance. Sections remain the access/roster/permission context and are no longer the primary object in the form workflow. |
> | D19 | Can one form instance target several sections? | **Yes**, and it is the ordinary case. One instance, one window, one question snapshot, one review queue. Response uniqueness stays `(instance, student_record)` — the attribution section is recorded separately and is deliberately NOT in that key, so a student in two targeted sections still has exactly one response. |
> | D20 | May a published answer reach several sections at once? | **No — the existing section-scoped rule stands.** A publication goes to the **asker's own** section only, enforced in `draftPublicAnswer` and covered by a test. Sharing a form does not widen an archive; cross-section reuse continues to go through the course backlog (D8). Allowing an explicit multi-section publish would be a privacy-surface change and needs owner approval before it is built. |


> ### Decision recorded 2026-08-07 (student identity)
>
> Rule, import validation and migration behaviour: [domain/student-identity.md](../domain/student-identity.md).
>
> | # | Question | Decision |
> |---|---|---|
> | D23 | How does an authenticated account become a student? | **Exact normalized UP email matching against teacher-uploaded class lists.** The class list carries student number, full name, and UP email. A signed-in user is the student record whose `roster_email` equals their trimmed, lowercased email — nothing else. Name similarity, roster claims, claim throttling, and teacher confirm/reject/unlink of matches are **removed** (D2, D9). A roster email is unique across all records, enforced in the database, so two students can never resolve to one another. Class-list rows with a missing, malformed, off-domain, duplicated, or already-taken email are **refused** at import rather than guessed at. |

---

## D1. What does "Fable" mean? (gates the stack)

- **Question:** Does "using Fable" refer to the Claude Fable model/tooling, or does the owner want the implementation stack to use F#/Fable?
- **Options:** (a) Claude tooling only → keep TypeScript recommendation; (b) F#/Fable stack → change/extend the architecture to an F# option (e.g. SAFE-stack).
- **Trade-offs:** TS = larger help/hiring pool, strong Claude Code familiarity; F#/Fable = owner preference if intended, but steeper learning curve and smaller ecosystem for a student team.
- **Status: CLOSED 2026-08-03 — (a) TypeScript baseline.** “Fable” referred to
  Claude tooling, not an F#/Fable implementation stack, so the condition that
  gated this never applied. The Next.js + Drizzle + Auth.js monolith is the
  approved implementation, recorded in
  [ADR-0001](ADR-0001-current-stack-and-scheduler.md). Nothing here
  awaits approval.

## D2. Account-match auto-confirm policy — **REMOVED, not deferred**

- **Original question:** auto-confirm exact-unique name matches, or require teacher confirmation
  for all of them?
- **Status: REMOVED 2026-08-07, owner-approved.** The question was about how much to trust a
  similarity score between a Google display name and a roster name. **There is no name matching**,
  so there is nothing to tune and nothing to confirm.
- **Replaced by [Confirmed]:** *student access is determined by exact normalized UP email matching
  against teacher-uploaded class lists.* The class list now carries the UP email, so identity comes
  from the teacher rather than from a guess about two strings.
- Name similarity, roster claims, claim throttling, teacher confirm/reject/unlink, and the
  `ROSTER_CLAIM_*` configuration are **deleted**, not disabled. Migration behaviour for existing
  data: [domain/student-identity.md §10](../domain/student-identity.md#10-what-was-removed-and-what-happened-to-the-data).
- **Wait for owner approval?** No — resolved.

## D3. Who grants the Teacher role?

- **Question:** How does a user become a Teacher?
- **Options:** (a) platform admin grants; (b) self-service request + approval; (c) domain/group-based.
- **Trade-offs:** (a) controlled, low complexity; (b) more onboarding UX; (c) risks over-granting.
- **Recommended choice:** (a) platform admin grants; teachers self-serve courses/sections thereafter.
- **Wait for owner approval?** **Yes.**

## D4. Edit-lock rule after first submission

- **Question:** What exactly is restricted once ≥1 student submits a cycle?
- **Options:** (a) lock structural edits (add/remove/retype questions, required flags, choices), allow audited cosmetic text fixes; (b) lock everything; (c) allow all with warnings.
- **Trade-offs:** (a) balances data integrity with fixing typos; (b) safest but rigid; (c) risks invalidating collected answers.
- **Status: CLOSED 2026-08-03 — (a).** Structural edits lock once a cycle has a
  non-draft response; per-occurrence open/deadline overrides remain allowed and
  audited. See [domain/form-workflow.md](../domain/form-workflow.md#3-preview-modify-and-the-edit-lock-rule).

## D5. Grace period / cycle reopen policy

- **Question:** Any grace period after deadline, and rules for reopening a closed cycle?
- **Options:** (a) hard deadline, no grace; teacher can reopen (audited); (b) fixed grace window; (c) per-section configurable grace.
- **Trade-offs:** (a) simple, predictable; (b)/(c) more flexible, more complexity and participation edge cases.
- **Status: CLOSED 2026-08-03 — (a) hard deadline, no grace.** `reopenCycle`
  remains the audited teacher escape hatch and also unlocks locked responses
  (`manage_weekly_cycles`). It is discretionary staff recovery, not a student
  entitlement, so student-facing copy names the path without promising it. See
  [domain/form-workflow.md](../domain/form-workflow.md).

## D6. Unpublish support

- **Question:** Should published public answers be unpublishable, and if so when?
- **Options:** (a) not in MVP; reserve `Unpublished` state only; (b) support in MVP.
- **Trade-offs:** (a) matches "if later supported"; (b) scope creep beyond stated MVP.
- **Status: CLOSED 2026-08-03 — (b) support it.** `product/specification.md` §10 defines
  `Published → Updated/Unpublished`, so unpublish is a required state transition. It is
  Instructor-only, requires a reason, is audited, and is reversible via restore. An unpublished
  entry leaves both the class archive and the linked asker's history (D16). See
  [domain/public-qa.md](../domain/public-qa.md).
- **Approved, not yet built.** The decision is settled; the service and UI are
  not implemented — [engineering/current-state.md](../engineering/current-state.md) `E2` is `schema only`.
  Publishing is therefore still effectively irreversible in the running app.

## D7. Timezone: institution-wide vs per-section

- **Question:** One institution timezone, or per-section override?
- **Options:** (a) single institution timezone (MVP); (b) per-section override.
- **Trade-offs:** (a) simplest and correct for one campus; (b) needed only for multi-timezone offerings.
- **Status: CLOSED 2026-08-03 — (a) single institution timezone.** Stored on
  each section and used consistently; per-section overrides are **deferred**. The
  repository default is `Asia/Manila`.
- **Residual operational step, not an open decision:** confirm the configured
  value before pilot/production if the institution does not run on `Asia/Manila`.
  That is a deployment check on `INSTITUTION_TIMEZONE`; the model itself is
  settled and needs no further approval.

## D8. Merge scope

- **Question:** May a merged public answer combine submissions across cycles (and only within a section)?
- **Options:** (a) within a section, across cycles allowed; (b) within a single cycle only; (c) across sections (via backlog).
- **Trade-offs:** (a) practical for recurring questions, must preserve per-cycle participation; (b) most restrictive; (c) already covered by course backlog.
- **Status: CLOSED 2026-08-03 — (a).** Merge is within a section and **may span
  cycles**; cross-section reuse goes through the course backlog. Merging never
  alters per-cycle participation. The merge **UI** is a separate, unbuilt item
  ([engineering/current-state.md](../engineering/current-state.md) `D3`). See
  [domain/public-qa.md](../domain/public-qa.md#5-merging-multiple-submissions).

## D9. Section join code / verification token as extra matching factor — **REMOVED**

- **Original question:** add a teacher-provided join code as a second factor beyond the name?
- **Status: REMOVED 2026-08-07.** It was proposed *because* an editable display name was weak
  evidence of identity (Risk R1). With the UP email supplied by the teacher from an authoritative
  class list, there is no weak first factor to shore up.
- **Wait for owner approval?** No — resolved with D2.

## D10. Deactivated-student access after roster re-import

- **Question:** When a student is dropped from a re-imported roster, what access remains?
- **Options:** (a) deactivate enrollment, keep read-only history; (b) deactivate and revoke access; (c) keep active.
- **Trade-offs:** (a) preserves data + student's own history; (b) cleaner cutoff; (c) wrong (they left).
- **Status: CLOSED 2026-08-03 — (a).** A dropped student's enrolment is
  deactivated and their own history stays readable; no data is deleted, matching
  the "no silent overwrite" rule. See
  [domain/student-identity.md](../domain/student-identity.md#74-safety-rules).

## D11. ORM: Drizzle vs Prisma

- **Question:** Which ORM if the recommended Drizzle is not preferred?
- **Options:** (a) Drizzle (recommended); (b) Prisma.
- **Trade-offs:** Drizzle = SQL-transparent, teaches DB concepts; Prisma = higher-level, faster start, hides SQL. See [engineering/architecture-history.md](../engineering/architecture-history.md#31-prisma-vs-drizzle-the-orm-decision).
- **Status: CLOSED 2026-08-03 — (a) Drizzle.** It is the repository's ORM and
  migration source of truth. Replacing it with Prisma would be a **new**
  decision with a migration cost, not a reopening of this one — and never a
  prerequisite for starting UI work.

## D12. Deployment target

- **Question:** Where does the app run in production?
- **Options:** (a) single container + managed Postgres; (b) PaaS with Postgres add-on.
- **Trade-offs:** both keep the monolith simple; differences are ops preference and cost.
- **Recommended choice:** Defer; either works. Decide near implementation.
- **Wait for owner approval?** No (low-stakes, revisit later).

## D21. Physical rename of `weekly_cycles` → `form_instances`

- **Question:** Should the table now called `weekly_cycles` be renamed to match the domain concept it holds?
- **Options:** (a) rename now (`ALTER TABLE … RENAME TO`, plus column renames); (b) keep the physical name and rename only in the domain layer.
- **Trade-offs:** (a) removes the last trace of weekly-only naming, but drizzle-kit's rename detection is interactive, so the migration and its snapshot must be hand-authored against fifteen dependent foreign keys; (b) costs nothing a user can see — the Drizzle export is `formInstances`, `cycleIndex` is presented as a sequence number, and no UI string says "cycle".
- **Current working choice:** (b). Recorded as a deliberate deferral in [domain/forms-and-audiences.md](../domain/forms-and-audiences.md#61-physical-names), available at any time.
- **Wait for owner approval?** No — internal naming only.

## D22. Per-section windows for one shared form

- **Question:** Should a form shared by several sections be able to open or close at different times per section?
- **Options:** (a) one window per instance (today): a course needing different deadlines gives each timezone or schedule its own form with a selected-sections audience; (b) per-section window overrides on a shared instance.
- **Trade-offs:** (a) keeps "the deadline" a single unambiguous moment, which every participation, locking and reminder rule depends on; (b) is more flexible and multiplies the edge cases in locking and in the reminder scheduler. Sections in different timezones are refused outright today rather than silently resolved.
- **Current working choice:** (a).
- **Wait for owner approval?** **Yes if** a real offering needs staggered deadlines across sections of one course.

## D13. Data retention / end-of-semester

- **Question:** How long is data kept, and what happens at semester end?
- **Options:** (a) archive in place indefinitely; (b) retention window then purge/anonymize; (c) export-then-archive.
- **Trade-offs:** privacy vs continuity vs institutional policy.
- **Recommended choice:** Archive in place for MVP; define a retention policy with the institution before launch.
- **Wait for owner approval?** **Yes** (institutional/legal input needed).

## D24. Staff invitations for an address with no account

- **Question:** When staff are added by email and one address has no account yet, should the platform invite that person or hold a pending grant, instead of refusing the address?
- **Options:** (a) refuse the address by name and tell the owner the person must sign in once first — **the current behaviour**; (b) write a pending staff row that activates on that person's first sign-in; (c) send an email invitation that provisions the account.
- **Trade-offs:** (a) never provisions access for an address nobody has proven they control, and keeps one rule for staff and students alike — the account exists, or it does not. Its cost is a two-step dance when a new assistant has not logged in yet. (b) and (c) remove that friction but add an account-provisioning path, a pending state that must be shown, expired, and audited, and a window in which a mistyped address holds a real grant. (c) additionally makes the platform an email sender to non-members.
- **Current working choice:** (a). Refusal is per address, with the reason stated (`no_account` / `inactive_account`), and the whole request is refused atomically so a typo grants nobody anything. This follows [ADR-0003](ADR-0003-course-owner-controls-staff-permissions.md) §3, which decided the same thing for section assignment, and is restated in [ADR-0004](ADR-0004-course-wide-staff-standing.md) for course-wide standing.
- **Wait for owner approval?** **Yes** before building (b) or (c). Raised as item 1 of issue #17 and deliberately not resolved there.

---

## Related documents

[product/requirements.md](../product/requirements.md) · [domain/student-identity.md](../domain/student-identity.md) · [domain/form-workflow.md](../domain/form-workflow.md) · [domain/public-qa.md](../domain/public-qa.md) · [engineering/architecture-history.md](../engineering/architecture-history.md) · [product/scope.md](../product/scope.md)
