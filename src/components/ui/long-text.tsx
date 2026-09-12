"use client";

import { useEffect, useState } from "react";
import { isLongText, LONG_TEXT_LINES } from "@/lib/long-text";

/**
 * A long written answer, collapsed to its first few lines with a way to open it.
 *
 * Clamped only AFTER hydration, which is the whole reason this is a client
 * component rather than a `<details>`. A server-rendered clamp would hide part
 * of a student's answer from anyone whose JavaScript had not run — and the
 * button that reveals it would not work either, so the text would simply be
 * gone. Rendering it whole first and collapsing once the control exists means
 * nothing is ever unreachable; the cost is one reflow on a post that was going
 * to be tall anyway.
 *
 * Not a `<summary>` holding the text: a disclosure's accessible name is its
 * summary's content, so that pattern names the button with the entire answer
 * and leaves a screen-reader user with no separate text to read. Here the
 * button says what it does and the answer stays a quotation.
 */
export function LongText({
  text,
  surface = "quote",
}: {
  text: string;
  /** A quiet bordered answer surface on staff review screens. */
  surface?: "quote" | "quiet";
}) {
  const long = isLongText(text);
  /**
   * Both renders agree on "not clamped" until this flips, so there is no
   * hydration mismatch — the same reason `Dialog` defers its portal.
   */
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setHydrated(true), []);

  const clamped = long && hydrated && !open;

  return (
    <div className={`longtext${surface === "quiet" ? " longtext--quiet" : ""}`}>
      <blockquote
        className={`post__words${clamped ? " post__words--clamped" : ""}`}
      >
        {text}
      </blockquote>
      {long && hydrated && (
        <button
          className="longtext__toggle"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          {open
            ? "Show less"
            : `Show the whole answer (first ${LONG_TEXT_LINES} lines shown)`}
        </button>
      )}
    </div>
  );
}
