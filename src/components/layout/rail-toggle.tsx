"use client";

import { useState } from "react";
import { IconChevron } from "@/components/ui/icons";
// `rail-cookie`, NOT `rail-state`: that module imports `next/headers`, and one
// import from a "use client" file pulls in the whole thing.
import { RAIL_COLLAPSED, RAIL_COOKIE } from "@/lib/rail-cookie";
import { cn } from "@/lib/cn";

/**
 * The chevron that collapses the rail (decisions N-1, N-2; `sidebar.md` §3).
 *
 * **It lives inside the rail, at its top-right**, which §3 calls the most
 * important requirement in the spec — and which is only safe because of a
 * change made alongside it. An earlier version put it here, and the collapse
 * appeared not to work: clicking left the button focused, the rail expanded on
 * `:focus-within` so a keyboard reader could read its labels, and those two
 * facts held the rail open at full width immediately after being asked to
 * close. It was moved to the header to escape that.
 *
 * `sidebar.md` removes the cause rather than the symptom. §5 says the rail
 * should push the layout "rather than sitting over the content", so the
 * hover-and-focus expansion is gone: collapsed means 72px, and the labels come
 * from tooltips instead. With nothing re-expanding the rail, the control can
 * sit in it, and the click now collapses it at once.
 *
 * **The reader drives this, not the route.** §10.4.2 originally asked for the
 * rail to collapse *because* you were inside a course; the owner chose a
 * control instead, and that is the better answer — a rail that changed width as
 * you navigated is the instability §12 spent its effort removing.
 *
 * **Why a client component when almost no other chrome is.** The shell's rule is
 * that its chrome works before hydration, and this keeps it: the server renders
 * the correct shape from the cookie, every link works, the tooltips are the
 * browser's. Only the *toggle* wants JavaScript, and a preference control may
 * where a destination may not.
 *
 * It writes the cookie and flips `data-rail` on the rail in the same click: the
 * attribute is what the CSS reads, so the width responds immediately, and the
 * cookie is what makes the choice survive the next navigation. A server action
 * would have meant a round trip to change a width.
 */
export function RailToggle({ collapsed }: { collapsed: boolean }) {
  // Seeded from the server's value, so there is no first-render disagreement to
  // reconcile — the attribute already says what this says.
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  function toggle() {
    const next = !isCollapsed;
    setIsCollapsed(next);
    /*
      One year, `path=/` so it applies to every route, and `SameSite=Lax` so it
      rides ordinary navigation. Not `Secure`, because development is http; the
      value is a display preference, so there is nothing here worth protecting
      from a network observer.
    */
    document.cookie = `${RAIL_COOKIE}=${next ? RAIL_COLLAPSED : ""}; path=/; max-age=${
      next ? 60 * 60 * 24 * 365 : 0
    }; samesite=lax`;
    /*
      `#ws-body` by id, not the first `[data-rail]` in the document. The state
      sits on the body because both the rail and the collapse handle — which is
      a sibling of the rail, not a child (`sidebar.md` §4) — have to read it.
      A loose selector would have been a coin flip between elements.
    */
    document
      .getElementById("ws-body")
      ?.setAttribute("data-rail", next ? "min" : "full");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex items-center justify-center",
        /*
          28x36 — thicker than the 20x28 it started at, on the owner's note
          ("make this thicker"). Still taller than wide, so it reads as a handle
          pulled out of the sidebar's edge rather than a button parked on it,
          but with enough body to be an obvious target: half of it overhangs the
          page, and 20px of that was a sliver.
        */
        "h-9 w-7 shrink-0 rounded-control",
        /*
          A LIGHTER GREEN than the rail, with a near-white chevron — sampled
          from the reference rather than guessed, and this is the third attempt
          at "make it visible".
          
          Why the first two failed, because it is the same trap twice: this
          handle straddles the boundary between the dark rail and the cream
          page, so it is the one element that must be legible against BOTH
          grounds. `bg-transparent` vanished into each of them. A pale
          `--accent-wash` fill was visible but read as a stray blob sitting on
          the seam rather than as part of the sidebar.
          
          The reference's answer is to make the handle a piece of the sidebar
          pulled out of it: `--rail-handle` at 1.95:1 against the rail (a step
          you can see, where `--rail-raised`'s 1.25 was not) and 5.65:1 against
          the page, with `--rail-ink` on it at 5.5:1.
          
          `shadow-overlay` is the sanctioned elevation and it is legal here:
          this genuinely covers content, which is DESIGN.md §5's test.
        */
        "border-0 bg-rail-handle text-rail-ink shadow-overlay",
        "transition-colors duration-120",
        "hover:bg-rail-raised",
        "active:bg-rail-deep active:not-disabled:duration-0",
      )}
      // The control's name says what it DOES, not what it is, and it changes
      // with the state — a button permanently labelled "Collapse" is a button
      // that lies half the time.
      aria-label={isCollapsed ? "Expand the sidebar" : "Collapse the sidebar"}
      aria-expanded={!isCollapsed}
    >
      <IconChevron
        size={14}
        aria-hidden="true"
        /*
          The chevron points the way the rail will MOVE, which is §3's
          convention: left while expanded (click to close), right while
          collapsed (click to open). `IconChevron` draws it pointing right, so
          the expanded state is the rotated one.
        */
        className={cn(
          "transition-transform duration-200",
          !isCollapsed && "rotate-180",
        )}
      />
    </button>
  );
}
