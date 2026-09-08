# Pilot Strategy

**Status:** **[Recommended]** strategic frame for the pilot semester. Not a
product requirement and not a scope change — nothing here promotes a post-MVP or
out-of-scope item (see [scope.md](scope.md) §4).
**Owns:** the strategic reading of what the pilot is *for*, the validation state
of the five foundational product questions, and a proposed Phase 1.
**Companion:** [design/context.md](../design/context.md) owns user conditions,
design constraints, and ethical stance. This file owns the pilot argument.

> Label discipline inherited from [../AGENTS.md](../../AGENTS.md).

---

## 0. Honesty note on this brief

This product is already built — both loops complete, across every implemented
route ([engineering/current-state.md](../engineering/current-state.md) owns the route list and the counts).
Writing a strategic brief *after* the build is an invitation
to post-hoc justification — construct a tension shaped to fit what already
exists, and everyone reads a fiction as orientation.

So this brief does not argue for the product. It argues about **one open
decision**: what the pilot is designed to do. That decision is genuinely open,
it is upstream of the remaining work, and the evidence cuts both ways.

Where the five foundational questions were answered by owner statement rather
than user evidence, this file says so instead of dressing the statement up.

---

## 1. Situation

A real teaching unit at UP DCS runs weekly class feedback through Google Forms
plus a hand-compiled answer document. Collection works. The five steps after
collection — read every row, decide what to answer, compile answers, send the
document, track participation — are manual and repeat every week per section.

A replacement now exists and is **pilot-usable for the core loops**: the setup,
student and staff loops run end to end. Lint, typecheck, **157 unit tests in a
tracked checkout** (163 including one untracked local test file), **279
integration tests**, and a build all pass —
[engineering/current-state.md](../engineering/current-state.md) owns these figures. A Chromium QA pass on
the teacher → student journey passed after remediation.

**It is not feature-complete, and remaining work is more than hardening.**
[engineering/current-state.md](../engineering/current-state.md) lists surfaces that are `missing` or
`schema only` — response analysis (`C1`), the item-level question inbox (`D1`),
bonus periods and student progress (`C3`), merge/unmerge (`D3`),
unpublish/restore (`E2`), reactions and comments (`P2`) — plus `partial` ones
such as private-thread follow-ups (`E1`), archive filters (`E3`), exports
(`F2`), archive/clone (`F3`) and legacy import (`P1`). Genuine hardening items —
browser e2e coverage, deployment automation, backup/restore verification — sit
alongside that, not in place of it. **[Recommended]** framing only; nothing here
promotes a deferred item into scope.

## 2. Complication

**The pilot is currently scoped as a launch. It is the only chance to be a
research instrument, and the product has no user evidence at all.**

Evidence for the complication, stated at the size the evidence supports:

- **Zero primary research exists.** [design/research.md](../design/research.md) is
  competitor and pattern study; its own closing line is *"the team should
  validate the chosen direction with at least one teacher and one student before
  locking the design system."* That recommendation is on the record, dated
  2026-08-02, and has not been executed. The design system is now shipped in
  `src/app/globals.css`.
- **The stated success condition is the least evidenced thing in the
  repository.** **[Confirmed]** success is *teachers stop maintaining the manual
  document, and students trust the anonymity enough to keep asking*
  ([../PRODUCT.md](../../PRODUCT.md)). Nothing in the repository measures trust, or
  asking rate, or what the manual document currently costs.
- **The measurements that do exist are labelled as proposals.**
  [overview.md](overview.md) §"Product success signals" says
  explicitly: *"These are proposed measurements, not current requirements."* So
  there is no agreed definition of pilot success to design the pilot against.
- **One open decision still changes a user-visible rule.** When this brief was
  written, eight did. Since then **D4** edit lock, **D5** grace/reopen, **D6**
  unpublish, **D8** merge scope and **D10** dropped-student access were
  **closed** (2026-08-03), and **D9** join code and **D2** match policy were
  **removed** (2026-08-07) with the name-matching workflow. What remains is
  **D13** retention, which must be settled before real student data is used at
  all — and, outside the user-visible set, **D3** (who grants the Teacher role)
  and **D24** (staff invitations). See [decisions/open-decisions.md](../decisions/open-decisions.md).
- **The pilot is not repeatable.** A semester of feedback cycles happens once.
  Instrumentation that is not designed in before it starts cannot be added
  retroactively — the weeks are gone.

What this complication is **not**: it is not "the product might be wrong." Both
loops work and the specification set is unusually rigorous. The claim is
narrower and better supported — *a working pilot that is not instrumented
produces a working pilot and no evidence*, and this team has exactly one to
spend.

## 3. Resolution

**Design the pilot as the research instrument the five foundational questions
never got.** Same pilot, same scope, same features — a different definition of
what "pilot succeeded" means. Success is not "it ran." Success is "it ran and we
now know six things we are currently guessing."

**Why now:** the instrumentation decision has to precede the first cycle, and
the remaining hardening work (e2e coverage, deployment automation) is where
instrumentation gets built anyway. Deciding this after deployment automation
lands means rework; deciding it now costs a scoping conversation.

This is not a request for new product surface. What it needs: an agreed success
definition, three small research activities, and a decision about what the
existing audit trail is allowed to be read for.

---

## 4. Five foundational questions — validation state

Honest assessment of what is actually known. **Evidence** column distinguishes
owner statement from user evidence, because they are not the same thing and the
docs sometimes read as if they were.

| # | Question | State | Evidence | Gap that matters |
|---|---|---|---|---|
| 1 | **Problem validation** — is this a real problem? | **Existence: confirmed.** Magnitude: unknown. | Owner-stated incumbent workflow, documented in 5 steps, weekly per section. No baseline measurement. | The docs assert collection is fine and everything after is bad, then built for all seven named post-collection pains equally. Which pain dominates is unmeasured — so hardening effort has no priority signal. |
| 2 | **Audience definition** — who has it? | **Roles: confirmed. Segments: not done.** | [domain/roles-and-permissions.md](../domain/roles-and-permissions.md) defines four roles rigorously. Zero behavioural segmentation. | Students are treated as one segment, but the free-text item is **optional** — so the population splits into askers and non-askers, and the non-askers are the group the success condition is actually about. Split unknown, reasons unknown. Also **[Open]**: how many teachers are in the pilot? If it is the owner alone, "teachers" is a segment of one. |
| 3 | **Solution fit** — right solution? | **Platform: reasonable. Form factor: unexamined.** | Web-only is **[Confirmed]** by non-goal, and it fits: no install, Google SSO, meets students on the phone they already have. | The unexamined choice is not platform, it is **the bundle**. One form carries both the teacher's structured questions and the student's own question, so participation credit is the carrot that gets questions asked. That bundle is inherited from Google Forms and never interrogated. It plausibly *raises* asking volume (credit brings them to the form) and *lowers* asking quality (they are there for credit, not to ask). Nobody has looked. |
| 4 | **Feature validation** — right feature set? | **Validated against owner statement, not user demand.** | ~30 MVP features, all traceable to owner confirmation. No keep/cut/add/defer exercise. | Candidates for *indifferent*: three separate CSV exports, scheduled publication, course-level backlog, legacy import. One real signal already exists — **merge UI is absent and nobody has missed it**, while the merge service is built and tested. That is weak evidence merge was not essential, and it is currently queued as the #2 hardening item. Worth a look before spending the effort. |
| 5 | **Competitive landscape** — what exists? | **Adjacent: strong. The real competitor: unsized.** | [design/research.md](../design/research.md) covers Ed, Piazza, Slido, Top Hat, Watermark with trade-offs. Positioning statement in [../PRODUCT.md](../../PRODUCT.md) is sharp and defensible. | The real competitor is **staying on Google Forms**, and its switching cost is unsized: a teacher must learn a new system, import a roster, configure a schedule, and trust it mid-semester. For the owner that cost is ~zero — they built it. For teacher #2 it is the entire question, and it is the difference between a tool and a product. |

**Loop-back this table implies:** Q2 (asker/non-asker split) feeds directly back
into Q1 severity and Q3 bundle. If most students never use the free-text item,
the product's stated success condition is not currently achievable and the
problem worth solving may be *getting students to ask at all* rather than
*handling what they ask*. That is a real reframe and it hangs on one unmeasured
number.

---

## 5. Minimum viable investigation

Three activities. Chosen because each one would **change a decision already on
the table** — not because they would be interesting.

| # | Activity | Cost | Answers | Changes what |
|---|---|---|---|---|
| 1 | One contextual session: watch a teacher work one real week in the incumbent spreadsheet + answer doc | ~90 min | Q1 magnitude. Which post-collection pain actually dominates. | Hardening priority. Also produces the only baseline that could ever support "this saved time." |
| 2 | Five student sessions on the submit + free-text moment, using the built product | ~1 day total | Q2 asker/non-asker split and why. Q3 bundle effect. Whether students read the visibility copy correctly. | Whether the success condition is achievable; whether the publish/visibility copy works; the whole of [design/context.md](../design/context.md) §1.1 goes from assumption to evidence. |
| 3 | One cold-setup session: a teacher who is **not** the owner does roster import → schedule → template unaided | ~60 min | Q5 switching cost. | Whether this generalises past its author. Highest-value hour available, and currently nobody is booked for it. |

Five participants surface most major usability issues. All three activities fit
inside days, not weeks, and #2 and #3 use the product as it stands — no new
build required.

**Order matters:** run #3 first. It is the cheapest, it is the one nobody has
thought to do, and a bad result there changes the pilot plan more than anything
else on this page.

---

## 6. Proposed Phase 1 — earn the pilot

**[Recommended]**, and deliberately narrower than the current milestone list.

**In:**

1. **Decision sign-off** on what is actually still open: **D13** retention
   first, because it gates real student data outright. (The other seven this
   brief listed have since been closed or removed — see §1. D10 dropped-student
   access, previously paired with D13 here, was closed 2026-08-03.)
2. **An agreed success definition.** Promote a small set of the proposed signals
   in [overview.md](overview.md) and
   [design/context.md](../design/context.md) §6 from proposal to agreed, or replace
   them. Without this the pilot cannot be judged, only survived.
3. **The three activities in §5**, before the first cycle opens.
4. **Browser e2e on the two highest-consequence journeys only** — submit near
   deadline, and publish. Not full coverage. These two are where failure costs
   credit or costs anonymity ([design/context.md](../design/context.md) §3.1).
5. **Pilot instrumentation**, read from the audit trail that already exists —
   free-text item rate per section per cycle, submission timing distribution
   relative to deadline, publish-versus-keep-private ratio, invalidation rate.
   All four are derivable from existing `AuditEvent` and response data. **[Open]:**
   whether reading the audit trail for product learning is acceptable, and
   whether students must be told. That is a consent question, not a technical
   one, and it belongs with D13.
6. **Deployment automation and the pilot checklist** in
   [engineering/deployment.md](../engineering/deployment.md), including the restore test.

**Deferred, with reasons:**

- **Merge UI** — currently the #2 hardening item. Deferred pending §4 Q4: the
  service exists, the UI does not, and its absence has not been felt. Cheap to
  test the assumption before paying for the build.
- **Full e2e coverage** beyond the two journeys in (4).
- **Everything in [scope.md](scope.md) §2 and §3.** Unchanged. No
  promotion proposed.

**Out of scope for Phase 1 but named so it is not lost:** publish-friction
adequacy ([design/context.md](../design/context.md) §8.6). An acknowledgement
checkbox guarding an irreversible de-anonymisation is untested. Activity #1 or a
short staff session could test it cheaply.

---

## 7. Guiding principles for Phase 1 decisions

1. **Evidence before hardening.** Effort follows measured pain, not
   feature-completeness instinct. Two of the three activities in §5 exist to
   redirect effort already budgeted.
2. **The pilot is a one-shot instrument.** Anything the pilot cannot teach us,
   it will never teach us. Instrument before the first cycle or not at all.
3. **Irreversible beats frequent.** Publish and deadline-submit get
   disproportionate attention because their failures cannot be undone — not
   because they happen often.
4. **No promotion by momentum.** Recommendations stay recommendations until the
   owner signs. This file included.

---

## 8. Key assumptions and open questions

**Betting on** — flag if wrong:

- **[Assumption]** The pilot runs on a semester boundary, so the research window
  closes hard. If the pilot date is flexible, §5 gets easier and §6 item 3 stops
  being urgent.
- **[Assumption]** At least one non-owner teacher will use this. If the pilot is
  the owner alone, Q5 switching cost is moot for now and activity #3 can wait —
  but then no generalisation claim can be made from the pilot either.
- **[Assumption]** Existing audit and response data can answer the four
  instrumentation questions in §6 item 5 without new logging. Worth a 30-minute
  check against the schema before committing.

**Still unknown:**

- Pilot date, section count, teacher count. All **[Open]**.
- Who approves a design or strategy change; no named approver or review cadence.
- Whether product-learning use of student data is permitted, and by whom.
- Asker versus non-asker split — the number this brief most wants and cannot get
  without §5 activity #2.

---

## 9. Related documents

[design/context.md](../design/context.md) · [../PRODUCT.md](../../PRODUCT.md) ·
[overview.md](overview.md) · [engineering/current-state.md](../engineering/current-state.md) ·
[decisions/open-decisions.md](../decisions/open-decisions.md) · [scope.md](scope.md) ·
[design/research.md](../design/research.md) · [engineering/deployment.md](../engineering/deployment.md) ·
[domain/participation.md](../domain/participation.md)
