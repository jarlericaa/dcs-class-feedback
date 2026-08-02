# Repository Map

**Status:** [Implemented] snapshot of the current checkout.  
**Update when:** routes, modules, migrations, test projects, or operational
commands change.

This is the fast orientation document for humans and coding agents. It is not a
second architecture document; durable runtime decisions belong in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Root

| Path | Responsibility |
|---|---|
| README.md | Human first entry point, local setup, scripts, and scope reminders |
| PROJECT_CONTEXT.md | Founding product intent, users, privacy rules, and initial build target — **not present in this checkout** |
| AGENTS.md | Compact repository rules and authority routing for coding agents |
| CLAUDE.md | Claude Code wrapper that imports AGENTS.md — **not present in this checkout**; agents should read AGENTS.md directly |
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
| src/app/teach/sections/[id]/ | Staff review, setup, matches, import, participation, publications, backlog, audit |
| src/app/api/auth/ | Auth.js callback route |
| src/app/api/internal/scheduler/ | Secret-protected scheduler tick endpoint |
| src/components/layout/ | AppShell and permission-derived navigation |
| src/components/ui/ | Shared presentational vocabulary (badge, alert, empty state) |
| src/components/student/ | Weekly form client component (preserves input on error) |
| src/components/staff/ | Template editor and roster-import client components |
| src/lib/ | Session helpers, staff-section loader, timezone-aware formatting |
| src/auth.ts | Auth.js providers, session callbacks, and identity loading |
| src/env.ts | Environment parsing and validation |
| src/db/ | Database client and Drizzle schema |
| src/db/schema/ | Tables, enums, indexes, and relations by domain |
| src/modules/authz/ | Resource-scoped, deny-by-default authorization |
| src/modules/identity/ | Account matching, roster identity, and name normalization |
| src/modules/catalog/ | Courses, sections, staff, enrollments, and catalog data |
| src/modules/forms/ | Templates, questions, cycles, recurrence schedules, validation, and submissions |
| src/modules/review/ | Staff review and validity-state mutations |
| src/modules/publishing/ | Public answer drafts, source links, and publication |
| src/modules/backlog/ | Course-level backlog foundations |
| src/modules/roster-import/ | CSV preview, reconciliation, and confirmation |
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
| Product intent and scope | PROJECT_CONTEXT.md, docs/PROJECT_OVERVIEW.md, docs/product-requirements.md, docs/mvp-scope.md |
| Current implementation | docs/CURRENT_STATE.md, source code, migrations, and tests |
| Runtime architecture | docs/ARCHITECTURE.md, docs/decisions/ |
| Local development and verification | docs/DEVELOPMENT.md, docs/TESTING.md |
| Deployment and release assumptions | docs/DEPLOYMENT.md |
| Security and privacy | docs/SECURITY.md, docs/roles-and-permissions.md, docs/public-qa-and-source-linking.md |
| Domain rules | docs/domain-model.md and the owning workflow documents |
| UI implementation | docs/WEB-APP-BUILD-PLAN.md, docs/UX-DESIGN-BRIEF.md, docs/DESIGN-RESEARCH.md |
| Agent implementation handoff | docs/prompts/CLAUDE_OPUS_5_UI_IMPLEMENTATION_PROMPT.md and docs/ED_DISCUSSION_REFERENCE_PACK.md |
| Navigation and ownership | docs/INDEX.md and docs/DOCUMENT_MANIFEST.yaml |

## Authority reminders

1. Source code, migrations, tests, and configuration are authoritative for
   implemented behavior.
2. CURRENT_STATE.md records what exists; build plans and UX docs describe
   intended next work.
3. Product/domain documents own privacy, role, workflow, and scope rules.
4. PROJECT_CONTEXT.md records founding intent and unresolved questions; it must
   not become a duplicate current-state document.
5. Significant long-lived technical choices belong in docs/decisions/.
