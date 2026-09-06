import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import {
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
  getStudentRecordForUser,
  requireCourseOwner,
  requireCourseStaff,
  requirePlatformAdmin,
  requireNonTaSectionStaff,
  requireSectionStaff,
  requireTeacher,
  SECTION_PERMISSIONS,
  type SectionPermission,
} from "@/modules/authz";
import { checkRosterEmail } from "@/modules/identity/email";
import {
  EMAIL_LIST_LIMIT,
  parseEmailList,
  type ParsedEmailList,
} from "@/lib/email-list";
import type { BatchProblemReason } from "@/lib/staff-batch-labels";
import {
  paginateArray,
  parsePageParams,
  type Page,
} from "@/lib/pagination";
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

  // Student view: active enrollments of the record this user's email resolves to.
  const record = await getStudentRecordForUser(db, userId);
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

  return {
    staffSections,
    studentSections,
    /** true once this user's UP email appears on some class list */
    isRostered: !!record,
    courseById,
  };
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
  await requireSectionStaff(db, actorUserId, sectionId, undefined, {
    allowArchived: true,
  });
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

// --- who has access to a course, and to which sections ---------------------

/**
 * Standing that comes from the COURSE: the owner, or a `course_staff` row.
 *
 * Either one is full instructor capability on every section of the course —
 * `requireSectionStaff` admits course staff before it ever looks at a section
 * row, and `getSectionAccess` reports them as `course_staff` holding every
 * permission. It covers sections that do not exist yet, which is exactly why it
 * has to be visible somewhere.
 */
export interface CourseStandingRow {
  scope: "course";
  user: typeof users.$inferSelect;
  isOwner: boolean;
  /**
   * The removable `course_staff` row, or null for the owner — whose standing
   * comes from `courses.owner_user_id` and is not a row anyone can delete.
   */
  courseStaffId: string | null;
}

/** Standing that comes from ONE section: a `section_staff` row. */
export interface SectionGrantRow {
  scope: "section";
  user: typeof users.$inferSelect;
  section: typeof classSections.$inferSelect;
  staff: typeof sectionStaff.$inferSelect;
}

export type CourseAccessRow = CourseStandingRow | SectionGrantRow;

/**
 * Everyone who can reach this course's material, and how — as ONE ordered,
 * paginated list rather than a panel per scope.
 *
 * One list because the two scopes answer the same question ("who has access,
 * and to what?") and because a second, unpaginated panel beside a paginated
 * table is the defect this view exists to avoid. Each row states its own scope,
 * so a page boundary never separates a row from the heading that explained it.
 *
 * Read-only and staff-only: `requireCourseStaff` runs BEFORE any row is
 * materialized, so paging slices an already-authorized result and never stands
 * in for an authorization check. `allowArchived` because reading an archived
 * course is explicitly allowed — this model writes nothing.
 */
export async function listCourseAccess(
  actorUserId: string,
  courseId: string,
  opts: {
    page?: string | number | null;
    pageSize?: string | number | null;
  } = {},
): Promise<{
  course: typeof courses.$inferSelect;
  isOwner: boolean;
  team: Page<CourseAccessRow>;
}> {
  const course = await requireCourseStaff(db, actorUserId, courseId, {
    allowArchived: true,
  });
  const params = parsePageParams(opts);

  const courseStaffRows = await db.query.courseStaff.findMany({
    where: eq(courseStaff.courseId, courseId),
  });
  const sections = await db.query.classSections.findMany({
    where: eq(classSections.courseId, courseId),
  });
  const sectionStaffRows = sections.length
    ? await db.query.sectionStaff.findMany({
        where: inArray(
          sectionStaff.sectionId,
          sections.map((s) => s.id),
        ),
      })
    : [];

  const userIds = [
    ...new Set([
      course.ownerUserId,
      ...courseStaffRows.map((r) => r.userId),
      ...sectionStaffRows.map((r) => r.userId),
    ]),
  ];
  const accounts = userIds.length
    ? await db.query.users.findMany({ where: inArray(users.id, userIds) })
    : [];
  const userById = new Map(accounts.map((u) => [u.id, u]));
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  // The owner almost always ALSO holds a course_staff row — createCourse writes
  // one — so they are emitted once, as the owner, and their row is skipped.
  const standing: CourseStandingRow[] = [];
  const seen = new Set<string>();
  const owner = userById.get(course.ownerUserId);
  if (owner) {
    seen.add(owner.id);
    standing.push({
      scope: "course",
      user: owner,
      isOwner: true,
      courseStaffId: null,
    });
  }
  for (const row of courseStaffRows) {
    if (seen.has(row.userId)) continue;
    const user = userById.get(row.userId);
    if (!user) continue;
    seen.add(row.userId);
    standing.push({
      scope: "course",
      user,
      isOwner: false,
      courseStaffId: row.id,
    });
  }
  standing.sort(
    (a, b) =>
      Number(b.isOwner) - Number(a.isOwner) ||
      a.user.displayName.localeCompare(b.user.displayName) ||
      // A total order, so a row cannot swap pages between two requests.
      a.user.id.localeCompare(b.user.id),
  );

  const grants: SectionGrantRow[] = [];
  for (const row of sectionStaffRows) {
    const user = userById.get(row.userId);
    const section = sectionById.get(row.sectionId);
    if (!user || !section) continue;
    grants.push({ scope: "section", user, section, staff: row });
  }
  grants.sort(
    (a, b) =>
      a.section.title.localeCompare(b.section.title) ||
      a.user.displayName.localeCompare(b.user.displayName) ||
      a.staff.id.localeCompare(b.staff.id),
  );

  return {
    course,
    isOwner: course.ownerUserId === actorUserId,
    team: paginateArray<CourseAccessRow>([...standing, ...grants], params),
  };
}

/**
 * How many distinct people administer THIS section through course standing.
 *
 * A count, deliberately — not a list. The section's Teaching team panel shows
 * `section_staff` rows, and course-standing instructors are invisible in it,
 * which quietly implies that list is the whole set of people with access. One
 * number corrects that without adding a second list to a page that has no page
 * state to paginate one with.
 *
 * Returns no names, emails or ids: strictly less than the panel beside it
 * already discloses, and nothing a reader could not infer from having access.
 * Counted in the database so no identity is ever materialized here.
 */
export async function countSectionCourseStanding(
  actorUserId: string,
  sectionId: string,
): Promise<number> {
  const section = await requireSectionStaff(
    db,
    actorUserId,
    sectionId,
    undefined,
    { allowArchived: true },
  );
  // UNION, not a join: the owner may or may not also hold a course_staff row,
  // and either way they are one person.
  const result = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count FROM (
      SELECT ${courses.ownerUserId} AS user_id
        FROM ${courses}
        WHERE ${courses.id} = ${section.courseId}
      UNION
      SELECT ${courseStaff.userId} AS user_id
        FROM ${courseStaff}
        WHERE ${courseStaff.courseId} = ${section.courseId}
    ) AS course_standing
  `);
  return result.rows[0]?.count ?? 0;
}

/**
 * Enrolled roster of a section. Identity-bearing → staff-only.
 *
 * `signedIn` reports whether an active account exists for the imported email —
 * that is, whether this student has ever logged in. It is NOT a link decision:
 * access follows from the email being on the list, and nothing here can grant or
 * withhold it.
 */
export async function listSectionRoster(actorUserId: string, sectionId: string) {
  await requireSectionStaff(db, actorUserId, sectionId, "viewStudentIdentities", { allowArchived: true });
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
  const emails = records
    .map((r) => r.rosterEmail)
    .filter((v): v is string => !!v);
  const accounts = emails.length
    ? await db.query.users.findMany({ where: inArray(users.email, emails) })
    : [];
  const activeAccountEmails = new Set(
    accounts.filter((u) => u.active).map((u) => u.email),
  );
  return rows
    .flatMap((row) => {
      const record = byId.get(row.studentRecordId);
      return record
        ? [
            {
              enrollment: row,
              record,
              signedIn:
                !!record.rosterEmail &&
                activeAccountEmails.has(record.rosterEmail),
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

/** The three section roles. One list, so the schema and the batch agree. */
const SECTION_STAFF_ROLES = ["teacher", "ta", "co_teacher"] as const;

export type SectionStaffRole = (typeof SECTION_STAFF_ROLES)[number];

const staffAssignmentSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(SECTION_STAFF_ROLES),
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

/** What one (person x section) grant did. Reported as counts by the batch. */
export type StaffAssignmentOutcome = "added" | "updated" | "unchanged";

/**
 * ONE (person x section) grant, written inside the caller's transaction.
 *
 * Extracted so that adding several people to several sections is literally the
 * same write, audited the same way, repeated — rather than a second
 * implementation of the same semantics that could drift from the flags the
 * single-section form grants.
 *
 * The caller authorizes and resolves the target first; this function assumes
 * both and does neither. It is not exported for that reason.
 *
 * `batchId` correlates the writes of one multi-section action, and is the ONLY
 * thing it changes about the audit rows: without it the row is byte-for-byte
 * what the single-section path has always written. The batch additionally sets
 * the denormalized `sectionId` column, which the single path leaves null.
 */
async function assignSectionStaffTx(
  tx: Tx,
  actorUserId: string,
  sectionId: string,
  target: typeof users.$inferSelect,
  role: SectionStaffRole,
  permissions: Record<SectionPermission, boolean>,
  batchId?: string,
): Promise<StaffAssignmentOutcome> {
  const existing = await tx.query.sectionStaff.findFirst({
    where: and(
      eq(sectionStaff.sectionId, sectionId),
      eq(sectionStaff.userId, target.id),
    ),
  });

  if (existing) {
    // Re-affirming an identical grant still writes and still audits: somebody
    // took the action, and the single-section path has always recorded it. The
    // `unchanged` outcome only summarizes the batch — it never skips a write.
    const changed =
      existing.role !== role ||
      SECTION_PERMISSIONS.some((p) => existing[p] !== permissions[p]);
    await tx
      .update(sectionStaff)
      .set({ role, ...permissions })
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
      after: { role, ...permissions },
      metadata: {
        sectionId,
        targetUserId: target.id,
        ...(batchId ? { batchId } : {}),
      },
      ...(batchId ? { sectionId } : {}),
    });
    return changed ? "updated" : "unchanged";
  }

  const [created] = await tx
    .insert(sectionStaff)
    .values({ sectionId, userId: target.id, role, ...permissions })
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
      role,
      ...permissions,
    },
    ...(batchId
      ? { metadata: { sectionId, targetUserId: target.id, batchId }, sectionId }
      : {}),
  });
  return "added";
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
  await db.transaction(async (tx) => {
    await assignSectionStaffTx(
      tx,
      actorUserId,
      sectionId,
      target,
      input.role,
      permissions,
    );
  });
}

// --- adding staff to several sections in one action ------------------------

/**
 * One refused address — or one refused part of the request.
 *
 * `reason` is a code, never a sentence: the wording belongs to the UI boundary
 * (`staffBatchProblemLabel`), and a validator's own message must never reach a
 * reader who cannot act on it.
 */
export interface StaffBatchProblem {
  /** The address this is about, or "" when it is about the request itself. */
  email: string;
  reason: BatchProblemReason;
  /** Set when the problem is about a chosen section rather than an address. */
  sectionId?: string;
}

export type { BatchProblemReason };

export interface AssignSectionStaffBatchInput {
  /**
   * Addresses, either already split or as the one blob a paste produces —
   * `parseEmailList` handles both, so the caller never has to pre-split.
   */
  emails: readonly string[] | string;
  sectionIds: readonly string[];
  role: SectionStaffRole;
  permissions: Partial<Record<SectionPermission, boolean>>;
}

export type AssignSectionStaffBatchResult =
  | {
      ok: true;
      /** Correlates every audit row this action wrote. */
      batchId: string;
      added: number;
      updated: number;
      unchanged: number;
      /** The sections written to, in the order they were given. */
      sections: { id: string; title: string }[];
    }
  | { ok: false; problems: StaffBatchProblem[] };

/**
 * Pasted addresses → the active accounts behind them, or the coded reasons they
 * were refused.
 *
 * Shared by both scopes on purpose: whether a grant lands on sections or on the
 * whole course, "who is this address, and may they be given access at all?" is
 * the same question with the same answers, and two copies of it would drift.
 * What differs between the scopes — which roles are allowed, what a grant
 * writes — stays with the caller.
 *
 * Creates nothing: no account, no invitation. An address with no active account
 * is refused by name.
 */
async function resolveStaffTargets(parsed: ParsedEmailList): Promise<{
  targets: (typeof users.$inferSelect)[];
  problems: StaffBatchProblem[];
}> {
  const problems: StaffBatchProblem[] = [];

  // Past the cap: named, never silently dropped.
  for (const email of parsed.overflow) {
    problems.push({ email, reason: "too_many" });
  }

  // Shape and domain, by the same rule that decides a class-list address.
  // `missing` cannot occur — the parser drops empty tokens — and folding it
  // into `invalid_format` keeps the reason vocabulary to the seven codes.
  const usable: string[] = [];
  for (const email of parsed.emails) {
    const check = checkRosterEmail(email);
    if (!check.ok) {
      problems.push({
        email,
        reason:
          check.problem === "disallowed_domain"
            ? "disallowed_domain"
            : "invalid_format",
      });
      continue;
    }
    usable.push(check.email);
  }

  const accounts = usable.length
    ? await db.query.users.findMany({ where: inArray(users.email, usable) })
    : [];
  const accountByEmail = new Map(accounts.map((u) => [u.email, u]));
  const targets: (typeof users.$inferSelect)[] = [];
  for (const email of usable) {
    const account = accountByEmail.get(email);
    if (!account) {
      problems.push({ email, reason: "no_account" });
      continue;
    }
    if (!account.active) {
      problems.push({ email, reason: "inactive_account" });
      continue;
    }
    targets.push(account);
  }

  return { targets, problems };
}

/**
 * Add several people to several sections of one course, with one permission
 * set, in one audited action. Course-owner only.
 *
 * All-or-nothing, deliberately: a paste of eight addresses with one typo in it
 * grants nobody anything, and says which address was refused and why. A partial
 * apply would leave the owner to work out who got in and who did not, and
 * re-pasting the corrected list would then re-write grants that already existed.
 *
 * The whole request is checked before a single row is written — shape, then
 * sections, then addresses, then accounts — and every refusal is collected
 * rather than thrown one at a time, so one pass names every problem.
 *
 * Creates no accounts and sends no invitations: an address with no active
 * account is refused (`no_account` / `inactive_account`), exactly as the
 * single-section path refuses it. Whether an invitation flow should exist is
 * still open (issue #17, item 1) and is not decided here.
 */
export async function assignSectionStaffBatch(
  actorUserId: string,
  courseId: string,
  input: AssignSectionStaffBatchInput,
): Promise<AssignSectionStaffBatchResult> {
  // Authorization comes FIRST, before any part of the request is materialized:
  // only the course owner may staff a section, and a caller without that
  // standing must not learn which sections or accounts exist by the shape of
  // the answer. The uuid guard ahead of it is not a policy decision — it only
  // keeps a malformed id from reaching Postgres as a cast error. Archiving is
  // enforced by requireCourseOwner itself (no `allowArchived`).
  if (!z.string().uuid().safeParse(courseId).success) {
    throw new CatalogError("Course not found");
  }
  await requireCourseOwner(db, actorUserId, courseId);

  const requestedSectionIds = [...new Set(input.sectionIds ?? [])];
  if (requestedSectionIds.length === 0) {
    throw new CatalogError("Choose at least one section to add them to.");
  }
  const parsed = parseEmailList(input.emails, EMAIL_LIST_LIMIT);
  if (parsed.emails.length === 0) {
    throw new CatalogError("Add at least one email address.");
  }

  const problems: StaffBatchProblem[] = [];

  // The role is re-checked at runtime even though the parameter is typed: this
  // is reached from a form post, where the type guarantees nothing.
  const role = SECTION_STAFF_ROLES.includes(input.role) ? input.role : null;
  if (!role) {
    problems.push({ email: "", reason: "role_not_allowed_for_scope" });
  }

  // Sections are resolved against THIS course, so a section id from another
  // course (or a stale one) is refused rather than written to.
  const courseSections = await db.query.classSections.findMany({
    where: eq(classSections.courseId, courseId),
  });
  const sectionById = new Map(courseSections.map((s) => [s.id, s]));
  const sections: (typeof classSections.$inferSelect)[] = [];
  for (const id of requestedSectionIds) {
    const section = sectionById.get(id);
    if (!section) {
      problems.push({ email: "", reason: "not_in_course", sectionId: id });
      continue;
    }
    sections.push(section);
  }

  const resolved = await resolveStaffTargets(parsed);
  problems.push(...resolved.problems);

  if (problems.length > 0 || !role) return { ok: false, problems };
  const targets = resolved.targets;

  // Deny-by-default: only an explicit `true` on a flag in the catalog grants
  // anything, so an unknown or non-boolean field can never widen a permission.
  // normalizePermissions then applies the role rule — a teacher or co-teacher
  // holds every capability, a TA exactly what was ticked.
  const requested = Object.fromEntries(
    SECTION_PERMISSIONS.filter((p) => input.permissions?.[p] === true).map(
      (p) => [p, true],
    ),
  ) as Partial<Record<SectionPermission, boolean>>;
  const permissions = normalizePermissions(role, requested);

  const batchId = randomUUID();
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  // One transaction over every grant, so the atomic refusal above is matched by
  // an atomic write: a failure part-way rolls back the grants AND their audit
  // rows together.
  await db.transaction(async (tx) => {
    for (const target of targets) {
      for (const section of sections) {
        const outcome = await assignSectionStaffTx(
          tx,
          actorUserId,
          section.id,
          target,
          role,
          permissions,
          batchId,
        );
        if (outcome === "added") added += 1;
        else if (outcome === "updated") updated += 1;
        else unchanged += 1;
      }
    }
  });

  return {
    ok: true,
    batchId,
    added,
    updated,
    unchanged,
    sections: sections.map((s) => ({ id: s.id, title: s.title })),
  };
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

// --- course-wide standing (ADR-0004) --------------------------------------

/**
 * The roles course-wide standing can be granted with.
 *
 * Instructor-only, and deliberately shorter than the section list: course
 * standing is full capability on every section of the course, including
 * sections that do not exist yet, so there is nothing for a permission flag to
 * narrow. A Student Assistant is a per-section grant by definition — a
 * course-wide TA would be a TA whose flags could never be scoped, which is not
 * a thing the permission catalog can express. See ADR-0004.
 */
const COURSE_STAFF_ROLES = ["teacher", "co_teacher"] as const;

export type CourseStaffRole = (typeof COURSE_STAFF_ROLES)[number];

export interface AssignCourseStaffInput {
  /**
   * Addresses, either already split or as the one blob a paste produces —
   * `parseEmailList` handles both, so the caller never has to pre-split.
   */
  emails: readonly string[] | string;
  role: CourseStaffRole;
}

export type AssignCourseStaffResult =
  | {
      ok: true;
      /** Correlates every audit row this action wrote. */
      batchId: string;
      added: number;
      updated: number;
      unchanged: number;
    }
  | { ok: false; problems: StaffBatchProblem[] };

/**
 * Grant course-wide instructor standing to one or more people. Course-owner
 * only (ADR-0003, extended by ADR-0004).
 *
 * A `course_staff` row is the widest grant in the product: `requireSectionStaff`
 * admits course staff before it ever looks at a section row, so the grantee
 * administers every section of the course AND every section added to it later.
 * That is the reason it is Instructor-only and the reason only the owner may
 * write one — the escalation ADR-0003 closes at section scope would be worse
 * here, not better.
 *
 * All-or-nothing on the same terms as the section batch: one refused address
 * grants nobody anything, and says which address and why. Idempotent — an
 * address that already holds standing is re-affirmed, never inserted twice
 * (`course_staff_unique` would refuse it anyway, and a caught constraint error
 * is a worse answer than a counted `unchanged`).
 */
export async function assignCourseStaff(
  actorUserId: string,
  courseId: string,
  input: AssignCourseStaffInput,
): Promise<AssignCourseStaffResult> {
  // Authorization FIRST, before any part of the request is materialized — see
  // assignSectionStaffBatch for why the uuid guard sits ahead of it. Archiving
  // is enforced by requireCourseOwner itself (no `allowArchived`).
  if (!z.string().uuid().safeParse(courseId).success) {
    throw new CatalogError("Course not found");
  }
  await requireCourseOwner(db, actorUserId, courseId);

  const parsed = parseEmailList(input.emails, EMAIL_LIST_LIMIT);
  if (parsed.emails.length === 0) {
    throw new CatalogError("Add at least one email address.");
  }

  const problems: StaffBatchProblem[] = [];

  // Re-checked at runtime even though the parameter is typed: this is reached
  // from a form post, where the type guarantees nothing. `ta` lands here — it
  // is a valid section role and NOT a valid course-wide one, which is exactly
  // what `role_not_allowed_for_scope` says.
  const role = COURSE_STAFF_ROLES.includes(input.role) ? input.role : null;
  if (!role) {
    problems.push({ email: "", reason: "role_not_allowed_for_scope" });
  }

  const resolved = await resolveStaffTargets(parsed);
  problems.push(...resolved.problems);

  if (problems.length > 0 || !role) return { ok: false, problems };

  const batchId = randomUUID();
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  // One transaction over every grant, so the atomic refusal above is matched by
  // an atomic write: a failure part-way rolls back the grants AND their audit
  // rows together.
  await db.transaction(async (tx) => {
    for (const target of resolved.targets) {
      const existing = await tx.query.courseStaff.findFirst({
        where: and(
          eq(courseStaff.courseId, courseId),
          eq(courseStaff.userId, target.id),
        ),
      });
      // Re-affirming identical standing still writes and still audits, exactly
      // as the section path does: somebody took the action. The `unchanged`
      // count summarizes the batch — it never skips a write.
      const outcome = !existing
        ? "added"
        : existing.role === role
          ? "unchanged"
          : "updated";
      let rowId: string;
      if (existing) {
        await tx
          .update(courseStaff)
          .set({ role })
          .where(eq(courseStaff.id, existing.id));
        rowId = existing.id;
      } else {
        const [created] = await tx
          .insert(courseStaff)
          .values({ courseId, userId: target.id, role })
          .returning();
        rowId = created!.id;
      }
      await writeAudit(tx, {
        actorUserId,
        action: "staff.course_assigned",
        entityType: "course_staff",
        entityId: rowId,
        before: existing ? { role: existing.role } : undefined,
        after: {
          courseId,
          targetUserId: target.id,
          email: target.email,
          role,
        },
        metadata: { batchId, targetUserId: target.id },
        courseId,
      });
      if (outcome === "added") added += 1;
      else if (outcome === "updated") updated += 1;
      else unchanged += 1;
    }
  });

  return { ok: true, batchId, added, updated, unchanged };
}

/**
 * Revoke one course-wide standing row. Course-owner only.
 *
 * Deletes the `course_staff` row and NOTHING else. Any `section_staff` row the
 * same person holds survives, because it is a separate, narrower grant somebody
 * made on purpose: revoking course standing should return them to the sections
 * they were explicitly given, not silently remove them from those too. Nothing
 * they already did — reviews, replies, published answers — is touched.
 *
 * The owner's own standing is not removable: it comes from
 * `courses.owner_user_id`, so deleting their `course_staff` row would change
 * nothing about their access while making the Teaching team view lie about who
 * owns the course.
 */
export async function removeCourseStaff(
  actorUserId: string,
  courseId: string,
  courseStaffId: string,
): Promise<void> {
  if (!z.string().uuid().safeParse(courseId).success) {
    throw new CatalogError("Course not found");
  }
  const course = await requireCourseOwner(db, actorUserId, courseId);
  if (!z.string().uuid().safeParse(courseStaffId).success) {
    throw new CatalogError("Course-wide access not found");
  }

  // Scoped to THIS course, so a row id from another course is not found rather
  // than deleted.
  const row = await db.query.courseStaff.findFirst({
    where: and(
      eq(courseStaff.id, courseStaffId),
      eq(courseStaff.courseId, courseId),
    ),
  });
  if (!row) throw new CatalogError("Course-wide access not found");
  if (row.userId === course.ownerUserId) {
    throw new CatalogError(
      "The course owner's own access cannot be removed. Transfer the course instead.",
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(courseStaff).where(eq(courseStaff.id, courseStaffId));
    await writeAudit(tx, {
      actorUserId,
      action: "staff.course_removed",
      entityType: "course_staff",
      entityId: courseStaffId,
      before: { courseId, targetUserId: row.userId, role: row.role },
      metadata: { targetUserId: row.userId },
      courseId,
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
