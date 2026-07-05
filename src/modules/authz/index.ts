import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import {
  accountMatches,
  classSections,
  courses,
  courseStaff,
  enrollments,
  sectionStaff,
  studentRecords,
  users,
} from "@/db/schema";

/**
 * Deny-by-default, resource-scoped authorization
 * (roles-and-permissions.md §1, architecture-proposal.md §5).
 *
 * Every helper answers: does THIS user hold THIS capability on THIS resource?
 * Nothing grants ambient authority:
 * - Platform admin is separate from teaching; it grants no content access.
 * - Teachers act only on courses/sections where they are staff (Risk R5).
 * - TA capabilities are per-section flags (the permission catalog).
 * - Students act only where a confirmed AccountMatch + active Enrollment exists.
 */

export class AuthzError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthzError";
  }
}

/** TA permission catalog flags = boolean columns on section_staff. */
export type SectionPermission =
  | "viewStudentIdentities"
  | "reviewResponses"
  | "sendPrivateResponses"
  | "draftPublicAnswers"
  | "rewordPublicQuestions"
  | "publishPublicAnswers"
  | "schedulePublication"
  | "markValidity"
  | "exportParticipation"
  | "manageWeeklyCycles"
  | "manageTemplates"
  | "manageBacklogImports";

export async function requireActiveUser(dbx: DbOrTx, userId: string) {
  const user = await dbx.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !user.active) throw new AuthzError("Unknown or inactive user");
  return user;
}

export async function requirePlatformAdmin(dbx: DbOrTx, userId: string) {
  const user = await requireActiveUser(dbx, userId);
  if (!user.isPlatformAdmin) throw new AuthzError("Platform admin required");
  return user;
}

/**
 * Course-level staff membership (course owner or courseStaff row).
 * Platform admins do NOT pass — no automatic content access.
 */
export async function requireCourseStaff(dbx: DbOrTx, userId: string, courseId: string) {
  await requireActiveUser(dbx, userId);
  const course = await dbx.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!course) throw new AuthzError("No access to this course");
  if (course.ownerUserId === userId) return course;
  const membership = await dbx.query.courseStaff.findFirst({
    where: and(
      eq(courseStaff.courseId, courseId),
      eq(courseStaff.userId, userId),
    ),
  });
  if (!membership) throw new AuthzError("No access to this course");
  return course;
}

/**
 * Section-level staff check.
 * - section role `teacher`/`co_teacher`: all capabilities on that section.
 * - section role `ta`: only the explicitly granted flag.
 * - course staff of the parent course: treated as full staff on its sections.
 * Returns the section row.
 */
export async function requireSectionStaff(
  dbx: DbOrTx,
  userId: string,
  sectionId: string,
  permission?: SectionPermission,
) {
  await requireActiveUser(dbx, userId);
  const section = await dbx.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });
  if (!section) throw new AuthzError("No access to this section");

  const membership = await dbx.query.sectionStaff.findFirst({
    where: and(
      eq(sectionStaff.sectionId, sectionId),
      eq(sectionStaff.userId, userId),
    ),
  });
  if (membership) {
    if (membership.role === "teacher" || membership.role === "co_teacher") {
      return section;
    }
    // TA: deny unless the specific flag was granted.
    if (permission ? membership[permission] : false) return section;
    if (!permission) throw new AuthzError("Permission required");
    throw new AuthzError(`Missing section permission: ${permission}`);
  }

  // Course staff (incl. owner) administer the course's sections.
  try {
    await requireCourseStaff(dbx, userId, section.courseId);
    return section;
  } catch {
    throw new AuthzError("No access to this section");
  }
}

/**
 * Student access to a section: requires a CONFIRMED AccountMatch binding this
 * user to a StudentRecord with an ACTIVE Enrollment in the section.
 * Returns the bound student record.
 */
export async function requireEnrolledStudent(
  dbx: DbOrTx,
  userId: string,
  sectionId: string,
) {
  await requireActiveUser(dbx, userId);
  const record = await getConfirmedStudentRecord(dbx, userId);
  if (!record) throw new AuthzError("No verified student identity");
  const enrollment = await dbx.query.enrollments.findFirst({
    where: and(
      eq(enrollments.sectionId, sectionId),
      eq(enrollments.studentRecordId, record.id),
      eq(enrollments.status, "active"),
    ),
  });
  if (!enrollment) throw new AuthzError("Not enrolled in this section");
  return record;
}

/** The StudentRecord bound to this user via a confirmed match, or null. */
export async function getConfirmedStudentRecord(dbx: DbOrTx, userId: string) {
  const match = await dbx.query.accountMatches.findFirst({
    where: and(
      eq(accountMatches.userId, userId),
      eq(accountMatches.state, "confirmed"),
    ),
  });
  if (!match?.studentRecordId) return null;
  return (
    (await dbx.query.studentRecords.findFirst({
      where: eq(studentRecords.id, match.studentRecordId),
    })) ?? null
  );
}

/**
 * Section Q&A archive access: enrolled students and section staff ONLY.
 * "Public" Q&A is public to the class, never to unenrolled users.
 */
export async function requireSectionQaAccess(
  dbx: DbOrTx,
  userId: string,
  sectionId: string,
): Promise<{ role: "staff" | "student" }> {
  try {
    await requireSectionStaff(dbx, userId, sectionId);
    return { role: "staff" };
  } catch {
    // fall through to student check
  }
  await requireEnrolledStudent(dbx, userId, sectionId);
  return { role: "student" };
}

/** Convenience wrappers bound to the app db. */
export const authz = {
  requireActiveUser: (userId: string) => requireActiveUser(db, userId),
  requirePlatformAdmin: (userId: string) => requirePlatformAdmin(db, userId),
  requireCourseStaff: (userId: string, courseId: string) =>
    requireCourseStaff(db, userId, courseId),
  requireSectionStaff: (
    userId: string,
    sectionId: string,
    permission?: SectionPermission,
  ) => requireSectionStaff(db, userId, sectionId, permission),
  requireEnrolledStudent: (userId: string, sectionId: string) =>
    requireEnrolledStudent(db, userId, sectionId),
  requireSectionQaAccess: (userId: string, sectionId: string) =>
    requireSectionQaAccess(db, userId, sectionId),
  getConfirmedStudentRecord: (userId: string) =>
    getConfirmedStudentRecord(db, userId),
};
