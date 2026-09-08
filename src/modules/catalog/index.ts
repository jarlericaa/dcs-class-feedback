import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
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
  normalizeStudentNumber,
  revealStudentNumber,
  studentNumberHash,
} from "@/modules/crypto/student-number";
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
  buildPage,
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

/** One row of a section's own teaching team. */
export type SectionStaffRow = Awaited<
  ReturnType<typeof listSectionStaff>
>[number];

/**
 * The same list, paginated — what the section setup page renders.
 *
 * A section's staff is small in practice, but "small in practice" is what every
 * unbounded list says before it is not, so this honours the repository rule that
 * a rendered list is paged. Ordering is total (name, then row id) so a row can
 * never swap pages between two requests.
 *
 * `listSectionStaff` is deliberately left alone: its callers want the whole set
 * for assertions and for the course-wide read model, and narrowing that contract
 * to page 1 would silently drop rows.
 */
export async function listSectionStaffPage(
  actorUserId: string,
  sectionId: string,
  opts: {
    page?: string | number | null;
    pageSize?: string | number | null;
  } = {},
): Promise<Page<SectionStaffRow>> {
  await requireSectionStaff(db, actorUserId, sectionId, undefined, {
    allowArchived: true,
  });
  const params = parsePageParams(opts, 25);

  // Count and page come from the database: only the requested rows are
  // hydrated, so the query cost does not grow with a section's whole team.
  const [{ count: total } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sectionStaff)
    .where(eq(sectionStaff.sectionId, sectionId));

  // Ordered by name then row id — a total order, so a row cannot swap pages
  // between two requests. The join is inner: `section_staff.user_id` is a
  // foreign key, so a row without its account cannot exist.
  const rows = await db
    .select({ staff: sectionStaff, user: users })
    .from(sectionStaff)
    .innerJoin(users, eq(users.id, sectionStaff.userId))
    .where(eq(sectionStaff.sectionId, sectionId))
    .orderBy(asc(users.displayName), asc(sectionStaff.id))
    .limit(params.pageSize)
    .offset(params.offset);

  return buildPage<SectionStaffRow>(rows, total, params);
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

  /**
   * One ordered set over both scopes, resolved in PostgreSQL.
   *
   * `rank` carries the grouping the page must not lose — 0 the owner, 1 course
   * staff, 2 section grants — and the remaining sort columns give a total order
   * inside each group, so a row cannot swap pages between two requests.
   *
   * The OWNER is emitted once, from `courses`, and the rows the platform wrote
   * FOR THEM BY ITSELF are suppressed, because neither adds anything to what
   * rank 0 already states — that the owner holds every capability on every
   * section, including sections that do not exist yet — and neither is
   * removable while they own the course, so a second and third row would read
   * as three separate grants offering nothing to act on.
   *
   * Two different suppressions, and the difference matters:
   *
   * - **rank 1**, their `course_staff` row: always theirs and always automatic.
   *   `createCourse` is the only thing that writes it and `removeCourseStaff`
   *   refuses to delete it, so there is no version of that row that says
   *   anything rank 0 does not.
   * - **rank 2**, their `section_staff` row: suppressed only when it grants
   *   everything anyway — an instructor row, which is what `createSection`
   *   writes by itself. A `ta` row for the owner was written deliberately and
   *   is kept, because hiding it would leave a row in the database that no view
   *   discloses and that `removeSectionStaff` refuses to delete. See
   *   `redundantOwnerSectionRow` below.
   *
   * Both are scoped to the owner alone. A NON-owner with both a `course_staff`
   * row and section grants keeps every row, because those are deliberate,
   * separately-removable grants somebody chose to make (ADR-0004), and losing
   * the section rows would hide which class lists a later demotion would leave
   * them on.
   *
   * Only ids are selected here. The page's entities are hydrated below, so the
   * query returns one page and a count rather than the whole team.
   */
  /**
   * An owner `section_staff` row that says nothing rank 0 does not.
   *
   * Redundancy is decided by what the row GRANTS, not by how it got written —
   * and for `teacher` or `co_teacher` what it grants is every capability on the
   * section BY ROLE, whatever the stored flags happen to say
   * (`getSectionAccess` resolves those roles to `allPermissions(true)` without
   * reading the columns). `createSection` writes exactly such a row for whoever
   * created the section, so for the owner of a course they built themselves this
   * is the duplicate that was showing up on every class list.
   *
   * A `ta` row for the owner is the one shape that is NOT redundant: somebody
   * called `assignSectionStaff` and wrote a narrower role deliberately. Rank 0
   * still means they hold everything — a demotion of the owner is not a thing
   * this model can express — so the row is kept precisely so a reader can see
   * that it exists. Hiding it would leave a row in the database that no view
   * discloses and that `removeSectionStaff` refuses to delete.
   *
   * At most one row per (section, owner) — `section_staff_unique` — so this
   * suppresses one row per section, never a set.
   *
   * Written as the positive list rather than `<> 'ta'` so that it fails SAFE.
   * `section_staff_role` is exactly `teacher | ta | co_teacher` today; a fourth
   * value added later would fall outside this list and be SHOWN, which is the
   * direction to be wrong in — a row a reader can see is a row they can ask
   * about, and one silently hidden is not.
   */
  const redundantOwnerSectionRow = sql`(
    ${sectionStaff.userId} = (
      SELECT ${courses.ownerUserId} FROM ${courses}
       WHERE ${courses.id} = ${courseId})
    AND ${sectionStaff.role} IN ('teacher', 'co_teacher')
  )`;

  const keyset = sql`
    SELECT 0 AS rank,
           ${courses.ownerUserId} AS user_id,
           NULL::uuid AS section_id,
           NULL::uuid AS staff_id,
           NULL::uuid AS course_staff_id,
           '' AS section_title,
           ${users.displayName} AS display_name,
           ${courses.ownerUserId}::text AS tiebreak
      FROM ${courses}
      JOIN ${users} ON ${users.id} = ${courses.ownerUserId}
     WHERE ${courses.id} = ${courseId}
    UNION ALL
    SELECT 1, ${courseStaff.userId}, NULL::uuid, NULL::uuid, ${courseStaff.id},
           '', ${users.displayName}, ${courseStaff.userId}::text
      FROM ${courseStaff}
      JOIN ${users} ON ${users.id} = ${courseStaff.userId}
     WHERE ${courseStaff.courseId} = ${courseId}
       AND ${courseStaff.userId} <> (
             SELECT ${courses.ownerUserId} FROM ${courses}
              WHERE ${courses.id} = ${courseId})
    UNION ALL
    SELECT 2, ${sectionStaff.userId}, ${sectionStaff.sectionId}, ${sectionStaff.id},
           NULL::uuid, ${classSections.title}, ${users.displayName},
           ${sectionStaff.id}::text
      FROM ${sectionStaff}
      JOIN ${classSections} ON ${classSections.id} = ${sectionStaff.sectionId}
      JOIN ${users} ON ${users.id} = ${sectionStaff.userId}
     WHERE ${classSections.courseId} = ${courseId}
       AND NOT ${redundantOwnerSectionRow}
  `;

  const counted = await db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM (${keyset}) AS team`,
  );
  const total = counted.rows[0]?.count ?? 0;

  const paged = await db.execute<{
    rank: number;
    user_id: string;
    section_id: string | null;
    staff_id: string | null;
    course_staff_id: string | null;
  }>(sql`
    SELECT rank, user_id, section_id, staff_id, course_staff_id
      FROM (${keyset}) AS team
     ORDER BY rank, section_title, display_name, tiebreak
     LIMIT ${params.pageSize} OFFSET ${params.offset}
  `);

  // Hydrate only what this page needs.
  const pageRows = paged.rows;
  const userIds = [...new Set(pageRows.map((r) => r.user_id))];
  const sectionIds = [
    ...new Set(pageRows.map((r) => r.section_id).filter((v): v is string => !!v)),
  ];
  const staffIds = [
    ...new Set(pageRows.map((r) => r.staff_id).filter((v): v is string => !!v)),
  ];
  const [accounts, sectionRows, staffRows] = await Promise.all([
    userIds.length
      ? db.query.users.findMany({ where: inArray(users.id, userIds) })
      : Promise.resolve([]),
    sectionIds.length
      ? db.query.classSections.findMany({
          where: inArray(classSections.id, sectionIds),
        })
      : Promise.resolve([]),
    staffIds.length
      ? db.query.sectionStaff.findMany({
          where: inArray(sectionStaff.id, staffIds),
        })
      : Promise.resolve([]),
  ]);
  const userById = new Map(accounts.map((u) => [u.id, u]));
  const sectionById = new Map(sectionRows.map((x) => [x.id, x]));
  const staffById = new Map(staffRows.map((x) => [x.id, x]));

  const rows: CourseAccessRow[] = [];
  for (const r of pageRows) {
    const user = userById.get(r.user_id);
    if (!user) continue;
    if (r.rank === 2) {
      const section = r.section_id ? sectionById.get(r.section_id) : undefined;
      const staff = r.staff_id ? staffById.get(r.staff_id) : undefined;
      if (!section || !staff) continue;
      rows.push({ scope: "section", user, section, staff });
    } else {
      rows.push({
        scope: "course",
        user,
        isOwner: r.rank === 0,
        courseStaffId: r.course_staff_id,
      });
    }
  }

  return {
    course,
    isOwner: course.ownerUserId === actorUserId,
    team: buildPage<CourseAccessRow>(rows, total, params),
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
 *
 * Carries the WHOLE student number in clear, for the one reader entitled to it
 * (see the field's own note). Viewing is not audited, deliberately and
 * consistently with `getParticipationOverview`: the capability that permits it
 * is granted and revoked under audit, and a log entry per page view — one per
 * reload, one per search — would bury the events the log exists for. Producing
 * a FILE is audited, because that is what leaves the building.
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
              /**
               * The whole student number, in clear, for the staff member who
               * holds `viewStudentIdentities` — required at the top of this
               * function, so reaching this line IS the authorization.
               *
               * Read the number, never the record: the plaintext lives only in
               * this field, so a caller cannot pick it up by accident from
               * `record` (which carries the ciphertext and the last four). It
               * is null when the value cannot be opened — a row from before
               * the encryption backfill, or a ciphertext sealed with a key
               * this deployment no longer holds — and the caller falls back to
               * the last four rather than printing a truncated value as if it
               * were whole.
               *
               * NORMALIZED, so it has no separator; `formatStudentNumber` in
               * `src/lib/student-number.ts` restores that for reading.
               *
               * This read model is therefore identity-bearing in the strongest
               * sense the product has. It must never be rendered on a student
               * route, put in an email, or logged.
               */
              studentNumber: revealOrNull(record),
              signedIn:
                !!record.rosterEmail &&
                activeAccountEmails.has(record.rosterEmail),
            },
          ]
        : [];
    })
    .sort((a, b) => a.record.fullName.localeCompare(b.record.fullName));
}

/** State narrowing offered by the class-list screen. */
export type RosterState = "all" | "signed_in" | "not_signed_in" | "dropped";

export interface RosterPageEntry {
  enrollment: typeof enrollments.$inferSelect;
  record: typeof studentRecords.$inferSelect;
  /** Whole number in clear, or null when the ciphertext cannot be opened. */
  studentNumber: string | null;
  signedIn: boolean;
}

/**
 * Figures for the whole section, independent of the filters on screen.
 *
 * Counted in the database rather than derived from a page: a total that only
 * described the visible rows would contradict the heading it sits under.
 */
export interface RosterStats {
  /** Every enrollment, active or dropped — what "N students" means here. */
  total: number;
  signedIn: number;
  missingEmail: number;
}

/**
 * The class list, filtered, ordered, counted and sliced IN THE DATABASE.
 *
 * `listSectionRoster` below returns the whole section and stays as it is: the
 * privacy tests hold it to a contract, and the roster import and its outcome
 * panel want the complete set. This is what the rendered route uses, so a class
 * list does not cost one AES-GCM decrypt per enrolled student per keystroke —
 * only the rows on the page are opened.
 *
 * ## The encrypted-number search boundary
 *
 * The plaintext student number lives nowhere in the database: the columns are a
 * ciphertext, a keyed HMAC and the last four characters. So a SQL predicate can
 * match a number exactly (through the hash, which is what identity is keyed on)
 * or by its last four — and cannot match an arbitrary substring of it, because
 * there is nothing to match against. Both spellings of a whole number still
 * work, since the hash is taken over the normalized form: `2026-00001` and
 * `202600001` are one lookup. What a reader loses is a partial like `2026` or
 * `00001`, which the in-memory version answered by searching decrypted text.
 * Restoring that would mean storing the number in clear, which is the one thing
 * project-specs.md §11 forbids — so it stays lost, and deliberately.
 *
 * Ordering is total (name, then enrollment id) so a row cannot swap pages
 * between two requests.
 */
export async function listSectionRosterPage(
  actorUserId: string,
  sectionId: string,
  opts: {
    state?: RosterState;
    q?: string | null;
    page?: string | number | null;
    pageSize?: string | number | null;
  } = {},
): Promise<Page<RosterPageEntry> & { stats: RosterStats }> {
  await requireSectionStaff(db, actorUserId, sectionId, "viewStudentIdentities", {
    allowArchived: true,
  });
  const params = parsePageParams(opts);

  /**
   * "Signed in" is an ACTIVE account whose address equals the roster email.
   *
   * `users.email` is unique, so this left join cannot duplicate an enrollment
   * row and the counts stay honest. `active` belongs in the ON clause, not the
   * WHERE: a deactivated account must read as not signed in, exactly as the
   * in-memory version had it.
   */
  const signedInJoin = and(
    eq(users.email, studentRecords.rosterEmail),
    eq(users.active, true),
  );
  const signedInExpr = sql<boolean>`${users.id} IS NOT NULL`;

  // --- section-wide figures, one round trip, unaffected by the filters ------
  const [stats = { total: 0, signedIn: 0, missingEmail: 0 }] = await db
    .select({
      total: sql<number>`count(*)::int`,
      signedIn: sql<number>`count(*) FILTER (WHERE ${users.id} IS NOT NULL)::int`,
      missingEmail: sql<number>`count(*) FILTER (WHERE ${studentRecords.rosterEmail} IS NULL)::int`,
    })
    .from(enrollments)
    .innerJoin(studentRecords, eq(studentRecords.id, enrollments.studentRecordId))
    .leftJoin(users, signedInJoin)
    .where(eq(enrollments.sectionId, sectionId));

  // --- the narrowing the screen asked for ----------------------------------
  const filters = [eq(enrollments.sectionId, sectionId)];
  const state = opts.state ?? "all";
  if (state === "signed_in") filters.push(isNotNull(users.id));
  // Deliberately includes a record with no roster email at all: it has never
  // signed in and never can, which is precisely what this filter is for.
  if (state === "not_signed_in") filters.push(isNull(users.id));
  if (state === "dropped") filters.push(eq(enrollments.status, "deactivated"));

  const needle = opts.q?.trim().toLowerCase();
  if (needle) {
    const like = `%${escapeLike(needle)}%`;
    const clauses = [
      ilike(studentRecords.fullName, like),
      ilike(enrollments.rosterName, like),
      ilike(studentRecords.rosterEmail, like),
    ];
    // Punctuation is stripped from BOTH sides, so "2026-00001" and "202600001"
    // are one search — the stored forms carry no separator either.
    const digits = normalizeStudentNumber(needle);
    if (digits) {
      const hash = hashOrNull(digits);
      if (hash) clauses.push(eq(studentRecords.studentNumberHash, hash));
      // Only the complete stored tail is searchable. The database deliberately
      // has no plaintext number column, so a shorter fragment would either be
      // a misleading partial match or require decrypting every record.
      if (digits.length === 4) {
        clauses.push(eq(studentRecords.studentNumberLast4, digits));
      }
    }
    filters.push(or(...clauses)!);
  }
  const where = and(...filters);

  const [{ count: total } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(enrollments)
    .innerJoin(studentRecords, eq(studentRecords.id, enrollments.studentRecordId))
    .leftJoin(users, signedInJoin)
    .where(where);

  const rows = await db
    .select({
      enrollment: enrollments,
      record: studentRecords,
      signedIn: signedInExpr,
    })
    .from(enrollments)
    .innerJoin(studentRecords, eq(studentRecords.id, enrollments.studentRecordId))
    .leftJoin(users, signedInJoin)
    .where(where)
    .orderBy(asc(studentRecords.fullName), asc(enrollments.id))
    .limit(params.pageSize)
    .offset(params.offset);

  return {
    ...buildPage<RosterPageEntry>(
      // Only THIS page's ciphertexts are opened. The decrypt is the expensive,
      // identity-bearing step, so it happens once per rendered row and never
      // for the rest of the class.
      rows.map((row) => ({
        enrollment: row.enrollment,
        record: row.record,
        studentNumber: revealOrNull(row.record),
        signedIn: !!row.signedIn,
      })),
      total,
      params,
    ),
    stats,
  };
}

/**
 * A search term is a literal, never a pattern.
 *
 * Without this a `%` typed into the box matches everybody and a `_` matches
 * anybody — surprising rather than dangerous (the value is still a bound
 * parameter, so this is not an injection fix), but a class list should find
 * what was typed.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * The lookup hash of a normalized number, or null.
 *
 * Never throws: a deployment whose hash key is missing must still render a
 * searchable class list by name and email rather than failing the page.
 */
function hashOrNull(normalized: string): string | null {
  try {
    return studentNumberHash(normalized);
  } catch {
    return null;
  }
}

/**
 * Open a sealed student number, or null.
 *
 * Never throws: one unreadable row must not take down a whole class list, and
 * the caller has a truthful fallback for it.
 */
function revealOrNull(record: {
  id: string;
  studentNumberCiphertext: string | null;
}): string | null {
  try {
    return revealStudentNumber(record);
  } catch {
    return null;
  }
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
      // Course-scoped like course.updated, so every section this course later
      // gains finds the record of its own creation.
      courseId: course!.id,
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
      // A course id is reachable from no section, so this is what puts "the
      // course was renamed / archived" into each of its sections' histories.
      courseId,
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
      sectionId: section!.id,
      courseId: input.courseId,
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
      sectionId,
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
      sectionId,
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
    sectionId,
    ...(batchId
      ? { metadata: { sectionId, targetUserId: target.id, batchId } }
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
      // The section_staff row is deleted in this same transaction, so the
      // entity-id fan-out can never find it again: the scope has to be on the
      // audit row itself or the removal disappears from the section's history.
      sectionId,
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
