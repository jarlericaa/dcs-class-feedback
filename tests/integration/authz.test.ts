import { beforeEach, describe, expect, it } from "vitest";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  makeCourse,
  makeEnrolledStudent,
  makeSection,
  makeStudentRecord,
  makeUser,
  enroll,
} from "./fixtures";
import {
  AuthzError,
  requireCourseStaff,
  requireEnrolledStudent,
  requirePlatformAdmin,
  requireSectionQaAccess,
  requireSectionStaff,
} from "@/modules/authz";

describe("authorization (deny-by-default, resource-scoped)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("denies an unrelated teacher access to another teacher's course and section", async () => {
    const owner = await makeUser({ isTeacher: true });
    const outsider = await makeUser({ isTeacher: true });
    const course = await makeCourse(owner.id);
    const section = await makeSection(course.id);

    await expect(
      requireCourseStaff(db, outsider.id, course.id),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      requireSectionStaff(db, outsider.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);

    // owner passes both
    await expect(
      requireCourseStaff(db, owner.id, course.id),
    ).resolves.toBeTruthy();
    await expect(
      requireSectionStaff(db, owner.id, section.id, "markValidity"),
    ).resolves.toBeTruthy();
  });

  it("platform admin gets NO automatic content access", async () => {
    const owner = await makeUser({ isTeacher: true });
    const admin = await makeUser({ isPlatformAdmin: true });
    const course = await makeCourse(owner.id);
    const section = await makeSection(course.id);

    await expect(requirePlatformAdmin(db, admin.id)).resolves.toBeTruthy();
    await expect(
      requireCourseStaff(db, admin.id, course.id),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      requireSectionStaff(db, admin.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(requirePlatformAdmin(db, owner.id)).rejects.toBeInstanceOf(
      AuthzError,
    );
  });

  it("TA permission flags gate capabilities individually", async () => {
    const owner = await makeUser({ isTeacher: true });
    const ta = await makeUser();
    const course = await makeCourse(owner.id);
    const section = await makeSection(course.id);
    await addSectionStaff(section.id, ta.id, "ta", {
      reviewResponses: true,
      markValidity: false,
    });

    await expect(
      requireSectionStaff(db, ta.id, section.id, "reviewResponses"),
    ).resolves.toBeTruthy();
    await expect(
      requireSectionStaff(db, ta.id, section.id, "markValidity"),
    ).rejects.toBeInstanceOf(AuthzError);
    // Asking for no named permission means "any staff member of this
    // section", which a TA satisfies — they hold standing on the section even
    // when a specific flag is absent. Capabilities that are deliberately not
    // delegable to a TA (section settings, audit history) use
    // requireNonTaSectionStaff instead, covered in review-findings.test.ts.
    await expect(
      requireSectionStaff(db, ta.id, section.id),
    ).resolves.toBeTruthy();
  });

  it("co_teacher role passes all section permissions", async () => {
    const owner = await makeUser({ isTeacher: true });
    const co = await makeUser({ isTeacher: true });
    const course = await makeCourse(owner.id);
    const section = await makeSection(course.id);
    await addSectionStaff(section.id, co.id, "co_teacher");

    await expect(
      requireSectionStaff(db, co.id, section.id, "exportParticipation"),
    ).resolves.toBeTruthy();
  });

  it("student access requires a rostered email AND an active enrollment", async () => {
    const owner = await makeUser({ isTeacher: true });
    const course = await makeCourse(owner.id);
    const section = await makeSection(course.id);

    // an account whose email is on no class list at all
    const stranger = await makeUser();
    await expect(
      requireEnrolledStudent(db, stranger.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);

    // rostered + enrolled passes
    const { user } = await makeEnrolledStudent(section.id);
    await expect(
      requireEnrolledStudent(db, user.id, section.id),
    ).resolves.toBeTruthy();

    // enrollment in a DIFFERENT section does not grant this one
    const otherSection = await makeSection(course.id);
    await expect(
      requireEnrolledStudent(db, user.id, otherSection.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("deactivated enrollment does not grant access", async () => {
    const owner = await makeUser({ isTeacher: true });
    const course = await makeCourse(owner.id);
    const section = await makeSection(course.id);
    const user = await makeUser();
    const record = await makeStudentRecord();
    const { linkRosterEmail } = await import("./fixtures");
    await linkRosterEmail(user.id, record.id);
    await enroll(section.id, record.id, "deactivated");

    await expect(
      requireEnrolledStudent(db, user.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("section Q&A archive is class-only: staff and enrolled students, nobody else", async () => {
    const owner = await makeUser({ isTeacher: true });
    const course = await makeCourse(owner.id);
    const section = await makeSection(course.id);
    const { user: student } = await makeEnrolledStudent(section.id);
    const outsider = await makeUser();

    await expect(
      requireSectionQaAccess(db, owner.id, section.id),
    ).resolves.toEqual({ role: "staff" });
    await expect(
      requireSectionQaAccess(db, student.id, section.id),
    ).resolves.toEqual({ role: "student" });
    await expect(
      requireSectionQaAccess(db, outsider.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });
});
