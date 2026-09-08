# Documentation Index

This repository uses documentation-as-code. The docs are split by lifecycle so
that product intent, implementation facts, decisions, and temporary work do
not silently contradict one another.

## Read this first

1. [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) — founding context and scope.
2. [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) — product and user-workflow
   summary.
3. [CURRENT_STATE.md](CURRENT_STATE.md) — what the repository actually has now.
4. [DEVELOPMENT.md](DEVELOPMENT.md) — local setup and verification commands.
5. [WEB-APP-BUILD-PLAN.md](WEB-APP-BUILD-PLAN.md) — the recommended UI build
   sequence.
6. [../DESIGN.md](../DESIGN.md) — the design authority: visual system, tokens,
   type registers, states, breakpoints, and forbidden patterns.
7. [SPEC-RECONCILIATION.md](SPEC-RECONCILIATION.md) — **historical**: the
   2026-08-02 drift reconciliation. Every question it raised is now answered;
   read [open-decisions.md](open-decisions.md) for the live register.
8. [../CLAUDE_AUTONOMOUS_FULLSTACK_IMPLEMENTATION_PROMPT.md](../CLAUDE_AUTONOMOUS_FULLSTACK_IMPLEMENTATION_PROMPT.md) —
   **the live implementation handoff.** Start here for implementation work.
   ([prompts/CLAUDE_OPUS_5_UI_IMPLEMENTATION_PROMPT.md](prompts/CLAUDE_OPUS_5_UI_IMPLEMENTATION_PROMPT.md)
   and [CLAUDE_OPUS_5_UI_HANDOFF.md](CLAUDE_OPUS_5_UI_HANDOFF.md) are the earlier
   UI-only briefs and are **historical** — do not build from them.)
9. [ED_DISCUSSION_REFERENCE_PACK.md](ED_DISCUSSION_REFERENCE_PACK.md) —
   screenshot-bearing inspiration and translation rules.
10. [REPOSITORY_MAP.md](REPOSITORY_MAP.md) — fast code and documentation
    orientation.
11. [DEPLOYMENT.md](DEPLOYMENT.md) — pilot deployment and release assumptions.
12. [decisions/](decisions/) — durable architecture decision records.

## Authority and labels

Use the strongest available evidence for the question being answered:

1. Database schema, migrations, source code, and passing tests for current
   implementation behavior.
2. Owner-confirmed product rules in the domain documents.
3. Current-state and architecture documents, which explain how the above are
   organized.
4. Recommendations and design research, which guide future work but do not
   become requirements by themselves.
5. Open decisions, which must not be guessed when they materially change the
   product or architecture.

Documents use these labels:

- **[Confirmed]** — an owner-stated product requirement.
- **[Implemented]** — evidenced by the current repository.
- **[Recommended]** — a proposal for future work.
- **[Assumption]** — an inference that still needs validation.
- **[Open]** — unresolved; see [open-decisions.md](open-decisions.md).
- **[Deferred]** — intentionally outside the current build slice.

## Core product specification

| Document | Owns |
|---|---|
| [project-specs.md](project-specs.md) | **The acceptance target** — owner-approved 2026-08-03. Where an older document conflicts, this one wins |
| [product-requirements.md](product-requirements.md) | Goals, requirements, risks, and non-goals |
| [mvp-scope.md](mvp-scope.md) | MVP, post-MVP, and out-of-scope boundaries |
| [roles-and-permissions.md](roles-and-permissions.md) | Roles, resource scope, the two staff standing tiers, and TA capabilities |
| [weekly-form-workflow.md](weekly-form-workflow.md) | Recurrence, cycles, questions, templates, and submissions |
| [public-qa-and-source-linking.md](public-qa-and-source-linking.md) | Private/public response behavior, anonymity, source links, and archive |
| [participation-rules.md](participation-rules.md) | Validity, participation derivation, and CSV exports |
| [student-identity.md](student-identity.md) | SSO, exact UP-email student access, roster import, and identity safety |
| [question-backlog.md](question-backlog.md) | Course-level backlog lifecycle |
| [legacy-question-import.md](legacy-question-import.md) | Historical import and provenance |
| [domain-model.md](domain-model.md) | Entities, relationships, state dimensions, and audit events |
| [open-decisions.md](open-decisions.md) | Questions that still require a decision |
| [ai-future-plan.md](ai-future-plan.md) | Post-MVP AI constraints and future direction |

## Implementation and delivery

| Document | Owns |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current runtime architecture and module boundaries |
| [CURRENT_STATE.md](CURRENT_STATE.md) | Implemented, partial, and missing surfaces |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Setup, environment, scripts, and verification |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment, pilot readiness, release, and recovery assumptions |
| [REPOSITORY_MAP.md](REPOSITORY_MAP.md) | Fast map of code, scripts, persistence, and docs |
| [TESTING.md](TESTING.md) | Test layers, invariants, and coverage gaps |
| [SECURITY.md](SECURITY.md) | Privacy invariants, threat model, and release checks |
| [../CLAUDE_AUTONOMOUS_FULLSTACK_IMPLEMENTATION_PROMPT.md](../CLAUDE_AUTONOMOUS_FULLSTACK_IMPLEMENTATION_PROMPT.md) | **The live implementation handoff** for agents taking the app forward |
| [decisions/](decisions/) | ADRs for durable technical choices |
| [WEB-APP-BUILD-PLAN.md](WEB-APP-BUILD-PLAN.md) | UI information architecture and build slices |
| [DOCUMENT_MANIFEST.yaml](DOCUMENT_MANIFEST.yaml) | Machine-readable document ownership and update triggers |
| [SPEC-RECONCILIATION.md](SPEC-RECONCILIATION.md) | **Historical:** the 2026-08-02 drift reconciliation and the owner decisions it requested, all since answered |

## Design research

| Document | Owns |
|---|---|
| [INTENT-CONTEXT.md](INTENT-CONTEXT.md) | Design-engagement context: user conditions, design constraints, ethical stance, UX success criteria |
| [PILOT-STRATEGY.md](PILOT-STRATEGY.md) | Proposed strategic frame for the pilot: five-question validation state, minimum viable investigation, Phase 1 |
| [JOURNEY-STUDENT-SUBMIT.md](JOURNEY-STUDENT-SUBMIT.md) | Audit and proposed redesign of the student weekly submit flow |
| [JOURNEY-TEACHER-PUBLISH.md](JOURNEY-TEACHER-PUBLISH.md) | Audit and proposed redesign of the teacher publish flow and anonymity check |
| [JOURNEY-STUDENT-FIRSTRUN.md](JOURNEY-STUDENT-FIRSTRUN.md) | Audit of first sign-in to verified identity. **Largely historical:** it audits the name-matching/claim journey removed by decision D23; the live rule is [student-identity.md](student-identity.md) |
| [JOURNEY-TEACHER-SETUP.md](JOURNEY-TEACHER-SETUP.md) | Audit and proposed redesign of cold setup: sequencing, section readiness, and the roster-before-sign-in dependency |
| [IA-STRUCTURE.md](IA-STRUCTURE.md) | Navigation grouping, category taxonomy, labelling conventions, and Q&A archive browse/search strategy |
| [CONTENT-VOICE.md](CONTENT-VOICE.md) | Voice framework, the user/system register rule, microcopy patterns, error inventory, and label decisions |
| [../DESIGN.md](../DESIGN.md) | **The design authority.** Visual system, tokens, type registers, density split, states, breakpoints, anti-patterns |
| [CLAUDE_UI_REDESIGN_REPORT.md](CLAUDE_UI_REDESIGN_REPORT.md) | The 2026-08-05 redesign: before/after, routes, verification, unresolved issues |
| [UI-CORRECTION-LIST.md](UI-CORRECTION-LIST.md) | The second pass over the running app: prioritized hierarchy, content and colour corrections, and why the final palette was chosen |
| [UX-DESIGN-BRIEF.md](UX-DESIGN-BRIEF.md) | The earlier [Recommended] direction DESIGN.md grew out of; superseded for tokens |
| [DESIGN-RESEARCH.md](DESIGN-RESEARCH.md) | Comparable products and patterns worth borrowing |
| [ED_DISCUSSION_REFERENCE_PACK.md](ED_DISCUSSION_REFERENCE_PACK.md) | Screenshot links, visual study checklist, and product-pattern translation |
| [prompts/CLAUDE_OPUS_5_UI_IMPLEMENTATION_PROMPT.md](prompts/CLAUDE_OPUS_5_UI_IMPLEMENTATION_PROMPT.md) | **Historical:** the UI-only implementation prompt for the first visual slice; superseded as a handoff by [../CLAUDE_AUTONOMOUS_FULLSTACK_IMPLEMENTATION_PROMPT.md](../CLAUDE_AUTONOMOUS_FULLSTACK_IMPLEMENTATION_PROMPT.md) |

## Historical and proposal material

| Document | Use |
|---|---|
| [architecture-history.md](architecture-history.md) | **Historical:** the architecture alternatives weighed before the current stack was adopted, and why each was rejected. Current architecture is owned by [ARCHITECTURE.md](ARCHITECTURE.md) |

## Maintenance rules

- Keep one owning document per concept; link instead of duplicating long rules.
- Update `CURRENT_STATE.md` when a route, module, migration, or test status
  changes.
- Update `ARCHITECTURE.md` when a durable runtime or data boundary changes.
- Add or update an open decision when a choice materially changes scope,
  privacy, authorization, or deployment.
- Treat generated reference material as generated; do not hand-edit it.
- Review the relevant docs with every behavior-changing pull request.
- Keep root agent guidance compact; put architecture, workflow, and operational
  detail in the owning documents.
