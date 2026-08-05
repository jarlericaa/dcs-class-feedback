# Content and Voice

**Status:** **[Recommended]** voice framework, register rule, and copy decisions.
No scope change. The **[Confirmed]** voice statement in
[../PRODUCT.md](../PRODUCT.md) is the input; this file turns it into something
decidable.
**Owns:** the voice framework, the user/system register boundary, microcopy
patterns, the error-message inventory, and the label decisions handed over from
[IA-STRUCTURE.md](IA-STRUCTURE.md).
**Does not own:** navigation structure ([IA-STRUCTURE.md](IA-STRUCTURE.md)), flow
sequence (the `JOURNEY-*` files), typography and layout.

**Copy already specified elsewhere is not reprinted here.** The four journey
documents each own their flow's strings; this file owns the *system* those strings
obey, and settles the decisions they deferred.

---

## 1. What is already true

**[Confirmed]** in [../PRODUCT.md](../PRODUCT.md): *"Voice: plain, calm, and
precise. This product handles anonymity promises and a hard deadline; overstated
or playful copy in those moments reads as untrustworthy. Never imply an anonymity
guarantee stronger than the system actually provides."*

Three things the shipped copy already does well, discovered by audit rather than
by document — they should be locked before they drift:

1. **Zero contractions.** Across every string in `src/app` and `src/components`:
   no `don't`, `can't`, `it's`, `you're`. Twenty-five instances of `cannot`,
   `is not`, `do not`, `did not`. That is a completely consistent formal register
   and nothing anywhere records it as a decision. **Codified in §2.**
2. **Some strings name the risk plainly.** *"These files contain student names and
   numbers"* on the participation export. *"Nothing is verified automatically"* on
   the matches page. *"Identities are hidden for your account"* for a masked TA.
   These are the product's voice working correctly — precise about consequence,
   no reassurance the system cannot back.
3. **Domain vocabulary is used consistently.** `Week N`, `cycle`, `section`,
   `validity` appear as the domain defines them, and staff-only terms stay on
   staff surfaces.

The problems are: no rule for which register a user sees (§3), five different
constructions for the same empty state (§5), and internal implementation
vocabulary reaching a teacher (§4 A1).

---

## 2. Voice framework

Four principles. Each has a boundary on **both** sides, so "is this too casual?"
and "is this too cold?" both have answers.

### P1 · Plain, not simplified

Use the shortest word that is still exact. Do not remove precision to sound
friendly, and do not add words to sound thorough.

| Do | Do not |
|---|---|
| "Your form was not sent." | "There was a problem processing your submission." |
| "Staff will see this with your name." | "Please be aware that your identity may be visible to authorized personnel." |

**Boundary on the other side:** plain does not mean vague. *"Something went
wrong"* is short and useless. Precision wins over brevity when they conflict.

### P2 · Calm, not soothing

State facts at their real weight. Do not inflate, and do not comfort.

| Do | Do not |
|---|---|
| "The deadline has passed and this form is closed." | "Oh no! Looks like you just missed it 😕" |
| "Reopening a closed form is up to your teacher." | "Do not worry, it will probably be fine." |

**Boundary on the other side:** calm does not mean indifferent. A student who has
lost credit needs the facts *and* the available path — see P4.

### P3 · Precise about consequence, especially who can see what

Every string that touches visibility, permanence, or credit names the consequence
explicitly. This is the principle the product exists to protect.

| Do | Do not |
|---|---|
| "Published without your name. Staff can still trace it to your submission." | "Posted anonymously." |
| "Once you submit, this form is final." | "Ready to submit?" |
| "Anonymous **to classmates**." | "Anonymous." |

**"Anonymous" is never used unqualified anywhere in this product.** It is the one
banned word, because unqualified it implies a guarantee the system does not
provide — which [../PRODUCT.md](../PRODUCT.md) forbids by name.

**Boundary on the other side:** precise does not mean exhaustive. Do not recite
the whole privacy model at a field where one fact is what matters.

### P4 · A refusal always carries what is still possible

When the product says no, it says what remains. If nothing remains, it says that
too, and does not imply otherwise.

| Do | Do not |
|---|---|
| "Reopening a closed form is up to your teacher. There is no request you can send from here." | "The deadline for this form has passed." |
| "Import the class list first, then link them here." | "No students imported yet." |

**Boundary on the other side:** do not manufacture a path that does not exist.
*"Contact support"* when there is no support channel is worse than an honest dead
stop.

### Tone map

Voice never changes. Tone shifts across six contexts:

| Context | Tone | Test |
|---|---|---|
| Student submitting | Neutral, unhurried | Does it add pressure? Remove it. |
| Visibility and publishing | Serious, specific | Could a reader mistake who sees this? |
| Deadline passed | Factual, then the path | Does it state the limit honestly? |
| Staff triage | Brief, operational | Would this slow a weekly pass down? |
| Blocked or waiting | Explanatory, no reassurance | Does it say who acts next? |
| Success | Light, one line | Does it confirm what *specifically* happened? |

**Never celebratory.** No exclamation marks, no "Nice work", no emoji anywhere.
This is compulsory coursework under a deadline; enthusiasm reads as tone-deaf.
[../PRODUCT.md](../PRODUCT.md) Principle 4 — *finishing, not administering* — is
served by confirming and getting out of the way.

### Mechanical rules

- **No contractions.** Locked (§1). It is already 100% consistent, it suits a
  product making privacy promises, and consistency is worth more than the
  small warmth contractions would add.
- **Sentence case everywhere**, including buttons and headings.
- **Active voice.** *"We could not send your form"* over *"Your form could not be
  sent."* One exception: when naming the actor would wrongly assign blame —
  *"The deadline has passed"* is better than *"You missed the deadline."*
- **Second person for the reader, first person plural only for system action.**
  *"We could not match you"* → rejected anyway on P3 grounds, but the pronoun
  logic holds.
- **Never "please".** It softens instructions that should be clear, and it
  translates badly.

---

## 3. The register rule

**This is the structural finding of this audit.** The product has two copy
registers and no rule for which one a user sees, so the register depends on which
code path threw.

| Register | Audience | Where it belongs |
|---|---|---|
| **System** | Developers, logs, tests | `throw new Error(...)` in `src/modules/**`. Terse, invariant-shaped, no recovery path. *"Cannot publish an answer in state published."* |
| **User** | Students and staff | Page-level copy, `Alert`, empty states, field errors. Obeys §2. |

**The rule: a system-register string must never reach a user verbatim.** Every
server action that catches a module error is responsible for translating it.

**Currently violated.** `describe()` on the publications page returns
`err.message` for *any* `Error`
([publications/page.tsx:379-383](../src/app/teach/sections/[id]/publications/page.tsx#L379-L383)),
so all 35 module strings can surface to a teacher unmodified. The review page does
this correctly — it uses its own user-register copy (*"An answer is required before
publishing."*) rather than the module's (*"Cannot publish without an answer
body"*). Same product, two behaviours, no rule saying which is right.

The 35 module strings are **correct as system copy** and should not be rewritten.
The fix is at the boundary: each catch site maps known cases to user copy and
falls back to one honest generic — *"That did not work. Nothing was changed."* —
rather than passing an invariant message through.

**Why this matters more than it looks.** A teacher who reads *"Cannot publish an
answer in state published"* learns that the product talks about them in database
states. That is a trust cost on the surface where trust matters most, and it is
paid at random.

---

## 4. Audit findings

### A1 · P1 · An internal implementation name is shown to teachers

> "Scheduled. The reconciliation poller publishes it."
> — [publications/page.tsx:135](../src/app/teach/sections/[id]/publications/page.tsx#L135)

*Reconciliation poller* is the name of a module. A teacher has no way to know what
it is. It is the same failure family as the one
[../PRODUCT.md](../PRODUCT.md) warns about by name — *"Automatically generated"
means schedule-driven, **never** AI-generated* — internal mechanism vocabulary
leaking into user copy and being read as something else.

It also breaks P4: it says a thing will happen without saying **when**, which is
the only fact the teacher wanted.

**Replace with:**

> Scheduled for {date, time}. It publishes automatically — you do not need to be
> here.

The second sentence is the actual reassurance the original was reaching for, and
it is true.

### A2 · P1 · Five constructions for one empty state

Shipped: *"No form is open at the moment"* · *"Nothing waiting to publish"* ·
*"Nothing in the backlog"* · *"Nothing to report yet"* · *"No cycles generated
yet"* · *"No audit records yet"* · *"No templates yet"* · *"You have not submitted
anything yet"*.

Three patterns competing — `No X`, `Nothing X`, `You have not X`. Users cannot
learn a pattern that does not exist, and inconsistency here reads as unfinished.
Catalog: **Inconsistent Patterns** (Cat 9). One pattern in §5.

### A3 · P1 · The highest-stakes error title is passive and vague

> "Your form was not submitted"
> — [weekly-form.tsx:91](../src/components/student/weekly-form.tsx#L91)

Passive, and *"not submitted"* does not distinguish the cases that matter: a fixable
validation problem, a lost-credit deadline, or a network failure. The body copy
carries the distinction; the title — the part a stressed reader on a phone actually
reads — does not. Titles per case in §6.

### A4 · P2 · Two placeholder conventions

*"Search by name or email"* (matches page) versus *"Search questions"* (archive).
One describes the query, one describes the corpus. Pattern in §5.

### A5 · P2 · One string blames the reader

> "We could not match you to a class list"

Rejected in [JOURNEY-STUDENT-FIRSTRUN.md](JOURNEY-STUDENT-FIRSTRUN.md) F6 on
accuracy grounds; it also fails P4 (no path) and reads as an accusation for what
is usually a system ordering problem. Replacement copy lives in that document.

### A6 · Not a finding — flagged so it is not "fixed"

Staff-facing strings use internal domain vocabulary: *"An invalidation reason is
required"*, *"Mark valid"*, *"Backlog"*. This is **correct**.
[../PRODUCT.md](../PRODUCT.md) states participation *validity* is an internal staff
decision, and staff need the domain's words, not softened ones. Do not simplify
staff terminology in the name of plain language — plain means exact, and for staff
the exact word is the domain word.

---

## 5. Microcopy patterns

### Empty states — one pattern

**`No {things} {qualifier}.`** — then one sentence of why or what next, then an
action when one exists.

| Surface | Title | Body | Action |
|---|---|---|---|
| No open cycle | No form is open right now | The next form for this section opens {when}. | Class Q&A |
| Student history | No submissions yet | Your submitted forms and any replies appear here. | Current week |
| Publication queue | No answers waiting to publish | Drafts and scheduled answers appear here. | — |
| Backlog | No questions in the backlog | Questions you move here can be published to any section later. | — |
| Audit | No audit records yet | Actions on this section are recorded here as they happen. | — |
| Templates | No templates yet | A weekly schedule needs a template to copy into each form. | Create a template |
| Courses | Create your first course | A course holds your sections, templates, and question backlog. | Create a course |
| Cycles | No cycles generated yet | Cycles appear once a weekly schedule is active. | Set a schedule |

Rules: `No X` for absence, never `Nothing X` and never `You have not X` — the
second is vague and the third makes absence sound like a failing. **Every empty
state gets a body.** A bare title is the defect found three times across the
journey audits. First-use states are the one exception to `No X`: they lead with
the action, because there is nothing absent yet — there is something to start.

### Success messages

One line. What specifically happened. Next step only if there is a real one.

| Instead of | Use |
|---|---|
| "Success!" | "Your form was sent." |
| "Course created." | "Course created. Add a section next." |
| "Published to this section, anonymously." | "Published to this section without the asker's name." |
| "Scheduled. The reconciliation poller publishes it." | "Scheduled for {date, time}. It publishes automatically." |
| "Schedule cancelled. It is a draft again." | "Schedule cancelled. This is a draft again." |

Note the third: *"anonymously"* is an adverb doing the work P3 says must be done
explicitly. Name whose name is absent.

### Placeholders

Show the **shape of the query**, never the label, never an instruction.

- Search: `Name or student number` · `Search published answers`
- CSV paste: keep the existing two-line example — a real sample beats a
  description, and this one is already right.
- Free-text: the current *"Ask anything about this week, or tell your teacher what
  would help."* stays. It is an invitation, not a format, and it earns its place
  by widening what counts as a legitimate submission.

Never placeholder-as-label — it disappears on input and fails screen readers.

### Confirmations

Title names the action as a question. Body names the consequence. The confirm
button repeats the action; the cancel button names the safe outcome, not "Cancel".

> **Publish this answer to the class?**
> Students in this section will see it. There is no way to unpublish it.
> [Publish to this section] · [Keep editing]

### Loading

Only where a wait is real and unavoidable. Say what is happening, not that
something is.

- `Checking the class list…`
- `Sending your form…`

---

## 6. Error inventory — student submit

The cases [JOURNEY-STUDENT-SUBMIT.md](JOURNEY-STUDENT-SUBMIT.md) A3 shows are
collapsed under one title. Full body copy lives in that document; these are the
titles and the tone, which is what was missing.

| Trigger | Title | Tone | Recovery |
|---|---|---|---|
| Required question blank | Check {n} questions below | Helpful, no drama | Inline, focus first gap |
| Answer too long / bad shape | One answer could not be accepted | Neutral | Inline on the field |
| Deadline passed mid-session | The deadline has passed and this form is closed | Factual, then the limit | Draft kept locally; teacher decides on reopen |
| Network failure | Your form was not sent | Calm, retry available | Retry in place, nothing lost |
| Already submitted | This week's form is already submitted | Neutral | Link to history |
| Not verified yet | Your account is not confirmed yet | Explanatory | Who acts next |

Four distinct titles where there is currently one. The distinction matters because
the recovery differs in each case, and the title is what a stressed reader on a
phone actually processes.

**Never** in any of these: an error code, a state name, the word "invalid", or
*"An error occurred"*.

---

## 7. Label decisions handed over from IA

[IA-STRUCTURE.md](IA-STRUCTURE.md) set the constraints and left the strings here.

### F2 — one name for the Q&A destination

**Decision: "Class Q&A"**, for both roles.

Rejected: *"Q&A archive"* — "archive" names a container, not contents, and it
implies past-only when the newest answer is the one students want. *"Published
answers"* — accurate but it centres the staff action, not the student's need.

"Class Q&A" names the audience, which is this product's central distinction, and
it is the domain's own phrasing in
[public-qa-and-source-linking.md](public-qa-and-source-linking.md) §8.

Staff arriving there see one line, because they are on a student-facing page:

> You are viewing what students in this section see.

### F4 — one label per category

| Slug | Label, both densities | Rejected |
|---|---|---|
| `content` | Course content | "Content" — the dense-row variant; ambiguous alone |
| `logistics` | Class logistics | — |
| `misc` | Other | "Miscellaneous" — longer, no clearer |
| *(null)* | Uncategorised | "General" — implies a category the student chose |

If a row is too narrow for "Course content", that is truncation for `/wireframe`,
not a second vocabulary. **"General" is retired** — it reads as a deliberate choice
when it actually means nobody set one.

---

## 8. Readability and inclusive language

**Target: 8th-grade level for student-facing copy; no ceiling for staff-facing,
where domain precision wins (A6).**

The no-contractions rule (§2) raises reading level slightly. Accepted: the
trustworthiness of a formal register is worth more here than a grade level, and the
sentences are short enough to absorb it. Where a formal negation gets clumsy,
rewrite the sentence rather than reaching for a contraction — *"This form is
closed"* beats both *"This form cannot be submitted"* and *"can't"*.

**Checks that apply to this product specifically:**

- **Read aloud in sequence.** Every visibility string must make sense to a screen
  reader user in reading order, with no reliance on nearby layout
  ([INTENT-CONTEXT.md](INTENT-CONTEXT.md) §4.2 — a privacy warning that is missed
  is a privacy failure).
- **No date-relative phrases in stored strings.** Build "closes Friday, 5:00 pm"
  from the timestamp at render, as [lib/datetime.ts](../src/lib/datetime.ts)
  already does. Never store "tomorrow".
- **No concatenation across a sentence boundary.** `Check ${n} questions below`
  is fine as one template with a singular variant; *"You have " + n + " items"* is
  not.
- **No idioms.** Currently clean. Keep it — the audience includes students reading
  in a second language, and this product will plausibly be translated to Filipino.

**Inclusive-language scan of shipped copy: clean.** No ableist idiom, no gendered
default, no jargon on student surfaces. One thing to preserve deliberately: the
free-text placeholder invites *"tell your teacher what would help"*, which widens
the field beyond questions. That is inclusive design in a placeholder, and it
should survive any rewrite.

**Never, on any student surface:** language that frames the weekly form as
optional-but-encouraged, that references participation totals as something to
protect, or that thanks a student for submitting. The first is inaccurate, the
second is Loss Framing (Cat 3) and banned by
[INTENT-CONTEXT.md](INTENT-CONTEXT.md) §4.1, and the third implies the submission
was a favour rather than coursework.

---

## 9. Pending questions and handoffs

1. **Translation to Filipino — likely, unplanned.** Nothing in the repository
   commits to English-only, the institution is UP DCS, and mixed-language
   classroom register is normal. No decision is recorded. It affects whether
   copy budgets for ~20–30% expansion and whether the formal register survives
   translation. **[Open]** — belongs with the owner, and `/localize` if the answer
   is yes.
2. **Does the no-contractions register read as cold to students, or as
   trustworthy?** The whole framework rests on it. One question in the five
   student sessions ([PILOT-STRATEGY.md](PILOT-STRATEGY.md) §5 activity #2)
   settles it: show two versions of the visibility block and ask which they trust.
3. **Do students read "Staff will see this with your name" as intended?** The
   single most important string in the product. Same session. If it reads as a
   warning-off rather than a fact, asking rate drops and the product's success
   condition goes with it — but softening it would breach P3, so the fix would
   have to be structural, not tonal.
4. **Who owns copy after the pilot?** No content owner is named anywhere. A voice
   framework with no owner drifts within a release or two.

**Handoffs:**

- `/include` — read-aloud order for the visibility strings and the flag region;
  the framework asserts they work, which is not the same as testing them.
- `/localize` — only if question 1 resolves to yes. Do not pre-emptively neuter
  the copy for a translation nobody has committed to.
- `/wireframe` — truncation for "Course content" in dense rows (§7), and where the
  visibility block sits relative to the free-text field.
- `/specify` — the register rule in §3 is an implementation contract at every catch
  site, not a copy edit. It belongs in the same spec as the form-state rollout
  ([JOURNEY-TEACHER-SETUP.md](JOURNEY-TEACHER-SETUP.md) F6).
- `/evaluate` — worth checking whether the framework in §2 actually resolves
  disagreements, by applying it blind to strings it was not written from.

---

## 10. Related documents

[../PRODUCT.md](../PRODUCT.md) · [IA-STRUCTURE.md](IA-STRUCTURE.md) ·
[JOURNEY-STUDENT-SUBMIT.md](JOURNEY-STUDENT-SUBMIT.md) ·
[JOURNEY-TEACHER-PUBLISH.md](JOURNEY-TEACHER-PUBLISH.md) ·
[JOURNEY-STUDENT-FIRSTRUN.md](JOURNEY-STUDENT-FIRSTRUN.md) ·
[JOURNEY-TEACHER-SETUP.md](JOURNEY-TEACHER-SETUP.md) ·
[INTENT-CONTEXT.md](INTENT-CONTEXT.md) · [PILOT-STRATEGY.md](PILOT-STRATEGY.md) ·
[public-qa-and-source-linking.md](public-qa-and-source-linking.md) ·
[UX-DESIGN-BRIEF.md](UX-DESIGN-BRIEF.md)
