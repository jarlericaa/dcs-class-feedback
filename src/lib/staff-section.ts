import { requireUser, type SessionUser } from "@/lib/session";
import {
  authz,
  type SectionAccess,
  type SectionPermission,
} from "@/modules/authz";
import { getSectionWithCourse } from "@/modules/catalog";
import type { classSections, courses } from "@/db/schema";

/**
 * Shared loader for staff section pages.
 *
 * Returns either the rendering context or a "denied" marker so the page can
 * show a designed unauthorized state instead of a stack trace. This is a
 * convenience for rendering only — every action the page offers still calls
 * requireSectionStaff itself, which is the actual enforcement point.
 */
export type StaffSectionContext =
  | { ok: false; user: SessionUser }
  | {
      ok: true;
      user: SessionUser;
      access: SectionAccess;
      section: typeof classSections.$inferSelect;
      course: typeof courses.$inferSelect;
      can: (permission: SectionPermission) => boolean;
    };

export async function loadStaffSection(
  sectionId: string,
  required?: SectionPermission,
): Promise<StaffSectionContext> {
  const user = await requireUser();
  const access = await authz.getSectionAccess(user.id, sectionId);
  if (!access?.staff) return { ok: false, user };
  if (required && !access.staff.permissions[required]) {
    return { ok: false, user };
  }
  const { section, course } = await getSectionWithCourse(sectionId);
  return {
    ok: true,
    user,
    access,
    section,
    course,
    can: (permission) => access.staff!.permissions[permission],
  };
}

/**
 * Like loadStaffSection, but satisfied by ANY of the given permissions.
 * Used where a page is readable by several capabilities and the individual
 * actions inside it are gated separately.
 */
export async function loadStaffSectionAny(
  sectionId: string,
  permissions: readonly SectionPermission[],
): Promise<StaffSectionContext> {
  const user = await requireUser();
  const access = await authz.getSectionAccess(user.id, sectionId);
  if (!access?.staff) return { ok: false, user };
  if (!permissions.some((p) => access.staff!.permissions[p])) {
    return { ok: false, user };
  }
  const { section, course } = await getSectionWithCourse(sectionId);
  return {
    ok: true,
    user,
    access,
    section,
    course,
    can: (permission) => access.staff!.permissions[permission],
  };
}

/**
 * "DCS-101 · Section A", or just the title when it already carries the code.
 *
 * A teacher who names a section "DCS-101 Section A" should not be shown
 * "DCS-101 · DCS-101 Section A" for their trouble. The course code still leads
 * where the title omits it, because a section name alone does not say which
 * course it belongs to.
 */
export function sectionLabel(courseCode: string, sectionTitle: string) {
  const title = sectionTitle.trim();
  return title.toLowerCase().startsWith(courseCode.trim().toLowerCase())
    ? title
    : `${courseCode} · ${title}`;
}
