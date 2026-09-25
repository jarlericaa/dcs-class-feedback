/**
 * Token values that something outside CSS has to know.
 *
 * The authority for every colour in this app is the `@theme` block in
 * `src/app/globals.css` — a hex appears there once and nowhere else (DESIGN-TODO
 * §2.1). Next's `viewport.themeColor` is the one consumer that cannot read it:
 * it is static metadata, emitted into `<meta name="theme-color">` at build time,
 * long before any stylesheet is parsed. So the value has to be repeated here.
 *
 * What keeps the repetition honest is not this comment — it is
 * `tests/unit/theme-tokens.test.ts`, which parses `--color-board` out of
 * `globals.css` and fails if the two ever disagree. That is the difference
 * between "please keep these in step" and the browser chrome being unable to
 * drift from the page (§2.3).
 */

/** `--color-board` — the stone ground the whole app sits on. */
export const BOARD = "#f1f0ee";
