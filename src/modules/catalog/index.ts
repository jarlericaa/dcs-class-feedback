import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accountMatches,
  classSections,
  courses,
  courseStaff,
  enrollments,
  sectionStaff,
} from "@/db/schema";
import { getConfirmedStudentRecord } from "@/modules/authz";

/**
 * Catalog read helpers for the dashboard: which sections does this user see,
 * and in what capacity? Read-only; every content access still goes through
 * the authz module on the target pages.
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
      : ("pending" as const);

  return { staffSections, studentSections, matchStatus };
}
