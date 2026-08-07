import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import {
  classSections,
  courses,
  courseStaff,
  enrollments,
  formResponses,
  sectionStaff,
  studentRecords,
  studentSubmissionItems,
  users,
} from "@/db/schema";
import { normalizeEmail } from "@/modules/identity/email";

/**
 * Deny-by-default, resource-scoped authorization
 * (roles-and-permissions.md §1, architecture-proposal.md §5).
 *
 * Every helper answers: does THIS user hold THIS capability on THIS resource?
 * Nothing grants ambient authority:
 * - Platform admin is separate from teaching; it grants no content access.
 * - Teachers act only on courses/sections where they are staff (Risk R5).
 * - TA capabilities are per-section flags (the permission catalog).
 * - Students act only where their normalized UP email is on a class list AND an
 *   active Enrollment exists (docs/student-identity.md).
 */

export class AuthzError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthzError";
  }
}

/**
 * An archived course is read-only (project-specs.md §11).
 *
 * 409 rather than 403: the actor DOES hold the capability, the resource is
 * simply frozen. Callers can therefore tell "you may not" apart from "not while
 * this course is archived" and say so.
 */
export class CourseArchivedError extends Error {
  readonly status = 409;
  constructor(
    message = "This course is archived and is read-only. Restore it to make changes.",
  ) {
    super(message);
    this.name = "CourseArchivedError";
  }
}

/**
 * Options accepted by every require* helper.
 *
 * `allowArchived` INVERTS the usual default: writes are refused on an archived
 * course unless the caller opts in. That inversion is the whole point — a future
 * mutation that forgets about archiving is refused rather than silently allowed,
 * so the read-only guarantee does not depend on anyone remembering it. Only
 * reads, exports, and the archive lifecycle operations opt in.
 */
export interface AuthzOptions {
  allowArchived?: boolean;
}

/** Throws when the course is archived. Used by every helper by default. */
export async function requireWritableCourse(dbx: DbOrTx, courseId: string) {
  const course = await dbx.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (course?.archivedAt) throw new CourseArchivedError();
  return course ?? null;
}

async function enforceArchiveRule(
  dbx: DbOrTx,
  courseId: string,
  opts: AuthzOptions | undefined,
) {
  if (opts?.allowArchived) return;
  await requireWritableCourse(dbx, courseId);
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
  "flagValidity",
  "markValidity",
  "exportParticipation",
  "manageWeeklyCycles",
  "manageTemplates",
  "manageBacklogImports",
  "moderateDiscussion",
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
  flagValidity: "Flag a submission as potentially invalid (reason required)",
  markValidity:
    "Take part in validity decisions (finalizing still requires a teacher or co-teacher)",
  exportParticipation: "Export participation CSVs (identity-bearing)",
  manageWeeklyCycles: "Manage cycles and recurrence",
  manageTemplates: "Manage templates",
  manageBacklogImports: "Manage the backlog and imports, and recommend changes",
  moderateDiscussion: "Moderate comments and lock discussions",
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
export async function requireCourseStaff(
  dbx: DbOrTx,
  userId: string,
  courseId: string,
  opts?: AuthzOptions,
) {
  await requireActiveUser(dbx, userId);
  const course = await dbx.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!course) throw new AuthzError("No access to this course");
  const membership =
    course.ownerUserId === userId
      ? true
      : !!(await dbx.query.courseStaff.findFirst({
          where: and(
            eq(courseStaff.courseId, courseId),
            eq(courseStaff.userId, userId),
          ),
        }));
  if (!membership) throw new AuthzError("No access to this course");
  // Archive check comes AFTER standing: a stranger must not learn that a course
  // exists but is archived.
  await enforceArchiveRule(dbx, courseId, opts);
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
  opts?: AuthzOptions,
) {
  await requireActiveUser(dbx, userId);
  const course = await dbx.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!course || course.ownerUserId !== userId) {
    throw new AuthzError("Only the course owner can do this");
  }
  await enforceArchiveRule(dbx, courseId, opts);
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
  opts?: AuthzOptions,
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

  // Course staff (incl. the owner) administer the course's sections. Checked
  // BEFORE the TA branch: a course owner who also holds a `ta` row on their
  // own section must not be locked out of it by their own narrower row.
  // `allowArchived` is forced here so a stranger cannot distinguish "no access"
  // from "archived"; the archive rule is applied once, at the end.
  let isCourseStaff = false;
  try {
    await requireCourseStaff(dbx, userId, section.courseId, {
      allowArchived: true,
    });
    isCourseStaff = true;
  } catch {
    isCourseStaff = false;
  }
  if (isCourseStaff) {
    await enforceArchiveRule(dbx, section.courseId, opts);
    return section;
  }

  if (membership) {
    if (membership.role === "teacher" || membership.role === "co_teacher") {
      await enforceArchiveRule(dbx, section.courseId, opts);
      return section;
    }
    // TA: `membership` alone proves standing on the section. A named
    // permission must have been granted; asking for none means "any staff
    // member of this section", which a TA satisfies.
    if (!permission || membership[permission]) {
      await enforceArchiveRule(dbx, section.courseId, opts);
      return section;
    }
    throw new AuthzError(`Missing section permission: ${permission}`);
  }

  throw new AuthzError("No access to this section");
}

/**
 * Section staff EXCLUDING teaching assistants: teachers, co-teachers, and
 * course staff. Used for capabilities that are deliberately not delegable
 * because the MVP permission catalog has no flag for them — section settings
 * and audit browsing.
 */
export async function requireNonTaSectionStaff(
  dbx: DbOrTx,
  userId: string,
  sectionId: string,
  opts?: AuthzOptions,
) {
  const section = await requireSectionStaff(
    dbx,
    userId,
    sectionId,
    undefined,
    opts,
  );
  const membership = await dbx.query.sectionStaff.findFirst({
    where: and(
      eq(sectionStaff.sectionId, sectionId),
      eq(sectionStaff.userId, userId),
    ),
  });
  if (membership?.role === "ta") {
    // A course-staff TA is still course staff; only a section-scoped TA is out.
    try {
      await requireCourseStaff(dbx, userId, section.courseId, {
        allowArchived: true,
      });
    } catch {
      throw new AuthzError(
        "This action is limited to teachers and co-teachers",
      );
    }
  }
  return section;
}

/**
 * "Instructor" on a section, in the sense project-specs.md §4.1 uses the word:
 * a teacher, a co-teacher, or course staff. Every instructor is equal; there is
 * no separate tier.
 *
 * This is the gate for the capabilities the specification declares
 * non-delegable — finalizing invalidity, approving a TA's public draft,
 * unpublishing, confirming backlog membership, bonus periods, identity-bearing
 * new exports, archive/clone. A Student Assistant is refused here even holding
 * every permission flag.
 */
export const requireInstructor = requireNonTaSectionStaff;

/**
 * Instructor gate that ALSO requires a named permission.
 *
 * Both conditions matter: the permission says "this person works on validity",
 * the role says "this person may finalize it". A TA granted `markValidity`
 * therefore still cannot confirm an invalidation — which is exactly the
 * flag-versus-finalize split in project-specs.md §4.2.
 */
export async function requireInstructorSectionCapability(
  dbx: DbOrTx,
  userId: string,
  sectionId: string,
  permission: SectionPermission,
  opts?: AuthzOptions,
) {
  await requireSectionStaff(dbx, userId, sectionId, permission, opts);
  return requireNonTaSectionStaff(dbx, userId, sectionId, opts);
}

/**
 * Course-level Instructor: course staff, or a teacher/co-teacher on any section
 * of the course. Used for course-scoped non-delegable actions (bonus periods,
 * backlog confirmation, archive/clone).
 */
export async function requireCourseInstructor(
  dbx: DbOrTx,
  userId: string,
  courseId: string,
  opts?: AuthzOptions,
) {
  try {
    return await requireCourseStaff(dbx, userId, courseId, opts);
  } catch (err) {
    // An archived course must report itself as archived, not as inaccessible.
    if (err instanceof CourseArchivedError) throw err;
  }
  await requireActiveUser(dbx, userId);
  const sections = await dbx.query.classSections.findMany({
    where: eq(classSections.courseId, courseId),
  });
  for (const section of sections) {
    const membership = await dbx.query.sectionStaff.findFirst({
      where: and(
        eq(sectionStaff.sectionId, section.id),
        eq(sectionStaff.userId, userId),
      ),
    });
    if (
      membership &&
      (membership.role === "teacher" || membership.role === "co_teacher")
    ) {
      await enforceArchiveRule(dbx, courseId, opts);
      return (await dbx.query.courses.findFirst({
        where: eq(courses.id, courseId),
      }))!;
    }
  }
  throw new AuthzError("This action is limited to instructors on this course");
}

/**
 * Student access to a section: requires this user's normalized email to be on a
 * class list AND that student record to hold an ACTIVE Enrollment in the section.
 * Returns the resolved student record.
 */
export async function requireEnrolledStudent(
  dbx: DbOrTx,
  userId: string,
  sectionId: string,
  opts?: AuthzOptions,
) {
  await requireActiveUser(dbx, userId);
  const record = await getStudentRecordForUser(dbx, userId);
  if (!record) throw new AuthzError("No student record for this email");
  const enrollment = await dbx.query.enrollments.findFirst({
    where: and(
      eq(enrollments.sectionId, sectionId),
      eq(enrollments.studentRecordId, record.id),
      eq(enrollments.status, "active"),
    ),
  });
  if (!enrollment) throw new AuthzError("Not enrolled in this section");
  const section = await dbx.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });
  if (section) await enforceArchiveRule(dbx, section.courseId, opts);
  return record;
}

/**
 * The student who wrote a submission item — the only student who may read its
 * private thread or add a follow-up to it (project-specs.md §6.7).
 *
 * Resolved through the roster email, so removing an address from every class
 * list revokes thread access without touching any data.
 */
export async function requireItemAsker(
  dbx: DbOrTx,
  userId: string,
  itemId: string,
) {
  const record = await getStudentRecordForUser(dbx, userId);
  if (!record) throw new AuthzError("No student record for this email");
  const rows = await dbx
    .select({
      itemId: studentSubmissionItems.id,
      studentRecordId: formResponses.studentRecordId,
      cycleId: formResponses.cycleId,
      /**
       * The asker's OWN section, from the response. With a form shared by several
       * sections the instance has no single one, and the thread belongs to the
       * section this student answered through.
       */
      sectionId: formResponses.sectionId,
    })
    .from(studentSubmissionItems)
    .innerJoin(
      formResponses,
      eq(formResponses.id, studentSubmissionItems.responseId),
    )
    .where(eq(studentSubmissionItems.id, itemId))
    .limit(1);
  const row = rows[0];
  // A wrong owner and a missing item report identically: a student must not be
  // able to probe for the existence of another student's question.
  if (!row || row.studentRecordId !== record.id) {
    throw new AuthzError("No access to this question");
  }
  return { studentRecordId: record.id, sectionId: row.sectionId };
}

/**
 * The StudentRecord for this user, resolved by exact normalized-email equality
 * against the teacher-uploaded class lists, or null.
 *
 * This is the single resolution point for student identity in the whole system.
 * It reads live, so a roster imported after the account already existed grants
 * access on the next request — no second login, no linking row.
 */
export async function getStudentRecordForUser(dbx: DbOrTx, userId: string) {
  const user = await dbx.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return null;
  return getStudentRecordByEmail(dbx, user.email);
}

/** Same lookup, by address. Both sides are normalized before comparing. */
export async function getStudentRecordByEmail(dbx: DbOrTx, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return (
    (await dbx.query.studentRecords.findFirst({
      where: eq(studentRecords.rosterEmail, normalized),
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
  opts?: AuthzOptions,
): Promise<{ role: "staff" | "student" }> {
  try {
    await requireSectionStaff(dbx, userId, sectionId, undefined, opts);
    return { role: "staff" };
  } catch (err) {
    if (err instanceof CourseArchivedError) throw err;
    // fall through to student check
  }
  await requireEnrolledStudent(dbx, userId, sectionId, opts);
  return { role: "student" };
}

/**
 * Course-level access for a capability that is granted per SECTION.
 *
 * The backlog belongs to the course, but `manage_backlog_imports` is a
 * section flag. Requiring course staff alone would make the advertised
 * permission unusable for a section TA. This admits course staff, or anyone
 * holding the flag on at least one section of that course — which is exactly
 * the scope the flag describes.
 */
export async function requireCourseStaffOrSectionGrant(
  dbx: DbOrTx,
  userId: string,
  courseId: string,
  permission: SectionPermission,
  opts?: AuthzOptions,
) {
  try {
    return await requireCourseStaff(dbx, userId, courseId, opts);
  } catch (err) {
    if (err instanceof CourseArchivedError) throw err;
    // fall through to the per-section grant
  }
  await requireActiveUser(dbx, userId);
  const sections = await dbx.query.classSections.findMany({
    where: eq(classSections.courseId, courseId),
  });
  for (const section of sections) {
    const membership = await dbx.query.sectionStaff.findFirst({
      where: and(
        eq(sectionStaff.sectionId, section.id),
        eq(sectionStaff.userId, userId),
      ),
    });
    if (!membership) continue;
    if (
      membership.role === "teacher" ||
      membership.role === "co_teacher" ||
      membership[permission]
    ) {
      await enforceArchiveRule(dbx, courseId, opts);
      return (
        (await dbx.query.courses.findFirst({ where: eq(courses.id, courseId) }))!
      );
    }
  }
  throw new AuthzError("No access to this course");
}

/**
 * Any capability that lets a staff member work with the publication queue.
 * Reading the queue must not require `draft_public_answers` specifically, or a
 * publish-only or schedule-only assistant cannot see what they are meant to
 * act on. Individual actions remain gated by their own flag.
 */
export const PUBLICATION_PERMISSIONS = [
  "draftPublicAnswers",
  "rewordPublicQuestions",
  "publishPublicAnswers",
  "schedulePublication",
] as const satisfies readonly SectionPermission[];

export async function requireAnySectionPermission(
  dbx: DbOrTx,
  userId: string,
  sectionId: string,
  permissions: readonly SectionPermission[],
  opts?: AuthzOptions,
) {
  let lastError: unknown;
  for (const permission of permissions) {
    try {
      return await requireSectionStaff(
        dbx,
        userId,
        sectionId,
        permission,
        opts,
      );
    } catch (err) {
      if (err instanceof CourseArchivedError) throw err;
      lastError = err;
    }
  }
  throw lastError instanceof AuthzError
    ? lastError
    : new AuthzError("No access to this section");
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
    /** true for a teacher/co-teacher/course-staff member — the "Instructor" tier */
    isInstructor: boolean;
    permissions: EffectivePermissions;
  } | null;
  /** the email-resolved student record with an active enrolment here, if any */
  studentRecordId: string | null;
  /**
   * PRESENTATION ONLY — lets the UI grey out controls on an archived course.
   * Never the enforcement point: the services refuse the write regardless.
   */
  archived: boolean;
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
      isInstructor: true,
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
      isInstructor: courseMembership,
      permissions: granted,
    };
  } else if (courseMembership) {
    staff = {
      role: "course_staff",
      isCourseOwner: isOwner,
      isInstructor: true,
      permissions: allPermissions(true),
    };
  }

  const record = await getStudentRecordForUser(dbx, userId);
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
  return { section, staff, studentRecordId, archived: !!course?.archivedAt };
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
    opts?: AuthzOptions,
  ) => requireSectionStaff(db, userId, sectionId, permission, opts),
  requireInstructor: (userId: string, sectionId: string, opts?: AuthzOptions) =>
    requireInstructor(db, userId, sectionId, opts),
  requireCourseInstructor: (
    userId: string,
    courseId: string,
    opts?: AuthzOptions,
  ) => requireCourseInstructor(db, userId, courseId, opts),
  requireEnrolledStudent: (
    userId: string,
    sectionId: string,
    opts?: AuthzOptions,
  ) => requireEnrolledStudent(db, userId, sectionId, opts),
  requireItemAsker: (userId: string, itemId: string) =>
    requireItemAsker(db, userId, itemId),
  requireSectionQaAccess: (
    userId: string,
    sectionId: string,
    opts?: AuthzOptions,
  ) => requireSectionQaAccess(db, userId, sectionId, opts),
  requireWritableCourse: (courseId: string) =>
    requireWritableCourse(db, courseId),
  getStudentRecordForUser: (userId: string) =>
    getStudentRecordForUser(db, userId),
};
