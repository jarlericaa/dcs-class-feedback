# Claude Opus 5 Implementation Prompt — Ed Discussion-Inspired UI

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
> [student-identity.md](../student-identity.md).


Copy the prompt below into Claude Code / Claude Opus 5 from the repository root.
The companion visual pack is [ED_DISCUSSION_REFERENCE_PACK.md](../ED_DISCUSSION_REFERENCE_PACK.md).

---

## BEGIN PROMPT

You are the lead product designer and senior frontend engineer for the Class
Feedback Platform. Work directly in this existing repository. Do not stop at a
design critique: inspect the code, make the UI changes, run the checks, and
leave the repository in a working state.

### Product and repository context

This is a university-only web app that replaces a Google Forms plus manually
compiled answer-document workflow:

- Students submit one structured weekly feedback form per class section and
  cycle.
- Students can add one question, concern, clarification, suggestion, or
  feedback item.
- Teachers and authorized teaching assistants review submissions.
- Staff can respond privately to the asker, or draft/reword and publish a safe
  anonymous answer to the enrolled class.
- Public Q&A is section-scoped. “Public” never means internet-public.
- The original student wording and source identity remain private and internally
  linked. Public wording is a separate editable value.

This is an existing application, not a blank scaffold. The current baseline is:

- Next.js App Router
- React and TypeScript
- PostgreSQL with Drizzle ORM
- Auth.js with Google OAuth and a local-only development login
- Zod validation
- modular-monolith domain services under src/modules/
- database-backed reconciliation poller for cycle transitions and scheduled
  publication
- Vitest tests and Docker Compose for local PostgreSQL

Do not replace this stack. Do not add a second API layer just to style the
pages. Read the source and existing server actions/domain services before
changing behavior.

### Read these files before editing

Read all of these in this order:

1. AGENTS.md
2. CLAUDE.md
3. PROJECT_CONTEXT.md
4. docs/INDEX.md
5. docs/CURRENT_STATE.md
6. docs/WEB-APP-BUILD-PLAN.md
7. docs/UX-DESIGN-BRIEF.md
8. docs/DESIGN-RESEARCH.md
9. docs/ARCHITECTURE.md
10. the owning domain documents and source files for each route you change

Also inspect the current routes under src/app/ and the current data-loading
and mutation paths under src/modules/. Preserve the current route behavior and
server-side authorization.

### The visual target

Build an original Class Feedback visual system with the information
architecture of a mature course Q&A workspace. Use Ed Discussion as the
primary interaction reference:

- a clear course/section context;
- role-aware navigation;
- categories or useful topic groupings;
- a searchable, filterable queue or archive;
- compact but readable list rows;
- a selected item/detail view;
- obvious unread, pending, answered, pinned, and attention states;
- a low-friction composer;
- visible privacy/visibility cues next to actions.

The result should feel familiar to someone who knows Ed Discussion, but it
must not be a pixel-for-pixel clone. Do not copy Ed Discussion logos, brand
colors, illustrations, proprietary copy, exact assets, or source code. Do not
ship the reference screenshots. Translate the useful interaction patterns into
an original university feedback product.

Use the current design direction:

- calm academic operations workspace;
- warm neutral canvas: #F5F7F2;
- white surfaces: #FFFFFF;
- deep ink: #17231C;
- muted ink: #607067;
- border: #DCE5DD;
- primary campus green: #167A58;
- soft green: #DFF1E6;
- attention amber: #A96512;
- soft amber: #FFF0D8;
- danger: #B54747;
- restrained shadows, mostly flat surfaces, generous whitespace;
- one legible sans-serif/system font stack;
- sentence case and concrete action labels.

Do not make this look like a generic AI dashboard. Do not add purple
gradients, glassmorphism, floating blobs, decorative analytics, or a social
feed aesthetic.

### Hard product and privacy constraints

These are not optional UI details:

- Public Q&A is visible only to enrolled students and authorized staff in the
  section.
- Never show the source student’s identity in the student Q&A archive.
- Never show staff notes, internal validity decisions, hidden “won’t answer”
  decisions, audit data, or review metadata to students.
- Preserve original student wording as read-only. Public rewording must be a
  separate field.
- Show a plain-language visibility explanation immediately beside private,
  public, and publish actions.
- A student submission is immutable after submission. Do not render an edit
  affordance after successful submit.
- Participation is based on valid submissions. Do not invent counters in the
  UI or expose staff-only participation totals to students.
- Server-side authorization remains authoritative. Hiding a link is not a
  security control.
- Keep the local dev-login fallback strictly local-only and impossible to
  enable in production.

### Scope for this implementation pass

Implement the first polished vertical slice in this order.

#### 1. Shared shell and visual foundation

Create a small reusable UI vocabulary rather than page-specific one-off
markup. Use existing dependencies where possible; do not add a UI framework
without a concrete reason.

At minimum, establish:

- AppShell
- desktop Sidebar
- mobile header/drawer
- workspace or section switcher
- page header and breadcrumbs
- primary/secondary/quiet/danger buttons
- text inputs, search input, select, textarea, checkbox
- status badge with text and icon
- card/panel/list-row primitives
- alert, empty, error, success, loading, and skeleton states
- accessible focus treatment

Use CSS Modules, a small global stylesheet, or the project’s existing styling
approach. Do not turn the app into one giant inline-style object. Keep
components composable and typed.

The shell must visibly distinguish student and staff workspaces. Do not show
future routes as a long list of disabled menu items. Show only usable
destinations and, where necessary, one restrained “coming later” note.

#### 2. Student workspace

Polish these existing routes:

- /signin
- /
- /sections/[id]
- /sections/[id]/history
- /sections/[id]/qa

Student experience requirements:

- /signin is calm and trustworthy, with university sign-in, a concise
  explanation of who can access the app, and a local-dev-only sign-in state
  that is clearly not production behavior.
- / shows the student’s sections as useful cards, each with the next action:
  complete, submitted, closed, or view Q&A.
- /sections/[id] shows course/section identity, the current cycle state,
  deadline, completion status, and a focused form.
- Use generous single-column spacing for the actual form. Question labels,
  descriptions, required markers, helper text, and inline errors must be
  obvious.
- Make the student-originated question area visually distinct. Explain that
  staff may answer privately or reword it before publishing to the class.
- After successful submission, show a clear immutable confirmation and links
  to history and the section Q&A archive.
- /sections/[id]/history should feel like a calm timeline/list of the
  student’s own submissions, private replies, and published-answer status.
  Use neutral copy; do not say “the teacher ignored this” or reveal internal
  decisions.
- /sections/[id]/qa should feel like a course knowledge archive:
  search, category/topic filters if data supports them, list rows/cards, a
  selected entry/detail state, published date, and useful empty/no-result
  states. Never reveal the source student.

Use Ed Discussion’s course context and list/detail ergonomics as inspiration,
but keep the student form more focused than a discussion forum.

#### 3. Teacher / teaching-assistant workspace

Polish:

- /teach/sections/[id]/review
- /teach/sections/[id]/matches
- /teach/sections/[id]/import

The primary staff review screen should use a desktop-first workspace:

- persistent left section navigation;
- compact attention summary at the top;
- filter bar and queue counts above the review list;
- selected submission/item detail in the main panel;
- response composer attached to the selected item;
- responsive collapse to stacked panels on smaller widths.

The review queue should feel like an inbox, not a raw spreadsheet. Include
clear states for new, under review, answered, invalid, and backlog candidate
when the existing data supports them. Do not fabricate data solely to make a
dashboard look busy.

The selected item must visibly separate:

1. original student wording, read-only and identity-bearing for authorized
   staff;
2. private response, visible only to the asker and authorized staff;
3. public wording, editable and intended for the enrolled class;
4. public answer, editable before publication;
5. publication visibility and anonymity review.

Before publication, show a compact but prominent warning such as:

“This will be visible to students in this section. The original wording stays
private, but specific details can still identify the asker. Review the public
wording before publishing.”

The warning must be near the publish action, not buried in a tooltip. Keep the
existing action semantics and audit behavior. Do not add unpublishing,
comments, voting, reactions, attachments, notifications, or AI.

The matches and import pages should use the same shell, typography, cards,
alerts, tables/list rows, and permission cues. Preserve their current
workflows; improve their usability and hierarchy rather than rewriting their
business logic.

### Reference pack workflow

Read docs/ED_DISCUSSION_REFERENCE_PACK.md. If browser/image access is
available, inspect the linked screenshots and pages before settling the final
layout. Use the references to answer:

- How does a course workspace establish context?
- How do list rows communicate unread/resolved/pinned/answered state?
- How does a selected question remain visually connected to the queue?
- Where does a composer live?
- How are categories, search, and filters exposed?
- How is anonymity explained to a student and to staff?
- Which patterns should be excluded because they conflict with this product’s
  scope?

Use the screenshot pack as a visual study, not as production assets. If a
reference page is unavailable, continue with the written screen requirements
and the local UX brief.

### Implementation rules

- Prefer server components for read-only pages and small client components for
  interactions that truly need browser state.
- Reuse the current server actions and domain services.
- Keep authorization, validation, transactions, publishing, and audit writes
  out of presentational components.
- Do not bypass authentication or authorization to create a prettier demo.
- Do not invent a new database schema for UI state.
- Do not silently change product behavior or specs. If a data shape is missing,
  use a truthful empty/loading state or make the smallest explicit change and
  report it.
- Do not add a dependency for icons if simple inline SVG or existing assets are
  sufficient.
- No any, no unchecked casts, no unexplained TODOs in the critical path.
- Keep text readable at 100% zoom and usable at 200% zoom.
- Ensure keyboard focus, labels, error associations, and color contrast.
- Support at least 320px mobile, 768px tablet, and 1280px desktop layouts.
- Make the student path mobile-first and the teacher review path desktop-first.
- Avoid layout shift when data loads.
- Provide useful empty, error, and success states; do not silently render blank
  panels.

### Suggested file organization

Follow the existing repository conventions. A reasonable direction is:

- src/components/ui/ for small reusable primitives;
- src/components/layout/ for shell/navigation;
- src/components/student/ for student surfaces;
- src/components/teacher/ for staff surfaces;
- route files remain responsible for data loading and composing the page;
- styles stay centralized or module-scoped, not duplicated across every page.

Do not create this structure blindly if the repository already has an
equivalent. Inspect first.

### Work sequence

1. Inspect the current routes, components, styles, server actions, and domain
   data returned by each page.
2. State a short implementation plan in your working notes, identifying any
   real blocker.
3. Establish the tokens and shell.
4. Implement the student flow: sign-in, dashboard, section/form, history, Q&A.
5. Implement the teacher review shell and response/privacy surfaces.
6. Bring matches/import into the same visual system.
7. Exercise all routes with realistic existing/dev data and empty states.
8. Run:

   - npm run lint
   - npm run typecheck
   - npm test
   - npm run build

   Run integration tests if PostgreSQL is available. If the environment lacks
   the test database or Docker, report that fact accurately; do not claim the
   tests passed.
9. If a browser or screenshot tool is available, inspect the key routes at
   mobile and desktop widths and iterate on obvious hierarchy, overflow,
   focus, or privacy problems.
10. End with a concise implementation report:

   - files changed;
   - routes completed;
   - visual/reference decisions made;
   - tests/checks and their exact results;
   - any spec or schema changes;
   - any remaining owner questions.

### Definition of done

The work is done when:

- every existing route renders inside a coherent, responsive, role-aware shell;
- the student can understand what to do next, submit once, confirm immutable
  submission, view history, and search section Q&A;
- staff can triage a submission, see the private/public separation, send a
  private response, and publish a safe anonymous answer using existing actions;
- students never see staff-only identity or review metadata;
- the visual system is original but clearly informed by Ed Discussion’s
  course/list/detail interaction model;
- the app remains type-safe and the existing tests/build are preserved;
- no deferred feature has been smuggled into the UI.

If “Fable” is confirmed to mean an F#/Fable implementation requirement rather
than the Claude tooling name, stop before adding more TypeScript UI and report
that the stack decision must be resolved. Otherwise proceed with the current
TypeScript baseline.

## END PROMPT

---

## Owner questions that do not block this UI pass

The current docs still list these open product decisions:

1. Whether “Fable” means an actual F#/Fable implementation requirement.
2. Who grants the Teacher role and what first-time teacher onboarding looks
   like.
3. How much access a deactivated student retains after roster re-import.
4. Retention/end-of-semester policy for identities, submissions, private
   replies, and audit records.
5. Whether in-app response visibility is enough before pilot launch or email
   notifications are required.

Only the first item blocks continued TypeScript implementation. The others can
remain explicit open decisions while the first UI slice is built.
