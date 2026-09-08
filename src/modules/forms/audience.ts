import { and, asc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import {
  classSections,
  enrollments,
  formInstanceSections,
  formInstances,
  formScheduleSections,
} from "@/db/schema";
import {
  AuthzError,
  getStudentRecordForUser,
  requireActiveUser,
  requireSectionStaff,
  requireWritableCourse,
  type AuthzOptions,
  type SectionPermission,
} from "@/modules/authz";

/**
 * Form audiences: who may receive a form, and what that means for access.
 *
 * A form instance's audience is the set of rows in `formInstanceSections` —
 * never the page a teacher happens to be on, never a single denormalized column.
 * `formInstances.sectionId` is a legacy anchor and is deliberately NOT consulted
 * here (docs/domain/forms-and-audiences.md §2.2).
 *
 * The three rules this module exists to enforce:
 *
 * 1. a student reaches an instance only through an enrolment in one of its
 *    audience sections;
 * 2. a staff member reaches an instance only through a permission held on one of
 *    its audience sections, and sees only the sections they hold it on;
 * 3. a response is attributed to exactly one audience section, resolved once and
 *    never re-derived — which is what keeps per-section reads exact without a
 *    per-section copy of the form.
 */

export class AudienceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudienceError";
  }
}

export type AudienceInput =
  | { mode: "all_sections" }
  | { mode: "selected_sections"; sectionIds: string[] };

/**
 * Resolve an audience declaration to concrete section ids, validating that every
 * one belongs to the course.
 *
 * `all_sections` resolves to the course's ACTIVE sections at the moment of
 * resolution, so a section added mid-term is picked up the next time instances
 * are generated. The resolved list is always written to an audience table, so
 * the audience of an instance that already exists never changes underneath it.
 */
export async function resolveAudienceSections(
  dbx: DbOrTx,
  courseId: string,
  input: AudienceInput,
): Promise<string[]> {
  const sections = await dbx.query.classSections.findMany({
    where: eq(classSections.courseId, courseId),
    orderBy: [asc(classSections.title), asc(classSections.id)],
  });
  if (input.mode === "all_sections") {
    const active = sections.filter((s) => s.active).map((s) => s.id);
    if (active.length === 0) {
      throw new AudienceError(
        "This course has no active class section yet, so there is nobody to send a form to.",
      );
    }
    return active;
  }
  const wanted = [...new Set(input.sectionIds)];
  if (wanted.length === 0) {
    throw new AudienceError("Choose at least one section for this form.");
  }
  const byId = new Map(sections.map((s) => [s.id, s]));
  for (const id of wanted) {
    if (!byId.has(id)) {
      throw new AudienceError("Choose sections that belong to this course.");
    }
  }
  // Ordered the same way `all_sections` is, so attribution and the "first
  // audience section" tie-breaks are stable regardless of click order.
  return sections.filter((s) => wanted.includes(s.id)).map((s) => s.id);
}

/** The sections a schedule delivers to. */
export async function getScheduleAudience(
  dbx: DbOrTx,
  scheduleId: string,
): Promise<string[]> {
  const rows = await dbx.query.formScheduleSections.findMany({
    where: eq(formScheduleSections.scheduleId, scheduleId),
  });
  return rows.map((r) => r.sectionId);
}

/** The sections one form instance was delivered to. */
export async function getInstanceAudience(
  dbx: DbOrTx,
  instanceId: string,
): Promise<string[]> {
  const rows = await dbx.query.formInstanceSections.findMany({
    where: eq(formInstanceSections.instanceId, instanceId),
  });
  return rows.map((r) => r.sectionId);
}

/** Audience section ids for many instances at once, keyed by instance. */
export async function getAudiencesForInstances(
  dbx: DbOrTx,
  instanceIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (instanceIds.length === 0) return map;
  const rows = await dbx.query.formInstanceSections.findMany({
    where: inArray(formInstanceSections.instanceId, instanceIds),
  });
  for (const row of rows) {
    const list = map.get(row.instanceId) ?? [];
    list.push(row.sectionId);
    map.set(row.instanceId, list);
  }
  return map;
}

/**
 * Write an instance's audience. Called only by the services that create
 * instances, which is where the "at least one audience section" rule lives —
 * a CHECK cannot span tables (§6.3).
 */
export async function setInstanceAudience(
  dbx: DbOrTx,
  instanceId: string,
  sectionIds: string[],
) {
  if (sectionIds.length === 0) {
    throw new AudienceError("A form instance must target at least one section.");
  }
  await dbx
    .insert(formInstanceSections)
    .values(sectionIds.map((sectionId) => ({ instanceId, sectionId })))
    .onConflictDoNothing();
}

/** Instances (of any course) whose audience includes this section. */
export async function instanceIdsForSection(
  dbx: DbOrTx,
  sectionId: string,
): Promise<string[]> {
  const rows = await dbx.query.formInstanceSections.findMany({
    where: eq(formInstanceSections.sectionId, sectionId),
  });
  return rows.map((r) => r.instanceId);
}

/**
 * Student access to a form instance.
 *
 * Admits a user whose normalized UP email is on a class list AND who holds an
 * ACTIVE enrolment in at least one audience section, and returns the resolved
 * student record together with the section the response is attributed to.
 *
 * Attribution is deterministic — the audience is ordered by (section title, id),
 * so a student in two targeted sections always resolves to the same one. It is
 * recorded on the response's first save and never re-derived, so a later roster
 * change cannot silently move an existing response between sections.
 */
export async function requireAudienceStudent(
  dbx: DbOrTx,
  userId: string,
  instanceId: string,
  opts?: AuthzOptions,
): Promise<{
  studentRecordId: string;
  sectionId: string;
  /**
   * How many of this instance's audience sections the student is actually in.
   * More than one is rare and is the only case where naming a section tells them
   * anything, so the UI uses this to decide whether to show one at all.
   */
  enrolledSectionCount: number;
}> {
  await requireActiveUser(dbx, userId);
  const record = await getStudentRecordForUser(dbx, userId);
  if (!record) throw new AuthzError("No student record for this email");

  const audience = await getInstanceAudience(dbx, instanceId);
  if (audience.length === 0) throw new AuthzError("No access to this form");

  const active = await dbx.query.enrollments.findMany({
    where: and(
      inArray(enrollments.sectionId, audience),
      eq(enrollments.studentRecordId, record.id),
      eq(enrollments.status, "active"),
    ),
  });
  if (active.length === 0) {
    // Same message as an unknown instance: a student must not be able to probe
    // for the existence of a form belonging to a section they are not in.
    throw new AuthzError("No access to this form");
  }

  const enrolledIds = new Set(active.map((e) => e.sectionId));
  const ordered = await orderSections(dbx, [...enrolledIds]);
  const sectionId = ordered[0]!;

  // Archive rule, applied once, AFTER standing is established: a stranger must
  // not learn that a form exists but its course is archived.
  if (!opts?.allowArchived) {
    const instance = await dbx.query.formInstances.findFirst({
      where: eq(formInstances.id, instanceId),
    });
    if (instance) await requireWritableCourse(dbx, instance.courseId);
  }
  return {
    studentRecordId: record.id,
    sectionId,
    enrolledSectionCount: enrolledIds.size,
  };
}

/**
 * The audience sections of this instance on which the actor holds `permission`.
 *
 * This is the whole per-section privacy story for a shared form: every staff
 * read model filters its rows by this set, so a TA on Section A reviewing a
 * course-wide form sees Section A's responses and nothing else. An empty
 * intersection is a refusal, not an empty list.
 */
export async function authorizedAudienceSections(
  dbx: DbOrTx,
  userId: string,
  instanceId: string,
  permission?: SectionPermission,
  opts?: AuthzOptions,
): Promise<string[]> {
  const audience = await getInstanceAudience(dbx, instanceId);
  const allowed = await filterAuthorizedSections(
    dbx,
    userId,
    audience,
    permission,
    opts,
  );
  if (allowed.length === 0) throw new AuthzError("No access to this form");
  return allowed;
}

/**
 * Subset of `sectionIds` on which the actor holds `permission`. Never throws for
 * a section the actor cannot reach — it is simply absent, which is what lets a
 * course-level list show a staff member exactly their own slice.
 */
export async function filterAuthorizedSections(
  dbx: DbOrTx,
  userId: string,
  sectionIds: string[],
  permission?: SectionPermission,
  opts?: AuthzOptions,
): Promise<string[]> {
  const allowed: string[] = [];
  for (const sectionId of sectionIds) {
    try {
      await requireSectionStaff(dbx, userId, sectionId, permission, {
        allowArchived: true,
        ...opts,
      });
      allowed.push(sectionId);
    } catch {
      // Not authorized on this one. Deliberately silent: the caller's contract
      // is "your slice", and an error here would leak that the section exists.
    }
  }
  return orderSections(dbx, allowed);
}

/**
 * Staff access to one instance, with the authorized slice of its audience.
 * The instance row is returned so callers do not re-read it.
 */
export async function requireInstanceStaff(
  dbx: DbOrTx,
  userId: string,
  instanceId: string,
  permission?: SectionPermission,
  opts?: AuthzOptions,
) {
  const instance = await dbx.query.formInstances.findFirst({
    where: eq(formInstances.id, instanceId),
  });
  if (!instance) throw new AuthzError("No access to this form");
  const sectionIds = await authorizedAudienceSections(
    dbx,
    userId,
    instanceId,
    permission,
    opts,
  );
  return { instance, sectionIds };
}

/** Stable ordering used for attribution and for "the first audience section". */
export async function orderSections(
  dbx: DbOrTx,
  sectionIds: string[],
): Promise<string[]> {
  if (sectionIds.length <= 1) return sectionIds;
  const rows = await dbx.query.classSections.findMany({
    where: inArray(classSections.id, sectionIds),
    orderBy: [asc(classSections.title), asc(classSections.id)],
  });
  return rows.map((r) => r.id);
}

/** Convenience wrappers bound to the app db. */
export const audience = {
  getInstanceAudience: (instanceId: string) =>
    getInstanceAudience(db, instanceId),
  requireAudienceStudent: (
    userId: string,
    instanceId: string,
    opts?: AuthzOptions,
  ) => requireAudienceStudent(db, userId, instanceId, opts),
  authorizedAudienceSections: (
    userId: string,
    instanceId: string,
    permission?: SectionPermission,
    opts?: AuthzOptions,
  ) => authorizedAudienceSections(db, userId, instanceId, permission, opts),
};
