# Class Feedback UI Screen Specification

**Audience:** Claude Opus 5 / Claude Code implementation session  
**Status:** implementation handoff  
**Design target:** Ed Discussion-level information architecture with an
original Class Feedback visual identity

This document turns the research into screen-level acceptance criteria. It is
more specific than a mood board, but it does not override product rules or
server authorization. When this document conflicts with code or a confirmed
privacy rule, preserve the privacy rule and report the conflict.

## Fidelity boundary

Implement the interaction model closely enough that a person familiar with Ed
Discussion recognizes the course context, category/queue navigation,
search/filter placement, compact list rows, selected-detail relationship, and
composer placement.

Do not create a pixel-identical or branded clone. Do not copy Ed Discussion's
logo, exact brand colors, proprietary illustrations, exact copy, screenshots,
or source code. The finished app must look like a university product called
Class Feedback, not Ed Discussion with its logo removed.

## Viewports to verify

Claude should inspect each important screen at these widths:

| Viewport | Purpose |
|---|---|
| 1440 × 900 | primary desktop teacher workspace |
| 1280 × 800 | laptop desktop and normal student desktop |
| 768 × 1024 | tablet / collapsed teacher workspace |
| 390 × 844 | phone student flow |
| 320 × 568 | narrow-screen overflow check |

The student flow is mobile-first. The teacher review screen is desktop-first,
but must collapse into a usable single-column sequence rather than requiring
horizontal scrolling.

## Global visual contract

### Layout geometry

- Desktop sidebar: approximately 240–264px wide.
- Topbar: approximately 60–68px high, containing current section context and
  account controls.
- Main content: max-width approximately 1,280px with 24–40px outer padding.
- Student reading/form column: max-width approximately 760–840px.
- Teacher review: queue approximately 320–400px; detail takes the remaining
  width.
- Cards use 16–24px internal padding. Do not make every element a floating
  card; use borders and whitespace for grouping.
- Default spacing rhythm: 4, 8, 12, 16, 24, 32, 48px.

### Tokens

| Token | Value | Intended use |
|---|---|---|
| canvas | #F5F7F2 | page background |
| surface | #FFFFFF | cards and form surfaces |
| ink | #17231C | primary text |
| muted | #607067 | supporting text |
| border | #DCE5DD | dividers and controls |
| primary | #167A58 | main action and selected state |
| soft-primary | #DFF1E6 | selected/positive background |
| attention | #A96512 | pending or review-needed state |
| soft-attention | #FFF0D8 | warning panel |
| danger | #B54747 | invalid/destructive/privacy-risk state |

Use one readable sans-serif/system stack. Use sentence case. Status must be
communicated by text and, when helpful, an icon; color alone is insufficient.

### Shell anatomy

Desktop shell:

~~~text
┌───────────────┬───────────────────────────────────────────────────────────┐
│ Class Feedback│ Current section / workspace                 Account       │
│ workspace     ├───────────────────────────────────────────────────────────┤
│               │ Breadcrumb / page eyebrow                                │
│ section       │ Page title                         primary action          │
│ navigation    │ Short description / visibility explanation                │
│               │                                                           │
│ privacy note  │ Main content                                              │
└───────────────┴───────────────────────────────────────────────────────────┘
~~~

On mobile, replace the persistent sidebar with a compact header and a
keyboard-accessible menu/drawer. Keep the current section and role visible.

## Screen specifications

### /signin

Purpose: establish trust before a user enters a confidential university
workspace.

Required composition:

1. Calm brand/intro panel with the product name and one-sentence explanation.
2. Sign-in surface with the university Google sign-in action.
3. Plain-language access note: university-only, section-scoped data, no
   internet-public class archive.
4. Local development sign-in may appear only when the existing environment
   explicitly enables it outside production; label it as development-only.
5. Auth/configuration errors appear as an accessible alert, not an unstyled
   stack trace.

States to verify: normal, auth error, development login enabled, narrow mobile.

### /

Purpose: show the next useful action without making the student decode a
dashboard.

Student composition:

- greeting and short explanation;
- section cards with course/section name, cycle status, deadline, and one next
  action: Complete, Submitted, Closed, or View Q&A;
- pending identity match status only when truthful and useful;
- recent activity/history link;
- no staff-only counters or review metadata.

Staff composition:

- clear staff workspace label;
- section cards linking to review, roster/matches, and import only when the
  current user is authorized;
- compact attention summary using real data only;
- no decorative fake analytics.

States to verify: no sections, one open section, submitted section, closed
section, mixed student/staff access.

### /sections/[id]

Purpose: focused weekly submission flow.

Required order:

1. Section identity and breadcrumb.
2. Current week/cycle and deadline state.
3. Short explanation of what happens after submission.
4. Structured question blocks with visible labels, descriptions, required
   markers, and inline errors.
5. A visually distinct optional student-originated item block with type,
   category, and text fields.
6. Privacy helper text: staff can reply privately or reword and publish to
   the enrolled section; classmates never see the original wording or source
   identity.
7. Primary submit action with clear irreversible/immutable wording.

After success:

- show a strong confirmation state;
- say the response cannot be edited;
- link to history and section Q&A;
- do not render an edit button.

States to verify: no open cycle, open empty form, validation error, successful
submission, already submitted, section access denied.

### /sections/[id]/history

Purpose: private, calm record of the student's own submissions.

Use a timeline or stacked history cards. Each entry may show the cycle/week,
submission time, the student's own answers, private teacher replies, and the
status of a separately published anonymous answer.

Never show: staff validity reasons, internal notes, review-state metadata,
hidden disposition decisions, another student's identity, or participation
totals.

States to verify: empty history, one entry, multiple entries, private-only
reply, published-answer reply, access denied.

### /sections/[id]/qa

Purpose: section-scoped knowledge archive, not a social feed.

Recommended desktop composition:

~~~text
┌─────────────────────────────────────────────────────────────────────────┐
│ Search questions…   Category            Search                           │
├──────────────────────────────┬──────────────────────────────────────────┤
│ Published answers             │ Selected answer                         │
│ category · date               │ reworded question                       │
│ question preview              │ answer                                  │
│ category · date               │ published date · anonymous source       │
└──────────────────────────────┴──────────────────────────────────────────┘
~~~

Use list/detail ergonomics inspired by Ed Discussion and Piazza. The archive
must visibly say Class only or equivalent. Source identity is never shown.

States to verify: populated archive, empty archive, no-result search, category
filter, legacy answer marker, mobile stacked layout.

### /teach/sections/[id]/review

Purpose: staff inbox for responsible triage and response.

Desktop composition:

1. Persistent staff section navigation.
2. Page header and staff-only/privacy cue.
3. Real attention summary: submission count and publication visibility state.
4. Queue/list with compact rows; each row communicates student, week, item
   count, and validity using text + status badge.
5. Detail pane for the selected/current submission.
6. Validity action near the submission identity.
7. Each item clearly separates:
   - original wording, read-only;
   - private response composer;
   - editable public question;
   - editable public answer;
   - anonymity acknowledgment and publish action.

The public composer warning must be near its action:

> This answer will be visible to students in this section. The original
> wording stays private, but specific details can still identify the asker.
> Review the public wording before publishing.

Never render private reply content or source identity in student routes.
Preserve current server actions, validity behavior, audit semantics, and
publish warning flow.

States to verify: empty inbox, valid submission, invalid submission, multiple
items, private reply, publish warning, publish success, staff access denied.

### /teach/sections/[id]/matches

Purpose: explicit teacher-confirm-all identity safety workflow.

Use a review list/card with account identity, matched roster record, state, and
similarity only if the existing data provides it. Confirm and Reject must be
separate, visible actions. Explain that nothing becomes verified automatically.

States: no pending matches, pending match, missing roster record, confirm,
reject, access denied.

### /teach/sections/[id]/import

Purpose: safe roster reconciliation.

Use a step-like visual sequence without inventing a client-side wizard:

Paste CSV → Preview changes → Confirm import

The preview must make creates, enrollments, reactivations, unchanged rows,
name updates, locked name differences, deactivations, and errors visually
distinct. Emphasize that preview does not apply changes and deactivation never
deletes historical data.

States: initial, preview with actions, preview errors, completed import, access
denied, narrow mobile.

## Reference translation

| Reference pattern | Implement as |
|---|---|
| Ed course list | section/workspace switcher |
| Ed category list | Q&A categories and staff filters |
| Ed thread list | published answers or review queue |
| Ed selected thread | selected answer/submission detail |
| Ed unread/resolved markers | New, Needs review, Submitted, Answered, Published |
| Ed anonymous post | section-scoped anonymous public question |
| Ed private staff action | private response visible to asker and authorized staff |
| Ed search/filter bar | Q&A search/category and staff review filters |

Do not bring over votes, reactions, comments, endorsements, open peer replies,
public internet visibility, or notification controls. They are not in this
MVP.

## Visual QA acceptance checklist

- [ ] A user can always identify the current role, section, and page.
- [ ] The next action is obvious without reading a long explanation.
- [ ] Student forms are readable at 390px without horizontal scrolling.
- [ ] Teacher queue/detail is efficient at 1280px and collapses cleanly.
- [ ] Search/filter controls remain visible and understandable.
- [ ] Original/private/public content has unmistakable visual separation.
- [ ] Visibility language is beside the action that changes visibility.
- [ ] Status uses words/icons in addition to color.
- [ ] Empty, error, success, and unauthorized states are designed.
- [ ] Keyboard focus is visible; labels and errors are associated.
- [ ] The layout still works at 200% browser zoom.
- [ ] No student-facing view leaks source identity or internal review fields.
- [ ] No new deferred feature appears in the UI.
