/**
 * Weekday names, 0 = Sunday, matching the day-of-week columns on a delivery
 * schedule.
 *
 * Lives here rather than in modules/forms/schedules because a "use client"
 * component needs it, and importing a server module into one drags the whole
 * database layer into the client bundle.
 */
export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
