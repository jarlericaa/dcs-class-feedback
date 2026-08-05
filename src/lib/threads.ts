import { env } from "@/env";

/**
 * Presentation helpers for the list panes: category identity, compact relative
 * times, and date grouping.
 *
 * Categories carry a WORD and a SHAPE, never a colour (DESIGN.md §3). The
 * previous eight-hue category spectrum and the deterministic avatar colour
 * wheel are both gone: neither survived grayscale, and neither meant anything.
 * Nothing here implements a product rule.
 */

export type CategorySlug = "content" | "logistics" | "misc";
export type CategoryShape = "square" | "triangle" | "circle";

export const QUESTION_CATEGORIES: {
  slug: CategorySlug;
  label: string;
  short: string;
  shape: CategoryShape;
}[] = [
  {
    slug: "content",
    label: "Course content",
    short: "Content",
    shape: "square",
  },
  {
    slug: "logistics",
    label: "Class logistics",
    short: "Logistics",
    shape: "triangle",
  },
  { slug: "misc", label: "Other", short: "Other", shape: "circle" },
];

function find(value: string | null | undefined) {
  return QUESTION_CATEGORIES.find((c) => c.slug === value);
}

export function categoryLabel(value: string | null | undefined): string {
  return find(value)?.label ?? "Uncategorised";
}

/** Short label used inside dense list rows. */
export function categoryShortLabel(value: string | null | undefined): string {
  return find(value)?.short ?? "Uncategorised";
}

/** The silhouette that distinguishes this category without using colour. */
export function categoryShape(value: string | null | undefined): CategoryShape {
  return find(value)?.shape ?? "circle";
}

/** "3m", "1h", "2d", "3mo" — the compact form the list panes use. */
export function shortAgo(
  value: Date | null | undefined,
  now: Date = new Date(),
): string {
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
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

/**
 * Group heading for a list: "This week", "Last week", or an absolute date once
 * it is older than that.
 */
export function dayGroup(
  value: Date,
  now: Date = new Date(),
  timeZone: string = env.INSTITUTION_TIMEZONE,
): string {
  const days = (now.getTime() - value.getTime()) / 86_400_000;
  if (days < 7) return "This week";
  if (days < 14) return "Last week";
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
