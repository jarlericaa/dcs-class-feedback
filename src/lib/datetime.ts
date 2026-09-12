import { env } from "@/env";

/**
 * Server-rendered dates must not depend on the server's own locale/timezone —
 * that produces output nobody asked for and hydration mismatches. Everything
 * is formatted explicitly in the institution timezone (Open D7).
 */

const DEFAULT_ZONE = env.INSTITUTION_TIMEZONE;

export function formatDateTime(
  value: Date | null | undefined,
  timeZone: string = DEFAULT_ZONE,
): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

export function formatDate(
  value: Date | null | undefined,
  timeZone: string = DEFAULT_ZONE,
): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

/**
 * "4:38 pm" — the clock half of a timestamp, on its own.
 *
 * A list of submissions compares days first and minutes second, so the two
 * halves are set on two lines and each needs its own formatter. Same explicit
 * timezone as everything else here: never the server's.
 */
export function formatTime(
  value: Date | null | undefined,
  timeZone: string = DEFAULT_ZONE,
): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

/** "Friday, 5:00 pm" — the deadline phrasing used across cycle status text. */
export function formatDeadline(
  value: Date | null | undefined,
  timeZone: string = DEFAULT_ZONE,
): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

/** Coarse relative phrasing for deadlines. Never the only signal shown. */
export function timeRemaining(deadline: Date, now: Date = new Date()): string {
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return "closed";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} minutes left`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} left`;
}

/** Initials for the account avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
