"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Says out loud what just happened (§5.4).
 *
 * **§5.4's premise needed correcting before it could be built, and the
 * correction is the useful part.** The item was opened on the measurement
 * `grep aria-live → 0`, and concluded the app tells a screen-reader user
 * nothing. That grep was reading the attribute rather than the semantics:
 * `Alert` has carried `role="alert"` / `role="status"` all along — which
 * *imply* `aria-live="assertive"` / `"polite"` — and all 30 outcome banners in
 * the app go through it. The two client-mutating forms (`weekly-form`,
 * `add-staff-dialog`) render their results through `Alert` too, so those
 * announce correctly today and always did.
 *
 * **What is genuinely missing is narrower and less obvious.** A live region
 * announces *mutations*. Every page-level outcome in this app arrives as a
 * FULL DOCUMENT LOAD — a server action redirects to `?ok=Course+created.` —
 * so the banner is present at parse time, which is not a mutation. `role=alert`
 * is announced at load by most screen readers; `role="status"` generally is
 * not. So every **success** in the app has been silent, and success is the case
 * where the reader most needs to know the thing worked.
 *
 * The fix cannot be "make success assertive": DESIGN.md §9 says a success is
 * `role="status"`, and it is right — an accomplishment should not interrupt.
 * So this component renders an **empty** polite region on the server and fills
 * it after mount, which makes the text a mutation and therefore announced,
 * once, politely, without touching the visible banner's semantics.
 *
 * It renders nothing visible. The `Alert` beside it is what a sighted reader
 * sees, and this is deliberately not a second copy of it on screen — one
 * message, two channels.
 *
 * **It reads the outcome itself rather than being handed it**, which is why
 * this is one line in the shell instead of an edit to thirty pages. Every
 * outcome in this app is already a search parameter — `?ok=` or `?error=`,
 * because a server action redirects with it — so the source of truth is in the
 * URL and a prop threaded through `AppShell` would just be a second copy of it
 * that a page could forget to pass. Exactly the reasoning 12f.2 used for the
 * breadcrumb's last crumb.
 */
export function Announcer() {
  const params = useSearchParams();
  /*
    `error` before `ok`: a request that produced both is a request that failed
    after partially succeeding, and the failure is the thing the reader needs.
  */
  const message = params.get("error") ?? params.get("ok");
  /*
    Empty on the server and on the first client render, then filled.

    Both halves matter. Empty on the server is what makes the text a change
    rather than initial content. And the region has to EXIST from the first
    paint — a live region inserted into the DOM already populated is not
    reliably announced either, because the screen reader has to be observing it
    before the text lands.
  */
  const [announced, setAnnounced] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    /*
      One frame's delay, and it is not superstition: filling the region in the
      same tick as hydration puts the mutation inside the initial render batch,
      where several screen readers treat it as page content and skip it. A
      `requestAnimationFrame` puts it clearly after.
    */
    const frame = requestAnimationFrame(() => setAnnounced(message));
    return () => cancelAnimationFrame(frame);
  }, [message]);

  return (
    <p aria-live="polite" className="visually-hidden">
      {announced}
    </p>
  );
}
