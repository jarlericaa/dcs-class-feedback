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
