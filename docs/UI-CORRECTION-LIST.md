# Second-pass UX correction list

A senior product-design review of the **running** application (dev server, seeded
data, screenshots at 1440 / 1024 / 768 / 390 / 320). Every item below was
observed on screen, not inferred from source.

The three questions asked of every route: **Where am I? What is the main action?
What should I do next?**

Priority: **P0** the page's main action is buried, misplaced, or outranked by a
destructive one · **P1** wayfinding, consistency, or text that costs the reader
attention for nothing · **P2** craft.

---

## P0 — the main action is in the wrong place

| # | Route | Issue | Why the current decision is poor | Correction |
|---|---|---|---|---|
| 1 | `/teach/courses` | "Create a course" is a full titled panel at the **bottom** of the page, below every course. | The page's reason to exist for a new teacher is creating a course. With ten courses the creation action is several screens down, and the page reads as a list that happens to end in a form. | `New course` action in the page header; the form itself behind a `<details>` disclosure at the top of the page. Empty state carries the same action. |
| 2 | `/teach/courses` | Every course notice carries an always-open 3-field "Add section" form in its footer (~200px per course). | Section creation is occasional; it is given permanent space in every row, so the actual content — which sections exist and where to go next — is pushed apart and the page cannot be scanned. | One `Add a section` disclosure per course, closed by default, directly under that course's section list. |
| 3 | `/teach/sections/[id]/review` | The detail pane **opens with** a validity dropdown, a "reason the student will see" field and a red **Remove participation credit** button — above the student's words and above the reply/publish composers. | The main action on a submission is to answer it. Invalidating participation is rare and destructive; putting it first inverts the hierarchy and puts a mistake one click from arrival. | Order becomes: who/when/status → form answers → the student's item + reply/publish composers → **Participation credit** last, inside a closed `<details>`. |
| 4 | `/teach/courses/[id]/templates` | "Create template" is the last control of an always-expanded editor sitting below the template list. | Same shape as #1: the page's create action is only reachable by scrolling past an editor the reader did not ask to open. | `New template` header action; editor behind a disclosure; the existing templates stay first. |
| 5 | `/teach/sections/[id]/backlog` | "Import questions from a previous semester" is always expanded at the bottom; it is the only visible submit button on the page. | The page's real work is triaging rows (`Answerable`, `Not suitable`, `Draft for this section`). A bulk-import form permanently occupying the bottom half misrepresents what this page is for. | `Import questions` header action + disclosure. Empty state points at the same action. |
| 6 | `/teach/sections/[id]/setup` | "Add or reconfigure a staff member" is always expanded with **all 14 permission checkboxes** visible, pushing the weekly schedule below the fold. | Staff assignment happens once a term; the schedule is the thing a teacher returns to. The rarely-used form is given the most valuable space on the page. | Staff form behind a closed disclosure; schedule and cycles move up. |
| 7 | `/teach/sections/[id]/publications` | Empty state names the next step in prose ("Start one from a submission in the review inbox") but offers no action. | An empty state that describes the next step without linking to it makes the reader navigate by hand. | Empty state gets the action: `Go to the review inbox`. |

## P1 — wayfinding and consistency

| # | Route | Issue | Why the current decision is poor | Correction |
|---|---|---|---|---|
| 8 | `/` | Page title is a greeting ("Hello, Teacher"). | The title is the answer to "where am I?" and a greeting answers nothing. The rail item beside it says "Overview"; the two disagree. | Title becomes **Overview**, matching the rail. The one genuinely useful sentence (how many forms are open) is kept as the description only when something is actually open. |
| 9 | `/` (teacher) | An "ELSEWHERE" region containing one button, "Courses and sections", duplicating the rail's "My courses". | A whole page region for a link that is already permanently in the rail, under a label that names nothing. | Region removed. |
| 10 | `/admin` | Three names for one place: top bar "Platform administration", rail "Platform admin", page title "Accounts and roles". | Inconsistent naming of a destination makes the reader re-establish where they are on arrival. | One name — **Platform admin** — in the rail and the bar; page title **Accounts**. |
| 11 | `/teach/sections/[id]/review` | The rail carries a **10-item WEEK list** (All weeks, Week 9 … Week 1) that duplicates the list pane's own filter. | Two filter mechanisms for one dimension, and the rail — which exists to hold destinations — becomes 24 rows tall, burying the destinations at the top. | Week becomes a second filter in the list pane. The rail holds destinations only. |
| 12 | `/sections/[id]/qa` | The rail shows a one-item "CLASS SECTION" group whose only entry links to the page currently open. | A navigation group with one item that goes nowhere is chrome pretending to be structure. | Rendered only when the reader has more than one section. |
| 13 | across | The same destination is worded three ways: "Review inbox" (courses), "Open the review inbox" (home), "Review inbox" (rail). | Equivalent actions must read the same or the reader cannot tell they are the same. | One wording — **Review inbox** — everywhere, in the same position (row-end action). |
| 14 | `/sections/[id]/history` | Description says "Submitted forms cannot be edited or withdrawn", while `/sections/[id]` says "Submitted · still editable · 4 days left". | A flat factual contradiction between two pages about the one rule students care about. Under a hard deadline this is the worst place to be wrong. | Corrected to the implemented rule: editable until the deadline, then fixed. |

## P1 — unnecessary UI to remove

| # | Route | Issue | Why the current decision is poor | Correction |
|---|---|---|---|---|
| 15 | `/teach/sections/[id]/matches` | Leading info alert "Nothing is verified automatically" (3 lines). | Generic onboarding copy at the top of a page whose every row already offers "This is them / Not this student". It is read once and then costs attention forever. | Removed. The one clause that prevents a real mistake — compare the two names before confirming — stays on the panel that has the confirm buttons. |
| 16 | `/teach/sections/[id]/matches` | A claim row prints the same fact twice: "That number is not on any class list." then "The number they typed is not on any roster." | Repeated explanation in adjacent lines reads as a bug and makes the reader look for the difference. | Printed once. |
| 17 | `/teach/sections/[id]/matches` | An empty state ("No accounts are waiting for confirmation") renders **between** two populated panels. | A mid-page empty state suggests the page is empty when it is not. Absence needs no panel. | The pending panel renders only when it has rows. |
| 18 | `/teach/sections/[id]/import` | Leading info alert "How matching works" repeats the matches page. | Repeated explanation across routes. The reader is here to upload a file. | Removed. The privacy-bearing clause ("Sex Assigned at Birth is never imported") stays on the field it applies to. |
| 19 | `/teach/sections/[id]/import` | Floating helper "Previewing changes nothing." beside the Preview button. | Unnecessary helper text; the button already says *Preview*, and the preview panel opens with "Nothing has been applied yet." | Removed. |
| 20 | `/teach/sections/[id]/audit` | Every system-generated row carries an `AUTOMATIC` stamp — 20+ on one screen — while the same row already reads "System · …". | Excessive badges. A stamp that appears on most rows carries no signal, and it competes with the stamps that do. | Dropped; the actor column already says "System". |
| 21 | `/admin` | Every non-teacher row carries a `STANDARD` stamp. | A badge that encodes the *absence* of a role. Three of four rows carry it, so it distinguishes nothing. | Dropped. Only `Admin`, `Teacher` and `Deactivated` are stamped. |
| 22 | `/teach/sections/[id]/participation` | "Export" is a titled card whose entire body is three buttons. | A card that contains only controls adds a border, a title and 24px of padding for nothing. | The three exports become page-header actions; the identity-bearing warning moves next to them, where the decision is made. |
| 23 | `/sections/[id]` (student form) | The student's own question block and general comment are **green-washed bordered containers**, each with an instructional paragraph plus a separate "Optional" line. | Decorative coloured containers, and the paragraph explains a mechanism the student does not need to act on. On a phone these two panels are most of the page. | Flattened onto the same hairline rhythm as every other question. One sentence kept on the question block (it explains what publishing does to their wording — a privacy fact); the general comment keeps one clause. |
| 24 | `/sections/[id]/qa` | List pane and detail pane both print an empty message, and the detail one tells staff "when **your teaching team** answers a question…". | Duplicated explanation, and wrong voice for half its readers — staff *are* the teaching team. | One empty message, in the pane that owns the selection, worded for the reader's actual role. |
| 25 | `/` | `StripLabel` with a count above the page's only region ("YOUR CLASSES 1", "SECTIONS YOU TEACH 1"). | A divider label above a single region divides nothing, and a count of 1 beside one visible card is decoration. | Strip shown only when the page has more than one region; count only when it exceeds what is on screen. |
| 26 | `/teach/sections/[id]/setup` | "YOU OWN THIS COURSE" / "Owner-managed" stamps. | Decorative label: the page already expresses ownership by showing or withholding the staff controls. | Dropped. |
| 27 | `/teach/sections/[id]/setup` | "Section details" wraps two text fields in its own titled panel. | A panel and a title for two fields that belong to the page's own subject. | Fields sit directly in the page, ahead of the first strip label. |
| 28 | rail footers | `/teach/…/review` prints "Everything in this workspace is staff-only…"; `/sections/[id]/qa` prints "Published answers are visible to everyone in this section…". | Explanatory text parked in the least-read corner of the screen, where it protects nobody. | Removed from the rail. The identity boundary is stated on the control that crosses it (the composer, the publish confirmation). |

## P2 — craft

| # | Route | Issue | Correction |
|---|---|---|---|
| 29 | `/teach/sections/[id]/review` | `StripLabel` ternary returns the same string on both branches. | Simplified to one string. |
| 30 | entry screen | The four commitments use accent-coloured tick icons. | Icons go neutral; the accent is not spent on decoration. |
| 31 | `.ws-brand__mark` | The product mark is a filled accent square in the top bar of every page. | Ink, not accent — the accent is reserved for action, not identity. |
| 32 | `.chart__bar` | Chart bars are filled with the accent. | Bars are data, not action; they take a neutral ink tone. |

---

## Colour system

The incumbent system is a matte olive board (`#e9e8de`) with one **institutional
green** accent (`#1f6b4a`) applied to the brand mark, active navigation, primary
buttons, links, focus, the positive stamp, the student's own-question container,
that container's input borders, the entry checklist icons, quote rules and chart
bars. Two problems, both named in the brief:

1. **It reads as the institution, not the product.** `#1f6b4a` is a forest green
   a step from UP's own; combined with the olive ground the interface reads as a
   university portal skin rather than a workspace of its own.
2. **The accent is spent on decoration.** Washed containers, tinted input
   strokes, coloured icons and chart fills mean the accent no longer signals
   "this is the action".

### Three directions, rendered and compared

All three were built as the same review-inbox screen — rail, list rows, stamps,
buttons, quote, table, warning — and compared side by side rather than as
swatches, because a palette is only judged in the density it will live at.

| | Direction | What the render showed |
|---|---|---|
| **A** | warm neutral + muted green | Reads as the incumbent identity with the volume lowered. The pale green selected-row wash sits uneasily on the warm ground. **Excluded**: it is the direction that most resembles UP DCS. |
| **B** | soft stone + deep blue-green | The petrol accent is unmistakably *not* UP forest green. The stone canvas is the lowest-glare of the three, and the accent is dark enough to read as serious without becoming a corporate blue. |
| **C** | light neutral + restrained ink-blue | The crispest accent semantics, but the saturated blue button and blue selected row read exactly like the generic institutional portal the brief rules out, and the blue wash vibrates against the neutral grey ground. |

**Chosen: B — soft stone canvas, deep blue-green accent.** It supports long
review sessions best (low-chroma ground, no vibration), keeps hierarchy legible
at staff density, and is the furthest of the three from an institutional skin.
The semantic roles are recorded in [DESIGN.md](../DESIGN.md) §3.

The accent is now reserved for: primary buttons, links, active navigation, the
focus ring, the checked state of a choice, and the positive stamp. It was
removed from the brand mark, the student's own-question container and its input
borders, the entry checklist icons, and chart fills.
