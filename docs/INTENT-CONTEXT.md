# Intent Design Context

**Status:** Design-engagement context for UX work. Not a product-truth document.
**Owns:** the design-side reading of who this product serves, what design
constraints apply, the ethical stance UX work must hold, and what UX success
looks like. It does **not** own product requirements, scope, or implementation
facts.

> **Authority.** [../PRODUCT.md](../PRODUCT.md) and the owning documents in
> [INDEX.md](INDEX.md) outrank this file on every product fact. Where this file
> adds something new, it is labelled and it is **[Recommended]** or
> **[Assumption]** until the owner says otherwise. Label discipline is inherited
> from [../AGENTS.md](../AGENTS.md): **[Confirmed]** · **[Implemented]** ·
> **[Recommended]** · **[Assumption]** · **[Open]**.

---

## 1. Users — by behaviour and condition, not demographics

Role definitions are owned by [roles-and-permissions.md](roles-and-permissions.md).
What follows is the *condition* each user is in when they touch the interface,
because that is what design decisions actually turn on.

### 1.1 Student

- **Job:** finish one form per section this week; optionally say the thing they
  would not say out loud; later find out whether it was answered.
- **Condition when submitting** **[Assumption]**: on a phone, during or right
  after class, close to a hard deadline, with several other coursework deadlines
  competing. Possibly on campus wifi or mobile data.
- **The decision they are actually making:** *how honest to be.* Every student
  weighs candour against exposure before typing the free-text item. This is the
  product's real interaction, and it happens in the student's head — the
  interface either supplies the facts they need to judge exposure correctly, or
  they self-censor, or they over-disclose. Both failure modes are UX failures.
- **What they cannot do** **[Confirmed]**: edit after submitting, submit late,
  see their own participation totals (MVP), see any internal staff state.
- **Structural asymmetry** **[Confirmed], design implication [Recommended]**:
  submission is credit-bearing ([participation-rules.md](participation-rules.md)),
  staff can invalidate a submission, and the student is never shown that
  decision. So the student is being measured on a record they cannot inspect,
  and the person they are giving feedback about is the person holding the
  credit. See §4.1 — this is the sharpest ethical edge in the product.

### 1.2 Teacher

- **Job:** make a week's submissions make sense, reply where needed, publish
  what the class should see, know what is still outstanding.
- **Condition when reviewing** **[Assumption]**: desktop, one sitting, between
  teaching commitments, wanting the pass to *end*.
- **The decision they are actually making:** *is this safe to publish?* Every
  other staff action is reversible or additive. Publishing is not — there is no
  unpublish in MVP (**[Open D6]**), and de-anonymisation cannot be undone once
  the class has read it. Design weight should follow that asymmetry, not the
  frequency of the action.
- Also the administrator of their own courses: rosters, schedules, templates,
  staff, backlog, exports.

### 1.3 Teaching assistant / co-teacher

- Holds a per-section subset of 13 independent capability flags.
- **Design consequence** **[Confirmed]**: a TA without `view_student_identities`
  must be able to do genuine review work with identities masked. Identity
  masking is therefore a first-class UI state, not a data filter — every review
  surface needs a designed masked variant, not a blanked-out one.
- Two TAs on the same screen may legitimately see different affordances. No
  screen may assume the viewer's capabilities from their role name.

### 1.4 Platform administrator

- Grants the Teacher role; handles access and account troubleshooting.
- Deliberately **not** a superuser over course content. Admin surfaces must not
  imply content reach they do not have.

### 1.5 What we do not know about users — **[Open]**

No primary research exists. [DESIGN-RESEARCH.md](DESIGN-RESEARCH.md) and
[ED_DISCUSSION_REFERENCE_PACK.md](ED_DISCUSSION_REFERENCE_PACK.md) are
competitor and pattern study, not user study. There are no interviews, no
usability sessions, no diary studies, no analytics from the incumbent Google
Forms process. Consequences:

- Every student-condition claim in §1.1 is inference and is labelled as such.
- We do not know what the incumbent process actually costs teachers per week,
  so we cannot yet claim the product saves time.
- We do not know whether students currently trust the Google Forms anonymity, or
  what would make them trust this more. Trust is the stated success condition
  and it is the least evidenced thing in the file.
- **Cheapest research that would move this** **[Recommended]**: 5 student
  usability sessions on the submit + free-text moment, and 1 contextual session
  watching a teacher work a real week in the incumbent spreadsheet. Five
  participants surface most major usability issues; this is days of work, not
  weeks, and it converts the whole of §1.1 from assumption to evidence.

---

## 2. Product and delivery context

- **What this replaces** **[Confirmed]**: Google Forms collection plus a
  hand-compiled answer document. Collection is not the problem; everything after
  collection is. Full framing in [product-requirements.md](product-requirements.md).
- **Not a business** — a real teaching unit at UP Department of Computer Science.
  No revenue model, no growth target, no conversion funnel. **This removes the
  usual source of dark patterns and it also removes the usual excuse for them.**
  There is no commercial pressure that could justify a manipulative pattern
  here, so any that appear are pure design defect.
- **Production pilot, not a demo** **[Confirmed]**: real students, real rosters.
  Reliability, privacy, and staff efficiency outrank expressiveness wherever
  they conflict.
- **Maturity** **[Implemented]**: pilot-usable. Student loop, staff loop, and
  operations surfaces are complete end to end across 20 routes
  ([CURRENT_STATE.md](CURRENT_STATE.md), snapshot 2026-08-03). Current work is
  hardening, not new surface area. Design work here is therefore mostly
  *evaluation and repair of an existing interface*, not greenfield.
- **Platform** **[Confirmed]**: web only; native apps are a non-goal. Mobile web
  is a primary case for students and a secondary one for staff.
- **Timeline** **[Open]**: no pilot date is recorded anywhere in the repository.
  Semester boundaries almost certainly bound it. This matters for design because
  it decides whether research fits before the pilot or has to run inside it.
- **Team and approval path** **[Open]**: the docs refer to an "owner" and a
  "technical owner" without naming a design approver, review cadence, or
  engineering capacity. Unknown who signs off on a visual or interaction change.

---

## 3. Hard constraints on design

### 3.1 Constraints that come from the domain — **[Confirmed]**

| Constraint | Design consequence |
|---|---|
| Deadlines are hard; no grace period (**[Open D5]** on exact policy) | A failed submit at 16:59 is lost credit. Submission needs the error-recovery budget normally reserved for payments. |
| No edit after submit | The pre-submit review moment is the student's last chance. It has to be a real review, not a courtesy step. |
| Time drives everything (`scheduled → open → closed`, scheduled publication) | Time is the primary organising fact of every screen, ahead of category, author, or type. |
| Registrar CSV format is fixed; carries student number + full name, no email | Identity matching is a human judgement task with a designed UI, not a background job. |
| Identity resolved by name match + human confirmation | Matching UI must present candidates and uncertainty honestly; there is no auto-confirm path. |
| Small class sizes are normal | Post-anonymisation identifiability is the default risk, not an edge case. |
| Deny-by-default, resource-scoped permissions | Every screen assumes the viewer's capabilities are narrower than their role name. No disabled-affordance teasing of capabilities they lack. |
| Publishing is effectively irreversible in MVP (**[Open D6]**) | The highest-consequence action in the product. Friction must be proportional, and an acknowledgement checkbox alone is probably not proportional. |
| Nothing is ever destroyed — reword, merge, invalidate, re-import are all additive and audited | Any interface implying destruction or overwrite is wrong copy, not just imprecise copy. |

### 3.2 Technical — **[Implemented]**

Next.js App Router modular monolith, PostgreSQL + Drizzle, Auth.js + Google,
server-rendered per navigation. No pg-boss, Redis, broker, or vector DB.
Practical design consequences: no client-side optimistic UI or skeletons today
(pages are server-rendered per navigation), no notification channel of any kind
in MVP — so **every failure must surface in-app or it does not surface at all**
(e.g. failed scheduled publication surfaces only on the publications view).

### 3.3 Regulatory — **[Open]**

No named external mandate is on record. No GDPR/FERPA/COPPA determination has
been made, no institutional data-retention policy exists (**[Open D13]**), and
retention plus deactivated-student access must be settled before real student
data is used. Treat the absence of a mandate as an unfinished question, not as
permission.

### 3.4 Visual system — **[Implemented]** / **[Recommended]**

[UX-DESIGN-BRIEF.md](UX-DESIGN-BRIEF.md) is labelled **[Recommended]**, but its
palette is in fact implemented in `src/app/globals.css` (canvas `#f5f7f2`, ink
`#17231c`, border `#dce5dd`, amber `#a96512` all match; `--muted` shipped as
`#5c6b62` rather than the brief's `#607067`). So the brief describes the
incumbent, and `globals.css` is the de facto authority. Whether to keep or
replace it is a live design decision and is **[Open]**.

**[Confirmed]** brand constraints: product name "Class Feedback Platform"; UP is
named in copy but no UP marks, logos, or official colour system may be
reproduced or approximated; Ed Discussion / Piazza / Slido may be studied for
interaction patterns but never for logos, identity, copy, assets, or layout.
Voice is plain, calm, precise — overstated or playful copy near an anonymity
promise or a hard deadline reads as untrustworthy.

---

## 4. Ethical stance

Most of this is already committed elsewhere. It is gathered here so design work
can be checked against it in one pass, and because two items (§4.1, §4.2) are
not stated in any existing document.

### 4.1 The core asymmetry — **[Recommended]** framing, **[Confirmed]** facts

Submission is not voluntary in the way a product survey is voluntary. It carries
participation credit. The student is giving feedback *to the person who holds
that credit*, staff can invalidate the submission, and the student sees neither
the validity decision nor their own running total (MVP).

This is not a defect to fix — the credit link is the confirmed product — but it
is the condition under which every student-facing design decision is made, and
it sets three obligations:

1. **Never overstate anonymity.** Already **[Confirmed]** in
   [../PRODUCT.md](../PRODUCT.md). Restated here because it follows from the
   asymmetry: students are anonymous *to classmates*, never to staff. Copy must
   say which, at the moment of typing, not in a policy page.
2. **Never use participation credit as leverage in copy.** No "don't lose your
   participation," no streak framing, no shame in a reminder. Loss framing
   (catalog Cat 3) is cheap and effective here precisely because the stake is
   real, which is exactly why it is off-limits.
3. **Treat the invisible-record problem as an open design question, not a
   settled one** — **[Open]**. Hiding totals protects students from
   gamification; it also means they cannot verify a record they are graded on.
   MVP hides them (**[Confirmed]**), so no change is proposed. Flagged so it is
   a decision on the record rather than an oversight.

### 4.2 Anti-pattern positions specific to this product

Checked against the Intent anti-pattern catalog. The whole catalog is rejected;
these are the ones with a real foothold here.

| Catalog pattern | Foothold in this product | Position |
|---|---|---|
| **Destructive Defaults** (Cat 9, High) | Publishing an identifying question is irreversible in MVP | Highest-consequence action in the product. Friction must be proportional to consequence, and the safe option must be the easy one. **[Recommended]** treat the current acknowledgement guard as a floor to be tested, not as done. |
| **Broken Error Recovery / Missing Feedback** (Cat 9, High) | Hard deadline + no notifications + no edit-after-submit | A submit failure near the deadline costs real credit. Recovery must preserve typed input (**[Implemented]** — inline validation preserves input) and must never leave state ambiguous. |
| **Loss Framing** (Cat 3, Medium) | Participation credit is a genuine stake | Rejected outright — see §4.1(2). |
| **Artificial Incompleteness** (Cat 4, Medium) | Progress/completeness framing on a credit-bearing weekly form | Rejected as a motivator. Progress indication for *orientation within a long form* is fine; progress as pressure is not. |
| **Confirmshaming** (Cat 1, High) | Any prompt that nudges a student to submit or to make a question public | Rejected. "No thanks" paths stay neutral. |
| **Trick Questions / Visual Misdirection** (Cat 1) | The private-vs-public choice, and the publish flow | The visibility choice must never be phrased so that the cautious option looks like the negative one. |
| **Assistive Technology Traps / Low-Contrast Opt-Out** (Cat 6, Critical/High) | Anonymity-relevant controls and warnings | The identity boundary must be legible to assistive tech at the same strength as it is to sighted mouse users. A privacy warning that a screen-reader user misses is a privacy failure. |
| **Smoothed-arc Personas** (Cat 10, High) | Zero primary research + a single confident student archetype in the docs | Live risk. §1.1 is deliberately labelled **[Assumption]** rather than written as a persona. |

### 4.3 Positions already confirmed elsewhere

Data minimisation (roster carries no email); anonymous-by-default legacy import;
no student PII to any AI service, ever; identity-bearing exports staff-only and
audited; append-only audit; internal state never leaks into a student view; no
social mechanics (voting, reactions, public identity, open comments) anywhere in
scope. Sources: [SECURITY.md](SECURITY.md),
[public-qa-and-source-linking.md](public-qa-and-source-linking.md),
[legacy-question-import.md](legacy-question-import.md),
[ai-future-plan.md](ai-future-plan.md), [mvp-scope.md](mvp-scope.md).

### 4.4 Vulnerable users

No specific named user needs are on record (**[Confirmed]** per
[../PRODUCT.md](../PRODUCT.md)). But the population is students in a
power-asymmetric relationship, under deadline, who may be reporting distress,
harassment, or a problem with the teacher who will read it. Design accordingly:
the free-text moment can carry serious content, and the interface should not be
cheerful at it.

---

## 5. Accessibility posture

**[Confirmed]**: no external mandate, no required standard, no named user needs.
**[Recommended]** working floor: **WCAG 2.1 AA** — contrast, full keyboard paths,
visible focus, correct semantics for the review queue and all form controls,
reduced-motion respect. (Intent's own reference baseline is WCAG 2.2; the
product's stated floor is 2.1 AA. Recorded so the difference is deliberate, not
drift.)

Two product-specific reasons this outranks its mandate level:

1. A blocked interaction at the deadline is lost participation credit, not an
   inconvenience.
2. The anonymity model depends on students *correctly understanding* what is
   public. That is a legibility and plain-language problem as much as a contrast
   one — which puts cognitive accessibility on the critical path, not the nice-to-have list.

**[Implemented]** today: shared `AppShell` with landmarks, skip link,
breadcrumbs, per-workspace privacy note; visible global focus ring;
`aria-invalid` + `aria-describedby` on failing fields and grouped choices; status
conveyed by text and shape rather than colour alone; responsive collapse with a
keyboard-accessible drawer on phones. Not yet verified by audit — no browser
end-to-end suite exists ([TESTING.md](TESTING.md), [CURRENT_STATE.md](CURRENT_STATE.md)).

---

## 6. What UX success looks like

**[Confirmed]** product success: a real pilot semester in which teachers stop
maintaining the manual answer document, and students trust the anonymity enough
to keep asking.

Design-side reading of that — **[Recommended]**, and note that the signals in
[PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) are explicitly proposed rather than
agreed, so nothing below is an approved metric:

| Outcome | Signal | Why not the obvious metric |
|---|---|---|
| Students keep asking | Free-text item rate holds or rises across the semester, per section | Submission rate alone measures the credit incentive, not trust. The free-text item is optional, so it is the only voluntary act in the flow — it is the trust signal. |
| Students understand the boundary | Students can state correctly who sees what, when asked | Cannot be inferred from behaviour. Needs to be asked. |
| No anonymity incident | Zero published entries traceable to an asker by a classmate | Counter-metric, and the one that outranks everything else. |
| Teachers stop the manual document | The manual answer document is not maintained for a pilot section | The whole point. Directly observable. |
| The weekly pass ends | A teacher reaches a genuine "nothing left this week" state | "Time in product" would reward the opposite of the goal (Principle 4: finishing, not administering). |
| Nobody loses credit to the interface | Zero lost submissions attributable to UI failure near the deadline | Ties the accessibility and error-recovery work to a real stake. |

**Metrics explicitly rejected:** engagement, session length, return frequency,
anything that would make a student's compulsory weekly task into something the
product wants more of.

---

## 7. Design principles inherited

Owned by [../PRODUCT.md](../PRODUCT.md#product-principles); listed for use, not
restated in full: (1) anonymity is a promise the interface has to keep;
(2) show people only their own truth; (3) never destroy the original;
(4) weekly work should feel like finishing, not administering; (5) the rhythm is
the product.

Terminology is domain vocabulary, not decoration: **Course → Class Section →
Weekly Feedback Cycle**. "Automatically generated" means schedule-driven, never
AI-generated. Participation *validity* is an internal staff decision. *Backlog*
is course-level and separate from the weekly dashboard.

---

## 8. Open questions this context cannot close

Design work should proceed on the recorded assumptions and stop at these.

1. **No primary user research** (§1.5). Blocks any confident claim about student
   trust or teacher time saved.
2. **Pilot date unknown** (§2). Decides whether research runs before or during
   the pilot.
3. **No named design approver or review cadence** (§2).
4. **Regulatory position undetermined** (§3.3), including retention
   (**[Open D13]**) and deactivated-student access (**[Open D10]**).
5. **Whether to keep or replace the incumbent visual system** (§3.4).
6. **Publish-friction adequacy** (§4.2) — is an acknowledgement guard
   proportional to an irreversible de-anonymisation? Untested.
7. **Student-invisible participation record** (§4.1(3)) — settled for MVP,
   worth a deliberate decision rather than an inherited one.
8. All entries in [open-decisions.md](open-decisions.md) that change a user-
   visible rule: **D4** edit lock, **D5** grace/reopen, **D6** unpublish,
   **D8** merge scope, **D9** join code, **D10** dropped-student access.

---

## 9. Related documents

[../PRODUCT.md](../PRODUCT.md) · [INDEX.md](INDEX.md) ·
[product-requirements.md](product-requirements.md) · [mvp-scope.md](mvp-scope.md) ·
[roles-and-permissions.md](roles-and-permissions.md) ·
[public-qa-and-source-linking.md](public-qa-and-source-linking.md) ·
[participation-rules.md](participation-rules.md) ·
[weekly-form-workflow.md](weekly-form-workflow.md) · [SECURITY.md](SECURITY.md) ·
[UX-DESIGN-BRIEF.md](UX-DESIGN-BRIEF.md) · [CURRENT_STATE.md](CURRENT_STATE.md) ·
[open-decisions.md](open-decisions.md)
