# Information Architecture

**Status:** **[Recommended]** IA audit and proposed structure. No scope change:
nothing from [mvp-scope.md](mvp-scope.md) §2/§3 is promoted, and no new entity is
proposed.
**Owns:** navigation structure and grouping, the category taxonomy, labelling
conventions, and the Q&A archive's browse/search strategy.
**Audited:** [nav.ts](../src/components/layout/nav.ts),
[lib/threads.ts](../src/lib/threads.ts),
[qa/page.tsx](../src/app/sections/[id]/qa/page.tsx), plus the route inventory in
[CURRENT_STATE.md](CURRENT_STATE.md).

> ## Superseded in part, 2026-08-06 — the course is now the primary workspace
>
> This file's audit and its findings still hold for what they examined, but its
> §3 route map and §4 "hub-and-spoke **per section**" pattern describe the IA as
> it was. The product now treats the **course** as the primary workspace and the
> **form** as the work object; a section is the access/audience context. Model and
> rationale: [FORMS-AUDIENCE-DYNAMIC-INSTANCES.md](FORMS-AUDIENCE-DYNAMIC-INSTANCES.md).
>
> Current staff structure:
>
> ```
> My courses  (/teach/courses)                   course code is the identity
> └── Course workspace  (/teach/courses/[id])    ← default: Forms
>       ├── Forms                                the work objects
>       │     ├── New form            → /forms/new       details · audience · delivery · questions
>       │     ├── Form                → /forms/[formId]  occurrences · audience · delivery · base questions
>       │     └── One occurrence      → …/instances/[instanceId]  "Customize Week 4"
>       ├── Responses  (/responses)              ONE inbox per course, filterable by form,
>       │                                        occurrence and **section**
>       └── Class lists & access  (/sections)    rosters, matches, staff, section details
> ```
>
> Students reach a **form**, not a section: `/forms/[id]`. `/sections/[id]`
> survives as a resolver, and `/teach/sections/[id]/review` redirects into the
> course inbox with that section preselected.
>
> **Findings this resolves.** F1's complaint that the question backlog sits in the
> section group while being course-level is now structurally answered for forms:
> anything course-owned is reached from the course workspace. The
> "hub-and-spoke makes cross-section work expensive" trade-off in §4 is no longer
> accepted for the form workflow — a shared form has one inbox precisely so that
> comparing sections costs nothing. Sections remain independent spokes for the
> things that genuinely are per-section (rosters, matching, publication, audit).

> **This document corrects one proposal made elsewhere.**
> [JOURNEY-TEACHER-SETUP.md](JOURNEY-TEACHER-SETUP.md) §5 proposed reordering the
> staff nav by section readiness. **That is the wrong mechanism** — see F1. The
> problem it identified is real; the structural fix is regrouping, not reordering.
> Treat this file as authoritative on nav structure and that one as authoritative
> on the readiness *state*.

---

## 1. IA assessment

The product's IA is **permission-derived and honest** — `staffSectionNav` builds
from the same effective permissions the server enforces, with an explicit comment
that hiding a link is not authorization
([nav.ts:3-9](../src/components/layout/nav.ts#L3-L9)). Active-state marking uses
longest-href-wins so a parent does not light up for an unrelated child
([nav.ts:23-38](../src/components/layout/nav.ts#L23-L38)). Both are more careful
than most products manage.

The structural problems are not about permissions. They are:

1. **Grouping** encodes steady-state operation, so the one-time setup sequence is
   scattered and partly inverted (F1).
2. **The taxonomy has two definitions that disagree**, and only one of them is
   real (F3).
3. **The same things have different names** depending on where you meet them —
   across roles (F2) and across densities (F4).
4. **The archive's browse dimensions are the weakest available ones**, and the two
   that coursework is actually organized by are missing despite the data existing
   (F5).

No IA research has been done — no card sort, no tree test, no search-log data
(there are no logs yet). Everything below is expert-structure reasoning that
should be validated; the test plan in §7 is scoped to what would actually change a
decision.

---

## 2. Findings

### F1 · P1 · Grouping encodes steady state, and one dependency is inverted

**Evidence.** `staffSectionNav` produces two groups
([nav.ts:41-128](../src/components/layout/nav.ts#L41-L128)):

- **Section**: Review inbox · Publication queue · Class Q&A · Class list ·
  Roster import · Participation · Question backlog
- **Manage**: Section setup · Audit history

Three structural problems:

1. **A brand-new section opens on Review inbox** — necessarily empty, since there
   is no roster, schedule, or cycle.
2. **Class list precedes Roster import**, inverting the actual dependency.
   You import, *then* you match. The nav teaches the reverse.
3. **Question backlog sits in the section group**, but the backlog is
   **course-level** — [../PRODUCT.md](../PRODUCT.md) terminology is explicit:
   *"Backlog is course-level and separate from the weekly dashboard."*
   [CURRENT_STATE.md](CURRENT_STATE.md) confirms the route only exists under a
   section. **The IA contradicts the domain model**, which is the version of this
   problem that will get worse rather than better: every future backlog feature
   inherits the wrong parent.

**Why reordering by readiness is the wrong fix.** The
[JOURNEY-TEACHER-SETUP.md](JOURNEY-TEACHER-SETUP.md) proposal was to lead with
setup destinations while a section is not ready, reverting once it is. That
sacrifices the single most valuable property navigation has: **positional
stability**. Users learn navigation spatially — by where things sit, not by
reading labels every time. A nav that reorders itself based on state means the
teacher who learns it during setup has to relearn it afterwards, and the cost is
paid every week for one week's benefit. Mis-ordering something once is cheaper
than moving it.

**Fix — regroup, with fixed order.** Three groups whose *labels* do the work
readiness-ordering was trying to do:

| Group | Items | Why |
|---|---|---|
| **This week** | Review inbox · Publication queue · Class Q&A | The weekly triage pass. Matches Principle 5 — the rhythm is the product. |
| **Class list** | Roster import → Class list | Dependency order, and a label a cold-start teacher recognises as the thing they need. |
| **Manage** | Section setup · Participation · Question backlog\* · Audit history | Periodic and configuration work, not weekly. |

\* Question backlog moves to a course-level destination when that route exists;
until then it stays here with the correct parent noted. See §8.

Participation moves out of the weekly group because it is a periodic export task,
not weekly triage — grouping it with the inbox implies a cadence it does not have.

Readiness communication moves **entirely** to content: the badge and notice in
[JOURNEY-TEACHER-SETUP.md](JOURNEY-TEACHER-SETUP.md) §5–6. That is the correct
split — **structure stays stable, state is communicated by copy.**

### F2 · P1 · One destination, two names, depending on your role

**Evidence.** Both navs point at the same route, `/sections/[id]/qa`:

- staff see **"Class Q&A"** ([nav.ts:70-74](../src/components/layout/nav.ts#L70-L74))
- students see **"Q&A archive"** ([nav.ts:158-161](../src/components/layout/nav.ts#L158-L161))

**Why it matters.** A teacher saying *"check Class Q&A"* and a student looking for
*"Q&A archive"* are discussing the same page, and the product taught them
different words for it. Shared vocabulary between roles is not a nicety in a
teaching tool — it is how a teacher gives instructions that work.

There is also a **shell boundary crossing**: staff following this item leave the
staff workspace for a `/sections/` route, with no signal that they have. It is the
only item in the staff nav that does this.

**Fix.** One label both roles see. **"Class Q&A"** — it names the audience, which
is the product's central distinction (anonymous *to classmates*), and it is the
domain's own phrasing in
[public-qa-and-source-linking.md](public-qa-and-source-linking.md) §8. "Archive"
describes a container rather than contents, which is the labelling failure mode
worth avoiding. Staff arriving there should see they are viewing the student-facing
page — a `/wireframe` and `/articulate` concern, flagged in §8.

### F3 · P1 · Two category taxonomies exist; eight of the eleven categories are dead

**Evidence.** [lib/threads.ts](../src/lib/threads.ts) defines `CategorySlug` as an
eleven-member union — `content`, `logistics`, `misc`, `general`, `lectures`,
`sections`, `problem-sets`, `assignments`, `midterm`, `final-exam`, `social`
([threads.ts:12-23](../src/lib/threads.ts#L12-L23)) — and `QUESTION_CATEGORIES`,
the only one any user sees, as three: Course content, Class logistics, Other
([threads.ts:25-29](../src/lib/threads.ts#L25-L29)).

The extra eight have styling support (`categoryClass` emits `cat--${slug}` for
any value) and **no producer**: nothing writes them, no filter offers them, the
submission schema restricts the student's choice to
`content | logistics | misc` ([forms/submission.ts:45](../src/modules/forms/submission.ts#L45)).

The docstring says the IA follows `CLAUDE_UI_SCREEN_SPEC.md` "Reference
translation" — so this is inherited from the Ed Discussion study
([ED_DISCUSSION_REFERENCE_PACK.md](ED_DISCUSSION_REFERENCE_PACK.md)), which is
that product's category model, not this one's.

**Why it matters.** The confirmed domain taxonomy is three categories
([weekly-form-workflow.md](weekly-form-workflow.md) §7: Content / Logistics /
Miscellaneous). A dead eight-member vocabulary sitting next to it is an invitation
to "just add a category" without an owner decision, and category boundaries are
product truth here, not styling.

**Fix.** Reduce `CategorySlug` to the confirmed three plus the null-case. Keep the
reference material in the reference pack, where it is labelled as inspiration.

### F4 · P1 · The same category has two labels, and the empty case has two names

**Evidence.** For `content`: `categoryLabel` → **"Course content"**,
`categoryShortLabel` → **"Content"**
([threads.ts:31-48](../src/lib/threads.ts#L31-L48)). For a null/unknown value:
`categoryLabel` → **"Uncategorised"**, `categoryShortLabel` → **"General"** — two
different words for the same absent thing.

**Why it matters.** A student sees `Content` on a list row and has to find
`Course content` in the filter. That breaks the cloze property a label exists to
provide: seeing the contents should let you predict the label, and vice versa.
Catalog: **Inconsistent Patterns** (Cat 9). Note that `logistics` and `misc`
already use identical strings in both functions — so the divergence is an
accident in one case out of three, which is exactly the kind of inconsistency
nobody notices from inside the code.

**Fix.** One label per category, both densities. **Course content · Class
logistics · Other**, with **"Uncategorised"** for the absent case in both. If the
short form is genuinely needed for row width, that is a truncation concern for
`/wireframe`, not a second vocabulary.

### F5 · P2 · The archive browses on its weakest axes, and the two coursework uses are missing

**Evidence.** [public-qa-and-source-linking.md](public-qa-and-source-linking.md)
§8 says entries may be organized by: **category**, **lesson/lecture/module/topic**,
**publication date**, **weekly cycle**, and **legacy vs current source**.

Implemented ([qa/page.tsx:36-39](../src/app/sections/[id]/qa/page.tsx#L36-L39)):
category filter, full-text search, and a time filter — All / This week / This
month / **Earlier semesters**.

Missing: **topic** and **weekly cycle**. And `topicId` is carried all the way
through the publishing path ([publishing/index.ts:81](../src/modules/publishing/index.ts#L81),
[:553](../src/modules/publishing/index.ts#L553)) — **the data exists and is not
exposed.**

**Why it matters.** This archive replaces a hand-compiled answer document, and its
job is answering *"what was the thing about recursion from week 3."* Coursework is
organized by **topic** and **week**. Recency is the axis least connected to how
students think about a course — "This month" spans a topic boundary and splits a
topic arbitrarily.

Separately, **"Earlier semesters" collapses two independent dimensions into one
filter.** It selects on `sourceOrigin === "legacy"`
([qa/page.tsx:112-113](../src/app/sections/[id]/qa/page.tsx#L112-L113)), which is
*provenance*, not time. A legacy-imported entry is differently-sourced, not
necessarily older, and a student filtering for "earlier semesters" gets neither
reliably. Provenance and time are separate facets and should be separate controls.

**Fix.** Category and topic as the browse spine; cycle/week as the time axis
replacing calendar buckets; provenance as its own toggle. §6.

### F6 · P2 · Zero-results tells the user to clear filters but gives them nothing to click

**Evidence.** Both empty panes differentiate filtered from genuinely-empty, which
is good ([qa/page.tsx:212-217](../src/app/sections/[id]/qa/page.tsx#L212-L217),
[:260-266](../src/app/sections/[id]/qa/page.tsx#L260-L266)). But the copy —
*"Try a different word, or clear the filters"* — offers no clear-filters control,
no spelling suggestion, no broaden-scope option, and no path to browse.

The list-pane message is also styled with a hardcoded `#6b7280`
([qa/page.tsx:213](../src/app/sections/[id]/qa/page.tsx#L213)), off the token
system (`--muted` is `#5c6b62`). Small, but it is in the one place a user is most
stuck.

**Fix.** A **Clear filters** action, and the count of what clearing would reveal —
*"Clear filters to see all 47 answers."* Recovery is a control, not a suggestion.

---

## 3. Proposed site map

```
Overview  (/)                                    role-aware, the only true home
│
├── STUDENT
│   └── Class section  (/sections/[id])
│         ├── Current week          ← default
│         ├── My submissions        history, private replies, published status
│         └── Class Q&A             (shared label with staff — F2)
│
├── STAFF · per section  (/teach/sections/[id]/…)
│   ├── This week
│   │     ├── Review inbox         ← default
│   │     ├── Publication queue
│   │     └── Class Q&A            → /sections/[id]/qa  (student-facing page)
│   ├── Class list
│   │     ├── Roster import        ← dependency order (F1)
│   │     └── Class list
│   └── Manage
│         ├── Section setup
│         ├── Participation
│         ├── Question backlog     ⚠ course-level in the domain model (F1, §8)
│         └── Audit history
│
├── STAFF · per course  (/teach/courses/[id]/…)
│   ├── Templates
│   └── Question backlog           ⚠ correct parent, route does not exist yet
│
├── My courses  (/teach/courses)                 course + section creation
└── Platform admin  (/admin)                     teacher-role grants
```

Order within each group is **fixed**. Group membership is permission-filtered, as
today. Nothing here changes what a role can reach.

---

## 4. Navigation specification

**Pattern: global + local, hub-and-spoke per section.** This is correct for the
product and should not change. Each section is a self-contained spoke; Overview is
the hub. The domain is `Course → Class Section → Weekly Feedback Cycle`, and a
hierarchical global nav would force a teacher through the course level on every
weekly visit — the wrong cost for the highest-frequency task.

**Trade-off being accepted.** Hub-and-spoke makes cross-section work expensive:
comparing two sections means returning to the hub. That is the right trade here
(sections are genuinely independent; deny-by-default authorization is per-section)
but it becomes wrong if a teacher ever routinely handles many sections at once.
The course-level rail already present in the Q&A workspace
([qa/page.tsx:147-150](../src/app/sections/[id]/qa/page.tsx#L147-L150)) is the
seed of the answer if that day comes.

**Grouping rule.** Groups are named for **cadence**, not for role or module:
*This week* (weekly), *Class list* (per-term, plus corrections), *Manage*
(occasional). Cadence is what a teacher is actually deciding between when they
look at the nav, and it aligns with Principle 5 — the rhythm is the product.

**Positional stability.** Order never varies by state, readiness, or count. State
belongs in badges and page content.

**Responsive.** Unchanged: sidebar at desktop, keyboard-accessible `<details>`
drawer on phones ([CURRENT_STATE.md](CURRENT_STATE.md)). With three groups the
drawer should render group labels, not a flattened list — a collapsed
seven-to-nine-item list is where grouping earns its keep.

---

## 5. Taxonomy

**Question category** — **[Confirmed]** at three values
([weekly-form-workflow.md](weekly-form-workflow.md) §7). MECE holds reasonably:
"Other" is the exhaustive catch-all, and content/logistics is a boundary students
can judge (is this about the material, or about how the class runs). Teachers can
correct a student's choice at review, which is the right escape hatch for a
three-way split that will sometimes be wrong.

| Slug | Label (both densities) | Scope |
|---|---|---|
| `content` | Course content | The material itself |
| `logistics` | Class logistics | How the class runs |
| `misc` | Other | Exhaustive catch-all |
| *(null)* | Uncategorised | Legacy imports and unset values |

**Do not extend without an owner decision.** Category is product truth, and the
eight dead slugs in F3 exist because a reference product's taxonomy leaked into
this one's type system.

**Topic** is the second, orthogonal dimension — lesson/lecture/module, course-level,
already modelled and carried through publishing, currently unexposed. It is
**polyhierarchy done correctly**: an entry has one category and one topic, and the
two axes answer different questions. This is where taxonomy growth should happen,
because topics are course-specific and teacher-authored, so they scale without
anyone renegotiating a global vocabulary.

**Scalability.** Three categories × N topics stays legible as an archive grows
across semesters, because topics partition by course structure rather than by
volume. A single flat category list would not.

---

## 6. Search and browse strategy

Students arrive with **both** modes, and the split maps to the two behaviours
identified in [JOURNEY-STUDENT-SUBMIT.md](JOURNEY-STUDENT-SUBMIT.md) §2:

| Mode | Who | What they need |
|---|---|---|
| **Known-item search** | A student who remembers an answer exists | Full-text search — **already implemented** and the right primary tool |
| **Exploratory browse** | A student revising, or catching up after absence | Topic and week. Neither exists yet (F5). |

**Proposed facets** — three independent axes, replacing one conflated filter:

1. **Category** — Course content · Class logistics · Other *(exists)*
2. **Topic** — from the course's topics; the browse spine for revision *(new
   surface, existing data)*
3. **Week / cycle** — replaces All / This week / This month. Weeks are how a
   course is structured and how a student remembers *when*.
4. **Source** — a separate toggle: *include earlier semesters*. Provenance is not
   time (F5).

**Why weeks rather than calendar buckets.** "This month" has no meaning inside a
course; "Week 3" does. It also matches the domain vocabulary the product already
uses everywhere else — `Week {cycleIndex}` appears in the student form, history,
and review.

**Zero results.** Recovery as controls, not prose: **Clear filters** with the
count it would reveal, plus a fall-back to browse-by-topic. Search that returns
nothing should offer the browse spine, because a student who cannot name the thing
is exactly the student who needs to browse.

**Not proposed:** autocomplete, did-you-mean, or relevance ranking. Section
archives are small — tens to low hundreds of entries — and full-text plus three
facets is sufficient at that scale. Revisit if an archive passes a few hundred
entries across semesters.

---

## 7. Test plan

Scoped to what would actually change a decision. No IA research exists today.

| Test | Method | n | Answers |
|---|---|---|---|
| **Do the three groups match how teachers think?** | Closed card sort — 9 staff destinations into *This week* / *Class list* / *Manage* | 5–8 teachers | F1 grouping. Small n is honest here: the pilot population is small, and disagreement among 5 is signal enough. |
| **Can a cold-start teacher find the roster importer?** | First-click test on the new-section nav: *"You need to add your students"* | Same participants | F1's core claim. Folds into [PILOT-STRATEGY.md](PILOT-STRATEGY.md) §5 activity #3 — no extra session needed. |
| **Do students predict category contents?** | 5-second test on the three labels | 5 students | F4. Folds into activity #2. |
| **Topic vs week vs recency for finding a past answer** | Tree test over the archive facets, 3 realistic retrieval tasks | 5 students | F5 — the only finding here whose fix costs real build effort, so it is the one worth testing before building. |

**All four fit inside the two research sessions
[PILOT-STRATEGY.md](PILOT-STRATEGY.md) already proposes.** That is deliberate: IA
research that requires its own recruitment will not happen, and these questions
are cheap riders on sessions that are already justified.

Statistical-confidence guidance (50+ for tree tests, 30+ for closed sorts) does
not apply to a single-institution pilot with one course. Directional evidence from
5 is the realistic ceiling — and it beats the zero evidence behind the current
structure.

---

## 8. Pending questions and handoffs

1. **The course-level backlog route does not exist.** The domain model says the
   backlog is course-level; the only route is per-section
   ([CURRENT_STATE.md](CURRENT_STATE.md)). Building
   `/teach/courses/[id]/backlog` is a route addition, not a scope change — but
   it is a build decision, so the site map marks the correct parent and leaves the
   current placement flagged rather than silently moving it.
2. **Topic authoring has no UI.** Exposing topic as a browse facet (F5) assumes
   topics get created somewhere. `topicId` is carried through publishing and
   templates support default topic associations
   ([weekly-form-workflow.md](weekly-form-workflow.md) §6), but no authoring
   surface exists. **Sequencing: the facet cannot ship before the authoring
   does.** Worth confirming against
   [PILOT-STRATEGY.md](PILOT-STRATEGY.md) §4 Q4 — this may be a feature nobody
   needs, in which case F5 narrows to fixing the conflated time/source filter.
3. **Does "Other" absorb too much?** Three-way category splits usually collapse
   toward the catch-all. Measurable from week one of the pilot: category
   distribution on real submissions. If `misc` dominates, the taxonomy needs an
   owner conversation, not a design fix.
4. **[Open D10]** dropped-student access affects whether a deactivated student
   keeps an archive destination in their nav at all.

**Handoffs:**

- `/articulate` — owns the final label strings. F2 and F4 are naming decisions
  with structural consequences; the recommendations here are the constraints, not
  the copy.
- `/wireframe` — where the three nav groups sit, drawer behaviour on phones with
  group labels, and whether a row badge needs truncation rather than a second
  vocabulary (F4).
- `/journey` — [JOURNEY-TEACHER-SETUP.md](JOURNEY-TEACHER-SETUP.md) §5 should be
  amended: readiness stays as a badge and notice; the nav change is regrouping,
  not reordering.
- `/investigate` — the four tests in §7, as riders on the two sessions already
  proposed.
- `/include` — nav group semantics (`<nav>` landmarks per group, or one landmark
  with headings), and the drawer's grouped structure.
- `/blueprint` — whether a course-level backlog route disturbs the section-scoped
  authorization pattern.
- **Not deciding here:** visual design of the nav, the roster importer's internal
  structure, template authoring IA.

---

## 9. Related documents

[JOURNEY-TEACHER-SETUP.md](JOURNEY-TEACHER-SETUP.md) ·
[JOURNEY-STUDENT-SUBMIT.md](JOURNEY-STUDENT-SUBMIT.md) ·
[JOURNEY-STUDENT-FIRSTRUN.md](JOURNEY-STUDENT-FIRSTRUN.md) ·
[JOURNEY-TEACHER-PUBLISH.md](JOURNEY-TEACHER-PUBLISH.md) ·
[public-qa-and-source-linking.md](public-qa-and-source-linking.md) ·
[weekly-form-workflow.md](weekly-form-workflow.md) ·
[roles-and-permissions.md](roles-and-permissions.md) ·
[question-backlog.md](question-backlog.md) ·
[INTENT-CONTEXT.md](INTENT-CONTEXT.md) · [PILOT-STRATEGY.md](PILOT-STRATEGY.md) ·
[CURRENT_STATE.md](CURRENT_STATE.md)
