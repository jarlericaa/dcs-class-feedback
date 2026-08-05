import { randomUUID } from "node:crypto";
import { sealStudentNumber } from "@/modules/crypto/student-number";
import { db, uniq } from "./helpers";
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
