import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, truncateAll, uniq } from "./helpers";
import {
  enroll,
  makeCourse,
  makeSection,
  makeStudentRecord,
  makeUser,
} from "./fixtures";
import { enrollments, studentRecords, users } from "@/db/schema";
import {
  AuthzError,
  getStudentRecordForUser,
  requireEnrolledStudent,
} from "@/modules/authz";
import { listSectionsForUser } from "@/modules/catalog";
import { commitRosterImport, parseRosterCsv } from "@/modules/roster-import";

/**
 * Student identity is exact normalized UP-email matching against the
 * teacher-uploaded class list (docs/domain/student-identity.md). These tests are the
 * executable form of that rule: what it grants, what it refuses, and the things
 * it must NOT consider — above all, the name.
 */

async function teacherWithSection() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  return { teacher, course, section };
}

function csv(rows: [string, string, string][]) {
  return parseRosterCsv(
    ["student number,full name,up mail", ...rows.map((r) => r.join(","))].join(
      "\n",
    ),
  );
}

describe("resolving an account to a student record", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("gives a rostered student their section with no claim step", async () => {
    const { teacher, section } = await teacherWithSection();
    await commitRosterImport(
      teacher.id,
      section.id,
      csv([["2026-0001", "Juan Dela Cruz", "student@up.edu.ph"]]),
      "seed roster",
    );
    const student = await makeUser({
      email: "student@up.edu.ph",
      displayName: "Juan Dela Cruz",
    });

    const record = await getStudentRecordForUser(db, student.id);
    expect(record?.fullName).toBe("Juan Dela Cruz");
    expect(record?.studentNumberLast4).toBe("0001");
    await expect(
      requireEnrolledStudent(db, student.id, section.id),
    ).resolves.toBeTruthy();

    const { studentSections, isRostered } = await listSectionsForUser(student.id);
    expect(isRostered).toBe(true);
    expect(studentSections.map((s) => s.id)).toEqual([section.id]);
  });

  it("gives an account whose email is on no class list nothing at all", async () => {
    const { teacher, section } = await teacherWithSection();
    await commitRosterImport(
      teacher.id,
      section.id,
      csv([["2026-0001", "Juan Dela Cruz", "student@up.edu.ph"]]),
      "seed roster",
    );
    const stranger = await makeUser({
      email: "stranger@up.edu.ph",
      displayName: "Juan Dela Cruz", // the same name, deliberately
    });

    expect(await getStudentRecordForUser(db, stranger.id)).toBeNull();
    await expect(
      requireEnrolledStudent(db, stranger.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
    const { studentSections, isRostered } = await listSectionsForUser(
      stranger.id,
    );
    expect(isRostered).toBe(false);
    expect(studentSections).toEqual([]);
  });

  it("matches regardless of the case and whitespace either side was entered with", async () => {
    const { teacher, section } = await teacherWithSection();
    await commitRosterImport(
      teacher.id,
      section.id,
      csv([["2026-0001", "Juan Dela Cruz", "  JUAN.DelaCruz@UP.EDU.PH "]]),
      "seed roster",
    );
    // The account side is normalized at sign-in; assert against the stored form.
    const student = await makeUser({ email: "juan.delacruz@up.edu.ph" });
    await expect(
      requireEnrolledStudent(db, student.id, section.id),
    ).resolves.toBeTruthy();
  });

  /**
   * The whole point of the change. A name — even an exact one — grants nothing.
   */
  it("never resolves identity by name", async () => {
    const { teacher, section } = await teacherWithSection();
    await commitRosterImport(
      teacher.id,
      section.id,
      csv([["2026-0001", "Juan Dela Cruz", "juan.delacruz@up.edu.ph"]]),
      "v1",
    );
    for (const displayName of [
      "Juan Dela Cruz",
      "juan dela cruz",
      "Dela Cruz, Juan",
      "Juan D. Cruz",
    ]) {
      const impostor = await makeUser({
        email: `${uniq("impostor")}@up.edu.ph`,
        displayName,
      });
      expect(await getStudentRecordForUser(db, impostor.id)).toBeNull();
      await expect(
        requireEnrolledStudent(db, impostor.id, section.id),
      ).rejects.toBeInstanceOf(AuthzError);
    }
  });

  it("keeps two students with identical names entirely separate", async () => {
    const { teacher, section } = await teacherWithSection();
    await commitRosterImport(
      teacher.id,
      section.id,
      csv([
        ["2026-0001", "Maria Santos", "maria.santos.a@up.edu.ph"],
        ["2026-0002", "Maria Santos", "maria.santos.b@up.edu.ph"],
      ]),
      "v1",
    );
    const a = await makeUser({
      email: "maria.santos.a@up.edu.ph",
      displayName: "Maria Santos",
    });
    const b = await makeUser({
      email: "maria.santos.b@up.edu.ph",
      displayName: "Maria Santos",
    });

    const recordA = (await getStudentRecordForUser(db, a.id))!;
    const recordB = (await getStudentRecordForUser(db, b.id))!;
    expect(recordA.id).not.toBe(recordB.id);
    expect(recordA.studentNumberLast4).toBe("0001");
    expect(recordB.studentNumberLast4).toBe("0002");
  });

  it("refuses at the database level to give two records one email", async () => {
    const first = await makeStudentRecord("A One", uniq("2026"), "same@up.edu.ph");
    expect(first.rosterEmail).toBe("same@up.edu.ph");
    await expect(
      makeStudentRecord("B Two", uniq("2026"), "same@up.edu.ph"),
    ).rejects.toThrow();
  });

  it("refuses at the database level to store an unnormalized email", async () => {
    await expect(
      makeStudentRecord("Shouty", uniq("2026"), "SHOUTY@up.edu.ph"),
    ).rejects.toThrow();
  });
});

describe("roster changes take effect without a second login", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("an account that already existed gains access the moment it is imported", async () => {
    const { teacher, section } = await teacherWithSection();
    // The student signs in FIRST, before any class list exists.
    const student = await makeUser({ email: "early@up.edu.ph" });
    await expect(
      requireEnrolledStudent(db, student.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);

    await commitRosterImport(
      teacher.id,
      section.id,
      csv([["2026-0007", "Early Bird", "early@up.edu.ph"]]),
      "v1",
    );

    // No new session, no linking step: the next read resolves.
    await expect(
      requireEnrolledStudent(db, student.id, section.id),
    ).resolves.toBeTruthy();
  });

  it("gives a student in two sections access to both, and only those", async () => {
    const { teacher, course, section } = await teacherWithSection();
    const second = await makeSection(course.id);
    const elsewhere = await makeSection(course.id);
    const list = csv([["2026-0009", "Both Sections", "both@up.edu.ph"]]);
    await commitRosterImport(teacher.id, section.id, list, "v1");
    await commitRosterImport(teacher.id, second.id, csv([
      ["2026-0009", "Both Sections", "both@up.edu.ph"],
    ]), "v1");

    const student = await makeUser({ email: "both@up.edu.ph" });
    await expect(
      requireEnrolledStudent(db, student.id, section.id),
    ).resolves.toBeTruthy();
    await expect(
      requireEnrolledStudent(db, student.id, second.id),
    ).resolves.toBeTruthy();
    await expect(
      requireEnrolledStudent(db, student.id, elsewhere.id),
    ).rejects.toBeInstanceOf(AuthzError);

    // One record, reused across both sections — not two identities.
    expect(await db.query.studentRecords.findMany()).toHaveLength(1);
    const { studentSections } = await listSectionsForUser(student.id);
    expect(studentSections.map((s) => s.id).sort()).toEqual(
      [section.id, second.id].sort(),
    );
  });

  it("stops access to a section the student is dropped from, keeping the others", async () => {
    const { teacher, course, section } = await teacherWithSection();
    const second = await makeSection(course.id);
    const row: [string, string, string] = [
      "2026-0010",
      "Dropped Later",
      "dropped@up.edu.ph",
    ];
    await commitRosterImport(teacher.id, section.id, csv([row]), "v1");
    await commitRosterImport(teacher.id, second.id, csv([row]), "v1");
    const student = await makeUser({ email: "dropped@up.edu.ph" });

    // Re-import the first section's list without them.
    await commitRosterImport(
      teacher.id,
      section.id,
      csv([["2026-0011", "Someone Else", "someone.else@up.edu.ph"]]),
      "v2",
    );

    await expect(
      requireEnrolledStudent(db, student.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
    // The other section is untouched.
    await expect(
      requireEnrolledStudent(db, student.id, second.id),
    ).resolves.toBeTruthy();
    // Nothing was deleted — the deactivated enrolment is still there.
    const rows = await db.query.enrollments.findMany({
      where: eq(enrollments.sectionId, section.id),
    });
    expect(rows.filter((r) => r.status === "deactivated")).toHaveLength(1);
  });

  it("follows a student whose UP email is corrected in the class list", async () => {
    const { teacher, section } = await teacherWithSection();
    await commitRosterImport(
      teacher.id,
      section.id,
      csv([["2026-0012", "Typo Victim", "typo@up.edu.ph"]]),
      "v1",
    );
    const wrongAccount = await makeUser({ email: "typo@up.edu.ph" });
    const rightAccount = await makeUser({ email: "correct@up.edu.ph" });
    await expect(
      requireEnrolledStudent(db, wrongAccount.id, section.id),
    ).resolves.toBeTruthy();

    await commitRosterImport(
      teacher.id,
      section.id,
      csv([["2026-0012", "Typo Victim", "correct@up.edu.ph"]]),
      "v2",
    );

    // The record moved wholesale: the old address loses it, the new one gains it,
    // and the submissions attached to the record went with it.
    await expect(
      requireEnrolledStudent(db, wrongAccount.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      requireEnrolledStudent(db, rightAccount.id, section.id),
    ).resolves.toBeTruthy();
    expect(await db.query.studentRecords.findMany()).toHaveLength(1);
  });

  it("refuses a deactivated account even while its email is on the list", async () => {
    const { teacher, section } = await teacherWithSection();
    await commitRosterImport(
      teacher.id,
      section.id,
      csv([["2026-0013", "Disabled", "disabled@up.edu.ph"]]),
      "v1",
    );
    const student = await makeUser({ email: "disabled@up.edu.ph" });
    await db
      .update(users)
      .set({ active: false })
      .where(eq(users.id, student.id));

    await expect(
      requireEnrolledStudent(db, student.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("grants nothing from a record with no email, however it got that way", async () => {
    const { section } = await teacherWithSection();
    const record = await makeStudentRecord("Legacy Row", uniq("2026"), null);
    await enroll(section.id, record.id);
    // An account with no email cannot exist, but a record without one can —
    // rows imported before the email column, for instance. It must match nobody.
    const anyone = await makeUser({ email: "anyone@up.edu.ph" });
    expect(await getStudentRecordForUser(db, anyone.id)).toBeNull();
    await expect(
      requireEnrolledStudent(db, anyone.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
    expect(
      (await db.query.studentRecords.findFirst({
        where: eq(studentRecords.id, record.id),
      }))!.rosterEmail,
    ).toBeNull();
  });
});
