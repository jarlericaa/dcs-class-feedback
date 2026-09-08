/**
 * Is a student's written answer long enough to be worth collapsing?
 *
 * The review column reads thirty responses in a row, and one person's essay
 * should not push the next twenty-nine off the screen. But collapsing a short
 * answer is worse than leaving it: the reader pays a click to see two lines
 * they could already have read, and the control itself becomes noise.
 *
 * Two thresholds, because "long" has two shapes and either one makes a post
 * tall. A wall of short lines — a pasted list, a stack of one-line thoughts —
 * takes as much vertical room as a paragraph of the same character count, and
 * a character count alone cannot see it.
 *
 * Deliberately a pure function with no DOM in it: the real rendered height
 * depends on the container's width, which the server does not know, and
 * measuring it in the browser would mean laying the whole column out twice.
 * An honest estimate that is stable between the server and the client beats an
 * exact one that flickers.
 */

/** Lines kept visible while an answer is collapsed. Mirrored in `globals.css`. */
export const LONG_TEXT_LINES = 8;

/** Characters past which a paragraph is treated as long, regardless of breaks. */
export const LONG_TEXT_CHARS = 520;

export function isLongText(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > LONG_TEXT_CHARS) return true;
  // `split` on the newline itself, so `\r\n` does not count twice.
  return trimmed.split(/\r?\n/).length > LONG_TEXT_LINES;
}
