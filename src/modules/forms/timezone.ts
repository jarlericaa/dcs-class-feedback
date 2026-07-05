/**
 * Minimal timezone math (no dependency): convert a wall-clock date/time in a
 * named IANA timezone to a UTC Date. Sufficient for MVP (Asia/Manila has no
 * DST); the two-pass offset correction still handles DST zones correctly for
 * all non-ambiguous local times.
 */

function tzOffsetMs(atUtc: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(atUtc)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour! === 24 ? 0 : parts.hour!,
    parts.minute!,
    parts.second!,
  );
  return asUtc - atUtc.getTime();
}

/** Wall-clock (y, m, d, hh:mm:ss) in `timeZone` → UTC instant. */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = tzOffsetMs(new Date(guess), timeZone);
  // second pass in case the guess crossed a transition
  offset = tzOffsetMs(new Date(guess - offset), timeZone);
  return new Date(guess - offset);
}

/** Parse "HH:MM" or "HH:MM:SS". */
export function parseTime(time: string): { h: number; m: number; s: number } {
  const [h = 0, m = 0, s = 0] = time.split(":").map(Number);
  return { h, m, s };
}

/** Parse "YYYY-MM-DD". */
export function parseDate(date: string): { y: number; mo: number; d: number } {
  const [y = 1970, mo = 1, d = 1] = date.split("-").map(Number);
  return { y, mo, d };
}

/** Day-of-week (0=Sunday) of a calendar date, timezone-independent. */
export function dayOfWeek(y: number, mo: number, d: number): number {
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

/** Add days to a calendar date. */
export function addDays(
  y: number,
  mo: number,
  d: number,
  days: number,
): { y: number; mo: number; d: number } {
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
