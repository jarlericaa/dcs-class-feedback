import { cookies } from "next/headers";
import { RAIL_COLLAPSED, RAIL_COOKIE } from "@/lib/rail-cookie";

/**
 * Whether the reader has collapsed the workspace rail (decision N-2).
 *
 * **Server only.** The cookie's name lives in `@/lib/rail-cookie`, which has no
 * imports, because `RailToggle` is a client component and needs the same two
 * strings — importing them from here would pull `next/headers` into the browser
 * bundle and fail the build.
 *
 * A cookie, read on the SERVER, and that is the whole point: this app
 * re-renders per navigation, so a preference held only in the browser would
 * paint the rail expanded and snap it narrow after hydration — on every page
 * load. Reading it here means the first paint is already right.
 *
 * Why not `localStorage`: the flash above. Why not a column on `users`: this is
 * a display preference on one device, not a fact about a person; the same rail
 * on their phone should be free to differ. §6.5 reaches the same conclusion for
 * the dark-mode toggle, so the app has one answer to "where does a viewer
 * preference live" rather than two.
 *
 * The cookie is NOT `httpOnly`, unlike `cf-reviewed`: the toggle writes it from
 * the client so the rail responds to a click immediately instead of after a
 * round trip. That is safe because the value is one of two strings and carries
 * no identity — the worst a tampered cookie can do is render the reader's own
 * rail in the shape they did not pick.
 */

/**
 * Expanded is the default, deliberately. A reader who has never touched the
 * chevron gets labels, because an icon rail is only legible once you have
 * learned it — and in this app several rows share the `course` glyph (N-3).
 */
export async function readRailCollapsed(): Promise<boolean> {
  return (await cookies()).get(RAIL_COOKIE)?.value === RAIL_COLLAPSED;
}
