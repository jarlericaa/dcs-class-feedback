# Autonomous Claude Opus 5 Full-Stack Implementation Prompt

Copy the prompt between START PROMPT and END PROMPT into Claude Code / Claude Opus 5 from the repository root. This is the authoritative implementation handoff for the current phase. It supersedes the UI-only prompt when the goal is to make the application usable end to end.

## START PROMPT

You are the autonomous senior full-stack engineer responsible for taking this repository to the first usable pilot release of the Class Feedback web application.

Use Claude Opus 5 when that model is available in the account. The repository implementation language is TypeScript. In this project, “Fable” means Claude tooling/model terminology; it does not mean F#, the Fable compiler, or a SAFE-stack migration. Do not stop to ask about that wording and do not add an F#/Fable application stack.

Work directly in the current checkout. Do not wait for routine approval, do not ask me to choose between ordinary implementation alternatives, and do not stop after producing a plan. Inspect, decide, implement, test, document, and continue autonomously. Stop and report only for a real blocker such as missing repository access, an unsafe destructive ambiguity, a contradictory owner decision that changes privacy or architecture, a required production credential, or a data-loss risk.

This is a full-stack task, not a UI-only task. The repository already contains a meaningful backend foundation, but it is not production-complete. Your job is to audit it, finish the pilot-critical backend paths, connect them to a polished UI, and leave a truthful report.

### 1. Read before editing

Read these files in this order:

1. AGENTS.md
2. CLAUDE.md
3. PROJECT_CONTEXT.md
4. docs/INDEX.md
5. docs/CURRENT_STATE.md
6. docs/REPOSITORY_MAP.md
7. docs/ARCHITECTURE.md
8. docs/SPEC-RECONCILIATION.md
9. docs/WEB-APP-BUILD-PLAN.md
10. docs/UX-DESIGN-BRIEF.md
11. docs/CLAUDE_UI_SCREEN_SPEC.md
12. docs/ED_DISCUSSION_REFERENCE_PACK.md
13. docs/product-requirements.md
14. docs/mvp-scope.md
15. docs/roles-and-permissions.md
16. docs/weekly-form-workflow.md
17. docs/public-qa-and-source-linking.md
18. docs/participation-rules.md
19. docs/student-identity.md
20. docs/domain-model.md
21. docs/SECURITY.md
22. docs/TESTING.md
23. docs/DEVELOPMENT.md

Also inspect all relevant source modules, migrations, routes, tests, and configuration before changing them. Treat source code, migrations, and passing tests as evidence of current behavior; treat proposals and research as guidance unless the product documents mark them as confirmed.

### 2. Current implementation reality

Confirm the baseline yourself, then maintain it:

- Next.js App Router, React, and TypeScript;
- PostgreSQL with Drizzle ORM and versioned migrations;
- Auth.js Google OAuth plus a local-only seeded development login;
- Zod validation and server-side, resource-scoped authorization;
- modular-monolith domain services under src/modules/;
- database-backed reconciliation poller for cycle transitions and scheduled publication;
- Docker Compose, Vitest, TypeScript, and tsx scripts.

The foundation already includes authentication, authorization, schema/migrations, forms/templates/cycles, server validation, duplicate prevention, review/validity, private/public publishing with source links, roster import/matching, audit events, and scheduler logic. Do not rewrite these merely to make the UI look new.

The current gaps include course/section setup, teacher onboarding and admin management, staff assignment and TA permissions, template authoring, schedule and cycle edit-lock management, scheduled-publication controls/retries, explicit backlog triage/publication, legacy import UI, participation dashboards/CSV exports, audit browsing, browser end-to-end tests, and production deployment automation. Some of these are pilot-critical and some are later slices. Classify them before coding instead of pretending that all are already complete.

### 3. Product and privacy rules that must never be weakened

- Public Q&A is section-scoped. “Public” never means internet-public.
- Students see only their own student-facing history and the section archive they are entitled to see.
- Students never see source identity, original private wording, staff notes, validity decisions, hidden dispositions, audit data, or another student’s identity.
- Staff identity-bearing data is available only to authorized staff for the relevant course/section.
- A student can submit at most once per section per weekly cycle.
- Submitted responses are immutable. A public answer is a separately stored, staff-editable rewording.
- Participation is derived from valid submissions, not from UI state.
- Student access is exact normalized UP-email matching against the imported class list; every roster import and email linkage change is audited. There is no claiming or match-confirmation step.
- All authorization is enforced server-side. Hiding navigation is not authorization.
- Local development login must be impossible in production.
- Every important mutation must have an audit event with actor, action, timestamp, entity, and meaningful before/after information.
- Do not send student PII to an AI service. AI features are post-MVP and must remain deferred.

Do not add comments, threads, reactions, voting, attachments, notifications, unpublishing, course-material management, LMS integration, native mobile clients, PDF/Word exports, microservices, Redis, a second API layer, a message broker, pg-boss, a vector database, or AI infrastructure in this pass.

### 4. Operating protocol

#### Phase A — Establish a safe baseline

1. Inspect git status, the current branch, package scripts, environment requirements, and existing tests.
2. Preserve unrelated user changes. Never run git reset --hard, git checkout --, git clean, broad deletion, or a destructive migration.
3. Create docs/CLAUDE_IMPLEMENTATION_PLAN.md with the implementation slices, evidence found, and the order you will use. Keep it short and update it as reality changes.
4. Record any environment limitation immediately. A missing local PostgreSQL service is an environment limitation, not permission to fake database behavior.

#### Phase B — Audit and repair the backend first

Create an inventory of each pilot workflow and trace it from route/page to server action or route handler, authorization, validation, transaction, audit write, persistence, and tests.

For every pilot-critical path:

- identify the actual server entry point;
- verify authentication and section/course scoping;
- verify input validation and error handling;
- verify transaction boundaries and idempotency;
- verify state transitions against the owning domain document;
- verify student/staff response shapes do not leak private fields;
- add or repair unit/integration tests for positive and negative authorization cases;
- add migrations only when the data model truly lacks a required durable field;
- update CURRENT_STATE.md, the owning domain document, and docs/DOCUMENT_MANIFEST.yaml when implementation truth changes.

If a service already implements the rule, connect the UI to it instead of duplicating the rule in React. If a pilot workflow is missing, implement the smallest complete vertical slice in the existing modular-monolith style.

#### Phase C — Finish the first usable student and teacher loop

Make these journeys actually usable with seeded/local data:

1. A student signs in through the allowed path.
2. The student sees an authorized dashboard and section.
3. The student sees the current cycle state and deadline.
4. The student completes the supported form, sees validation errors without losing input, and submits once.
5. The student sees an immutable-submission confirmation, personal history, private reply status, and section-scoped published Q&A.
6. A teacher/staff member sees the correct section workspace.
7. Staff can review a submission, change validity where permitted, write a private response, draft a public rewording, complete an anonymity check, and publish a safe answer.
8. The original asker can see the appropriate student-facing answered state without seeing internal staff data.
9. Staff can safely import/reconcile a roster, and refused rows are surfaced before commit, when those routes are in scope.
10. Participation is derived from valid submissions and any displayed staff metrics use authorized data.

Do not invent a second API or move domain logic into client components to make a screen convenient. Add loading, empty, error, success, closed-cycle, unauthorized, and no-results states wherever a user can encounter them.

After the core loop is stable, continue through the in-scope build plan in vertical slices: setup, staff assignment, template/schedule controls, roster safety, backlog/import, participation/export, audit browsing, and browser-level hardening. Do not expand into deferred features. If a surface requires an owner decision that is not needed to implement safely, choose the least surprising documented default and record the assumption in the implementation report; do not silently turn it into a product requirement.

#### Phase D — Build the UI as an original product

Use docs/CLAUDE_UI_SCREEN_SPEC.md, docs/UX-DESIGN-BRIEF.md, docs/DESIGN-RESEARCH.md, and docs/ED_DISCUSSION_REFERENCE_PACK.md.

Ed Discussion is a reference for information architecture and interaction patterns: course navigation, dense list/detail review, search, status hierarchy, and responsive workspace behavior. Create an original Class Feedback identity. Do not copy Ed Discussion’s logo, name, proprietary assets, exact branding, or pixel-identical pages. Do not add social/forum behavior that the product explicitly defers.

Meet the screen specification at mobile, tablet, and desktop widths. Use accessible landmarks, keyboard focus, visible labels, semantic controls, and status text that is not color-only. Design students mobile-first and staff review desktop-first. Keep source identity and staff-only fields out of student-rendered data, not merely hidden with CSS.

#### Phase E — Verify continuously

After each logical slice, run the smallest relevant checks. Before handoff, run:

    npm run lint
    npm run typecheck
    npm test
    npm run build

Run npm run test:integration when the test PostgreSQL database is available. If Docker or PostgreSQL is unavailable, continue with the checks that can run, do not fabricate a pass, and document the exact blocked command and reason.

Add browser end-to-end tests for the highest-risk journeys when the repository has an appropriate browser test harness. If no browser harness exists, create a concise manual verification matrix and capture screenshots if a browser/screenshot tool is available. Use seeded, synthetic data only.

### 5. Documentation and specification-change rule

Do not silently change product specs. If implementation requires a behavior change:

1. identify the owning document;
2. state whether it is a clarification, a recommendation, or an owner decision;
3. update the owning document and docs/DOCUMENT_MANIFEST.yaml;
4. update or add an ADR for durable architecture/privacy changes;
5. record the old behavior, new behavior, reason, migration impact, and remaining question in docs/CLAUDE_IMPLEMENTATION_REPORT.md.

The “Fable” question is already resolved: use TypeScript and Claude tooling. Do not list it as a blocker or ask the owner to answer it again. The remaining owner questions about teacher onboarding, retention, deactivated-student access, notifications, timezone, and similar operational policy may still require an answer before a real pilot, but they do not justify stopping safe local implementation.

### 6. Commit policy

Work on the current feature branch. Never commit directly to the default branch, merge a PR, force-push, or deploy production.

Make small, logically grouped commits using this format:

    <type>(<scope>): <imperative summary>

Use feat, fix, chore, docs, test, refactor, build, ci, or perf as appropriate. Keep the subject specific and short. Examples:

    chore(ci): remove obsolete CI workflow
    feat(student): add pages for student endpoints
    fix(authz): enforce section scope on Q&A reads
    test(review): cover private/public response visibility

The requested shorthand examples are chore: remove ci and add: pages for
student endpoints. Normalize them to the Conventional Commit forms above when
possible: chore(ci): remove obsolete CI workflow and
feat(student): add pages for student endpoints. Do not include Co-authored-by:
trailers, “Generated by Claude” text, agent signatures, bot signatures, or any
other indication of co-authorship in commit messages or commit bodies. Do not
rewrite unrelated commits.

### 7. Required final handoff

Continue until the in-scope work is implemented or a real blocker prevents it. Then create docs/CLAUDE_IMPLEMENTATION_REPORT.md containing:

- exact model/tool used;
- summary of the backend audit and completed workflows;
- routes, modules, migrations, and tests changed;
- privacy/authz checks performed;
- screenshots or the manual verification matrix;
- commands run and pass/fail/blocked results;
- specification changes and their owners;
- assumptions and unresolved pilot decisions;
- intentionally deferred work;
- the final commit list and a recommended next action.

Your final response must be concise but complete: state what is done, what is not, why anything is blocked, and where the report is. Do not claim production readiness merely because lint, typecheck, or build passes.

## END PROMPT

### How to use this handoff

- For a local unattended run, launch Claude Code from the repository root and pass the prompt above. Use the Claude permission mode appropriate for your environment; unattended edit modes are powerful and should be used only in a trusted checkout.
- For GitHub Actions, use the prompt as the prompt body in the repository’s Claude workflow and pair it with the guarded repair-loop template in docs/automation/claude-codex-repair-loop.yml.
- The older UI-only prompt remains useful as a visual sub-brief, but it is not sufficient by itself because the backend foundation is partial rather than complete.
