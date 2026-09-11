---
name: Class Feedback
description: A university weekly-feedback workspace built like a departmental noticeboard — typed notices on a matte board, stamped, dated, and never rounded into cards.
colors:
  board: "#f1f0ee"
  board-deep: "#e8e7e4"
  paper: "#ffffff"
  paper-quiet: "#f8f7f5"
  ink: "#1c1e20"
  ink-soft: "#474b4e"
  ink-muted: "#676c70"
  ink-faint: "#8b9095"
  rule: "#e2e0dd"
  rule-strong: "#c9c6c2"
  rule-ink: "#9b9893"
  accent: "#1c5f63"
  accent-deep: "#164c50"
  accent-wash: "#e5eeef"
  accent-edge: "#b9d2d4"
  amber: "#8a5a12"
  amber-deep: "#6e470e"
  amber-wash: "#f6ecd8"
  amber-edge: "#e0cda4"
  red: "#9c3b30"
  red-deep: "#7d2f26"
  red-wash: "#f6e4e1"
  red-edge: "#e0b8b2"
  focus: "#164c50"
typography:
  document:
    fontFamily: "var(--font-document), Charter, 'Bitstream Charter', 'Iowan Old Style', Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  title:
    fontFamily: "var(--font-document), Charter, Georgia, serif"
    fontSize: "clamp(24px, 2.4vw, 30px)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.012em"
  subtitle:
    fontFamily: "var(--font-document), Charter, Georgia, serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.008em"
  interface:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  strip:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.09em"
  stamp:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.06em"
  object-title:
    fontFamily: "var(--font-document), Charter, Georgia, serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.28
    letterSpacing: "-0.01em"
  question-prompt:
    fontFamily: "var(--font-document), Charter, Georgia, serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "normal"
  document-staff:
    fontFamily: "var(--font-document), Charter, Georgia, serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  document-dense:
    fontFamily: "var(--font-document), Charter, Georgia, serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "normal"
  interface-small:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  metadata:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  entry-headline:
    fontFamily: "var(--font-document), Charter, Georgia, serif"
    fontSize: "clamp(26px, 3.2vw, 34px)"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.015em"
rounded:
  none: "0"
  control: "6px"
  stamp: "5px"
  panel: "12px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "9px 16px"
    height: "38px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    borderColor: "{colors.rule-strong}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
    height: "38px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.control}"
    height: "38px"
  button-danger:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.red-deep}"
    borderColor: "{colors.red-edge}"
    rounded: "{rounded.control}"
    height: "38px"
  notice:
    backgroundColor: "{colors.paper}"
    borderColor: "{colors.rule}"
    rounded: "{rounded.none}"
    padding: "24px"
  field:
    backgroundColor: "{colors.paper}"
    borderColor: "{colors.rule-strong}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    height: "38px"
  stamp-positive:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.accent-deep}"
    borderColor: "{colors.accent-edge}"
    rounded: "{rounded.stamp}"
    padding: "3px 7px"
  stamp-attention:
    backgroundColor: "{colors.amber-wash}"
    textColor: "{colors.amber-deep}"
    borderColor: "{colors.amber-edge}"
    rounded: "{rounded.stamp}"
    padding: "3px 7px"
  stamp-critical:
    backgroundColor: "{colors.red-wash}"
    textColor: "{colors.red-deep}"
    borderColor: "{colors.red-edge}"
    rounded: "{rounded.stamp}"
    padding: "3px 7px"
  stamp-neutral:
    backgroundColor: "{colors.paper-quiet}"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.rule-strong}"
    rounded: "{rounded.stamp}"
    padding: "3px 7px"
  rail-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.control}"
    padding: "6px 8px"
  rail-item-active:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.accent-deep}"
  brand-mark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
  disclose:
    backgroundColor: "{colors.paper}"
    borderColor: "{colors.rule}"
    rounded: "{rounded.none}"
    padding: "16px"
  topbar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    borderColor: "{colors.rule-strong}"
    height: "52px"
---

# Design context: Class Feedback

This document is the design authority for the interface. Product truth lives in
[PRODUCT.md](PRODUCT.md) and [AGENTS.md](AGENTS.md); this file never overrides a
privacy rule, an authorization rule, or the MVP boundary.

---

## 1. Visual personality

**The departmental noticeboard.**

Every university department has one: a matte board in a corridor, with typed
sheets squared onto it. A notice is a flat rectangle of paper, not a floating
card. It carries a small printed header — who posted it, when, and when it comes
down. Status arrives as a stamp, in words. An unsigned notice is completely
normal there, which is exactly this product's hardest promise: **anonymity is
ordinary on a noticeboard, not suspicious.**

The board gives the interface five things it actually needs:

| Board fact | What it becomes |
|---|---|
| A notice is a flat sheet squared to the board | Panels are hard-cornered white sheets on a matte ground. No rounded cards, no shadows, no floating. |
| Every notice is dated and carries a takedown date | Time is the first line of every object: opened, closes, submitted, published. |
| Status is a rubber stamp | Status is a bordered word — text **and** shape **and** colour, never colour alone. |
| The board is divided by battens with printed strip labels | Grouping is a hairline rule with a small tracked-caps label, not another container. |
| Notices are *typed*; the board's labels are *printed* | Two type registers: a real serif for text a human wrote, the platform sans for anything the system says. |

That last rule is the concept, and it does privacy work. A student's original
wording, a private reply, a published answer — all set in Charter. Every label,
count, control, filter and stamp — platform sans. On a staff screen you can tell
authored text from machine text without reading a word, which is what keeps a
reworded public version from ever being mistaken for the original.

**It is calm because the board is calm.** Ink on paper on board, one
one deep blue-green accent, and two signal colours held in reserve. Nothing glows,
nothing gradients, nothing floats.

### The rut this refuses

The category default is a sidebar-plus-rounded-card dashboard with pill badges
and a coloured brand bar; its predictable opposite is a black terminal. Neither
is on the board. Specifically **forbidden** — see §11 for the full list — are
purple gradients, glassmorphism, uniform card grids, status-chip soup, and any
arrangement that reads as Ed Discussion with the logo removed.

---

## 2. Typography

Two registers, one job each. Nothing else is added.

**Two families is the ceiling, confirmed by the owner on 2026-09-11** ("2 fonts
max"), which the two registers below already satisfy — one self-hosted serif
plus the platform sans. A third family is a regression, not an addition. The
count was never the complaint; **placement** was: chrome had been set in the
document register, which is what made the navigation read as an unfamiliar
serif. The rule that fixes it is the "Never for" list below, and it is now
enforced rather than advisory.

### Document register — Charter

`--font-document` → XCharter, self-hosted, Latin subset, three faces (Roman,
Bold, Italic), ~60 KB total. Falls back to `Charter, 'Bitstream Charter',
'Iowan Old Style', Georgia, serif`. Licence and provenance:
[src/app/fonts/LICENSE.md](src/app/fonts/LICENSE.md).

Charter was drawn for the low-resolution laser printers that produced
departmental handouts. It is the paper in this metaphor, and it is used **only**
for:

- page titles and panel titles;
- text a human wrote: the student's original message, private replies, public
  questions and answers, backlog question text, teacher notes on a stamp;
- the sanitized output of the rich-text renderer (`.rich-text`) — a teacher's
  markdown prompt is authored text like any other, so it inherits the register.
  Its tables and code blocks step back to the sans and mono faces, because a
  table of numbers is data, not prose;
- the entry screen's one headline.

Never for: labels, counts, table headers, buttons, filters, form field labels,
navigation, stamps, timestamps, or any number.

### Interface register — platform sans

`ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
Everything the system says. No webfont, no second sans.

### Scale

All sizes land on whole pixels. Fractional sizes are a defect.

| Role | Family | Size | Weight | Line height | Tracking |
|---|---|---|---|---|---|
| Entry headline (signed-out only) | document | `clamp(26px, 3.2vw, 34px)` | 700 | 1.18 | `-0.015em` |
| Page title | document | `clamp(24px, 2.4vw, 30px)` | 700 | 1.2 | `-0.012em` |
| Object title (list detail), figure value | document | 24px | 700 | 1.28 | `-0.01em` |
| Panel title | document | 20px | 700 | 1.3 | `-0.008em` |
| Question prompt | document | 18px | 700 | 1.35 | normal |
| Authored body | document | 17px (student) / 16px (staff) | 400 | 1.6 / 1.55 | normal |
| Authored body, dense (list row, thread event) | document | 15px | 400 | 1.35 | normal |
| Interface body | sans | 14px | 400 | 1.5 | normal |
| Interface small | sans | 13px | 400 | 1.45 | normal |
| Metadata | sans | 12px | 400 | 1.4 | normal |
| Strip label | sans | 11px | 700 | 1.2 | `0.09em`, uppercase |
| Stamp | sans | 11px | 700 | 1 | `0.06em`, uppercase |

Twelve steps, every one on a whole pixel and every one in the frontmatter above,
so `impeccable detect` can hold the ramp. A new size is a change to both.

Numerals in tables, counts and timestamps use `font-variant-numeric:
tabular-nums`. Monospace appears only where the value is a stable identifier a
person may need to compare character by character, or pasted data whose columns
must line up: student numbers (`.ident`) and the roster CSV textarea
(`.textarea-field--data`).

### Measure

Any prose read end to end carries a `ch` measure: **68ch** for descriptions and
authored body text, **52ch** for empty-state copy, **34ch** for the entry
headline. Unbounded body text is a defect.

### Emphasis

Weight and size only. No gradient text, no letterspaced display, no all-caps
headings above 11px.

---

## 3. Colour roles

A neutral canvas, white paper, **one restrained accent**, two signals held in
reserve.

The accent's job is to answer "what do I click?" — so it is spent only where
that question is being asked. Every place it was doing decorative work has been
taken off it, because an accent applied to headings, containers, icons, brand
marks and chart fills stops meaning anything.

### Why this palette and not the obvious one

The first version of this system ran an **institutional green** (`#1f6b4a`) on a
matte olive ground. It read as the university rather than as the product: UP DCS
is the operating unit named in the footer, not the visual identity, and
[PRODUCT.md](PRODUCT.md) is explicit that their official identity is not binding
here. Three directions were built as the same review-inbox screen and compared
at real density:

| | Direction | Verdict |
|---|---|---|
| A | warm neutral + muted green | The incumbent identity with the volume lowered; the pale green selection wash sat uneasily on the warm ground. **Rejected** as the direction closest to UP DCS. |
| B | soft stone + deep blue-green | Distinctly not a forest green; lowest-glare ground of the three; the accent reads serious without becoming a corporate blue. **Chosen.** |
| C | light neutral + restrained ink-blue | Crispest accent semantics, but the saturated blue button and blue selection read as a generic institutional portal, and the blue wash vibrated against the neutral grey. **Rejected.** |

The deciding criterion was a long staff review session: a low-chroma ground and
a dark, desaturated accent do not fatigue across forty submissions, and nothing
on the page competes with the one control that matters.

### Ground and paper

| Token | Value | Use |
|---|---|---|
| `--board` | `#f1f0ee` | The app canvas. Warm-neutral stone, not white — a page-wide white ground glares across a long session. |
| `--board-deep` | `#e8e7e4` | Rail and list-pane ground; recessed regions; a pressed segment. |
| `--paper` | `#ffffff` | Notices, panels, detail pane, inputs, composers. |
| `--paper-quiet` | `#f8f7f5` | Quoted blocks, table header rows, disclosure summaries on hover, disabled fills. |

### Ink

| Token | Value | Use | On paper | On canvas |
|---|---|---|---|---|
| `--ink` | `#1c1e20` | Primary text. | 16.7:1 | 15.3:1 |
| `--ink-soft` | `#474b4e` | Secondary text that is still read. | 8.8:1 | 8.1:1 |
| `--ink-muted` | `#676c70` | Metadata, labels, helper text, placeholders. | 5.3:1 | 4.7:1 |
| `--ink-faint` | `#8b9095` | Non-text marks and large text only. Never body. | 3.2:1 | — |

### Rules

| Token | Value | Use |
|---|---|---|
| `--rule` | `#e2e0dd` | Default hairline: panel edges, row dividers, table rules, disclosure seams. |
| `--rule-strong` | `#c9c6c2` | Input strokes, secondary button borders, pane seams, segment borders. |
| `--rule-ink` | `#9b9893` | The one heavier rule — a 2px batten under a strip label — and chart bars. |

### The accent — UP Forest Green

Re-hued from the original deep blue-green by decision **D-D** (2026-09-10): the
app follows the university's colours, with each UP hue given exactly one job.
The structure did not change — one accent, two signals, one hex per role — and
every family gained contrast in the move.

| Token | Value | Role |
|---|---|---|
| `--accent` | `#0b5a33` | Primary button fill; the checked border of a choice; the active list-row edge. White text on it is **8.3:1**. |
| `--accent-deep` | `#014421` | Anything the accent has to *say*: links, the row-action link, the focus ring, text on `--accent-wash`, the active rail row's text. Official UP Forest Green. **11.4:1** on paper, **9.6:1** on its own wash. |
| `--accent-wash` | `#e7eeeb` | The active list row, a checked choice, the positive stamp's ground, text selection. Derived for **paper** — it is 1.05:1 on the rail's dark ground and must never be used there. |
| `--accent-edge` | `#bdd2c8` | The 1px edge of anything on the wash. |

**The accent carries exactly six things.** A primary button. A link. The active
navigation row. The focus ring. A checked choice. A positive state (the green
stamp, the public-answer quote rule). Nothing else.

It was explicitly **removed** from: the product mark in the top bar (identity is
not action — the mark is `--ink`), the student's own-question container and its
input strokes (a decorative wash), the entry screen's tick icons, and chart bar
fills. Reintroducing any of these is a regression.

### Maroon marks identity and the active tab

**[Confirmed 2026-09-11, `sidebar.md` §7/§9]** Maroon was the *problem* signal
and nothing else. It now does one more job: the **active tab** in the course tab
bar takes `--red-deep` text over a `--red` underline, and the spec names maroon
for "primary actions and active/high-priority accents".

This is a real widening and is recorded rather than left implicit, because the
reserved-signal rule below is what keeps "invalid" legible. What stops the two
readings colliding is that **a problem is never *only* maroon**: every status in
this app is a `Stamp` — a word AND a shape AND a tone (§9) — so a maroon tab
label cannot be mistaken for an invalid stamp. The discipline never depended on
maroon's exclusivity, only on status never being carried by colour alone.

**A second job, added 2026-09-11:** the **product mark** — the `cf` square in
the top bar — is `--red-deep`, the official UP Maroon, with paper on it at
10.9:1. It was a grey `--ink` square. This is the safest place in the app for
the colour and the reason is structural rather than aesthetic: a product mark
carries **no state**. It is identical on every page in every condition, so it
cannot be read as a status, and saying which institution's system this is is
the entirety of its job. It is also the one element a reader sees on every
single page, so it buys the most maroon for the least risk.

**The rule these two share, and the one to extend by.** Maroon now means
**identity and orientation** — *which system this is*, and *where you are in
it*. Green means **action** — what you can do. That split is what keeps both
legible, and it is the test to apply to any further maroon:

| Ask of a candidate | Then |
|---|---|
| does it carry **state**? | **no maroon** — it would compete with the problem signal |
| is it an **action**? | **no maroon** — action is the green accent (D-D) |
| is it **identity**, or **where you are**? | maroon is available |

Still out of bounds regardless: maroon as a page background, a panel fill, or
an icon colour. And still out of bounds for `.post`'s 3px left edge, which
looks like a place for it and is not — that edge is a **status** channel
("unread", "waiting"), so maroon there would collide with exactly the reading
this rule protects.

### The two signals

- **Amber.** `--amber` `#8a5a12`, deep `#6e470e`, wash `#f6ecd8`, edge
  `#e0cda4`. Needs attention, pending, scheduled, open-and-not-yet-done,
  private reply, an identity-bearing export. Amber says *notice this*, never
  *something is wrong*. `#6e470e` on its wash is 7.0:1.
- **Red — UP Maroon.** `--red` `#8f2226`, deep `#7b1113`, wash `#f2e5e5`, edge
  `#dbb9ba`.
  **Reserved.** Destruction, invalid input, invalidated participation, privacy
  risk, failure. Never for emphasis, never for a count, never for a category,
  never for brand. If red is on screen, something is irreversible or wrong.
  `#7b1113` on its wash is 9.0:1. Maroon **is** the problem signal rather than
  brand chrome sitting beside one, which is what keeps it legible as "invalid".

### The wash-plus-ink rule

Every accent and signal ships as a quad: base hue for solid fills, `-deep` for
text, `-wash` for backgrounds, `-edge` for the 1px border of a washed element.
Coloured text always sits on its own wash using the deep step. Never the base
hue as body text on white; never white text on a wash.

### The rail is the one dark region — `--rail-*`

**[Confirmed 2026-09-11]** The owner's call: the workspace rail is a deep
UP-forest board. It is the single exception to §11.4 ("no coloured chrome
band"), and it is fenced rather than open-ended — see §11.4 for the exact terms.

**The current destination was a white sheet pinned to that board, and is not any
more.** `sidebar.md` §7 (owner spec, same day) asked for something "refined"
rather than "a huge bright green block", so the active row is now a faint white
overlay — `--rail-active`, white at 10% — with brighter ink, a weight change and
a 2px `--rail-focus` batten down its left edge. The inversion is gone.

That is **four channels for one state**, and the count is the point: the fill is
only about 1.3:1 against its neighbours by design, so it could not carry the
state alone and is not asked to. `aria-current="page"` says it independently of
all four (§9, "never state by colour alone").

`--rail-hover` is the same idea one step down, white at 6%, replacing
`--rail-raised` for row hover. Both are **alpha over the ground** rather than
mixed greens, so if D-E.5 ever reconciles `--rail` with §6A's dark-mode ground
the two states follow it without being re-measured.

| Token | Value | Use | On the rail |
|---|---|---|---|
| `--rail` | `#123a28` | The rail ground, and the mobile drawer's. | — |
| `--rail-deep` | `#0e2e20` | Its seam: the right edge, the drawer's top edge. | 1.16 |
| `--rail-raised` | `#1b4a34` | *Superseded by `--rail-hover` for row hover (`sidebar.md` §8).* | 1.25 |
| `--rail-hover` | white @ 6% | Hover on a destination. | ~1.2 |
| `--rail-active` | white @ 10% | The current destination's fill — one of four channels, never alone. | ~1.3 |
| `--rail-ink` | `#e9efe9` | Destination labels, the sign-out control, the account initials. | 10.8:1 |
| `--rail-ink-muted` | `#a9bdb0` | Group headings, the chevron, the footer. | 6.4:1 |
| `--rail-icon` | `#b9cbc0` | The drawn nav icons. | 7.4:1 |
| `--rail-rule` | `#2a5340` | Hairline under a heading, above the footer. | 1.45 |
| `--rail-focus` | `#93c8ad` | The focus ring, and the selection highlight. | 6.7:1 |
| `--rail-count` | `#dcb374` | The attention count on a destination. | 6.5:1 |
| `--rail-count-edge` | `#7a6236` | That count's 1px border. | 2.2 |

Four rules, and they are what make this an exception rather than a second
palette:

1. **The two grounds never mix.** `--rail-*` is legal only inside `.ws-rail`
   and `.ws-drawer__panel`; nothing else may use it, and the rail may not reach
   for the light palette. Every light token is derived against paper and stone
   and most of them fail here — `--accent-deep` is 1.4:1 on this ground,
   `--accent-wash` is 1.05:1, `--focus` is a ring nobody can see.
2. **The accent cannot appear on the rail.** It is a dark green on a dark
   green. So the active destination **inverts** instead: `--paper` fill with
   `--accent-deep` text at weight 600 — lightness, hue and weight, which is the
   same three-channel rule §9 applies to stamps, and it survives grayscale.
   `.ws-rail__action`, if it is ever rendered, inverts the same way.
3. **The wash-plus-ink rule does not survive the inversion.** Every amber wash
   lands within 1.2 of this ground, so the count badge is a bordered mark with
   no fill.
4. **The top bar stays white.** The rail is a *ground* the interface stands on,
   not a stripe of paint across the chrome — §11.4's actual target.

### Categories carry no colour — except one fenced flair

There are exactly three question categories in the domain (`content`,
`logistics`, `misc`). Everywhere in the app they render through `Category` in
`status.tsx` as a word in the interface register with a distinct 8px shape —
square, triangle, circle — not as a colour. A rainbow of category hues is a
rejected pattern: it reads as decoration, it fails in grayscale, and it
competes with the two signals.

**The Responses flair is the one exception — owner decision, 2026-09-12.** On
the Responses screen a teacher scans a column of student questions and asked
for the topic to separate at a glance, Reddit-flair style. `CategoryFlair` in
`teach/courses/[id]/responses/parts.tsx` is that flair and the only coloured
category in the system; `Category` is untouched and still governs everywhere
else.

Four things fence it, and they are what make it an exception rather than a
return to the rejected pattern:

| Constraint | Why |
|---|---|
| Four families, assigned by **meaning** (`content` blue, `logistics` amber, `assessment` violet, everything else slate) | a category always wears the same hue; nothing is cycled per value |
| Declared once as `--color-cat-*` in `globals.css` | no hex in a component, one place to change |
| Each is a **wash with its own deep ink at ≥ 7:1** | the WORD carries the meaning, so it survives grayscale exactly as the neutral chip did |
| It is still not a `Stamp` | a category says what a question is *about*; the stamp beside it says what the question still *needs*, and the two keep different shapes and vocabularies |

`logistics` reuses the existing amber family rather than minting a fifth.

---

## 4. Spacing scale

A strict scale. Values off it are defects.

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`

Rhythm:

- **8px** inside a control, between an icon and its label, between a stamp and
  the word beside it.
- **12px** between tightly-related siblings in a dense staff row.
- **16px** between siblings inside a panel.
- **24px** panel padding on staff surfaces; between panels.
- **32px** panel padding on student surfaces; between page regions on staff
  surfaces.
- **48px** between page regions on student surfaces; above a page title.
- **64px** page bottom gutter.

More space above a heading than below it, always: a strip label takes 32px above
and 12px below.

---

### Who owns a gap

**A container spaces its own children.** A child that adds `mt-*` to separate
itself from a sibling is a defect: the same gap then exists in two places and
one of them will be forgotten. This is not a style preference — it is the
failure that produced a form whose first two cards touched while the rest were
16px apart, and whose section headings sat flush against their content
(DESIGN-TODO 10.4.3b).

Two corollaries:

- **Never express a layout gap as a descendant selector on someone else's
  class.** `.notice--pad > .panel-title { margin-bottom: 16px }` supplied the
  heading gap on every panel in the app until a component stopped using
  `.panel-title`, at which point the gap disappeared with no error anywhere.
- A component that renders *into* a grid it does not own — `DeliveryFields`
  inside a form, a fragment's children inside a `stack-*` — must add **no**
  margin of its own. The parent's `gap` already applies to it.

---

## 5. Borders, radius, elevation

**Radius.** Three steps and nothing else — **`--radius-control: 6px`** for
controls (buttons, inputs, selects, choices), **`--radius-stamp: 5px`** for
stamps, **`--radius-panel: 12px`** for panels, and `0` for anything squared
directly to the board: list rows, table cells, pane seams and the strip labels.

*This is D-A, closed by the owner on 2026-09-11 in favour of the shipped
values.* The earlier text specified 2 / 3 / 0 and the code had always been
6 / 5 / 12 at 20, 5 and 16 call sites respectively; the doc was the side that
was wrong. What the decision does **not** license is a return to card
language: there are still **no pills**, no radius above 12px, and no radius at
all on anything that reads as pinned to the board. A panel is a sheet with a
softened corner, not a floating card — flatness (below) is what keeps that
distinction, and it is unchanged.

**Borders do the structural work.** A 1px hairline is the default separator
everywhere. Two variations carry meaning and are the *only* sanctioned
variations:

- a **2px bottom rule** (`--rule-ink`) under a strip label — the batten that
  divides the board;
- a **1px left rule** plus 16px indent marks quoted or attributed text: the
  student's original wording, a private reply, a published answer. It is 1px,
  not 3px; the indent and the serif do the work.
- a **3px left batten**, inside an element's own edge and drawn as a
  `::before`, marks **the row you are acting on** in a list of editable rows:
  `--accent-edge` on hover, `--accent` on `:focus-within`. Added 2026-09-11 for
  the question editor (DESIGN-TODO 10.4.6), where the owner's request was a
  resting shadow per question — which is forbidden below, and which this
  replaces. Three rules apply. It is **state only**, never decoration, so it is
  transparent at rest. It is drawn inside the edge rather than as
  `border-left`, so switching it on shifts no content. And it never carries the
  state alone: the question editor also changes the row's ground and its number
  chip, so the signal survives grayscale (§9).

**Elevation.** Two levels only.

- **Flat (default).** Everything. Sheets lie on the board; they do not hover.
  No `box-shadow` at rest, anywhere.
- **Overlay.** `0 12px 28px rgba(28, 30, 25, 0.18)` for the two things that
  genuinely cover content: the mobile navigation drawer and the list filter
  menu.

Shadow maps to literal stacking, never to importance. A shadow used to make a
panel feel important is a defect.

---

## 6. Buttons and form rules

### Buttons

**38px tall** — and 38 is the rendered height, not just a declared floor —
**6px radius** (`--radius-control`), 14px sans at weight 600, 8px internal gap,
`padding: 6px 16px`. `.button--small` is 30px / 13px / `4px 10px`.

*Two corrections, both 2026-09-11, both to this paragraph rather than to the
code.* The radius said **2px** here and has been 6px since D-A closed in favour
of the code's 6 / 5 / 12 — §5 was amended then and this line was missed. And
the padding said `9px 16px`, which is what the code carried and is what made a
button draw **41px**: `min-height` is a floor, and 9 + 9 around a 14px/1.5 line
box plus 2px of border overshoots it, so the 38px on this line was never the
height anybody saw. The padding is now 6px and `min-h-control` governs
(DESIGN-TODO §12h.2c). It stays a minimum, not a fixed height, because a label
long enough to wrap is supposed to grow the control.

| Variant | Fill | Text | Border | Hover |
|---|---|---|---|---|
| Primary | `--accent` | white | same | `--accent-deep` |
| Secondary | `--paper` | `--ink` | `--rule-strong` | `--paper-quiet` |
| Quiet | transparent | `--ink-muted` | none | `--paper-quiet`, text `--ink` |
| Danger | `--paper` | `--red-deep` | `--red-edge` | `--red-wash` |

One primary action per view. Destruction is a *bordered* button, never a red
slab: it should look serious, not eager to be clicked. Disabled buttons keep
their shape, drop to `--ink-faint` on `--paper-quiet`, and set
`cursor: not-allowed`.

### Fields

38px tall, 6px radius, 1px `--control-edge` stroke, white fill, `8px 10px`
padding. Textareas: 10px padding, vertical resize only, `--font-document` at
16px — because what a student types into them is authored text and should look
like it while they write.

**One recipe, one place.** `Field` · `Select` · `Textarea` · `FieldRow` ·
`FieldLabel` in `src/components/ui/form.tsx` are the only implementation of
everything in this section. The `.field` / `.select-field` / `.textarea-field`
classes that used to carry it are gone, and with them nine container-scoped
overrides that had been adjusting a control's width by descendant selector.

- **Label:** always visible, sans 13px weight 600, 6px above its field. Never a
  placeholder-as-label. A `<legend>` over a GROUP of controls takes the same
  recipe, through `FieldLabel`.
- **Required:** a red asterisk on required fields and **nothing** on optional
  ones — the owner's call, 2026-09-10 (DESIGN-TODO 10.4.4), replacing the word
  `REQUIRED` this section used to specify. It is not "colour alone" and not an
  *unexplained* asterisk, because three independent channels carry it: the
  glyph's presence against fields that have none (which survives grayscale), a
  `visually-hidden` "required" for screen readers, and the control's own
  `required` attribute. `RequiredMark` is the only way to render it. Still never
  a stamp — a stamp on every question turns the form into chip soup.
- **Optional:** unmarked. Optional is the default and says nothing, so a form
  carries one annotation per requirement instead of one per field.
  `.qualifier-mark` remains for the few staff labels that qualify a *value*
  rather than a requirement.
- **Help:** 13px `--ink-muted`, capped at 68ch, below the label and **above**
  the field. **Known deviation:** roughly 28 call sites render helper text
  *after* the control instead, as a trailing `.helper-text` span. `FieldRow`'s
  `help` prop implements this rule correctly; the conversion in DESIGN-TODO §3.2
  deliberately preserved each site's existing order rather than moving 28 blocks
  of text as a side effect of a refactor. Someone has to decide which is right —
  see DESIGN-TODO §3.2.
- **Focus:** pointer focus shifts the border to `--accent` and adds a 3px
  `--accent-wash` glow — warm rather than shouted, which matters when a
  student is mid-sentence on something uncomfortable. Keyboard focus keeps the
  global 3px outline as well, and the glow steps aside so the two never stack.
  No control anywhere sets `outline: none`.
- **Error:** `aria-invalid="true"` → border `--red`, fill `--red-tint`, and a
  `FieldError` wired via `aria-describedby` carrying a drawn warning icon and a
  sentence that names the problem *and* the fix.
- **Choices:** radio and checkbox rows are full-width 38px targets with a 1px
  border; checked fills `--accent-wash` and shifts the border to `--accent`
  through `:has(input:checked)`. Native inputs are kept and tinted with
  `accent-color`. `Choice` and `ChoiceList` are the implementation.
- **Search** is a plain GET form. Filters are `<details>` disclosures. Both work
  before hydration.

### Icons

Drawn, never typed. One authored SVG set in `src/components/ui/icons.tsx`:
1.5px stroke, `currentColor`, 16px default on a 24×24 viewbox, `round` caps and
joins. Unicode glyphs and emoji standing in for icons are forbidden — the
previous system used `☰ ⌂ 🔔 ✎ ⌕ ◈ ◎ ◇ ↥ ▤ ≡ ⚙ ◷ 🗨`, and every one of them is
gone. Decorative icons are `aria-hidden`; an icon-only control carries an
`aria-label`.

---

## 7. Navigation behaviour

**Chrome, not brand.** A 52px white top bar with a 1px `--rule-strong` bottom
edge. It carries the product mark (a 24px `--ink` square with `cf` — identity,
not action, so it does not take the accent), the current
context, and the account. There is no coloured brand band: the rail below it is
a dark ground the interface stands on (§3), not a stripe of paint across the
chrome.

**Three panes for list/detail routes** (Q&A archive, review inbox):

- a **216px rail** on `--rail` — the one dark region in the app (§3) — with its
  own scroll: courses, categories, section destinations, account footer. The
  current destination is a white sheet on it, not a wash;
- a **360px list pane** on `--paper` with a search field, a filter disclosure,
  day-group battens, and dense rows;
- a **fluid detail pane** on `--paper`, content capped at 820px.

**One pane for single-column routes** (setup, participation, backlog, audit,
courses, admin, the student form and history): the same rail, then a centred
column at `min(1080px, 100% - 64px)`.

Rules that hold across every route:

- **The URL is the selection.** Which row is open, which filter is applied, and
  which pane a phone shows all derive from the URL. Selection is shareable and
  survives reload.
- **Navigation never disappears.** Below 860px the rail becomes a full-height
  `<details>` drawer under the top bar; the context and role stay in the bar.
- **No-JS chrome.** Drawer and filter are `<details>`/`<summary>`; search is a
  GET form. Client state is reserved for genuinely interactive editors (the
  weekly form, the public-answer composer, the template editor).
- **The rail shows only what the viewer may reach**, derived from the same
  effective permissions the server enforces. Hiding a link is presentation, never
  authorization — every page re-checks.
- **Real counts only.** A count pill with a decorative number is a defect.
- `aria-current` marks the active rail item and the selected list row.

### The rail holds destinations. Filters go in the list pane.

A dimension the reader narrows *by* — week, state, topic, time — is a filter, and
it belongs to the list it narrows, as a `<details>` disclosure on the filter
strip. Putting one in the rail costs a row per value: the review inbox's week
list grew to twelve rail rows, pushed the section's real destinations to the top
of a 24-row rail, and duplicated a filter the list pane already had.

The filter strip prints only the narrowings actually in force. A strip that lists
every dimension's "everything" value is longer than the pane and ellipsises away
the part that matters.

---

## 7a. Information hierarchy

Every page answers three questions, in this order, and the layout is judged on
whether it does:

1. **Where am I?** The page title names the place and matches the rail item that
   leads here. A greeting is not an answer; neither is a third name for a
   destination the bar and rail already name two other ways.
2. **What is the main action?** It sits **in the page header**, beside the title,
   as the one primary button. Never at the bottom of a list — a reader with forty
   courses would have to scroll past all of them to create the forty-first.
3. **What should I do next?** Empty states carry the action that fills them, and
   a row's onward link uses the same wording as the destination it opens.

Rules that follow from that:

- **One primary per view.** A mode switch, a segmented choice and a filter are
  not primary actions and must not be styled as one (`.segment`, not two filled
  buttons).
- **Destructive actions never lead.** They come last, and behind a disclosure if
  the surface's real work is something else. The review inbox opened on a
  validity dropdown and a red *Remove participation credit* button; answering is
  the work, so credit removal now sits closed at the foot of the pane.
- **Occasional forms are disclosed, not standing.** A create-or-configure form
  that is always expanded takes the page's best space and buries its own submit.
  It becomes a `<details class="disclose">` whose summary is the action's name,
  or — when a header action already names it — a region rendered only when the
  URL asks for it (`?new=1`), so the entry point exists exactly once.
- **Order by frequency.** Section setup leads with the weekly schedule a teacher
  returns to, not the fourteen-checkbox staff form set once a term.
- **Equivalent actions match.** The same destination is worded and placed the
  same way everywhere — "Review inbox" at the end of a row, on the home card, in
  the courses list, and in the rail.

### Progressive disclosure — `.disclose`

`<details class="disclose">` with a rotating chevron: closed it costs one
control's height, open it is an ordinary bordered region. `.disclose--inset`
makes it one row of the notice it sits inside rather than a box within a box.
Native `<details>`, so it works before hydration and its state is real.

---

## 8. Student versus staff density

Same tokens, different breathing room. This is deliberate and should be
preserved.

| | Student | Staff |
|---|---|---|
| Authored body | 17px / 1.6 | 16px / 1.55 |
| Panel padding | 32px (24px below 720px) | 24px |
| Gap between panels | 24px | 16px |
| Page region gap | 48px | 32px |
| List row vertical padding | — | 10px |
| Table cell padding | — | 8px 12px |
| Max content column | 720px (the form), 820px (reading) | 1080px single-column, 820px detail |

A student is doing one thing under a deadline and may be typing something
uncomfortable; the page should feel unhurried. A teacher is triaging forty
submissions and needs rows they can scan. Cushions help the first and hurt the
second.

---

## 9. State presentation

Every state below is designed, not incidental. Removing one is a regression.

**Stamps** carry status. A stamp is a bordered rectangle at **5px** radius
(`--radius-stamp`; this line said 3px until 2026-09-11 — another survivor of
the pre-D-A numbers, like Buttons above) with a
drawn 8px shape, a **sentence-case** word, and a tone. Three redundant channels,
so it survives colourblindness, grayscale printing and low contrast.

The word was tracked uppercase until the review pass. It changed because a screen
carrying eight of them read as machine output rather than as a workspace — the
single largest contributor to that impression — and none of the three channels
depends on the casing. Table headers moved to sentence case for the same reason.
All-caps in this system is now reserved for the strip label and the rail heading,
which are printed *labels for a region* rather than words about content.

| Tone | Shape | Means |
|---|---|---|
| accent | filled square | open, submitted, published, valid, confirmed, counted |
| amber | filled triangle | needs review, scheduled, pending, draft, flagged, private reply |
| red | filled diamond | invalid, failed, rejected, not counted, privacy risk |
| neutral | hollow square | closed, archived, skipped, not started |

Cycle state always renders through `CycleStateBadge`, validity through
`ValidityBadge`, and a student's own credit through `CreditBadge`, so no page
invents its own wording.

**One exception, and it is `CycleStateBadge`.** Since 2026-09-11 the cycle
states — Draft · Scheduled · Open · Closed · Archived · Skipped — render the
word and the tone with **no shape**, at the owner's request ("no need for
symbols for scheduled open closed, just the word"). This is an amendment to the
three-channel rule, not a hole in it: the channel that carries meaning without
colour is the WORD, and it is still there, so the badge still survives
grayscale and colourblindness. What it gives up is speed — in a column of a
dozen occurrences the shape was read before the word was. Every other stamp
keeps all three; the opt-out is the `mark` prop on `Stamp`, and it is
deliberately a prop rather than a variant so the exception stays countable.

**`ValidityBadge` is staff-only.** `flagged` is an internal state a student must
never learn exists; the student-facing component is `CreditBadge`, which says
only *counted* or *not counted*. Rendering `ValidityBadge` on a student route
would leak the flag, so it never appears on one.

**Loading.** Pages are server-rendered per navigation; the browser's own
progress is the loading state for navigation. Where a route can be slow, Next's
`loading.tsx` renders a *structural* placeholder — the real top bar and rail,
with muted rules where rows will be — and it renders **that route's own shape**:
five columns before a five-column table, a card list before a card list, no tab
bar before a page that has none. A placeholder whose shape differs from the page
it precedes makes the content jump when it lands, which is worse than no
placeholder at all. Never a shimmer.

**Spinners — amended 2026-09-11, owner-approved.** This section said "never a
spinner". That was too broad, and the line falls here instead:

| The wait | What it gets |
|---|---|
| content whose **shape is known** — a route, a list, a table | a **skeleton**: it describes what is arriving and holds its space |
| a wait with **no shape to predict** — a submit in flight, an export being generated | a **spinner**: there is nothing to draw a placeholder of, and a bar pretending to be a row would be a lie |

Three rules keep the original objection answered, because it was a real one:
a spinner is **never used where a skeleton fits** (it says "something is
happening" and nothing else, and collapses the layout to a centred dot); it is
**never alone** — always beside a word, or carrying one for assistive
technology, because motion is not a message; and it is **static under
`prefers-reduced-motion`**, where it reads as a ring that marks the place while
the label carries the meaning. Form submission still disables the primary button
and changes its label to name what is happening ("Creating…"); the spinner sits
*beside* that label rather than instead of it — immediate acknowledgement from
the glyph, meaning from the word.

**Empty.** A dashed `--rule-strong` outline on `--board`, a sentence in the
document register naming what is not here, one sentence of `--ink-muted` copy at
52ch naming what the person can do next, and at most one action. Empty states
never scold and never show a decorative illustration.

**Error.** An `alert` with `role="alert"`, a red wash, a drawn icon, a bolded
first line naming the problem, and a sentence naming the recovery. Field-level
errors are wired through `aria-describedby` and never replace the value the
person typed.

**A refused control is red, from either source, and the red outranks focus.**
Two things can refuse a value — the server (`aria-invalid`) and the browser
(`:user-invalid`, an empty required field or a value that does not match its
type) — and both take the `--red` border on the `--red-tint` fill. `:user-invalid`
and never `:invalid`: the latter matches an empty required field from page load,
so styling it paints a pristine form red before anyone has typed. And the
invalid treatment must beat the focus treatment by **specificity**, because the
browser focuses the control it refused; otherwise the field that blocked the
submission renders in the accent — the colour that means *action*. A refused
**group** (radios, checkboxes, a scale) carries the red on its options, because
the fault is "this question is unanswered" rather than "that option is wrong".

**Success.** An accent-wash alert with `role="status"`, stating what changed and
what is now true — "Published to this section, anonymously." Success after an
irreversible action also states the irreversibility.

**Closed cycle.** Not an error. A neutral stamp, the closing time in words, and
the two things still available: history and the Q&A archive.

**Unauthorized.** `AccessDenied` — a plain sentence saying the account is not
authorized and who to ask. It never explains *why*, never names the resource's
contents, and never distinguishes "does not exist" from "not yours".

---

## 10. Responsive breakpoints

Verified at **320, 390, 768, 1024, 1440**. Layout uses relative units so 200%
zoom stays usable.

| Breakpoint | Change |
|---|---|
| ≥ 1180px | Full three panes: 216 rail / 360 list / fluid detail. Single column at `min(1080px, 100% - 64px)`. |
| ≤ 1180px | List pane → 320px; detail padding 32 → 24px. |
| ≤ 1024px | Rail → 192px; list → 300px. Multi-column page grids collapse to one column. |
| ≤ 860px | Rail → `<details>` drawer. List and detail become alternating full-width views driven by the URL selection; a "Back to list" link appears. |
| ≤ 720px | Page padding → 16px; panel padding → 24px (student) / 16px (staff); page title floor 24px; form action bar becomes full-width stacked buttons; `data-list` rows stack. |
| ≤ 400px | Table cells tighten to `6px 8px`; stamps may wrap to their own line; the top bar drops the context title and keeps the mark and account. |

Nothing may scroll the page body horizontally. Wide content — tables, the
participation matrix, CSV previews — scrolls inside its own
`overflow-x: auto` region with a visible edge.

---

## 11. Anti-patterns — forbidden

Hard rules. Each one is currently satisfied; breaking one is a regression.

**Visual language**

1. No radius outside the three declared steps (6 / 5 / 12, §5), and none
   above 12px. No pills, ever. No card grid as page structure.
2. No `box-shadow` at rest. Shadows exist only on the drawer and the filter menu.
3. No glassmorphism, backdrop blur, gradient text, glow, or floating blobs.
4. No purple, no gradient brand bar, no coloured chrome band of any hue —
   **one exception, taken by the owner on 2026-09-11**: the workspace rail is a
   deep UP-forest ground with its own fenced `--rail-*` palette (§3). The
   exception covers the rail and the drawer that replaces it on a phone, and
   nothing else: the top bar stays white, no other region takes a hue, and no
   `--rail-*` token appears outside those two selectors.
5. No second accent colour. The deep blue-green is the only accent; amber and
   red are signals under §3's reserve rules.
5a. No accent on decoration. The accent is a primary button, a link, active
   navigation, focus, a checked choice, or a positive state — never a brand
   mark, a container fill, an input stroke, an icon tint, a heading, or a chart
   bar. The rail's ground is **not** the accent: it is its own token, and the
   accent is unreadable on it (§3). This is how it stayed meaningful; spending it everywhere is how the
   previous version stopped meaning anything.
6. No category colour spectrum. Categories are words plus shapes — with the
   single fenced exception of the Responses `CategoryFlair` (§3), which is four
   meaning-assigned washes declared as tokens, never a spectrum and never
   colour alone.
7. No coloured `border-left` above 1px.
8. No decorative illustration, hero metric, sparkline, progress ring, or
   dashboard tile that is not a real count.
9. No Unicode glyph or emoji as an icon.
10. No monospace as a costume for "technical".
11. No eyebrow or kicker line above a heading. The heading carries its own
    weight. (`.eyebrow` and `.section-kicker` were removed.)
12. No section numbering (01 / 02 / 03) unless the order is information.

**Product and privacy**

13. No feature that is not in MVP: no comments, threads, reactions, hearts,
    votes, endorsements, pins, stars, attachments, notifications, LMS hooks, or
    AI. The previous stylesheet carried `.ws-heart`, `.ws-comment`,
    `.ws-endorsed`, `.ws-pin`, `.ws-star` and `.ws-addcomment`; all are deleted
    and must not return.
14. No student-facing surface may render source identity, staff notes, validity
    or invalidation, review state, dispositions, drafts, audit records, or
    participation totals.
15. No reworded public text presented as if it were the original. The original
    is always quoted, in the document register, labelled.
15a. No internal validity reason, staff note, or flag shown to a student. When a
    decision removes credit, the student sees only the separate sentence a human
    typed for them; the internal reason and note stay on the staff surface.
16. No status communicated by colour alone.
17. No imitation of Ed Discussion, Piazza or Slido: no third-party logo, brand
    colour, product name, exact copy, or recognisable layout. They informed the
    information architecture only.
18. No authorization logic in a client component; no permission decision made
    from data the client can edit.

**Craft**

19. No fractional font sizes.
20. No spacing value off the §4 scale.
21. No unbounded prose measure.
22. No focus outline removal. The global `3px solid var(--focus)` at 2px offset
    is a hard invariant.
23. No modal for a task that needs neither interruption nor protected focus.
24. No animation beyond a 120ms background/border transition on interactive
    elements, plus the disclosure chevron's 120ms rotation, which describes
    state; `prefers-reduced-motion: reduce` kills all of it globally.

**Hierarchy** (see §7a)

25. No page-level primary action below the content it acts on. It belongs in the
    page header beside the title.
26. No permanently-expanded occasional form. It is a `.disclose`, or a region
    the URL opens.
27. No destructive control above the surface's actual work.
28. No two entry points, side by side, for one action — a header button and a
    standing summary with the same label is one too many.
29. No badge for the absence of a state ("Standard", "Automatic" on every row).
    A stamp that appears on most rows distinguishes nothing.
30. No empty state without the action that fills it, and no empty state rendered
    between two populated panels.
31. No explanatory paragraph repeated across routes, and none parked in the rail
    footer. Explanation earns its place only where it prevents a likely mistake,
    states a privacy or anonymity rule, explains an unusual state, or is needed
    to finish the task.
32. No filter in the rail. Filters belong to the list they narrow.

---

## 11a. The second pass — what it corrected and why

The first redesign fixed the visual language and left the **product** decisions
underneath it wrong. A review of the running application found three classes of
defect; the corrections are §3 (palette), §7a (hierarchy) and anti-patterns
25–32.

The three things that were actually wrong:

1. **Page-level create actions sat at the bottom of the page**, below the list
   they added to — on courses, templates, and the question backlog — so a
   teacher with many rows had to scroll past all of them to add one. And the
   review inbox opened on a red *Remove participation credit* button, above the
   student's words and above the composers that do the page's real work.
2. **Explanation had accumulated past the point of being read.** Duplicated
   explainers across routes, an `AUTOMATIC` stamp on twenty of twenty-five audit
   rows, a `STANDARD` badge encoding the absence of a role, two panels of
   green-washed instructional prose on the student form, the same fact printed
   twice in one claim row, and a copy contradiction about the one rule students
   care about (a submitted week *is* editable until its deadline; two surfaces
   said it is not).
3. **The accent was doing decoration**, so it had stopped meaning "click this" —
   and being an institutional forest green on an olive ground, it read as the
   university rather than as the product.

The test of whether this holds is not that it looks calmer. It is: the primary
action is in the header on every page that has one, the destructive one is last,
nothing explains itself twice, and the accent appears only where something can
be acted on.

---

## 12. Surfaces added after the redesign

These arrived on `main` while the redesign was in flight and were brought onto
the system as part of the merge. They follow every rule above; the notes are the
decisions specific to them.

- **`/teach/sections/[id]/roster`** — the class list a teacher imported: name,
  UP email, last four of the student number, dropped state, and whether that
  address has signed in yet. It carries **no** approve/reject/confirm control,
  because there is no decision to take — importing the email is the access grant.
  A reporting surface, so it takes the staff rhythm and the same search/filter
  pattern as the review inbox.

  *(`/claim`, where a student typed their student number to be linked to the
  class list, was removed on 2026-08-07 along with the whole name-matching
  workflow. The route survives only as a redirect. Its uniform-reply privacy
  mechanism is gone with it: there is no longer anything to disclose, because a
  student never asks the system about their identity — the teacher supplies it.)*
- **Rich text** (`.rich-text`) — the sanitized markdown/KaTeX output of the one
  safe renderer. Authored text, so it sits in the document register; its own
  tables and code step back to the sans and mono faces. Long code and display
  maths scroll inside their own box and never widen the page.
- **Pagination** (`.pagination`) — links, not buttons, so a page is shareable
  and works before hydration. Every existing query parameter is preserved, so
  paging never silently drops a staff member's filters. Disabled ends keep their
  shape and drop to `--ink-faint`.
- **Charts** (`.chart`) — the SVG is decorative and `aria-hidden`; the
  equivalent table is *always* rendered, never offered as an alternative. Bars
  use the single accent. A chart that hides its numbers behind a hover is not an
  accessible chart.
- **The three-state validity control** — flag, confirm, dismiss, invalidate,
  restore, plus the validity timeline, all on one staff surface. Destructive
  steps are bordered danger buttons, never red slabs, and each states what the
  student will and will not see.
- **The editable weekly form** — save a draft, submit, and keep editing until
  the deadline. The copy states the current truth on every state, and a block
  staff have already acted on says so rather than silently refusing the edit.

## 13. Where the system lives

Rewritten 2026-09-11. The previous version of this section said "one
stylesheet, one system. No CSS-in-JS, no Tailwind, no UI framework" and listed
ten components — in a repository part-way through a Tailwind migration with
nineteen files under `ui/`. It was wrong in every particular, which is what
DESIGN-TODO 11.6f was about.

**The token layer**

- `src/app/globals.css` — the `@theme` block: **every colour, radius, spacing
  step, type step and breakpoint, declared once.** A hex literal is legal here
  and nowhere else.
- `src/app/legacy.css` — the hand-written class layer, **shrinking to zero**.
  Imported into `@layer components` so utilities override it. Nothing new goes
  in; a new component writes utilities.
- `src/lib/theme.ts` — the one value duplicated outside CSS (`themeColor`
  cannot read a custom property), held to `globals.css` by
  `tests/unit/theme-tokens.test.ts`.
- `src/app/fonts/` — the Charter subset and its licence.

**The components — one recipe per pattern, in `src/components/ui/`**

| File | What it owns |
|---|---|
| `button.tsx` | `Button`, `buttonClass` — the only button recipe |
| `form.tsx` | `Field` · `Select` · `Textarea` · `FieldRow` · `FieldLabel` · `Choice` · `ChoiceList` · `ScaleList` · `Question` · `OwnItem` · `Label` · `FormSection` — §6 in full |
| `status.tsx` | `Stamp` and the badges that delegate to it; `Category` |
| `feedback.tsx` | `Alert`, `EmptyState`, `AccessDenied`, `FieldError` |
| `surface.tsx` | `Panel`, `StripLabel`, `Disclose`, `Figure`, `Quote` |
| `data.tsx` | `MetaList`, `BarChart`, `Pagination`, `Breadcrumbs` |
| `dialog.tsx` | the native `<dialog>` primitive — centred, scrimmed, Escape, click-outside, a corner `×`, focus trapped and returned to the trigger. Every modal in the app is an instance of this; none styles its own |
| `info-tip.tsx` | `InfoTip` — an `(i)` revealing reference text |
| `tag.tsx` | `Tag`, `TagList` — neutral counts, never a status |
| `submit-button.tsx` | the pending state on a mutation |
| `required-mark.tsx` | the red asterisk, with its accessible name |
| `skeleton.tsx` | `Skeleton` · `SkeletonText` · `SkeletonPanel` · `SkeletonCards` · `SkeletonTable` · `SkeletonControls` · `SkeletonPage` — placeholders sized off the real tokens, composed per route |
| `spinner.tsx` | `Spinner`, `SpinnerBlock` — a wait with no predictable shape. Read the rules in §9 before using either |
| `shell-frame.tsx` | the app's chrome with no data behind it, for `loading.tsx` and `error.tsx` — which replace the page *and* its shell |
| `announcer.tsx` | speaks `?ok=` / `?error=` into a polite live region once, because a banner present at page load is not a mutation and is therefore not announced |
| `filter-menu.tsx`, `auto-submit.tsx`, `long-text.tsx`, `term-fields.tsx`, `thread.tsx`, `scroll-to.tsx` | one pattern each |
| `icons.tsx` | the drawn icon set. `IconClose` is the **only** glyph allowed to stand without a word beside it, and only in a dialog's corner |
| `index.tsx` | a barrel over `status` · `feedback` · `surface` · `data`. Not a component |

**Composed components — a pattern used once, in one place**

These are not primitives and nothing else should import them. They are listed
so a reader looking for "where is the create-course form" finds it, and so the
next one is put beside them rather than inlined into a page.

| File | What it is |
|---|---|
| `staff/create-course-dialog.tsx` | the create-course modal (`modal.md`). An instance of `dialog.tsx` plus four fields; contains no geometry of its own |
| `staff/course-heading.tsx` | `courseSubtitle` — a course's two-line subtitle, built once so two courses cannot drift |
| `layout/nav-count.tsx` | the navigation count badge, one rule over two grounds |

**The shell**

- `src/components/layout/workspace-shell.tsx` — top bar, list pane, detail/page
  panes, and the rail's geometry and collapsed state.
- `src/components/layout/rail.tsx` — the rail's contents: sections,
  destinations, the account block. Rebuilt to `sidebar.md`; **the sidebar owns
  navigation and the header owns identity**, so it carries no product mark.
- `src/components/layout/rail-toggle.tsx` — the collapse control. Lives *inside*
  the rail, which only works because nothing re-expands the rail on hover or
  focus; see the file for the bug that taught us.
- `src/components/layout/nav-count.tsx` — the count on a nav row, in either
  ground.
- `src/components/layout/sub-nav.tsx` — contextual navigation, in its two
  responsive shapes.
- `src/components/layout/nav.ts` — destinations derived from effective
  permissions. Presentation only: hiding a link is not authorization.

**Two rules about adding to this**

- **Inline `style` attributes are at zero and should stay there.** The previous
  text here permitted them "for one-off geometry"; that permission produced 59
  of them. A one-off is an arbitrary utility (`max-w-[220px]`), which at least
  goes through the token system.
- **A component that is not in this table will drift.** Its rule belongs in the
  right section above and its name in this list, in the same change that adds
  it.

---

## 14. Metadata, status, and asking for a term

Three patterns added by the precision pass. They exist because the first two
passes fixed layout and colour and left the interface still *reading* as
generated.

### Metadata is separate facts — `MetaList`

`DCS-101 · AY2026-1 · Asia/Manila` is three unrelated facts welded into one
sentence: none can be scanned, none can be dropped or styled independently, and
the row wraps mid-phrase. Metadata renders through `MetaList`, which lays each
fact out as its own element separated by whitespace — **no middle dots** — so a
missing fact leaves no stray separator and a narrow screen stacks cleanly.

**A string built by joining unrelated facts with `·` is a defect.** One
separator between two genuinely paired facts (a top-bar context label) is fine.

### Status is a sentence, and only said once — `ReviewStatusLine`

`1 submission · 1 answered` beside a `Nothing waiting` stamp said the same thing
twice and told the teacher nothing to do. A status region carries **one**
treatment: the sentence that names what the object needs
(`3 submissions need replies` / `All submissions answered` / `No submissions
yet`). A stamp appears alongside only when it carries *different* information —
for example that the viewer cannot see the queue at all.

A sentence may never claim more than the counts prove. `0 submissions · 0
answered` under "Nothing waiting" implied a handled week when nothing had
arrived.

### The academic term — `TermFields` and `lib/term.ts`

`class_sections.term` stores `AY{year}-{1|2|M}`. That is a storage key: it is
never shown to a person and never typed by one.

- **Asking:** `TermFields` takes a start year and a semester
  (`1st semester` / `2nd semester` / `Midyear`) and shows the derived academic
  year back live (`2026-2027`) through `role="status"`. No `AY` prefix, no end
  year.
- **Showing:** `termParts()` returns the two facts for `MetaList`;
  `formatTerm()` joins them only where a single string is unavoidable, such as an
  `aria-label`.
- **Legacy:** a value the adapter cannot parse is rendered verbatim and
  resubmitted unchanged. A term somebody typed by hand is still the truth about
  that section, so it is never rewritten to fit the format.

The timezone is a section-setup fact, not a course-list fact. It does not belong
in a row's primary scan line.

### Authoring choices — `.options`

Answer choices are edited as one numbered input per choice with a per-row remove
and an `Add option` button, never as a newline-separated textarea. An option that
already exists **keeps its `stableId`** when its label is corrected: answers store
`optionIds` and exports join on them, so deriving the id from the label would
silently re-identify every option a teacher touched.
