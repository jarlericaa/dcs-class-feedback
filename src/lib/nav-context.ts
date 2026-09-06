import { cache } from "react";
import { eq } from "drizzle-orm";

import { courseTabGroups, primaryNav, type NavGroup } from "@/components/layout/nav";
import { db } from "@/db";
import { classSections } from "@/db/schema";
import { getSectionAccess } from "@/modules/authz";
import type { SessionUser } from "@/lib/session";
import { sectionLabel } from "@/lib/staff-section";
import { listCoursesForUser, listSectionsForUser } from "@/modules/catalog";

/**
 * The primary sidebar, resolved once per request.
 *
 * Every authenticated page calls this and passes the result straight through to
 * the shell. That is what makes the rail stable: there is one builder, one input
 * (the account), and no page gets to add or drop a row because of where it sits
 * in the route tree. The only thing a page contributes is its own path, which
 * moves the active mark and nothing else.
 *
 * `cache` dedupes the two catalog reads within a request, so a page that also
 * loads sections for its own body does not pay for them twice.
 */
const loadNavSections = cache(async (userId: string) => {
  const { staffSections, studentSections, courseById } =
    await listSectionsForUser(userId);
  const courses = await listCoursesForUser(userId);
  const courseIds = new Set(courses.map((entry) => entry.course.id));

  const label = (section: { courseId: string; title: string }) => {
    const code = courseById.get(section.courseId)?.code;
    return code ? sectionLabel(code, section.title) : section.title;
  };

  return {
    courses: courses.map((entry) => ({
      id: entry.course.id,
      label: entry.course.code,
    })),
    studentSections: studentSections.map((section) => ({
      id: section.id,
      label: label(section),
    })),
    /**
     * Only sections whose course this account does NOT staff. Course staff
     * reach every section of their own courses through "My courses", so
     * repeating them here would make the rail grow with the course list and
     * duplicate a destination that already exists.
     */
    assistedSections: staffSections
      .filter((section) => !courseIds.has(section.courseId))
      .map((section) => ({ id: section.id, label: label(section) })),
  };
});

export async function primaryNavFor(
  user: Pick<SessionUser, "id" | "isTeacher" | "isPlatformAdmin">,
  currentPath: string,
  opts: {
    /**
     * Which rail row this page sits under, for a path no row's href covers.
     * Pass it where the containing resource is known only to the page — a form
     * instance knows which class it was answered through; its URL does not.
     */
    fallbackHref?: string;
  } = {},
): Promise<NavGroup[]> {
  const { courses, studentSections, assistedSections } = await loadNavSections(
    user.id,
  );
  return primaryNav(
    currentPath,
    {
      isTeacher: user.isTeacher,
      isPlatformAdmin: user.isPlatformAdmin,
      courses,
      studentSections,
      assistedSections,
    },
    {
      /**
       * Section routes sit outside every rail href, so a teacher reading one of
       * their own sections would otherwise see no row marked at all — the rail
       * would go quiet exactly where the reader is deepest in. They reached it
       * through their courses, so that is the branch they are in.
       *
       * Only a fallback: an assistant whose own section IS a rail row matches it
       * directly and never gets here.
       */
      fallbackHref:
        opts.fallbackHref ??
        (isResourceRoute(currentPath) ? "/teach/courses" : undefined),
    },
  );
}

function isResourceRoute(path: string) {
  return path.startsWith("/teach/sections/") || path.startsWith("/sections/");
}

/**
 * The course's own tab strip, resolved for whichever reader and path called
 * it — folding in the one section's own groups when the course has exactly
 * one (see {@link courseTabGroups} for why only then). `userId` is the reader
 * whose permissions decide what that section's groups contain, not
 * necessarily the same account primaryNavFor was built for on every caller,
 * so it is taken explicitly rather than threaded through a shared cache.
 */
export async function courseTabGroupsFor(
  userId: string,
  courseId: string,
  currentPath: string,
  opts: { needsReview?: number; activeHref?: string } = {},
): Promise<NavGroup[]> {
  const sections = await db.query.classSections.findMany({
    where: eq(classSections.courseId, courseId),
    columns: { id: true },
  });
  const singleSectionAccess =
    sections.length === 1
      ? await getSectionAccess(db, userId, sections[0]!.id)
      : null;
  return courseTabGroups(courseId, currentPath, opts, singleSectionAccess);
}
