import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
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
import { writeAudit } from "@/modules/audit";
import {
  getConfirmedStudentRecord,
  requireCourseOwner,
  requireCourseStaff,
  requirePlatformAdmin,
  requireNonTaSectionStaff,
  requireSectionStaff,
  requireTeacher,
  SECTION_PERMISSIONS,
  type SectionPermission,
} from "@/modules/authz";
import { env } from "@/env";

/**
 * Catalog: courses, class sections, teaching staff, and the per-section TA
 * permission catalog (roles-and-permissions.md §2).
 *
 * Authorization encoded here:
 * - creating a course needs the teacher capability (Open D3, provisional:
 *   a platform admin grants it);
 * - creating/editing a section needs staff on the owning course/section;
 * - assigning staff and editing TA permissions is the COURSE OWNER's call
 *   only, so no staff member can escalate their own permissions.
 * Every mutation writes an audit event with before/after values.
 */

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

// --- read models -----------------------------------------------------------

/**
 * Sections visible to a user, split by capacity. Read-only; every content
 * access still re-authorizes on the target page.
 */
export async function listSectionsForUser(userId: string) {
  // Staff view: sections where user is section staff, plus all sections of
  // courses where user is course staff or owner.
  const staffRows = await db.query.sectionStaff.findMany({
    where: eq(sectionStaff.userId, userId),
  });
  const courseRows = await db.query.courseStaff.findMany({
    where: eq(courseStaff.userId, userId),
  });
  const ownedCourses = await db.query.courses.findMany({
    where: eq(courses.ownerUserId, userId),
  });
  const courseIds = [
    ...new Set([...courseRows.map((r) => r.courseId), ...ownedCourses.map((c) => c.id)]),
  ];
  const courseSections = courseIds.length
    ? await db.query.classSections.findMany({
        where: inArray(classSections.courseId, courseIds),
      })
    : [];
  const staffSectionIds = new Set([
    ...staffRows.map((r) => r.sectionId),
    ...courseSections.map((s) => s.id),
  ]);
  const staffSections = staffSectionIds.size
    ? await db.query.classSections.findMany({
        where: inArray(classSections.id, [...staffSectionIds]),
        orderBy: asc(classSections.title),
      })
    : [];

  // Student view: active enrollments of the confirmed student record.
  const record = await getConfirmedStudentRecord(db, userId);
  let studentSections: (typeof classSections.$inferSelect)[] = [];
  if (record) {
    const active = await db.query.enrollments.findMany({
      where: and(
        eq(enrollments.studentRecordId, record.id),
        eq(enrollments.status, "active"),
      ),
    });
    studentSections = active.length
      ? await db.query.classSections.findMany({
          where: inArray(
            classSections.id,
            active.map((e) => e.sectionId),
          ),
          orderBy: asc(classSections.title),
        })
      : [];
  }

  // Match status for the "pending verification" notice.
  const matchRows = await db.query.accountMatches.findMany({
    where: eq(accountMatches.userId, userId),
  });
  const matchStatus = record
    ? ("confirmed" as const)
    : matchRows.length === 0
      ? ("none" as const)
      : matchRows.some((m) => m.state === "candidate" || m.state === "ambiguous")
        ? ("pending" as const)
        : ("unmatched" as const);

  const referencedCourseIds = [
    ...new Set([
      ...staffSections.map((s) => s.courseId),
      ...studentSections.map((s) => s.courseId),
    ]),
  ];
  const courseById = new Map(
    (referencedCourseIds.length
      ? await db.query.courses.findMany({
          where: inArray(courses.id, referencedCourseIds),
        })
      : []
    ).map((c) => [c.id, c]),
  );

  return { staffSections, studentSections, matchStatus, courseById };
}

/** Courses this user owns or staffs, with their sections. Staff-only data. */
export async function listCoursesForUser(userId: string) {
  const staffRows = await db.query.courseStaff.findMany({
    where: eq(courseStaff.userId, userId),
  });
  const owned = await db.query.courses.findMany({
    where: eq(courses.ownerUserId, userId),
  });
  const ids = [
    ...new Set([...staffRows.map((r) => r.courseId), ...owned.map((c) => c.id)]),
  ];
  if (ids.length === 0) return [];
  const rows = await db.query.courses.findMany({
    where: inArray(courses.id, ids),
    orderBy: asc(courses.code),
  });
  const sections = await db.query.classSections.findMany({
    where: inArray(classSections.courseId, ids),
    orderBy: asc(classSections.title),
  });
  return rows.map((course) => ({
    course,
    isOwner: course.ownerUserId === userId,
    sections: sections.filter((s) => s.courseId === course.id),
  }));
}

/** A section plus its course. Throws CatalogError when the section is gone. */
export async function getSectionWithCourse(sectionId: string) {
  const section = await db.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });
  if (!section) throw new CatalogError("Section not found");
  const course = await db.query.courses.findFirst({
    where: eq(courses.id, section.courseId),
  });
  if (!course) throw new CatalogError("Course not found");
  return { section, course };
}

/** Teaching staff on a section with their permission flags. Staff-only. */
export async function listSectionStaff(actorUserId: string, sectionId: string) {
  await requireSectionStaff(db, actorUserId, sectionId);
  const rows = await db.query.sectionStaff.findMany({
    where: eq(sectionStaff.sectionId, sectionId),
  });
  if (rows.length === 0) return [];
  const accounts = await db.query.users.findMany({
    where: inArray(
      users.id,
      rows.map((r) => r.userId),
    ),
  });
  const byId = new Map(accounts.map((u) => [u.id, u]));
  return rows.map((row) => ({ staff: row, user: byId.get(row.userId) ?? null }));
}

/** Enrolled roster of a section. Identity-bearing → staff-only. */
export async function listSectionRoster(actorUserId: string, sectionId: string) {
  await requireSectionStaff(db, actorUserId, sectionId, "viewStudentIdentities");
  const rows = await db.query.enrollments.findMany({
    where: eq(enrollments.sectionId, sectionId),
  });
  if (rows.length === 0) return [];
  const records = await db.query.studentRecords.findMany({
    where: inArray(
      studentRecords.id,
      rows.map((r) => r.studentRecordId),
    ),
  });
  const byId = new Map(records.map((r) => [r.id, r]));
  const confirmed = await db.query.accountMatches.findMany({
    where: and(
      inArray(
        accountMatches.studentRecordId,
        rows.map((r) => r.studentRecordId),
      ),
      eq(accountMatches.state, "confirmed"),
    ),
  });
  const linkedRecordIds = new Set(
    confirmed.map((m) => m.studentRecordId).filter((v): v is string => !!v),
  );
  return rows
    .flatMap((row) => {
      const record = byId.get(row.studentRecordId);
      return record
        ? [
            {
              enrollment: row,
              record,
              accountLinked: linkedRecordIds.has(record.id),
            },
          ]
        : [];
    })
    .sort((a, b) => a.record.fullName.localeCompare(b.record.fullName));
}

// --- courses ---------------------------------------------------------------

const courseInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(200),
});

export async function createCourse(actorUserId: string, rawInput: unknown) {
  await requireTeacher(db, actorUserId);
  const input = courseInputSchema.parse(rawInput);

  return db.transaction(async (tx) => {
    const [course] = await tx
      .insert(courses)
      .values({
        code: input.code,
        title: input.title,
        ownerUserId: actorUserId,
      })
      .returning();
    await tx
      .insert(courseStaff)
      .values({ courseId: course!.id, userId: actorUserId, role: "teacher" });
    await writeAudit(tx, {
      actorUserId,
      action: "course.created",
      entityType: "course",
      entityId: course!.id,
      after: { code: course!.code, title: course!.title },
    });
    return course!;
  });
}

const courseUpdateSchema = courseInputSchema
  .partial()
  .extend({ active: z.boolean().optional() });

export async function updateCourse(
  actorUserId: string,
  courseId: string,
  rawInput: unknown,
) {
  await requireCourseOwner(db, actorUserId, courseId);
  const input = courseUpdateSchema.parse(rawInput);
  const before = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!before) throw new CatalogError("Course not found");

  await db.transaction(async (tx) => {
    await tx
      .update(courses)
      .set({
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      })
      .where(eq(courses.id, courseId));
    await writeAudit(tx, {
      actorUserId,
      action: "course.updated",
      entityType: "course",
      entityId: courseId,
      before: { code: before.code, title: before.title, active: before.active },
      after: input,
    });
  });
}

// --- sections --------------------------------------------------------------

const sectionInputSchema = z.object({
  courseId: z.string().uuid(),
  term: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  /** Open D7: single institution timezone for MVP; per-section override deferred. */
  timezone: z.string().trim().min(1).max(64).optional(),
});

export async function createSection(actorUserId: string, rawInput: unknown) {
  const input = sectionInputSchema.parse(rawInput);
  await requireCourseStaff(db, actorUserId, input.courseId);

  return db.transaction(async (tx) => {
    const [section] = await tx
      .insert(classSections)
      .values({
        courseId: input.courseId,
        term: input.term,
        title: input.title,
        timezone: input.timezone ?? env.INSTITUTION_TIMEZONE,
      })
      .returning();
    // The creator becomes the section's teacher; without this row a
    // course-staff member could create a section they cannot then staff.
    await tx.insert(sectionStaff).values({
      sectionId: section!.id,
      userId: actorUserId,
      role: "teacher",
      ...normalizePermissions("teacher", {}),
    });
    await writeAudit(tx, {
      actorUserId,
      action: "section.created",
      entityType: "class_section",
      entityId: section!.id,
      after: {
        courseId: input.courseId,
        term: section!.term,
        title: section!.title,
        timezone: section!.timezone,
      },
    });
    return section!;
  });
}

const sectionUpdateSchema = sectionInputSchema
  .omit({ courseId: true })
  .partial()
  .extend({ active: z.boolean().optional() });

export async function updateSection(
  actorUserId: string,
  sectionId: string,
  rawInput: unknown,
) {
  // No TA permission flag covers section settings, so this is deliberately
  // limited to teachers, co-teachers and course staff.
  await requireNonTaSectionStaff(db, actorUserId, sectionId);
  const input = sectionUpdateSchema.parse(rawInput);
  const before = await db.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });
  if (!before) throw new CatalogError("Section not found");

  await db.transaction(async (tx) => {
    await tx
      .update(classSections)
      .set({
        ...(input.term !== undefined ? { term: input.term } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      })
      .where(eq(classSections.id, sectionId));
    await writeAudit(tx, {
      actorUserId,
      action: "section.updated",
      entityType: "class_section",
      entityId: sectionId,
      before: {
        term: before.term,
        title: before.title,
        timezone: before.timezone,
        active: before.active,
      },
      after: input,
    });
  });
}

// --- staff assignment and the TA permission catalog ------------------------

const permissionsShape = Object.fromEntries(
  SECTION_PERMISSIONS.map((p) => [p, z.boolean().optional()]),
) as Record<SectionPermission, z.ZodOptional<z.ZodBoolean>>;

const staffAssignmentSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["teacher", "ta", "co_teacher"]),
  permissions: z.object(permissionsShape).default({}),
});

function normalizePermissions(
  role: "teacher" | "ta" | "co_teacher",
  requested: Partial<Record<SectionPermission, boolean>>,
): Record<SectionPermission, boolean> {
  // Teachers and co-teachers hold every capability on the section by role, so
  // their flags are stored as granted rather than left misleadingly false.
  const full = role !== "ta";
  return Object.fromEntries(
    SECTION_PERMISSIONS.map((p) => [p, full ? true : (requested[p] ?? false)]),
  ) as Record<SectionPermission, boolean>;
}

/**
 * Assign (or re-configure) a staff member on a section. Course-owner only.
 * The target must already have an account — this never creates users, so a
 * mistyped address cannot silently provision access for nobody.
 */
export async function assignSectionStaff(
  actorUserId: string,
  sectionId: string,
  rawInput: unknown,
) {
  const input = staffAssignmentSchema.parse(rawInput);
  const { section } = await getSectionWithCourse(sectionId);
  await requireCourseOwner(db, actorUserId, section.courseId);

  const target = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });
  if (!target || !target.active) {
    throw new CatalogError(
      `No active account exists for ${input.email}. They must sign in once before they can be added as staff.`,
    );
  }

  const permissions = normalizePermissions(input.role, input.permissions);
  const existing = await db.query.sectionStaff.findFirst({
    where: and(
      eq(sectionStaff.sectionId, sectionId),
      eq(sectionStaff.userId, target.id),
    ),
  });

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(sectionStaff)
        .set({ role: input.role, ...permissions })
        .where(eq(sectionStaff.id, existing.id));
      await writeAudit(tx, {
        actorUserId,
        action: "staff.permissions_changed",
        entityType: "section_staff",
        entityId: existing.id,
        before: {
          role: existing.role,
          ...Object.fromEntries(SECTION_PERMISSIONS.map((p) => [p, existing[p]])),
        },
        after: { role: input.role, ...permissions },
        metadata: { sectionId, targetUserId: target.id },
      });
      return;
    }
    const [created] = await tx
      .insert(sectionStaff)
      .values({ sectionId, userId: target.id, role: input.role, ...permissions })
      .returning();
    await writeAudit(tx, {
      actorUserId,
      action: "staff.assigned",
      entityType: "section_staff",
      entityId: created!.id,
      after: {
        sectionId,
        targetUserId: target.id,
        email: target.email,
        role: input.role,
        ...permissions,
      },
    });
  });
}

export async function removeSectionStaff(
  actorUserId: string,
  sectionId: string,
  sectionStaffId: string,
) {
  const { section, course } = await getSectionWithCourse(sectionId);
  await requireCourseOwner(db, actorUserId, section.courseId);
  const row = await db.query.sectionStaff.findFirst({
    where: and(
      eq(sectionStaff.id, sectionStaffId),
      eq(sectionStaff.sectionId, sectionId),
    ),
  });
  if (!row) throw new CatalogError("Staff assignment not found");
  if (row.userId === course.ownerUserId) {
    throw new CatalogError("The course owner cannot be removed from a section");
  }

  await db.transaction(async (tx) => {
    await tx.delete(sectionStaff).where(eq(sectionStaff.id, sectionStaffId));
    await writeAudit(tx, {
      actorUserId,
      action: "staff.removed",
      entityType: "section_staff",
      entityId: sectionStaffId,
      before: { sectionId, targetUserId: row.userId, role: row.role },
    });
  });
}

// --- platform administration (Open D3, provisional) ------------------------

/**
 * A platform admin grants/revokes the teacher capability. This grants NO
 * content access on its own: the new teacher owns nothing until they create a
 * course, and admins gain no course access by being admins.
 */
export async function setTeacherRole(
  adminUserId: string,
  rawEmail: unknown,
  isTeacher: boolean,
) {
  await requirePlatformAdmin(db, adminUserId);
  const email = z.string().trim().toLowerCase().email().parse(rawEmail);
  const target = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!target) {
    throw new CatalogError(
      `No account exists for ${email}. They must sign in once first.`,
    );
  }
  if (target.isTeacher === isTeacher) return target;

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ isTeacher, updatedAt: new Date() })
      .where(eq(users.id, target.id));
    await writeAudit(tx, {
      actorUserId: adminUserId,
      action: "user.teacher_role_changed",
      entityType: "user",
      entityId: target.id,
      before: { isTeacher: target.isTeacher },
      after: { isTeacher },
      metadata: { email },
    });
  });
  return target;
}

/** Accounts list for the admin console. Platform-admin only; no content data. */
export async function listAccountsForAdmin(
  adminUserId: string,
  search?: string,
) {
  await requirePlatformAdmin(db, adminUserId);
  const term = search?.trim().toLowerCase();
  const rows = await db.query.users.findMany({
    orderBy: asc(users.email),
    limit: 200,
  });
  const filtered = term
    ? rows.filter(
        (u) =>
          u.email.toLowerCase().includes(term) ||
          u.displayName.toLowerCase().includes(term),
      )
    : rows;
  return filtered.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    isTeacher: u.isTeacher,
    isPlatformAdmin: u.isPlatformAdmin,
    active: u.active,
    createdAt: u.createdAt,
  }));
}
