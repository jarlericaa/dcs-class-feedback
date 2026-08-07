# Claude Opus 5 UI Implementation Handoff

> ## ⚠ HISTORICAL — describes the removed account-matching flow
>
> This document is a **dated, point-in-time record**, not a specification to
> build from. It was written while student identity worked by matching Google
> display names against roster names, with a `/claim` page and teacher
> confirmation of suggested matches.
>
> **That whole workflow was removed on 2026-08-07.** Student access is now exact
> normalized UP-email matching against the teacher-uploaded class list. Anything
> below about account matches, match candidates, claiming, or confirming a
> student is history — **do not rebuild it.** The current rule is
> [student-identity.md](student-identity.md).


This is the handoff checklist for having Claude Code implement the Class
Feedback UI. Use Claude as the implementation agent; this repository is the
source of truth.

## How to start Claude

Launch Claude Code from the repository root. Give it the entire repository,
not only screenshots or a prompt. Then paste or reference:

~~~text
Read and follow docs/prompts/CLAUDE_OPUS_5_UI_IMPLEMENTATION_PROMPT.md.
Before editing, also read docs/CLAUDE_UI_SCREEN_SPEC.md and
docs/ED_DISCUSSION_REFERENCE_PACK.md. Treat the current working-tree UI as a
provisional draft: inspect it, keep useful behavior, and replace weak visual
decisions. Implement the UI in this repository, preserve domain behavior and
privacy rules, and finish with the required checks and screenshots/manual QA.
~~~

If Claude is given a repository archive rather than a live checkout, include
the complete source tree and these documents. Do not send only the docs folder;
the route files, domain services, schema, migrations, and tests are needed to
avoid inventing behavior.

## Required context files

Give Claude these files or make them available in the checkout:

### Repository rules and current truth

1. AGENTS.md
2. CLAUDE.md
3. PROJECT_CONTEXT.md
4. docs/INDEX.md
5. docs/CURRENT_STATE.md
6. docs/REPOSITORY_MAP.md
7. docs/DEVELOPMENT.md
8. docs/TESTING.md
9. docs/SECURITY.md

### Product and privacy rules

10. docs/product-requirements.md
11. docs/mvp-scope.md
12. docs/roles-and-permissions.md
13. docs/weekly-form-workflow.md
14. docs/public-qa-and-source-linking.md
15. docs/participation-rules.md
16. docs/student-identity.md
17. docs/SPEC-RECONCILIATION.md
18. docs/open-decisions.md

### UI and research handoff

19. docs/CLAUDE_UI_SCREEN_SPEC.md
20. docs/UX-DESIGN-BRIEF.md
21. docs/DESIGN-RESEARCH.md
22. docs/ED_DISCUSSION_REFERENCE_PACK.md
23. docs/WEB-APP-BUILD-PLAN.md
24. docs/prompts/CLAUDE_OPUS_5_UI_IMPLEMENTATION_PROMPT.md

The deep research report has already been distilled into the product,
privacy, design-research, reference-pack, and spec-reconciliation documents.
Give Claude the original report as optional background only; the repository
documents above are the curated implementation context and should be treated
as the actionable source.

## Source areas Claude must inspect

Before changing markup or CSS, Claude must inspect:

- all current route files under src/app/;
- src/modules/authz/ and authentication files;
- src/modules/review/;
- src/modules/publishing/;
- src/modules/identity/;
- src/modules/roster-import/;
- src/db/schema.ts and relevant migrations;
- existing test setup and package scripts.

The UI must consume existing authorized data and server actions. Do not move
authorization, validation, publishing, transactions, or audit writes into
presentational components.

## What “one-to-one” means here

The target is one-to-one fidelity to the agreed interaction patterns and
screen hierarchy, not a literal proprietary clone. Claude should reproduce:

- course/section context;
- role-aware navigation;
- category/filter/search placement;
- compact queue/list rows;
- selected-item/detail relationship;
- state markers and attention cues;
- attached response composer;
- explicit visibility/anonymity language.

Claude must create an original Class Feedback visual identity using the
warm-neutral/campus-green tokens. It must not copy Ed Discussion logos,
assets, exact copy, source code, or brand identity.

## Mandatory implementation checkpoints

Claude should stop after each checkpoint and report files, behavior, and
screenshots before proceeding:

1. Foundation: tokens, typography, shell, navigation, responsive behavior.
2. Student: sign-in, dashboard, weekly form, submitted state, history,
   section Q&A archive.
3. Staff: review queue/detail, private/public separation, anonymity check,
   matches, roster import.
4. Verification: desktop/mobile screenshot pass, keyboard/focus pass,
   privacy-content pass, lint/typecheck/tests/build.

If a product rule or data shape blocks a screen, Claude must stop and report
the blocker rather than fabricate data or silently change the specification.

## Required screenshots from Claude

Use seeded/dev data only and do not include real student information. Capture
or manually inspect at least:

1. sign-in desktop and phone;
2. student dashboard with open and submitted section cards;
3. open weekly form at phone width;
4. immutable submitted confirmation;
5. student history with private and published-answer states;
6. populated Q&A archive desktop;
7. Q&A no-results/empty state phone;
8. teacher review queue/detail desktop;
9. teacher public-answer anonymity warning;
10. the section class list and its UP-email link status;
11. roster-import preview with errors and deactivation warning;
12. mobile shell/navigation.

Screenshots are for QA evidence, not production assets. If screenshot tooling
is unavailable, Claude must provide a route-by-route manual verification table
with viewport, expected hierarchy, and observed result.

## Required final report from Claude

Claude must finish with:

- changed files and why;
- routes implemented;
- reusable components/styles created;
- Ed-inspired patterns translated;
- patterns intentionally excluded;
- privacy/security checks performed;
- exact results of npm run lint, npm run typecheck, npm test, and npm run build;
- integration-test result, including any PostgreSQL/Docker blocker;
- any spec/schema changes;
- owner questions that genuinely remain.

## Do not let Claude do these things

- Do not add AI features in this UI pass.
- Do not add comments, threads, reactions, voting, attachments, notifications,
  unpublishing, public internet access, or course-material management.
- Do not reveal source identity, staff notes, validity reasons, or review
  metadata to students.
- Do not show fake analytics or hard-coded activity counts.
- Do not bypass auth or authorization for screenshots.
- Do not add a second API layer or new database schema solely for styling.
- Do not treat external Ed screenshots as production assets.
