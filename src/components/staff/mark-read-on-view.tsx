"use client";

import { useEffect, useRef } from "react";

/**
 * Marks a response read once it has actually been on screen.
 *
 * The manual "Mark as read" button asked the reader to tell the page something
 * the page could see for itself, once per response, down a whole week of a
 * class list. Reading is the act; pressing a button afterwards is bookkeeping.
 *
 * Three deliberate constraints:
 *
 * 1. **Dwell, not appearance.** A response has to hold a majority of its own
 *    area on screen for {@link DWELL_MS} before it counts. Flicking past on the
 *    way to the bottom of the list is not reading, and marking those read would
 *    lose exactly the pile the reader was trying to keep.
 * 2. **Once, ever.** The observer disconnects on the first fire, and the write
 *    is idempotent server-side anyway (`onConflictDoNothing`), so a re-render
 *    cannot produce a second call.
 * 3. **No re-render.** The action deliberately does not revalidate: having the
 *    Unread marker vanish out from under the response you are still reading —
 *    or worse, having the row leave the list while the "Unread only" filter is
 *    on — is the page rearranging itself as a reward for reading it. The state
 *    is correct on the next load, which is when it matters.
 *
 * With JavaScript off nothing fires and nothing breaks: the response simply
 * stays unread, and "Mark as unread"/read state remains reachable through the
 * post's own controls.
 */

/** How long a response must hold the viewport before it counts as read. */
const DWELL_MS = 1200;
/** How much of it has to be visible for that dwell to be running. */
const VISIBLE_RATIO = 0.6;

export function MarkReadOnView({
  responseId,
  action,
}: {
  responseId: string;
  /** Server action. Quiet — it must not redirect or revalidate. */
  action: (responseId: string) => Promise<void>;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  /** Guards against a second fire between the observer callback and unmount. */
  const fired = useRef(false);

  useEffect(() => {
    /**
     * The post itself is what has to be seen, not this marker — a zero-size
     * span at the top of a tall response would be "visible" the moment the
     * response's first line appeared, which is the flick-past case above.
     */
    const post = anchor.current?.parentElement;
    if (!post) return;
    if (typeof IntersectionObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (fired.current) return;
          /**
           * Either the response mostly fills the viewport, or the viewport
           * mostly holds the response. The second half is not a nicety: a long
           * answer taller than the window can never reach 60% of ITSELF, so
           * the ratio test alone would leave exactly the responses that take
           * longest to read permanently unread.
           */
          const root = entry.rootBounds?.height ?? window.innerHeight;
          const seen =
            entry.intersectionRatio >= VISIBLE_RATIO ||
            (root > 0 &&
              entry.intersectionRect.height >= root * VISIBLE_RATIO);
          if (seen) {
            if (timer === undefined) {
              timer = setTimeout(() => {
                fired.current = true;
                observer.disconnect();
                cancel();
                /* Fire and forget. A failed write leaves the response unread,
                   which is the safe direction: the reader can still see it. */
                void action(responseId).catch(() => {});
              }, DWELL_MS);
            }
          } else {
            /* Scrolled back out before the dwell elapsed — it was passed, not
               read, so the clock starts again next time. */
            cancel();
          }
        }
      },
      /**
       * Granular thresholds, because the callback only runs when one is
       * CROSSED. A response three viewports tall tops out around a third of
       * itself visible, so a `[0, 0.6]` list would fire once at the top edge —
       * with a sliver on screen, failing both tests — and then never again.
       * Every tenth gives the viewport-fill test above a chance to run as the
       * response scrolls through.
       *
       * `rootMargin` trims the sticky top bar out of the measurement, so a
       * response hidden behind it does not count as seen.
       */
      {
        threshold: Array.from({ length: 11 }, (_, i) => i / 10),
        rootMargin: "-52px 0px 0px 0px",
      },
    );
    observer.observe(post);
    return () => {
      cancel();
      observer.disconnect();
    };
  }, [action, responseId]);

  return <span ref={anchor} hidden aria-hidden="true" />;
}
