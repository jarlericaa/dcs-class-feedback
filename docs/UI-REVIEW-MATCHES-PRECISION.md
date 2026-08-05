# Review inbox and account matches — precision pass

Third follow-up, after [UI-CORRECTION-LIST.md](UI-CORRECTION-LIST.md) (action
placement, palette) and [UI-PRECISION-PASS.md](UI-PRECISION-PASS.md) (dashboard
language, term entry, choice editor). Those two are not revisited here.

Evidence: the running app with seeded teacher data plus the 17-image reference
bundle under `docs/ui-references/` (kept on disk, not committed — see
`.gitignore`). Inspected at 1440 / 1280 / 1024 / 768 / 390 / 320.

Priority: **P0** the teacher cannot operate the surface, or a state is
unrecoverable · **P1** hierarchy or wording that costs a triage pass ·
**P2** craft.

---

## P0

| # | Route | Observed | Why it harms the workflow | Correction |
|---|---|---|---|---|
| 1 | `/teach/sections/[id]/review` | Below ~940px of content the rail and list pane stop and leave a wide empty band, while the detail pane keeps going (`01-review-inbox-overview.png`). | The panes disagree about who scrolls. A teacher scrolling the detail loses the list, and the page grows a dead region that looks like a rendering fault. | The workspace becomes a real viewport-height layout: `100dvh` below the top bar, `min-height: 0` on every flex child that contains a scroller, and three independently scrolling panes. Single-column routes keep ordinary page scroll. |
| 2 | Section setup → weekly cycles | `Skip` sets a cycle to `skipped`, and **nothing in the domain can reverse it** — `skipCycle` accepts `draft`/`scheduled`, `reopenCycle` accepts only `closed`. After clicking, the control vanishes and the week is stuck forever. | An unrecoverable state reachable by one unconfirmed click on a quiet text link. A teacher who mis-clicks row 8 has permanently removed that week. | `Skip week` becomes a confirmed action; a new audited `restoreSkippedCycle` returns a skipped cycle to `scheduled`. Spec decision recorded below. |
| 3 | `/teach/sections/[id]/matches` | A pending request reads `student@up.edu.ph  Typed a number ending 0001` then `The number they typed is not on any roster.` — the same fact twice, unlabelled, beside a permanently-visible `Reason (staff-only)` box and a `Reject` button (`09-account-match-pending-row.png`). | The teacher cannot tell what was entered, whether it matched, or what confirming would do. The only affordance is a reject box sitting there inviting a decision. | Each request becomes a labelled comparison: what was entered, whether this section has a match, and the account and class-list identities side by side, with `Confirm match` / `Not this student` / `Reject request` as explicit actions. Reason moves into the reject dialog. |
| 4 | Review inbox | Two filter popovers (`State`, `Week`) can be open at the same time, and clicking away does not reliably close either. | A filter you cannot dismiss blocks the list underneath it. | One `Filter` button, one popover, grouped `State` and `Week`, closing on outside click, Escape, and re-press. |
| 5 | Review inbox detail | Reply and publish are two permanent side-by-side composer cards occupying the whole lower pane (`05-review-response-composers.png`). | The page reads as a form that must be filled in now. The actual task is *reading* the question; responding is a decision that follows. | `Reply privately`, `Answer publicly` and `Mark as invalid` become actions in the submission header, each opening a dialog over the existing server action. |

## P1

| # | Route | Observed | Correction |
|---|---|---|---|
| 6 | Review inbox | Top bar reads `DCS-101 Section A · Review inbox`; the page has no title of its own. | Page title `Review inbox`, section as quiet context beneath it, `My courses` as a breadcrumb. |
| 7 | Review inbox | `1 RESPONSE SO FAR` in all caps; `PRIVATE REPLY  to this student only  5 Aug 2026, 10:55 pm` as floating fragments. | `Responses` with a count when useful; each response a grouped block with its type, its audience, and its time as separate labelled elements. |
| 8 | Review inbox | `Content` and `question` float as unrelated pieces above `ORIGINAL WORDING — NEVER OVERWRITTEN`. | Explicit sections: **Submitted answers**, **Student question** (category as secondary metadata, one clear status), **Responses**. The all-caps banner goes; the structure carries the meaning. |
| 9 | Review inbox | Four permanent explanatory paragraphs (listed in §F of the brief), including `Answer  required to publish` as a detached fragment. | Removed. Each survives only as a short label beside the action it governs, inside the dialog. The privacy and audit behaviour is unchanged. |
| 10 | Review inbox | Search focus draws a heavy ring around the whole control (`06-review-search-focus.png`). | The ring belongs to the input, at the system's own weight. Focus stays plainly visible. |
| 11 | `/sections/[id]/qa` | The selected answer does not label which text is the question and which is the answer. | Explicit `Question` / `Answer` structure; category and date stay secondary. |
| 12 | Participation | The `NUMBER` column sits between `Student` and the week grid, so an identity column splits the matrix (`12-participation.png`). A large warning card about names and numbers sits above it. | Number leaves the matrix — it is in the exports, which is where the identity-bearing use actually is. Matrix reads `Student`, `Week 1…N`, `Total`. The warning card goes; authorization, identity-bearing exports and audit logging are untouched. |
| 13 | Backlog, audit history | A separate `Filter` submit button is required after choosing a value. | Choosing a value applies it and updates the URL. No second click. |
| 14 | Audit history | Rows render internal action codes: `cycle skipped`, `private response created`, `participation exported`. | A display-label map at the UI boundary. Enum values and stored action codes are untouched. |
| 15 | Section setup | Five permanent explanatory paragraphs (§J of the brief). | Removed; the one that prevents a destructive mistake moves into the relevant confirmation dialog. |
| 16 | Section setup | `Teaching assistant` in user-facing copy. | `Student assistant` in copy. Role enum values and authorization semantics unchanged. |
| 17 | Section setup | `2 of 14 permissions` is the only hint that a staff member's permissions can be changed, and it is not interactive. | An explicit `Edit permissions` action per staff member, prefilled, separate from `Remove`. |
| 18 | Section setup → cycles | The `EDIT LOCK` column shows `Open`, and the `STATE` column also shows `OPEN` — the same word meaning two different things in one row. | Edit lock reads `Locked` or `Unlocked`. States read `Scheduled` / `Open` / `Closed` / `Skipped` in sentence case, each with its own shape. |
| 19 | Roster import, backlog, audit | Permanent paragraphs explaining the parser, the backlog's internal flow, and the audit table's scope. | Removed. The behaviour they described is unchanged; the field-level requirement stays beside the field. |

## P2

| # | Route | Observed | Correction |
|---|---|---|---|
| 20 | Cycles, matches, review | All-caps status stamps in dense tables and rows. | Sentence case in these surfaces. The compact stamp stays where DESIGN.md §9 defines it. |
| 21 | Backlog | Title is `DCS-101 question backlog`. | `DCS-101 Question backlog`. |
| 22 | Matches | `1 of 3 students have a confirmed account.` as a lone sentence. | Compact labelled figures: `Linked 1`, `Pending 1`, `Not linked 1`, plus a class-list search and state filter. |

---

## Spec decision: skipped cycles become reversible

**Change.** A new `restoreSkippedCycle(actorUserId, cycleId)` in
[src/modules/forms/cycles.ts](../src/modules/forms/cycles.ts) moves a cycle from
`skipped` back to `scheduled`. It requires `manage_weekly_cycles`, writes a
`cycle.restored` audit event with before/after state, and refuses any other
state.

**Why this is safe.** `skipCycle` only accepts `draft` or `scheduled`, so a
skipped cycle has never opened and cannot hold a submission. Restoring it
therefore discards nothing and revives no response. The reconciliation poller
picks it up again on its normal schedule, exactly as it would have.

**Why it is needed.** Without it, one unconfirmed click on a quiet text link
permanently removes a week from a section, and `weekly-form-workflow.md`
(*"Staff can pause, skip, or override a scheduled release"*) does not say a skip
is final. No entry in [open-decisions.md](open-decisions.md) makes skip
irreversible; D4 and D5 govern edit locks and deadlines, not cycle skipping.

**Not changed:** deadlines stay hard, `reopenCycle` still only accepts `closed`,
and every transition remains audited.

---

## What changed

New shared pieces, so no route invents its own version:

| Piece | Purpose |
|---|---|
| [`Dialog`](../src/components/ui/dialog.tsx) | Native `<dialog>` + `showModal()`, portalled to `document.body`. The platform owns the focus trap, Escape and `aria-modal`; focus returns to the trigger. Portalled because a dialog holds a form and its trigger often sits inside another — nested forms are invalid HTML and browsers drop the inner one. |
| [`FilterMenu`](../src/components/ui/filter-menu.tsx) | One button, one popover, every group inside it. Options are `<Link>`s, so the URL stays the filter state and the server filters exactly as before. |
| [`AutoSubmitSelect`](../src/components/ui/auto-submit.tsx) | A filter that applies when chosen. The submit button stays inside `<noscript>`, so the form works before hydration. |
| [`audit-labels.ts`](../src/lib/audit-labels.ts) | 112 action codes to human labels, at the UI boundary. Enum values and stored codes untouched. |
| [`restoreSkippedCycle`](../src/modules/forms/cycles.ts) | The audited reverse for a skip. See the spec decision above. |
| `.ws--panes` | The multi-pane shell mode. |

The shell fix is worth its own note, because the cause was not what it looked
like. The CSS was already `height: 100vh` with `min-height: 0` in the right
places — measured at 1440×900 the page did not scroll at all. The dead band came
from `<next-route-announcer>`, an absolutely-positioned body sibling Next renders
after the app: with the shell exactly one viewport tall and in flow, the announcer
lands at y = 100dvh and pushes `documentElement.scrollHeight` 48–64px past the
viewport at 1280 and 1024. Taking the multi-pane shell out of flow leaves nothing
for it to sit below. The same change made single-column routes ordinary scrolling
documents again, which is what they should always have been — browser find, `End`
and anchor links now work on them.

Per-route changes match the tables above. Beyond the brief:

- **Sentence-case stamps and table headers.** All-caps status was the largest
  single contributor to the machine-generated impression, and none of the stamp's
  three redundant channels (word, drawn shape, tone) depends on casing. Recorded
  in [DESIGN.md](../DESIGN.md) §9. All-caps is now reserved for strip labels and
  rail headings, which label a *region* rather than describe content.
- **`Edit lock: Open` renamed.** The cycles table used the word `Open` in two
  adjacent columns meaning different things. The column is now `Questions`, with
  `Editable` or `Locked`.
- **A `border-left: 3px` I had just written** was caught by `impeccable detect`
  against DESIGN.md §11.7 and reduced to the sanctioned 1px rule.

## Verified

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | clean |
| `npm test` | 79 passed |
| `npm run test:integration` | 172 passed — privacy, authorization, section isolation, validity and snapshotting untouched |
| `npx next build` | compiles |
| `impeccable detect` | no findings |

**Viewports.** 17 routes × 1440 / 1280 / 1024 / 768 / 390 / 320 = **102
screenshots, zero horizontal overflow and zero console errors.** Shell scroll
measured separately: multi-pane `documentElement.scrollHeight === innerHeight` at
every width; single-column scrolls as a document.

**34 interaction assertions passed in a real browser**, including:

- one Filter control exists; it opens, closes on re-press, closes on Escape,
  closes on outside click, holds both `State` and `Week`, updates the URL when a
  value is chosen, reports the narrowing, and shows an active count;
- no permanent composer cards remain; `Reply privately` names its recipient,
  Escape closes it and focus returns to the trigger; the public dialog keeps
  `Save as a draft` and `Publish to this section` distinct and still carries the
  acknowledgment guard; `Mark as invalid` is a confirmation with a required
  student-visible reason;
- audit and backlog apply a chosen filter with no second click, and audit renders
  human labels;
- the participation matrix has no student-number column and reads
  `Student → Week N → Total`, with all three exports still present;
- account matches has no permanent reason input, shows a labelled comparison,
  offers a class-list search and state filter, replaces the lone sentence with
  labelled tallies, and puts `Why unlink?` behind a confirmation.

**Skip and restore, end to end.** Week 9 of the seeded section was found
**already stuck in `skipped`** — the exact unrecoverable state this pass
identified, reached before the fix existed. `Restore week` recovered it to
`scheduled`. A fresh skip on week 8 then confirmed first, reported `Week skipped.
No form opens that week; you can restore it.`, and restored cleanly. The audit
history shows `Week restored` and `Week skipped`. Both weeks were returned to
`scheduled`, so the seeded data ends as it began.

## Remaining issues

1. **Typed values are not preserved across a failed server action** in the reply
   and invalidate dialogs. The existing actions signal failure by redirecting
   with `?error=`, which discards the request body; the dialogs add `required`
   so the empty case never round-trips, and the publish composer already
   preserves both fields on the acknowledgment guard because that check is
   client-side. Doing this properly means moving those actions to
   `useActionState`, which changes their contract and belongs in its own pass.
2. **The class-list search filters an already-loaded read model** rather than
   pushing a `WHERE` into the query. Correct and authorized for a section-sized
   roster; it would need revisiting for a cohort-sized one.
3. **`Details` on a review submission is a disclosure, not a permission
   boundary.** The student number reaches the client for any reviewer who can
   already see identities, exactly as before — masking still happens in the read
   model for a TA without `view_student_identities`. Unchanged, noted so the
   disclosure is not mistaken for a control.
4. **`section.timezone` no longer appears anywhere in the UI.** The brief removed
   it from section setup and the earlier pass removed it from the course list. All
   times are still rendered in it. If a section is ever set to a timezone other
   than the institution default, nothing on screen would say so.
