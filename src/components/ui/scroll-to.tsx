"use client";

import { useEffect } from "react";

/**
 * Puts the reader back where they were acting.
 *
 * A server action's redirect drops the URL fragment, so `#r-<id>` cannot carry
 * the position on its own — after replying to the eleventh post you would land
 * back at the top of the column. The action names the post in a query parameter
 * instead and this restores it.
 *
 * `block: "center"` rather than "start": the post is already familiar, and
 * pinning it to the top hides the ones above it that the reader was working
 * through. No smooth scroll — a jump the reader did not ask for should not also
 * be an animation, and this is exactly the case `prefers-reduced-motion` is
 * about.
 *
 * Without JavaScript nothing happens and the page simply opens at the top,
 * which is the behaviour before this existed.
 */
export function ScrollToPost({ anchorId }: { anchorId: string }) {
  useEffect(() => {
    const target = document.getElementById(anchorId);
    target?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [anchorId]);
  return null;
}
