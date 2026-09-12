# Journey — Teacher Publish

**Status:** **[Recommended]** flow redesign. Audit of the implemented flow plus
proposed changes. No scope change: every proposal alters an existing MVP
surface. Nothing from [product/scope.md](../../product/scope.md) §2/§3 is promoted — in
particular this does **not** propose building unpublish or a merge UI. (Unpublish
is **approved** — decision **D6**, closed 2026-08-03 — but unbuilt
([engineering/current-state.md](../../engineering/current-state.md) E2); this audit is sized for the app as it
runs today, without it.)
**Owns:** the staff journey from reviewing a student item to a published
anonymous public answer — rewording, the anonymity check, acknowledgment,
publish, and schedule.
> **Route names superseded 2026-09-12 — [ADR-0005](../../decisions/ADR-0005-course-scoped-teaching-workflow.md).**
> Publication is **course**-owned: the queue is `/teach/courses/[id]/publications`,
> the archive is `/courses/[id]/qa`, and drafting happens in the course's
> Responses workspace. The old section routes redirect. Every finding below is
> about the flow — rewording, the anonymity check, the acknowledgment, the
> emphasis between draft and publish — and holds unchanged; what changed is the
> **reach** of the act: publishing once now goes to the whole course, which makes
> the anonymity judgement F7 is about matter more, not less. One thing the move
> retired outright: there is no "which section should see this?" step, so the
> flow has one fewer decision than this audit describes.

**Routes audited:** `/teach/sections/[id]/review` and
`/teach/sections/[id]/publications` (as they were at the time of the audit) —
[review/page.tsx](../../../src/app/teach/sections/[id]/review/page.tsx),
[public-answer-composer.tsx](../../../src/components/staff/public-answer-composer.tsx),
[publications/page.tsx](../../../src/app/teach/sections/[id]/publications/page.tsx),
[modules/publishing/index.ts](../../../src/modules/publishing/index.ts).

**Companions:** [design/context.md](../context.md) ·
[student-submit.md](student-submit.md) (the other one-way
moment — a student's answers stay editable until the deadline, but their
free-text item reaches staff on submit and cannot be unsent) · [domain/public-qa.md](../../domain/public-qa.md) (owns
the rules audited here).

---

## 1. Problem statement

A teacher works a week's submissions and decides, per student item: reply
privately, publish to the class anonymously, both, or neither. Publishing is the
only irreversible act in the product as it runs today: unpublish is **approved**
(**D6**, closed 2026-08-03 — Instructor-only, reason required, audited,
reversible by restore, and it removes the entry from the class archive *and* the
linked asker's history, **D16**) but is **not built**
([engineering/current-state.md](../../engineering/current-state.md) E2 is `schema only`). And once the class
has read a question that identifies its asker, no unpublish retracts that — the
feature would remove an entry, not a memory.

**The decision being made is one question: is this safe to publish?** Every
other staff action is additive and audited. This one is not. So the design
question is not throughput — it is whether the interface gives the teacher the
facts needed to answer that question, at the moment they answer it.

The governing requirement is **[Recommended]** in
[domain/public-qa.md](../../domain/public-qa.md) §3 and backs
Risk R2:

> *"**Pre-publish warning:** the publish/schedule UI **warns the teacher** before
> publishing a highly specific or personal question, prompting them to generalize
> or keep it private."*

The heuristics are explicitly a design detail; **the requirement is that the
warning exists.** Finding F1 is that on the primary publish surface, it does not
render.

---

## 2. User context

Staff, not students — so no research-refusal caveat is needed about emotional
arcs; but note the same evidence gap applies. No teacher has been observed doing
this ([product/pilot-strategy.md](../../product/pilot-strategy.md) §2). The variance that matters here
is **capability**, and that is knowable from the code rather than guessed.

| | **Owner-teacher** | **TA with `publish_public_answers`** | **TA without `view_student_identities`** |
|---|---|---|---|
| Sees identity on the item | Yes | Per flag | **No** — masked, with an explanatory alert ([review/page.tsx:468](../../../src/app/teach/sections/[id]/review/page.tsx#L468)) |
| Can publish | Yes | Yes | Per flag — **independent of identity access** |
| Consequence | — | — | **A TA can publish an answer whose asker they cannot see.** They therefore cannot judge "would the class recognise this person" from the roster. The warning is their only signal, which raises F1 from a gap to a hole. |

Condition: desktop, one triage sitting, between teaching commitments, wanting the
pass to end ([design/context.md](../context.md) §1.2). A teacher in a hurry
is the design's real adversary — not a careless one, a *rushed* one.

---

## 3. Current flow, as built

```
/teach/sections/[id]/review  → select row → item thread
   │
   ├─ Original message, read-only, own block                                    ✓
   ├─ Private reply composer                                                    ✓
   └─ PublicAnswerComposer
        ├─ "Public question"  ← PREFILLED with the student's exact words       ⚠ F3
        ├─ "Public answer"    (empty, required to publish)
        ├─ ☐ "I have checked the public wording"                               ⚠ F2
        └─ [Save as draft] (secondary)   [Publish to this section] (primary)   ⚠ F6
              │
              ├─ publish + box unticked
              │     → CLIENT blocks submit, inline "Check the public wording"  ⚠ F1
              │       no warning content, no server call
              │
              └─ publish + box ticked
                    → server skips the warning block entirely                  ⚠ F1
                    → draftPublicAnswer → publishNow(acknowledged: true)
                    → published. Irreversible.                                 ⚠ F7

   Validation failure ("An answer is required before publishing")
        → redirect ?error=… → composer remounts → rewording LOST              ⚠ F5

/teach/sections/[id]/publications   (secondary surface, drafts only)
   └─ warnings DO render here: "Tick the acknowledgment to publish anyway"      ✓/⚠ F4 F8
```

**What is already right, and should not be touched.** The service layer is the
strong part of this flow:

- `publishNow` and `schedulePublication` **both** gate on the anonymity check
  ([publishing/index.ts:339](../../../src/modules/publishing/index.ts#L339)) — with an
  explicit comment that scheduling is the last human moment before a background
  executor publishes unattended. Correct, and easy to have missed.
- The check reads question text and source count **from the database**, not from
  the form, so a tampered field cannot dodge it
  ([publications/page.tsx:87-88](../../../src/app/teach/sections/[id]/publications/page.tsx#L87-L88)).
- `rewordPublicQuestion` and `updateAnswerBody` refuse to edit a non-draft, so
  different text cannot go out under an acknowledgment given for older wording.
- The original student message is displayed read-only in its own block
  ([review/page.tsx:684-691](../../../src/app/teach/sections/[id]/review/page.tsx#L684-L691)) —
  exactly what [DESIGN.md](../../../DESIGN.md) asks for.
- Identity masking for TAs is a real UI state with an explanation, not a blank.
- The review action deliberately checks anonymity *before* writing, to avoid
  piling up orphan drafts on rejected attempts
  ([review/page.tsx:225-229](../../../src/app/teach/sections/[id]/review/page.tsx#L225-L229)).

The findings below are all in the **interface layer**, which is precisely where
[design/context.md](../context.md) §1.4 predicted the exposure risk would sit.

---

## 4. Findings

### F1 · P0 · The anonymity warning cannot render on the primary publish surface

**Evidence.** Two guards interlock so that no path through the review inbox shows
a warning:

1. The composer's client `onSubmit` blocks the submission when intent is
   `publish` and the box is unticked — `preventDefault()`, show *"Check the public
   wording before publishing."*, focus the checkbox
   ([public-answer-composer.tsx:32-45](../../../src/components/staff/public-answer-composer.tsx#L32-L45)).
   No server call happens, so no warnings are computed.
2. The server's warning branch is `if (intent === "publish" && !acknowledged)`
   ([review/page.tsx:230](../../../src/app/teach/sections/[id]/review/page.tsx#L230)).
   Ticking the box makes the condition false, so the branch — and every warning
   in it — is skipped.

So the two states are: **unticked → cannot submit, no warning shown**, and
**ticked → submits, warning skipped.** There is no third state. The server's
`?warn=` redirect at
[review/page.tsx:232-238](../../../src/app/teach/sections/[id]/review/page.tsx#L232-L238)
is unreachable from a normal browser; it fires only if JavaScript is disabled.

**Why P0.** The **[Recommended]** R2 mitigation is that *the publish UI warns.*
On the surface where publishing actually happens, it does not. The service-layer
backstop still prevents an *unacknowledged* publish — the data invariant holds —
but the invariant it protects is "someone ticked a box", not "someone was told
what to look at." For a TA without identity access (§2), the warning was the only
available signal.

**Fix.** Stop treating the check as a gate on submission and make it a **live
inspection of the text**: run `anonymityWarnings` as the teacher types, render the
flags inline beside the public-question field, and let the acknowledgment refer to
the flags actually shown. Detail in §5.

### F2 · P1 · The acknowledgment is structurally uninformed

**Evidence.** The label is *"I have checked the public wording"*
([public-answer-composer.tsx:79](../../../src/components/staff/public-answer-composer.tsx#L79)) —
tickable before reading anything, and ticking it is the thing that *suppresses*
the warnings (F1).

**Why it matters.** Informed consent is inverted: the acknowledgment gates the
information instead of following it. [../PRODUCT.md](../../../PRODUCT.md) is explicit
that *"Are you sure?" is not informed consent* — this is that pattern with an
extra step. It also cannot support the audit trail's implied meaning: the audit
records that the check was acknowledged, which a reader will interpret as "a human
considered the flagged risks." No human was shown them.

**Fix.** The acknowledgment must name what is being acknowledged. When flags
exist, it enumerates them. When none do, it says so — a check with nothing to
report should read differently from one with three findings.

### F3 · P1 · The public question field is prefilled with the student's exact words

**Evidence.** `defaultValue={originalQuestion}`
([public-answer-composer.tsx:56](../../../src/components/staff/public-answer-composer.tsx#L56)).

**Why it matters.** The zero-effort path publishes the student's verbatim wording,
and rewording is the primary R2 mitigation
([domain/public-qa.md](../../domain/public-qa.md) §3: *"Rewording
must remove identifying context — this is the primary mitigation"*). A default
that requires effort to *not* accept is the wrong default for the one action that
cannot be undone. Combined with F1, the fastest complete path through this screen
is: tick box → publish the student's exact words → no warning ever displayed.

[engineering/security.md](../../engineering/security.md) lists as a hard invariant that the original wording
*"is never used as the public text without the publish warning/review flow."* The
flow nominally exists; its warning half does not render. Prefilling is not itself
the violation — it is what makes the missing half consequential.

**Fix.** Start the field empty, show the original beside it, and offer an explicit
**"Use the original wording"** action. Verbatim publication stays one click away
but becomes a decision rather than a default.

### F4 · P1 · Every single-item publish trips a warning, so warnings mean nothing

**Evidence.** `anonymityWarnings` pushes a warning unconditionally when
`sourceCount === 1`
([publishing/index.ts:228-232](../../../src/modules/publishing/index.ts#L228-L232)), and
the review action passes a hardcoded `1`
([review/page.tsx:231](../../../src/app/teach/sections/[id]/review/page.tsx#L231)).
Merge UI does not exist ([engineering/current-state.md](../../engineering/current-state.md)), so every publish
from the review inbox has exactly one source. Result: the flag list is **never
empty**, on the review surface or the publications surface.

**Why it matters.** A warning that fires on 100% of cases is not a warning. It
trains dismissal, and it takes the three *discriminating* heuristics — first
person, temporal specificity, merged-wording-implying-one-asker — down with it,
because they arrive in the same undifferentiated bullet list. The mitigation
defeats itself.

**Fix.** Separate the always-true fact from the text-specific findings.
"Single source" is ambient context about this product's risk model, so render it
as persistent context near the field, not as an alarm. Reserve the alarm channel
for flags that discriminate. No change to `anonymityWarnings`' role as the
service-layer backstop — this is about which channel each item is presented in.

### F5 · P1 · The failure path destroys the teacher's rewording

**Evidence.** Every failure in `draftOrPublish` is a `redirect` to
`?error=…`/`?warn=…`
([review/page.tsx:213-238](../../../src/app/teach/sections/[id]/review/page.tsx#L213-L238)).
That is a full navigation; the composer remounts and its uncontrolled
`defaultValue` resets the public-question field to the original text. Live today
via the reachable error path: a teacher who rewords carefully, forgets the answer
body, and clicks Publish gets *"An answer is required before publishing"* — and
their rewording is gone, replaced by the student's original.

**Why it matters.** The interface deletes exactly the work that mitigates R2, and
the more careful the teacher was, the more they lose. The student-side equivalent
(F2 in [student-submit.md](student-submit.md)) is the same class
of defect; the student form already solved it deliberately by holding values in
state. The staff composer did not get the same treatment.

**Fix.** Return errors as state instead of redirecting — the pattern the student
form already uses (`useActionState`, values held client-side, server remains sole
authority). No new mechanism; apply the existing one.

### F6 · P2 · The irreversible action is the primary button

**Evidence.** *"Publish to this section"* is `button--primary`; *"Save as draft"*
is `button--secondary`
([public-answer-composer.tsx:86-104](../../../src/components/staff/public-answer-composer.tsx#L86-L104)).

**Why it matters.** [../PRODUCT.md](../../../PRODUCT.md) Principle 1: *"make the unsafe
action harder than the safe one."* Currently the unsafe one is visually dominant
and the safe one recedes. Catalog: **Destructive Defaults** (Cat 9, High) —
irreversible, one click, visually privileged.

**Fix.** Not a modal. Reverse the emphasis (draft primary, publish secondary but
not hidden — [DESIGN.md](../../../DESIGN.md) forbids burying important
actions), and gate publish on the preview in F7 having been shown.

### F7 · P2 · The teacher never sees what the class will see

**Evidence.** Two textareas. No rendering of the resulting archive entry. The
published form exists only in Class Q&A (now `/courses/[id]/qa`), after the fact.

**Why it matters.** The judgement being asked — *could a classmate work out who
asked this* — is a judgement about a **published artifact**, and it is currently
made against an edit field with the original text sitting nearby for contrast.
Read in the archive, stripped of that context, the same words land differently.
The student-side fix shows the student their exact words before an irreversible
act; staff have no equivalent for a strictly more consequential one.

**Fix.** A preview that renders the entry as the Q&A archive renders it —
anonymous attribution, category, date. Not a mockup: the same component.

### F8 · P2 · Warnings render far from the field they describe

**Evidence.** Where warnings do appear (publications page, or the degraded
no-JS path), they render as a page-top `Alert`
([review/page.tsx:453-463](../../../src/app/teach/sections/[id]/review/page.tsx#L453-L463),
[publications/page.tsx:178-186](../../../src/app/teach/sections/[id]/publications/page.tsx#L178-L186))
while the composer is far below, with no focus move.

**Fix.** Subsumed by F1 — inline flags beside the field remove the distance
entirely.

---

## 5. Proposed flow

```
Item thread
   ├─ Original message, read-only                                    (unchanged ✓)
   │
   └─ Public answer composer
        ├─ Public question — EMPTY, original beside it
        │    └─ [Use the original wording]         ← explicit choice        [F3]
        │    └─ live flags as you type, inline:                            [F1 F8]
        │         · first-person wording
        │         · references a specific moment
        │         · merged wording implies one asker
        │    └─ persistent context, not an alarm:                          [F4]
        │         "Single source. In a small section the asker
        │          can stay identifiable even after rewording."
        ├─ Public answer body
        ├─ [Preview as the class will see it]                              [F7]
        │      └─ renders the real archive entry
        ├─ Acknowledgment, naming what it covers:                          [F2]
        │      3 flags → "I have read the 3 flags above and this
        │                 wording cannot identify the asker."
        │      0 flags → "No flags found. I have checked the wording
        │                 myself."
        └─ [Save as draft] (primary)   [Publish] (secondary, enabled
                                        after preview shown)               [F6]
              │
              ├─ validation error → state, not redirect; text kept          [F5]
              └─ publish → published, irreversible (unchanged)
```

Scheduling continues to live on the publications page and inherits the same
composer changes — the service already gates the schedule path
([publishing/index.ts:339](../../../src/modules/publishing/index.ts#L339)), so the UI
change is the composer, not the scheduler.

**Net cost for a clean publish:** one extra click (Preview). **Net cost for a
risky one:** the teacher reads three specific flags they currently never see.

---

## 6. Copy specifications

Voice: plain, calm, precise. Never imply anonymity stronger than provided.
`/articulate` owns the final pass; this is the substance.

### F1/F4 — flags, inline beside the public-question field

Discriminating flags (alarm channel, only when the text trips them):

> **First-person wording.** "I", "my", "me" point at one person. Generalize
> unless the specificity is the question.
>
> **A specific moment.** Naming a day, a meeting, or a personal circumstance can
> identify the asker even without a name.
>
> **Merged wording implies one asker.** Rephrase unless a single asker is safe
> and intentional.

Persistent context (not an alarm — always true, so it never cries wolf):

> One source submission. In a small section the asker can stay identifiable even
> after rewording.

### F3 — original beside the empty field

> **Original message** — the student's exact words. Published text must not carry
> identifying context. [Use the original wording]

### F2 — acknowledgment

With flags:

> I have read the **3 flags** above, and this wording cannot identify the asker.

With none:

> No flags found in this wording. I have checked it myself.

Two strings because a check that found nothing must not read like a check that
found three things. The audit entry should be able to mean something.

### F7 — preview

> **This is what the class will see.** Students in this section see this entry,
> with no asker name. Staff can still trace it to the original submission.
>
> *[rendered archive entry]*
>
> [Publish to this section] [Keep editing]

### F5 — validation errors, in place

> **Not published.** An answer is required before publishing. Your wording has
> been kept.

### Rejected copy

- *"Are you sure?"* on its own. Explicitly named in
  [../PRODUCT.md](../../../PRODUCT.md) as not informed consent.
- Any count-based encouragement to clear the queue — *"3 left to publish"*.
  Publishing is not the goal; publishing *what should be public* is. A queue that
  rewards emptying pushes toward the irreversible action.
- "Anonymous" unqualified. Always name the audience: anonymous **to classmates**,
  never to staff.

---

## 7. Interaction specifications

| Concern | Spec |
|---|---|
| Live flags | Debounce 300 ms on the public-question field; run the same `anonymityWarnings` logic client-side for display only. Server stays the authority and the backstop — unchanged. |
| Flag region | `aria-live="polite"`, associated with the field via `aria-describedby`. A flag a screen-reader user does not hear is a privacy failure, not a polish issue ([design/context.md](../context.md) §4.2). |
| Acknowledgment | Disabled until preview has been shown at least once for the current text. Editing the text after preview clears both the preview-shown state and the acknowledgment. |
| Preview | Inline expansion, not a modal — the teacher needs the original and the flags visible while judging. Uses the archive's own render path so it cannot drift from reality. |
| Errors | `useActionState`, values held client-side, inline messages — the pattern already proven in [weekly-form.tsx](../../../src/components/student/weekly-form.tsx). Stop redirecting on failure. |
| Publish confirmation | None beyond the above. The preview *is* the confirmation; a dialog on top of it would be the ceremony that trains dismissal. |
| Undo | None in the running app, and none proposed here. Unpublish is approved (**D6**) but unbuilt (E2); even shipped it would not undo what the class already read. This is exactly why the pre-publish moment carries the weight. |
| Motion | Feedback only, 200–300 ms: preview expand, flag appearance. Respect `prefers-reduced-motion`. |

`/include` audits the live-region behaviour and the disabled-acknowledgment
pattern; asserting it here is not the same as testing it.

---

## 8. Metrics

All **[Recommended]**; the consent question about reading audit data for product
learning is **[Open]** ([product/pilot-strategy.md](../../product/pilot-strategy.md) §6 item 5).

| Signal | Reads on | Source |
|---|---|---|
| Share of publishes where the public text differs from the original | F3 — whether rewording actually happens once it stops being the default | `publicAnswers.publicQuestionText` vs `studentSubmissionItems.originalText` |
| Flags shown vs flags still present at publish | F1 F4 — whether teachers act on flags once they can see them | client event + published text |
| Preview → keep-editing rate | F7 — how often seeing the artifact changes the decision. **Not a funnel leak.** A teacher who backs out is the design working. | client event |
| Draft-then-publish vs publish-immediately | F6 — whether reversing button emphasis shifts behaviour toward the reversible path | `publicAnswers` state history |
| Private-only resolutions | Counter-metric: if publishing gets more friction, some items should shift to private replies. That is a correct outcome, not a regression. | existing data |

**Rejected metrics:** publishes per session, queue-clear time, any measure that
treats more publishing as better.

---

## 9. Pending questions and handoffs

1. **Do the heuristics catch what actually identifies people?** Four regex rules
   stand in for a hard judgement. Unknown until real submissions exist. The
   design above is built so that *the teacher's* judgement is the mechanism and
   the flags are prompts — which is the right dependency ordering while the
   heuristics are unvalidated.
2. **Is a TA publishing without identity access acceptable?** The flags are
   independent (`publish_public_answers` and `view_student_identities`), which is
   **[Confirmed]** design. §2 argues it makes F1 more serious. Worth an owner
   decision on whether granting one should surface the other's absence —
   [domain/roles-and-permissions.md](../../domain/roles-and-permissions.md) §2.3 already
   **[Recommended]** that capability implications be surfaced to the owner.
3. **D6 unpublish — approved, unbuilt.** Everything above is sized for the app
   as it runs, where publishing cannot be undone. When unpublish ships
   ([engineering/current-state.md](../../engineering/current-state.md) E2), the friction should be revisited
   rather than kept out of habit — but only the *recovery* story changes, not
   the disclosure one.
4. **D8 merge scope — closed 2026-08-03** (within a section, may span cycles;
   cross-section reuse goes through the course backlog). The merge **UI** is
   still unbuilt ([engineering/current-state.md](../../engineering/current-state.md) D3), so F4's fix still
   assumes single-source is the normal case. When that UI ships, source count
   becomes discriminating again and the ambient line should move back into the
   flag channel.

**Handoffs:**

- `/articulate` — the flag strings and the two acknowledgment variants are the
  highest-stakes staff copy in the product.
- `/fortify` — publish-time failure modes: concurrent publish of the same item,
  scheduler firing while a teacher edits, section membership changing between
  draft and publish.
- `/include` — live-region flags, disabled-until-preview acknowledgment, focus
  order in the expanded preview.
- `/evaluate` — the acknowledgment pattern deserves an anti-pattern read of its
  own once rebuilt; the current one would score as a consent-theatre variant.
- **Not designing here:** merge UI (out of scope, and
  [product/pilot-strategy.md](../../product/pilot-strategy.md) §4 Q4 questions whether it is needed),
  the review queue's IA (`/organize`), visual design.

---

## 10. Related documents

[student-submit.md](student-submit.md) ·
[design/context.md](../context.md) · [product/pilot-strategy.md](../../product/pilot-strategy.md) ·
[../PRODUCT.md](../../../PRODUCT.md) ·
[domain/public-qa.md](../../domain/public-qa.md) ·
[domain/roles-and-permissions.md](../../domain/roles-and-permissions.md) · [engineering/security.md](../../engineering/security.md) ·
[../../../DESIGN.md](../../../DESIGN.md) · [decisions/open-decisions.md](../../decisions/open-decisions.md)
