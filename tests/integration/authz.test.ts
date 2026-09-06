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
  getSectionAccess,
  requireCourseOwner,
  requireCourseStaff,
  requireEnrolledStudent,
  requireInstructor,
  requirePlatformAdmin,
  requireSectionQaAccess,
  requireSectionStaff,
} from "@/modules/authz";
import { assignCourseStaff, removeCourseStaff } from "@/modules/catalog";
import { courseStaff } from "@/db/schema";
import { and, eq } from "drizzle-orm";

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

  /**
   * Course-wide standing, end to end (ADR-0004). The authorization side of it
   * was already implemented — `requireSectionStaff` admits course staff before
   * it looks at a section row — but nothing could grant such a row, so the
   * reach of the grant had never been exercised from the outside.
   */
  describe("course-wide standing reaches every section, present and future", () => {
    async function grantee() {
      const owner = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      const existing = await makeSection(course.id);
      // Deliberately NOT a teacher: the grant is what confers access, and an
      // account can hold a course without ever having been given the teacher
      // capability.
      const person = await makeUser();
      const result = await assignCourseStaff(owner.id, course.id, {
        emails: [person.email],
        role: "co_teacher",
      });
      expect(result.ok).toBe(true);
      return { owner, course, existing, person };
    }

    it("admits the grantee to a section created AFTER the grant", async () => {
      const { course, existing, person } = await grantee();
      const later = await makeSection(course.id);

      for (const section of [existing, later]) {
        await expect(
          requireSectionStaff(db, person.id, section.id),
        ).resolves.toBeTruthy();
        // Every named permission, including the ones no TA flag was set for.
        await expect(
          requireSectionStaff(db, person.id, section.id, "exportParticipation"),
        ).resolves.toBeTruthy();
        await expect(
          requireSectionStaff(db, person.id, section.id, "viewStudentIdentities"),
        ).resolves.toBeTruthy();
        // And the non-delegable tier: they are an Instructor, not an assistant.
        await expect(
          requireInstructor(db, person.id, section.id),
        ).resolves.toBeTruthy();
      }
      await expect(
        requireCourseStaff(db, person.id, course.id),
      ).resolves.toBeTruthy();
    });

    it("reports course standing in the read model without making them the owner", async () => {
      const { course, existing, person } = await grantee();

      const access = await getSectionAccess(db, person.id, existing.id);
      expect(access!.staff).toMatchObject({
        role: "course_staff",
        hasCourseStanding: true,
        isInstructor: true,
        isCourseOwner: false,
      });
      expect(access!.staff!.permissions.markValidity).toBe(true);

      // Full capability is not ownership: they cannot alter who else has access.
      await expect(
        requireCourseOwner(db, person.id, course.id),
      ).rejects.toBeInstanceOf(AuthzError);
      await expect(
        assignCourseStaff(person.id, course.id, {
          emails: [person.email],
          role: "teacher",
        }),
      ).rejects.toBeInstanceOf(AuthzError);
    });

    it("denies every section again once the standing is revoked", async () => {
      const { owner, course, existing, person } = await grantee();
      const later = await makeSection(course.id);
      // An explicit, narrower grant on ONE section, made separately.
      await addSectionStaff(existing.id, person.id, "ta", {
        reviewResponses: true,
      });
      const row = (await db.query.courseStaff.findMany({
        where: and(
          eq(courseStaff.courseId, course.id),
          eq(courseStaff.userId, person.id),
        ),
      }))[0]!;

      await removeCourseStaff(owner.id, course.id, row.id);

      // The course itself, and the section they were never explicitly given.
      await expect(
        requireCourseStaff(db, person.id, course.id),
      ).rejects.toBeInstanceOf(AuthzError);
      await expect(
        requireSectionStaff(db, person.id, later.id),
      ).rejects.toBeInstanceOf(AuthzError);
      expect(await getSectionAccess(db, person.id, later.id)).toBeNull();

      // The explicit section grant survives, at ITS OWN narrower scope: they
      // may review, and nothing more.
      await expect(
        requireSectionStaff(db, person.id, existing.id, "reviewResponses"),
      ).resolves.toBeTruthy();
      await expect(
        requireSectionStaff(db, person.id, existing.id, "exportParticipation"),
      ).rejects.toBeInstanceOf(AuthzError);
      // And they are back to being an assistant, not an Instructor.
      await expect(
        requireInstructor(db, person.id, existing.id),
      ).rejects.toBeInstanceOf(AuthzError);
      const access = await getSectionAccess(db, person.id, existing.id);
      expect(access!.staff).toMatchObject({
        role: "ta",
        hasCourseStanding: false,
        isInstructor: false,
      });
    });
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
