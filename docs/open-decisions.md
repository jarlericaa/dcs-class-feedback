# Open Decisions

> **Status:** Active decision register. The repository has an implementation
> baseline, but unresolved product, privacy, and operational choices remain.
> Every unresolved product/technical decision. **Agents must read this before any implementation work** ([AGENTS.md](../AGENTS.md)) and must not resolve a "wait for owner" item on their own.
> Each entry: **Question · Options · Trade-offs · Recommended choice · Wait for owner approval?**

> ## Resolved 2026-08-03 by the approval of [project-specs.md](project-specs.md)
>
> `project-specs.md` is now the acceptance target. The following entries are **closed**;
> their resolutions are recorded inline below and in the owning documents.
>
> | # | Resolution |
> |---|---|
> | D1 | **Closed — TypeScript baseline.** "Fable" referred to Claude tooling. The Next.js + Drizzle + Auth.js stack is the approved implementation. |
> | D2 | **Closed — teacher-confirm-all is the default,** with auto-confirm implemented behind the `ROSTER_CLAIM_AUTO_CONFIRM` configuration flag (default **off**) so the policy can be switched later without a code change. |
> | D4 | **Closed — (a).** Structural edits lock once a cycle has a non-draft response; per-occurrence open/deadline overrides are allowed and audited. |
> | D5 | **Closed — (a) hard deadline, no grace.** `reopenCycle` remains the audited teacher escape hatch and now also unlocks locked responses (`manage_weekly_cycles`). |
> | D6 | **Closed — unpublish is APPROVED and implemented.** Unpublishing is audited and reversible via restore. An unpublished entry leaves the class archive *and* the linked asker's history. |
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
> | D17 | Are all exports Instructor-only, per `project-specs.md` §11? | **Partially — a knowing deviation.** The three pre-existing participation CSVs keep honouring the `export_participation` TA flag (removing a shipped capability was judged worse than the deviation). Every **new** export — bonus records, XLSX, PDF summaries, backlog status — is Instructor-only. Recorded in [roles-and-permissions.md](roles-and-permissions.md). |

> ### New decisions recorded 2026-08-06 (course-level forms and audiences)
>
> Model, rationale and migration: [FORMS-AUDIENCE-DYNAMIC-INSTANCES.md](FORMS-AUDIENCE-DYNAMIC-INSTANCES.md).
>
> | # | Question | Decision |
> |---|---|---|
> | D18 | Is a form owned by a section or by a course? | **By the course.** A form definition belongs to a Course; an explicit **audience** (`form_instance_sections`) says which sections receive each instance. Sections remain the access/roster/permission context and are no longer the primary object in the form workflow. |
> | D19 | Can one form instance target several sections? | **Yes**, and it is the ordinary case. One instance, one window, one question snapshot, one review queue. Response uniqueness stays `(instance, student_record)` — the attribution section is recorded separately and is deliberately NOT in that key, so a student in two targeted sections still has exactly one response. |
> | D20 | May a published answer reach several sections at once? | **No — the existing section-scoped rule stands.** A publication goes to the **asker's own** section only, enforced in `draftPublicAnswer` and covered by a test. Sharing a form does not widen an archive; cross-section reuse continues to go through the course backlog (D8). Allowing an explicit multi-section publish would be a privacy-surface change and needs owner approval before it is built. |

---

## D1. What does "Fable" mean? (gates the stack)

- **Question:** Does "using Fable" refer to the Claude Fable model/tooling, or does the owner want the implementation stack to use F#/Fable?
- **Options:** (a) Claude tooling only → keep TypeScript recommendation; (b) F#/Fable stack → change/extend the architecture to an F# option (e.g. SAFE-stack).
- **Trade-offs:** TS = larger help/hiring pool, strong Claude Code familiarity; F#/Fable = owner preference if intended, but steeper learning curve and smaller ecosystem for a student team.
- **Current working choice:** Continue the existing TypeScript implementation.
  This remains conditional only if the owner intended an F#/Fable application
  stack rather than a coding tool/model reference. See
  [SPEC-RECONCILIATION.md](SPEC-RECONCILIATION.md).
- **Wait for owner approval?** **Only if F#/Fable is intended.** Otherwise this
  decision can be closed as “TypeScript baseline.”

## D2. Account-match auto-confirm policy (highest-risk)

- **Question:** For MVP, auto-confirm exact-unique name matches, or require teacher confirmation for **all** matches?
- **Options:** (a) teacher-confirm-all; (b) exact-unique auto-confirm + teacher-confirm for ambiguous/none, with audit + teacher notification.
- **Trade-offs:** (a) safest against impersonation (Risk R1), more teacher effort; (b) less effort, small residual impersonation risk from editable display names.
- **Recommended choice:** (a) **teacher-confirm-all** for MVP. See [account-matching.md](account-matching.md#4-recommended-mvp-matching-policy).
- **Status: CLOSED 2026-08-03.** (a) is the shipped default. (b) exists in the service behind
  `ROSTER_CLAIM_AUTO_CONFIRM` (default `false`) with a configurable minimum name score, so
  enabling it later is a configuration change, not a rewrite. Every claim decision is audited
  either way.

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
- **Recommended choice:** (a). See [weekly-form-workflow.md](weekly-form-workflow.md#3-preview-modify-and-the-edit-lock-rule).
- **Wait for owner approval?** Recommended yes (data-integrity policy).

## D5. Grace period / cycle reopen policy

- **Question:** Any grace period after deadline, and rules for reopening a closed cycle?
- **Options:** (a) hard deadline, no grace; teacher can reopen (audited); (b) fixed grace window; (c) per-section configurable grace.
- **Trade-offs:** (a) simple, predictable; (b)/(c) more flexible, more complexity and participation edge cases.
- **Recommended choice:** (a). See [weekly-form-workflow.md](weekly-form-workflow.md).
- **Wait for owner approval?** **Yes.**

## D6. Unpublish support

- **Question:** Should published public answers be unpublishable, and if so when?
- **Options:** (a) not in MVP; reserve `Unpublished` state only; (b) support in MVP.
- **Trade-offs:** (a) matches "if later supported"; (b) scope creep beyond stated MVP.
- **Status: CLOSED 2026-08-03 — (b) support it.** `project-specs.md` §10 defines
  `Published → Updated/Unpublished`, so unpublish is a required state transition. It is
  Instructor-only, requires a reason, is audited, and is reversible via restore. An unpublished
  entry leaves both the class archive and the linked asker's history (D16). See
  [public-qa-and-source-linking.md](public-qa-and-source-linking.md).

## D7. Timezone: institution-wide vs per-section

- **Question:** One institution timezone, or per-section override?
- **Options:** (a) single institution timezone (MVP); (b) per-section override.
- **Trade-offs:** (a) simplest and correct for one campus; (b) needed only for multi-timezone offerings.
- **Current working choice:** (a) single institution timezone for MVP; the
  repository default is `Asia/Manila`. Confirm the value before production and
  defer per-section overrides.
- **Wait for owner approval?** **Yes before pilot/production** if the institution
  uses a different timezone.

## D8. Merge scope

- **Question:** May a merged public answer combine submissions across cycles (and only within a section)?
- **Options:** (a) within a section, across cycles allowed; (b) within a single cycle only; (c) across sections (via backlog).
- **Trade-offs:** (a) practical for recurring questions, must preserve per-cycle participation; (b) most restrictive; (c) already covered by course backlog.
- **Recommended choice:** (a) within a section, across cycles; cross-section handled via the course backlog. See [public-qa-and-source-linking.md](public-qa-and-source-linking.md#5-merging-multiple-submissions).
- **Wait for owner approval?** Recommended yes.

## D9. Section join code / verification token as extra matching factor

- **Question:** Add a teacher-provided join code/token students enter at first login, beyond name?
- **Options:** (a) no extra factor (name + teacher confirm only); (b) add join code as optional extra factor.
- **Trade-offs:** (a) simpler; (b) materially reduces impersonation risk (Risk R1) at some UX cost.
- **Recommended choice:** Document as an option; **not** an approved requirement. Consider adopting alongside D2.
- **Wait for owner approval?** **Yes.**

## D10. Deactivated-student access after roster re-import

- **Question:** When a student is dropped from a re-imported roster, what access remains?
- **Options:** (a) deactivate enrollment, keep read-only history; (b) deactivate and revoke access; (c) keep active.
- **Trade-offs:** (a) preserves data + student's own history; (b) cleaner cutoff; (c) wrong (they left).
- **Recommended choice:** (a) — never delete data (matches "no silent overwrite"). See [account-matching.md](account-matching.md#92-safety-rules).
- **Wait for owner approval?** **Yes.**

## D11. ORM: Drizzle vs Prisma

- **Question:** Which ORM if the recommended Drizzle is not preferred?
- **Options:** (a) Drizzle (recommended); (b) Prisma.
- **Trade-offs:** Drizzle = SQL-transparent, teaches DB concepts; Prisma = higher-level, faster start, hides SQL. See [architecture-proposal.md](architecture-proposal.md#31-prisma-vs-drizzle-the-orm-decision).
- **Current working choice:** (a) Drizzle; it is already the repository's ORM
  and migration source of truth.
- **Wait for owner approval?** Only if the team wants to replace Drizzle with
  Prisma; do not reopen this merely to start the UI.

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
- **Current working choice:** (b). Recorded as a deliberate deferral in [FORMS-AUDIENCE-DYNAMIC-INSTANCES.md](FORMS-AUDIENCE-DYNAMIC-INSTANCES.md#61-physical-names), available at any time.
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

---

## Related documents

[product-requirements.md](product-requirements.md) · [account-matching.md](account-matching.md) · [weekly-form-workflow.md](weekly-form-workflow.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [architecture-proposal.md](architecture-proposal.md) · [mvp-scope.md](mvp-scope.md)
