# DESIGN-TODO.md — the punch list for one consistent look

**What this file is:** the ordered, checkable work needed to make the app look
like one system and behave like one product. It is a _punch list_, not a design
document.

**What governs the look:** [DESIGN.md](DESIGN.md). The theme is settled — a
**departmental noticeboard**: stone ground, hard-cornered white notices, Charter
for text a human wrote and the platform sans for anything the system says, one
deep blue-green accent spent only on action, status as a stamp, borders carrying
structure, nothing with a resting shadow. **No item below changes that theme.**
Every item either finishes applying it or fixes somewhere it is not applied.

**Label discipline** (per [AGENTS.md](AGENTS.md)): **[Confirmed]** owner-stated ·
**[Recommended]** proposed, not approved · **[Assumption]** inferred ·
**[Open]** unresolved, needs the owner. Nothing here is approved scope until the
owner says so; the labels are not decoration.

---

## Contents

| § | What it covers | State |
|---|---|---|
| [0](#0-where-we-actually-are) | Measurements, re-taken every pass | living |
| [0.1](#01-progress-after-the-navigation-batches--132-done-57-open) | Progress, counted | living |
| [1](#1-decisions-that-blocked-work--all-answered-2026-09-11) | D-A · D-B · D-C · D-D · D-E | **all answered** |
| [2](#2-one-token-system-currently-two) | One token system | 2.1–2.4 done · 2.5 waits on §4 |
| [3](#3-one-component-per-pattern-currently-two) | One component per pattern | **done** |
| [4](#4-retire-the-hand-written-class-layer) | Retire `legacy.css`, screen by screen | open, unblocked |
| [5](#5-ux-gaps--the-part-that-is-not-cosmetic) | Pending · loading · errors · `aria-live` | **7 of 10 done**; 5.8 · 5.9 · 5.10 left |
| [6](#6-dark-mode--board-at-night) · [6A](#6a-the-proposed-dark-palette-recommended-2026-09-10) | Dark mode, approved, built last | open by design |
| [7](#7-guardrails--make-the-greps-the-gate) · [7a](#7a-what-is-actually-enforced-now) | Guardrails | **now enforced, two gates** |
| [8](#8-explicitly-not-in-this-list) | Explicitly out of scope | reference |
| [9](#9-suggested-order) | Suggested order | living |
| [10](#10-owner-feedback--2026-09-10-confirmed) | Owner feedback, 2026-09-10 | mostly done |
| [11](#11-components-the-system-is-still-missing--2026-09-10-confirmed-request) | Components asked for | mostly built |
| [12](#12-sidebar-and-navigation-components--2026-09-11-confirmed) | Sidebar and nav components | **complete** |
| [12a](#12a-sidebar-redesign--sidebarmd-2026-09-11-confirmed-spec)–[12g](#12g-the-text--merge-bug-and-the-editor-footer--2026-09-11) | The seven owner correction rounds, in order | **complete** |
| [12h](#12h-the-create-course-modal-and-the-consistency-sweep-behind-it--2026-09-11) | The create-course modal + consistency sweep | **complete** |
| [12i](#12i-skeletons-that-follow-the-page-and-spinners--2026-09-11) | Per-route skeletons · spinners | **complete** |
| [12j](#12j-heading-scale-tab-weight-and-where-maroon-goes--2026-09-11) | Heading scale · tab weight · where maroon goes | 12j.5 open for a pick |
| [12k](#12k-a-refused-field-reads-as-refused--2026-09-11) | Error states: a refused field reads red | **complete**; two notes open |
| [12l](#12l-the-search-bars-focus-ring-and-51-finished--2026-09-11) | Search-bar focus ring · §5.1 rollout finished | **complete** |
| [12m](#12m-pre-pr-verification--2026-09-11) | Pre-PR verification: 9 checks, 2 repo problems found | 12m.7 open |
| [13](#13-component-inventory--what-exists-and-what-is-left) | **Component inventory: done vs. to do** | living |

**The owner's spec files are named, not linked.** `sidebar.md`, `modal.md`,
`changes.md`, `form-table.md` and the annotated PNGs were supplied per round and
are not kept in the repository, so they appear as plain names throughout. What
each one asked for — including the parts deliberately not built — is quoted in
the section that implemented it, which is the durable record.

**How to read this file.** §0 is measured, §1 records the decisions, §2–§7 are
the systemic work, §8–§9 bound and order it, and §10–§12h are owner-raised
rounds in the order they happened — each one kept whole, including what was
deliberately *not* done and why. §13 is the one-table answer to "what does the
component layer actually have".

---

## 0. Where we actually are

Re-measured on the working tree after batches 0–3, **2026-09-11 (late)**.
The **now** column was measured again after the create-course modal and the
consistency sweep (**§12h**), on branch **`frontend-improvements`** — renamed from
`chore/tailwind-migration`, since the branch stopped being a Tailwind migration
several batches ago. The earlier columns are kept so the direction of travel is
visible rather than implied.

| Signal | 09-10 | 09-11 am | after b2 | **after b3** | **now** | Reading |
|---|---|---|---|---|---|---|
| `src/app/globals.css` | 198 | 250 | 306 | **318** | **368** | the geometry, on-accent and scrim tokens |
| `src/app/legacy.css` | 4,771 | 5,101 | 5,164 | **5,035** | **4,738** | **shrinking at last** |
| …of which are CSS | — | — | 4,057 | **3,839** | **3,527** | −534 CSS lines since batch 2 |
| …rule blocks | — | — | 705 | **664** | **608** | **the number that matters: 705 → 618** |
| `.tsx` files | 54 | 64 | 64 | **64** | **88** | +24: the nav work, the modal, and 12 route skeletons + 4 boundaries |
| Files importing `ui/button` | 1 | 2 | 28 | **29** | **30** | +`EmptyState`, the last legacy `.button` (12h.2e) |
| **Files importing `ui/form`** | — | 1 | 1 | **21** | **21** | **§3.2 done** |
| Raw `<button>` elements | 63 | 51 | 51 | **51** | **5** | the five left are deliberate — **§3.1 done** |
| `style={{ … }}` one-offs | 57 | 59 | **0** | **0** | **0** | §2.2 done |
| Colour literals in `.tsx` | — | 1 | **0** | **0** | **0** | §2.3 done |
| Colour literals in `:root` | — | 24 | **0** | **0** | **0** | §2.1 done, gated by a test |
| **`.field`/`.select-field`/`.textarea-field`** | — | 18 | 18 | **0** | **0** | **§3.2 done** |
| **`.choice`/`.choice-list`/`.scale-list`** | — | 13 | 13 | **0** | **0** | **§3.2 done** |
| **`.field-row`** | — | 56 | 56 | **4** | **4** | the four §10.4.5 owns |
| `font-size:` in `legacy.css` | 165 | 166 | 163 | **155** | **145** | the ramp, by reference |
| Routes (`page.tsx`) | 26 | 26 | 26 | **26** | **26** | |
| `loading` / `error` / `not-found` | 0 | 3 | 3 | **3** | **17** | **§5.2 + §5.3 done** — 12 route skeletons, 2 staff boundaries, 3 at the root |
| `useFormStatus` / `useTransition` | 0 | 3 | 3 | **3** | **1 file** | `SubmitButton` at 7 sites of 54 forms |
| Live regions (`aria-live` **or** `role=status/alert`) | — | — | — | **16** | **17** | **§5.4 done.** The old row counted the attribute and read 0; `Alert`'s roles were always live regions. The one added is `Announcer` |
| `:active` rules | 0 | 16 | 16 | **16** | **16** | §12.1 done |
| Controls drawn off their declared height | — | — | — | — | **0** | was every button in the app (12h.2c) |
| Floating surfaces with no radius | — | — | — | — | **0** | was 3 (12h.2a); gated by a test |
| Colour literals in any rule body | — | — | — | — | **0** | was 1 (12h.2b); gated by a test |
| `prefers-color-scheme` | 0 | 0 | 0 | **0** | **0** | §6 approved (D-B), scheduled last |

**`legacy.css` is shrinking again: 4,776 → 4,738, and 618 → 608 rule blocks.**
§12i deleted the six `.skeleton*` rules and the `skeleton-pulse` keyframes when
the skeleton became a component (§11.6b: a new component makes that file
smaller, never larger).

**`legacy.css` grew by 23 lines in §12h, all comment.** Four rules gained a
`border-radius` or a token reference plus a note saying what was wrong with
them; the rule-block count is unchanged at 618. The ~100 lines the dead
`.button` block could give back are held by **12h.3a**, because three of its
overrides are the only surviving record of responsive behaviour the §3.1
rollout dropped — deleting them first would bake the regression in.

**`legacy.css` is shrinking.** It had grown 4,771 → 5,164 across the earlier
passes, which §0 rightly called the one number that should worry us. Batch 3
took out 41 rule blocks and 218 lines of CSS — the three control classes, the
three choice classes, nine container-scoped control overrides, three duplicate
`.panel-title` definitions, eighteen `.dlg*` rules, `.field-label`,
`.q-item__required` and `.textarea-field--data`. **Watch the rule-block count,
not the line count:** roughly a fifth of the file is now comment, because each
deletion left a note saying where the rules went and what was verified.

**New in `ui/` across all batches:** `tag.tsx` (§10.2), `submit-button.tsx`
(§5.1), `required-mark.tsx` (§10.4.4), the §3.4 split (`status` · `feedback` ·
`surface` · `data`), `lib/theme.ts` (§2.3), and `FieldLabel` in `form.tsx`
(§3.2 — extracted because `.field-row > label` and `.field-label` had been one
rule serving two elements).

**The diagnosis, updated after batch 3.** The component layer is no longer
thinly covered — it is *covered*: forms, buttons, badges, dialogs and headings
all come from one recipe each, and the stylesheet is emptying rather than
filling. What is left divides cleanly:

- **§5 is the whole UX gap and none of it is theming.** `aria-live` is still at
  zero, route-level `loading`/`error` boundaries at zero of 26, `SubmitButton`
  at 6 of 53 forms. This is the batch with the most user-visible value left.
- **§4 is now tractable** in a way it was not: with the control, choice and
  dialog vocabularies gone, what remains in `legacy.css` is mostly page and
  list layout.
- **§10/§11/§12 are down to the owner-raised design questions** — the toggle's
  A/B/C, the trail's three-way-back, the title in a modal, the date-time
  control, ratings — plus 10.2's `MetaList` decision.

### 0.1 Progress after the navigation batches — **132 done, 57 open**

Counted off the checkboxes, and every tick below was re-verified against the
code on 2026-09-11 rather than trusted from the prose. **This file's prose goes
stale faster than its measurements** — D-C, §2.4, §3.1 and §10.1a were each
describing code that had already moved — so the audit checked the tree first and
the item second.

**Closed in this audit** (work that had landed without being ticked): §3.1,
§3.2, §3.3, §3.5 (the whole of §3 is now done), §10.1a, §10.4.6, D-E.4, §11.3a,
§11.3b, §11.4c and §11.6a–e. **§12h then added the create-course modal and the
consistency sweep behind it**, which closed §10.3b as a side effect and turned
§7 from a list of greps into two gates that actually run (§7a).

**What the 56 open items actually are**, because the raw number reads worse than
the state:

| Group | Open | What it is |
|---|---|---|
| **§5 UX layer** | 10 | the real remaining user-visible work — `aria-live` at 0, route boundaries at 0 of 26, `SubmitButton` at 7 of 54 forms |
| **§4 retire `legacy.css`** | 5 | one item per screen group, gated on nothing now that §3 is done |
| **§6 + §6A dark mode** | 9 | approved (D-B), deliberately last, and gated on D-E.5 |
| **owner answers** | 9 | 10.3b, 10.4.2a, 10.4.3, 10.4.6's shadows, 10.6.2, 11.1, D-D.6, §7's `dangerouslySetInnerHTML`, 12e §7's row menus |
| **§12f page rewrites** | 4 | responses, form detail, audience/schedule, row menus — each its own pass |
| **the rest** | 19 | D-D/D-E verification walks, 10.2's `MetaList` decision, the editor items, §11's dialog and trail follow-ups |

**Nothing in the list is blocked on an unanswered decision** except the nine
marked as owner answers, and none of those blocks a different item.

**The one thing I would do next: §4** — retiring `legacy.css`, screen by screen.
Seven of §5's ten items are closed (three of them because the item's own
measurement was stale, which is worth noticing about this file), and what is
left there either needs a component that does not exist yet (5.9 → 11.2b) or is
a walk-through rather than a change (5.10). §4 is the largest remaining
*structural* item and nothing blocks it now that §3 is finished.

Second: **12h.3a**, the one item here that names a *regression* rather than an
unfinished job — three responsive behaviours the §3.1 rollout dropped, recorded
only in the dead CSS that is about to be deleted.

---

## 1. Decisions that blocked work — all answered 2026-09-11

**D-A, D-B and D-C are closed**, recorded in
[docs/decisions/open-decisions.md](docs/decisions/open-decisions.md) under
_Design-system decisions recorded 2026-09-11_, and the owning documents have
been corrected in the same pass. Nothing in this section blocks anything now.

- [x] **D-A — Corner radius. [Confirmed 2026-09-11 — the code wins, 6 / 5 / 12.]**
      `DESIGN.md` §5 had specified **2 / 3 / 0**; the code had always been
      **6 / 5 / 12** (`--radius-control` at 20 call sites, `--radius-stamp` at
      5, `--radius-panel` at 16). The doc was the side that was wrong and has
      been amended, along with its `rounded` token map and anti-pattern §11.1.
      _Done 2026-09-11 — `DESIGN.md` §5 now declares the three steps, caps
      radius at 12px, and keeps the no-pills rule; nothing in `globals.css` or
      `legacy.css` changed, which was the point._
      **What it unblocks:** §2 (no radius re-derivation needed) and **11.1**,
      whose shape depended on this.
      **What it does not license:** a fourth radius, anything above 12px, or
      card language returning by the back door. Flat-at-rest is what keeps a
      12px panel a sheet rather than a card, and that rule is untouched.
- [x] **D-B — Dark mode: APPROVED 2026-09-11, built last.** §6A's palette is
      the approved one, as-measured. It runs after the token set has stopped
      moving (§9 step 7) so that later token edits are not two-place edits.
      Two carve-outs survive that ordering: - **6A.2 lands early**, with §2.3 — `text-white` hard-coded in
      `buttonClass`'s primary variant is wrong in a light-only app too. - **D-E.5 is now a prerequisite, not a note.** The rail ships `#123a28`
      and §6A proposes `#161719`. Two dark grounds is the failure mode the
      decision explicitly forbids; reconcile them before §6.1 is written.
- [x] **D-C — Stamp tone names: CLOSED 2026-09-11 — the colour names, and the
      role rename was reverted to get there.**
      `Tone` is `green | amber | red | neutral`.
      **This item was wrong when the decision was first put to the owner, and
      the correction is the useful part.** It claimed the code used colour
      names; an earlier pass had in fact already renamed `Tone` to
      `positive | attention | problem | quiet` at 32 call sites, with
      `status.tsx` documenting it as "decision D-C". The owner answered "keep
      the colour names" against that stale description. Re-asked with the true
      state — 32 role-named sites, zero colour-named — the owner **confirmed
      the colour names**, so the rename was reverted: 48 tone references, the
      `Tone` type, `TONE_SHAPE`, four ternary expressions `tsc` caught after the
      regex missed them, and the four `.stamp--*` rules.
      _Two costs, accepted knowingly and written into `status.tsx` so they are
      not rediscovered as bugs:_ this is the one API in the system named by
      appearance while every token is named by role, and after D-D the names no
      longer describe their colours — `green` is UP Forest Green, `red` is UP
      Maroon. _Unaffected:_ `Stamp` renders **word + shape + tone**, so no
      status has ever depended on its colour being read correctly.
      _Also:_ `tone="neutral"` and `buttonClass({ variant: "quiet" })` stay
      separate vocabularies on purpose — a stamp has no `quiet`, a button has
      no `neutral`.
      **Lesson for this file:** §0's numbers are re-measured every pass, but the
      prose items are not, and this one was describing code that had moved on.
      §2.4 turned out the same way, and so did §3.1. Check the code before
      quoting an item at an owner.

---

### D-D — Adopt the university palette **[Confirmed 2026-09-10]**

The owner's call: the app follows the university's colours. My earlier objection
was specifically to **maroon as interface chrome competing with the red signal** —
and the mapping below dissolves it, because maroon _becomes_ the signal instead of
sitting next to it. The structure does not change at all: still **one accent plus
two signals held in reserve**, still one hex per role, still named by role.

**The mapping.** All three UP colours get exactly one job:

| Role in the system                                             | Was             | Becomes          | Source               |
| -------------------------------------------------------------- | --------------- | ---------------- | -------------------- |
| **Accent** — action, links, active nav, focus, positive status | teal `#1c5f63`  | **forest green** | UP Forest Green      |
| **Signal: problem** — invalid, destructive, error              | brick `#9c3b30` | **maroon**       | UP Maroon            |
| **Signal: attention** — flagged, scheduled, warning            | ochre `#8a5a12` | **unchanged**    | already dark UP gold |

The third row is the pleasant surprise: `--amber` at `#8a5a12` is already a dark
gold in the seal's family, so the attention signal needs **no edit at all**. The
palette becomes fully UP-derived by changing two families.

**Proposed token values**, contrast measured against white paper and the
`#f1f0ee` board:

```
/* the one accent — UP forest green */
--accent:      #0b5a33   /* white-on-it 8.32  (was 7.33) */
--accent-deep: #014421   /* white-on-it 11.35 (was 9.62) — official UP Forest Green */
--accent-wash: #e7eeeb
--accent-edge: #bdd2c8

/* signal: problem — UP maroon */
--red:      #8f2226      /* white-on-it 8.66  (was 6.81) */
--red-deep: #7b1113      /* white-on-it 10.87 (was 9.10) — official UP Maroon */
--red-wash: #f2e5e5
--red-edge: #dbb9ba

/* signal: attention — dark UP gold. UNCHANGED. */
--amber:      #8a5a12    /* white-on-it 5.91 */
--amber-deep: #6e470e    /* white-on-it 8.17 */
```

**Every family improves on contrast** — the accent goes 7.33 → 8.32 and the
problem signal 6.81 → 8.66, both well clear of the 4.5:1 floor, with the `-deep`
hover steps above 10:1. Wash and edge tints were derived by luminance-matching
each family's existing tints, so stamps and washes keep their current visual
weight and nothing shifts but hue.

**One hard rule to carry over.** Bright UP gold (`#d6a419`) measures **2.29:1**
on white — it fails badly as text, a border, an icon or a fill. It is
**logo-only**: it may appear inside the seal artwork and nowhere else. Do not add
it as a token, or it will end up on a label.

- [x] **D-D.1 — DONE 2026-09-10.** Applied to `@theme` in
      `src/app/globals.css` (accent + red families) and to the `:root` twins in
      `src/app/legacy.css`. `--focus` moved with the accent (`#164c50` →
      `#014421`) — it was the old accent-deep and would otherwise have left a
      teal focus ring on a green interface. Verified: no old-palette hex
      (`1c5f63`, `164c50`, `e5eeef`, `b9d2d4`, `9c3b30`, `7d2f26`, `f6e4e1`,
      `e0b8b2`) survives anywhere under `src/`.
- [x] **D-D.2 — DONE 2026-09-10.** Contrast comments rewritten in both files
      to the measured 8.3:1 / 11.4:1 (accent) and 8.7:1 / 10.9:1 (problem), and
      the stylesheet header no longer calls the accent "deep blue-green".
- [ ] **D-D.3** Check the two places the accent means _positive status_ rather
      than _action_: `.stamp--green` (`legacy.css:582`, drawn from the accent
      family) and `CreditBadge` / `ValidityBadge` / `CycleStateBadge`. Green as
      both "primary button" and "Valid" is coherent — that is why this mapping
      works — but confirm a green **Open** stamp is still distinguishable from a
      green primary button on the same screen. ~~If not, that is what §D-C's
      role-naming is for.~~ **That escape hatch is closed — D-C settled on the
      colour names 2026-09-11** — so if the two greens do collide the answer
      has to be a visual one (the stamp's wash and edge against the button's
      fill), not a rename.
- [ ] **D-D.4** Verify the accent still reads as _action_ and not as decoration.
      A dark forest green is heavier than the teal it replaces, so re-check the
      one-primary-per-view rule ([DESIGN.md](DESIGN.md) §7a) on the densest
      screens — review queue, publications, participation.
- [ ] **D-D.5 Logos as attribution, not theming.** Add the UP seal and the DCS
      lockup to the sign-in screen, the shell brand mark and the footer — real
      artwork, real colours, on white. Provenance belongs there; it does not
      belong on controls.
- [ ] **D-D.6 Confirm authorization for the UP seal. [Open]** University
      visual-identity marks normally carry usage rules, and a seal on a sign-in
      page reads as an official university system. Ask DCS before shipping
      D-D.5; record the answer here. This gates only the artwork — the palette
      above is derived colour and is not gated on it.
- [ ] **D-D.7** Settle D-D **before §6 (dark mode)**. `#014421` and `#7b1113` are
      both very dark and neither survives a charcoal ground unchanged, so the
      dark palette must be re-derived from these, not from the teal.

### D-E — The rail is the one dark region **[Confirmed 2026-09-11]**

The owner's call, following D-D: the workspace rail is a **deep UP-forest
board**, and the current destination is a **white sheet pinned to it**. This is
an exception to [DESIGN.md](DESIGN.md) §11.4 ("no coloured chrome band of any
hue"), taken deliberately and written into that rule rather than left as a
contradiction between doc and code.

**Why it needed its own palette rather than a background swap.** Every light
token is derived against paper and stone, and most of them fail on a dark
ground: `--accent-deep` reads **1.4:1** there, `--accent-wash` **1.05:1**, and
`--focus` (`#014421`) is a focus ring nobody can see. So the rail carries ten
`--rail-*` tokens, fenced to `.ws-rail` and `.ws-drawer__panel`, all measured
against the `#123a28` ground: ink 10.8:1, muted 6.4:1, icons 7.4:1, ring 6.7:1,
count 6.5:1, hover 1.25, hairline 1.45.

- [x] **D-E.1 — DONE 2026-09-11.** Tokens added to `@theme` in
      `src/app/globals.css` with the `:root` twins derived in
      `src/app/legacy.css` (§2.1 discipline: the hexes live once, in `@theme`).
      Rail, drawer, headings, rows, icons, count badge, footer, sign-out link,
      focus ring and text selection all re-derived. Verified in the browser at
      1440/1280/1024/768/390/320 and by reading the computed styles back off
      the live page, not by eye alone.
- [x] **D-E.2 — Two defects fixed on the way, both pre-existing.** - The active row's `--accent-wash` was **1.05:1** against the old
      `--board-deep` rail — an active state carried entirely by its text
      colour. It is now paper on the dark ground at 12.6:1. - `.ws-rail__item:hover` (0,2,0) outranked `.ws-rail__item--active`
      (0,1,0), so hover repainted the current destination. Harmless while both
      were near-white; it would have made the active row's text vanish on the
      dark ground. Now `:hover:not(.ws-rail__item--active)`. - Also gone: `rgba(255, 255, 255, 0.7)`, the one raw colour literal in the
      rail (§2.3), and the `#fff` in `.ws-rail__action`.
- [ ] **D-E.3 Two "active" treatments now exist, by design — confirm it reads
      that way.** The rail's active row is a white sheet; the sub-nav's is
      `--accent-wash` on white. They differ because their grounds differ, and
      neither works on the other's. Walk a course route and confirm the pair
      reads as one system rather than as two conventions. **[Recommended]**
- [x] **D-E.4 `.ws-rail__count` is styled but unrendered.** `primaryNav` sets no
      counts — counts live in the sub-nav (`.ws-subnav__count`), which is
      untouched. The rail badge is correct if it is ever used; do not treat the
      screenshot's absence of one as a regression.
      _Resolved 2026-09-11, by 12.6 rather than by wiring this rule up._
      `.ws-rail__count` **no longer exists** — the rail's badge and the
      sub-nav's are now one component, `layout/nav-count.tsx`, with
      `ground="rail" | "paper"` as their one documented difference. The rail
      does render counts (`nav.ts:320,447` set `count` on rows), so the
      screenshot's empty rail was a property of that account, not of the CSS.
- [ ] **D-E.5 This changes the input to §6/§6A.** The app now has a dark region
      **before** dark mode is decided (D-B). §6A derived `--board: #161719` and
      a light-green accent from the UP palette; the rail lands at `#123a28` with
      `#93c8ad` as its ring — the same move, on a green ground. Reconcile them
      before building §6: either the dark ground is warm charcoal and the rail
      stays the one green surface, or dark mode adopts the rail's ground and
      §6A's ink steps get re-measured against it. Do not build two dark
      palettes.

---

---

## 2. One token system (currently two)

The token layer now lives alone in `globals.css`, and the hand-written rules were
split out to `src/app/legacy.css` (2026-09-10) — good, and it makes §4 tractable:
a screen is migrated when it stops needing `legacy.css`, and the migration is done
when that file is empty and deleted.

`globals.css` deliberately carries both an `@theme` block (Tailwind-facing:
`--color-*`, `--radius-*`, `--spacing*`, `--text-*`, `--font-*`) and a `:root`
block (hand-written-CSS-facing: `--board`, `--ink`, `--r-*`, `--s1…--s8`,
`--sans`, `--serif`, `--mono`, `--focus`, `--overlay-shadow`). The file says this
is temporary and it is the correct call mid-migration. It must not outlive the
migration — every colour with two names is a colour that can drift.

- [x] **2.1 — Done 2026-09-11. `:root` is now strictly derived, and a test
      holds it there.**
      **24 colour literals** were removed from `legacy.css`'s `:root` — every
      ground, ink step, rule and signal was written out twice, in two files,
      with nothing but review between them and disagreeing. All 54 twins are now
      `var(--<theme token>)`, verified by reading them back off a rendered page.
      Three of them had drifted in kind rather than in value and are worth
      naming: - **`--focus: #014421`** was a fourth copy of `--color-accent-deep`. When
      the accent moved (D-D) the ring had to be moved by hand or the app would
      have kept a teal ring on a green palette. It is now a reference, so that
      cannot come apart again. - **`--overlay-shadow`** restated the one elevation in `rgba()` while
      `@theme` held it in `rgb()` slash syntax — the same shadow, written two
      ways. - **`--s1…--s8`** are now `calc(var(--spacing) * n)`, so the ladder moves
      with the declared base instead of merely agreeing with it today. Note
      `--s5`/`--s6`/`--s7`/`--s8` are ×6/×8/×12/×16, not ×5…×8.
      **It also caught a live bug I had just introduced.** §2.3 replaced the
      invalid-field `background: #fffbfa` with `var(--red-tint)` — but no
      `--red-tint` twin existed, only the `--color-red-tint` theme token. A
      dangling `var()` fails **silently** in CSS: nothing logs, the declaration
      is simply dropped, and the field's background resolved to nothing at all.
      That is the whole argument for the gate below.
      _The gate, per §7:_ **`tests/unit/theme-tokens.test.ts`**, and it is a
      test rather than a grep so it can check both directions — no literal in
      `:root`, **and** no `var()` anywhere in `legacy.css` pointing at a token
      nobody declares. Both failure modes were verified by reintroducing them
      and watching the suite fail.
- [x] **2.2 — Done 2026-09-11. `style={{ … }}` is at ZERO across `src/`.**
      All 59 inline styles are gone (the count had grown from 57 while the item
      sat). 48 were mechanical, seven were the same shapes spread across
      multiple attribute lines, and four needed a decision — listed under 2.3.
      Two things worth knowing for the next pass: - **`--s5` and `--s6` do not map to their own digit.** The ladder was
      4/8/12/**24**/**32**, so `var(--s5)` is `mt-6` and `var(--s6)` is
      `mt-8`. Anyone converting by eye will get those two wrong. - **`--s1…--s8` still exist in `:root`** and are still used by
      `legacy.css`. That is correct for now: the item's own scope was the
      inline styles, and the ladder dies with the stylesheet in §2.5.
      Also converted while there: two `style` attributes that were doing real
      work rather than spacing — a conditional `display: none` in
      `template-editor.tsx` became a conditional `hidden` class, and
      `app-shell.tsx`'s `roomy` margin became a conditional `mb-12`.
- [x] **2.3 — Done 2026-09-11. There is no hex left in any `.tsx` file.** - `ui/form.tsx` — **already fixed before this pass.** It reads
      `aria-invalid:bg-red-tint`, and `--color-red-tint` exists in `@theme`,
      luminance-matched to the `#fffbfa` it replaced so the control reads the
      same while finally being in the maroon family. - `layout.tsx` — `themeColor` now comes from **`src/lib/theme.ts`**, the
      one module allowed to restate a token value, because `viewport`
      metadata is emitted at build time and cannot read a custom property.
      What makes "cannot disagree with the page" true is not the comment but
      **`tests/unit/theme-tokens.test.ts`**, which parses `--color-board` out
      of `globals.css` and fails if the two drift. The test also guards its
      own parser, so a renamed token fails loudly instead of comparing equal
      to an empty string. - The four one-offs, decided per site as the item asked:
      `maxWidth: 420` → `max-w-105` and `maxWidth: 220` → `max-w-55` (both
      exactly on the 4px base, so they were never defects — 420 is 105 × 4);
      `marginTop: 10` → `mt-2`, a **defect**, moved 2px tighter because a
      cancel form directly under the control it cancels belongs at the tight
      end; `minWidth: 0` → `min-w-0` (six sites). - **Not part of this item but found by its grep:** the last three colour
      literals in `legacy.css`. Two became tokens (`.skip-link` and
      `.button--primary`'s `#fff` → `--on-accent`, see 6A.2; the invalid-field
      `#fffbfa` → `--red-tint`). The third, `body { background: #fff }` inside
      `@media print`, **stays a literal on purpose** and now says why: paper
      is white regardless of which theme the screen was showing.
- [x] **2.4 — Verified 2026-09-11, and the answer is "no problem". [Closed]**
      Measured rather than reasoned about: rendered with the face variable set
      the way `next/font` sets it, `--serif` resolves to
      `"<face>", Charter, "Bitstream Charter", "Iowan Old Style", Georgia, serif`
      — **the full stack, fallbacks intact**, and `.rich-text` inherits it.
      Nothing is shadowed.
      _Why the item feared otherwise:_ it describes `layout.tsx` as setting
      `localFont({ variable: "--font-document" })`, which would indeed shadow
      the register from the html element. The code sets
      **`--font-document-face`** — the face and the register already carry two
      different names, which is exactly the fix the item proposed. The concern
      was real when written and had already been addressed; only the doc was
      stale.
      _The original text, for the record:_ `layout.tsx` now sets
      `localFont({ variable: "--font-document" })`, while `@theme` defines
      `--font-document` as the whole stack
      (`var(--font-document-face), Charter, …`) and `:root` sets
      `--serif: var(--font-document)`. An element-level custom property beats
      `:root`, so the html element's value — the bare generated family — likely
      wins and the hand-written fallback chain never applies. `next/font` bakes
      its own `fallback` into the generated family, so this may be harmless in
      practice. Confirm which value `--serif` actually resolves to in the browser
      before assuming either. If the stack is being shadowed, the fix is to give
      the face and the register two different names, which is what the removed
      `--font-document-face` comment was guarding.
- [ ] **2.5** When the last hand-written rule is gone: delete `:root`, import
      Tailwind Preflight, and reconcile the two resets into one — the endgame the
      header comment in `globals.css` already describes.

---

## 3. One component per pattern (currently two)

- [x] **3.1 Roll out `Button`.** 63 raw `<button>`s, 1 import. Until this is
      done, control height, padding, disabled treatment and hover live in two
      places. `buttonClass()` already exists for the link-shaped and
      `<form action>`-submit cases, so there is no reason for a hand-classed
      button to survive.
      _Order:_ staff review and publishing screens first — they have the most
      buttons and the most primary-action ambiguity.
      _Done — verified 2026-09-11._ **Five** raw `<button>`s survive and every
      one is deliberate: the rail's sign-out and the collapse handle (both
      written in their own utilities against `--rail-*`, which `buttonClass`
      does not carry), two `visually-hidden` submits that are keyboard fallbacks
      rather than controls, and `.longtext__toggle`. `ui/button` has **29**
      importers. The "63 raw buttons" the item opened with are gone.
- [x] **3.2 Roll out `ui/form.tsx`** across the 52 `<form>`s. Field label, helper
      text, error text and `aria-describedby` wiring should come from one recipe;
      today they come from `.field`, `.field-label`, `.field-error`,
      `.helper-text`, `.field-row`, `.textarea-field` and per-page markup.
      _Done — verified 2026-09-11._ **21** files import `ui/form`.
      `className="field"`, `.textarea-field`, `.choice` and `.choice-list` are
      all at **zero**; the `select-field` and `field-label` matches that remain
      are mentions inside comments. Four `.field-row`s are left and they are
      exactly the ones **10.4.5** owns (the two date-time boundaries in
      `forms/[formId]` and in `delivery-fields`), so they go with that item.
- [x] **3.3 Consolidate the badge family.** `Stamp`, `ValidityBadge`,
      `CreditBadge`, `PriorityBadge`, `CycleStateBadge` and `Category` all live in
      `src/components/ui/index.tsx`. The composition is already right — every
      badge delegates to `Stamp`, and `Stamp` renders **word + shape + tone**, so
      the "never colour alone" rule is genuinely satisfied. Two things to fix: - `.stamp` sets `font-size: 12px` while the ramp declares
      `--text-stamp: 11px`. The stamp does not use its own type step. - ~~Apply the D-C rename here.~~ **Not happening — D-C closed
      2026-09-11 in favour of keeping `green | amber | red | neutral`.** This
      item is now only the `font-size` fix above.
      _Done — verified 2026-09-11._ `.stamp` reads `font-size: var(--text-stamp)`
      plus the step's own `line-height` and `letter-spacing`, so the badge is on
      the ramp by reference. The rename half of the item was closed by D-C.
- [x] **3.4 Split `ui/index.tsx`.** 23 exported components in one barrel file,
      spanning stamps, alerts, charts, pagination, filter bars and access-denied
      screens. Split by concern (`status/`, `feedback/`, `layout/`, `data/`) and
      keep the barrel re-exporting so no call site changes. Do this **before**
      §3.1–§3.3 add more to it.
      _Done 2026-09-11 — `ui/index.tsx` is now a 21-line barrel re-exporting
      `status` · `feedback` · `surface` · `data`, and no call site changed.
      `button`, `tag`, `required-mark`, `submit-button`, `dialog`, `form`,
      `icons` and `thread` stay direct imports._

- [x] **3.5 Headings.** 18 `<h1>`/`<h2>`/`<h3>` carry no class and inherit only
      the bare `h1,h2,h3,h4 { margin: 0; font-weight: 700 }` reset — so they sit
      outside the type ramp entirely, in the sans register, in an app whose theme
      says titles are Charter. Give them `.page-title` / `.panel-title` /
      `.object-title` (or the eventual utilities) explicitly.
      _Done — verified 2026-09-11._ Four bare headings remain
      (`publications/page.tsx:291,310`, `entry-screen.tsx:38,135`) and each is
      covered by a scoped ramp rule at its own selector, so none of them sits
      outside the ramp. The 18 unclassed headings the item counted are gone.

---

## 4. Retire the hand-written class layer

169 class selectors across 4,918 lines. Migrate **by screen, not by selector** —
a screen either looks the same before and after or the change is visible, which
is the only acceptance test that catches drift. Suggested order, cheapest and
lowest-traffic first:

- [ ] **4.1** `/signin`, `/claim`, `marketing/entry-screen.tsx` — few states,
      no data tables. Proves the utility vocabulary.
- [ ] **4.2** `/sections/[id]`, `/courses/[id]/qa`, `/sections/[id]/history`,
      `student/weekly-form.tsx` — the student surface. Highest reader volume,
      most benefit from getting the document register exactly right. (Class Q&A
      moved to `/courses/[id]/qa` — ADR-0005.)
- [ ] **4.3** `/teach/courses/**` — course setup, templates, forms, and the
      course-owned publication queue and question backlog.
- [ ] **4.4** `/teach/sections/**` — review, participation, roster, import.
      Densest tables; do them last, when the
      table vocabulary is settled.
- [ ] **4.5** `layout/workspace-shell.tsx` and the 30 `.ws-*` selectors — the
      shell. Last, because every screen renders inside it and a regression here is
      a regression everywhere.

**Rule while migrating:** a screen is done when it has **zero** `style={{ }}`
and **zero** legacy class names. Partial migration of a single screen is worse
than not starting it — it puts the same screen in two systems.

---

## 5. UX gaps — the part that is not cosmetic

This section is where the user-visible improvement is. None of it is theming;
all of it is missing behaviour. **[Recommended]** throughout.

- [x] **5.1 — DONE 2026-09-11 (§12l.3).** `SubmitButton` is in **15 files**,
      up from 7, after converting **24 mutation submits**; six submits stay on
      `buttonClass` and each has a stated reason. Every converted control
      relabels *and* shows a spinner, so the press is acknowledged in the same
      frame and the label says what is happening.
      _Superseded finding:_ Zero uses of
      `useFormStatus` / `useTransition` across 52 forms. Today a student pressing
      **Submit** on the weekly form gets no acknowledgement until the server
      responds and the page swaps, and nothing stops them pressing it twice.
      Add one `SubmitButton` that disables and relabels while pending, and use it
      everywhere. It pairs with the `disabled:` treatment `Button` already
      defines, so there is no new visual design needed.
      _Priority screens:_ weekly-form submit, publish/schedule a public answer,
      send a private response, CSV import, roster import.
      _Started 2026-09-11 — `ui/submit-button.tsx` exists and is the only
      `useFormStatus` in the repo. **6 call sites against 53 `<form>`s**:
      `teach/courses/page.tsx`, `responses/page.tsx`,
      `public-answer-composer`, `roster-import-dialog`, `template-editor`,
      `app/loading.tsx`. The named priority screens — weekly-form submit,
      publish/schedule, private response — are still unwired._

- [x] **5.2 — DONE 2026-09-11, and reshaped by the owner's ask along the way.**
      **13 `loading.tsx` files**: one root fallback plus **12 route-level**
      skeletons, each drawing its own page's shape. The owner's wording is what
      turned this from "add skeletons" into a component: *"improve it in such a
      way that it follows the layout of the current page."*
      The six `.skeleton*` rules in `legacy.css` — one generic five-bar block
      used for all 26 routes — are **deleted**, replaced by
      `ui/skeleton.tsx` (`Skeleton` · `SkeletonText` · `SkeletonPanel` ·
      `SkeletonCards` · `SkeletonTable` · `SkeletonControls` · `SkeletonPage`)
      and `ui/shell-frame.tsx`.
      **Two things worth keeping:**
      - **The frame is not optional here.** `AppShell` is rendered by each
        *page*, not by a layout, so a `loading.tsx` replaces the page **and its
        shell** — without `ShellFrame` every slow navigation would blank the top
        bar and the rail and paint them back, the whole window flashing to
        stand in for one column. The chrome is therefore drawn for real and
        **does not pulse**: it is not waiting for anything.
      - **The shape is the specification.** A placeholder with four columns
        before a five-column table looks fine on its own; the fault exists only
        in the transition, which nobody re-checks after editing a page. So
        `tests/unit/skeleton.test.tsx` (18 tests) asserts each skeleton against
        the page it stands in for — verified by changing a column count and
        watching it fail.
      _Superseded finding:_ Zero across 26 routes. Every staff
      screen runs DB queries server-side, so navigation currently feels dead for
      as long as the query takes. Add skeletons that match the notice geometry —
      ruled placeholder blocks on paper, not spinners; a spinner is the wrong
      metaphor for a noticeboard and the wrong signal for a page that will render
      text.
      _Started 2026-09-11 — `src/app/loading.tsx` exists at the app root only.
      It covers a cold navigation to an unmatched segment, not the slow staff
      routes the item is about; those need their own `loading.tsx` beside each
      `page.tsx`._

- [x] **5.3 — DONE 2026-09-11.** `src/app/teach/error.tsx` and
      `src/app/teach/not-found.tsx` join the two at the root, and the split is
      the point: the root pair renders a standalone sheet on the board, which is
      right when the shell itself could not be built and wrong for a staff
      route, where losing the top bar and the rail makes a failed query look
      like a failed sign-in. The staff pair keeps the chrome (`ShellFrame`) and
      replaces only the column that broke.
      **Where an unauthorized course lands is NOT here, and that is deliberate.**
      Those are caught in the page and render `AccessDenied` inside the real
      shell — it says less, on purpose, because a boundary that distinguished
      "no such course" from "not your course" would confirm the course exists
      to someone with no access (§9, deny-by-default). The same rule is why
      `error.tsx` renders only `error.digest` and never `error.message`: a
      server component's message can carry a query fragment, a record id or a
      student's address out of a stack trace.
      _Superseded finding:_ Zero. An unauthorized or missing
      course currently produces a framework error page with none of the app's
      chrome, which for a permissions-heavy app is a routine occurrence, not an
      edge case. `AccessDenied` already exists in `ui/index.tsx` and should be
      what these boundaries render.
      _Started 2026-09-11 — `src/app/error.tsx` and `src/app/not-found.tsx`
      exist at the root. Same caveat as §5.2: a route-level boundary is still
      needed where an unauthorized course or a missing section is actually
      thrown._

- [x] **5.4 — DONE 2026-09-11, and this item's PREMISE was wrong. The
      correction is the useful part.**
      The item was opened on `grep aria-live → 0` and concluded that a
      screen-reader user is told nothing. That grep was reading the *attribute*
      rather than the *semantics*: `Alert` has carried `role="alert"` /
      `role="status"` since it was written — which imply
      `aria-live="assertive"` / `"polite"` — and all **30** outcome banners go
      through it, including the two client-mutating forms (`weekly-form`,
      `add-staff-dialog`). Those announce correctly today and always did.
      **What was genuinely missing is narrower, and no grep would have found
      it.** A live region announces *mutations*. Every page-level outcome here
      arrives as a **full document load** — a server action redirects to
      `?ok=Course+created.` — so the banner is present at parse time, which is
      not a mutation. `role="alert"` is announced at load by most screen
      readers; `role="status"` generally is not. **So every success in the app
      was silent** — the one case where a reader most needs to know it worked.
      The fix is not "make success assertive" (DESIGN.md §9 is right that an
      accomplishment should not interrupt). `ui/announcer.tsx` renders an
      **empty** polite region on the server and fills it one frame after mount,
      which makes the text a change and therefore announced — once, politely,
      with the visible banner's semantics untouched.
      **It reads the outcome itself** rather than being handed it, so this is
      one line in `WorkspaceShell` instead of an edit to thirty pages: the
      message is already in the URL, and a prop threaded through `AppShell`
      would be a second copy a page could forget. Same reasoning as 12f.2's
      derived last crumb.
      *Verified in the running app:* region present and empty at load, filled
      with "Course created." after mount, `?error=` winning over `?ok=`, and
      the text never visible twice.
- [x] **5.5 — DONE, and the count in this item was five batches stale.**
      Re-measured 2026-09-11: **20 `<EmptyState>` call sites across 17 files**,
      not 2. Every list the item names — review queue, backlog, publications,
      roster, participation, audit, Q&A archive, student history — has one, and
      each says what to do next rather than "No results". A sweep of every
      staff page that maps over a collection found exactly **one** without:
      `forms/[formId]/instances/[instanceId]`, which is a detail view of one
      occurrence rather than a list, so it has nothing to be empty of.
      One thing the item got right and is worth keeping: the case that matters
      is a brand-new course, which is every teacher's first five minutes. That
      is covered — and 12h.2e improved it, since the courses-list empty state
      now names the header button instead of linking to a URL that no longer
      opens anything.
      _Superseded finding:_ `.empty` appears at 2 call sites. Every list — review queue, backlog, publications, roster,
      participation, audit, Q&A archive, student history — needs its own empty
      copy, and an empty state should say _what to do next_, not "No results".
      This matters most on a brand-new course, which is every teacher's first
      five minutes with the product.
- [x] **5.6 — DONE, and this count was stale too.**
      Re-measured 2026-09-11: **46 `<Alert>` call sites** using all four
      variants — 18 `error`, 12 `success`, 6 `info`, 6 `warning`. Feedback has
      one shape, and §5.4 depends on that being true: every one of those
      carries `role="alert"` or `role="status"`, which is what makes an outcome
      announceable at all.
      _Superseded finding:_ 2 call sites for 4 defined variants.
- [x] **5.7 — DONE 2026-09-11. The pattern was already chosen; the missing half
      was the sticky column, and it was the half that mattered.**
      Horizontal scroll is applied to **every** wide table: 5 of the 7 raw
      tables sit in `.table-scroll` (now 10 sites), the forms table 12e.2
      rebuilt carries its own `overflow-x-auto`, and the 7th is `BarChart`'s
      three-column companion, which is too narrow to need one. Per-row stacking
      was rejected for the matrix, as the item recommended: a grid of weeks does
      not stack into anything readable.
      **What was missing:** no sticky first column existed anywhere, so the
      participation matrix scrolled the student's NAME off the screen with the
      rest of the row. Three weeks to the right you were reading a row of
      Yes/No with no idea whose it was — a matrix whose row labels can leave
      the screen is a matrix you cannot read.
      The student column is now pinned, header and body, with an opaque fill
      (without it the scrolled columns show through) and `z-20` over the body's
      `z-10` so the header wins in the corner where they overlap. `sticky` also
      preserves the containing block that `.data-table th { position: relative }`
      was there to provide, so the `visually-hidden` children stay clipped
      inside the scroller.
      *Verified in the browser at 640px:* `position: sticky`, opaque white,
      header `z-index: 20` over body `z-index: 10`, and the pinned cell's left
      edge unchanged when the scroller moves. **Not** verified under real
      overflow — the seed holds one cycle, so the table is not yet wide enough
      to scroll; the mechanism is right and the wide case needs a term's worth
      of data to exercise.
- [ ] **5.8 Form error summary.** Server-side validation is the source of truth
      (correctly), so a rejected long form currently reloads with errors scattered
      down the page. Add a summary block at the top that links to each bad field,
      and focus it on load.
- [ ] **5.9 Destructive-action confirmation.** `Button variant="danger"` is
      styled as the theme requires — bordered, not an eager red slab. Confirm each
      danger site is _also_ gated by a confirmation step, and that the confirmation
      names the object ("Remove 41 students from CS 33 – Section B") rather than
      asking "Are you sure?".
- [ ] **5.10 Focus and keyboard.** 9 `focus-visible` rules and no `outline: none`
      anywhere — good, and the theme says the ring is never removed. Verify by
      keyboard walk-through that the `<details>`-based drawer, the filter menu and
      the dialog trap and restore focus, since those are the three places
      pre-hydration chrome and focus management interact.

---

## 6. Dark mode — "board at night"

**D-B: APPROVED 2026-09-11.** §6A's palette is approved as-measured and this
section is now real work — scheduled **last** (§9 step 7), because it doubles
every token and should land once the token set has stopped moving. **D-E.5 is a
prerequisite:** the rail already ships a dark ground (`#123a28`) and §6A
proposes another (`#161719`); reconcile the two before 6.1 is written, since
"do not build two dark palettes" is the one thing this section must not do.

- [ ] **6.1** One inverted token set, defined only as overrides of the `@theme`
      names — never a parallel palette, or the two will drift the way the token
      systems in §2 did.
- [ ] **6.2** Three states, per the standard approach: light tokens on bare
      `:root`; a `prefers-color-scheme: dark` block guarded so an explicit light
      choice still wins; and an explicit `[data-theme="dark"]` block so a toggle
      wins in both directions.
- [ ] **6.3** Re-derive, do not reuse: `--color-accent` at `#1c5f63` gives
      7.3:1 under white text on light ground and will not hold contrast on
      charcoal. Same hue, new lightness. Re-check the four ink steps and all three
      signal families; the contrast ratios noted in `@theme` are light-ground
      ratios and none of them transfer.
- [ ] **6.4** Keep `themeColor` in `layout.tsx` in step with whichever ground is
      active (§2.3).
- [ ] **6.5** Decide the **toggle's home and persistence. [Open]** Three states
      (§6.2) need somewhere to set them. The account menu in the top bar is the
      only per-viewer control surface that already exists. Persistence has no
      obvious answer: `localStorage` is per-device and flashes the wrong ground
      for one frame before hydration, a cookie read on the server renders the
      right ground first time but adds a request-time branch to every page, and a
      column on `users` makes a display preference into schema. _Recommendation:_
      cookie, set by the toggle and read in `layout.tsx`, because this app is
      server-rendered per navigation and a flash of the wrong ground on every
      page load is worse here than in a client-routed app. **[Recommended]**

### 6A. The proposed dark palette **[Recommended 2026-09-10]**

§6.1–6.4 say _how_ to structure dark mode but leave nothing to approve. This is
the actual option, derived from the **D-D** UP colours as **D-D.7** requires —
not from the retired teal — and every value measured rather than eyeballed.

**Ground and ink.** A warm charcoal, so the stone ground's warmth survives the
inversion. `--paper` sits _above_ `--board` in lightness, keeping the "sheet on a
board" relationship the whole theme rests on rather than inverting it into a hole.

```
--board:       #161719   /* the app canvas */
--board-deep:  #101112   /* rail, recessed regions, pressed segment */
--paper:       #1e2022   /* notices, panels, inputs, composers */
--paper-quiet: #24272a   /* quoted blocks, table headers, disabled fills */

--ink:        #ecebe8   /* 13.71 on paper  (light mode: 16.7) */
--ink-soft:   #bcbab6   /*  8.43           (8.8)  */
--ink-muted:  #96948f   /*  5.39           (5.3)  */
--ink-faint:  #706e6a   /*  3.21 non-text  (3.2)  */

--rule:         #313437   /* default hairline */
--rule-strong:  #43474b   /* pane seams, segment borders */
--rule-ink:     #5c6064   /* the 2px batten under a strip label */
--control-edge: #6b6f73   /* input and secondary-button strokes, 3.23 on paper */
```

The four ink steps land within 0.4 of their light-mode ratios at every step, so
the **hierarchy is preserved, not just the legibility** — secondary text stays as
much quieter than primary as it is today.

**Accent and signals**, same three UP hues, new lightness and lower saturation.
Straight HSL lightening of `#014421` produces `#03c962` — a neon green that reads
as a terminal and would break the calm the theme is built on — so each family is
desaturated as it lightens.

```
/* accent — UP forest green, hue 149 */
--accent:      #61b388   /* dark text on it 7.17; as a border 6.47 on paper */
--accent-deep: #93c8ad   /* links 8.64 on paper; 7.63 on the wash */
--accent-wash: #192e23
--accent-edge: #355a47

/* signal: problem — UP maroon, hue 359 */
--red:      #c6393c   /* border only, 3.15 on paper */
--red-deep: #e07b7c   /* text 5.68 on paper; 5.61 on the wash */
--red-wash: #341919
--red-edge: #653435

/* signal: attention — UP gold, hue 36 */
--amber:      #be8837   /* border only, 5.27 on paper */
--amber-deep: #dcb374   /* text 8.36 on paper; 7.59 on the wash */
--amber-wash: #302617
--amber-edge: #5e4c31

--focus: #93c8ad   /* 8.64 on paper — the ring must clear the ground it sits on */
```

**All eighteen pairings the system actually uses pass**, each against the floor
for its real role. `--red` and `--amber` are checked at **3:1 as UI boundaries,
not 4.5:1 as text**, because neither is ever a fill: `grep 'background.*var(--red)'`
over `legacy.css` returns nothing, and DESIGN.md §6 requires it
("destruction is a bordered button, never a red slab"). Only `--accent` is a
fill, in three places.

**One inversion that is a real decision, not a derivation.** On a light ground a
primary button is white text on `--accent`. On a dark ground the same move needs
a dark green fill, which sinks into the page. So the dark primary is **dark text
on a light green fill** (7.17:1). That flips the button's text colour between
themes, which means `Button`'s `primary` variant needs a themed text token rather
than the literal `text-white` it carries today — the one component change dark
mode forces.

- [x] **6A.1 — Approved 2026-09-11.** The values above are the approved dark
      palette, unchanged. They stop being **[Recommended]** and become the
      reference §6.1–6.4 build from — subject only to the D-E.5 reconciliation
      of the two dark grounds, which may move `--board` / `--board-deep` and
      nothing else.
- [x] **6A.2 — Done 2026-09-11, ahead of the rest of §6 as planned.**
      `--color-on-accent` is declared in `@theme` (`#ffffff`, with `#14161a`
      recorded as its dark value) and derived into `:root` as `--on-accent`.
      `buttonClass`'s primary variant reads `text-on-accent`, and the two
      `color: #fff` sites in `legacy.css` — `.button--primary` and `.skip-link`,
      both white on an accent fill — now read `var(--on-accent)`. The literal is
      gone from every on-accent pairing, which was the point: it is the one
      pairing that has to invert, so it should never have been a hard-coded
      colour even in a light-only app.
- [ ] **6A.3** Re-check the three `--accent` fills (`legacy.css:688`, `:1773`,
      `:4363`) and the `has-[input:checked]` choice state, which is the fourth
      place the accent becomes a ground.
- [ ] **6A.4** Verify the **stamp** shapes still carry status without colour on
      the dark ground. The word-plus-shape-plus-tone rule (DESIGN.md §9) is what
      makes this safe, and it is also what makes dark mode cheap here — a theme
      that signalled by colour alone would need re-testing per state.
- [ ] **6A.5** Check KaTeX and the sanitized rich-text output. Both render
      staff-authored HTML that inherits `color`, but KaTeX ships its own
      stylesheet; confirm no rule in `katex.min.css` pins a light-ground colour.
- [ ] **6A.6 [Open]** Decide what dark mode does to the **two type registers**.
      Charter at 400 weight on a dark ground reads thinner than on paper, which
      is the classic reason serif body text is set slightly heavier when
      reversed. Either accept it, or carry a per-theme weight — and if the latter,
      §10.1's font decision has to settle first.

---

## 7. Guardrails — make the greps the gate

**Before the greps: run the build.** `npm run typecheck`, `npm run lint` and all
233 tests passed on a change that **would not start the app** — a `"use client"`
component imported one constant from a module that also imported
`next/headers`, and one import pulls in the whole module, so a server-only
dependency reached the browser bundle. Nothing but `next build` sees that: it is
a bundler boundary, not a type error, and no unit test renders the shell.

```sh
npm run build     # the only check that sees the server/client boundary
```

**And do not run it while `npm run dev` is running.** They share `.next`, so a
build pulls the module graph out from under the running server and every route
starts returning a 500 — which looks exactly like a code defect and is not one.
Stop the dev server, build, then start it again.

**Neither one replaces clicking the thing.** The rail's collapse was verified in
static fixtures, passed, and still shipped three defects that only appear in the
real shell — including a toggle that could not collapse the rail it lived inside
(§10.4.2). For interactive chrome, drive the running app.

Required for any change that adds a `"use client"` file, or that adds an import
to one. The rule that prevents it: **a module imported from both sides of the
boundary must import nothing itself** — `src/lib/rail-cookie.ts` exists for
exactly that reason and says so.


Each of these is currently non-zero and should end at zero. Wire them into
`npm run lint` (or a `scripts/design-check.sh`) so consistency is enforced by the
build rather than by whoever reviews next.

```sh
# a second colour literal outside @theme
grep -nE '#[0-9a-fA-F]{3,8}' src/app/globals.css | sed -n '/@theme/,$p'
grep -rnE '#[0-9a-fA-F]{6}' src --include='*.tsx'

# ad-hoc spacing and geometry
grep -rn 'style={{' src --include='*.tsx'
grep -rn 'var(--s[0-9]' src --include='*.tsx'

# components bypassed — the legacy CLASS, not the <button> ELEMENT.
# Looking for `<button` was the mistake: it cannot see a button-shaped `<a>`,
# and `EmptyState` rendered one from an interpolated class string for five
# batches without this noticing (12h.2e). What is being hunted is a control
# NOT built by `buttonClass`, whatever its tag — so grep the thing that
# identifies the old system.
grep -rnE '"button( |--)|button button--|\bbutton--' src --include='*.tsx'
# and the raw element, for the five deliberate survivors (§3.1)
grep -rn '<button' src --include='*.tsx' | grep -v buttonClass

# type ramp bypassed
grep -c 'font-size:' src/app/globals.css

# the one sanctioned dangerouslySetInnerHTML (AGENTS.md §13)
grep -rn 'dangerouslySetInnerHTML' src --include='*.tsx'
```

**On that last one:** there are two — `src/components/rich-text.tsx:26` and
`src/components/rich-text-client.tsx:24`. `AGENTS.md` §13 says the only sanctioned
one lives in `rich-text.tsx`. The second one carries a clear rationale (the
markdown pipeline is `server-only`, so a client component importing it would ship
a sanitizer to the browser and create a second place HTML is trusted) and it
renders only already-sanitized server output. **This is a documentation gap, not a
code defect** — either amend §13 to name both files and state the invariant
("`PreRenderedRichText` accepts only `renderRichText` output"), or collapse the
two. Do not "fix" it by deleting the split; that would undo a deliberate security
boundary. **[Open]** — needs a one-line owner ruling on which.

---

## 7a. What is actually enforced now

Owner question, 2026-09-11: *"how do we prevent this discrepancies? do i adjust
the guardrails or should do loop engineering?"*

**Guardrails — and the reason is that none of the faults came from forgetting a
rule.** Every one of them came from a rule nobody could *observe* being broken.
Here is the actual evidence, from the five found in §12h:

| Fault | Was the rule written down? | Could anything see the violation? |
|---|---|---|
| buttons 41px against a declared 38 | yes — token, DESIGN.md §6, **and the component's own comment** | no |
| input 39 beside select 38 | yes — "same input height" | no |
| `More` flyout with no radius | yes — DESIGN.md §5 | no |
| a hand-written copy of `--color-scrim` | yes — §2.1, **with a test** | no: the test read `:root`, the literal was in a rule body |
| `EmptyState` on the legacy `.button` | yes — §3.1 | no: §7's grep matches `<button`, this is an `<a>` with an interpolated class |
| `Dialog` attaching no listeners | n/a | no: `typecheck`, `lint` and 245 tests all passed |

Re-prompting would not have helped any of them. The rule was already stated, in
the right place, and in two cases **the code's own comment asserted the thing
that was false**. That is the signature of a missing check, not a missing
instruction — so the answer is guardrails, with one correction about what kind.

**The correction: a guardrail has to read the same thing a reader sees.** §7's
greps read `.tsx` source, and four of the six faults are invisible there —
two are arithmetic between a class, a font-size and a border, one hides inside
a template literal, one is a hook dependency. So there are now two gates, and
they are deliberately different in kind:

| Gate | Reads | Catches | Run by |
|---|---|---|---|
| `tests/unit/theme-tokens.test.ts` | the stylesheet, **including every rule body** | a colour literal anywhere · a radius off the 6/5/12 scale · a floating surface with no radius · a dangling `var()` · a literal in `:root` | `npm test` |
| `scripts/qa/design-check.mjs` | the **rendered page**, via `getComputedStyle` | declared height ≠ drawn height · off-scale radius as computed · an elevated surface with square corners · a dialog that cannot reopen after Escape | `npm run design:check` |

Both were verified the only way a gate can be: **by reintroducing each real
defect and watching it fail with the selector named.** A gate that has never
failed is a gate nobody has tested.

```sh
npm test                 # the stylesheet gate, with the rest of the suite
npm run design:check     # the rendered gate; needs the app running
```

`design:check` walks seven routes and measures 135 controls. It is a script
rather than a test because it needs a running app and a signed-in session —
and `NEXT_DIST_DIR` (see `next.config.ts`) now exists so a verification build
can run **while** the dev server holds `.next`, which used to be its own
footgun.

**Where loop engineering does help, narrowly.** Not for these. It is the right
tool when the failure is *"the agent did not know"* rather than *"nothing could
tell"* — and the cases in this file that fit that shape are already handled by
writing the finding next to the code (`cn.ts` on the `text-*` merge,
`rail-cookie.ts` on the boundary rule, this file on all of it), plus three lines
in [AGENTS.md](AGENTS.md). Three rules in AGENTS.md is loop engineering that
worked, because each one names a specific failure that had already happened.
A fourth paragraph of "remember to keep the design consistent" would not have
caught a 3px overshoot in arithmetic nobody performed.

- [ ] **7a.1 Put both gates in CI.** They run locally and on request; nothing
      runs them unasked, which is the state §7 has been in since it was
      written. `npm test` is the easy half. `design:check` needs a database and
      a dev server, so it belongs in the same job that already seeds one.
- [ ] **7a.2 Extend `design-check` as faults are found, never generically.**
      Each assertion in it exists because something real broke; keep it that
      way. The next two worth adding are named in 12h.3a (a control's
      responsive behaviour on a phone, where the dropped `.button` overrides
      were) and §5.4 (assert one `aria-live` region exists once it does).
- [x] **7a.3 — DONE 2026-09-11.** §7's grep now looks for the legacy CLASS
      rather than for the `<button>` element, which is what it was actually
      trying to find. The old line (`grep '<button' | grep -v buttonClass`)
      could not see `EmptyState`'s `` `button button--${…}` `` — an `<a>`, with
      the class built by interpolation — and that is precisely what it missed
      for five batches (12h.2e). The rendered gate is what catches the rest.


## 8. Explicitly not in this list

- **No new theme, and no new design direction.** `DESIGN.md` governs. **D-D
  revises the palette's hues to the university's, not the theme** — one accent,
  two signals, roles unchanged; that is a re-colour inside the noticeboard, not a
  new direction. Neumorphism,
  glassmorphism, elevation-heavy Material and full brutalism were all considered
  and rejected for this product — low-contrast controls and floating cards are
  wrong for dense staff tables, status stamps and long-form student prose.
- **No new dependencies.** Everything above is achievable with the installed
  Tailwind 4 + `clsx` + `tailwind-merge`, per `AGENTS.md` §13.
- **No component library adoption.** `ui/` is the library.
- **No scope changes.** [docs/product/scope.md](docs/product/scope.md) owns the
  product boundary; nothing here pulls a deferred feature in.
- **No re-litigating settled architecture.** Next.js App Router + Drizzle +
  Auth.js, per [ADR-0001](docs/decisions/ADR-0001-current-stack-and-scheduler.md).

---

## 9. Suggested order

1. ~~**§1**~~ — **all four answered 2026-09-11.** D-A: the code's 6 / 5 / 12
   wins and DESIGN.md was amended. D-B: dark mode approved, last. D-C: closed,
   colour names stay. 10.1b: two families is the ceiling, so 10.1a is the whole
   typography fix and §4 is no longer gated. D-D and D-E were already closed.
   **Nothing in the list is blocked on an unanswered decision now** — what
   remains open is 11.1's A/B/C choice, 11.4b, 10.3b, 10.4.3's scope, 10.4.6's
   method and §7's `dangerouslySetInnerHTML` ruling, each answered where it
   sits rather than up front.
2. ~~**§5.2, §5.3**~~ — **done 2026-09-11** (twelve route skeletons that match
   their pages, plus staff-segment boundaries). ~~**§5.4**~~ — **done**, after
   its premise turned out to be wrong. ~~**§5.1**~~ — **done
   2026-09-11** (§12l.3). **§5 is now 7 of 10 done**, and what remains in it is
   5.8 (a linked form error summary), 5.9 (confirmation on every danger site,
   which needs 11.2b's `ConfirmDialog`) and 5.10 (a keyboard walk-through).
3. **§2.2, §2.3** — kill the inline styles and the off-token values. Mechanical,
   high volume, visible in the diff.
4. ~~**§3.4**~~, ~~**§3.1**~~, ~~**§3.2**~~, ~~**§3.3**~~, ~~**§3.5**~~ —
   **all done 2026-09-11.** The rollout is finished: `ui/form.tsx` went from 1
   importer to 21, the control and choice classes are at zero, and `legacy.css`
   started shrinking.
5. **§4** — retire the class layer, screen by screen.
6. **§5.4–§5.10** — the rest of the UX layer.
7. **§6 + §6A** — dark mode, **approved 2026-09-11**. Still last on purpose:
   it doubles every token, so it lands once the token set has stopped moving.
   Two things come out of order — **§6A.2** (`--color-on-accent`) goes with
   §2.3, because a primary button whose text colour is a literal is wrong even
   in a light-only app, and **D-E.5**'s reconciliation of the rail ground
   against §6A's `--board` happens before 6.1.
8. **§2.5, §7** — delete `:root`, import Preflight, turn the greps into a gate.
   _Partly done 2026-09-11:_ the token-layer gate exists as
   `tests/unit/theme-tokens.test.ts` (see §2.1), which covers §7's first grep
   and the dangling-`var()` case no grep would have caught. The rest of §7 and
   all of §2.5 still wait on §4.

**§10 and §11 are owner-raised and sit outside this order** — each carries its
own (§10.7, §11.7). Where they collide with a step above, they win: §11's new
components all land in the `ui/` split at step 4, and §10.2's `Tag` is the one
new component with a confirmed reason to exist.

Steps 2 and 3 are independent and can run in parallel. Do not start §4 before
§3, or the migrated screens will hand-roll the components §3 is about to define.

---

## 10. Owner feedback — 2026-09-10 **[Confirmed]**

Raised directly by the owner. This section and §11 are the only owner-raised
ones in this file; §1–§9 are **[Recommended]** until approved, so **they outrank
them**. Where a request conflicts with [DESIGN.md](DESIGN.md), the conflict is
called out and a theme-compatible alternative offered rather than the rule being
quietly broken — see 10.1 and 10.4.6.

### 10.1 Typography — one or two fonts, and a modern one

> _"1-2 fonts across the entire site (modern font style sana, parang common font
> kasi yung nasa side bar)."_

The system already declares exactly two registers ([DESIGN.md](DESIGN.md) §2):
Charter for text a human wrote, platform sans for anything the system says. So
the count is not the problem — **placement is**. The list column renders in
Charter (`globals.css`, `.ws-row__title` and `.ws-row__excerpt` →
`font-family: var(--serif)`), which is why the navigation reads as an unfamiliar
serif rather than as chrome.

Two ways to answer it. Do **A** first; it is cheap and may be the whole fix.

- [x] **10.1a — Confine the document register to prose. [Recommended]**
      Serif is for student and teacher _prose_ and the titles of things you read
      — not for nav, list rows, excerpts, counts or labels. Move
      `.ws-row__title` and `.ws-row__excerpt` to `var(--sans)` and audit the
      ~20 other `var(--serif)` rules for chrome that should not have it. Theme
      unchanged, DESIGN.md unchanged, and the sidebar stops looking odd.
      _Done — verified 2026-09-11._ Both named rules are off the document
      register: `.ws-row__excerpt` states `font-family: var(--sans)` with a
      comment saying why, and `.ws-row__title` no longer sets a family at all
      (it inherits the sans). The audit of the other rules is done too — the
      **23** `var(--serif)` rules left are all prose or the title of something
      you read (`.doc`, `.rich-text`, `.post__words`, `.thread__body`,
      `.page-title`, `.object-title`, `.panel-title`, `.answers dt/dd`, the
      entry screen's lede), which is what the item asked the register be
      confined to. No nav, list row, excerpt, count or label is serif any more.
      _One thing left for §4.5, not for this item:_ `.ws-row__title` still
      types `font-size: 13px` rather than referencing `--text-ui-sm`.
- [x] **10.1b — Answered 2026-09-11: "2 fonts max". No new family.**
      The ceiling is two families and the app already ships exactly two
      (self-hosted XCharter + the platform sans), so the complaint is answered
      by **placement** — 10.1a — not by swapping a face. `src/app/fonts/`
      survives, no webfont is added, and [DESIGN.md](DESIGN.md) §2 records the
      ceiling rather than being rewritten. **§4 is no longer gated on this.**
      _One question left, and it is not blocking:_ if a _named_ modern sans
      (Inter, Geist, IBM Plex) is wanted after seeing 10.1a, it **replaces the
      platform stack** rather than joining it — still two families, but it
      trades "looks native on each OS, zero third-party requests" for a
      webfont. Ask once 10.1a has shipped and the sidebar has been looked at
      again; do not pre-empt it.

### 10.2 Counts as tags, not a dot-separated sentence

> _"Parang flare component sana yung '1 form, 1 open now, 5 responses,
> 1 section' — tag component sana."_

- [ ] **10.2** Build a **`Tag`** (chip) component and a `TagList`, then convert
      `MetaList`. `MetaList` (`src/components/ui/index.tsx:246`) currently renders
      those facts as dot-separated plain text and is called at **~15 sites**
      (`app/page.tsx`, `teach/courses/page.tsx:172`,
      `teach/courses/[id]/page.tsx:98,192`, roster, backlog, publications,
      section forms, Q&A, `forms/[id]`). Converting `MetaList` itself gets every
      site at once.
      _Design constraint:_ a tag is **not** a `Stamp`. `Stamp` means _status_ and
      carries a shape and a tone; a tag is a neutral count or fact and must stay
      quiet — `--color-paper-quiet` fill, `--color-rule` border, no tone, no
      shape. If tags borrow the stamp's colours, status stops being legible as
      status. Keep them visually subordinate.
      _Started 2026-09-11 — `ui/tag.tsx` ships `Tag` + `TagList` with the
      constraint written into the file (quiet fill, hairline, no tone, no
      shape). **3 `TagList` call sites** — courses list, roster, responses —
      plus one `Tag` inside `ui/surface.tsx`. `MetaList` is still imported by
      **13 pages**, so the conversion the item describes ("converting
      `MetaList` itself gets every site at once") has not happened; the two
      now coexist. Decide whether that is the end state or a stopping point._

### 10.3 Course title — drop the explanation, maybe drop the field

> _"Remove 'How you and your students refer to it. This is the name shown
> everywhere.' Course code na lang, irrelevant lahat ng info about title —
> modal na lang siguro to??"_

- [x] **10.3a** Delete the helper text at
      `src/app/teach/courses/page.tsx:120`. The course-create form already leads
      with the code, and `teach/courses/page.tsx:170` already comments that "the
      code IS the heading" — the helper paragraph argues with the design around
      it.
      _Done 2026-09-11 — the string "refer to it" no longer appears anywhere
      under `src/`._

- [x] **10.3b — ANSWERED 2026-09-11 by `modal.md`, and the answer is both
      halves of what was recommended.** The title stays a field and is now
      **optional**: course creation requires the code and the term, and an
      empty title creates the course (12h.1b). The create flow *is* a modal
      (12h.1a), which is the "modal na lang siguro to??" the item was holding
      open. Nothing needed changing at the ~6 read sites, because `MetaList`
      already drops an empty fact — so a titleless course renders one line
      rather than a line with a gap in it.
      _Superseded text:_ The owner asks
      whether the title belongs in a modal. It cannot simply be removed: it is
      referenced across the app (`MetaList items={[course.title]}` on the courses
      list, the course header, and the student home cards).
      _Recommendation:_ keep the field, drop it out of the primary create flow —
      code (+ term) is all that is required to create a course, and the title
      becomes an optional edit afterwards. That satisfies "course code na lang"
      without breaking the ~6 read sites. Confirm before building.

### 10.4 Forms

**Course overview**

- [x] **10.4.1** `teach/courses/[id]/page.tsx:244` renders **"View form"** as a
      button. Navigation is not an action — make it a hyperlink. (The `"Set up"`
      branch of that same ternary _is_ an action and can stay a button.)

**Course-specific workspace**
_Done 2026-09-11 — `teach/courses/[id]/page.tsx:243` is a `.link`; the
first-time `Set up` branch keeps the button, with a comment saying why
the two differ._

- [x] **10.4.2 Collapse the workspace rail. [Confirmed — BUILT 2026-09-11]**
      > _"Hide parang UVLE yung workspace na column para nav bar ng course na
      > lang yung kita."_
      Lives in `src/components/layout/workspace-shell.tsx` and the `.ws-*`
      rules. **Four decisions were taken on 2026-09-11** against an owner-supplied
      reference image (a dark rail collapsing to icons with a flyout submenu) and
      are recorded as **N-1…N-4** in
      [docs/decisions/open-decisions.md](docs/decisions/open-decisions.md):
      1. **A manual chevron, not the route.** The owner chose the control over
         the automation, so this item's original wording — collapse *because*
         you are inside a course — is **superseded**. A rail that changes shape
         on navigation is the instability §12 spent its effort removing.
      2. **A cookie, read on the server**, so the rail paints in the right shape
         first time. Same answer §6.5 gives the theme toggle, so the app has one
         place a viewer preference lives.
      3. **Icons plus a flyout on hover and focus** when collapsed.
      4. **11.4b answered:** breadcrumbs everywhere, the other two "way back"
         mechanisms retired — which makes 11.4c's "land the trail with this" a
         hard prerequisite rather than advice.
      *What was taken from the reference image, and what was not:*
      | From the image | Verdict |
      |---|---|
      | collapse chevron | **take** — it is decision N-1 |
      | icon-only collapsed rail | **take** (N-3) |
      | flyout panel from a collapsed row | **take, and it is required** — see below |
      | pinned footer / sign-out | already built (§12.7d) |
      | children nested inside the rail | **leave** — this app's second level is the sub-nav **column**, and this item asks to collapse the rail *so that column shows*. Nesting it would invert the request and add a fourth "way back" mechanism to the three §11.4b just cut to one |
      | ~16–20px radii | **leave** — above D-A's 12px cap, and the no-pills rule |
      **Why the flyout is a necessity here and not a flourish.** The image's
      top-level items are distinct concepts — Dashboard, Analytics, Settings. This
      rail is mostly *instances of one kind*: "My courses" renders one row per
      course, every one carrying the same `course` glyph. Collapsed to icons, CS
      33, CS 21 and CS 11 are three identical squares. The label has to live
      somewhere, and the flyout is the only place left.
      _Constraint, and it held:_ the shell's chrome works **before hydration**.
      The server renders the correct shape from the cookie, every link works
      with no JavaScript, and the reveal is pure CSS `:hover` / `:focus-within`.
      Only the *toggle* wants JavaScript — and a preference control may, where a
      destination may not.

      ---

      **What shipped, and the one place the reference image could not be
      followed.**

      The image's per-row flyout **cannot be built in CSS here**, and the reason
      is worth recording because it looks like the obvious approach:

      > A flyout is a child of a rail row, so it has to paint outside the rail's
      > right edge — while the rail keeps scrolling vertically, because an
      > account can hold many courses. CSS forbids that pair. `overflow-x:
      > visible` beside `overflow-y: auto` computes **back to `auto`**; and
      > `overflow-x: clip` beside it computes to **`hidden`**, which
      > `overflow-clip-margin` cannot reopen. Both were tried and measured in a
      > browser, and both clipped the label.

      So the rail **expands as an overlay** instead: 60px in the row, painting
      216px on hover or focus. The trick is a negative margin — a flex item's
      outer size is its basis plus its margins, so `flex-basis: 216px` with
      `margin-right: -156px` still occupies 60px while painting full width.
      *Measured:* the rail paints 216px and `main` stays at 60px, so **nothing
      reflows**.

      This also suits the app better than the image's pattern. The rows that
      share a glyph are courses, so seeing every label **at once** is what lets
      a reader tell CS 33 from CS 21 — probing one icon at a time would not.

      | Piece | Where |
      |---|---|
      | cookie, read on the server | `src/lib/rail-state.ts` |
      | the chevron | `src/components/layout/rail-toggle.tsx` |
      | both shapes, and the reveal | `workspace-shell.tsx`, as `data-[rail=min]:` / `in-data-[rail=min]:` utilities |
      | `IconSignOut` | `ui/icons.tsx` — the collapsed footer has no room for the word |

      **Three more found by running the app, after it was called done.** The
      static probes had verified the CSS in isolation and every one of these
      still shipped — the lesson being that a rail has to be clicked in the real
      shell, not measured in a fixture:
      1. **The collapse looked broken because the toggle was inside the rail.**
         Clicking it left the button FOCUSED, and the rail expands on
         `:focus-within` so a keyboard reader can read its labels — so the rail
         sat at full width immediately after being told to collapse, and moving
         the pointer away did not help because focus was still inside it. The
         state flipped correctly the whole time; only the width did not. **A
         control cannot live inside the element it collapses when that element
         reacts to focus.** It now sits in the top bar, where the click leaves
         focus outside, and the rail collapses at once. This is a knowing
         departure from the reference image, which puts the chevron in the rail.
      2. **"Workspace" rendered twice** — the toggle's row carried a hardcoded
         label and the first nav group is also called Workspace. Removing the
         row fixed both this and (1).
      3. **The chevron was a grey slab.** With no explicit `background` a
         `<button>` falls back to the UA's `buttonface`; the stylesheet's reset
         neutralises font and colour on form controls but not their background.
         It now states `bg-paper`, and takes **light**-ground tokens rather than
         `--rail-*`, since it lives in the white top bar — using the rail's
         palette there would have been the D-E fencing rule broken in reverse.
      *Verified in the running app:* expanded 216px → collapsed 60px with the
      content following → hover overlays back to 216px with the content staying
      at 60px → the cookie holds across a navigation → expanding again returns
      to 216px. At 390px the rail is `display: none`, the toggle does not
      render, and the drawer opens full width **with labels shown and no
      chevron of its own**, despite the collapsed cookie being set.

      **A fourth bug got past every check and broke the app.** `rail-state.ts`
      held both `readRailCollapsed()` (which imports `next/headers`) and the
      cookie's name — and `RailToggle` is a `"use client"` component that needs
      that name. One import from a client file pulls in the whole module, so a
      server-only dependency reached the browser bundle and `next build` refused
      to compile. **`typecheck`, `lint` and all 233 tests passed.** The constants
      now live in `src/lib/rail-cookie.ts`, a module with no imports at all, and
      §7 has gained "run the build" as its first guardrail.

      **Two more caught while building, both by measurement rather than by
      looking:**
      1. **The state was on the wrong element.** `data-rail` started on the
         shell root — and the mobile drawer renders this same rail *inside* the
         shell, so collapsing on a desktop would have shrunk the drawer to 60px
         of icons: a panel the reader opened on purpose, rendered unreadable. It
         now lives on the rail `<nav>` itself, so the drawer's copy simply never
         matches, with no `:not()` to get right. The drawer also renders with no
         chevron of its own.
      2. **The toggle used a loose selector.** `querySelector("[data-rail]")`
         was a coin flip between the rail and the drawer; it targets
         `#ws-rail` by id.

      **Accessibility notes, because collapsing must stay a visual change:**
      every label is `sr-only` when collapsed, never removed, so a row still
      announces "CS 33" rather than being an unlabelled link; the chevron's
      accessible name changes with its state (`Collapse` / `Expand the
      sidebar`) rather than lying half the time; and `focus-within` opens the
      rail, so a keyboard reader tabbing into it sees the same labels a mouse
      reader does. *Verified in a browser at all four states* — expanded,
      collapsed, collapsed+hovered, collapsed+row-focused — plus the drawer's
      isolation from each.

      _Superseded original constraint text:_ the shell's chrome works **before
      hydration**

- [ ] **10.4.2a Add padding to the nested dropdown columns. [Confirmed 2026-09-11]**
      Renumbered from a second "10.4.3" — this file already had one, and two
      items with one number is how one of them gets lost.
      **[Open — which dropdown?]** "Nested dropdown columns" could be the
      sub-nav's `Section menu` popover (`.ws-subnav__menu-list`, whose rows are
      `8px 10px`), the filter menu (`.ws-filter__menu`), or the answer-choices
      list inside a question. Say which and it is a one-line change; guessing
      risks padding the wrong one. Sits next to 10.4.2 because if it is the
      sub-nav popover, the collapsed-rail work will move it anyway.

**New / edit form** — all of the following are in
`src/components/staff/template-editor.tsx` unless noted.

- [ ] **10.4.3** Remove the same "how you and your students refer to it" helper
      text here too, and remove all helper text under **"Who gets this form"**
      (`src/components/staff/delivery-fields.tsx:112`).
      _Partly done 2026-09-11 — the course-title helper is gone (10.3a), but
      `delivery-fields.tsx` still renders six `helper-text` blocks (lines 139,
      162, 182, 286, 299, 368). Confirm which of those the owner meant by "all
      helper text under **Who gets this form**"._

- [x] **10.4.3a Numbered, declarative sections on the new-form page.
      [Confirmed 2026-09-11]**
      > _"have a numbering for sections. Also instead of these WH questions, do
      > you [think] its better to be declarative instead"_
      *Done 2026-09-11.* The form now reads as four numbered steps in **one**
      register, through a `FormSection` primitive in `ui/form.tsx`:
      | Was | Now |
      |---|---|
      | "What this form is" (20px serif panel title) | **1. Form details** |
      | "Who gets this form" (11px uppercase chip) | **2. Audience** |
      | "When it goes out" (11px uppercase chip) | **3. Schedule** |
      | "What it asks" (20px serif panel title) | **4. Questions** |
      **The numbering exposed a second problem the request did not mention:**
      those four headings were in **two different registers** — two were serif
      panel titles and two were uppercase strip chips buried inside
      `DeliveryFields` — so the parts of one form did not read as one form.
      Numbering them is what forced them into a single register.
      *On the names:* **Audience** rather than "Recipients" or "Target
      audience", because *audience* is already the domain's word for exactly
      this ([AGENTS.md](AGENTS.md) §1.1: "Form audience — the explicit set of
      sections that receive a form"), so the UI and the model now say the same
      thing. **Schedule** for the same reason.
      *Two details worth keeping:*
      - `step` is a **prop, not a CSS counter.** A template-only form genuinely
        has fewer steps, and a counter would silently renumber while a wrong
        explicit number is a visible bug.
      - `firstStep` on `DeliveryFields` is **optional**, and omitting it makes
        its two groups plain labelled fieldsets again. The **edit** page nests
        it inside a panel that has its own heading, where a numbered "2.
        Audience" would number nothing.
      *The edit page is deliberately NOT numbered:* its panels are independent,
      each with its own save action, so numbering would promise a sequence that
      does not exist. Its one WH heading was still renamed — "Who gets it, and
      when" → **"Audience and schedule"** — and that was the last WH-phrased
      heading in the app.

- [x] **10.4.3b Spacing on the new-form page. [Confirmed 2026-09-11]**
      > _"the spacing are weird... fix it. make the cards spacing consistent as
      > well as the title to its content add spacing."_
      *Done 2026-09-11.* Both were real, and both had the same cause: **nothing
      owned the spacing**, so each caller supplied its own and some forgot.
      | Gap | Was | Now |
      |---|---|---|
      | card 1 → 2 | **0px** | 16px |
      | card 2 → 3 | 16px | 16px |
      | card 3 → 4 | 16px | 16px |
      | "1. Form details" → fields | 16px | 20px |
      | "2. Audience" → choices | **0px** | 20px |
      | "3. Schedule" → choices | **0px** | 20px |
      | "4. Questions" → editor | 16px | 20px |
      **Why the title gap vanished, and it is worth knowing:** it had been
      coming from `.notice--pad > .panel-title { margin-bottom: 16px }` — a
      descendant rule keyed on a class `FormSection`'s heading no longer
      carries. So introducing the component silently dropped the gap
      everywhere except the one section that happened to put `mt-4` on its own
      inner div. **A layout rule that lives in a selector matching someone
      else's class breaks the moment that class moves**, which is the same
      failure §3.2 hit with the nine `.toolbar .field`-style overrides.
      *The fix is structural, not more margins.* `FormSection` is now
      `grid gap-5` so the **section** owns the distance from its heading to its
      content, and the `<form>` is `grid gap-4` so the **form** owns the
      distance between steps. Every `mt-4` that had been standing in for either
      is deleted — from the page, from `DeliveryFields` (three of them, which
      had begun stacking on top of the new gap), and from the editor's
      reference list, whose margin is now conditional on whether anything is
      actually above it.
      *Measured, not eyeballed:* the Schedule section reads
      20 / 20 / 20 / 20 from its heading through all three field grids, with
      24px card padding either side.

- [ ] **10.4.4 Required/optional → red asterisk.** Replace the
      `optional`/`Required` word-tags with a red asterisk on required fields and
      **nothing** on optional ones. Current call sites:
      `forms/[formId]/page.tsx:592,640`, `instances/[instanceId]/page.tsx:224,240,258`,
      `forms/new/page.tsx:279,295`, `responses/page.tsx:1252,1805,1851,1896`,
      `student/weekly-form.tsx:334,491,621`, `public-answer-composer.tsx:83`,
      `roster-import-dialog.tsx:43`.
      _Two things not to lose:_ the asterisk needs an accessible name (a
      `visually-hidden` "required", plus `required` on the input) — a red glyph
      alone is colour-only meaning, which this design system forbids. And the
      **student-facing** weekly form is a different audience from the staff
      editor; confirm the asterisk convention is wanted there too before changing
      `weekly-form.tsx`.
      _Started 2026-09-11 — `ui/required-mark.tsx` exists and is used across 8
      files. Still to confirm before ticking: the asterisk carries a
      `visually-hidden` "required" (colour-only meaning is forbidden), and the
      **student** weekly form was a separate question the item said to ask
      before changing._

- [ ] **10.4.5 One date-time control per boundary, stacked.** Combine the
      separate calendar and time inputs so the form reads **"Opens"** and
      **"Closes"** with no "at", and put **Closes directly below Opens** instead
      of beside it. Scheduling is the most error-prone part of this editor and
      two fields per boundary is where the errors come from.
- [x] **10.4.6 Distinguish one question from the next. [Confirmed intent,
      method Open]** > _"Add a backdrop/shadows sa likod para mas distinguishable yung another > question, or darker konti."_
      The **problem is real** — the question list currently reads as one
      undifferentiated column. The **literal fix conflicts** with the theme:
      [DESIGN.md](DESIGN.md) §5 and `globals.css` both state that borders carry
      the structure and **nothing has a resting shadow** (the one elevation,
      `--shadow-overlay`, is for the drawer and the filter menu only). Adding
      resting shadows here would make questions read as floating cards, which is
      the specific thing the noticeboard theme rejects.
      _Theme-compatible ways to get the same separation, in order of strength:_ 1. Ground each question block in `--color-paper-quiet` on the white sheet. 2. Divide with `--color-rule-strong` instead of `--color-rule`. 3. Add a numbered gutter — **Q1 / Q2 / Q3** in the strip register — which
      separates _and_ gives the teacher a reference to talk about. 4. Inset the whole list on `--color-board-deep` so each question is a sheet
      squared onto the board.
      _Recommendation:_ 3 + 1 together. If the owner still wants literal shadows
      after seeing that, it is a DESIGN.md §5 amendment and should be recorded as
      one, not slipped in.
      _Done 2026-09-11 — the recommendation, built as recommended: **3 + 1**._
      Each question block is grounded in `--paper-quiet` on the white sheet
      (`template-editor.tsx:88`) and carries a **Q1 / Q2 / Q3** chip in the
      strip register (`:488`). No resting shadow was added, so
      [DESIGN.md](DESIGN.md) §5 stands unamended and the separation is carried
      by ground and gutter instead. If literal shadows are still wanted after
      seeing this, that is a §5 amendment and gets recorded as one.
- [x] **10.4.7 "Add question" belongs at the bottom.** The button is at
      `template-editor.tsx:356`, above the list, so adding a question means
      scrolling up and then back down — the more questions, the worse it gets.
      Move it below the last question. Keep exactly one; do not add a second at
      the top.
      _Done 2026-09-11 — **Add question** now sits at
      `template-editor.tsx:613`, below the last question, and there is still
      exactly one._

- [x] **10.4.8 Formatting help under "What it asks".** The `<Disclose label="Formatting">`
      at `template-editor.tsx:583` should sit under the "What it asks" field,
      where the person writing prompt text is actually looking.
      _Done 2026-09-11 — the `Formatting` disclosure moved to
      `template-editor.tsx:356`, under the prompt field, with a comment
      recording where it used to sit._

- [x] **10.4.8.1 Formatting and Versions as lines with an (i). [Confirmed
      2026-09-11]**
      > _"Make them as a new line each and have a tooltip beside that explains
      > the things needed to be explained. Hovering the (i) logo beside the texts
      > will show a floating thing… instead of the current implementation where
      > it is dropdown."_
      *Done 2026-09-11.* Two `Disclose` dropdowns became two lines of plain
      text, each ending in an `(i)` that reveals the detail —
      `src/components/ui/info-tip.tsx`, and `.editor-refs` is deleted.
      **This overturns §11.5's `Tooltip: no`, and the objection is answered
      rather than ignored.** That verdict was mine and [Recommended]; the owner
      request outranks it (§10 preamble). But the reason for the "no" was real —
      *hover-only text is invisible on touch and unreliable for keyboards* — so
      `InfoTip` is **not** hover-only:
      - it is a `<button>` inside a `<details>`, so it opens on **click and on
        Enter/Space** — the touch and keyboard path — and hover is an addition
        on top, not the only way in;
      - it needs no JavaScript, which matters in a server-rendered app
        (§11.6d);
      - the text is in the DOM either way, so a screen reader reaches it in
        reading order without activating anything.
      **Revised the same day, on the owner's follow-up:**
      > _"make the tooltip on the questions hoverable instead that will pop up…
      > why the floating card there is not rounded… the spacing as well why it
      > is padded to the right much… since its hoverable one pop up will open at
      > a time."_
      Three fixes, all warranted:
      - **Rounded.** The panel had no radius at all — the one square box on a
        screen of 12px corners. It takes `rounded-panel` like every other
        floating surface.
      - **Width.** It was `w-[min(34ch,80vw)]`, a *fixed* 34ch, so a one-line
        explanation sat in a box padded out to the full measure. Now
        `w-max max-w-[min(34ch,…)]` — it shrinks to its content and only caps at
        34ch. The Formatting panel went from ~460px to 277px.
      - **One at a time.** `<details name="info-tip">` makes the group
        **exclusive** — opening one closes the others. That is the browser's own
        accordion behaviour, so it costs no JavaScript, and it means a click can
        never leave two panels stuck open. Verified: clicking the second tip
        closed the first.
      Hover is now the primary gesture, as asked. **The accessibility objection
      is still answered**, which is why this is not simply a hover tooltip:
      the panel also opens on `:focus-within` (so tabbing to the icon shows it)
      and the icon is still a real `<summary>`, so click and Enter work — which
      is the only path a touch user has, hover not existing there.
      *Verified in a browser:* closed → hidden; hover → shown; pointer away →
      hidden; click → shown and stays open; a second tip's click closes the
      first.
      *The rule written into the component:* only reference a person looks up
      goes in here. Anything needed to fill the field in — a requirement, a
      consequence — stays visible under the label ([DESIGN.md](DESIGN.md) §6).
      §11.5's row is updated rather than left contradicting the code.

- [x] **10.4.9 Version note, same treatment as formatting.** `versionNote`
      ("Later edits create a new version. Forms already sent keep the questions
      their students answered.") is rendered as a full `Alert variant="info"` at
      `template-editor.tsx:678-680`, set from `forms/new/page.tsx:346`. It is
      reference information, not an alert — give it the same collapsed
      `Disclose` treatment as 10.4.8 so the two read as one kind of thing.
      _Done 2026-09-11 — `versionNote` renders as `<Disclose
label="Versions">` (`template-editor.tsx:364`), so it reads as the same
      kind of thing as Formatting._

- [x] **10.4.10 Preview at the bottom only.** There are two preview triggers,
      `template-editor.tsx:345` (top) and `:689` (bottom). Drop the top one.
      _Done 2026-09-11 — one preview trigger left, at
      `template-editor.tsx:715`._

- [x] **10.4.11 Actions in one place.** "Cancel and go back to {course.code}"
      (`forms/new/page.tsx:360`) sits away from the submit. Put it beside **Save
      form** and label it **Cancel** — the destination belongs in the link, not
      in the label. Per [DESIGN.md](DESIGN.md) §7a there is still one primary
      action per view: Save is primary, Cancel is `quiet`.
      _Done 2026-09-11 — `cancelHref` renders beside **Save form** as a
      `quiet` button (`template-editor.tsx:707`). One deviation from the item:
      the label is **Cancel form**, not **Cancel**. Fine if deliberate;
      otherwise it is a one-word edit._

### 10.5 Responses

- [x] **10.5.1 Scope responses per form. [Confirmed]** > _"Per form dapat? Kasi isang form lang nakikita ko dito — what if there > are different forms?"_
      `teach/courses/[id]/responses/page.tsx` filters by `sp.cycle` → `instanceId`
      (line 195) with no form dimension, so a course running more than one form
      has no way to say which one it is looking at. Add form selection as the
      outer axis (form → occurrence → response), not another filter chip. This is
      a **correctness gap**, not a cosmetic one — it is the only item in §10 that
      makes the page wrong rather than awkward, and it should go first.
      _Done 2026-09-11 — the responses page now carries a `form` dimension
      (`responses/page.tsx:263`) ahead of the occurrence filter, so a
      multi-form course is readable. This was the only correctness bug in
      §10._

- [ ] **10.5.2 Per-question response view.** Add a Google-Forms-style view: pick
      one question, read every student's answer to it. Today the only path is
      per-student, which is the wrong shape for "what did the class think of Q3".
      _Constraint:_ it must reuse the per-student response layout — same question
      typography, same rating treatment (10.5.4), same identity handling. It is a
      different **axis** through the same records, not a second design. And it is
      identity-bearing and staff-only, so it goes behind the same
      resource-scoped `require*` helper and is paginated like every other list
      ([AGENTS.md](AGENTS.md) §13).

### 10.6 Responses — per student

- [ ] **10.6.1 Question outranks answer typographically.** Right now the prompt
      and the answer read at the same weight. The question should be **bolder and
      larger** than the response. The ramp already has the step for it —
      `--text-question-prompt` (18px, Charter, bold) exists in `@theme` for
      exactly this — so this is applying the ramp, not extending it. Ties into
      §3.5 and §4.
- [ ] **10.6.2 Redesign ratings and scales. [Confirmed intent, design Open]**
      Scale answers currently render as a number or a bare row and carry almost
      no meaning at a glance.
      _Recommendation:_ show the chosen point on its scale, not the digit alone —
      the range visible, the selection stamped, the anchor labels present, and
      readable in grayscale. `BarChart` (`ui/index.tsx:508`) already establishes
      how this app draws quantities; extend that vocabulary rather than inventing
      a second one. Sketch it before building.
- [ ] **10.6.3 Week as a tag.** _"Flare yung weeks — like 'Week 8 response ni
      student', flare yung week."_ Same `Tag` component as 10.2, so the week
      reads as a label rather than as part of a sentence. Blocked on 10.2.

### 10.7 Ordering for this section

1. ~~**10.5.1**~~ — **done 2026-09-11**; the responses page carries a form
   dimension.
2. **10.1a** — one-line font fix that may resolve the whole typography complaint;
   answer **10.1b** before any screen migration starts.
3. **10.2** — `Tag` component, since 10.6.3 and much of the visual quietening
   depend on it.
4. ~~**10.4.7, 10.4.10, 10.4.11, 10.4.1**~~ — **done 2026-09-11**. **10.4.3**
   is the one left in this group: `delivery-fields.tsx` still has six
   `helper-text` blocks and it needs the owner to say which.
5. **10.4.4, 10.4.5, 10.4.8, 10.4.9, 10.6.1** — the editor and response passes
   that need a little care.
6. **10.3b, 10.4.6, 10.6.2, 10.1b** — the four that need an owner answer first.
7. **10.4.2, 10.5.2** — the two largest builds.

---

## 11. Components the system is still missing — 2026-09-10 **[Confirmed request]**

Raised directly by the owner:

> _"Can u add more components for the app like: toggle switch, modals, flairs
> (tags), breadcrumbs as well route, and etc."_

**What is [Confirmed] here is the request** — the component layer is thin and
should grow. Each individual design below is **[Recommended]** until the owner
says otherwise, and two of them (11.1, 11.4b) surface a genuine conflict with
[DESIGN.md](DESIGN.md) that needs an answer rather than a guess.

**Three constraints govern everything in this section**, and none of them is
negotiable by an item in it:

1. **No new dependencies** (§8). Every component below is native HTML plus
   Tailwind utilities — `<dialog>`, `<details>`, `<input type="checkbox">`,
   a radio group. No headless-UI library, no Radix, no animation library.
2. **New components are written in the Tailwind vocabulary, never in
   `legacy.css`.** A new component added as a hand-written class is a new
   entry on §4's demolition list — and that file **grew by 330 lines** between
   the two §0 measurements, so this is now the binding constraint rather than
   a precaution. **§3.4 landed on 2026-09-11**: `ui/index.tsx` is a barrel over
   `status` · `feedback` · `surface` · `data`, so a new component has a folder
   to go in.
3. **A component that is not in [DESIGN.md](DESIGN.md) will drift.** Each item
   below ships with its rule written into the right DESIGN.md section and its
   name added to the §13 inventory. That inventory is already stale — it lists
   ten components for a directory holding 23 — so this section fixes that too
   (11.6).

### 11.0 Inventory — what exists before anything is added

Measured on the working tree, 2026-09-10. **Half of what was asked for already
exists**; the gap is coverage and consolidation, not absence.

| Pattern                                                  | Today                                                                                  | Gap                                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Modal**                                                | `ui/dialog.tsx` — native `<dialog>`, portalled, focus returns to trigger. 7 call sites | Still on legacy classes; no confirm variant; trigger-only opening → **11.2**       |
| **Breadcrumbs**                                          | `ui/index.tsx:329`, 5 of 26 routes, each page hand-writing its own array               | No route trail, no coverage rule, three competing "way back" mechanisms → **11.4** |
| **Flair / tag**                                          | `ui/tag.tsx` — 3 `TagList` sites + 1 in `surface.tsx` (2026-09-11)                     | Built; `MetaList` still has 13 importers, so the two coexist → **§10.2**, **11.3** |
| **Toggle switch**                                        | none — 9 raw `type="checkbox"` across 7 files                                          | Wanted, but conflicts with two DESIGN.md rules → **11.1**                          |
| Button                                                   | `ui/button.tsx`                                                                        | Rollout only (§3.1)                                                                |
| Fields, choices, questions                               | `ui/form.tsx`                                                                          | Rollout only (§3.2)                                                                |
| Stamps and badges                                        | `Stamp` + 4 wrappers                                                                   | Consolidation only (§3.3)                                                          |
| Tabs                                                     | `layout/sub-nav.tsx` (`mode="tabs"`)                                                   | **Do not add a second tabs component**                                             |
| Accordion / disclosure                                   | `Disclose`                                                                             | **Do not add a second**                                                            |
| Popover / menu                                           | `ui/filter-menu.tsx`                                                                   | Extend for row actions if ever needed                                              |
| Pagination, Alert, EmptyState, BarChart, Quote, MetaList | split across `status`/`feedback`/`surface`/`data`, barrel re-exports                   | Coverage largely done: `Alert` 46 sites, `EmptyState` 20 (§5.5, §5.6)              |
| Table                                                    | 7 raw `<table>` on `.data-table`                                                       | No primitive, no responsive rule → **11.5**                                        |
| Submit / pending                                         | `ui/submit-button.tsx` (2026-09-11)                                                    | Built; **6 of 53 forms** → §5.1, listed in **11.5**                                |
| Skeleton                                                 | `app/loading.tsx` at the root only                                                     | No per-route boundary yet → §5.2, listed in **11.5**                               |
| Live region                                              | none (0 `aria-live`)                                                                   | → §5.4, listed in **11.5**                                                         |

### 11.1 Toggle switch **[Confirmed request, design Open]**

**Where it would go.** Nine boolean controls, all currently native checkboxes:
`staff-permissions.tsx:84` (the TA permission catalog — the densest cluster and
the strongest case), `add-staff-dialog.tsx:315,361`,
`publications/page.tsx:290,325`, `delivery-fields.tsx:146`,
`template-editor.tsx:531`, `public-answer-composer.tsx:105`,
`courses/[id]/forms/[formId]/page.tsx:624`. Plus `admin/page.tsx:129`, which
grants the teacher role through a form and a button — the one place that reads
most like a switch and is deliberately not one.

**The conflict, stated plainly.** A conventional switch is a **pill with a
sliding knob**. [DESIGN.md](DESIGN.md) §11.1 forbids rounded containers above
3px and forbids pills outright; §11.24 allows no animation beyond a 120ms
background/border transition. A stock iOS-style switch breaks both. This is not
a technicality — hard corners are the noticeboard metaphor, and a sliding knob
is the single most "app-like" motion the theme rejects.

**The second problem is semantic, not visual.** A switch promises _immediate
effect_. This app is server-rendered per navigation with zero pending states
today (§5.1), so a switch would flip, sit, and be flippable again while the
round trip is in flight. `AutoSubmitSelect` (`ui/auto-submit.tsx`) is the
existing answer to instant-apply — it submits the enclosing form on change and
keeps a `<noscript>` submit — and any switch that applies on change must follow
that pattern, including the no-JS path.

- [ ] **11.1 — pick one of three. [Open — owner]** - **A. Keep the checkbox, styled as `Choice`.** `ui/form.tsx` already
      renders a full-width 38px bordered row that fills `--accent-wash` when
      checked, through `:has(input:checked)` and no JavaScript. Zero new code,
      zero rule breaks. Right for **lists of flags** saved together — which is
      what `staff-permissions.tsx` actually is. - **B. A two-cell segmented control. [Recommended]** `On` / `Off` as a
      radio group in one bordered box, hard corners, the selected cell filled
      `--accent-wash` with the accent border. Theme-compatible, keyboard-native
      via arrow keys, works pre-hydration, and it also gives the app the "mode
      switch" DESIGN.md §7a already refers to but never defines. Right for a
      **single setting with two named states**. - **C. A real switch, squared.** 2px corners, no knob animation — the knob
      moves by colour and position on a 120ms transition, no easing curve, no
      pill. Requires **amending DESIGN.md §11.1** to carve out the switch by
      name. Only worth it if the owner wants that specific affordance;
      otherwise it is a rule break in exchange for familiarity.
- [ ] **11.1a Whatever wins, it says its state in words.** DESIGN.md §11.16 —
      no status by colour alone. A switch shows `On` / `Off` (or the real verb:
      `Publishing` / `Not publishing`), not colour and knob position only.
- [ ] **11.1b Semantics.** Keep a native `<input type="checkbox">` as the
      control so it posts with its form; add `role="switch"` only on option C,
      where the visual is no longer a checkbox. Never a `<div>` with an
      `onClick`.
- [x] **11.1c — Unblocked 2026-09-11.** D-A closed at **6 / 5 / 12**, so a
      control is a 6px-cornered box. That settles the shape question for all
      three options and, notably, **weakens option C**: the argument for a
      squared switch was that hard corners are load-bearing, and controls are
      now the one family that is deliberately _not_ hard-cornered. A/B remain
      theme-compatible as written; C would still need a DESIGN.md §11.1
      carve-out, now for the knob and its motion rather than for the corners.

### 11.2 Modals — one dialog, doing three jobs badly

`ui/dialog.tsx` is the strongest component in the repo — a native `<dialog>`
with `showModal()`, portalled to `document.body` so a dialog form is never
nested inside the page's form, focus returned to the trigger on close. Nothing
below redesigns it.

- [x] **11.2a — Done 2026-09-11, with §3.1 as the item asked.**
      Half of it was already fixed: `dialog.tsx` calls `buttonClass()` for both
      its buttons, so the template strings the item describes were gone before
      this pass. The other half was real — all eighteen `.dlg*` rules are now
      utilities in the component, and `legacy.css` has **79 fewer lines**.
      It was worth doing first for the reason §11.7 gave: this was the one
      component whose markup would simply have broken when that file is deleted.
      *Verified by rendering the legacy dialog and the utility dialog side by
      side at 1440 and 500px and diffing computed styles.* Four differences,
      all of them intended: `display: grid` (11.2d), the body's `max-height`
      gone (11.2d), and the description and footer taking `--text-ui-sm`'s own
      1.45 leading instead of inheriting the body's 1.5.
      *One inexactness the diff caught and I fixed:* I had written
      `max-sm:max-w-none` where the legacy rule was `max-width: 100vw`. Same
      result next to `w-screen`, but not the same rule, so it is now
      `max-sm:max-w-screen`.
      *One new token:* `--color-scrim`. The backdrop was a bare
      `rgba(28, 30, 32, 0.42)`, which was tolerable in a stylesheet and is not
      in a `.tsx` file (§2.3). Dark mode will want a different one — a 42% black
      veil over a charcoal ground reads as mud — which is the second reason it
      needed a name.
- [ ] **11.2b `ConfirmDialog` — the missing variant.** §5.9 needs a confirmation
      that **names the object** ("Remove 41 students from CS 33 – Section B"),
      not "Are you sure?". One component: title, the named consequence, a
      `danger` confirm and a `quiet` cancel, and the sentence that says what the
      student will and will not see (DESIGN.md §12 already requires that of the
      validity controls). Reserve a typed-name confirmation for the irreversible
      bulk cases only — roster removal, unpublish — or it becomes friction
      people learn to type through.
- [ ] **11.2c Let something other than a button open it.** Opening is only
      possible through the trigger `<button>` the component renders itself, so a
      table row, an icon control, or a server redirect (`?confirm=…`) cannot open
      one. Add an optional controlled mode (`open` / `onOpenChange`) and a
      `trigger` render prop, keeping today's uncontrolled default so no call
      site changes.
- [x] **11.2d — Done 2026-09-11, with 11.2a rather than after it.**
      Exactly as the item specified: the dialog is
      `grid grid-rows-[auto_1fr_auto]`, the body is the only scrolling row, and
      `calc(min(88vh, 860px) - 150px)` is gone. Doing it in the same pass was
      the cheap option — 11.2a was already rewriting every one of those rules,
      and leaving the magic number in place would have meant transcribing it
      into a utility first and deleting it second.
      Worth recording what the 150px cost: a two-line title overflowed the body,
      **and** a dialog with no footer reserved 150px for a footer that was not
      there. `1fr` measures both for free.
- [ ] **11.2e Audit the seven sites against §11.23.** DESIGN.md forbids a modal
      for a task needing neither interruption nor protected focus. `add-staff`,
      `roster-import` and `staff-permissions` earn it (multi-field forms with
      consequences); check the four in `teach/courses/**` and demote any that is
      really a detail view to a `Disclose` or a route.
- [ ] **11.2f Two hard rules for the component.** No dialog opens another
      dialog, and a dialog never holds the page's only primary action — a person
      who dismisses it must still be able to finish the task (§7a, §11.25).

### 11.3 Flairs (tags) — already owned by §10.2

The owner has now asked for this twice, which is the clearest possible signal of
priority. **The item lives at §10.2 and is not duplicated here** — build `Tag`
and `TagList` there, convert `MetaList` (`ui/index.tsx:246`, ~15 call sites) and
unblock 10.6.3 (week as a tag). Two additions this second mention earns:

- [x] **11.3a A tag is never interactive. [Recommended]** No removable "×", no
      clickable filter chip. Filters belong to the list they narrow, in
      `FilterBar` / `FilterMenu` (DESIGN.md §11.32), and a tag that is sometimes
      a button and sometimes a label teaches the reader to click labels.
      _Done — verified 2026-09-11._ `Tag` is a `<span>`; `ui/tag.tsx` contains
      no `onClick`, no `href` and no `<button>`, so there is nothing to click.
- [x] **11.3b Keep it subordinate to `Stamp`.** Restating §10.2's constraint
      because it is the one that will be lost in review: `--color-paper-quiet`
      fill, `--color-rule` border, no tone, no shape, no accent. If a tag ever
      borrows a stamp's colour, status stops reading as status.
      _Done — verified 2026-09-11._ `ui/tag.tsx` renders
      `border-rule rounded-stamp bg-paper-quiet text-ink-soft` — no tone, no
      shape, no accent — and the file carries the reason in its own header so a
      reviewer cannot lose it.

### 11.4 Breadcrumbs, and the route trail behind them

`Breadcrumbs` exists (`ui/index.tsx:329`) and is used on **5 of 26 routes** —
`admin`, `sections/[id]/backlog`, `courses/[id]/forms/new`,
`courses/[id]/forms/[formId]` (twice) and the instance page. Every one of those
assembles its own `items` array by hand, so the label for the same course
appears in five places and can disagree in five ways. The deepest route in the
app, `/teach/courses/[id]/forms/[formId]/instances/[instanceId]`, is five levels
down.

- [ ] **11.4a Derive the trail from the route, in one place. [Recommended]**
      _Half done 2026-09-11, and the half that is left is the half this item is
      about._ `AppShell` renders the trail and **derives the last crumb** from
      the active tab (12f.2), so no page can forget or misword its own position.
      But the **ancestors are still hand-assembled**: 13 pages pass a `crumbs`
      array and four still render `Breadcrumbs` directly, so "CS 33" is written
      in thirteen places and can disagree in thirteen ways — exactly the defect
      this item opened with, reduced rather than removed. The remaining work is
      a builder beside `nav.ts`'s, taking the same ids the nav builders take.
      One `trailFor(pathname, resources)` beside `layout/nav.ts`, which already
      owns every route's label and icon and is the only file that knows the URL
      shape. Two rules for it: it stays **presentation-only** (nav.ts says so
      itself — hiding a link is not authorization), and a resource's display
      name comes from data the page **already loaded**. A breadcrumb must never
      cost a second query, and it must never name a resource the viewer cannot
      open.
- [x] **11.4b — ANSWERED 2026-09-11: breadcrumbs everywhere, the other two
      go.** Recorded as **N-4**. One mechanism, on every route including
      top-level ones.
      **This overrides 11.4d** below, which said a top-level route gets none and
      that a one-crumb trail is chrome. 11.4d is superseded.
      **One thing the decision cannot do by itself, and I did not silently
      widen it to cover:** in the two-pane layout the list and a selected row
      **share a route**, so a trail has no crumb that leads back to the list.
      Dropping `selection.backHref` outright would leave a phone reader in a
      detail view with no way back but the browser button. The return is
      therefore folded into the **trail itself** as its final crumb while a
      selection is active — one mechanism, as decided, and no dead end.
      *Still to build:* 11.4a's `trailFor`, then the retirement of
      `.pane-head__back` and `selection.backHref`. It is a prerequisite of
      10.4.2 per 11.4c, not a follow-up.
      *The original finding, for the record:* The app
      currently answers "where am I / how do I get back" three ways: this
      `Breadcrumbs`, `.pane-head__back` (`legacy.css:4423`, the list pane's own
      back link), and `WorkspaceShell`'s `selection={{ active, backHref }}`.
      _Recommendation:_ the trail lives in the **page header** on staff routes
      three or more levels deep; the pane back-link survives **only** as the
      mobile list→detail affordance; no route renders both. Confirm before
      building, because this decides whether 11.4a replaces a mechanism or adds
      a fourth.
- [x] **11.4c Land it with 10.4.2, not after.** When the workspace rail
      collapses inside a course (10.4.2, **[Confirmed]**), the trail stops being
      a convenience and becomes the primary answer to "where am I". Sequencing
      them together is the difference between a nav improvement and a nav
      regression.
      _Done 2026-09-11 — it landed with 10.4.2 exactly as this item required._
      The trail shipped in the same pass as the collapse (12d.5) and was then
      made structural in 12f.2: `AppShell` derives the last crumb from the
      active tab, so no page can forget it and no two pages can word it
      differently.
- [x] **11.4d — SUPERSEDED 2026-09-11 by the 11.4b decision (N-4).**
      It proposed: trail on staff routes ≥3 levels deep, none on a top-level
      route, because "a one-crumb trail is chrome". The owner chose **breadcrumbs
      everywhere** instead, to have exactly one mechanism rather than one with a
      depth rule. The cost is accepted knowingly and is the one this item named:
      a top-level route now carries a one-crumb trail.
      What survives from it is the half that still holds — **a trail that appears
      on some routes and not others is worse than none.** "Everywhere" satisfies
      that more simply than a depth threshold did.
- [ ] **11.4e Phone behaviour.** Five crumbs do not fit 375px. Collapse the
      middle with CSS only — keep the first and last two, hide the rest at
      `max-sm` — rather than truncating each label, which produces five
      ellipses and no information. The `/` separator is already
      `aria-hidden`; keep it that way when it moves to a pseudo-element.

### 11.5 The "etc." — every other candidate, with a verdict

Listed so the answer exists in writing and the next agent does not re-litigate
it. **Build** means it is missing and wanted; **exists** means adding a second
one is the defect; **no** means it was considered and rejected here.

| Candidate                         | Verdict                           | Note                                                                                                                                                         |
| --------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SubmitButton` (pending)          | **built 2026-09-11, rolling out** | §5.1. 6 of 53 forms; the weekly-form submit and the publish path are still unwired                                                                           |
| Route skeletons                   | **started 2026-09-11**            | §5.2. Root `loading.tsx` only; the slow staff routes still have none. Structural placeholders, never a shimmer or spinner (DESIGN.md §9)                     |
| `Announcer` (`aria-live`)         | **build**                         | §5.4. One polite region in the shell, fed by action results                                                                                                  |
| `Table` / `Th` / `Td`             | **build**                         | §5.7. 7 raw tables, no responsive rule. Sticky first column for the participation matrix                                                                     |
| `FormErrorSummary`                | **build**                         | §5.8. Linked, focused on load                                                                                                                                |
| Segmented control                 | **build if 11.1B**                | Also fills the "mode switch" DESIGN.md §7a names but never defines                                                                                           |
| Progress meter                    | **hold**                          | Student-facing participation is approved **schema-only** ([AGENTS.md](AGENTS.md) §11) — there is no surface for it yet. Do not build ahead of the feature    |
| Tooltip | ~~no~~ → **built 2026-09-11** | Overturned by the owner (§10.4.8.1). The objection stands and shaped it: `InfoTip` opens on **click/Enter as well as hover**, works before hydration, and keeps its text in the DOM — so it is not the hover-only tooltip this row refused. Reference only; anything needed to fill a field in stays visible under the label |
| Toast / snackbar                  | **no**                            | A message that disappears is a message a screen-reader user misses, and there is no client router to survive. Use `Alert` in place plus the §5.4 live region |
| Avatar / identity chip            | **never**                         | Students are anonymous to each other (DESIGN.md §11.14). `initials()` in `lib/datetime.ts` is not an invitation                                              |
| Spinner                           | ~~forbidden~~ → **built 2026-09-11** | Overturned by the owner, and DESIGN.md §9 is **amended** rather than contradicted. The objection was real and survives as the rule: a **skeleton** for content whose shape is known, a **spinner** only for a wait with no shape to predict; never where a skeleton fits, never alone, static under reduced motion. `ui/spinner.tsx`                                                                                                                                                 |
| Card grid                         | **forbidden**                     | DESIGN.md §11.1                                                                                                                                              |
| Second tabs / accordion / popover | **exists**                        | `SubNav`, `Disclose`, `FilterMenu`                                                                                                                           |

### 11.6 The contract every new component signs

Applies to 11.1–11.5 and to anything added after them.

- [x] **11.6a** Lives in `src/components/ui/`, in the concern-folder §3.4
      creates (`status/`, `feedback/`, `layout/`, `data/`), re-exported from the
      barrel.
      _Satisfied 2026-09-11._ Every component added since — `tag`, `form`,
      `status`, `feedback`, `surface`, `data`, `submit-button`, `required-mark`,
      `info-tip`, `nav-count`, `button` — lives under `src/components/ui/`
      (`nav-count` under `layout/`, with the rest of the shell) and the barrel
      re-exports the four concern modules.
- [x] **11.6b** Tailwind utilities and `cn()` only. No new selector in
      `legacy.css` — that file only shrinks.
      _Satisfied 2026-09-11._ Every new component is utilities plus `cn()`, and
      `legacy.css` went **4,771 → 4,753 lines and 705 → 570 rule blocks** across
      these batches — the file shrank while the component layer grew, which is
      the only proof this rule was actually kept.
- [x] **11.6c** Tokens only. No hex, no off-scale spacing, no font-size outside
      the ramp (§2.3, §7).
      _Satisfied 2026-09-11._ Zero colour literals in any `.tsx` (the three `#`
      matches are hexes quoted inside comments), zero `style={{ }}`, and
      `tests/unit/theme-tokens.test.ts` fails the build on a literal in `:root`
      or a `var()` pointing at a token nobody declares.
- [x] **11.6d** Keyboard-operable, focus-visible ring intact, and — if it is
      part of a form — **working before hydration**. Server-rendered app: a
      component that only works after JavaScript loads is a component that
      sometimes does not work.
      _Satisfied 2026-09-11._ The three components that could have needed
      JavaScript do not: `InfoTip` is `<details>`/`<summary>` (click, Enter and
      hover, exclusive by `name`), `Disclose` and the drawer are `<details>`,
      and the rail's collapse is a cookie **read on the server** so the first
      paint is already the right shape. `SubmitButton` is the one client
      component, and the form submits without it.
- [x] **11.6e** Never state by colour alone (§11.16); never a `<div onClick>`
      where an element already means it.
      _Satisfied 2026-09-11._ `Stamp` is word + shape + tone, the rail's active
      row carries four channels plus `aria-current`, the active tab carries
      maroon **and** an underline, `NavCount` takes a `describes` name, and
      `RequiredMark` pairs its asterisk with a `visually-hidden` "required".
      No `<div onClick>` was added anywhere.
- [x] **11.6f — Done 2026-09-11.** §13 is rewritten. It had said *"one
      stylesheet, one system. No CSS-in-JS, no Tailwind, no UI framework"* and
      listed ten components, for a repo mid-Tailwind-migration with **nineteen**
      files under `ui/` — wrong in every particular. It now carries the token
      layer, a table of one-recipe-per-pattern components, the shell, and two
      rules about adding to it.
      *It was done now rather than at §11.7 step 8 because the contract this
      item states requires it:* `FormSection` and `InfoTip` were added on
      2026-09-11, and "its name into the §13 inventory, in the same commit" is
      not satisfiable later.
      *One rule was inverted while rewriting.* The old text permitted inline
      `style` "for one-off geometry only" — and that permission is what produced
      the 59 attributes §2.2 removed. A one-off is now an arbitrary utility
      (`max-w-[220px]`), which at least resolves through the token system.
- [ ] **11.6g** When it replaces a raw element, add the grep to §7 so the raw
      element cannot come back.

### 11.7 Ordering for this section

1. ~~**§3.4** — split the barrel.~~ **Done 2026-09-11.** New components now go
   into `status/` · `feedback/` · `surface/` · `data/`.
2. ~~**11.2a**~~ — **done 2026-09-11**, alongside §3.1, and 11.2d came with it.
3. **§10.2 / 11.3** — `Tag`. **Component built 2026-09-11**; what is left is
   the `MetaList` decision (convert it, or keep both deliberately) and 10.6.3.
4. **11.5 builds** — `SubmitButton` and root-level skeletons exist as of
   2026-09-11; what remains is **rollout** (6 of 53 forms, 0 of 26 routes) and
   `Announcer`, which is still the only one of the three not started.
5. **11.2b, 11.2c, 11.2d** — `ConfirmDialog` and the two dialog mechanics, which
   §5.9 depends on.
6. **11.4b answer → 11.4a with 10.4.2** — the trail, once it is clear whether it
   replaces the pane back-link or joins it.
7. **11.1** — the toggle, last of the new work: it needs the D-A radius answer
   and an owner choice between A, B and C, and option A means there is nothing
   to build at all.
8. ~~**11.6f**~~ — **done 2026-09-11**, earlier than this order suggested,
   because 11.6f's own contract ("its name into the §13 inventory in the same
   commit") applies the moment a component is added, and two were.

---

## 12. Sidebar and navigation components — 2026-09-11 **[Confirmed]**

Owner request: bring the sidebar up to the same standard as the rest of the
system — spacing, type, and the full set of button states including hover and
active. Audited against `legacy.css:1725–4165` on 2026-09-11.

**Scope boundary with §11.** §11 designs components the system does not have
yet; this section fixes the ones that already ship in the navigation. Where they
touch — the count badges — §11.3 owns the design and 12.6 owns the reconciliation.

**Context that changed under this section.** The rail is now the app's **one dark
region** (`legacy.css:1866`, DESIGN.md §12.4 exception, owner 2026-09-10) with
its own `--rail-*` palette. That palette is correctly derived — each `--rail-*`
in `:root` references a `--color-rail-*` in `@theme`, which is exactly the
discipline §2.1 asks for. Nothing below reopens it; the work is that the
_components sitting on it_ were never finished to the same standard.

### 12.1 The finding that matters most: there are no pressed states

- [x] **12.1 — Add `:active` to every interactive control. [Confirmed]**
      _Done 2026-09-11._ `:active` now exists at sixteen sites: the four
      `.button--*` variants and their Tailwind twins in `ui/button.tsx`, the
      rail row (both the plain and the selected state), the strip tab, the
      column row, the sub-nav menu summary and its rows, the drawer summary and
      the sign-out link. Two new tokens carry the pressed step,
      `--color-accent-press` (#013319, white text 14.1:1) and
      `--color-red-press` (#efe0e1, ink 13.1:1); everything on a light ground
      presses to the existing `--color-board-deep` and the rail presses to
      `--color-rail-deep`, so only those two had to be added.
      Every site overrides `transition-duration` to `0s` rather than the whole
      shorthand, so entering the press is instant and the release still eases —
      the detail the item asked for. Verified by reading computed styles off a
      rendered page rather than by eye.
      _Original finding, kept:_ there were **zero `:active` rules in the entire
      4,800-line stylesheet.**
      Every control in the app — rail rows, subnav tabs, drawer and menu
      summaries, and the four `Button` variants — goes from rest to hover and
      then nothing. Pressing gives no acknowledgement at all, which on a slow
      server action reads as "the click didn't land" and is a direct cause of
      double-clicks.
      _This is not a sidebar problem._ Fix it as one pass across the control
      vocabulary, then the sidebar inherits it:
      | State | Rail (dark ground) | Light ground (subnav, buttons) |
      |---|---|---|
      | rest | `--rail-ink` on `--rail` | as today |
      | hover | `--rail-raised` fill | as today |
      | **active** | one step darker than hover, no transition on the way IN | fill one step down; `--accent-deep` for primary |
      | focus-visible | `--rail-focus` ring (already correct, `:2024`) | global ring |
      | disabled | — | already handled in `button.tsx` |
      _Detail worth getting right:_ transition INTO `:active` should be `0ms`
      and out should keep the existing 120ms. A press must feel immediate; only
      the release needs easing.
      Pairs with **§5.1** (pending states): `:active` covers the press,
      `useFormStatus` covers the wait. Neither substitutes for the other.

### 12.2 Spacing — the rail is off the scale

- [x] **12.2 — Done 2026-09-11, by sorting the pixels into categories rather
      than forcing them all onto one ladder.**
      The item's own wording allowed this — _"on the scale **or on a named
      token**"_ — and it matters, because the region was mixing **three
      different kinds of number** and only one of them belongs on the 4px scale: 1. **Layout rhythm** — gaps, and the space between things. On the ladder.
      `--spacing-tight: 6px` existed for exactly the 6px case and was used
      **zero** times; it is now `--tight` and carries all fifteen `gap: 6px`
      and five `margin-top: 6px` sites. 2. **Control interiors** — the space _inside_ one control, which the 4px
      layout scale should not govern. 10px was typed as a literal **twelve**
      times and is not an accident: DESIGN.md §6 declares `.button--small` as
      `6px 10px` and `.field` as `8px 10px`. It is now
      `--spacing-control-pad` / `--pad-control`. 3. **Optical nudges and hairlines** — the 1px and 2px values that align an
      icon with its text, seam two rows together, or sit a 2px underline on a
      1px border. These are neither rhythm nor interior, and forcing them to
      4px would be a visible regression. They stay, each now named as what it
      is in a comment.
      **What actually moved**, and it is only the genuine defects — values on no
      scale and under no name, which is what the item meant by "`7px` and `5px`
      are defects":
      | Site | Was | Now |
      |---|---|---|
      | `.ws-subnav__item` (column) | `7px` | `--tight` (6px) |
      | `.ws-filter > summary` | `gap: 5px`, `padding: 3px 7px` | `--tight`, `--s1 --s2` |
      | `.ws-daygroup` | `5px` | `--tight` |
      | `.ws-row__meta`, `.event__body` | `margin-top: 5px` | `--tight` |
      | `.entry__terms svg` | `margin-top: 3px` | `--s1` |
      | `.ws-rail__count`, `.ws-subnav__count` | `1px 5px` | `1px --tight` |
      | `.ws-row--flush` | `padding: 10px` | `--s3` (12px) |
      That last one is worth naming: `.ws-row--flush` sat 2px tighter than the
      `.ws-row` directly above it for no stated reason, so one list had two
      vertical rhythms depending on which row kind it drew. The variant is about
      the grid, not the padding.
      **A latent bug fell out of the same pass:** a strip tab's
      `margin-bottom: -1px` — which sits its 2px underline _on_ the strip's
      bottom border instead of a pixel clear of it — was declared only below
      720px. Between 721 and 860 the underline floated. It now applies across
      the whole strip range.
      Every renaming is **provably value-preserving**: the derived tokens were
      read back out of a rendered page and each resolves to the exact value it
      replaced.

### 12.3 Type — on the ramp by accident, not by reference

- [x] **12.3 — Done 2026-09-11, leading and tracking included.**
      Every type declaration in the navigation now references the ramp rather
      than restating one of its values: `--text-strip` for the rail and group
      headings (an **exact** match, 11px _and_ the 0.09em tracking, so those two
      rules were reimplementing the step by hand), `--text-stamp` for the count
      badges and the initials mark, `--text-meta` for the account, sign-out,
      rail footer and the menu-mode label, and `--text-ui-sm` for the topbar
      title, back-link, rail row, column row, strip tab, menu summary, overlay
      menu row and drawer summary.
      **The leading does come along, and it moves things — that was the point.**
      The nav rows were 13px/1.35 while `--text-ui-sm` is 13px/1.45, so a row's
      line box goes 17.55px → 18.85px. A single-line rail row barely notices;
      the **column** row, which is `white-space: normal` and can wrap onto two
      lines, is the one that actually wanted the step's own leading. The menu
      summary went the other way (19.5px → 18.85px): it had been inheriting
      1.5 from the body rather than using its own step.
      Verified by reading computed styles: **only** `line-height` changed, at
      three selectors, and every `font-size` is byte-identical.
- [x] **12.4 — Done 2026-09-11, and 12.7b did most of it.**
      `clip-path: inset(50%)` now appears **exactly once** in the whole file, in
      `.visually-hidden` itself. The inline copy went with the strip's old
      top-level definition: the strip hides the label with a single
      `display: none`, so there is no longer anything to un-hide. Both heading
      rules then lost the declarations that existed only to cancel it — seven
      from the column's and eight from the menu mode's — and now say what the
      label looks like rather than what it is not. Removing them changed **zero**
      computed values, which is the proof they were cancelling something that
      was no longer there.
      _The item proposed "use the class and one override"._ What shipped is
      better: the class is not needed at all, because the state it was faking
      (present but hidden) turned out to be plain `display: none`.

### 12.5 Control geometry — a third height nobody declared

- [x] **12.5 — Done 2026-09-11: the family is declared, and nothing moved.**
      The audit said "four different geometries"; a full count found **six**
      values in use — 30, 34, 38, 40, 44 and 48 — of which only 30 and 38 had
      names. What shipped is the item's own escape hatch ("if 34px is genuinely
      wanted, declare it as a token"), because it is: 34px was typed at six
      sites, and only two of them are in the sidebar — the segmented option and
      a post's text action use it too. Moving six controls to satisfy a count
      would have changed the app to make a number smaller.
      So the family is now named in `@theme`, derived once into `:root`, and
      referenced everywhere:
      | Token | Value | What it is |
      |---|---|---|
      | `--spacing-control-sm` | 30px | the small button, and now the rail row |
      | `--spacing-control-compact` | **new** 34px | a control sitting _inside_ something — a strip, a segment, a row of words |
      | `--spacing-control` | 38px | the control, standing on the page |
      | `--spacing-touch` | **new** 44px | the coarse-pointer **floor**, not a step — it may exceed `--spacing-control` without contradiction |
      | `--spacing-bar` | **new** 48px | the contextual strip and its rows |
      | `--spacing-topbar` | **new** 52px | the top band the sticky layout does `calc()` against |
      Two real changes came out of it, both deliberate: `.ws-rail__item` had
      **no declared height at all** (6px padding around a 13px line = 29.55px)
      and now states the 30px step it was already standing on, a 0.45px move;
      and `.ws-subnav__menu-item`'s undeclared 40px became the 38px control
      step, a 2px move, which retired the last unnamed height in the file.
      _Superseded finding:_ the app declares two control heights: `--spacing-control: 38px`
      and `--spacing-control-sm: 30px`. The sidebar invents **34px** and uses it
      for `.ws-rail__action`, `.ws-subnav__menu > summary` and
      `.ws-drawer > summary`, while `.ws-rail__item` sets no height at all (just
      `6px 8px` padding) and `.ws-subnav__item` is 34px on desktop but 48px on
      mobile. Four different geometries for one family of controls.
      _Recommendation:_ adopt `--spacing-control-sm` (30px) for rail rows and
      38px for the drawer/menu summaries, which are real buttons. If 34px is
      genuinely wanted, declare it as a token rather than typing it three times.

### 12.6 Count badges — the same fact, drawn two ways

- [x] **12.6 — Done 2026-09-11. One badge, two grounds.**
      The finding was "the same fact, drawn two ways": `.ws-rail__count`
      border-only, `.ws-subnav__count` a full amber wash. Looked at closely they
      were **already the same rule** in everything shareable — same 20px
      minimum, same `1px var(--tight)` inset, same `--radius-stamp`, same
      `--text-stamp` at weight 700, same tabular figures, same centring — and
      differed in exactly one property, the fill.
      **That difference is not a drift to flatten.** On the rail's `#123a28`
      ground every wash in the amber family lands within 1.2 contrast, so a
      filled badge there is a smudge; the rail spends the signal on its border
      and text instead, in `--rail-*` values measured against that ground. The
      reconciliation is therefore to put the one rule in **one place with its
      one documented exception**, not to make the two identical:
      `src/components/layout/nav-count.tsx`, with `ground="rail" | "paper"`.
      *Verified* by rendering both grounds against the two rules they replace:
      every compared property matches.
      **Answering the item's second question — should either be `Tag`? No, and
      neither should it be `Stamp`.** A tag "carries no state — quiet paper
      fill, one hairline" (`ui/tag.tsx`), and a count on a nav row is the
      opposite: it means *attention*, which is what the amber family is for. A
      stamp is a word AND a shape AND a tone, and this is a bare figure. It is
      genuinely its own small thing, which is why it is a third component rather
      than a borrowed one — and §10.2's pending `MetaList` decision does not
      gate it.
      *It also absorbed the accessible name.* `"needing review"` had been
      written out **three** times — once in the rail, twice in the sub-nav —
      and three copies of a string that says what a number MEANS is three
      chances for one of them to say something else. It is now a `describes`
      prop with that default.
### 12.7 Cleanups found while auditing

- [x] **12.7a — Deleted 2026-09-11.** `.ws-rail__action` was dead — its own
      comment admitted no call site rendered it — and carried 28 lines with
      hover and press states. Gone, not wired up: if the collapsed rail (§10.4.2)
      wants an action, it gets built in the Tailwind vocabulary like every other
      new component, because this file only shrinks (§11.6b). Confirmed no `.tsx`
      references it.
- [x] **12.7b — Split 2026-09-11, and it was hiding a live defect.**
      The finding was right and understated: the two definitions were not just
      redundant, they were **producing a third shape nobody designed**. Because
      the column came second and unconditionally, `.ws-subnav--menu` — the
      compact "Section menu" disclosure used on ten staff routes — inherited the
      column's geometry for every property its own rules did not override, while
      keeping its own `justify-content: space-between`. Read off a rendered
      page: a **200px-wide, full-height white column with a `border-right`,
      holding one dropdown pressed against its bottom edge**, on every section
      staff route at desktop width.
      _The split, and why not the one the item proposed:_ a `--rail` modifier
      was the wrong axis. `.ws-subnav` is a child of `.ws-body`, which is a flex
      **row** at desktop — so the column is not a style preference, it is the
      only shape that fits there, and a 48px band is only possible below 860px
      where `.ws-body` turns into a column. The two shapes are therefore
      **responsive states**, and the mode (`tabs` / `menu`) is a **content**
      axis that is independent of them. That is now how the file reads: - the **column** is the one unconditional definition; - the **strip** is stated outright inside `@media (max-width: 860px)`,
      where it applies, instead of sitting at the top level to be cancelled; - `--menu` carries only what a content mode needs — a positioning context
      and `overflow: visible` so its popover escapes the column's scroller —
      and `justify-content: space-between` moved into the strip block, the one
      shape where the label and the control share a line.
      _Also deleted:_ `.ws-subnav__scroll`, dead since the strip stopped being
      the desktop shape — no component has rendered it.
      **One thing left for §4.5:** the strip and the column still each state
      their own `.ws-subnav__item`. That is now base-in-one-breakpoint versus
      base-in-another rather than two components on one class, but the honest
      end of it is the shell moving to utilities.
- [x] **12.7c — Done 2026-09-11.** One rule now declares the set for every
      interactive navigation control — rail row, rail group toggle, strip/column
      item, menu summary, menu row, drawer summary, sign-out — as
      `background-color, border-color, color, text-decoration-thickness` at
      0.12s ease. Each control animates whichever of the four it actually
      changes and none of them has to remember to say so; the three
      disagreeing per-control declarations were deleted rather than reconciled.
      The `:active` duration override still wins at each site by specificity, so
      a press stays instant, and the reduced-motion block still kills all of it.
      _The disagreement, for the record:_ `.ws-rail__item` animated
      `background-color`, the strip item `color, border-color`, the column item
      `background-color` again, and the group toggle, menu summary, menu rows and
      sign-out link animated nothing — the same gesture eased in one region and
      snapped in the next.
- [x] **12.7d — Done 2026-09-11.** `.ws-signout` now has all three. Hover
      thickens the underline to 2px rather than filling a background, because
      there is no box here to fill — it is a link-shaped control and should keep
      reading as one. Press takes `--accent-press` in the top bar and
      `--rail-focus` in the rail footer, the two grounds it appears on. Focus was
      already covered: the global `:focus-visible` ring applies, with
      `.ws-rail :focus-visible` overriding it on the dark ground. It also picked
      up the shared transition from 12.7c, including the underline thickness.

### 12.8 Order

**§12 is complete as of 2026-09-11.** Every item in this section is done.
The sidebar work that remains is **§10.4.2** (the collapse, designed 2026-09-11
and not yet built) and **§11.4** (the trail, which 11.4c makes a prerequisite
of it) — both tracked there rather than here.

1. ~~**12.1**~~ — **done 2026-09-11.** Pressed states, as one pass over the
   whole control vocabulary.
2. ~~**12.7a / 12.7b**~~ — **done 2026-09-11.** The dead rule is deleted and the
   double-defined class is split — which turned out to be a bug fix, not a
   tidy-up.
3. ~~**12.5**~~ — **done 2026-09-11.** Control geometry is declared, with no
   pixels moved except two deliberate ones.
4. ~~**12.2 / 12.3 / 12.4**~~ — **done 2026-09-11**, alongside §2.2/§2.3 since
   it was the same kind of edit. 12.4 came free with 12.7b.
5. ~~**12.6**~~ — **done 2026-09-11.** It did not need §10.2's `Tag`
   conversion after all: the answer was that a nav count is neither a `Tag` nor
   a `Stamp`.
6. ~~**12.7c / 12.7d**~~ — **done 2026-09-11**, out of order: both were one-rule
   changes inside blocks 12.1 was already editing, and splitting them across two
   passes would have meant restyling the same selectors twice.

---

## 12a. Sidebar redesign — `sidebar.md`, 2026-09-11 **[Confirmed spec]**

The owner supplied a written spec, `sidebar.md`, after §12 had
closed and 10.4.2 had shipped. It is implemented. Recorded here because it
**reverses two things this file had settled**, and a later reader needs to know
they were reversed on purpose rather than lost.

- [x] **12a.1 The toggle is back INSIDE the rail (§3).**
      10.4.2 had moved it to the top bar, because inside the rail a click left
      the button focused and the rail expanded on `:focus-within`, holding it
      open exactly when asked to close. **`sidebar.md` removes the cause, not the
      symptom:** §5 requires the rail to push the layout "rather than sitting
      over the content", so the hover/focus expansion is gone entirely. With
      nothing re-expanding the rail, the control is safe in it — and the labels
      that expansion used to reveal now come from `title` tooltips (§4).
      *The tooltip trade-off, stated:* `title` is slow and unstyleable, and it
      is the only no-JS option. A CSS panel cannot work — it would be a child of
      a row, needing to paint outside a rail that scrolls vertically, and CSS
      forbids that pair (measured twice; see 10.4.2). The row's label stays
      `sr-only`, never removed, so the accessible name is intact at every width
      and the tooltip is a convenience on top.
- [x] **12a.2 The active row is no longer a white sheet (§7).**
      D-E made the current destination an inverted paper slab — the rail's one
      inversion, written into [DESIGN.md](DESIGN.md) §3. §7 asked for "refined"
      instead of "a huge bright green block", so it is now `--rail-active`
      (white at 10%) plus brighter ink, a weight change and a 2px accent batten.
      DESIGN.md §3 is corrected rather than left contradicting the code.
      **Four channels for one state, and the count is the point:** the fill is
      ~1.3:1 against its neighbours by design, so it cannot carry the state
      alone and is not asked to. `aria-current` says it independently.
- [x] **12a.3 The rail stopped repeating the header (§1, §16).**
      No product mark, no "Class Feedback", no workspace name at the top. The
      account moved to the bottom behind a divider (§10) — which is where §16's
      "do not repeat Staff workspace" and §10's "profile at the bottom" appear
      to disagree; §10 and the §18 diagram both draw it, so it is drawn.
- [x] **12a.4 Geometry, spacing and alignment (§5, §13, §14).**
      248 / 72px on a 200ms transition, 42px rows, 4px between rows against 24px
      between sections, and a **fixed icon column** so every label starts at the
      same x — verified: one value, 56px, across every row.
- [x] **12a.5 Responsiveness (§15).** Desktop chooses; **tablet** (<1024px) gets
      the icon rail with the toggle hidden, because a control that cannot change
      anything is the defect this whole pass began with; **phone** (<860px) gets
      the drawer, which renders the same rail expanded and with no toggle.
- [x] **12a.6 `legacy.css` shrank by 137 lines / 25 rule blocks.** The whole
      `.ws-rail*` block went; the redesign made that file smaller rather than
      larger (§11.6b).

**Three defects the static probes missed and the running app caught** — the same
lesson as 10.4.2, learned again:
1. **The rail rendered on a phone, behind the open drawer.** Replacing the
   `className` wholesale orphaned `legacy.css`'s
   `@media (max-width: 860px) { .ws-rail { display: none } }` — and even with
   the class restored it could not work, because that file is `@layer
   components` while the rail's own `flex` is a utility, and **layer order beats
   a media query**. The hide is a utility now.
2. **The sticky full-height rule went with the deleted block**, so the rail
   scrolled away on a long single-column page. Restated as utilities.
3. **The Sign out button was a grey slab with near-white text on it** — the UA's
   `buttonface`, the *same* omission as the chevron a few hours earlier. Every
   button on the rail now states `bg-transparent`. Twice is a pattern: the
   stylesheet's reset neutralises font and colour on form controls but **not**
   their background.

**Two things in the spec deliberately not done, with reasons:**
- **§11's `#003B2F`/`#004D40` ground.** Kept `#123a28`. It is the same deep
  UP-forest family the spec asks for (the hexes are given as an "example" of a
  "range"), and all ten `--rail-*` tokens are measured against it — D-E did that
  work. Changing the ground invalidates ten measured contrast ratios to move a
  colour a reader cannot distinguish.
- **§9's collapsible course list while the rail is collapsed.** The `<details>`
  survives, but its summary is `sr-only` at 72px: there is no room for a label
  and its chevron, and §4 says to hide section headings. The group stays
  announced to a screen reader.

---

## 12b. Sidebar readjustments — `sidebar.md` rev 2 + `readdjustments.png`, 2026-09-11 **[Confirmed spec]**

A second revision of `sidebar.md` plus an annotated reference,
`readdjustments.png`. Implemented. The image's left panel is
the authoritative list, and its point 4 bounds the work: *"Do not alter the main
content layout beyond the sidebar and navigation structure adjustments."* So the
reference's dashboard — the Upcoming panel, Quick actions, maroon buttons
throughout — is **not** built; only the navigation structure.

- [x] **12b.1 ONE sidebar: the nested vertical sub-nav is gone (§1, §17).**
      The course's own views — Forms · Responses · Class lists · Teaching team —
      rendered as a **200px vertical column between the rail and the page**,
      which §17 forbids outright ("there must NEVER be sidebar → sidebar → main
      content"). The column form is deleted; the horizontal strip that was this
      component's phone shape is promoted to its **only** shape at every width.
      *The structural change that made it possible:* the shell's `.ws-body` now
      holds the rail beside a **content column**, so the tab bar has somewhere
      to span. Previously it was a flex child of a row and could only ever be a
      narrow column.
      *Verified across every course and section route:* 1 rail, 1 sub-nav,
      **0 vertical sub-navs**, 4 horizontal tabs on a course and 9 on a section.
- [x] **12b.2 The tab bar sits BELOW the course header (§7, §8).**
      It first landed above it, because the shell renders the bar and the *page*
      renders its header — so the shell could not place it correctly. `AppShell`
      now renders the bar itself, after the head. `WorkspaceShell` keeps the
      props for the one caller that passes them directly
      (`sections/[id]/qa`), a two-pane route with no page head where the top of
      the content column is the right place.
- [x] **12b.3 The collapse handle straddles the sidebar's centre-right edge
      (§4).** A **sibling** of the rail and `fixed`, both forced:
      - *Not a child* — the rail is its own scroll container, so a handle
        straddling its edge would be clipped by it. The same constraint killed
        the per-row flyout twice; this time the element lives outside.
      - *`fixed`, not `absolute`* — `.ws-body` can be far taller than the
        viewport, so `absolute top-1/2` would centre the handle on the
        **document** and scroll away. The rail is a sticky viewport-tall column,
        so the viewport's middle *is* the sidebar's middle.
      `-translate-x-1/2` makes it straddle rather than sit beside, and `left`
      transitions with the rail so it stays attached for the whole 200ms.
      *Verified:* handle centre y = 450 against a viewport midpoint of 450, and
      its centre x = 248 expanded / 72 collapsed — exactly the rail's edge in
      both states.
- [x] **12b.4 The active tab is maroon (§7).** `--red-deep` text over a `--red`
      underline. **This widens what maroon means** — it was the problem signal
      only — so [DESIGN.md](DESIGN.md) §3 records the widening rather than being
      left to contradict the code. What keeps the readings apart: a problem is
      never *only* maroon, because every status is a `Stamp` (word + shape +
      tone), so a maroon tab cannot read as an invalid stamp.
- [x] **12b.5 Responsive (§16).** Desktop chooses; tablet (<1024px) gets the
      72px icon rail with the handle hidden; phone (<860px) gets the drawer.
      *Verified at 960px and 390px.*

**One layout bug I introduced and caught by measuring.** Promoting the tab bar
out of its `@media (max-width: 860px)` wrapper also unwrapped
`.ws-body { flex-direction: column }`, which had been sitting in the same block.
Unconditionally, that made the shell **stack**: the rail became a flex item on
the column axis, so its `flex: 0 0 248px` set its **height** and it rendered
248×248 with the tab bar underneath it. The lesson is narrow and worth keeping —
**when promoting rules out of a media query, promote the ones you meant, not the
block.**

`legacy.css`: **626 → 613 rule blocks** (the column form, the 1024px narrowing,
and the dead `.ws-content*` set).

---

## 12c. Course navigation — `sidebar.md` rev 3 + `courses navbars.png`, 2026-09-11 **[Confirmed spec]**

Third revision, with an annotated reference. Most of the spec was already met by
12a/12b; these are the three things that were not.

- [x] **12c.1 The collapse handle is VISIBLE.**
      > _"the sidebar button is kinda weird? follow the design from the images
      > it must be visible"_
      It was `bg-transparent` with a `--rail-rule` border, and the owner is
      right — it was nearly invisible, **for a reason specific to where it
      sits.** The handle straddles the boundary between the dark rail and the
      cream page, so half of it was a faint green hairline on dark green and the
      other half a faint green hairline on cream. Transparent works for a
      control that sits ON a surface; this one sits BETWEEN two.
      It now takes the palette's soft pale green — `--accent-wash`, which is
      the `#E8F1EC` §13 names — with the deep accent as its chevron at 7.6:1.
      Deliberately **not** on `--rail-*` tokens even though it touches the rail:
      those are fenced to the rail's interior by D-E and measured against its
      ground, and half of this element is outside it.
- [x] **12c.2 A `More ▾` menu for the secondary course sections (§6, §20.15).**
      | Visible as tabs | Folded into `More` |
      |---|---|
      | Forms · Responses · Class Q&A · Participation | Publication queue · Question backlog · Audit history · Class lists · Teaching team |
      Exactly the spec's split, and a section route goes from **nine cramped
      tabs to four plus a menu**.
      *Where the split is declared matters.* It is `item.secondary` on the nav
      item, set by the builders in `nav.ts` — not a label match in `SubNav`.
      Which sections are frequent is domain knowledge, and a view matching on
      the string `"Audit history"` would break the moment someone renamed it.
      *One thing that would otherwise be a bug:* when the reader is ON a folded
      destination, `More` itself takes the maroon active treatment. Without
      that the bar shows no active tab at all and the page reads as orphaned.
      Being secondary says nothing about permission — every one of them is
      authorized exactly as before.
- [x] **12c.3 The course header is two lines (§5).** The course's name, then its
      term beneath it. They had been one `MetaList` row — "Data Structures and
      Algorithms II  2026-2027  1st semester" — which reads as one run-on fact.
      The name answers *which course*, the term answers *which offering*, and a
      reader scanning for the second should not have to parse past the first.

**Two things in the reference deliberately not built, with reasons:**
- **The UP seal in the sidebar footer.** The image shows the seal plus
  "University of the Philippines Diliman / Department of Computer Science". The
  spec calls this branding "optional", and **D-D.6 is still [Open]**: university
  visual-identity marks carry usage rules, and that item says to ask DCS before
  shipping the seal. An open authorization question is not something a layout
  pass should decide.
- **A `·` between the term facts.** The image writes "2026–2027 · 1st semester".
  `MetaList` separates with whitespace and **no middle dots**, which DESIGN.md
  §14 argues for at length — dots weld unrelated facts into one sentence. The
  facts are rendered; only the punctuation differs, and the existing rule is a
  considered one rather than an oversight.

---

## 12d. Course navigation, second correction — 2026-09-11 **[Confirmed]**

Seven reports from the owner against 12c. All fixed. Three were cosmetic; four
were the same underlying mistake — **the navigation was saying the same thing
twice and in different words each time.**

- [x] **12d.1 The collapse handle, third attempt — sampled, not guessed.**
      The first two failed on the same trap: the handle **straddles the boundary
      between the dark rail and the cream page**, so it is the one element that
      must be legible against *both*. `bg-transparent` vanished into each;
      `--accent-wash` was visible but read as a stray blob on the seam.
      The reference's answer, read out of the PNG pixel by pixel, is to make it
      a piece of the sidebar *pulled out* of the sidebar: a lighter green fill
      with a near-white chevron, taller than wide. `--color-rail-handle`
      (`#1e6b4a`) is **1.95:1 against the rail** — where `--rail-raised`'s 1.25
      was invisible — 5.65:1 against the page, and carries `--rail-ink` at
      5.5:1.
- [x] **12d.2 The tab bar no longer touches the content.** The gap was **0px**:
      the alert on a course page was flush against the tabs, its border merging
      with the bar's. Now 24px, from the bar itself, so no page can forget it.
- [x] **12d.3 `More` is a tab, not a pill.** It was a bordered white capsule
      with a 6px radius — an action you press, sitting in a row of tabs. At rest
      it now reads exactly like an inactive tab; open, it lifts into a white tab
      **welded to its panel** (rounded top, bottom edge painted out). Its
      chevron points **down** at rest, which is what makes it read as a
      dropdown.
- [x] **12d.4 The `More` panel was invisible.** *"opening it doesnt show the
      remaining options… like its behind"* — exactly right, and it was a clip,
      not a z-index: the bar had `overflow-y: hidden` and the panel dropped
      199px below it, so **five destinations were unreachable**. The bar is now
      `overflow: visible` and the scroller moved to an inner
      `.ws-subnav__scroll`, so the tabs still scroll while the panel escapes.
      *This is the third time a popover has been clipped by an ancestor on this
      component.* The rule, now stated where it can be seen: **a scrolling
      element cannot contain a popover.** Put the scroller on the thing that
      actually needs to scroll.
- [x] **12d.5 Breadcrumbs are back (§9, N-4).** `My courses / CS 33` on course
      tab pages, `My courses / CS 33 / Weekly check-in` below them — subtle, as
      §9 requires, and never in place of the tabs.
- [x] **12d.6 The tab bar is gone from pages BELOW a tab.** *"the forms thingy
      is kinda redundant… clicking the one forms show also the same navbar
      duplicated."* A form's page is a **child** of Forms, not a sibling, so a
      tab row with "Forms" still marked active claimed the reader was choosing
      between peers they had already drilled past. `nested` on `AppShell` marks
      those pages — a form, an occurrence, the new-form editor — and the
      breadcrumb carries the drill-down instead.
- [x] **12d.7 The heading stays the COURSE on every tab. [answered a question]**
      > *"its weird like selected tab from the cs33 like responses replaces the
      > cs33 with Responses, but the forms doesnt do that? whats the best action
      > we can do here?"*
      **Don't replace it.** Forms and Responses are two views *of one course*,
      so the course is the subject on both and the tab says which view. Setting
      the tab's name as the heading did two bad things at once: it **repeated
      the tab** — already maroon and underlined a few pixels below — and it
      **discarded the only thing naming the course**. It also made the two tabs
      disagree, which is what the owner noticed.
      The division of labour now, with nothing said twice:
      | Element | Answers |
      |---|---|
      | breadcrumb | how you got here |
      | heading | *which course* |
      | active tab | *which view of it* |
      | nested page heading | the object you opened |
      `courseSubtitle` (`components/staff/course-heading.tsx`) builds the
      subtitle once, so two courses — or two tabs of one course — cannot drift.
      That also closes **"cs145 and cs33 doesnt have the same layout"**: both
      now lead with breadcrumb → code → name → term → tabs → 24px → content.

**One difference between the two courses that is NOT a bug, and stays.** CS 33
shows four primary tabs and CS 145 shows two, because Class Q&A and
Participation are **section-scoped** — they point at a class list, and CS 145 has
none. The page already says so at the top ("No class lists yet — a form needs at
least one class list to go to"). Showing the two tabs anyway would mean either a
link that rejects the reader or a disabled tab explaining itself, and **[Open]**
whether the owner would prefer that to their absence.

---

## 12e. Breadcrumbs and the forms table — 2026-09-11 **[Confirmed]**

Two owner requests: *"make an actual breadcrumb component instead"* (with a
reference image) and `form-table.md` + `form-table.png`.

- [x] **12e.1 `Breadcrumbs` rebuilt.** It was a `<li>` list separated by the
      typed character `" /"`, which put punctuation **into the accessible
      name** — a screen reader read "My courses slash CS 33 slash Weekly
      check-in". The separator is now an `aria-hidden` drawn `IconChevron`
      outside the link (DESIGN.md forbids a glyph standing in for an icon), the
      ancestors are accent-coloured links, and **the last crumb is not a link**
      and carries `aria-current="page"` — a link to the page you are on is a
      dead control. `.breadcrumbs` is deleted from `legacy.css`.
      *Verified on a three-level trail:* two chevrons, two links at
      `--accent-deep`/600, the current crumb at `--ink-soft`/400, all 12px.
      The reference's purple is a generic sample; the app's accent is green, and
      DESIGN.md §3 reserves it for action — which is exactly what a crumb link
      is and what the current crumb is not.
- [x] **12e.2 The forms table, rebuilt to `form-table.md`.**
      | § | Change |
      |---|---|
      | 1 | **"Goes to" column gone.** The audience is a property of the form, not a peer of its status, so it sits under the name with the question count — and the name gets the width the column was using |
      | 2 | The name is the anchor: a document mark plus the title in the accent at semibold, where it had been plain text among plain text |
      | 4 | `2 (2 to answer)` → **"2 responses"** over **"2 need a reply"** — gold when something waits, green "All reviewed" when nothing does, quiet "No responses yet" when there is nothing. *A parenthetical is not an attention state* |
      | 5 | Badge plus a supporting line **underneath** it, never inside — a badge that grew a date would stop being scannable as a state |
      | 6 | Review is the **primary** button only when a reply is actually waiting; otherwise reading is the offer. A row where nothing needs doing should not push a green button at you |
      | 8, 9 | White surface, one hairline, rounded, subtle row separators, no shadow |
      *Written in utilities, not on `.data-table`*: the spec scopes the redesign
      to this table and that class dresses **seven** others.
      *One defect caught by looking:* the status badge stretched to fill its
      cell, because a grid item stretches by default — `justify-items-start`,
      and it hugs its text as §5 asks.
- [x] **12e.3 `Closed` is neutral, not maroon (§5).** This reverses a comment
      that used to sit in `status.tsx` arguing that open-vs-closed is the binary
      a teacher scans for, so closed "earns a signal". The owner's call is
      better: **a form closing is the normal end of its life, not a problem**,
      and maroon is this palette's problem signal — a table of finished forms
      rendered as a column of maroon badges reads as a list of failures. `Open`
      carrying the only colour makes the same distinction by contrast.
      This changes `CycleStateBadge` everywhere it appears (three pages), which
      is right: one recipe, one meaning.

**§7 — the `⋮` row menu — is NOT built, and this is the reason.** It asks for
"Edit, Duplicate, Close, Delete". `src/modules/forms/templates.ts` exposes
`createTemplate`, `createTemplateVersion`, `updateTemplateDetails` and three
read functions — there is **no duplicate, close, delete or archive operation for
a form template anywhere in the codebase**. The only real secondary destination
is the form's own page, which the row's title already links to, so the menu
would either hold one redundant item or advertise three actions that fail. The
spec's own §12 preamble says to keep existing functionality; inventing three
mutations is the opposite. **[Open]** — say the word and they get built as
audited server actions with the confirmations §5.9/11.2b describe, which is a
change to the domain rather than to a table.

---

## 12f. One trail everywhere, and the consistency audit — 2026-09-11 **[Confirmed]**

- [x] **12f.1 The handle is thicker.** 20×36 → **28×36**. Half of it overhangs
      the page, and 20px of that was a sliver.
- [x] **12f.2 Every tab page has the same trail, and the LAST CRUMB IS
      DERIVED.**
      > *"participation section and other sections still doesnt follow the
      > breadcrumbs method we did — My courses / cs33 / responses"*
      The fix is structural rather than nine edits: `AppShell` reads the active
      tab off the same `active` flags the tab bar renders and appends it as the
      final crumb. **No page can forget it, and no two pages can word it
      differently** — which is exactly how "My courses / CS 33" on one tab and
      nothing at all on the next happened. A tab folded into `More` still
      counts: being secondary changes where it is drawn, not where you are.
      | Page | Trail | Heading |
      |---|---|---|
      | course · Forms | My courses › CS 33 › Forms | CS 33 |
      | course · Responses | My courses › CS 33 › Responses | CS 33 |
      | course · Class lists | My courses › CS 33 › Class lists | CS 33 |
      | course · Teaching team | My courses › CS 33 › Teaching team | CS 33 |
      | section · Participation | My courses › CS 33 › THX › Participation | CS 33 · THX |
      | section · Publication queue | … › THX › Publication queue | CS 33 · THX |
      | section · Audit history | … › THX › Audit history | CS 33 · THX |
      | section · Class list | … › THX › Class lists | CS 33 · THX |
      | section · Question backlog | … › THX › Question backlog | CS 33 · THX |

      > **Three of those rows moved to course scope, 2026-09-12**
      > ([ADR-0005](docs/decisions/ADR-0005-course-scoped-teaching-workflow.md)).
      > Publication queue, Question backlog and Class Q&A are course-owned, so
      > their trails are `My courses › CS 33 › Publication queue` with the
      > heading `CS 33` — the same shape as Forms and Responses above, one row
      > up. The **rule** this table exists to state is unchanged and is what
      > made the move cheap: the crumb is how you got here, the heading is what
      > this is, the tab is which view of it. Participation, Class list and the
      > section's own pages stay section-scoped.
      **Five headings changed to make that true.** Each section page used to set
      its own tab name as the `<h1>` — "Participation", "Audit history" — so the
      page said the same word three times over (crumb, heading, active tab) and
      never said which class it was. The heading is now the subject, exactly as
      12d.7 settled for the course: *breadcrumb = how you got here, heading =
      what this is, tab = which view of it.* The backlog page also had a
      hand-built trail starting at "Overview"; it uses the shared one now.

### 12f.3 `changes.md` — what it asked for, and what was already true

The spec is an app-wide consistency refactor. **Most of its component layer was
already in place**, because batches 1–3 were that work; the audit is recorded
here so the next reader does not redo it.

| `changes.md` asks for | State |
|---|---|
| centralized radius scale, no hardcoded variants | **Met.** One scale — `--radius-control` 6 / `--radius-stamp` 5 / `--radius-panel` 12 — and after this pass the app contains **zero** off-scale radii. The only literals left are deliberate `0`s on things squared to the board |
| one spacing scale | **Met** (§2.2, §12.2). `style={{ }}` is at **0** across `src/` |
| consistent control heights | **Met** (§12.5). Six heights, all named tokens; no height literal in any `.tsx` |
| consistent borders/colours, no hardcoded values | **Met** (§2.1, §2.3). No colour literal in any `.tsx` — the two `#` matches are hex quoted inside comments — and `:root` is strictly derived, enforced by `tests/unit/theme-tokens.test.ts` |
| shared Button / Input / Select / Badge / Tabs / Table / Card / Alert / Breadcrumb / Dialog / Form field / Radio / Empty state | **Met** (§3.1–§3.5, §11.2a, 12e.1). One recipe each in `ui/`, listed in DESIGN.md §13 |
| design tokens for colour, radius, spacing, type, heights, borders, shadows, transitions | **Met.** All in one `@theme` block; a hex may appear there and nowhere else |
| breadcrumbs on deeper pages, small and secondary | **Met** — 12e.1 and 12f.2 |
| forms table | **Met** — 12e.2 |
| **"fully rounded pills for status badges"** | **Deliberately not done.** The reference images show status badges as *rounded rectangles* at roughly the existing 5px, not pills — and DESIGN.md §5 bans pills outright as belonging to the rejected system. Following the prose over the pictures would have made every badge contradict both |

**Four page-level redesigns in `changes.md` are NOT done.** They are page rewrites
rather than consistency work, and each is large enough to want its own pass:

- [ ] **12f.4 Responses page.** Numbered questions (`01`, `02`, subtly), long
      answers collapsed by default behind "Show full answer", a compact
      filter/search row instead of stacked controls, and "Needs a reply" raised
      to the top of a response rather than sitting at the bottom.
- [ ] **12f.5 Form detail / occurrences.** Combine `Opens` and `Closes` into one
      `Sep 7, 8:00 AM → Sep 13, 11:59 PM` cell, combine questions/responses into
      `4 questions · 2 responses / 1 needs a reply`, and make the row action
      depend on state (Scheduled → Open now, Open → Close now, Closed →
      Customize).
- [ ] **12f.6 Audience and schedule, by progressive disclosure.** Replace the
      stacked bordered radio cards with a plain radio pair that reveals the
      section picker only when "Only the sections I choose" is chosen, and a
      **segmented control** for the four delivery modes showing only the fields
      that mode uses.
- [ ] **12f.7 The `⋯` row menus.** Still blocked on the same thing as §7 of
      `form-table.md`: `forms/templates.ts` exposes no duplicate, close, delete
      or archive operation, so the menu would advertise actions that fail. These
      need audited server actions with confirmations (§5.9, 11.2b) — a domain
      change, not a table change.

---

## 12g. The `text-*` merge bug, and the editor footer — 2026-09-11

- [x] **12g.1 `cn()` was DELETING the class that set button text colour.**
      > *"the text color is still broken"*
      It was, and the cause is worth the space because it is a whole class of
      silent bug rather than one wrong value.
      `cn()` is `twMerge(clsx(...))`. **`text-*` is ambiguous** — it can be a
      font size or a text colour — and `tailwind-merge` decides which by
      recognising the value. It knows `text-sm` is a size and `text-red-500` is
      a colour. It knows **none** of this app's twelve custom steps or its
      colour names, so it put `text-ui-sm` and `text-on-accent` in the *same*
      group and kept only the last one.
      `buttonClass({ variant: "primary", size: "small" })` composes
      `text-on-accent …` then `… text-ui-sm`, so **the colour was dropped from
      the class list entirely** and every small primary button in the app
      rendered dark ink on dark green. Proven at the library, not guessed:
      ```
      twMerge('text-on-accent bg-accent …', '… text-ui-sm')
        => 'bg-accent … text-ui-sm'      // text-on-accent is gone
      ```
      **Why it looked like a one-off.** `sizes.default` contains no `text-*`, so
      full-size primary buttons were always correct — the header's "New form"
      was white while the table's "Review responses" was not. Same recipe, same
      variant, different size.
      *The fix is to teach the library the theme*, in `src/lib/cn.ts`: the
      twelve `--text-*` step names are registered as the `font-size` group, so a
      `text-*` on that list is a size and anything else is a colour. The named
      `--radius-*` and `--spacing-*` keys went in too — without them
      `rounded-panel rounded-control` and `min-h-control min-h-nav-item` both
      *survived* a merge, which leaves the winner to stylesheet order rather
      than to the caller, the one thing `cn` exists to prevent.
      *Swept every route afterwards* for a filled control under 4.5:1. Two
      categories came back and both are correct: three **disabled** buttons at
      3.0 (disabled controls are exempt), and the rail's active row, where the
      probe was comparing ink against the translucent overlay instead of its
      composite over the rail — measured properly it is **7.97:1**.
- [x] **12g.2 The editor footer separates leaving from committing.**
      `.form-actions` was already `justify-content: space-between`, but Cancel,
      Preview and Save all sat inside **one** child — so the container had a
      single item, space-between had nothing to distribute, and the two opposite
      outcomes of the page ended up a few pixels apart. Two groups now: Cancel
      (with any `extraActions`) at `left: 0`, Preview and Save at `right: 0`.
      DESIGN.md §7a is unaffected — Save primary, Preview secondary, Cancel
      quiet.

---

---

## 12h. The create-course modal, and the consistency sweep behind it — 2026-09-11

Two owner requests in one round: build the create-course modal to
`modal.md`, and — *"some ui components still stray away from
design.md… for example the more button its flyout component is not rounded"* —
find out how many more of those there are.

The flyout was the visible one. **Four more faults of the same kind came out of
the same sweep**, and none of them was findable by reading the source.

### 12h.1 The modal

- [x] **12h.1a `CreateCourseDialog`, on the shared `Dialog`.**
      `src/components/staff/create-course-dialog.tsx`. It replaced a full-width
      panel that appeared above the cards on `?new=1` — so pressing **New
      course** pushed the list down the page and the courses you were about to
      compare against scrolled away. *Measured:* the first card's top is 173px
      before the modal opens and 173px while it is open, which is `modal.md`'s
      "do not move or resize the course cards".
      The file contains **no geometry at all** — radius, elevation, scrim,
      Escape, the focus trap, focus return and the corner × all come from
      `Dialog`. That was the spec's own priority ("not a separately designed
      component"), and it is why this is a 170-line component that is mostly
      comment.
- [x] **12h.1b The title is optional, and the image is the thing that was
      wrong.** The reference PNG shows `Course title *`. `modal.md`'s field
      list overrides it three times ("Empty title must still allow the course
      to be created", "do not display an asterisk", "Do not show an error for
      an empty course title"), so the text won. It also agrees with the rest of
      the app — the CODE is the identity, every heading and crumb leads with
      `CS 33` — and it **answers §10.3b**, which had been open on exactly this.
      `courseInputSchema.title` is now `.max(200).default("")`; the column stays
      `NOT NULL` and holds `""`, which `MetaList` already drops.
      *Verified end to end:* `CS 99` created with an empty title.
- [x] **12h.1c The term is asked once, on the course. [migration approved by
      the owner 2026-09-11]**
      `modal.md` requires **Semester \***, and `courses` had no term column —
      `class_sections.term` held it, so a teacher retyped the same academic year
      per class list and a course with no class lists had no term to show at
      all. `src/lib/term.ts` had said so in prose and called the column "out of
      scope"; the owner approved it.
      | Piece | Where |
      |---|---|
      | `ALTER TABLE courses ADD COLUMN term text` | `drizzle/0007_course_term.sql` |
      | the column, nullable and documented | `db/schema/catalog.ts` |
      | validation, audit, `updateCourse` | `modules/catalog/index.ts` |
      | inheritance for new class lists | `fallbackTerm(courseTerm, sectionTerms)` |
      | what the card reads | `courseTermParts(courseTerm, sectionTerms)` |
      | the year window | `academicYearOptions()` |
      **Nullable is the design, not a shortcut.** Every existing course has no
      value, and inventing one would be fabricating a fact about somebody's
      course — so readers fall back to the sections exactly as before and an old
      course renders identically. That is what keeps the migration additive and
      `DROP COLUMN` a complete rollback.
      It also narrows a flagged **[Assumption]**: `fallbackTerm` used to guess a
      new section's term from the calendar (Aug–Dec = 1st, …). That guess is now
      reached only by a pre-column course with no sections, and it is the value
      the dialog opens on, where a teacher can see and change it.
      *12 new tests in `tests/unit/term.test.ts`*, each pairing the new path
      with the old one so the "renders identically" claim is enforced rather
      than asserted.
- [x] **12h.1d Two fixes to the shared `Dialog`, which all ten call sites
      get.** A corner **×** (`IconClose`, `aria-label`, the one icon in this app
      allowed to stand without its word) replacing a quiet button reading
      "Close" — which read as a third action competing with Cancel. And
      **click-outside to close**: a native `<dialog>` does not do it, the
      backdrop is a pseudo-element and cannot carry a listener, so the test is
      `event.target === dialog` — sound only because the element is `p-0`.
      `mousedown`, not `click`, so a text selection that overshoots the frame
      does not throw the form away.
- [x] **12h.1e The caret lands in Course code, and `autoFocus` could not do
      it.** React's `autoFocus` prop calls `.focus()` at mount — before the
      dialog is in the top layer — and does not set the `autofocus`
      **attribute**, which is what `showModal()` looks for. So the browser fell
      back to the first focusable child: the ×. The caller marks its field
      `data-autofocus` and `Dialog` focuses it after showing.
      *Verified:* `document.activeElement` is `input[name="code"]` on open.

### 12h.2 Five faults the sweep found

- [x] **12h.2a Three popovers had no radius, not one.** `.ws-subnav__menu-list`
      (the `More` flyout — the reported one), `.ws-filter__menu` and
      `.filterbar__menu`. Fixed by shape rather than uniformly: the flyout is
      flush against the bar's bottom edge across its whole width, so it takes
      `0 0 var(--r-panel) var(--r-panel)` — the split `.notice__foot` already
      makes — while the two filter menus float clear of their trigger and take
      the full step on all four corners.
      `.ws-drawer__panel` stays square and now says why: it is pinned to all
      four edges below the top bar, so it is a full-bleed sheet, not a panel.
- [x] **12h.2b A fourth copy of a colour.** `.preview::backdrop` held
      `rgba(28, 30, 32, 0.42)` — the exact value of `--color-scrim`, written
      out by hand. §2.1 removed twenty-four of these from `:root`; this one
      survived because it sits in a **rule body**, and the test written to stop
      exactly this only read the token block.
- [x] **12h.2c Every button in the app was 3px taller than the app said it
      was.** `--spacing-control` is 38px, DESIGN.md §6 says a button is 38px,
      `button.tsx`'s own comment says "same 38px min height" — and every button
      rendered **41**. `min-height` is a floor: 9 + 9 of padding around a
      14px/1.5 line box (21px) plus 2px of border is 41, so the floor never
      applied. The legacy `.button` rule had identical arithmetic, which is why
      the transcription was faithful to the stylesheet and wrong about the
      token. `py-2.25` → `py-1.5` makes the natural height 35 and lets
      `min-h-control` govern. `small` had the same fault (33 against a declared
      30) and took the same correction.
      Buttons stay a **minimum**, not a fixed `h-control`: a label long enough
      to wrap is supposed to grow the control.
- [x] **12h.2d An input and a select, side by side, a pixel apart.** 39 against
      38, because a `<select>`'s line box is `normal` while an input's inherits
      1.5. `py-2` → `py-1.5` on both — which changes nothing a select renders
      and everything about whether the two recipes can drift again. `modal.md`
      asks for "same input height" in writing, which is how this surfaced.
- [x] **12h.2e `EmptyState` was the last consumer of the legacy `.button`.**
      It built `` `button button--${primary ? …}` `` by interpolation, so it
      rendered 41px, and **§7's guardrail could not see it**: `grep '<button'`
      finds elements, and this is an `<a>` whose class never appears as a
      literal string. Now on `buttonClass`, with `mt-4` carried explicitly
      because the gap had been coming from `.empty .button { margin-top }` — a
      descendant rule keyed on the class that just changed, the same trap
      §10.4.3b hit.
- [x] **12h.2f The shared `Dialog` attached no listeners at all.** The effect
      holding `cancel`, `close` and the new `mousedown` had `[]` deps and ran
      **before the portal mounted**, so `dialogRef.current` was `null` and it
      returned early — and never ran again. Escape still *looked* like it
      worked, because a native `<dialog>` closes itself; but `open` stayed
      `true`, so the next press of the trigger set state to a value it already
      held, no effect re-ran, and **no dialog in this app could be reopened for
      the life of the page.** Ten call sites, shipped, invisible to
      `typecheck`, `lint` and 245 tests. `[mounted]` is the dependency.
      Found by clicking it.
- [x] **12h.2g A closed dialog was being laid out.** `grid grid-rows-[…]` on
      the `<dialog>` beats the UA's `dialog:not([open]) { display: none }` on
      cascade origin, so every closed dialog was a 620px box at the end of
      `<body>` — invisible only because it renders no children while closed,
      which is luck. `not-open:hidden`.

### 12h.3 Left open, deliberately

- [ ] **12h.3a The legacy `.button` block is now provably dead — but do not
      just delete it.** After 12h.2e, `document.querySelectorAll(".button")`
      returns **0 across every route walked**. The base rule plus its four
      variants and eight container-scoped overrides are ~100 lines that
      `legacy.css` could lose.
      **The reason to stop and read them first:** three of those overrides
      encode responsive behaviour that `buttonClass` does **not** reproduce, so
      they are not dead code — they are a record of behaviour the §3.1 rollout
      silently dropped:
      | Rule | What it did | Now |
      |---|---|---|
      | `.entry__actions .button` | `width: 100%`, `min-height: 44px` on the sign-in action | 38px, content width |
      | `.form-actions .button`, `.submit-bar .button` (≤720px) | full-width actions on a phone | inline |
      | `.pagination__controls .button` (≤720px) | `flex: 1`, equal-width pager | content width |
      Port the behaviour onto `buttonClass` (or onto the three call sites) and
      *then* delete the block. Deleting first bakes the regression in and
      destroys the only evidence of it.
- [ ] **12h.3b 129 `font-size` literals in `legacy.css` restate ramp values
      instead of referencing them.** 12px ×40, 13px ×36, 11px ×13, 14px ×11 —
      every one of them equals a `--text-*` step today, which is why nothing
      looks wrong. §12.3 did this for the navigation and proved it moves
      leading as well as size, so this is a real pass and not a find-replace.
      It is drift *risk*, not drift, which is why it is here and not in 12h.2.
- [ ] **12h.3c A vertical hairline between the two term selects**, as the
      reference image draws it. Not built: DESIGN.md §5 gives borders
      structural work, and two labelled controls in a row are already separated
      by their labels and the gap. Say the word and it is one class.

---

## 13. Component inventory — what exists, and what is left

The one table to check before adding anything. **A second component for a
pattern that already has one is the defect** (§11.6), so "exists" here is a
refusal, not just a status.

Measured on the working tree, 2026-09-11. *Importers* is files importing the
module, which is the honest measure of a rollout — a component with one
importer is a component that has not landed yet, whatever its own file says.

### 13.1 Built and rolled out

| Pattern | Where | Importers | State |
|---|---|---|---|
| **Button** | `ui/button.tsx` (`buttonClass`) | 36 | **done** (§3.1). 5 raw `<button>`s left, all deliberate. 38px since 12h.2c |
| **Fields · choices · questions · sections** | `ui/form.tsx` — `Field` `Select` `Textarea` `FieldRow` `FieldLabel` `Choice` `ChoiceList` `ScaleList` `Question` `OwnItem` `FormSection` `Label` | 29 | **done** (§3.2). `.field`/`.choice`/`.textarea-field` at zero |
| **Stamps and badges** | `ui/status.tsx` — `Stamp` + `ValidityBadge` `CreditBadge` `PriorityBadge` `CycleStateBadge` `Category` | 8 | **done** (§3.3). Word + shape + tone; `Tone` is `green\|amber\|red\|neutral` (D-C) |
| **Dialog** | `ui/dialog.tsx` | 10 | **done**. Native `<dialog>`, portalled, focus returns, ×, Escape, click-outside (12h.1d) |
| **Icons** | `ui/icons.tsx` | 26 | **done**. 35 glyphs; only `IconClose` may stand without a word |
| **Breadcrumbs** | `ui/surface.tsx` + `layout/app-shell.tsx` | every staff route | **done** (12e.1, 12f.2). Last crumb derived from the active tab |
| **Shell · rail · tabs** | `layout/workspace-shell.tsx` · `rail.tsx` · `rail-toggle.tsx` · `sub-nav.tsx` · `app-shell.tsx` | 19 | **done** (§12, 12a–12g). One rail, one tab bar, never nested |
| **Nav count badge** | `layout/nav-count.tsx` | 2 | **done** (§12.6). One rule, two grounds |
| **Required mark** | `ui/required-mark.tsx` | 8 | **done** (§10.4.4). Glyph + `visually-hidden` word + `required` |
| **Info tip** | `ui/info-tip.tsx` | 2 | **done** (§10.4.8.1). Hover *and* click/Enter, exclusive, no JS |
| **Alert · EmptyState · AccessDenied** | `ui/feedback.tsx` | `Alert` 46 sites | **done**. `EmptyState` moved onto `buttonClass` in 12h.2e |
| **Long text** | `ui/long-text.tsx` | 2 | **done** |
| **Create-course modal** | `staff/create-course-dialog.tsx` | 1 | **done** (12h.1) |
| **Skeletons** | `ui/skeleton.tsx` + `ui/shell-frame.tsx` | 13 `loading.tsx` | **done** (§5.2, 12i.1). Per-route shapes, gated by `tests/unit/skeleton.test.tsx` |
| **Spinner** | `ui/spinner.tsx` | `SubmitButton` | **done** (12i.2). DESIGN.md §9 amended, not broken |
| **Announcer** | `ui/announcer.tsx` | the shell, once | **done** (§5.4). Speaks `?ok=`/`?error=` politely |
| **Route boundaries** | `app/error.tsx` · `not-found.tsx` · `app/teach/{error,not-found}.tsx` | 4 | **done** (§5.3) |

### 13.2 Built, not finished rolling out

| Pattern | Where | Coverage | What is left |
|---|---|---|---|
| **`Tag` / `TagList`** | `ui/tag.tsx` | 3 `TagList` sites; `MetaList` still has **17** importers | §10.2's open decision: convert `MetaList` wholesale, or keep both deliberately. 10.6.3 (week as a tag) is blocked on it |
| **`SubmitButton`** | `ui/submit-button.tsx` | **7 of 54 forms** | §5.1. The named priority screens — weekly-form submit, publish/schedule, private response — are still unwired |
| *(route skeletons and error boundaries moved to §13.1 — done 2026-09-11)* | | | |

### 13.3 Not built

| Pattern | Verdict | Blocked on |
|---|---|---|
| **`ConfirmDialog`** | **build** | §11.2b; §5.9 depends on it |
| **`Table` / `Th` / `Td`** | **build** — 7 raw `<table>`s on `.data-table`, no responsive rule | §5.7's one-pattern decision |
| **`FormErrorSummary`** | **build** | §5.8 |
| **Toggle switch** | **owner choice** — A (styled checkbox, nothing to build), B (segmented), C (switch) | §11.1 |
| **Segmented control** | build **if 11.1B** | §11.1 |
| **Date-time control** | **build** — one control per boundary, stacked | §10.4.5 |
| **Rating / scale display** | **design first** | §10.6.2 |
| **Row action menu (`⋮`)** | **blocked, and not on design** | `forms/templates.ts` exposes no duplicate/close/delete/archive operation — the menu would advertise actions that fail (12e §7, 12f.7) |
| **Progress meter** | **hold** | student-facing participation is approved schema-only |
| **Toast / snackbar** | **no** | a message that disappears is one a screen-reader user misses. `Alert` in place + §5.4 |
| **Avatar / identity chip** | **never** | students are anonymous to each other |
| **Card grid · pills** | **forbidden** | DESIGN.md §11.1, §5 |
| **Spinner** | **built 2026-09-11** — see §13.1 | the no-spinner rule was amended, not ignored (DESIGN.md §9) |
| **Second tabs / accordion / popover / tooltip** | **exists** | `SubNav` · `Disclose` · `FilterMenu` · `InfoTip` |

### 13.4 The rule this table exists to enforce

Before adding a component: find its row. **If it has one, the work is coverage,
not creation** — and §11.6's contract applies to whatever you do add
(`ui/` folder, utilities and `cn()` only, tokens only, keyboard-operable,
working before hydration, never state by colour alone, and its name into
[DESIGN.md](DESIGN.md) §13 in the same commit).

---

## 12i. Skeletons that follow the page, and spinners — 2026-09-11

Owner ask, twice: *"for skeleton component improve it in such a way that it
follows the layout of the current page"* and *"Add spinner components as well."*

### 12i.1 The skeleton became a component instead of a shape

- [x] **12i.1a One shape for 26 routes became twelve shapes for twelve routes.**
      §5.2 in full — see that item for the detail. The short version: the old
      `.skeleton` was five bars in a centred 52ch sheet, so a navigation to the
      participation matrix and a navigation to a form editor looked identical
      and neither looked like its destination.
- [x] **12i.1b `ShellFrame` is the part that makes "follows the layout" true.**
      `AppShell` is rendered by each **page**, not by a layout, so a
      `loading.tsx` replaces the page *and its shell*. Every slow navigation
      would otherwise blank the top bar and the rail and paint them back.
      The frame draws them for real and **never pulses** them: they are not
      waiting for anything, and animating them would say otherwise.
      *One limitation, stated rather than hidden:* it cannot read the rail's
      collapsed cookie — a Suspense fallback renders synchronously and cannot
      `await cookies()`, and a client component that read it would flash for
      everyone — so the rail is drawn expanded. A reader who collapsed it sees
      176px more rail for the length of one query.
- [x] **12i.1c The rail placeholder carries `ws-rail`, so the fence holds.**
      `--color-rail-*` is legal only inside `.ws-rail` / `.ws-drawer__panel`
      (D-E, "the two grounds never mix"). This genuinely *is* the rail, so it
      takes the class rather than the fence taking an exception.
- [x] **12i.1d The shape is asserted, not eyeballed.**
      `tests/unit/skeleton.test.tsx`, 18 tests. A `loading.tsx` takes no props
      and reads no data — that is what a Suspense fallback *is* — so it renders
      to a string, and each one is checked against the page it precedes: five
      columns before the five-column forms table, eight before the
      participation matrix, **no tab bar** before the nested form editor
      (§12d.6), `min-h-control` on the responses selectors so the list below
      them starts where it will actually start.
      *Why a test and not a screenshot:* a skeleton fails **silently**. Four
      columns before a five-column table looks perfectly fine on its own; the
      fault exists only in the transition, which nobody re-checks after editing
      a page. Proven by changing a column count and watching it fail.

### 12i.2 Spinners, and the rule that had to move

- [x] **12i.2a `Spinner` and `SpinnerBlock` exist, and DESIGN.md §9 is amended
      rather than contradicted.** §9 said "never a spinner" and §11.5 listed one
      as *forbidden*. Both were **[Recommended]** verdicts of mine; the owner
      asked for spinners, which outranks them (§10 preamble). Quietly shipping a
      component the design document forbids is the failure mode that cost this
      project a month of a button being 3px off its declared height — so the
      document moved, in writing, and the objection survives as the line:
      | The wait | What it gets |
      |---|---|
      | shape is **known** — a route, a list, a table | a **skeleton** |
      | shape is **unpredictable** — a submit in flight, an export | a **spinner** |
      Three rules came with it: never where a skeleton fits; never alone (always
      beside a word, or carrying one for assistive technology, because motion is
      not a message); static under `prefers-reduced-motion`, where the track
      circle makes it read as a ring marking the place.
- [x] **12i.2b It is paired with `SubmitButton`'s relabel, not chosen against
      it.** `submit-button.tsx` used to argue *against* a spinner — "a spinner
      alone would say something is happening without saying what" — and that
      note is exactly why the two now sit together: the glyph is the
      **immediate** acknowledgement, visible in the same frame as the click,
      and the new label ("Creating…") carries the **meaning**.
      *Verified in the running app:* mid-submit the button is disabled, reads
      "Creating…", and holds an `svg` whose computed `animation-name` is `spin`.
- [x] **12i.2c `SpinnerBlock` is the one place a spinner may occupy a region**,
      and it earns that only by naming what it is waiting for. If the shape of
      what is coming can be named, it is the wrong component.

---

## 12j. Heading scale, tab weight, and where maroon goes — 2026-09-11

Three owner asks against a screenshot of the course header.

- [x] **12j.1 The page title is one step larger.** `.page-title` moved from
      `--text-title` (24–30px) to `--text-headline` (26–34px) — a **step on the
      ramp**, not a nudge, so the tracking and leading move with the size
      instead of being left at the old step's numbers. It also stops typing its
      own `clamp()` and references the token.
      `--text-headline` was already the entry screen's `h1`, which is the right
      pairing: both are the largest thing on their page, so the app now has one
      answer to "how big is the subject of this page" rather than two.
      *Measured:* 30px → **34px** at 1440.
- [x] **12j.2 The tabs are larger, bolder, and their underline is thicker.**
      | | Was | Now |
      |---|---|---|
      | size | 13px (`--text-ui-sm`) | **14px** (`--text-ui`) |
      | weight at rest | 400 — the same as body prose | **500** |
      | weight active | 600 | **700** |
      | underline | 2px | **3px** |
      The underline is the only place the active tab's maroon appears as a
      **fill** rather than as text, so its thickness is how much maroon the bar
      actually shows — at 2px it was a hairline carrying the colour.
      At rest 500 matters too: a row of 400-weight destinations read as a
      sentence rather than as controls. With the rest of the strip at 500 the
      active tab now clears it by **two** weight steps instead of one, so it is
      not leaning on colour to be found.
      *`More` moved with them*, because it stands in that row — and the fact
      that it is a **second rule that has to be edited in lockstep** is noted at
      both selectors as a §4.5 item. One control, drawn twice.
- [x] **12j.3 A misconception fell out of the resize, and it had been there
      from the start.** `.ws-subnav__item`'s padding carried "an OPTICAL
      asymmetry… 1px more above than below so the label sits centred over the
      2px underline". That reasons about a normal-flow box. This is
      `display: flex; align-items: center` with `min-height: var(--h-bar)` and
      `box-sizing: border-box`, and the arithmetic comes out the other way:
      ```
        45 = padTop + contentH + padBottom     (48px box, less the 3px rule)
        glyph centre  = top + padTop + contentH / 2
        target centre = top + 45 / 2
        ⇒ padTop = padBottom
      ```
      So **any** asymmetry pushes the label away from centre by half of it. The
      old 10/9 sat the label 0.5px low, which is why nobody saw it; at 10/8 with
      the new rule it was a visible 1px. Symmetric `9px` lands it on **0.00px**.
      `More` keeps a 1px asymmetry and that one is real — it carries a 1px
      **top** border the tabs do not (it needs one to become a welded white tab
      when open, 12d.3), so the same algebra gives `padBottom = padTop + 1`.
      *Verified:* all five labels share a baseline at 279.91px, to the
      hundredth of a pixel.
- [x] **12j.4 More maroon: the product mark, and a rule for the rest.**
      > *"i kinda want to add more maroon colors to the overall site? but i dont
      > know where"*
      The `cf` square in the top bar was `--ink`, a dark grey placeholder. It is
      now `--red-deep` — the official UP Maroon, paper on it at **10.9:1** — and
      it matches the owner's own reference mockup, where that square is maroon.
      **It is the safest place in the app for the colour, and the reason is
      structural rather than aesthetic:** a product mark carries **no state**.
      It is identical on every page in every condition, so it cannot be read as
      a status, and it is the one element a reader sees on *every single page* —
      the most maroon for the least risk. `ShellFrame` was drawing the same mark
      in green, so a slow navigation flashed the wrong brand; it matches now.
      **The rule, written into [DESIGN.md](DESIGN.md) §3 so the next addition
      does not need this conversation again.** Maroon means **identity and
      orientation** — which system this is, and where you are in it. Green
      means **action**. The test for any candidate:
      | Ask | Then |
      |---|---|
      | does it carry **state**? | **no maroon** — it competes with the problem signal |
      | is it an **action**? | **no maroon** — action is the green accent (D-D) |
      | is it **identity**, or **where you are**? | maroon is available |
      *One trap recorded because it looks like an opportunity:* `.post`'s 3px
      left edge. It is the obvious next place for a maroon batten and it is
      **status** — "unread", "waiting" — so maroon there would collide with
      exactly the reading the rule protects.

- [ ] **12j.5 The remaining maroon candidates, for an owner pick.** Each passes
      the identity/orientation test above; none is built, because repainting
      chrome is a decision rather than a detail.
      | Candidate | What it would buy | Cost / risk |
      |---|---|---|
      | **The rail's active-row batten** (now `--rail-focus`, pale green) | "where you are" would be maroon in *both* navigation levels, rail and tabs — one colour, one meaning | needs a **new rail-fenced token**: `--red` is 1.6:1 on the `#123a28` ground and would vanish. A light maroon has to be derived and measured, and it then sits next to the rail's green focus ring |
      | **The `TD` avatar square** in the top bar | pairs with the `cf` mark; both are identity | two maroon squares in one 52px bar may read as a brand block rather than as two facts |
      | **The rail's own ground** | the boldest option, and the most UP | **rejected unless asked**: D-E measured all ten `--rail-*` tokens against `#123a28`, and changing the ground invalidates every one of them. A day's work to re-derive, for a hue a reader cannot name |
      | **`page-head`'s bottom rule** — a maroon hairline under the heading block | ties the heading to its tabs and frames the page's identity | it is a *border*, and DESIGN.md §5 gives borders structural work; a coloured one starts to read as a state |
      *Recommendation:* the **rail batten** first — it is the only one that makes
      maroon mean something more consistently rather than just appear more
      often. Say the word and the token gets derived and measured like D-E's ten.

---

## 12k. A refused field reads as refused — 2026-09-11

> *"can u make the red color when trying to submit a form that is unfulfilled or
> anything about errors"*

**The answer turned out to be worse than "there is no red".** Measured before
touching anything: press **Create course** with the code blank, and the field's
border is `rgb(11, 90, 51)` — `--color-accent`. **The field that blocked the
submission was painted in the colour that means *action* everywhere else in the
app.** The browser focuses the control it refuses to submit, and the focus
treatment outranked the invalid one.

- [x] **12k.1 `:user-invalid`, and not `:invalid`.** The distinction is the
      whole reason this is safe to add: `:invalid` matches an empty required
      field from the moment the page loads, so styling it would paint a pristine
      form red before the reader has typed anything. `:user-invalid` matches
      only after they have interacted with the field or tried to submit — the
      browser tracks that, which is why this needs no JavaScript and no
      "touched" state of our own.
      *Verified in the browser, all four states:* pristine `--control-edge`
      grey → blocked submit `--red` border on `--red-tint` → after typing a
      valid value, back to the accent → cleared again, red again.
- [x] **12k.2 It had to win on SPECIFICITY, not on source order.** Because the
      browser focuses the refused field, `focus:border-accent` was still
      applying. Tailwind sorts utilities by its own internal order, so "put it
      later in the string" is not a fix — the classes are stacked instead
      (`focus:user-invalid:border-red`), which compiles to two pseudo-classes
      against `:focus`'s one and therefore wins deterministically. The same
      pair was added for `aria-invalid`, which had the identical latent fault
      against `:focus`.
- [x] **12k.3 A refused GROUP now reads red too, and this was the real gap on
      the student form.** `aria-invalid` lands on the `ChoiceList` / `ScaleList`
      wrapper rather than on any one radio, because the fault is "this question
      is unanswered" and not "that option is wrong" — so the red had to travel
      from the group to its options. Until now a rejected **text field** turned
      red and a rejected **radio group** did not: the weekly form showed red
      error text above a set of controls that still looked perfectly fine.
      It deliberately outranks a chosen option's accent edge
      (`[aria-invalid] > label` is one element more specific than the child's
      own `:has()` rule), which is the wanted reading: when a group is refused,
      the ANSWER is wrong, so the option that was picked should not still look
      approved.
      *Verified on the student weekly form, submitted empty:* two invalid
      groups, their options at `--red` on `--red-tint`; the textarea the same;
      `field-error` text at `--red-deep`; the banner `role="alert"`.
- [x] **12k.4 The regression is gated.** `design:check` now opens the
      create-course dialog, submits it empty, and fails if the blocked field is
      not in the red family — *and* fails if an untouched field is already red,
      which is the opposite mistake (`:invalid` styled where `:user-invalid` was
      meant). Proven by deleting the fix and watching it report
      `is rgb(11, 90, 51), not the red family`.
      Nothing static could have caught this: it is two variants at equal
      specificity, resolved only after a click.

**Two findings from the same sweep, deliberately not changed.**

- [ ] **12k.5 The focus wash ring on a text control is dead code.** `form.tsx`
      carries `focus:shadow-[0_0_0_3px_var(--color-accent-wash)]` followed by
      `focus-visible:shadow-none`, and its comment describes the intent at
      length: *"pointer focus shifts the border and adds a soft 3px wash ring,
      while KEYBOARD focus keeps the global 3px outline and the ring steps
      aside… they disagree on purpose"*. **That distinction never happens.**
      Browsers match `:focus-visible` on *any* focused text input regardless of
      how it was focused, so `shadow-none` always wins and the wash ring is
      never drawn — measured as `rgba(0, 0, 0, 0) 0px 0px 0px 0px` on a
      mouse-clicked field. Either delete the pair and let the border carry
      focus (which is what actually happens today), or move the ring to a
      selector `:focus-visible` cannot cancel. **Do not "fix" it by deleting
      `focus-visible:shadow-none` alone** — that would put the wash ring under
      the global outline for keyboard users, which is the stacking the comment
      was right to prevent.
- [ ] **12k.6 A radio's dot stays green inside a refused group.** `Choice`'s
      inner input is `accent-accent`, so the selected option in an
      `aria-invalid` group shows a green dot inside a red-edged, red-tinted
      label. Arguably correct — the dot says *what you picked*, the red says
      *the answer was refused* — and arguably a mixed signal. One class
      (`aria-invalid:[&_input]:accent-red`) either way; it needs a look rather
      than a guess.

---

## 12l. The search bar's focus ring, and §5.1 finished — 2026-09-11

- [x] **12l.1 The search bar drew its ring INSIDE its own box.**
      > *"fix search bar focus outline"*
      `.feedbar__search` is a composite: a 38px bordered, rounded box holding an
      icon and a **bare** input (`border: 0; background: none`). The global
      `:focus-visible` rule applied to that inner input, so focusing the search
      drew a 3px ring around the **23px text area** — inside the box's own
      border, which was simultaneously turning accent-green. Two concentric
      green rings with the placeholder squeezed between them.
      **The ring is moved, not removed**, which is the distinction DESIGN.md
      §10's "the ring is never removed" actually protects: the element a reader
      perceives as the control is the box, so the box gets the ring, and the
      input inside is an implementation detail of the composite that must not
      draw a second indicator for one focus.
      `:has(input:focus-visible)` rather than `:focus-within` — the border
      already changes on `:focus-within` and that is the pointer treatment,
      while the ring follows the same `:focus-visible` semantics as every other
      control in the app. Two states, kept separate on purpose.
      *Verified:* wrapper outline `3px rgb(1, 68, 33)`, inner input
      `outline-style: none`, and the before/after screenshots show one ring
      where there were two.
- [x] **12l.2 `.ws-search input:focus-visible` was dead and is deleted.**
      Every declaration in it — `outline-width: 3px`, `outline-offset: 2px`,
      `border-radius: var(--r-control)` — restated the global `:focus-visible`
      rule exactly. Its comment claimed it narrowed the ring "to the input, not
      the whole strip", which was already true without it: nothing ever ringed
      the strip. *Verified by reading the input's computed outline before and
      after the deletion: identical.*
      The ring **stays on the input** here, and that remains right: unlike
      `.feedbar__search`, this strip is a full-width band with no box of its
      own, so ringing it would be the "heavy box around the entire control" the
      original comment was guarding against. The search icon sitting outside
      the ring is a known consequence, accepted when the strip was designed.
- [x] **12l.3 §5.1 is finished: `SubmitButton` at 15 files, from 7.**
      **24 mutation submits converted** across publications (4), backlog (5),
      the form page (7), an occurrence (2), course staff (2), class lists (1),
      TA permissions (1) and the sign-in screen (2). Each got a `pendingLabel`
      naming its own action — "Publishing…", "Closing…", "Skipping…",
      "Restoring…", "Removing…", "Redirecting…" — rather than a generic
      "Loading", because the point of the relabel is to say *what* is happening.
      Now that `SubmitButton` carries a spinner (§12i.2b), every one of these
      also gets the immediate glyph.
      *Six submits deliberately left on `buttonClass`:* the admin search (a GET
      filter, not a mutation), the admin role toggle (a dynamic `variant`
      expression with a comment inside it — converting it mechanically risked
      mangling the ternary, and it is one hand edit), and the four inside
      `Dialog`/`data.tsx`/the shell, which are chrome rather than mutations.
      *Verified mid-flight in the running app:* "Add section" →
      `{"label":"Adding…","disabled":true,"spinner":true,"animation":"spin"}`,
      then a successful outcome. Every converted route re-checked for a 200 and
      a clean console.
- [x] **12l.4 A process note, because it cost time.** I ran
      `npx prettier --write` over the converted globs before checking whether
      this repo is prettier-formatted. **It is not** — there is no prettier
      config and no `format` script, and 47 other files under `src/` disagree
      with prettier's defaults. The damage was smaller than it looked (exactly
      **one** file's diff was pure reformatting, and it was reverted; the rest
      of the churn was genuine work from this branch), but the rule stands:
      **do not run a formatter this repo has not adopted.** Five `buttonClass`
      imports left unused by the conversion were removed, which is what took
      lint from clean → 5 warnings → clean.

---

## 12m. Pre-PR verification — 2026-09-11

Run before drafting the PR, to answer one question: does any of this cause
trouble? **Nine checks; the product is clean, and two real problems were found
in the repository around it.**

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` (unit) | **267 passed** |
| `npm run test:integration` | **436 passed**, 24 files |
| `npm run build` | compiled |
| `npm run design:check` | 7 routes, 158 controls, every invariant holds |
| `scripts/qa/crawl.mjs`, both roles | **55 routes, 0 problems** — no non-200, no thrown error, no horizontal overflow, no console error |
| `scripts/qa/a11y.mjs`, all 55 routes | **0 issue groups** — no nameless control, no heading break, no missing landmark, no unlabelled field, no contrast failure |
| migrations from an empty database | all 8 applied, seed ran, `DROP COLUMN` rollback verified |

- [x] **12m.1 The integration suite was the real risk, and it needed a step
      nobody would guess.** It runs against a **separate** database (port 5433,
      `feedback_test`) with no automatic migration, so `courses.term` did not
      exist there and **426 of 436 tests failed** with
      `column "term" of relation "courses" does not exist`. The step is
      documented in the README and is not a defect — but it is invisible until
      you hit it, so **the PR description must say it**:
      ```sh
      DATABASE_URL=postgres://feedback:feedback@localhost:5433/feedback_test npm run db:migrate
      ```
      All 436 pass after it.
- [x] **12m.2 The from-zero path was verified on a throwaway database, not by
      resetting anyone's dev data.** `feedback_verify` created empty → all 8
      migrations applied → `db:seed` ran → `courses.term` is `text`, nullable →
      seeded courses carry `term: null`, so **a freshly seeded app exercises the
      fallback path**, which is the state that had to keep working →
      `ALTER TABLE "courses" DROP COLUMN "term"` succeeded, proving the rollback
      the migration's header claims. Database dropped afterwards.
- [x] **12m.3 `scripts/verify/http-matrix.sh` reports 16 failures, and none is
      a regression from this work.** Worth the detail, because "16 failures"
      reads alarming:
      - **3 were my own doing and are fixed.** The crawl visits
        `/teach/sections/:id/review`, and `MarkReadOnView` marks posts read *on
        view* — so crawling consumed the matrix's "a freshly seeded week starts
        unread" precondition. Cleared the two `response_reads` rows; those three
        pass again. **The matrix and the crawler cannot be run in that order**,
        which is worth knowing before anyone trusts a red result.
      - **The other 13 are assertions older than this branch.** The decisive
        one: the matrix asserts `GET /teach/sections/:id/setup -> 200`, and that
        page was **deleted in `ed91afe`** — a commit *older* than the commit
        that added the matrix (`83a5e09`). It has never passed. Four failures
        trace to that one route.
      - The rest test markup this branch deliberately replaced — the nav
        assertion greps `ws-subnav__group-heading`, a class §12b.1 deleted when
        the vertical sub-nav column became a horizontal tab bar — or match
        brittle strings (`>Mark as read<`, which the script's own comment
        already flags as fragile one line below), or are page-1-only against an
        audit log the matrix itself lengthens by running exports.
- [x] **12m.4 Two privacy-sounding failures were checked by hand rather than
      reasoned about, because they had to be.**
      "audit history does not name the student who submitted" asserts the
      *presence* of the anonymised phrase `A student submitted a form`. Driven
      in a browser across three pages: **present on page 2, and no page contains
      `student@up.edu.ph`.** The invariant holds; the assertion only reads page
      1, and the matrix's own 52 export rows pushed the submission rows off it.
      "responder CSV carries the whole student number" asserts a staff-only
      export *includes* the full number — the intended behaviour — and depends
      on a submitted response existing for the week it picks.
- [x] **12m.5 `.env.example` was staged as DELETED and four documents depend on
      it.** README step 1 is `cp .env.example .env`;
      `docs/engineering/development.md` calls it "the complete development
      contract". Shipping the deletion would break setup for anyone cloning the
      branch. Recovered verbatim from `HEAD` (69 lines) and restored. **If that
      deletion was deliberate, re-delete it and update those four references —
      but it should not go out silently.**
- [x] **12m.6 This file linked to six documents that do not exist.** The
      owner-supplied specs (`sidebar.md`, `modal.md`, `changes.md`,
      `form-table.md`, and the annotated PNGs) are provided per round and not
      kept in the repository, so every link to them was dead, plus one wrong
      relative path of my own (`../AGENTS.md` from a file at the repo root).
      They are now plain names with a note at the top saying why, so the
      requirement each one carried stays quoted in the section that implemented
      it — which was always the durable record.

- [ ] **12m.7 Update or retire `scripts/verify/http-matrix.sh`.** It is a
      verification script rather than product code, so it blocks nothing — but a
      checked-in script that has never passed is worse than no script: the next
      person reads 16 failures and cannot tell which matter. Three things it
      needs: drop the four `/setup` assertions (the route is gone), re-point the
      nav assertion at the tab bar that replaced the column, and make the audit
      assertions page-independent. Also record that it must run **before** the
      crawler, or state-consuming checks fail for the wrong reason.
