# Journey — Teacher Cold Setup

> **Partly superseded, 2026-08-06.** The course is now the primary workspace and
> the form is the work object; a section provides audience and access. The setup
> and submission steps below still describe the right *decisions*, but the routes
> and the per-section framing have changed — see
> [FORMS-AUDIENCE-DYNAMIC-INSTANCES.md](FORMS-AUDIENCE-DYNAMIC-INSTANCES.md) §7
> for the current route map. A student now opens a **form** (`/forms/[id]`), and a
> teacher configures delivery once on the form rather than once per section.

**Status:** **[Recommended]** flow redesign. Audit of the implemented flow plus
proposed changes. No scope change: nothing from [mvp-scope.md](mvp-scope.md)
§2/§3 is promoted. No new entity is proposed — the readiness model in §5 is
derived from data that already exists.
**Owns:** the journey a teacher takes from an empty account to a section that can
safely receive students — course, section, roster, schedule, template — and the
out-of-band moment where they tell students to sign in.

> **Updated 2026-08-07.** Readiness was originally four items; "matches settled"
> was one of them. Account matching was removed, so it is now **three**: importing
> the class list with each student's UP email IS the access grant, and there is
> nothing left to confirm afterwards. See
> [student-identity.md](student-identity.md).

**Routes audited:** `/teach/courses`, `/teach/sections/[id]/setup`,
`/teach/sections/[id]/import`, `/teach/sections/[id]/roster`,
`/teach/courses/[id]/templates` —
[courses/page.tsx](../src/app/teach/courses/page.tsx),
[setup/page.tsx](../src/app/teach/sections/[id]/setup/page.tsx),
[roster-import-dialog.tsx](../src/components/staff/roster-import-dialog.tsx),
[nav.ts](../src/components/layout/nav.ts),
[modules/scheduling/index.ts](../src/modules/scheduling/index.ts).

**Companions:** [JOURNEY-STUDENT-FIRSTRUN.md](JOURNEY-STUDENT-FIRSTRUN.md) — this
journey's ordering failure is what causes that one's P0 ·
[PILOT-STRATEGY.md](PILOT-STRATEGY.md) §5 activity #3 · [INTENT-CONTEXT.md](INTENT-CONTEXT.md).

---

## 1. Problem statement

A teacher who has never used this product has to get from an empty account to a
section that can safely receive students. That takes six steps across five
routes: create a course, create a section, import the registrar roster, check
the class list linked every UP email, create a template, set a recurring
schedule.

**The headline is not that these screens are bad. Most of them are good.** The
roster importer is the best-built screen in the product. The finding is that
**six good screens have no thread between them** — no order, no progress, no
readiness state — and one specific ordering mistake permanently strands students
([JOURNEY-STUDENT-FIRSTRUN.md](JOURNEY-STUDENT-FIRSTRUN.md) F1).

This journey is also the one [PILOT-STRATEGY.md](PILOT-STRATEGY.md) §4 Q5 names
as the unsized competitor: the real alternative is staying on Google Forms, and
its switching cost is *this flow*. For the owner that cost is near zero — they
built it. For a second teacher it is the whole question, and it decides whether
this is a tool or a product.

---

## 2. User context

**Protagonist:** a teacher who has never seen this product, mid-semester or just
before it, who has a registrar CSV and a class waiting. They are not evaluating
software; they have agreed to try it and now have to make it work.

**No research exists** ([PILOT-STRATEGY.md](PILOT-STRATEGY.md) §2), and unlike the
student journeys there is not even a defensible structural arc to substitute —
this is the one journey where an hour of observation would change the design
directly, and nobody is booked for it.

The variance that matters:

| | **Owner-teacher (the author)** | **Teacher #2** |
|---|---|---|
| Knows the required order | Yes — built it | **No, and nothing tells them** |
| Knows roster must precede sign-in | Yes | **No** |
| Recovers from a wrong order | Reads the code | Cannot |
| Switching cost | ~0 | The entire question |

Designing only for the first column is how a working pilot becomes a
non-transferable one. Every finding below is invisible from inside the first
column.

---

## 3. Current flow, as built

```
/teach/courses  (empty account)
   ├─ "You do not have any courses yet"   ← title only, no action              ⚠ F5
   └─ create-course form, below the empty state
        │
        ▼
   Create course → Create section
        └─ toast: "Section created. Set its schedule next."                     ⚠ F1
              the ONLY sequencing artifact in the whole journey — and it
              points at the wrong next step if students are about to sign in
        │
        ▼
   Section nav opens on:  Review inbox   ← empty. no students, no cycles.       ⚠ F3
     Section:  Review inbox · Publication queue · Class Q&A ·
               Class list · Roster import · Participation · Backlog
     Manage:   Section setup · Audit history
                └─ setup is 8th, in a separate group

   /teach/sections/[id]/setup
     ├─ Section details · Teaching team · Weekly schedule · Weekly cycles
     ├─ no template? → good empty state, links to template creation             ✓
     └─ ROSTER: not mentioned. not linked. not counted.                         ⚠ F2

   Schedule can be saved, cycles generated, a form opened —
   with zero students imported. No warning.                                     ⚠ F2 F4
        │
        ▼
   Teacher tells the class "sign in"        ← out-of-band, uncontrolled
        └─ if the roster is not imported yet: students strand permanently
           (JOURNEY-STUDENT-FIRSTRUN F1)                                        ⚠ F1
```

**What is already right, and should not be touched:**

- **The roster importer's judgement about each row.** What this document
  praised was the per-row distinctions the planner draws — `create`,
  `enroll_existing`, `reactivate`, `update_name`, `unchanged`, `blocked` — and
  its refusal to guess at an email it cannot trust. All of that is intact in
  [src/modules/roster-import/index.ts](../src/modules/roster-import/index.ts),
  and the commit still re-derives the whole plan inside its own transaction so
  nothing stale can apply the wrong thing.

  **Superseded 2026-09-07 (GitHub issue #12):** the *screen* described here — an
  editable preview walked through before confirming, with an `.xlsx` upload —
  is gone. The class list imports a CSV in one step and then reports the
  outcome, including which file lines were refused and which students are now
  dropped. See [student-identity.md](student-identity.md) §5.
- **The template→schedule dependency is surfaced properly.** No template yields an
  empty state with title, body, and an action pointing at template creation
  ([setup/page.tsx:384-394](../src/app/teach/sections/[id]/setup/page.tsx#L384-L394)),
  and the schedule form requires a template. This is the one dependency the flow
  teaches, and it proves the pattern is available for the others.
- **The scheduler is a single idempotent reconciliation sweep** that doubles as
  the recovery path ([scheduling/index.ts](../src/modules/scheduling/index.ts)) —
  documented, with the pg-boss deferral explained rather than hidden.
- Permission-derived nav: staff see only surfaces they can act on, from the same
  effective permissions the server enforces.

---

## 4. Findings

### F1 · P0 · Nothing sequences the six steps, and the one dangerous ordering is unmentioned

**Evidence.** There is no checklist, no progress indicator, no ordered
"getting started" surface anywhere in the product. The single sequencing artifact
in the entire journey is a success toast: *"Section created. Set its schedule
next."* ([courses/page.tsx:80](../src/app/teach/courses/page.tsx#L80)).

Two problems with that being the whole thread:

1. **It is transient.** It disappears on the next navigation. A teacher who
   closes the tab has nothing to return to.
2. **It points at the wrong step.** If students are about to sign in, the roster
   must come first. Setting the schedule first is harmless; setting the schedule
   *and announcing the tool* before importing is not.

And the dependency that actually matters — **import the roster before students
sign in** — is stated nowhere in the product. Its violation is not a delay: it
permanently strands students, invisibly to staff, with credit lost weekly
([JOURNEY-STUDENT-FIRSTRUN.md](JOURNEY-STUDENT-FIRSTRUN.md) F1).

**Why P0.** The harm is severe, silent, and lands on students rather than on the
person who made the mistake. And the triggering order is the *natural* one — a
teacher explores the product, creates a section, tells the class about it, and
imports the CSV when they next sit down. Nothing in the interface interrupts that
sequence.

**Fix.** A derived section-readiness state, surfaced in three places, plus one
piece of copy at the moment of risk. §5.

### F2 · P1 · The section setup page never mentions the roster

**Evidence.** Grepping
[setup/page.tsx](../src/app/teach/sections/[id]/setup/page.tsx) for
`roster`/`enroll`/`import` returns **zero** hits. The word "student" appears once,
inside explanatory copy about a TA permission.

So the page a teacher goes to in order to *set up a section* does not mention
that the section needs a class list, does not link to the importer, and does not
show how many students are enrolled. A schedule can be saved and cycles generated
against an empty roster with no warning at all.

**Why it matters.** "Section setup" is the surface whose name promises
completeness. A teacher who works it top to bottom will reasonably believe they
are done. They are one step short of the only step whose omission causes harm.

**Fix.** Roster status belongs on the setup page as a first-class item, with a
count and a link, and the schedule form should warn — not block — when the roster
is empty. Not block, because a teacher legitimately configures a section before
the registrar file arrives; the failure is silence, not permission.

### F3 · P1 · Navigation is ordered for steady state, so cold start lands at the operational end

> **Superseded 2026-08-07.** `staffSectionNav` no longer exists. These
> destinations are now a contextual tab strip (`staffSectionTabs`) inside the
> section, not rows in the primary rail, and Roster import left navigation
> altogether for a page-header action on the class list — which dissolves the
> ordering complaint below rather than answering it. See the
> [IA structure banner](IA-STRUCTURE.md) for the two-layer model. The finding
> and its reasoning are kept because they are what motivated the split.

**Evidence.** `staffSectionNav` builds, in order: Review inbox, Publication
queue, Class Q&A, Class list, Roster import, Participation, Question
backlog; then a separate **Manage** group with Section setup and Audit history
([nav.ts:41-125](../src/components/layout/nav.ts#L41-L125)).

For a brand-new section the first destination is **Review inbox** — necessarily
empty, since there are no students, no schedule, and no cycles. Roster import is
fifth. Section setup is eighth, in a different group. Also **Class list
precedes Roster import**, inverting the actual dependency: you import, then you
match.

**Why it matters.** Nav order is the product's implicit answer to "what do I do
now." For the 99% steady-state case the current order is right. For the one-time
case that decides whether teacher #2 succeeds, it is backwards, and the one-time
case is the one with no other guidance.

**Fix.** Order by readiness rather than by role: while a section is not ready,
setup destinations lead and operational ones follow. Taxonomy and labelling are
`/organize`'s to own — this finding is about the *sequence a first-time user is
walked through*, and the handoff is explicit in §8.

### F4 · P1 · No section has a readiness state, so a teacher cannot tell which are safe to announce

**Evidence.** The course list shows each section's title, term, timezone, and an
`inactive` flag ([courses/page.tsx:129-153](../src/app/teach/courses/page.tsx#L129-L153)).
Nothing indicates roster, schedule, or template status. A teacher with three
sections cannot tell which are ready.

**Why it matters.** The out-of-band announcement ("everyone sign in") is the
single riskiest action in this journey and it happens **outside the product**.
The product cannot prevent it, but it can make the readiness state visible before
the teacher walks into class. Right now a teacher has no way to check other than
opening every section and inspecting four separate areas.

**Fix.** §5. Derived, not stored — every input already exists.

### F5 · P2 · Empty-state quality is inconsistent across the same flow

**Evidence.** Well-built, with title, body, and action:

- no template on the setup page ([setup/page.tsx:384-394](../src/app/teach/sections/[id]/setup/page.tsx#L384-L394))
- no roster on the class-list page ([roster/page.tsx](../src/app/teach/sections/[id]/roster/page.tsx))

Bare title only, on the same journey:

- *"You do not have any courses yet"* ([courses/page.tsx:100](../src/app/teach/courses/page.tsx#L100)) — the literal first screen a new teacher sees
- *"No cycles generated yet"* ([setup/page.tsx:568](../src/app/teach/sections/[id]/setup/page.tsx#L568))
- plus the student blocked states ([JOURNEY-STUDENT-FIRSTRUN.md](JOURNEY-STUDENT-FIRSTRUN.md) F2)

**Why it matters.** Catalog: **Inconsistent Patterns** (Cat 9). This is not a
capability gap — the team demonstrably knows how to write a good empty state, and
does, twice, in this flow. It is applied where someone thought about it and
skipped where they did not. The skipped ones cluster on first-run paths, which is
the worst possible distribution.

**Fix.** Every empty state on a first-run path gets a body and an action. The
first screen a new teacher sees should point at the create-course form below it.

### F6 · P2 · Validation errors lose typed input and do not name the field — for the third time

**Evidence.** `describe()` collapses a `ZodError` to *"Check the values you
entered and try again."* ([courses/page.tsx:231-233](../src/app/teach/courses/page.tsx#L231-L233)),
delivered by `redirect` to `?error=`, so the form remounts empty. Which field was
wrong is not stated. Unknown error types are rethrown into the error boundary
([courses/page.tsx:234](../src/app/teach/courses/page.tsx#L234)), replacing the page.

**Why it is worth naming here rather than filing again.** This is the **third
independent occurrence of the same systemic pattern**:

| Surface | Finding | What is lost |
|---|---|---|
| Student weekly form | [JOURNEY-STUDENT-SUBMIT.md](JOURNEY-STUDENT-SUBMIT.md) F2 | typed answers on transport failure |
| Teacher publish composer | [JOURNEY-TEACHER-PUBLISH.md](JOURNEY-TEACHER-PUBLISH.md) F5 | the rewording — the R2 mitigation itself |
| Course / section forms | here | course and section details |

Every staff surface audited so far uses redirect-on-error and destroys input.
The one component built deliberately as a client component —
[weekly-form.tsx](../src/components/student/weekly-form.tsx), whose docstring
explains it exists *"for ONE reason: input must survive a failed submission"* —
already solved it, and the solution did not propagate.

**Fix.** One systemic change, not four: `useActionState` with values held
client-side and field-level messages, on every form that can fail. Server stays
the sole authority. This is a pattern rollout, not a redesign, and it closes one
finding in each of three journeys.

---

## 5. Proposed flow

The core proposal is **one derived value**, `sectionReadiness`, computed from data
that already exists — roster count, template existence, active schedule. No new
entity, no migration.

```
Readiness  =  roster? · template? · schedule?

/teach/courses
   ├─ empty account → empty state WITH action → create-course form            [F5]
   └─ section rows carry a readiness badge:
         "Not ready · no class list"  /  "Ready · 31 students"                [F4]

Section nav — SUPERSEDED, see IA-STRUCTURE.md F1                              [F3]
   This proposal was to reorder by readiness. That is the wrong mechanism:
   it sacrifices positional stability, so the teacher who learns the nav
   during setup has to relearn it afterwards. The structural fix is fixed-order
   REGROUPING by cadence — This week / Class list / Manage — with readiness
   communicated by the badge and notice below, not by moving items.
   IA-STRUCTURE.md is authoritative on nav structure; this file stays
   authoritative on the readiness state.

/teach/sections/[id]/setup
   ├─ readiness summary at the top: the four items, each with a link          [F1 F2]
   ├─ Class list — count, or an empty state pointing at the importer          [F2]
   ├─ Weekly schedule — warns (does not block) when the roster is empty       [F2]
   └─ Weekly cycles

At the moment of risk — schedule saved while roster is empty:                 [F1]
   └─ persistent notice: import before telling students to sign in, and why
```

**Deliberately not proposed:**

- **A wizard.** It would help teacher #1 once and obstruct every later section.
  Readiness is a *state*, not a *sequence* — showing what is missing lets a
  teacher work in any order and still land correctly, which is what actually
  matches how sections get set up in a real term.
- **Blocking the schedule on an empty roster.** Configuring before the registrar
  file arrives is legitimate. The defect is silence, not permissiveness.
- **Notifications for setup readiness.** Email notifications (`F1`) are approved and built for form-opened, deadline reminders and validity changes — but nothing notifies a teacher about an unimported roster, so this journey's problem is unaddressed by them.
- ~~**auto-confirm** (**[Open D2]**)~~ — **not applicable.** D2 was removed on
  2026-08-07 with the name-matching workflow it belonged to; there is nothing to
  auto-confirm because there is no match to confirm (**D23**,
  [student-identity.md](student-identity.md)).

---

## 6. Copy specifications

### F4 — readiness badge on the course list

- `Not ready · no class list` — roster empty
- `Not ready · no schedule` — roster present, no active schedule
- `31 students · 2 rows not imported` — the class list has refused rows, so those
  students have no access until the file is corrected
- `Ready · 31 students · opens Mondays`

The first two are the states that matter. The refused-rows variant is the only
remaining way a student can be stuck, and unlike the old pending-match count it
is entirely in the teacher's hands to clear.

### F1 — the notice at the moment of risk

> **Import the class list before you tell students to sign in.**
>
> A student gets access when their UP email is on this class list — nothing else
> grants it. A student who signs in before the list is imported is told they have
> no classes yet. Importing fixes it on their next page load; they do not sign in
> again and nobody has to link anything.
>
> [Import the class list]

> **Corrected against decision D23 (2026-08-07).** This copy originally said
> students are matched *by name* and that a teacher links accounts *by hand* —
> both describe the removed matching workflow. Access is exact normalized
> UP-email equality against the class list
> ([student-identity.md](student-identity.md)). The finding it serves is
> unchanged: importing late still strands students, and the notice still belongs
> at the moment of risk. What changed is that the fix is now entirely the
> teacher's, with no queue to work through.

Written to be *causal* rather than procedural. "Do this first" is ignorable;
"here is what breaks" is not. It also names the actual mechanism, which is the
only thing that lets a teacher reason about the case the copy did not anticipate.

### F2 — class list on the setup page

Empty:

> **No class list imported yet.** Students have no access until the registrar
> list — with each student's UP email — is imported. [Import the class list]

Populated:

> **31 students** from *Registrar class list, 2 August*. [Re-import] · [Class
> list]

Echoing the provenance string the importer already collects — it was captured for
a reason, and this is the reason.

### F5 — first screen for a new teacher

> **Create your first course**
>
> A course holds your sections, form templates, and question backlog. You will
> add a section and import its class list next.
>
> [Create a course]

Names the next two steps so the shape of the journey is visible from the first
screen, without becoming a wizard.

### F6 — validation errors

Field-level, in place, input preserved:

> Course code is required.

Not *"Check the values you entered and try again."* — which tells the teacher
nothing and costs them their typing.

### Rejected copy

- Any congratulation on setup progress. This is administrative work a teacher
  did not ask for; **[../PRODUCT.md](../PRODUCT.md)** Principle 4 says weekly work
  should feel like finishing, and the same applies here. Confirm and get out of
  the way.
- Percentage-complete framing on readiness. **Artificial Incompleteness** (Cat 4)
  — a completion bar invites clearing the bar rather than understanding what is
  missing. (This objection was originally sharper still, because one of the four
  items — matches — was not in the teacher's control at all. All three remaining
  items are.)

---

## 7. Interaction specifications

| Concern | Spec |
|---|---|
| `sectionReadiness` | Derived per section: roster count, template existence, active schedule. All three are existing queries. Compute alongside `staffSectionAttention` on the dashboard, and on the course list. (A fourth input, a pending-match count, was proposed here before decision **D23** removed account matching; there is no such query and no such state — see §5 and [student-identity.md](student-identity.md).) |
| Cost | Three cheap counts per staff section on two pages. Follows the existing `Promise.all` fan-out in [page.tsx:84-90](../src/app/page.tsx#L84-L90). Measure before caching. |
| Failure of a readiness query | Return null and render nothing, matching `staffSectionAttention`'s existing behaviour ([page.tsx:48-56](../src/app/page.tsx#L48-L56)). Never a partial or misleading badge. |
| Nav reordering | Same `staffSectionNav` function, one branch on readiness. Permission filtering unchanged — readiness never grants a destination a permission would deny. |
| The risk notice | Persistent on the setup page while the roster is empty and a schedule is active. Not dismissible: the condition *is* the risk, so it should clear by being fixed, not by being closed. |
| Forms | `useActionState`, values client-side, field-level errors — the pattern from [weekly-form.tsx](../src/components/student/weekly-form.tsx). Applies to course, section, schedule, and staff forms. |
| Accessibility | Readiness badges convey state in text, not colour alone — already the house rule ([CURRENT_STATE.md](CURRENT_STATE.md) "UI maturity"). The risk notice is a `role="status"` region, not a bare paragraph. |

---

## 8. Multi-channel note

This is the first journey in this product with a genuine out-of-band channel, and
it is where the P0 enters.

| Channel | Carries | Risk |
|---|---|---|
| The product | Course, section, roster, schedule, template | Controlled |
| **The teacher's announcement** — said in class, posted to an LMS, emailed | *"Sign in to the feedback tool"* | **Uncontrolled, and it is the trigger.** Nothing in the product knows it happened, and it can precede the roster import by days. |
| Google SSO | Account creation | Fires the moment a student acts on the announcement |

The product cannot see or gate the announcement. What it *can* do is make the
consequence legible **before** the teacher walks into class — which is F4's badge
and F1's notice. That is the whole reason readiness has to appear on the course
list and not only inside a section: the course list is the last screen a teacher
sees before they go and tell people.

No handoff state needs to persist across this transition. What needs to persist
is the teacher's *understanding*, which is a copy problem, not a state problem.

---

## 9. Metrics

All **[Recommended]**; the audit-for-learning consent question is **[Open]**
([PILOT-STRATEGY.md](PILOT-STRATEGY.md) §6 item 5).

| Signal | Reads on | Source |
|---|---|---|
| Time from section creation to first roster import | F1 F2 — whether readiness surfacing pulls the roster earlier | `classSections.createdAt` → first `roster.imported` audit event |
| Sections that received a student sign-in before their roster import | F1 — direct measure of the harm, and it can be computed **retroactively** | audit event ordering |
| Steps completed in the first session vs later sessions | F1 — whether the journey survives being interrupted | audit event timestamps |
| Order in which the six steps are actually done | F3 — whether the assumed order is the real one | audit events |
| Setup completion by a non-owner teacher, unaided | F4 — the switching-cost question | observation, not telemetry |

The second row is the one worth computing on day one of the pilot: it is the only
finding in this document whose harm can be detected after the fact from data the
product already writes.

**Rejected metrics:** setup completion rate as a funnel, time-to-first-value,
anything treating an institutional tool a teacher agreed to trial as an
acquisition event.

---

## 10. Pending questions and handoffs

1. **The unbooked hour.** [PILOT-STRATEGY.md](PILOT-STRATEGY.md) §5 activity #3 —
   one non-owner teacher doing this cold, unaided, ~60 minutes. Every finding
   above is inference from code; that hour converts them to evidence and will
   almost certainly find something none of them anticipated. It remains the
   highest-value unbooked hour in the project.
2. **[Open D3]** who grants the Teacher role. Upstream of this entire journey and
   unresolved — a teacher who cannot get the role never reaches step one, and that
   path is not designed at all. Out of scope here because it is a policy decision
   first.
3. **Do the three readiness items match what teachers actually consider "ready"?**
   Roster, template, schedule is a code-derived list. A teacher might reasonably
   also want the first cycle previewed. Activity #3 answers it.
4. **D10 — closed 2026-08-03.** A dropped student's enrolment is deactivated and
   their own history stays readable; no data is deleted. Dropped-student
   re-import behaviour still affects roster status messaging once a term is under
   way, and F2's populated copy assumes a first import — so the copy question is
   live even though the decision is not.

**Handoffs:**

- `/organize` — **answered** in [IA-STRUCTURE.md](IA-STRUCTURE.md) F1:
  readiness-ordering is rejected in favour of fixed-order regrouping by cadence.
  §5 above is amended accordingly.
- `/specify` — the systemic form-state rollout in F6 spans three journeys and
  wants one spec, not three.
- `/articulate` — the F1 risk notice is the highest-stakes staff copy in the
  product after the publish flow: it is the only thing standing between a natural
  ordering mistake and students losing credit.
- `/fortify` — roster re-import mid-term, CSV shape drift from the registrar
  (**no sample exists in the repository**, [../PRODUCT.md](../PRODUCT.md)), two
  teachers editing one section's schedule concurrently.
- `/include` — readiness badges and the risk notice as screen-reader content.
- **Not designing here:** the roster importer itself (it is the best screen in the
  product — leave it alone), template authoring, visual design.

---

## 11. Related documents

[JOURNEY-STUDENT-FIRSTRUN.md](JOURNEY-STUDENT-FIRSTRUN.md) ·
[JOURNEY-STUDENT-SUBMIT.md](JOURNEY-STUDENT-SUBMIT.md) ·
[JOURNEY-TEACHER-PUBLISH.md](JOURNEY-TEACHER-PUBLISH.md) ·
[PILOT-STRATEGY.md](PILOT-STRATEGY.md) · [INTENT-CONTEXT.md](INTENT-CONTEXT.md) ·
[student-identity.md](student-identity.md) ·
[weekly-form-workflow.md](weekly-form-workflow.md) ·
[roles-and-permissions.md](roles-and-permissions.md) ·
[open-decisions.md](open-decisions.md)
