import { env } from "@/env";

/**
 * Presentation helpers for the thread-style workspace: category colours,
 * compact relative times, and date grouping for the list pane.
 *
 * The information architecture follows docs/CLAUDE_UI_SCREEN_SPEC.md
 * "Reference translation" — course rail, category list, dense list, selected
 * detail. Nothing here implements a product rule.
 */

export type CategorySlug =
  | "content"
  | "logistics"
  | "misc"
  | "general"
  | "lectures"
  | "sections"
  | "problem-sets"
  | "assignments"
  | "midterm"
  | "final-exam"
  | "social";

export const QUESTION_CATEGORIES = [
  { slug: "content" as const, label: "Course content" },
  { slug: "logistics" as const, label: "Logistics" },
  { slug: "misc" as const, label: "Something else" },
];

export function categoryLabel(value: string | null | undefined): string {
  return (
    QUESTION_CATEGORIES.find((c) => c.slug === value)?.label ?? "Uncategorised"
  );
}

/** Short label used inside dense list rows. */
export function categoryShortLabel(value: string | null | undefined): string {
  switch (value) {
    case "content":
      return "Content";
    case "logistics":
      return "Logistics";
    case "misc":
      return "Other";
    default:
      return "General";
  }
}

export function categoryClass(
  value: string | null | undefined,
  kind: "dot" | "label",
): string {
  const slug = value ?? "general";
  return kind === "dot" ? `cat-dot cat--${slug}` : `cat-label cat-label--${slug}`;
}

/** "3m", "1h", "2d", "3mth" — the compact form the list pane uses. */
export function shortAgo(value: Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "";
  const ms = now.getTime() - value.getTime();
  if (ms < 60_000) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mth`;
  return `${Math.floor(months / 12)}y`;
}

/**
 * Group heading for a thread: "This Week", "Last Week", or an absolute date
 * once it is older than that.
 */
export function dayGroup(
  value: Date,
  now: Date = new Date(),
  timeZone: string = env.INSTITUTION_TIMEZONE,
): string {
  const ms = now.getTime() - value.getTime();
  const days = ms / 86_400_000;
  if (days < 7) return "This Week";
  if (days < 14) return "Last Week";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

/** Stable grouping of already-sorted rows into labelled buckets. */
export function groupByDay<T>(
  rows: T[],
  getDate: (row: T) => Date,
  now: Date = new Date(),
  timeZone?: string,
): { label: string; rows: T[] }[] {
  const groups: { label: string; rows: T[] }[] = [];
  for (const row of rows) {
    const label = dayGroup(getDate(row), now, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

/** Deterministic avatar tint from a name, so the same person keeps a colour. */
const AVATAR_COLOURS = [
  "#2f6fed",
  "#0f9d58",
  "#d9534f",
  "#7e57c2",
  "#00897b",
  "#ef6c00",
  "#c2185b",
  "#455a64",
];

export function avatarColour(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length]!;
}
