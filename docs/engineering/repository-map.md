# Repository Map

**Status:** [Implemented] snapshot of the current checkout.  
**Update when:** routes, modules, migrations, test projects, or operational
commands change.

This is the fast orientation document for humans and coding agents. It is not a
second architecture document; durable runtime decisions belong in
[architecture.md](architecture.md).

## Root

| Path | Responsibility |
|---|---|
| README.md | Human first entry point, local setup, scripts, and scope reminders |
| AGENTS.md | Compact repository rules and authority routing for coding agents |
| CLAUDE.md | Claude Code wrapper that imports AGENTS.md (`@AGENTS.md`). It adds nothing of its own; AGENTS.md governs |
| DESIGN.md | The design authority: visual system, tokens, type registers, states, breakpoints, anti-patterns |
| PRODUCT.md | Product brief: who it serves, the confirmed principles, and the evidence on hand |
| package.json | Scripts and dependency contract |
| .env.example | Environment-variable names and local configuration shape |
| docker-compose.yml | Development and test PostgreSQL services |
| drizzle.config.ts | Drizzle migration/schema configuration |
| vitest.config.ts | Unit and integration test projects |

## Application code

| Path | Responsibility |
|---|---|
| src/app/ | Next.js App Router pages and route handlers |
| src/app/globals.css | Design system: tokens, shell, components, responsive rules |
| src/app/signin/ | Google OAuth and local-only development sign-in surface |
| src/app/page.tsx | Authenticated role-aware dashboard |
| src/app/admin/ | Platform-admin accounts and teacher-role grants |
| src/app/actions/ | Shared server actions (sign-out) |
| src/app/sections/[id]/ | Student section home, history, and Q&A archive |
| src/app/teach/courses/ | Course/section creation and template authoring |
| src/app/teach/sections/[id]/ | Staff review, setup, roster, import, participation, publications, backlog, audit |
| src/app/api/auth/ | Auth.js callback route |
| src/app/api/internal/scheduler/ | Secret-protected scheduler tick endpoint |
| src/app/favicon.ico/ | Cacheable repository-native application icon route |
| src/components/layout/ | AppShell and permission-derived navigation |
| src/components/ui/ | Shared presentational vocabulary (badge, alert, empty state) |
| src/components/student/ | Weekly form client component (preserves input on error) |
| src/components/staff/ | Template editor, roster import, and field-preserving public-answer composer client components |
| src/lib/ | Session helpers, staff-section loader, timezone-aware formatting |
| src/auth.ts | Auth.js providers, session callbacks, and identity loading |
| src/env.ts | Environment parsing and validation |
| src/db/ | Database client and Drizzle schema |
| src/db/schema/ | Tables, enums, indexes, and relations by domain |
| src/modules/authz/ | Resource-scoped, deny-by-default authorization |
| src/modules/identity/ | Email normalization and the domain allow-list — the rule that resolves an account to a student |
| src/modules/catalog/ | Courses, sections, staff, enrollments, and catalog data |
| src/modules/forms/ | Templates, questions, cycles, recurrence schedules, validation, and submissions |
| src/modules/review/ | Staff review and validity-state mutations |
| src/modules/publishing/ | Public answer drafts, source links, and publication |
| src/modules/backlog/ | Course-level backlog foundations |
| src/modules/roster-import/ | CSV/XLSX parsing, the import plan, the audited commit, and the outcome read model |
| src/modules/participation/ | Derived participation and export foundations |
| src/modules/scheduling/ | Reconciliation poller and scheduled transitions |
| src/modules/audit/ | Append-only audit event writes and section-scoped browsing |

## Scripts and persistence

| Path | Responsibility |
|---|---|
| scripts/ | TypeScript/tsx local operational scripts, including seeding and scheduling |
| drizzle/ | Versioned SQL migrations |
| tests/ | Unit, integration, fixture, and authorization coverage |

## Documentation topology

| Area | Owning documents |
|---|---|
| Product intent and scope | **docs/product/specification.md (the acceptance target)**, docs/product/overview.md, docs/product/requirements.md, docs/product/scope.md |
| Domain rules | docs/domain/ — domain/domain-model.md plus one document per workflow |
| Current implementation | docs/engineering/current-state.md, source code, migrations, and tests |
| Runtime architecture | docs/engineering/architecture.md, docs/decisions/ |
| Local development and verification | docs/engineering/development.md, docs/engineering/testing.md |
| Deployment and release assumptions | docs/engineering/deployment.md |
| Security and privacy | docs/engineering/security.md, docs/domain/roles-and-permissions.md, docs/domain/public-qa.md |
| UI implementation | **DESIGN.md** (design authority), docs/design/ for UX context, IA, voice and the journeys, and docs/roadmap/web-app-build-plan.md for the build sequence |
| Decisions | docs/decisions/ — the ADRs, plus decisions/open-decisions.md, which must be read before implementation work |
| Navigation and ownership | docs/README.md |

## Authority reminders

1. Source code, migrations, tests, and configuration are authoritative for
   implemented behavior.
2. docs/engineering/current-state.md records what exists; build plans and UX
   docs describe intended next work.
3. Product/domain documents own privacy, role, workflow, and scope rules.
4. Significant long-lived technical choices belong in docs/decisions/.
