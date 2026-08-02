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

/**
 * TA permission catalog (roles-and-permissions.md §2.3) = boolean columns on
 * section_staff. `manage_course_materials` is deliberately absent: course
 * material management is post-MVP.
 */
export const SECTION_PERMISSIONS = [
  "viewStudentIdentities",
  "reviewResponses",
  "sendPrivateResponses",
  "draftPublicAnswers",
  "rewordPublicQuestions",
  "publishPublicAnswers",
  "schedulePublication",
  "markValidity",
  "exportParticipation",
  "manageWeeklyCycles",
  "manageTemplates",
  "manageBacklogImports",
] as const;

export type SectionPermission = (typeof SECTION_PERMISSIONS)[number];

/** Human labels for the permission editor. Keep in sync with the catalog. */
export const SECTION_PERMISSION_LABELS: Record<SectionPermission, string> = {
  viewStudentIdentities: "See student identities on responses",
  reviewResponses: "Review form responses",
  sendPrivateResponses: "Send private replies",
  draftPublicAnswers: "Draft public answers",
  rewordPublicQuestions: "Edit public question wording",
  publishPublicAnswers: "Publish immediately",
  schedulePublication: "Schedule publication",
  markValidity: "Mark responses valid/invalid",
  exportParticipation: "Export participation CSVs (identity-bearing)",
  manageWeeklyCycles: "Manage cycles and recurrence",
  manageTemplates: "Manage templates",
  manageBacklogImports: "Manage the backlog and imports",
};

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
 * Course OWNER only. Staff assignment and the TA permission catalog are the
 * class owner's call (roles-and-permissions.md §2.3), so course staff who are
 * not the owner cannot escalate their own or anyone else's permissions.
 */
export async function requireCourseOwner(
  dbx: DbOrTx,
  userId: string,
  courseId: string,
) {
  await requireActiveUser(dbx, userId);
  const course = await dbx.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!course || course.ownerUserId !== userId) {
    throw new AuthzError("Only the course owner can do this");
  }
  return course;
}

/**
 * Teacher capability (Open D3, provisional: a platform admin grants
 * `users.isTeacher`; teachers self-serve courses and sections thereafter).
 * This is a capability check, not resource access — every course/section
 * action still resolves membership on the specific resource.
 */
export async function requireTeacher(dbx: DbOrTx, userId: string) {
  const user = await requireActiveUser(dbx, userId);
  if (!user.isTeacher) {
    throw new AuthzError("A teacher role is required to do this");
  }
  return user;
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

export type EffectivePermissions = Record<SectionPermission, boolean>;

function allPermissions(value: boolean): EffectivePermissions {
  return Object.fromEntries(
    SECTION_PERMISSIONS.map((p) => [p, value]),
  ) as EffectivePermissions;
}

export interface SectionAccess {
  section: typeof classSections.$inferSelect;
  /** staff capacity on this section, if any */
  staff: {
    role: "teacher" | "ta" | "co_teacher" | "course_staff";
    isCourseOwner: boolean;
    permissions: EffectivePermissions;
  } | null;
  /** the confirmed student record with an active enrolment here, if any */
  studentRecordId: string | null;
}

/**
 * READ MODEL ONLY — resolves what a user may see in navigation for a section.
 *
 * This never authorizes a mutation. Hiding a link is not authorization: every
 * action still calls requireSectionStaff / requireEnrolledStudent, which is
 * the only enforcement point. Returns null when the user has no access at all.
 */
export async function getSectionAccess(
  dbx: DbOrTx,
  userId: string,
  sectionId: string,
): Promise<SectionAccess | null> {
  const user = await dbx.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !user.active) return null;
  const section = await dbx.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });
  if (!section) return null;

  const course = await dbx.query.courses.findFirst({
    where: eq(courses.id, section.courseId),
  });
  const isOwner = course?.ownerUserId === userId;
  const courseMembership = isOwner
    ? true
    : !!(await dbx.query.courseStaff.findFirst({
        where: and(
          eq(courseStaff.courseId, section.courseId),
          eq(courseStaff.userId, userId),
        ),
      }));

  const membership = await dbx.query.sectionStaff.findFirst({
    where: and(
      eq(sectionStaff.sectionId, sectionId),
      eq(sectionStaff.userId, userId),
    ),
  });

  let staff: SectionAccess["staff"] = null;
  if (membership && (membership.role === "teacher" || membership.role === "co_teacher")) {
    staff = {
      role: membership.role,
      isCourseOwner: isOwner,
      permissions: allPermissions(true),
    };
  } else if (membership) {
    // TA: exactly the granted flags. Course staff of the parent course still
    // administer the section, so union the two rather than downgrading them.
    const granted = Object.fromEntries(
      SECTION_PERMISSIONS.map((p) => [p, courseMembership || membership[p]]),
    ) as EffectivePermissions;
    staff = {
      role: courseMembership ? "course_staff" : "ta",
      isCourseOwner: isOwner,
      permissions: granted,
    };
  } else if (courseMembership) {
    staff = {
      role: "course_staff",
      isCourseOwner: isOwner,
      permissions: allPermissions(true),
    };
  }

  const record = await getConfirmedStudentRecord(dbx, userId);
  let studentRecordId: string | null = null;
  if (record) {
    const enrollment = await dbx.query.enrollments.findFirst({
      where: and(
        eq(enrollments.sectionId, sectionId),
        eq(enrollments.studentRecordId, record.id),
        eq(enrollments.status, "active"),
      ),
    });
    if (enrollment) studentRecordId = record.id;
  }

  if (!staff && !studentRecordId) return null;
  return { section, staff, studentRecordId };
}

/** Convenience wrappers bound to the app db. */
export const authz = {
  requireActiveUser: (userId: string) => requireActiveUser(db, userId),
  requirePlatformAdmin: (userId: string) => requirePlatformAdmin(db, userId),
  requireCourseStaff: (userId: string, courseId: string) =>
    requireCourseStaff(db, userId, courseId),
  requireCourseOwner: (userId: string, courseId: string) =>
    requireCourseOwner(db, userId, courseId),
  requireTeacher: (userId: string) => requireTeacher(db, userId),
  getSectionAccess: (userId: string, sectionId: string) =>
    getSectionAccess(db, userId, sectionId),
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
