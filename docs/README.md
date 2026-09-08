# Documentation

The documentation is grouped by the question it answers, so that product
intent, domain rules, implementation facts, design work, and decisions cannot
silently contradict one another. **One document owns each concept**; the others
link to it rather than restating it.

| Folder | Answers |
|---|---|
| [product/](product/) | What we are building and for whom, and where the scope boundary is |
| [domain/](domain/) | The rules of the product: entities, states, permissions, and each workflow |
| [engineering/](engineering/) | How the running application is built, tested, deployed, and kept safe |
| [design/](design/) | UX context, information architecture, voice, and the user journeys |
| [decisions/](decisions/) | ADRs for settled technical choices, plus the open-decision register |
| [roadmap/](roadmap/) | Plans for work not yet done |

## Read this first

1. [product/overview.md](product/overview.md) — product and user-workflow summary.
2. [engineering/current-state.md](engineering/current-state.md) — what the
   repository actually has now, route by route.
3. [engineering/development.md](engineering/development.md) — local setup and
   verification commands.
4. [../DESIGN.md](../DESIGN.md) — the design authority: visual system, tokens,
   type registers, states, breakpoints, and forbidden patterns.
5. [decisions/open-decisions.md](decisions/open-decisions.md) — **read before
   implementation work.** An item marked "wait for owner approval" must be
   surfaced, not guessed.

[../AGENTS.md](../AGENTS.md) is the root guide for humans and coding agents;
`CLAUDE.md` only imports it.

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
- **[Open]** — unresolved; see [decisions/open-decisions.md](decisions/open-decisions.md).
- **[Deferred]** — intentionally outside the current build slice.

## product/ — intent and scope

| Document | Owns |
|---|---|
| [specification.md](product/specification.md) | **The acceptance target** — owner-approved 2026-08-03. Where an older document conflicts, this one wins |
| [requirements.md](product/requirements.md) | Goals, requirements, risks, and non-goals |
| [scope.md](product/scope.md) | MVP, post-MVP, and out-of-scope boundaries |
| [overview.md](product/overview.md) | Product and user-workflow summary |
| [pilot-strategy.md](product/pilot-strategy.md) | **[Recommended]** strategic frame for the pilot semester |
| [product/ai-future-plan.md](product/ai-future-plan.md) | Post-MVP AI direction and its hard constraints |

## domain/ — the rules of the product

| Document | Owns |
|---|---|
| [domain/domain-model.md](domain/domain-model.md) | Entities, relationships, every state dimension, and the audit-event shape |
| [domain/roles-and-permissions.md](domain/roles-and-permissions.md) | Roles, resource scope, the two staff standing tiers, and the TA capability catalog |
| [domain/student-identity.md](domain/student-identity.md) | SSO, exact UP-email student access, class-list import, and identity safety |
| [forms-and-audiences.md](domain/forms-and-audiences.md) | Course-level forms, audiences, the four delivery modes, and per-occurrence customization |
| [form-workflow.md](domain/form-workflow.md) | Question schema and types, validation, and the submission flow |
| [participation.md](domain/participation.md) | Validity, participation derivation, and the CSV exports |
| [public-qa.md](domain/public-qa.md) | Private and public responses, rewording, source links, anonymity, and the archive |
| [domain/question-backlog.md](domain/question-backlog.md) | Course-level backlog lifecycle |
| [domain/legacy-question-import.md](domain/legacy-question-import.md) | Historical import and provenance |

## engineering/ — the running application

| Document | Owns |
|---|---|
| [architecture.md](engineering/architecture.md) | Current runtime architecture and module boundaries |
| [current-state.md](engineering/current-state.md) | Implemented, partial, and missing surfaces |
| [repository-map.md](engineering/repository-map.md) | Fast map of code, scripts, persistence, and docs |
| [development.md](engineering/development.md) | Setup, environment, scripts, and verification |
| [testing.md](engineering/testing.md) | Test layers, invariants, and coverage gaps |
| [deployment.md](engineering/deployment.md) | Deployment, pilot readiness, release, and recovery assumptions |
| [security.md](engineering/security.md) | Privacy invariants, threat model, and release checks |
| [engineering/architecture-history.md](engineering/architecture-history.md) | **Historical:** the alternatives weighed before the current stack, and why each was rejected |

## design/ — experience and interface

| Document | Owns |
|---|---|
| [../DESIGN.md](../DESIGN.md) | **The design authority.** Visual system, tokens, type registers, density split, states, breakpoints, anti-patterns |
| [context.md](design/context.md) | Design-engagement context: user conditions, design constraints, ethical stance, UX success criteria |
| [information-architecture.md](design/information-architecture.md) | Navigation grouping, category taxonomy, labelling conventions, and archive browse/search strategy |
| [content-voice.md](design/content-voice.md) | Voice framework, the user/system register rule, microcopy patterns, and the error inventory |
| [research.md](design/research.md) | Comparable products and the patterns worth borrowing |
| [journeys/student-first-run.md](design/journeys/student-first-run.md) | First sign-in to being able to submit |
| [journeys/student-submit.md](design/journeys/student-submit.md) | The student weekly submit flow |
| [journeys/teacher-setup.md](design/journeys/teacher-setup.md) | Cold setup: sequencing, section readiness, the roster-before-sign-in dependency |
| [journeys/teacher-publish.md](design/journeys/teacher-publish.md) | The teacher publish flow and the anonymity check |

## decisions/ and roadmap/

| Document | Owns |
|---|---|
| [decisions/open-decisions.md](decisions/open-decisions.md) | Every unresolved product, privacy, and operational choice |
| [decisions/](decisions/) | ADRs for durable technical choices |
| [roadmap/implementation-plan.md](roadmap/implementation-plan.md) | The working plan for the open issue set |
| [roadmap/web-app-build-plan.md](roadmap/web-app-build-plan.md) | **[Recommended]** UI information architecture and build slices |

## Maintenance rules

- Keep one owning document per concept; link instead of duplicating long rules.
- Update `engineering/current-state.md` when a route, module, migration, or
  test status changes.
- Update `engineering/architecture.md` when a durable runtime or data boundary
  changes.
- Add or update an open decision when a choice materially changes scope,
  privacy, authorization, or deployment.
- Review the relevant docs with every behavior-changing pull request.
- Keep root guidance compact; put architecture, workflow, and operational
  detail in the owning documents.
- Do not commit point-in-time reports. A dated record of one pass drifts and
  then misleads; fold what is still true into the owning document instead.
