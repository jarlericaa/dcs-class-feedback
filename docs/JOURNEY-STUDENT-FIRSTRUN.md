# Journey — Student First Run (Sign-in to Verified)

**Status:** **[Recommended]** flow redesign. Audit of the implemented flow plus
proposed changes. No scope change: nothing from [mvp-scope.md](mvp-scope.md)
§2/§3 is promoted. In particular this does **not** propose notifications
(**[Confirmed]** post-MVP) or auto-confirm (**[Open D2]**) — the fixes work
inside those constraints, which is most of the design problem.
**Owns:** the journey from a student's first sign-in to a confirmed identity that
can submit — including the blocked and stranded states.
**Routes audited:** `/signin`, `/`, `/sections/[id]`,
`/teach/sections/[id]/matches` —
[signin/page.tsx](../src/app/signin/page.tsx), [page.tsx](../src/app/page.tsx),
[matches/page.tsx](../src/app/teach/sections/[id]/matches/page.tsx),
[modules/identity/matching.ts](../src/modules/identity/matching.ts),
[modules/identity/normalize.ts](../src/modules/identity/normalize.ts),
[modules/authz/index.ts](../src/modules/authz/index.ts).

**Companions:** [JOURNEY-STUDENT-SUBMIT.md](JOURNEY-STUDENT-SUBMIT.md) (this
journey is strictly upstream of it) · [account-matching.md](account-matching.md)
(owns the rules audited here) · [INTENT-CONTEXT.md](INTENT-CONTEXT.md).

---

## 1. Problem statement

A student signs in with their university Google account. Before they can do
anything, the system must bind that account to a roster record. The registrar CSV
carries student number and full name only — **no email** — so the binding is a
name match, and the name it matches against is a user-editable Google display
name. Matching therefore produces *candidates*, and a human confirms
([account-matching.md](account-matching.md), **[Open D2]** — teacher-confirm-all
is the **[Recommended]** MVP policy and is what ships).

**This journey has one defining property: the student cannot act.** They have no
lever. They cannot enter their student number, request confirmation, correct
their name, or escalate. They sign in, and then they wait for a teacher to
notice. Every other journey in this product is about giving the user the facts to
make a decision; this one is about a user with no decision to make.

That changes what design can do here. There are only two levers:

1. **Tell the student the truth** about what is happening, who acts next, and
   what it means for the deadline that is already running.
2. **Make sure a human is actually triggered** — because there are no
   notifications in MVP ([mvp-scope.md](mvp-scope.md) §2), so "a teacher
   notices" is a UI problem, not a messaging one.

Both levers are currently weak, and one of them fails completely (F1).

**The stake is the same as the submit journey.** A blocked student cannot submit;
the cycle closes on schedule regardless; participation derives from valid
submissions ([participation-rules.md](participation-rules.md)). Credit is lost
for every week the block lasts, and nothing records *why*.

---

## 2. User context

No research exists ([PILOT-STRATEGY.md](PILOT-STRATEGY.md) §2), so the arc below
is structural rather than emotional — derived from the state machine, not
imagined. The variance that matters is **which blocked state a student lands in**,
and that is knowable from the code.

| Path | How it happens | What the student sees | Visible to staff? |
|---|---|---|---|
| **Confirmed** | Display name scores above the strong threshold, uniquely; teacher confirms | Classes appear, form works | Yes — pending list |
| **Candidate** | One plausible match above threshold | *"Your account is waiting to be confirmed"* | **Yes** |
| **Ambiguous** | Two or more plausible matches — common with shared surnames | Same single line as above | **Yes** |
| **Unmatched — name mismatch** | Nickname, middle name used, different romanisation, married name | *"We could not match you to a class list"* | **No** — see F1 |
| **Unmatched — signed in before roster import** | Student is prompt; teacher imports later | Same line | **No, and permanently** — see F1 |

The last two rows are the journey. They are also the two the interface handles
worst.

**Assumed conditions** **[Assumption]**: first sign-in happens in week 1, likely
on a phone, plausibly in the same class session where the teacher announced the
tool — which means a cohort of students may all sign in *before* the roster
import, not after.

---

## 3. Current flow, as built

```
Google SSO (allowed domains)
   │
   ▼
/  (dashboard)
   │
   ├─ no accountMatches row at all?
   │     └─ generateMatchCandidates(user.id)      ← runs ONCE, ever            ⚠ F1
   │
   ├─ candidate / ambiguous ──→ "Your account is waiting to be confirmed"      ⚠ F2
   │                              title only. no body, no action, no timing.
   │                              → teacher must happen to visit the
   │                                per-section matches page                    ⚠ F3
   │                              → deadline keeps running                      ⚠ F4
   │
   ├─ unmatched ─────────────→ "We could not match you to a class list"        ⚠ F1 F2
   │                              title only. no route out. no retry. and the
   │                              row is invisible to every teacher.
   │
   └─ deep link /sections/[id] ─→ AccessDenied: "...ask the teacher who
                                   manages this class section."                 ✓/⚠ F5
                                   better guidance than the primary path
```

**What is already right, and should not be touched:**

- **No auto-confirm path exists anywhere.** `generateMatchCandidates` only
  proposes; the module docstring says so and the code honours it
  ([matching.ts:13-18](../src/modules/identity/matching.ts#L13-L18)). This is the
  R1 mitigation and it is intact.
- `rejectMatch` refuses to reject a **confirmed** match, with a comment
  explaining that flipping one would silently revoke a verified student's access
  ([matching.ts:209-217](../src/modules/identity/matching.ts#L209-L217)). Exactly
  the right instinct.
- `correctMatch` is fully audited with prior and new bindings, and handles the
  unique-index collision explicitly.
- The matches page leads with *"Nothing is verified automatically"*
  ([matches/page.tsx:158](../src/app/teach/sections/[id]/matches/page.tsx#L158)) —
  the teacher is told the policy rather than left to infer it.
- The empty roster state on the matches page is a **good** empty state: title,
  body, and an action pointing at the importer
  ([matches/page.tsx:285-296](../src/app/teach/sections/[id]/matches/page.tsx#L285-L296)).
  It shows the team knows how to build one, which makes F2 a consistency failure
  rather than a capability gap.
- `generateMatchCandidates` is *written* to be re-runnable — it deletes
  non-confirmed rows and regenerates, and never touches confirmed ones
  ([matching.ts:20-25](../src/modules/identity/matching.ts#L20-L25)). The retry
  mechanism exists. Nothing calls it. That is F1.

---

## 4. Findings

### F1 · P0 · A student who signs in before the roster import is permanently stranded, invisibly

**Evidence.** Four facts compose into a closed trap:

1. `generateMatchCandidates` is called from **exactly one place** — the dashboard
   — and only when the user has no `accountMatches` row at all:
   `if (!existing) await generateMatchCandidates(user.id)`
   ([page.tsx:67-72](../src/app/page.tsx#L67-L72)). A repository-wide grep finds
   no other caller; roster import does not trigger it.
2. With no roster imported, the candidate pool is empty, so
   `classifyCandidates` returns `{kind: "unmatched"}`
   ([normalize.ts:156](../src/modules/identity/normalize.ts#L156)) and an
   `unmatched` row with `studentRecordId: null` is inserted
   ([matching.ts:73-78](../src/modules/identity/matching.ts#L73-L78)).
3. That row makes `existing` truthy forever, so the dashboard never regenerates.
4. `listPendingMatchesForSection` filters to `["candidate", "ambiguous"]`
   ([matching.ts:126](../src/modules/identity/matching.ts#L126)). An `unmatched`
   row has a null record id and a state outside that list, so it appears **on no
   teacher's screen anywhere**.

Net effect: a legitimately enrolled student who signs in before their teacher
imports the CSV is locked out **permanently**, is **invisible to staff**, sees
only *"We could not match you to a class list"* with no route out, and loses
participation credit every week until someone works out what happened from first
principles.

The same trap catches the ordinary name-mismatch case — nickname, middle name,
different romanisation — which
[account-matching.md](account-matching.md) already identifies as the expected
condition, not an edge case. Those students are stranded too, just for a
different reason.

**Why this is the worst finding in the product so far.** The two irreversible
flows already audited ([JOURNEY-STUDENT-SUBMIT.md](JOURNEY-STUDENT-SUBMIT.md),
[JOURNEY-TEACHER-PUBLISH.md](JOURNEY-TEACHER-PUBLISH.md)) need a user to act
before harm occurs. This one harms by **inaction**, silently, and the ordering
that triggers it — eager student, later import — is the *likely* week-one
sequence, not an unlucky one.

**Fix.** Three changes, none of which needs a new mechanism:

- **Regenerate after roster import.** The importer already knows which records it
  created; call `generateMatchCandidates` for users whose only match row is
  `unmatched`. The service is built for exactly this.
- **Regenerate on student revisit when the row is `unmatched`.** Change the
  dashboard condition from "no row" to "no row, or the only row is `unmatched`".
  One-line condition change; the service already replaces non-confirmed rows.
- **Surface `unmatched` accounts to staff.** They cannot be listed per-section
  (there is no record to join on), so they belong on the section matches page as
  a separate group: *accounts in this course's domain with no roster match.*
  This needs a scoping decision — see §7.

### F2 · P1 · Every blocked state is a single line of text with no body and no action

**Evidence.** The dashboard's `hasNothing` branch renders
`<EmptyState title={…} />` with no children and no action
([page.tsx:215-225](../src/app/page.tsx#L215-L225)), choosing between three
titles. `EmptyState` supports both body and action, and the matches page uses
both well.

So a student blocked at the most consequential moment in their first run gets:

> **Your account is waiting to be confirmed**

That is the entire screen. It does not say who confirms, roughly how long, that
a deadline is running, that their participation is at risk, or what to do if it
does not resolve. The unmatched variant is worse — *"We could not match you to a
class list"* — a diagnosis with no prescription. Catalog: **Dead Ends** (Cat 9).

This is the same defect as F6 in the submit journey: capable component, unused
capability, three situations collapsed onto one bare line.

**Fix.** Each state gets body copy and an action. Copy in §5.

### F3 · P1 · Pending matches are not surfaced where the teacher looks

**Evidence.** The dashboard staff card badge shows `counts.needsReview` from
`getReviewQueue` — submissions awaiting review
([page.tsx:187-193](../src/app/page.tsx#L187-L193)). Pending **matches** are not
in those counts. `matchStatus` from `listSectionsForUser` describes the *viewing
user's own* status, so it is a student-side value; it never tells a teacher that
students are waiting.

To discover a waiting student, a teacher must navigate to
`/teach/sections/[id]/matches`, per section, and look — with no prompt to do so
and no notification channel in MVP.

**Why it matters.** In MVP the interface *is* the notification system. A pending
match is time-critical in a way a pending review is not: an unreviewed submission
is merely unanswered, an unconfirmed student is losing credit. The urgent item is
the one that is invisible, and the less urgent one has the badge.

**Fix.** Add pending-match count to the staff section card and make it outrank
`needsReview` when non-zero — a blocked student is a harder deadline than an
unanswered question. No new plumbing:
`listPendingMatchesForSection` already exists.

### F4 · P1 · The deadline runs through the block, and nothing records that it did

**Evidence.** Cycles transition `scheduled → open → closed` by wall-clock time
([weekly-form-workflow.md](weekly-form-workflow.md) §2.2), independent of
matching. Participation is derived: a student participated in a cycle **iff** a
valid `FormResponse` exists ([participation-rules.md](participation-rules.md) §3).
A blocked student produces no response.

So in the participation matrix and the three CSV exports a blocked student is
indistinguishable from one who ignored the form. The teacher exporting for
grading sees an absence with no cause.

**Why it matters.** This is a fairness defect that reaches a grading artifact.
The invalidation path deliberately captures a *reason* for staff
([participation-rules.md](participation-rules.md) §2.1) — the product already
accepts that "why" matters for participation state. A block caused by the
system's own matching latency has no equivalent record.

**Fix — narrow, and deliberately not a policy change.** Do not auto-credit and do
not touch participation derivation. Instead make the fact visible where the
decision is made: when a match is confirmed, show the teacher which already-closed
cycles the student was blocked through, so a reopen (**[Open D5]**) is an informed
choice. Confirmation time and cycle windows are both already recorded — this is a
read, not a new state. The policy question stays with the owner (§7).

### F5 · P2 · The deep-link path gives better guidance than the primary path

**Evidence.** Reaching `/sections/[id]` while unverified throws `AuthzError`
([authz/index.ts:235](../src/modules/authz/index.ts#L235)) and renders
`AccessDenied`, whose copy names a next step: *"If you think this is a mistake,
ask the teacher who manages this class section."*
([ui/index.tsx](../src/components/ui/index.tsx)). The dashboard — where the
student actually lands — says less.

**Fix.** Folds into F2. The primary path should carry at least the guidance the
fallback path already has.

### F6 · P2 · "We could not match you" reveals more than it should, and less than it needs to

**Evidence.** The unmatched copy tells the student a class list exists and they
are not on it. For a student who mistyped their institutional identity, or who is
enrolled but late-added, that is a confusing accusation. For someone probing, it
is a weak enrolment oracle.

**Why P2 not higher.** Low practical value to an attacker — SSO is already
restricted to approved university domains, so the population is bounded. Worth
fixing on clarity grounds more than security grounds.

**Fix.** State the situation without asserting a conclusion about their
enrolment: the account is not yet linked to a class list, staff link accounts
manually, here is what to do. Copy in §5.

---

## 5. Proposed flow

```
Google SSO
   │
   ▼
/  (dashboard)
   │
   ├─ no row, OR only row is `unmatched`  →  generateMatchCandidates()          [F1]
   │
   ├─ candidate / ambiguous
   │     └─ Waiting card:  who acts · deadline showing · what to do if stuck    [F2]
   │
   ├─ unmatched
   │     └─ Not-yet-linked card: name-shown, what to tell the teacher, action   [F2 F6]
   │
   └─ confirmed → classes appear → JOURNEY-STUDENT-SUBMIT

Staff side, same period:
   ├─ roster import completes → regenerate for stranded users                   [F1]
   ├─ dashboard staff card → "3 students waiting to be confirmed"                [F3]
   │     ranked ABOVE needs-review when non-zero
   ├─ matches page → new group: accounts with no roster match                    [F1]
   └─ on confirm → "This student was blocked through Weeks 1–2"                  [F4]
```

**Deliberately not proposed:** notifications (post-MVP, **[Confirmed]**),
auto-confirm (**[Open D2]**, and the R1 mitigation depends on its absence), a
student-entered student number (that is **[Open D9]**'s join-code territory and
needs an owner decision, not a design decision). Everything above works inside
the shipped constraints.

---

## 6. Copy specifications

Plain, calm, precise. Never imply the student did something wrong; the most
likely cause is system ordering, not student error.

### F2 — waiting for confirmation (candidate / ambiguous)

> **Your account is waiting to be confirmed**
>
> You signed in as **{display name}**. A teacher for your class has to confirm
> that this account belongs to you before you can open the weekly form. Nothing
> is confirmed automatically.
>
> **A form is open now and closes {deadline}.** You cannot submit until your
> account is confirmed. If the deadline passes while you are waiting, tell your
> teacher — reopening a closed form is their decision.
>
> [Class Q&A archive] — *if their section grants archive access*

The deadline line is the point. A student who does not know a clock is running
cannot escalate in time, and escalating to their teacher is the only lever they
have.

### F2/F6 — not yet linked (unmatched)

> **Your account is not linked to a class list yet**
>
> You signed in as **{display name}**. Class lists come from the registrar and
> carry your full name as recorded there. Staff link accounts by hand, so this
> can happen when the list has not been imported yet, or when the name on your
> Google account is different from your registered name.
>
> **What to do:** tell a teacher for your class that you have signed in as
> **{display name}**, and give them your student number. They can link your
> account from the class list.
>
> We check again automatically each time you open this page.

Says *not linked yet*, not *you are not on the list* — the second is an assertion
the system has not earned. Showing the display name back matters: it is the exact
string the match ran against, so it is the one useful thing the student can
report.

### F3 — staff section card

> **3 students waiting to be confirmed** · 12 needs review

Waiting students first when non-zero. A blocked student is losing credit; an
unanswered question is not.

### F1 — staff, unmatched group on the matches page

> **Signed in but not on any class list**
>
> These accounts signed in with a university address and did not match any
> imported roster name. If one of them is your student, import the class list
> first, then link them here.

### F4 — at confirmation

> Confirmed. **{name} was not able to submit for Weeks 1–2**, which closed while
> their account was waiting. Reopening those cycles is your decision.

States the fact and stops. Does not recommend, because **[Open D5]** is not
settled and copy must not settle it.

### Rejected copy

- *"We could not match you"* / *"You are not on the class list."* Asserts a
  conclusion about enrolment the system cannot support, and blames the student
  for a system ordering problem.
- Any estimate of confirmation time. It depends on a human noticing, and once F3
  is fixed the honest answer is still "unknown."
- Reassurance without the deadline. *"Someone will get to this soon"* is worse
  than silence when a clock is running.

---

## 7. Interaction specifications

| Concern | Spec |
|---|---|
| Regeneration on revisit | Dashboard condition becomes: no match row **or** the only row is `unmatched`. `generateMatchCandidates` already deletes non-confirmed rows and never touches confirmed, so it is safe to re-run. |
| Regeneration after import | Roster import triggers regeneration for users whose only row is `unmatched`. Bounded by the accounts that exist; not a scan of everything. |
| Cost of re-running | One name-scoring pass over active roster records per page view for blocked users only. Blocked users are a small, shrinking set. If it ever matters, gate on a timestamp — but measure first. |
| Idempotency | Already guaranteed: confirmed rows are untouched, non-confirmed rows are replaced wholesale. Re-running cannot revoke access. |
| Staff counts | `listPendingMatchesForSection` already exists; the dashboard needs to call it per staff section, same shape as `staffSectionAttention`. Failures return `null` and render nothing, matching the existing pattern. |
| Live region | The blocked cards are server-rendered per navigation. No live region; the copy says re-checking happens on page open, which is then true rather than aspirational. |
| Accessibility | Blocked states are the first thing a screen-reader user meets. The card is a `role="status"` region with a heading, not a bare paragraph — `/include` audits. |

---

## 8. Metrics

All **[Recommended]**; the audit-for-learning consent question is **[Open]**
([PILOT-STRATEGY.md](PILOT-STRATEGY.md) §6 item 5).

| Signal | Reads on | Source |
|---|---|---|
| Time from first sign-in to confirmed match | F3 — whether surfacing counts actually shortens the block | `users.createdAt` → `accountMatches.confirmedAt` |
| Count of `unmatched` rows outliving one roster import | F1 — whether the trap is closed | `accountMatches` state |
| Cycles closed while a student was blocked | F4 — the real cost, in weeks of lost credit | confirmation time vs cycle windows |
| Share of first sign-ins that land `unmatched` | Whether name matching works on real registrar data at all | `match.candidates_generated` audit events |
| Ambiguous rate | Whether shared surnames make teacher-confirm-all expensive at real class sizes | same |

The last two are the ones worth watching in week one of the pilot: they are the
first real evidence about whether the matching design holds, and
[account-matching.md](account-matching.md)'s thresholds have never met a real
roster.

**Rejected metrics:** sign-in counts, activation rate, anything that frames a
compulsory institutional tool as a funnel.

---

## 9. Pending questions and handoffs

1. **Scoping the unmatched list — needs an owner decision.** An `unmatched` row
   has no record to join on, so there is no section to scope it to. Showing every
   unmatched account to every teacher leaks the identities of students in other
   people's courses, which contradicts deny-by-default
   ([roles-and-permissions.md](roles-and-permissions.md) §1). Options: scope by
   course domain, show only to platform admins with a teacher-facing count, or
   have the student self-declare a section. **Not resolving this here** — it is a
   privacy-boundary decision, and F1's other two fixes deliver most of the value
   without it.
2. **[Open D5]** grace/reopen. F4's copy is written to survive either outcome but
   should be revised once the policy lands.
3. **[Open D9]** join code. A student-entered code would give the student their
   only lever in this entire journey and would collapse F1's whole class of
   failure. It is documented as an option and explicitly **not** approved. Worth
   reopening with F1 as evidence.
4. **[Open D2]** match policy. Teacher-confirm-all is what makes this journey
   slow by design. That is the correct trade against R1 impersonation, and F3
   should be fixed before anyone argues for auto-confirm on throughput grounds.
5. **Do the thresholds work on real names?** `CANDIDATE_THRESHOLD` and
   `STRONG_MATCH_THRESHOLD` have never been tested against a real registrar
   export, and no sample exists in the repository
   ([../PRODUCT.md](../PRODUCT.md) "Absent — must not be fabricated"). Filipino
   naming conventions — multiple given names, maternal surnames, suffixes — are
   exactly where a scoring heuristic tuned by intuition drifts.

**Handoffs:**

- `/investigate` — one dry run of matching against a real (or realistically
  shaped) registrar export, before the pilot. Cheapest possible test of the
  riskiest unvalidated assumption in the product.
- `/fortify` — the state inventory for this journey: student signs in during
  import, roster re-import drops a confirmed student (**[Open D10]**), two
  accounts match one record, a student changes their Google display name after
  confirmation (**[Assumption A2]** says the binding holds — worth verifying in
  the UI, not just the model).
- `/articulate` — the two blocked-state cards. First thing a student ever reads
  in this product, and currently one line each.
- `/include` — blocked cards as the screen-reader entry point.
- `/evaluate` — F1 deserves an independent read; a permanent invisible lockout is
  the kind of finding worth confirming rather than taking on one pass.
- **Not designing here:** roster import UI, the matches page's own IA
  (`/organize`), auth provider configuration.

---

## 10. Related documents

[JOURNEY-STUDENT-SUBMIT.md](JOURNEY-STUDENT-SUBMIT.md) ·
[JOURNEY-TEACHER-PUBLISH.md](JOURNEY-TEACHER-PUBLISH.md) ·
[account-matching.md](account-matching.md) ·
[participation-rules.md](participation-rules.md) ·
[roles-and-permissions.md](roles-and-permissions.md) ·
[weekly-form-workflow.md](weekly-form-workflow.md) ·
[INTENT-CONTEXT.md](INTENT-CONTEXT.md) · [PILOT-STRATEGY.md](PILOT-STRATEGY.md) ·
[open-decisions.md](open-decisions.md) · [SECURITY.md](SECURITY.md)
