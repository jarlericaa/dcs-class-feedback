import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import { addSectionStaff, makeCourse, makeSection, makeUser } from "./fixtures";
import {
  auditEvents,
  classSections,
  courses,
  sectionStaff,
  users,
} from "@/db/schema";
import {
  assignSectionStaff,
  CatalogError,
  createCourse,
  createSection,
  listAccountsForAdmin,
  listSectionStaff,
  removeSectionStaff,
  setTeacherRole,
  updateSection,
} from "@/modules/catalog";
import { AuthzError, getSectionAccess } from "@/modules/authz";

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
