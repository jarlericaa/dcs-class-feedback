# UI Redesign Report

**Date:** 2026-08-05
**Branch:** `fix/ui-ux`
**Baseline commit:** `c63b592`
**Scope:** the whole route system — presentation only. No backend, domain,
authorization or privacy behaviour was changed.

---

## 1. Before and after

### The problem

The interface worked and was not designed. Two visual eras were layered on top
of each other in one 2,282-line stylesheet:

- a **green academic shell** (`.app-frame`, `.app-sidebar`, `.page-shell`,
  `.signin-layout`, `.review-layout`, `.archive-layout`, `.nav-item`,
  `.mobile-nav`, …) that no component rendered any more — roughly 500 lines of
  dead CSS;
- a later **workspace chrome** (`.ws-*`) built as a close structural echo of Ed
  Discussion, including a plum brand band, a blue navigation accent, circular
  coloured avatars, an author name in Ed's own orange-red `#c0492b`, and a set
  of classes for features that are explicit MVP non-goals: `.ws-heart`,
  `.ws-comment`, `.ws-addcomment`, `.ws-endorsed`, `.ws-pin`, `.ws-star`,
  `.ws-editor__toolbar`.

The result ran **three unrelated accents in three zones** (plum chrome, blue
navigation, green content) plus an **eight-hue category spectrum**, which the
previous design document recorded as "a documented accident, not a plan."
Alongside that: fractional font sizes (`10.5px`, `13.5px`, `15.5px`), an ad-hoc
2px-resolution spacing scale, 14–22px rounded cards on a near-white canvas,
shadows too faint to read as depth, an eyebrow above nearly every page title,
and twenty-odd **Unicode glyphs and one emoji** doing the work of an icon set
(`☰ ⌂ 🔔 ✎ ⌕ ◈ ◎ ◇ ↥ ▤ ≡ ⚙ ◷ 🗨 ⚠ ✓ ✔ ✕ ↙ ↗`).

### The direction

**A departmental noticeboard.** Every university department has one: a matte
board in a corridor with typed sheets squared onto it, each carrying a printed
header, a date, and a stamp. It was selected as candidate 4 of a seven-candidate
grounded list (seed key `d33d61b4`); the four catalogue challengers dealt against
it — a one-bit desktop, a nixie counter, a Kraftwerk line-diagram system, and an
LCARS console — each lost on audience identification, product clarity, or both.
The contract is recorded as an HTML comment in
[src/app/layout.tsx](../src/app/layout.tsx) and verified present in the
production build output.

The board earns its place because it does privacy work rather than decoration:

| Board fact | What it became |
|---|---|
| A notice is a flat sheet squared to the board | Hard-cornered white panels on a matte ground. No rounded cards, no resting shadows. |
| Notices are dated and carry a takedown date | Time is the first line of every object: opened, closes, submitted, published. |
| Status is a rubber stamp | A bordered word + a drawn shape + a tone. Never colour alone. |
| Battens with printed strip labels divide the board | Grouping is a hairline rule and a tracked-caps label, not another container. |
| Notices are *typed*; the board's labels are *printed* | **Two type registers.** Charter for text a human wrote; the platform sans for everything the system says. |
| An unsigned notice is completely normal | Anonymity reads as ordinary rather than suspicious — the product's hardest promise. |

The type split is the concept and it is load-bearing. On any staff screen you can
tell authored text from machine text without reading a word, which is what stops
a reworded public version from ever being mistaken for the original.

### Measured change

| | Before | After |
|---|---|---|
| Accents | 3 (plum, blue, green) + 8 category hues | 1 (institutional green) + amber and red as reserved signals |
| Radii in use | 4, 5, 6, 8, 9, 10, 11, 12, 14, 20, 22, 999 | 0, 2, 3 |
| Font sizes | 20 steps incl. 6 fractional | 12 steps, all whole-pixel, all in DESIGN.md frontmatter |
| Spacing values | ad-hoc 2px resolution (4…44) | strict 4/8/12/16/24/32/48/64 |
| Icons | 20 Unicode glyphs + 1 emoji | 27 authored SVGs, one stroke weight |
| Resting shadows | on cards, stats, hovers | none; two overlay shadows only (drawer, filter menu) |
| Dead CSS | ~500 lines of an unrendered shell | none |
| Out-of-scope feature CSS | hearts, comments, endorsements, pins, stars | none |
| `impeccable detect` | not run | **0 findings** |

---

## 2. Routes redesigned

All 16 page routes, plus the two API routes' shell states. Every one was opened
in a browser at five widths.

| Route | What changed |
|---|---|
| `/signin`, `/` (signed out) | Replaced the plum-gradient marketing card and its fake workspace preview with one posted notice: a headline, a lede, and **the four privacy terms stated in plain language before anyone signs in** — who can see a submission, that published answers are rewritten and anonymous, that nothing is on the public internet, that submission is final. |
| `/` (student) | One notice per class carrying only what decides the next move: course and term, section, state stamp, week, closing time and time remaining, and one named action. Pending-match status surfaces as an explanatory alert rather than a bare badge. |
| `/` (staff) | Same shape with real review counts; still no student card metrics and no decorative analytics. |
| `/sections/[id]` | The weekly form as a sheet: prompts in Charter at 18px, `REQUIRED`/`Optional` as words, the student's own question block visibly theirs in green wash with an expanded explanation of what staff can do with it, and a submit bar that states irreversibility beside the button. Fixed a real defect: the `<legend>` was being struck through by the fieldset rule on every question after the first. |
| `/sections/[id]` (submitted) | A confirmation notice that says what is now true, restates that edits are closed, and offers the two things still available. |
| `/sections/[id]/history` | Each week is a record; the student's own words, the private reply and the published answer are three separately labelled quotes. Added an explicit "no reply yet" state, which previously showed nothing. |
| `/sections/[id]/qa` | Avatars, the staff-answer "endorsed" pill and the category colour spectrum removed. Rows carry the question in Charter with topic, "Asked anonymously" and age. The detail closes with a sentence stating that the original message and its author are never shown. |
| `/teach/sections/[id]/review` | The submission is the object; the original wording sits quoted under **ORIGINAL WORDING — NEVER OVERWRITTEN**; private and public responses read as a timeline with drawn direction markers; validity is stated as "Counts towards participation" / "Participation credit removed" rather than a bare `valid`/`invalid`; the anonymity warning sits inside the public composer, next to the button that publishes. Rail reordered: destinations, then weeks, then topics. |
| `/teach/sections/[id]/publications` | Notices instead of cards; drafts, scheduled and failed states as stamps; empty state now explains where drafts come from. |
| `/teach/sections/[id]/matches` | Kept the confirm/reject separation and the "nothing is verified automatically" alert; restyled to the notice/stamp vocabulary. |
| `/teach/sections/[id]/import` | The CSV textarea moved to the monospace data register so pasted columns line up. |
| `/teach/sections/[id]/participation` | Figures are a bordered row of real counts; the matrix scrolls inside its own region. |
| `/teach/sections/[id]/backlog` | The stacked full-width filter form became a proper toolbar; empty state explains what the backlog is for. |
| `/teach/sections/[id]/setup` | Section details, teaching team, TA permission catalogue, schedule and cycle table on the new system; the stretched full-width submit button in the details grid now sizes to its content. |
| `/teach/sections/[id]/audit` | Toolbar and table restyled; empty state explains what gets recorded. |
| `/teach/courses`, `/teach/courses/[id]/templates`, `/admin` | Eyebrow kickers removed (the course code moved into the metadata line), notices and stamps applied, empty states given copy. |

---

## 3. Components and styles changed

**New**

- [src/components/ui/icons.tsx](../src/components/ui/icons.tsx) — 27 drawn icons
  on a 24×24 viewbox at 1.5px stroke, plus `StampMark` and `CategoryMark` solid
  shapes that read at 8px and survive grayscale.
- [src/app/fonts/](../src/app/fonts/) — Latin-subset Charter (Roman, Bold,
  Italic; ~60 KB total) with its Bitstream licence notice reproduced intact.
- `Notice`, `StripLabel`, `Quote`, `Figure`, `FigureRow`, `Category` in
  [src/components/ui/index.tsx](../src/components/ui/index.tsx).

**Rewritten**

- [src/app/globals.css](../src/app/globals.css) — rebuilt end to end. Same order
  of magnitude in size (2,282 → 2,102 lines) but the dead shell is gone and the
  replacement covers more surfaces.
- [src/components/layout/workspace-shell.tsx](../src/components/layout/workspace-shell.tsx)
  — white top bar with the account inline; the non-functional bell that linked
  to `/` was removed; the rail renders destinations → filters → other sections.
- [src/components/layout/nav.ts](../src/components/layout/nav.ts) — `icon` is now
  a key into a typed icon map, and nav items carry real counts.
- [src/components/layout/app-shell.tsx](../src/components/layout/app-shell.tsx) —
  the `eyebrow` prop was deleted outright; a `status` slot takes stamps beside
  the title.
- [src/lib/threads.ts](../src/lib/threads.ts) — the eight-hue category palette
  and the deterministic avatar colour wheel were deleted; categories now carry a
  label and a shape.
- `Badge` → `Stamp` across every page.

**Behaviour preserved exactly**

`weekly-form.tsx` keeps its one reason for being a client component — typed input
surviving a failed submission. `public-answer-composer.tsx` keeps the
acknowledgment guard and its field preservation, with `publishNow` still the
security backstop. Every server action, redirect, `revalidatePath` and audit call
is byte-for-byte unchanged.

---

## 4. Verification results

Captured with headless Chrome against the running application, signed in as the
seeded student, teacher and platform-admin accounts.

- **80 screenshots** per round: 16 screens × 5 widths (1440, 1024, 768, 390,
  320), three full rounds plus targeted re-probes.
- **Final round: `NO PROBLEMS DETECTED`** — no horizontal overflow, no HTTP
  error, no page error, no console error on any screen at any width.

Screens inspected directly at desktop and mobile: entry, student dashboard,
weekly form, history, Q&A archive, review inbox, publication queue, matches,
roster import, participation, backlog, setup, audit, courses, admin.

### Defects found by inspection and fixed

1. **`<legend>` struck through by the fieldset rule** on every weekly-form
   question after the first. Fixed by floating the legend.
2. **Horizontal page overflow at 320/390/768** on participation and setup. Root
   cause was not the tables: a `.visually-hidden` span inside a `<th>` is
   absolutely positioned, so its containing block was the initial containing
   block, and it escaped `.table-scroll` to widen the whole document by up to
   414px. Fixed by positioning table cells. A second contributing cause —
   grid items defaulting to `min-width: auto` — was fixed at the same time.
3. **`outline: none` on every field, select and textarea**, which violated the
   system's own focus invariant. Removed; pointer focus keeps the warm glow,
   keyboard focus gets the global ring, and the two no longer stack. Date and
   time inputs needed an explicit rule because Chrome delegates their focus to
   internal segments.
4. **Filter forms stacking to three full-width rows** on backlog, audit and
   admin. Replaced with a real toolbar.
5. **A stretched full-width submit** inside the setup details grid.
6. **Duplicated course code** in the rail (`DCS-101 DCS-101 Sec…`).
7. **A dangling top-bar divider** at phone widths after the context title hides.
8. **Seven bare empty states** with a title and nothing else.

---

## 5. Accessibility checks

Automated walk of the first 60 tab stops per page plus per-page structural
checks, on the home, review, setup and participation routes:

| Check | Result |
|---|---|
| First tab stop is the skip link | **Pass** on every page |
| Visible focus ring on every tab stop | **Pass** — 0 unringed controls after the fix (the 4 date/time inputs the script still flags were confirmed by screenshot to paint the 3px green ring; the flag is an artefact of tabbing through Chrome's internal date segments) |
| Every input, select and textarea programmatically labelled | **Pass** — 0 unlabelled |
| Duplicate `id` attributes | **Pass** — none |
| `<img>` without `alt` | **Pass** — none (there are no raster images; all icons are inline `aria-hidden` SVG) |
| Exactly one `<main>` and one `<h1>` | **Pass** |
| Named landmarks | **Pass** — `<nav aria-label="Workspace">`, `role="search"`, `aria-label` on the list pane |
| Status never by colour alone | **Pass** — every stamp is a word + a drawn shape + a tone; every category is a word + a shape |
| Body text contrast | `--ink` 15.9:1, `--ink-soft` 9.7:1, `--ink-muted` 5.9:1 on paper; `--green-deep` on white 8.4:1; white on `--green` 5.6:1 |
| `--ink-faint` (4.0:1) | Restricted to non-text and large-text use only, documented in DESIGN.md §3 |
| Reduced motion | `prefers-reduced-motion: reduce` kills every transition and animation globally |
| No-JS chrome | Drawer and filter are `<details>`; search is a GET form |
| 200% zoom | Layout is in relative units; verified usable |

---

## 6. Responsive checks

| Width | Result |
|---|---|
| 1440 | Full three panes (216 / 360 / fluid), single column at 1080px |
| 1024 | Rail 192, list 300, page column at `100% - 48px` |
| 768 | Panes stacked to the URL-driven single view; rail is a drawer |
| 390 | Page padding 16px, panels 16–24px, stacked submit bar, no overflow |
| 320 | Table cells tighten, entry screen full-bleed, no overflow |

Wide content (participation matrix, cycle table, CSV preview) scrolls inside its
own region; the page body never scrolls horizontally at any width.

---

## 7. Tests and checks run

| Command | Result |
|---|---|
| `npm run lint` | **Pass**, 0 problems |
| `npm run typecheck` | **Pass** |
| `npm test` | **Pass** — 6 files, 44 unit tests |
| `npm run test:integration` | **Pass** — 9 files, 115 integration tests |
| `npm run build` | **Pass** — 20 routes; shared JS 102 kB, unchanged |
| `impeccable detect` (`src/`) | **Pass** — 0 findings |

Baseline before the work started was identical on lint, typecheck and unit
tests, so nothing regressed.

### Detector findings and how they were resolved

The first detector run returned **112 advisory findings**, all of one kind:
`design-system-font-size` — a literal size off the ramp documented in
DESIGN.md's frontmatter. Two were genuine drift and were collapsed (a 22px
sign-in heading to the 20px panel step; a 26px figure value to the 24px object
step). The remaining ten steps were real, intentional and already described in
DESIGN.md §2's table but missing from the machine-readable frontmatter; the
frontmatter now carries all twelve. Final run: **0 findings**.

---

## 8. Backend and privacy verification

No file under `src/modules/`, `src/db/`, `src/lib/session.ts`,
`src/lib/staff-section.ts`, `src/modules/authz/` or `src/auth.ts` was modified.
The diff touches only `src/app/**/page.tsx`, `src/app/layout.tsx`,
`src/app/globals.css`, `src/components/**` and `src/lib/threads.ts` (a pure
presentation helper). All 115 integration tests — including the authorization,
matching, review-publishing and participation suites — pass unchanged.

Specifically re-confirmed by reading the rendered output:

- No student route renders source identity, staff notes, validity or
  invalidation reasons, review state, dispositions, drafts, audit records or
  participation totals. The student projections still come from
  `getStudentHistory` and `listSectionQa`, which exclude them at the data layer.
- The Q&A archive shows "Asked anonymously" and closes with an explicit
  statement that the original message and its author are never shown.
- Identity masking for a TA without `view_student_identities` still happens in
  the data; the UI shows "Identity hidden" and an explanatory alert.
- The anonymity acknowledgment is still checked before any write, and
  `publishNow` still re-checks against the persisted row.
- No authorization decision moved into a client component. The two client
  components hold form state only.
- Navigation is still derived from the same effective permissions the server
  enforces, and hiding a link is still not authorization.

No deferred MVP feature was added. Several were **removed**: the stylesheet's
hearts, comments, endorsements, pins and stars are gone, as is the
non-functional notification bell.

---

## 9. Specification changes

- **[DESIGN.md](../DESIGN.md) replaced.** It previously documented the incumbent
  implementation including its drift; it is now the design authority, with
  twelve numbered sections covering visual personality, typography, colour
  roles, spacing, borders/radius/elevation, buttons and forms, navigation
  behaviour, the student/staff density split, state presentation, breakpoints,
  24 forbidden anti-patterns, and where the system lives. Its frontmatter is the
  machine-readable token and type ramp the detector holds.
- **[docs/UX-DESIGN-BRIEF.md](UX-DESIGN-BRIEF.md)** — marked superseded for
  tokens, with a note explaining which of its goals were kept and which values
  changed. Its layout, hierarchy, forms, review-queue, privacy-confirmation and
  accessibility sections still hold.
- **[docs/CLAUDE_UI_SCREEN_SPEC.md](CLAUDE_UI_SCREEN_SPEC.md)** — marked
  superseded for tokens and layout geometry. Its screen specifications,
  reference-translation table, viewport list and visual QA checklist remain the
  acceptance criteria and are all met.
- **[docs/CURRENT_STATE.md](CURRENT_STATE.md)** — UI maturity section rewritten;
  verification table updated.

No product rule, MVP boundary, privacy invariant or open decision changed.

---

## 10. Unresolved issues

Carried forward, all pre-existing:

1. **No browser end-to-end suite in the repository.** Verification for this pass
   used a scripted headless-Chrome harness run from a scratch directory against
   the dev server. It is not committed, because adding Playwright would add a
   dependency, and `AGENTS.md` reserves that for an explicit request. If a
   browser suite is wanted, that is the first thing to add.
2. **Chrome is not installable in this environment.** The screenshots were taken
   with a cached Chrome binary plus two Ubuntu libraries extracted locally.
   Reproducing them elsewhere needs `npx playwright install --with-deps`.
3. **Merge UI still absent.** `draftPublicAnswer` accepts several source items
   and is tested, but the review inbox still offers the single-item flow only.
   Nothing in this redesign blocks it; the composer would take a source list.
4. **No loading states.** Pages are server-rendered per navigation, so the
   browser's own progress is the only feedback. DESIGN.md §9 specifies what a
   structural `loading.tsx` should look like when one is added; none exists yet.
5. **Match correction, cycle question editing and a course-level backlog route**
   remain service-layer capabilities with no UI, exactly as before.
6. **Charter's licence requires the Bitstream notice to travel with the font.**
   It is reproduced in [src/app/fonts/LICENSE.md](../src/app/fonts/LICENSE.md);
   keep it there if the files move.
7. **The dashboard is sparse with one class.** With a single section the page has
   a lot of empty board beneath it. That is honest — there is genuinely nothing
   else — but it is worth revisiting once a real roster shows how many sections a
   typical student carries.

---

## 11. Merge with `main` (2026-08-05, same day)

`origin/main` had moved 14 commits ahead while this redesign was in flight —
PR #3, "complete proj specs": 103 files, +26,784 lines. It added two migrations,
an email module, a rich-text pipeline, a student roster-claim flow at `/claim`,
response draft/edit/lock, three-state validity with a flag-vs-finalize split,
export tabulation, pagination, and accessible charts. It also widened the MVP
boundary in `AGENTS.md` and `docs/mvp-scope.md`, so notifications and editing a
submitted response are now in scope by owner decision; those documents supersede
the copies this branch was cut from.

Main was merged in rather than the redesign being landed on top of it, because
main's new UI was written against the old stylesheet: `/claim` and
`roster-claim.tsx` used `card`, `card--padded` and `stack-gap`, all of which this
redesign deleted. Merging the other way would have shipped two unstyled surfaces.

**Ten files conflicted.** Each was resolved by keeping main's functionality and
re-expressing it in this system, never by taking one side wholesale:

| File | Resolution |
|---|---|
| `layout.tsx` | Both sides kept: the Charter font wiring and main's KaTeX stylesheet import. |
| `page.tsx` | Kept the redesigned dashboard; added main's `/claim` call to action as a notice, and repointed the unmatched copy at it. |
| `sections/[id]/page.tsx` | Started from main (draft/edit/lock, rich prompts, revision guard), then re-applied the redesigned shell, closed-week state and corrected copy. |
| `teach/.../review/page.tsx` | Started from the redesign, then ported main's five validity actions, `ValidityBadge`, and the validity timeline into it. |
| `teach/.../matches/page.tsx` | Kept main's claim requests, audited unlink and last-4-only numbers; normalised the vocabulary and labelled three inputs main left unlabelled. |
| `teach/.../audit/page.tsx` | Took main's pagination; moved its scope alert into the page description. |
| `teach/courses/[id]/templates/page.tsx` | Took main's student-section configuration props. |
| `staff/roster-import.tsx` | Took main's XLSX upload and editable preview wholesale, then re-applied the vocabulary and the monospace data register for pasted CSV. |
| `student/weekly-form.tsx` | Took main's repeatable questions, general comment and lifecycle, then re-applied the question/own-item structure, word-not-asterisk markers and submit bar. |
| `docs/CURRENT_STATE.md` | Took main's feature status; re-applied the UI maturity section. |

### Defects found and fixed during the merge

1. **Accessibility regression in main's weekly form.** Main inlined the
   `aria-invalid` / `aria-describedby` attributes and lost the shared helper, so
   grouped controls (radios, checkboxes, scales) were no longer marked invalid at
   all — only the plain inputs were. `tests/unit/qa-remediation.test.ts` exists
   on this branch to guard exactly that, and it failed. The helper was restored
   and applied to the groups as well.
2. **Three unlabelled inputs** on main's new controls: the student-visible reason
   on invalidate, the flag note, and the claim-reject and unlink reasons. All now
   carry a programmatic label.
3. **Main's appended CSS referenced deleted tokens** — `var(--accent-strong,
   #1d4ed8)`, `var(--surface-muted, #f1f3f5)`, `var(--border, #d5d9df)` — so it
   silently fell back to a blue link, grey code blocks and 8px radii. The whole
   rich-text, pagination, filter and chart block was retokenised onto this system.
4. **Pagination used `‹` and `›` glyphs** as icons; replaced with the drawn set.
5. **Main's `FilterBar` and `.table` duplicated** primitives this system already
   has; both now render as `.toolbar` and `.data-table`.
6. **`#666`** in an email template, replaced with `--ink-muted`'s literal value
   and a comment explaining why a hex is correct in an email body.

### Verification after the merge

| Check | Result |
|---|---|
| `npm run lint` | **Pass**, 0 problems |
| `npm run typecheck` | **Pass** |
| `npm test` | **Pass** — 7 files, 69 unit tests |
| `npm run test:integration` | **Pass** — 12 files, 172 integration tests |
| `npm run build` | **Pass** — 21 routes; direction contract still in the build output |
| `impeccable detect` (`src/`) | **Pass** — 0 findings |
| Screenshots, 17 screens × 5 widths | **Pass** — `NO PROBLEMS DETECTED`: no overflow, no HTTP error, no console error |
| Keyboard audit, 5 routes | **Pass** — 188 tab stops, 0 unringed, 0 unlabelled, 0 duplicate ids |
| Class audit | **Pass** — every `className` in `src/` resolves to a defined rule |

Both databases needed main's migrations (`npm run db:migrate`, and the same with
`DATABASE_URL` pointed at the test database). The existing dev roster also needed
`npm run db:backfill:student-numbers`, because main encrypts student numbers and
the pre-migration rows had no ciphertext — without it the claim flow correctly
reported "that number is not on any class list".

The claim → confirm → submit → review path was then driven end to end in the
browser to populate the inbox and confirm the merged surfaces render with real
data.

### Still open after the merge

- The **student-visible reason** inputs on the staff validity controls use a
  placeholder plus a visually-hidden label rather than a visible one. They are
  programmatically labelled, but DESIGN.md §6 prefers a visible label; in a dense
  inline control row three visible labels crowd the action. Worth revisiting.
- Main's `scripts/backfill-student-numbers.ts` prints a follow-up: once the
  backfill has verified on a target database, the plaintext
  `student_records.student_number` column is redundant and should be dropped in
  its own migration. Not done here — it is a schema change, not a UI one.
- The surfaces main added were brought onto the system and verified, but they
  have not had a full design pass of their own: `/claim`, the roster preview
  table and the validity timeline are correct and consistent rather than
  considered. They are the obvious next slice.

## 12. Commits

| Commit | Contents |
|---|---|
| `0675140` | The product, intent and journey documents that were already in the working tree before this work began, committed separately so the redesign history stays about the interface. |
| `c6b325c` | DESIGN.md and the Charter subset. |
| `4f8d44d` | The design system: tokens, stylesheet, icons, primitives, shell, navigation. |
| `4487e94` | The student experience. |
| `1156e0a` | The staff and operational surfaces. |

A safety branch, `backup/ui-redesign-pre-split`, holds the pre-split history and
can be deleted once this is reviewed.
