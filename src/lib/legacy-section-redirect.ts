import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classSections } from "@/db/schema";

/**
 * Forwarding for the section-scoped URLs that Public Q&A and editorial work
 * used to live at (ADR-0005 moved them to the course).
 *
 * These routes forward rather than 404: links, bookmarks, sent email and a
 * term of muscle memory point at them. They resolve the section's COURSE and
 * send the reader to the canonical course URL.
 *
 * Two things this deliberately does not do:
 *
 * - It does not authorize. The destination performs its own check, which is
 *   where authorization belongs. Resolving a section id to a course id reveals
 *   nothing: the reader supplied the id, and the course route refuses them if
 *   they do not hold it.
 * - It does not carry the section forward in any form. The whole point is that
 *   the destination has no section dimension; appending one would reintroduce
 *   the targeting this change removed. Meaningful query parameters — the
 *   selected entry, a search, a category, a filter — ARE preserved, because
 *   those describe the resource rather than its old scope.
 */
const CARRIED_PARAMS = [
  "selected",
  "q",
  "search",
  "status",
  "category",
  "sort",
  "state",
  "filter",
  "import",
] as const;

export function carryQuery(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const next = new URLSearchParams();
  for (const key of CARRIED_PARAMS) {
    const value = searchParams[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) {
      const targetKey =
        key === "search" ? "q" : key === "state" ? "status" : key;
      if (!next.has(targetKey)) next.set(targetKey, single);
    }
  }
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}

/** Canonical destination for every retired staff editorial URL. */
export function courseBacklogHref(
  courseId: string,
  searchParams: Record<string, string | string[] | undefined> = {},
): string {
  return `/teach/courses/${courseId}/backlog${carryQuery(searchParams)}`;
}

/**
 * Resolve a section to its course and forward to `courseHref(courseId)`.
 *
 * An unknown section id forwards to the overview rather than throwing: a dead
 * bookmark should land somewhere the reader can use, not on an error page.
 */
export async function redirectSectionToCourse(
  sectionId: string,
  courseHref: (courseId: string) => string,
  searchParams: Record<string, string | string[] | undefined> = {},
): Promise<never> {
  const section = await db.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
    columns: { courseId: true },
  });
  if (!section) redirect("/");
  redirect(`${courseHref(section.courseId)}${carryQuery(searchParams)}`);
}
