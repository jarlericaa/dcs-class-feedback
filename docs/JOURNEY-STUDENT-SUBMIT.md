# Journey — Student Weekly Submit

> **Partly superseded, 2026-08-06.** The course is now the primary workspace and
> the form is the work object; a section provides audience and access. The setup
> and submission steps below still describe the right *decisions*, but the routes
> and the per-section framing have changed — see
> [FORMS-AUDIENCE-DYNAMIC-INSTANCES.md](FORMS-AUDIENCE-DYNAMIC-INSTANCES.md) §7
> for the current route map. A student now opens a **form** (`/forms/[id]`), and a
> teacher configures delivery once on the form rather than once per section.

**Status:** **[Recommended]** flow redesign. Audit of the implemented flow plus
proposed changes. No scope change: every proposal is a change to an existing MVP
surface, nothing from [mvp-scope.md](mvp-scope.md) §2/§3 is promoted.
**Owns:** the student submit journey — entry, the free-text visibility moment,
pre-submit review, error recovery, deadline behaviour, and re-entry.
**Route audited:** `/sections/[id]` —
[src/app/sections/[id]/page.tsx](../src/app/sections/[id]/page.tsx),
[src/components/student/weekly-form.tsx](../src/components/student/weekly-form.tsx),
[src/modules/forms/submission.ts](../src/modules/forms/submission.ts).

**Companions:** [INTENT-CONTEXT.md](INTENT-CONTEXT.md) (user conditions, ethical
stance) · [PILOT-STRATEGY.md](PILOT-STRATEGY.md) (what the pilot must learn).

---

## 1. Problem statement

A student has one job per section per week: complete the form before a hard
deadline. Optionally, they add their own question or feedback.

**The real interaction is not filling the form. It is deciding how honest to
be.** That decision happens once, at the free-text field, and it is made from
whatever the interface has told the student about who will read it. Everything
else on the screen is data entry.

Two consequences set the stakes:

- **Credit.** Submitting is participation ([participation-rules.md](participation-rules.md)).
  A failure to submit is lost credit, and the deadline is hard with no grace
  (**[Open D5]**). No edit, no withdrawal, no late path.
- **Exposure.** The free-text item may be published to the class, reworded, with
  the asker anonymous to classmates but never to staff
  ([public-qa-and-source-linking.md](public-qa-and-source-linking.md)).

So this flow can cost a student credit or expose them. Both are irreversible.
That is what earns it the design attention, not its volume.

---

## 2. User context — and a refusal

The storytelling discipline's `protagonist-arc` wants one user, one goal, one
emotional curve. **I am not drawing that arc, because there is no research to
draw it from.** Zero primary research exists ([PILOT-STRATEGY.md](PILOT-STRATEGY.md) §2).
A single confident arc here would be false coherence — a fictional composite the
team empathises with instead of actual students.

What the evidence does support is that this population **certainly splits**, and
the split is the thing that matters. The free-text item is optional
([weekly-form.tsx:251](../src/components/student/weekly-form.tsx#L251)), so:

| | **The non-asker** *(size unknown)* | **The asker** *(size unknown)* |
|---|---|---|
| Goal | Get credit. Finish. | Say the thing they won't say aloud. |
| Arc shape | Habit, not quest. Recurring weekly chore — a *kishōtenketsu* shape, not a hero's journey. No obstacle, no turning point, just repetition. | Goal-driven with a real turning point: the moment they decide whether to type it. |
| Peak tension | Submit tap (did it go through?) | The free-text field (who will read this?) |
| Failure mode | Forgets, misses deadline, loses credit | Self-censors, or over-discloses and regrets it |
| Design needs | Speed, certainty, low ceremony | Facts about visibility, and time to reconsider |

**These two want opposite things.** The non-asker wants the form to get out of
the way. The asker needs the interface to slow them down at exactly one field.
A single flow has to serve both, which means the friction has to be *local to
the free-text field* and absent everywhere else.

**Unresolved, and it decides the design:** the ratio. If most students never
ask, the product's **[Confirmed]** success condition — *students trust the
anonymity enough to keep asking* — is not currently achievable, and the design
problem is upstream of this flow. [PILOT-STRATEGY.md](PILOT-STRATEGY.md) §5
activity #2 (five sessions) resolves it in about a day.

**Assumed conditions**, all **[Assumption]** per
[INTENT-CONTEXT.md](INTENT-CONTEXT.md) §1.1: phone, during or right after class,
close to deadline, competing coursework, possibly mobile data.

---

## 3. Current flow, as built

```
[Dashboard] → /sections/[id]
                  │
                  ├─ no open cycle ────────→ EmptyState: "No form is open at the moment"   ⚠ F6
                  ├─ already submitted ────→ "Submitted · edits are closed"                 ✓
                  └─ open cycle
                        │
                        ▼
                  Week N form
                  ├─ header: "Closes Friday, 5:00 pm"                                       ✓
                  ├─ badge:  "Open · 30 minutes left"  (server-rendered, frozen)            ⚠ F4
                  ├─ teacher questions ×N   (React state, inline errors)                    ✓
                  ├─ free-text item (optional) — NO visibility copy                         ⚠ F1
                  └─ [Submit this week's form]  ← single tap, irreversible                  ⚠ F5
                        │
                        ├─ validation error ─→ inline errors, input kept, no focus move     ⚠ F7 F8
                        ├─ deadline passed ──→ "The deadline for this form has passed" ⛔    ⚠ F3
                        ├─ network failure ──→ error boundary, everything typed is gone ⛔   ⚠ F2
                        └─ success ──────────→ ?submitted=1 → "Submitted" + irreversibility
                                                notice shown for the first time             ⚠ F5
```

What is already right, and should not be touched: input survives a failed
validation ([weekly-form.tsx:6-14](../src/components/student/weekly-form.tsx#L6-L14)
is explicit about why), server is sole validation authority, absolute deadline
time is always shown alongside the relative one, `aria-invalid` +
`aria-describedby` are wired per field and per group, error `Alert` carries
`role="alert"` ([ui/index.tsx:51](../src/components/ui/index.tsx#L51)), required
markers have a `visually-hidden` text equivalent.

---

## 4. Findings

Ranked by consequence, not frequency.

### F1 · P0 · The visibility promise is absent at the moment of decision

**Evidence.** The free-text fieldset is legend "Your own question or feedback
(optional)", two selects, a textarea, placeholder *"Ask anything about this week,
or tell your teacher what would help."*
([weekly-form.tsx:251-301](../src/components/student/weekly-form.tsx#L251-L301)).
Nothing states who reads it. Grepping the student submit route for
`anonymous`/`classmates`/`who can see` returns **nothing** — the word "anonymous"
appears only in `history` (after the fact) and in the archive (other people's
questions).

**Why it is P0.** This contradicts a **[Confirmed]** product principle:
*"Anonymity is a promise the interface has to keep. Every surface that touches
publishing must make the identity boundary visible"* ([../PRODUCT.md](../PRODUCT.md)).
It also drops a **[Recommended]** instruction already on record in
[UX-DESIGN-BRIEF.md](UX-DESIGN-BRIEF.md): *"Keep the student-originated question
area visually separate and explain that the question can be reworded before
publication."* Separation shipped; the explanation did not.

The student is being asked to make the product's central decision with the
relevant facts withheld. Both failure modes are silent: self-censorship looks
like an empty field, over-disclosure looks like a normal submission.

**Fix.** Persistent copy inside the fieldset, above the textarea — not a tooltip,
not a link, not a modal. Three facts, plainly, in §6.

### F2 · P0 · A network failure destroys everything typed

**Evidence.** Answers live in `useState`
([weekly-form.tsx:65-68](../src/components/student/weekly-form.tsx#L65-L68)) with
no persistence. A non-`SubmissionError` throw propagates past the catch
([page.tsx:234](../src/app/sections/[id]/page.tsx#L234)) to the error boundary,
replacing the page. The deliberate input-preservation design covers *validation*
failure only; transport failure was not in scope.

**Why it is P0.** Primary case is a phone on mobile data near a deadline. Also
covers the far more common non-error path: backgrounded tab evicted by iOS,
browser crash, accidental back-navigation. A weekly form with a paragraph
question plus free text is several minutes of typing, and the student may not
retype an honest disclosure a second time. **Journey state management is entirely
absent** — no draft, no resume, no re-entry.

**Fix.** Debounced `localStorage` draft keyed on `cycleId`, restored on mount
with a visible "Draft restored" notice and a discard control. Client-only, no
schema change, no server surface. Cleared on successful submit. Deliberately
*not* a server draft: that would put unsubmitted student text in the database
with no retention policy (**[Open D13]**) and no consent story.

### F3 · P0 · Deadline-passed is a dead end that strands finished work

**Evidence.** Server throws `SubmissionError("The deadline for this form has
passed")` with no details ([submission.ts:89-91](../src/modules/forms/submission.ts#L89-L91));
the page maps a detail-less error to `errors[""]`
([page.tsx:225](../src/app/sections/[id]/page.tsx#L225)); the student sees
*"Your form was not submitted"* / *"The deadline for this form has passed"* and
nothing else. Their answers are still on screen and now permanently
unsubmittable.

**Why it is P0.** Catalog: **Dead Ends** and **Broken Error Recovery** (Cat 9,
High). The stake is real credit. And the copy is incomplete on the facts — a
staff reopen is possible and audited (**[Open D5]**), so "the deadline has
passed" is true while "there is nothing you can do" is *not*, yet that is what
the screen communicates.

**Fix.** Keep the refusal, add the path: what happened, that their text is
preserved locally, that a reopen is at staff discretion, and a link to their
submission history. Copy in §6. This does not promise a reopen — **[Open D5]** is
unresolved and the copy must not resolve it.

### F4 · P1 · The countdown goes stale while the student types

**Evidence.** `timeRemaining(cycle.deadlineAt)` is evaluated during server render
([page.tsx:247](../src/app/sections/[id]/page.tsx#L247)); pages are server-rendered
per navigation ([CURRENT_STATE.md](CURRENT_STATE.md) §"UI maturity") with no
client timer. Open the form at 16:30 against a 17:00 deadline, see *"30 minutes
left"*, type for 35 minutes, and the badge still reads *"30 minutes left"* at the
moment submission is refused.

**Why it is P1 not P0.** The absolute deadline is correct and always visible
(*"Closes Friday, 5:00 pm"*, [page.tsx:253](../src/app/sections/[id]/page.tsx#L253)),
so the screen is not lying — one of two time signals silently freezes. It sets up
F3 rather than causing loss directly.

**Fix.** Narrow: a client-side tick **only under 60 minutes remaining**, plus a
one-time non-blocking notice at T−5. Above an hour the coarse server text is
fine and a live clock would be pure anxiety. Absolute time stays as the anchor.

### F5 · P1 · Irreversibility is disclosed only after it is irreversible

**Evidence.** One tap on "Submit this week's form"
([weekly-form.tsx:304](../src/components/student/weekly-form.tsx#L304)) commits
permanently. The fact arrives afterwards, on the success screen: *"Submissions
cannot be edited, so nothing here can be changed or withdrawn."*
([page.tsx:111-113](../src/app/sections/[id]/page.tsx#L111-L113)).

**Why it matters.** Catalog: **Destructive Defaults** (Cat 9, High) — an
irreversible action on a single tap. [INTENT-CONTEXT.md](INTENT-CONTEXT.md) §3.1
holds that with no edit path, the pre-submit moment is the student's only review,
so it has to be a real one. Right now there is none.

**Fix.** Not a confirmation dialog — for the non-asker that is ceremony on a
weekly chore, and a dialog nobody reads protects nobody. Instead: state the
finality *next to the button* before the tap, and require a review step **only
when the free-text field is non-empty** — the one case where the content is
sensitive and unrecoverable. Friction lands on the asker, who needs it, and never
on the non-asker, who does not.

### F6 · P2 · Three different situations render as one empty state

**Evidence.** `<EmptyState title="No form is open at the moment" />` with no body
and no action ([page.tsx:77](../src/app/sections/[id]/page.tsx#L77)) — though
`EmptyState` supports both ([ui/index.tsx:59-67](../src/components/ui/index.tsx#L59-L67)).
And `getOpenCycleForStudent` returns `null` for a cycle whose deadline has passed
while still `open`-stated ([submission.ts:188](../src/modules/forms/submission.ts#L188)),
so **"you just missed the deadline"** and **"it is Tuesday and nothing is open
yet"** are the same screen.

**Fix.** Differentiate on data the page already holds: between cycles (say when
the next opens), deadline just passed (say so, link history), no schedule
configured yet (say the teacher has not set one up). Give each an action.

### F7 · P2 · Every mistake costs a full server round trip

**Evidence.** `noValidate` disables native validation
([weekly-form.tsx:88](../src/components/student/weekly-form.tsx#L88)) — correct,
the server is the authority — but nothing fills the gap client-side. A missed
required question at 16:58 costs a round trip, a re-read, a fix, and a second
submit.

**Fix.** Error *prevention*: a local completeness check on submit that scrolls to
and focuses the first unanswered required question without claiming authority.
The server still validates and still wins. This is a hint, not a gate.

### F8 · P2 · Focus does not move to the error

**Evidence.** On error the `Alert` renders with `role="alert"` (so it announces)
but focus stays on the submit button at the bottom of the form. The alert says
*"Check N questions below"* with no link to the first one
([weekly-form.tsx:91-95](../src/components/student/weekly-form.tsx#L91-L95)).

**Fix.** Move focus to the alert on error; make the count a link to the first
invalid field. Folds into F7's fix.

---

## 5. Proposed flow

```
/sections/[id]
   │
   ├─ no open cycle ──→ differentiated empty state + action                          [F6]
   ├─ already submitted → unchanged
   └─ open cycle
         │
         ▼
    Week N form
    ├─ "Closes Friday, 5:00 pm"  +  live countdown under 60 min                       [F4]
    ├─ draft restored? → "Draft restored · Discard"                                   [F2]
    ├─ teacher questions ×N  (autosave to localStorage, debounced)                    [F2]
    ├─ FREE-TEXT BLOCK
    │    └─ visibility facts, always visible, above the textarea                      [F1]
    ├─ finality line beside the button                                                [F5]
    └─ [Submit]
          │
          ├─ local completeness check fails → focus first gap, no round trip          [F7]
          ├─ free-text non-empty → review step: exact text + who sees it → [Submit]   [F5]
          ├─ server validation error → focus alert, link to first field, input kept    [F7 F8]
          ├─ deadline passed → refusal + preserved draft + history link + reopen note [F3]
          ├─ network failure → retry in place, draft intact, no error boundary        [F2]
          └─ success → clear draft → "Submitted"
```

Net change for a non-asker who fills the form correctly: **zero added steps.**
The review step triggers only on non-empty free text. That is the point.

---

## 6. Copy specifications

Voice per [../PRODUCT.md](../PRODUCT.md): plain, calm, precise. Never imply an
anonymity guarantee stronger than the system provides. Detailed voice work is
`/articulate`'s; this is the substance each string must carry.

### F1 — visibility block, inside the free-text fieldset

> **Your own question or feedback** (optional)
>
> Your teacher and the teaching staff for this section will see this **with your
> name**. Your classmates will not.
>
> If your teacher answers it for the whole class, they publish it **without your
> name**, and they may reword it first. You will see the published version in
> your submissions.

Three facts, in the order the student needs them: who sees it as me, who never
does, what happens if it goes public. "With your name" is stated plainly because
the alternative — implying staff anonymity — is the one thing
[../PRODUCT.md](../PRODUCT.md) forbids. **Localization flag:** "without your
name" survives translation; "anonymous" alone does not, and is doing too much
work in most products.

### F3 — deadline passed

> **The deadline has passed and this form is closed**
>
> Nothing you typed has been sent. It is saved in this browser, so it will still
> be here if you come back.
>
> Reopening a closed form is up to your teacher. If you need to ask, contact
> them directly — there is no request you can send from here.
>
> [See my submissions]

Fact, then state of their work, then the honest limit. It does not promise a
reopen (**[Open D5]**) and does not pretend nothing can be done.

### F5 — finality, beside the submit button

> Once you submit, this form is final — it cannot be edited or withdrawn.

### F5 — review step (free text non-empty only)

> **Before you submit**
>
> This is what you wrote. Staff will see it with your name. If it is published to
> the class, your name is removed.
>
> *[exact text, read-only]*
>
> [Submit this week's form] [Go back and edit]

Shows their exact words back. No summarising, no paraphrase.

### F2 — draft restored

> **Draft restored.** You had unsent answers in this browser. [Discard draft]

### F6 — empty states

- Between cycles: **"No form is open right now"** — *"The next form for this
  section opens {when}."* → [Class Q&A archive]
- Deadline just passed: **"This week's form has closed"** — *"It closed {when}.
  Closed forms cannot be submitted."* → [See my submissions]
- No schedule: **"No forms have been scheduled yet"** — *"Your teacher has not
  set up a weekly schedule for this section."* → [Class Q&A archive]

### Rejected copy

- Anything using participation credit as leverage — *"don't lose your
  participation"*, streaks, week counts. Loss Framing (Cat 3) and specifically
  banned by [INTENT-CONTEXT.md](INTENT-CONTEXT.md) §4.1(2). The stake is real,
  which is exactly why it is off-limits.
- Any nudge toward filling the free-text field. It is optional; an empty field is
  a valid answer. Confirmshaming (Cat 1).
- Cheerfulness at the free-text field. It may carry a report of distress or a
  complaint about the person who will read it ([INTENT-CONTEXT.md](INTENT-CONTEXT.md) §4.4).
- "Anonymous" unqualified, anywhere in this flow. Always name the audience.

---

## 7. Interaction specifications

| Concern | Spec |
|---|---|
| Draft autosave | Debounce 500 ms → `localStorage`, key `draft:{cycleId}`. Restore on mount. Clear on success. Never server-side (**[Open D13]** retention). |
| Countdown | Client tick only when remaining < 60 min; 1 min granularity. One-time non-blocking notice at T−5. Absolute time always present and never replaced. |
| Completeness pre-check | On submit, before the action: find first unanswered required question, `scrollIntoView`, focus it. Advisory only — server remains authority. |
| Review step | Inline panel, not a modal — a modal on mobile mid-form loses context and traps focus. Focus moves to the panel heading; back returns focus to the free-text field. |
| Error focus | On error, focus the `role="alert"` container; error count links to first invalid field. |
| Network failure | Catch transport failure in the action; return a form-level error instead of throwing. Never let it reach the error boundary — that unmounts the draft. Retry in place. |
| Motion | Feedback only, 200–300 ms: draft-restored notice, review panel, submit success. Respect `prefers-reduced-motion`. |
| Undo | None exists and none is proposed — no edit after submit is **[Confirmed]**. Which is precisely why F5's pre-submit review carries the weight. |

Accessibility is audited by `/include`, not here. Two things this flow must not
break: the visibility block in F1 has to be in the accessible name or description
of the free-text field, not decorative text near it — an anonymity warning a
screen-reader user misses is a privacy failure, not a polish failure
([INTENT-CONTEXT.md](INTENT-CONTEXT.md) §4.2). And the review step must not trap
focus.

---

## 8. Metrics

Tie to [INTENT-CONTEXT.md](INTENT-CONTEXT.md) §6. All **[Recommended]**; the
consent question about reading audit data for product learning is **[Open]**
([PILOT-STRATEGY.md](PILOT-STRATEGY.md) §6 item 5).

| Signal | Reads on | Source |
|---|---|---|
| Free-text item rate per section per cycle | F1 — whether stating the facts raises or lowers asking | existing response data |
| Submission timing distribution vs deadline | F3, F4 — how much traffic is in the last hour at all | `submittedAt` vs `deadlineAt` |
| Submissions refused for deadline-passed | F3 — how often the dead end is actually hit | audit |
| Draft-restored rate | F2 — how often work would otherwise have been lost | client event, if permitted |
| Review-step back-out rate | F5 — how often a student reconsiders once shown their words. **Not a funnel leak.** A student choosing to edit or withhold is the feature working. | client event, if permitted |

**Rejected metrics:** time-on-form (lower is not better — the asker should take
longer), completion-rate-as-conversion (this is compulsory; the rate measures the
credit incentive, not the design), any engagement measure. See
[INTENT-CONTEXT.md](INTENT-CONTEXT.md) §6.

---

## 9. Pending questions and handoffs

**Blocking nothing, but the answers would change the design:**

1. **Asker / non-asker ratio** — `/investigate`, five sessions. Decides whether
   F1 is the highest-value fix in the product or a correctness fix on a path few
   students take.
2. **Do students currently read the free-text field as anonymous-from-staff?**
   Five sessions answers it. If yes, F1 is not an improvement — it is a
   correction of a false belief the product is currently benefiting from.
3. **[Open D5]** grace/reopen — F3's copy is written to survive either outcome,
   but should be revised once the policy lands.
4. **[Open D13]** retention + the audit-for-learning consent question — gates §8.

**Handoffs:**

- `/articulate` — the F1 block and F3 copy are the highest-stakes strings in the
  product. Worth a proper pass, including plain-language and readability scoring.
- `/fortify` — F2 and F3 are error-path work; full state inventory for this route
  (offline, slow 3G, cycle closing mid-session, session expiry mid-form) is
  theirs.
- `/include` — the F1 accessible-description requirement and the review-step
  focus behaviour need an audit, not an assertion.
- `/wireframe` — if the review step and the F1 block need layout resolution
  before build.
- **Not designing here:** IA and navigation (`/organize`), the teacher publish
  journey (separate `/journey` pass — the other irreversible flow), visual design.

---

## 10. Related documents

[INTENT-CONTEXT.md](INTENT-CONTEXT.md) · [PILOT-STRATEGY.md](PILOT-STRATEGY.md) ·
[../PRODUCT.md](../PRODUCT.md) · [weekly-form-workflow.md](weekly-form-workflow.md) ·
[public-qa-and-source-linking.md](public-qa-and-source-linking.md) ·
[participation-rules.md](participation-rules.md) ·
[UX-DESIGN-BRIEF.md](UX-DESIGN-BRIEF.md) · [open-decisions.md](open-decisions.md)
