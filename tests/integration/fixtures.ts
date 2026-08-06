import { randomUUID } from "node:crypto";
import { sealStudentNumber } from "@/modules/crypto/student-number";
import { db, uniq } from "./helpers";
import {
  accountMatches,
  classSections,
  courses,
  courseStaff,
  enrollments,
  formInstanceSections,
  formInstances,
  formScheduleSections,
  recurrenceSchedules,
  sectionStaff,
  studentRecords,
  users,
} from "@/db/schema";

export async function makeUser(
  overrides: Partial<typeof users.$inferInsert> = {},
) {
  const [row] = await db
    .insert(users)
    .values({
      email: `${uniq("user")}@up.edu.ph`,
      displayName: overrides.displayName ?? "Test User",
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeCourse(ownerUserId: string) {
  const [course] = await db
    .insert(courses)
    .values({ code: uniq("C"), title: "Course", ownerUserId })
    .returning();
  await db
    .insert(courseStaff)
    .values({ courseId: course!.id, userId: ownerUserId, role: "teacher" });
  return course!;
}

export async function makeSection(courseId: string) {
  const [section] = await db
    .insert(classSections)
    .values({
      courseId,
      term: "AY2026-1",
      title: uniq("Section"),
      timezone: "Asia/Manila",
    })
    .returning();
  return section!;
}

export async function addSectionStaff(
  sectionId: string,
  userId: string,
  role: "teacher" | "ta" | "co_teacher",
  flags: Partial<typeof sectionStaff.$inferInsert> = {},
) {
  const [row] = await db
    .insert(sectionStaff)
    .values({ sectionId, userId, role, ...flags })
    .returning();
  return row!;
}

export async function makeStudentRecord(
  fullName = "Juan Dela Cruz",
  studentNumber = uniq("2026"),
) {
  const normalized = fullName.toLowerCase();
  // Sealed exactly as the real import path does, so hash lookups and the
  // decrypt-for-export path behave identically in tests.
  const id = randomUUID();
  const sealed = sealStudentNumber(studentNumber, id);
  const [row] = await db
    .insert(studentRecords)
    .values({
      id,
      studentNumberCiphertext: sealed.ciphertext,
      studentNumberHash: sealed.hash,
      studentNumberLast4: sealed.last4,
      encKeyVersion: sealed.encKeyVersion,
      fullName,
      normalizedFullName: normalized,
      normalizedTokens: normalized.split(/\s+/).sort().join(" "),
    })
    .returning();
  return row!;
}

export async function enroll(
  sectionId: string,
  studentRecordId: string,
  status: "active" | "deactivated" = "active",
) {
  const [row] = await db
    .insert(enrollments)
    .values({ sectionId, studentRecordId, status, rosterName: "Roster Name" })
    .returning();
  return row!;
}

export async function confirmMatchDirect(
  userId: string,
  studentRecordId: string,
  confirmedByUserId: string,
) {
  const [row] = await db
    .insert(accountMatches)
    .values({
      userId,
      studentRecordId,
      state: "confirmed",
      method: "teacher",
      confirmedByUserId,
      confirmedAt: new Date(),
    })
    .returning();
  return row!;
}

/** Full student wired to a section: user + record + confirmed match + enrollment. */
export async function makeEnrolledStudent(
  sectionId: string,
  confirmedByUserId: string,
) {
  const user = await makeUser({ displayName: "Student User" });
  const record = await makeStudentRecord();
  await confirmMatchDirect(user.id, record.id, confirmedByUserId);
  await enroll(sectionId, record.id);
  return { user, record };
}

/**
 * A delivery configuration with an explicit audience.
 *
 * Fixtures write the audience row themselves rather than going through
 * `configureDelivery`, because most suites want a schedule without also
 * exercising its authorization path. The audience is still explicit — that is
 * the whole point of the model — so a fixture cannot accidentally create an
 * instance nobody can reach.
 */
export async function makeSchedule(opts: {
  courseId: string;
  sectionIds: string[];
  templateId: string;
  deliveryMode?: "one_time" | "weekly" | "custom_recurring" | "manual";
  audienceMode?: "all_sections" | "selected_sections";
  intervalWeeks?: number;
  openDayOfWeek?: number;
  openTime?: string;
  deadlineDayOfWeek?: number;
  deadlineTime?: string;
  startDate?: string;
  endDate?: string | null;
  occurrenceCount?: number | null;
  firstOpenAt?: Date | null;
  firstDeadlineAt?: Date | null;
  timezone?: string;
}) {
  const mode = opts.deliveryMode ?? "weekly";
  const recurring = mode === "weekly" || mode === "custom_recurring";
  const [schedule] = await db
    .insert(recurrenceSchedules)
    .values({
      courseId: opts.courseId,
      sectionId: null,
      deliveryMode: mode,
      audienceMode: opts.audienceMode ?? "selected_sections",
      intervalWeeks: opts.intervalWeeks ?? 1,
      openDayOfWeek: recurring ? (opts.openDayOfWeek ?? 1) : null,
      openTime: recurring ? (opts.openTime ?? "08:00:00") : null,
      deadlineDayOfWeek: recurring ? (opts.deadlineDayOfWeek ?? 5) : null,
      deadlineTime: recurring ? (opts.deadlineTime ?? "17:00:00") : null,
      startDate: recurring ? (opts.startDate ?? "2026-01-05") : null,
      endDate: recurring ? (opts.endDate ?? null) : null,
      occurrenceCount: recurring ? (opts.occurrenceCount ?? null) : null,
      firstOpenAt: opts.firstOpenAt ?? null,
      firstDeadlineAt: opts.firstDeadlineAt ?? null,
      templateId: opts.templateId,
      timezone: opts.timezone ?? "Asia/Manila",
    })
    .returning();
  if (opts.sectionIds.length > 0) {
    await db.insert(formScheduleSections).values(
      opts.sectionIds.map((sectionId) => ({
        scheduleId: schedule!.id,
        sectionId,
      })),
    );
  }
  return schedule!;
}

/**
 * One form instance with an explicit audience, for suites that need an open form
 * without a schedule behind it.
 */
export async function makeInstance(opts: {
  courseId: string;
  sectionIds: string[];
  openAt: Date;
  deadlineAt: Date;
  state?: "draft" | "scheduled" | "open" | "closed" | "archived" | "skipped";
  deliveryMode?: "one_time" | "weekly" | "custom_recurring" | "manual";
  cycleIndex?: number;
  templateVersionId?: string | null;
  title?: string | null;
  focusLabel?: string | null;
}) {
  const [instance] = await db
    .insert(formInstances)
    .values({
      courseId: opts.courseId,
      sectionId: null,
      deliveryMode: opts.deliveryMode ?? "weekly",
      cycleIndex: opts.cycleIndex ?? 1,
      openAt: opts.openAt,
      deadlineAt: opts.deadlineAt,
      state: opts.state ?? "open",
      templateVersionId: opts.templateVersionId ?? null,
      title: opts.title ?? null,
      focusLabel: opts.focusLabel ?? null,
    })
    .returning();
  await db.insert(formInstanceSections).values(
    opts.sectionIds.map((sectionId) => ({
      instanceId: instance!.id,
      sectionId,
    })),
  );
  return instance!;
}
