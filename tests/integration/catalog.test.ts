import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import { addSectionStaff, makeCourse, makeSection, makeUser } from "./fixtures";
import {
  auditEvents,
  classSections,
  courses,
  courseStaff,
  sectionStaff,
  users,
} from "@/db/schema";
import {
  assignSectionStaff,
  CatalogError,
  countSectionCourseStanding,
  createCourse,
  createSection,
  listAccountsForAdmin,
  listCourseAccess,
  listSectionStaff,
  removeSectionStaff,
  setTeacherRole,
  updateSection,
} from "@/modules/catalog";
import { AuthzError, getSectionAccess } from "@/modules/authz";
import { MAX_PAGE_SIZE } from "@/lib/pagination";

describe("catalog: courses, sections, and staff assignment", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe("course creation", () => {
    it("requires the teacher capability", async () => {
      const nobody = await makeUser();
      await expect(
        createCourse(nobody.id, { code: "X-1", title: "Nope" }),
      ).rejects.toBeInstanceOf(AuthzError);
      expect(await db.query.courses.findMany()).toHaveLength(0);
    });

    it("makes the creator the owner and records an audit event", async () => {
      const teacher = await makeUser({ isTeacher: true });
      const course = await createCourse(teacher.id, {
        code: "DCS-101",
        title: "Intro",
      });
      expect(course.ownerUserId).toBe(teacher.id);

      const staff = await db.query.courseStaff.findMany();
      expect(staff).toHaveLength(1);

      const events = await db.query.auditEvents.findMany({
        where: eq(auditEvents.action, "course.created"),
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.actorUserId).toBe(teacher.id);
      expect(events[0]!.after).toMatchObject({ code: "DCS-101" });
    });

    it("rejects blank input before touching the database", async () => {
      const teacher = await makeUser({ isTeacher: true });
      await expect(
        createCourse(teacher.id, { code: "   ", title: "" }),
      ).rejects.toThrow();
      expect(await db.query.courses.findMany()).toHaveLength(0);
    });
  });

  describe("section creation", () => {
    it("denies a teacher who is not staff on the course", async () => {
      const owner = await makeUser({ isTeacher: true });
      const outsider = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);

      await expect(
        createSection(outsider.id, {
          courseId: course.id,
          term: "AY2026-1",
          title: "Section A",
        }),
      ).rejects.toBeInstanceOf(AuthzError);
      expect(await db.query.classSections.findMany()).toHaveLength(0);
    });

    it("records the creator as the section teacher so they can staff it", async () => {
      const owner = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      const section = await createSection(owner.id, {
        courseId: course.id,
        term: "AY2026-1",
        title: "Section A",
      });

      const staff = await db.query.sectionStaff.findMany({
        where: eq(sectionStaff.sectionId, section.id),
      });
      expect(staff).toHaveLength(1);
      expect(staff[0]!.userId).toBe(owner.id);
      expect(staff[0]!.role).toBe("teacher");
    });

    it("audits a section update with before and after values", async () => {
      const owner = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      const section = await createSection(owner.id, {
        courseId: course.id,
        term: "AY2026-1",
        title: "Old title",
      });

      await updateSection(owner.id, section.id, { title: "New title" });

      const updated = await db.query.classSections.findFirst({
        where: eq(classSections.id, section.id),
      });
      expect(updated!.title).toBe("New title");

      const events = await db.query.auditEvents.findMany({
        where: eq(auditEvents.action, "section.updated"),
      });
      expect(events[0]!.before).toMatchObject({ title: "Old title" });
      expect(events[0]!.after).toMatchObject({ title: "New title" });
    });

    it("denies a TA without a matching flag from editing section settings", async () => {
      const owner = await makeUser({ isTeacher: true });
      const ta = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });

      await expect(
        updateSection(ta.id, section.id, { title: "Hijacked" }),
      ).rejects.toBeInstanceOf(AuthzError);
    });
  });

  describe("staff assignment is the course owner's call only", () => {
    it("refuses a co-teacher who is not the owner", async () => {
      const owner = await makeUser({ isTeacher: true });
      const coTeacher = await makeUser({ isTeacher: true });
      const target = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      await addSectionStaff(section.id, coTeacher.id, "co_teacher");

      await expect(
        assignSectionStaff(coTeacher.id, section.id, {
          email: target.email,
          role: "ta",
          permissions: { reviewResponses: true },
        }),
      ).rejects.toBeInstanceOf(AuthzError);
    });

    it("refuses a TA trying to escalate their own permissions", async () => {
      const owner = await makeUser({ isTeacher: true });
      const ta = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });

      await expect(
        assignSectionStaff(ta.id, section.id, {
          email: ta.email,
          role: "ta",
          permissions: {
            exportParticipation: true,
            viewStudentIdentities: true,
          },
        }),
      ).rejects.toBeInstanceOf(AuthzError);

      const row = await db.query.sectionStaff.findFirst({
        where: and(
          eq(sectionStaff.sectionId, section.id),
          eq(sectionStaff.userId, ta.id),
        ),
      });
      expect(row!.exportParticipation).toBe(false);
      expect(row!.viewStudentIdentities).toBe(false);
    });

    it("grants a TA exactly the ticked flags and nothing else", async () => {
      const owner = await makeUser({ isTeacher: true });
      const ta = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await createSection(owner.id, {
        courseId: course.id,
        term: "AY2026-1",
        title: "Section A",
      });

      await assignSectionStaff(owner.id, section.id, {
        email: ta.email,
        role: "ta",
        permissions: { reviewResponses: true, sendPrivateResponses: true },
      });

      const access = await getSectionAccess(db, ta.id, section.id);
      expect(access!.staff!.permissions.reviewResponses).toBe(true);
      expect(access!.staff!.permissions.sendPrivateResponses).toBe(true);
      expect(access!.staff!.permissions.publishPublicAnswers).toBe(false);
      expect(access!.staff!.permissions.exportParticipation).toBe(false);
      expect(access!.staff!.permissions.viewStudentIdentities).toBe(false);
    });

    it("stores every capability for a co-teacher rather than a misleading false", async () => {
      const owner = await makeUser({ isTeacher: true });
      const co = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await createSection(owner.id, {
        courseId: course.id,
        term: "AY2026-1",
        title: "Section A",
      });

      await assignSectionStaff(owner.id, section.id, {
        email: co.email,
        role: "co_teacher",
        permissions: {},
      });

      const row = await db.query.sectionStaff.findFirst({
        where: and(
          eq(sectionStaff.sectionId, section.id),
          eq(sectionStaff.userId, co.id),
        ),
      });
      expect(row!.publishPublicAnswers).toBe(true);
      expect(row!.exportParticipation).toBe(true);
    });

    it("never creates an account for an unknown email", async () => {
      const owner = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      const section = await createSection(owner.id, {
        courseId: course.id,
        term: "AY2026-1",
        title: "Section A",
      });
      const before = (await db.query.users.findMany()).length;

      await expect(
        assignSectionStaff(owner.id, section.id, {
          email: "typo@up.edu.ph",
          role: "ta",
          permissions: {},
        }),
      ).rejects.toBeInstanceOf(CatalogError);
      expect(await db.query.users.findMany()).toHaveLength(before);
    });

    it("audits a permission change with before and after flags", async () => {
      const owner = await makeUser({ isTeacher: true });
      const ta = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await createSection(owner.id, {
        courseId: course.id,
        term: "AY2026-1",
        title: "Section A",
      });
      await assignSectionStaff(owner.id, section.id, {
        email: ta.email,
        role: "ta",
        permissions: { reviewResponses: true },
      });
      await assignSectionStaff(owner.id, section.id, {
        email: ta.email,
        role: "ta",
        permissions: { reviewResponses: true, markValidity: true },
      });

      const events = await db.query.auditEvents.findMany({
        where: eq(auditEvents.action, "staff.permissions_changed"),
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.before).toMatchObject({ markValidity: false });
      expect(events[0]!.after).toMatchObject({ markValidity: true });
    });

    it("refuses to remove the course owner from their own section", async () => {
      const owner = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      const section = await createSection(owner.id, {
        courseId: course.id,
        term: "AY2026-1",
        title: "Section A",
      });
      const staff = await listSectionStaff(owner.id, section.id);
      const ownerRow = staff.find((s) => s.staff.userId === owner.id)!;

      await expect(
        removeSectionStaff(owner.id, section.id, ownerRow.staff.id),
      ).rejects.toBeInstanceOf(CatalogError);
    });
  });

  describe("listCourseAccess: who has access to a course, and to which sections", () => {
    it("refuses an account with no standing on the course", async () => {
      const owner = await makeUser({ isTeacher: true });
      const outsider = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);

      await expect(
        listCourseAccess(outsider.id, course.id),
      ).rejects.toBeInstanceOf(AuthzError);
    });

    it("refuses a section-only assistant, who has no course standing", async () => {
      const owner = await makeUser({ isTeacher: true });
      const ta = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });

      await expect(listCourseAccess(ta.id, course.id)).rejects.toBeInstanceOf(
        AuthzError,
      );
    });

    it("lists the owner once, even though they also hold a course_staff row", async () => {
      const owner = await makeUser({ isTeacher: true });
      // makeCourse writes the owner's course_staff row, exactly as createCourse does.
      const course = await makeCourse(owner.id);

      const { team, isOwner } = await listCourseAccess(owner.id, course.id);
      const ownerRows = team.rows.filter((r) => r.user.id === owner.id);
      expect(ownerRows).toHaveLength(1);
      expect(ownerRows[0]!.scope).toBe("course");
      expect(ownerRows[0]).toMatchObject({ isOwner: true, courseStaffId: null });
      expect(isOwner).toBe(true);
    });

    it("shows course standing and every section grant in one list", async () => {
      const owner = await makeUser({ isTeacher: true });
      const coInstructor = await makeUser();
      const ta = await makeUser();
      const course = await makeCourse(owner.id);
      const alpha = await makeSection(course.id);
      const beta = await makeSection(course.id);
      await db
        .insert(courseStaff)
        .values({ courseId: course.id, userId: coInstructor.id, role: "teacher" });
      await addSectionStaff(alpha.id, ta.id, "ta", {
        reviewResponses: true,
        sendPrivateResponses: true,
      });
      await addSectionStaff(beta.id, ta.id, "ta", { reviewResponses: true });

      const { team } = await listCourseAccess(owner.id, course.id);
      // Course standing first, then one row per section grant — the same person
      // staffing two of two sections is two rows, which is the point.
      expect(team.rows.map((r) => r.scope)).toEqual([
        "course",
        "course",
        "section",
        "section",
      ]);
      const grants = team.rows.filter((r) => r.scope === "section");
      expect(grants.map((r) => r.user.id)).toEqual([ta.id, ta.id]);
      expect(new Set(grants.map((r) => r.section.id))).toEqual(
        new Set([alpha.id, beta.id]),
      );
      const co = team.rows.find((r) => r.user.id === coInstructor.id)!;
      expect(co.scope).toBe("course");
      expect(co).toMatchObject({ isOwner: false });
    });

    it("pages with a stable order and clamps an absurd pageSize", async () => {
      const owner = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      for (const name of ["Ana", "Ben", "Cara", "Dee"]) {
        const person = await makeUser({ displayName: name });
        await addSectionStaff(section.id, person.id, "ta");
      }

      const all = await listCourseAccess(owner.id, course.id);
      expect(all.team.total).toBe(5); // the owner + four assistants

      const first = await listCourseAccess(owner.id, course.id, {
        page: 1,
        pageSize: 2,
      });
      const second = await listCourseAccess(owner.id, course.id, {
        page: 2,
        pageSize: 2,
      });
      expect(first.team.rows).toHaveLength(2);
      expect(first.team.totalPages).toBe(3);
      expect(first.team.hasNext).toBe(true);
      expect(second.team.hasPrevious).toBe(true);
      // No row appears on two pages, and the pages reassemble the whole list in
      // order — so a reader paging through sees each person exactly once.
      const third = await listCourseAccess(owner.id, course.id, {
        page: 3,
        pageSize: 2,
      });
      const paged = [...first.team.rows, ...second.team.rows, ...third.team.rows];
      expect(paged.map((r) => r.user.displayName)).toEqual(
        all.team.rows.map((r) => r.user.displayName),
      );

      // Untrusted params never throw and never lift the ceiling.
      const clamped = await listCourseAccess(owner.id, course.id, {
        page: "nonsense",
        pageSize: "100000",
      });
      expect(clamped.team.page).toBe(1);
      expect(clamped.team.pageSize).toBe(MAX_PAGE_SIZE);
    });

    it("never reaches into another course", async () => {
      const owner = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      const otherOwner = await makeUser({ isTeacher: true });
      const otherCourse = await makeCourse(otherOwner.id);
      const otherSection = await makeSection(otherCourse.id);
      const stranger = await makeUser();
      await addSectionStaff(otherSection.id, stranger.id, "teacher");

      const { team } = await listCourseAccess(owner.id, course.id);
      expect(team.rows.map((r) => r.user.id)).toEqual([owner.id]);
    });

    it("reads an archived course rather than refusing it", async () => {
      const owner = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      await db
        .update(courses)
        .set({ archivedAt: new Date() })
        .where(eq(courses.id, course.id));

      const { team, course: read } = await listCourseAccess(
        owner.id,
        course.id,
      );
      expect(read.archivedAt).not.toBeNull();
      expect(team.total).toBe(1);
    });
  });

  describe("countSectionCourseStanding: a scalar, not a list", () => {
    it("counts the owner and course staff once each, distinctly", async () => {
      const owner = await makeUser({ isTeacher: true });
      const coInstructor = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);

      // Owner alone: their own course_staff row must not count them twice.
      expect(await countSectionCourseStanding(owner.id, section.id)).toBe(1);

      await db
        .insert(courseStaff)
        .values({ courseId: course.id, userId: coInstructor.id, role: "teacher" });
      expect(await countSectionCourseStanding(owner.id, section.id)).toBe(2);
    });

    it("is readable by a section-only assistant, who cannot open the course view", async () => {
      const owner = await makeUser({ isTeacher: true });
      const ta = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });

      expect(await countSectionCourseStanding(ta.id, section.id)).toBe(1);
      await expect(listCourseAccess(ta.id, course.id)).rejects.toBeInstanceOf(
        AuthzError,
      );
    });

    it("refuses an account with no standing on the section", async () => {
      const owner = await makeUser({ isTeacher: true });
      const outsider = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);

      await expect(
        countSectionCourseStanding(outsider.id, section.id),
      ).rejects.toBeInstanceOf(AuthzError);
    });

    it("ignores section staff and another course's staff", async () => {
      const owner = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      // Standing on the section itself, not through the course: not counted.
      const sectionTeacher = await makeUser();
      await addSectionStaff(section.id, sectionTeacher.id, "teacher");
      // Another course's owner and staff: a different course entirely.
      const otherOwner = await makeUser({ isTeacher: true });
      await makeCourse(otherOwner.id);

      expect(await countSectionCourseStanding(owner.id, section.id)).toBe(1);
    });

    it("returns a bare number — no names, emails or ids to leak", async () => {
      const owner = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);

      const count = await countSectionCourseStanding(owner.id, section.id);
      expect(typeof count).toBe("number");
      expect(JSON.stringify(count)).not.toContain(owner.email);
    });
  });

  describe("platform administration", () => {
    it("only a platform admin may grant the teacher role", async () => {
      const teacher = await makeUser({ isTeacher: true });
      const target = await makeUser();
      await expect(
        setTeacherRole(teacher.id, target.email, true),
      ).rejects.toBeInstanceOf(AuthzError);
    });

    it("grants the role and audits it, without granting content access", async () => {
      const admin = await makeUser({ isPlatformAdmin: true });
      const target = await makeUser();
      const otherTeacher = await makeUser({ isTeacher: true });
      const course = await makeCourse(otherTeacher.id);
      const section = await makeSection(course.id);

      await setTeacherRole(admin.id, target.email, true);
      const updated = await db.query.users.findFirst({
        where: eq(users.id, target.id),
      });
      expect(updated!.isTeacher).toBe(true);

      const events = await db.query.auditEvents.findMany({
        where: eq(auditEvents.action, "user.teacher_role_changed"),
      });
      expect(events[0]!.before).toMatchObject({ isTeacher: false });
      expect(events[0]!.after).toMatchObject({ isTeacher: true });

      // Being a teacher grants nothing on somebody else's section, and the
      // admin gains nothing either.
      expect(await getSectionAccess(db, target.id, section.id)).toBeNull();
      expect(await getSectionAccess(db, admin.id, section.id)).toBeNull();
    });

    it("keeps the account list away from non-admins", async () => {
      const teacher = await makeUser({ isTeacher: true });
      await expect(listAccountsForAdmin(teacher.id)).rejects.toBeInstanceOf(
        AuthzError,
      );
    });
  });

  describe("getSectionAccess is a read model, not an authorization decision", () => {
    it("returns null for an unrelated user", async () => {
      const owner = await makeUser({ isTeacher: true });
      const outsider = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      expect(await getSectionAccess(db, outsider.id, section.id)).toBeNull();
    });

    it("reports every capability for the course owner", async () => {
      const owner = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      const access = await getSectionAccess(db, owner.id, section.id);
      expect(access!.staff!.isCourseOwner).toBe(true);
      expect(access!.staff!.permissions.markValidity).toBe(true);
    });

    it("returns null for a deactivated account", async () => {
      const owner = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      await db
        .update(users)
        .set({ active: false })
        .where(eq(users.id, owner.id));
      expect(await getSectionAccess(db, owner.id, section.id)).toBeNull();
    });
  });

  it("does not leak another course's rows into a course listing", async () => {
    const a = await makeUser({ isTeacher: true });
    const b = await makeUser({ isTeacher: true });
    const courseA = await makeCourse(a.id);
    await makeSection(courseA.id);
    const courseB = await makeCourse(b.id);
    await makeSection(courseB.id);

    const all = await db.query.courses.findMany({
      where: eq(courses.ownerUserId, a.id),
    });
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(courseA.id);
  });
});
