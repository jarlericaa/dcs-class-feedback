/**
 * The rail-collapse cookie's name and its one meaningful value.
 *
 * **Deliberately a module with no imports at all.** Both sides of the
 * server/client boundary need these two strings: the shell reads the cookie on
 * the server, and `RailToggle` writes it in the browser. They started out next
 * to `readRailCollapsed()` in `rail-state.ts` — which imports `next/headers` —
 * and that broke the build outright: a `"use client"` file importing one export
 * pulls in the whole module, so a server-only dependency reached the client
 * bundle.
 *
 * Keeping the constants here means the cookie still has exactly one definition
 * while neither side drags the other's dependencies along. Nothing that touches
 * `next/headers`, `next/navigation` or the database may be added to this file.
 */

export const RAIL_COOKIE = "cf-rail";

/** The collapsed value. Anything else, including absent, means expanded. */
export const RAIL_COLLAPSED = "min";
