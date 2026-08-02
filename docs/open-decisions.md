# Open Decisions

> **Status:** Active decision register. The repository has an implementation
> baseline, but unresolved product, privacy, and operational choices remain.
> Every unresolved product/technical decision. **Agents must read this before any implementation work** ([AGENTS.md](../AGENTS.md)) and must not resolve a "wait for owner" item on their own.
> Each entry: **Question · Options · Trade-offs · Recommended choice · Wait for owner approval?**

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
- **Wait for owner approval?** **Yes** — do not implement auto-confirm without approval.

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
- **Recommended choice:** (a) **not an MVP feature**; state reserved for the future. See [domain-model.md](domain-model.md#36-public-answer-state).
- **Wait for owner approval?** **Yes** to ever build it.

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

## D13. Data retention / end-of-semester

- **Question:** How long is data kept, and what happens at semester end?
- **Options:** (a) archive in place indefinitely; (b) retention window then purge/anonymize; (c) export-then-archive.
- **Trade-offs:** privacy vs continuity vs institutional policy.
- **Recommended choice:** Archive in place for MVP; define a retention policy with the institution before launch.
- **Wait for owner approval?** **Yes** (institutional/legal input needed).

---

## Related documents

[product-requirements.md](product-requirements.md) · [account-matching.md](account-matching.md) · [weekly-form-workflow.md](weekly-form-workflow.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [architecture-proposal.md](architecture-proposal.md) · [mvp-scope.md](mvp-scope.md)
