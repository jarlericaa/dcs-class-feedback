---
name: Class Feedback
description: A university weekly-feedback workspace built like a departmental noticeboard — typed notices on a matte board, stamped, dated, and never rounded into cards.
colors:
  board: "#e9e8de"
  board-deep: "#e0dfd2"
  paper: "#ffffff"
  paper-quiet: "#f6f6f0"
  ink: "#1c1e19"
  ink-soft: "#3f443c"
  ink-muted: "#5f655a"
  ink-faint: "#7c8377"
  rule: "#d5d4c6"
  rule-strong: "#bcbbaa"
  rule-ink: "#8e8f80"
  stamp-green: "#1f6b4a"
  stamp-green-deep: "#14523a"
  stamp-green-wash: "#e0ece2"
  stamp-amber: "#8a5510"
  stamp-amber-deep: "#6d4109"
  stamp-amber-wash: "#f5e9d3"
  stamp-red: "#a3372f"
  stamp-red-deep: "#812722"
  stamp-red-wash: "#f5e2df"
  focus: "#14523a"
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
  control: "2px"
  stamp: "3px"
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
    backgroundColor: "{colors.stamp-green}"
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
    textColor: "{colors.stamp-red-deep}"
    borderColor: "#d9b7b3"
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
  stamp-green:
    backgroundColor: "{colors.stamp-green-wash}"
    textColor: "{colors.stamp-green-deep}"
    borderColor: "#b6cfbc"
    rounded: "{rounded.stamp}"
    padding: "3px 7px"
  stamp-amber:
    backgroundColor: "{colors.stamp-amber-wash}"
    textColor: "{colors.stamp-amber-deep}"
    borderColor: "#dcc496"
    rounded: "{rounded.stamp}"
    padding: "3px 7px"
  stamp-red:
    backgroundColor: "{colors.stamp-red-wash}"
    textColor: "{colors.stamp-red-deep}"
    borderColor: "#dcb3ae"
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
    backgroundColor: "{colors.stamp-green-wash}"
    textColor: "{colors.stamp-green-deep}"
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
institutional green, and two signal colours held in reserve. Nothing glows,
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

A restrained strategy: a matte ground, white paper, one institutional accent,
two signals. **One accent total.** The previous system ran three accents in
three zones (plum chrome, blue navigation, green content) plus an eight-hue
category spectrum; all of it is removed. Introducing a second accent is a
regression, not a decision.

### Ground and paper

| Token | Value | Use |
|---|---|---|
| `--board` | `#e9e8de` | The app canvas. The board itself. |
| `--board-deep` | `#e0dfd2` | Rail and list-pane ground; recessed regions. |
| `--paper` | `#ffffff` | Notices, panels, detail pane, inputs. |
| `--paper-quiet` | `#f6f6f0` | Quoted blocks, table header rows, disabled fills. |

### Ink

| Token | Value | Use | Contrast on paper |
|---|---|---|---|
| `--ink` | `#1c1e19` | Primary text. | 15.9:1 |
| `--ink-soft` | `#3f443c` | Secondary text that is still read. | 9.7:1 |
| `--ink-muted` | `#5f655a` | Metadata, labels, placeholders. | 5.9:1 |
| `--ink-faint` | `#7c8377` | Rail headings, decorative rules' text. Never body. | 4.0:1 — large text and non-text only |

### Rules

| Token | Value | Use |
|---|---|---|
| `--rule` | `#d5d4c6` | Default hairline: panel edges, row dividers, table rules. |
| `--rule-strong` | `#bcbbaa` | Input strokes, secondary button borders, pane seams. |
| `--rule-ink` | `#8e8f80` | The one heavier rule: a 2px batten under a strip label. |

### The accent

**Institutional green.** `--stamp-green` `#1f6b4a`, deep `#14523a`, wash
`#e0ece2`. It carries: the primary button, the focus ring, the active
navigation row, the checked state of a form choice, and the positive stamp. It
is the only accent. `#14523a` on white is 8.4:1; white on `#1f6b4a` is 5.6:1.

### The two signals

- **Amber.** `--stamp-amber` `#8a5510`, deep `#6d4109`, wash `#f5e9d3`. Needs
  attention, pending, scheduled, open-and-not-yet-done, private reply. Amber
  says *notice this*, never *something is wrong*.
- **Red.** `--stamp-red` `#a3372f`, deep `#812722`, wash `#f5e2df`. **Reserved.**
  Destruction, invalid input, invalidated participation, privacy risk, failure.
  Never for emphasis, never for a count, never for a category, never for brand.
  If red is on screen, something is irreversible or wrong.

### The wash-plus-ink rule

Every signal ships as a triple: base hue for solid fills, `-deep` for text,
`-wash` for backgrounds. Coloured text always sits on its own wash using the
deep step. Never the base hue as body text on white; never white text on a wash.

### Categories carry no colour

There are exactly three question categories in the domain (`content`,
`logistics`, `misc`). They render as a word in the interface register with a
distinct 8px shape — square, triangle, circle — not as a colour. A rainbow of
category hues is a rejected pattern: it reads as decoration, it fails in
grayscale, and it competes with the two signals.

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

## 5. Borders, radius, elevation

**Radius.** `0` for every sheet, panel, pane, notice, list row, table and
alert. `2px` for controls (buttons, inputs, selects, choices). `3px` for
stamps. Nothing else. There are no pills and no 14px cards; both belong to the
rejected system.

**Borders do the structural work.** A 1px hairline is the default separator
everywhere. Two variations carry meaning and are the *only* sanctioned
variations:

- a **2px bottom rule** (`--rule-ink`) under a strip label — the batten that
  divides the board;
- a **1px left rule** plus 16px indent marks quoted or attributed text: the
  student's original wording, a private reply, a published answer. It is 1px,
  not 3px; the indent and the serif do the work.

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

38px tall, 2px radius, 14px sans at weight 600, 8px internal gap, `padding:
9px 16px`. `.button--small` is 30px / 13px / `6px 10px`.

| Variant | Fill | Text | Border | Hover |
|---|---|---|---|---|
| Primary | `--stamp-green` | white | same | `--stamp-green-deep` |
| Secondary | `--paper` | `--ink` | `--rule-strong` | `--paper-quiet` |
| Quiet | transparent | `--ink-muted` | none | `--paper-quiet`, text `--ink` |
| Danger | `--paper` | `--stamp-red-deep` | `#d9b7b3` | `--stamp-red-wash` |

One primary action per view. Destruction is a *bordered* button, never a red
slab: it should look serious, not eager to be clicked. Disabled buttons keep
their shape, drop to `--ink-faint` on `--paper-quiet`, and set
`cursor: not-allowed`.

### Fields

38px tall, 2px radius, 1px `--rule-strong` stroke, white fill, `8px 10px`
padding. Textareas: 10px padding, vertical resize only, `--font-document` at
16px — because what a student types into them is authored text and should look
like it while they write.

- **Label:** always visible, sans 13px weight 600, 6px above its field. Never a
  placeholder-as-label.
- **Required:** the word `REQUIRED` in `--ink-soft` at 12px/700 under the
  prompt, plus server-side validation. Never an unexplained asterisk, never
  colour alone, and never a stamp — a stamp on every question turns the form
  into chip soup and stops meaning anything.
- **Optional:** the word `optional` in `--ink-muted` beside the label.
- **Help:** 13px `--ink-muted` below the label, above the field.
- **Focus:** pointer focus shifts the border to `--stamp-green` and adds a 3px
  `--stamp-green-wash` glow — warm rather than shouted, which matters when a
  student is mid-sentence on something uncomfortable. Keyboard focus keeps the
  global 3px outline as well, and the glow steps aside so the two never stack.
  No control anywhere sets `outline: none`.
- **Error:** `aria-invalid="true"` → border `--stamp-red`, fill `#fffbfa`, and a
  `FieldError` wired via `aria-describedby` carrying a drawn warning icon and a
  sentence that names the problem *and* the fix.
- **Choices:** radio and checkbox rows are full-width 38px targets with a 1px
  border; checked fills `--stamp-green-wash` and shifts the border to
  `#a9c8b3` through `:has(input:checked)`. Native inputs are kept and tinted
  with `accent-color`.
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
edge. It carries the product mark (a 24px green square with `cf`), the current
context, and the account. There is no coloured brand band; the board's identity
comes from the board, not from a stripe of paint.

**Three panes for list/detail routes** (Q&A archive, review inbox):

- a **216px rail** on `--board-deep` with its own scroll: courses, categories,
  section destinations, account footer;
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

**Stamps** carry status. A stamp is a bordered rectangle at 3px radius with a
drawn 8px shape, an uppercase word, and a tone. Three redundant channels, so it
survives colourblindness, grayscale printing and low contrast.

| Tone | Shape | Means |
|---|---|---|
| green | filled square | open, submitted, published, valid, confirmed |
| amber | filled triangle | needs review, scheduled, pending, draft, private reply |
| red | filled diamond | invalid, failed, rejected, privacy risk |
| neutral | hollow square | closed, archived, skipped, not started |

Cycle state always renders through `CycleStateBadge` so no page invents its own
wording.

**Loading.** Pages are server-rendered per navigation; the browser's own
progress is the loading state for navigation. Where a route can be slow, Next's
`loading.tsx` renders a *structural* placeholder — the real rail and strip
labels with muted rules where rows will be — never a shimmer, never a spinner
that pretends to be content. Form submission disables the primary button and
changes its label to name what is happening ("Submitting…").

**Empty.** A dashed `--rule-strong` outline on `--board`, a sentence in the
document register naming what is not here, one sentence of `--ink-muted` copy at
52ch naming what the person can do next, and at most one action. Empty states
never scold and never show a decorative illustration.

**Error.** An `alert` with `role="alert"`, a red wash, a drawn icon, a bolded
first line naming the problem, and a sentence naming the recovery. Field-level
errors are wired through `aria-describedby` and never replace the value the
person typed.

**Success.** A green-wash alert with `role="status"`, stating what changed and
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

1. No rounded containers above 3px. No pills. No card grid as page structure.
2. No `box-shadow` at rest. Shadows exist only on the drawer and the filter menu.
3. No glassmorphism, backdrop blur, gradient text, glow, or floating blobs.
4. No purple, no gradient brand bar, no coloured chrome band of any hue.
5. No second accent colour. Green is the only accent; amber and red are signals
   under §3's reserve rules.
6. No category colour spectrum. Categories are words plus shapes.
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
    elements; `prefers-reduced-motion: reduce` kills all of it globally.

---

## 12. Where the system lives

- `src/app/globals.css` — every token and every class. One stylesheet, one
  system. No CSS-in-JS, no Tailwind, no UI framework.
- `src/components/ui/index.tsx` — `Stamp`, `CycleStateBadge`, `Alert`,
  `EmptyState`, `AccessDenied`, `Panel`, `StripLabel`, `FieldError`,
  `Breadcrumbs`, `Figure`.
- `src/components/ui/icons.tsx` — the drawn icon set.
- `src/components/layout/workspace-shell.tsx` — the top bar, rail, list pane and
  detail/page panes.
- `src/components/layout/nav.ts` — destinations derived from effective
  permissions.
- `src/app/fonts/` — the Charter subset and its licence.

Inline `style` attributes are for one-off geometry only (a max-width on a single
select, a grid template that exists once). Anything that appears twice becomes a
class.
