import { describe, expect, it } from "vitest";

import {
  isLongText,
  LONG_TEXT_CHARS,
  LONG_TEXT_LINES,
} from "@/lib/long-text";

/**
 * When a written answer is long enough to be worth collapsing.
 *
 * The predicate decides whether a reader is offered a "show the whole answer"
 * control at all, so both mistakes cost something: collapsing a short answer
 * charges a click for two lines they could already read, and leaving a long one
 * open buries the responses after it.
 */
describe("isLongText", () => {
  it("says no to nothing at all", () => {
    expect(isLongText("")).toBe(false);
    expect(isLongText(null)).toBe(false);
    expect(isLongText(undefined)).toBe(false);
    // Whitespace is not content: an answer of blank lines must not be offered
    // a control that reveals more blank lines.
    expect(isLongText("   \n\n\t  \n ")).toBe(false);
  });

  it("says no to an ordinary answer", () => {
    expect(isLongText("The pace was fine.")).toBe(false);
    expect(isLongText("Line one\nLine two\nLine three")).toBe(false);
  });

  it("clamps on length, and not one character sooner", () => {
    const atLimit = "x".repeat(LONG_TEXT_CHARS);
    expect(isLongText(atLimit)).toBe(false);
    expect(isLongText(`${atLimit}x`)).toBe(true);
  });

  /**
   * A wall of short lines is as tall as a paragraph of the same length, and a
   * character count on its own cannot see it — a pasted list is the common
   * case.
   */
  it("clamps on line count too, even when the text is short", () => {
    const lines = (n: number) =>
      Array.from({ length: n }, (_, i) => `item ${i}`).join("\n");
    expect(lines(LONG_TEXT_LINES).length).toBeLessThan(LONG_TEXT_CHARS);
    expect(isLongText(lines(LONG_TEXT_LINES))).toBe(false);
    expect(isLongText(lines(LONG_TEXT_LINES + 1))).toBe(true);
  });

  it("counts a CRLF break once, not twice", () => {
    const crlf = Array.from(
      { length: LONG_TEXT_LINES },
      (_, i) => `item ${i}`,
    ).join("\r\n");
    expect(isLongText(crlf)).toBe(false);
  });

  it("ignores padding around an otherwise short answer", () => {
    expect(isLongText(`\n\n   Short.   \n\n`)).toBe(false);
  });

  /**
   * One unbroken word can still overflow a column, so length decides on its
   * own rather than only in combination with breaks.
   */
  it("clamps a single very long word", () => {
    expect(isLongText("y".repeat(LONG_TEXT_CHARS * 2))).toBe(true);
  });
});
