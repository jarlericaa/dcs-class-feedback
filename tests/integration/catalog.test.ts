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
  assignSectionStaffBatch,
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
import {
  AuthzError,
  CourseArchivedError,
  SECTION_PERMISSIONS,
  getSectionAccess,
} from "@/modules/authz";
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

  describe("assignSectionStaffBatch: several people, several sections, one action", () => {
    it("adds every named person to every chosen section, with one batch id", async () => {
      const owner = await makeUser({ isTeacher: true });
      const one = await makeUser();
      const two = await makeUser();
      const course = await makeCourse(owner.id);
      const lab = await makeSection(course.id);
      const lecture = await makeSection(course.id);

      const result = await assignSectionStaffBatch(owner.id, course.id, {
        emails: [one.email, two.email],
        sectionIds: [lab.id, lecture.id],
        role: "ta",
        permissions: { reviewResponses: true },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result).toMatchObject({ added: 4, updated: 0, unchanged: 0 });
      expect(new Set(result.sections.map((s) => s.id))).toEqual(
        new Set([lab.id, lecture.id]),
      );

      const rows = await db.query.sectionStaff.findMany();
      expect(rows).toHaveLength(4);
      for (const person of [one, two]) {
        for (const section of [lab, lecture]) {
          const row = rows.find(
            (r) => r.userId === person.id && r.sectionId === section.id,
          );
          expect(row!.role).toBe("ta");
          expect(row!.reviewResponses).toBe(true);
        }
      }
    });

    /**
     * The whole point of the batch: one typo grants NOBODY anything. A partial
     * apply would leave the owner to work out who got in, and re-pasting the
     * corrected list would re-write the grants that already succeeded.
     */
    it("refuses the whole batch when one address is bad, changing no row", async () => {
      const owner = await makeUser({ isTeacher: true });
      const good = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);

      const result = await assignSectionStaffBatch(owner.id, course.id, {
        emails: [good.email, "typo@up.edu.ph"],
        sectionIds: [section.id],
        role: "ta",
        permissions: { reviewResponses: true },
      });

      expect(result).toEqual({
        ok: false,
        problems: [{ email: "typo@up.edu.ph", reason: "no_account" }],
      });
      expect(await db.query.sectionStaff.findMany()).toHaveLength(0);
      expect(await db.query.auditEvents.findMany()).toHaveLength(0);
      // And it created no account for the typo, exactly as the single-section
      // path refuses to.
      expect(await db.query.users.findMany()).toHaveLength(2);
    });

    it("distinguishes a malformed address, an off-domain one, and a deactivated account", async () => {
      const owner = await makeUser({ isTeacher: true });
      const gone = await makeUser({ active: false });
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);

      const result = await assignSectionStaffBatch(owner.id, course.id, {
        emails: `nonsense, someone@gmail.com, ${gone.email}`,
        sectionIds: [section.id],
        role: "ta",
        permissions: {},
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.problems).toEqual([
        { email: "nonsense", reason: "invalid_format" },
        { email: "someone@gmail.com", reason: "disallowed_domain" },
        { email: gone.email, reason: "inactive_account" },
      ]);
      expect(await db.query.sectionStaff.findMany()).toHaveLength(0);
    });

    it("refuses a section that belongs to another course, before any write", async () => {
      const owner = await makeUser({ isTeacher: true });
      const target = await makeUser();
      const course = await makeCourse(owner.id);
      const mine = await makeSection(course.id);
      const otherOwner = await makeUser({ isTeacher: true });
      const otherCourse = await makeCourse(otherOwner.id);
      const theirs = await makeSection(otherCourse.id);

      const result = await assignSectionStaffBatch(owner.id, course.id, {
        emails: [target.email],
        sectionIds: [mine.id, theirs.id],
        role: "ta",
        permissions: { reviewResponses: true },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.problems).toEqual([
        { email: "", reason: "not_in_course", sectionId: theirs.id },
      ]);
      // Not even the section that WAS in the course was written to.
      expect(await db.query.sectionStaff.findMany()).toHaveLength(0);
    });

    it("refuses an unrecognized role rather than letting a validator error escape", async () => {
      const owner = await makeUser({ isTeacher: true });
      const target = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);

      const result = await assignSectionStaffBatch(owner.id, course.id, {
        emails: [target.email],
        sectionIds: [section.id],
        role: "professor" as unknown as "ta",
        permissions: {},
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.problems).toEqual([
        { email: "", reason: "role_not_allowed_for_scope" },
      ]);
      expect(await db.query.sectionStaff.findMany()).toHaveLength(0);
    });

    it("names the addresses past the cap instead of silently dropping them", async () => {
      const owner = await makeUser({ isTeacher: true });
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      const pasted = Array.from(
        { length: 51 },
        (_, i) => `person-${i}@up.edu.ph`,
      );

      const result = await assignSectionStaffBatch(owner.id, course.id, {
        emails: pasted.join("\n"),
        sectionIds: [section.id],
        role: "ta",
        permissions: {},
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      const tooMany = result.problems.filter((p) => p.reason === "too_many");
      expect(tooMany).toEqual([
        { email: "person-50@up.edu.ph", reason: "too_many" },
      ]);
      expect(await db.query.sectionStaff.findMany()).toHaveLength(0);
    });

    it("is the course owner's call only", async () => {
      const owner = await makeUser({ isTeacher: true });
      const coTeacher = await makeUser({ isTeacher: true });
      const target = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      await addSectionStaff(section.id, coTeacher.id, "co_teacher");
      await db
        .insert(courseStaff)
        .values({ courseId: course.id, userId: coTeacher.id, role: "teacher" });

      await expect(
        assignSectionStaffBatch(coTeacher.id, course.id, {
          emails: [target.email],
          sectionIds: [section.id],
          role: "ta",
          permissions: { reviewResponses: true },
        }),
      ).rejects.toBeInstanceOf(AuthzError);
      expect(await db.query.sectionStaff.findMany()).toHaveLength(1);
    });

    it("refuses an archived course, which is read-only", async () => {
      const owner = await makeUser({ isTeacher: true });
      const target = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      await db
        .update(courses)
        .set({ archivedAt: new Date() })
        .where(eq(courses.id, course.id));

      await expect(
        assignSectionStaffBatch(owner.id, course.id, {
          emails: [target.email],
          sectionIds: [section.id],
          role: "ta",
          permissions: { reviewResponses: true },
        }),
      ).rejects.toBeInstanceOf(CourseArchivedError);
      expect(await db.query.sectionStaff.findMany()).toHaveLength(0);
    });

    it("needs at least one section and at least one address", async () => {
      const owner = await makeUser({ isTeacher: true });
      const target = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);

      await expect(
        assignSectionStaffBatch(owner.id, course.id, {
          emails: [target.email],
          sectionIds: [],
          role: "ta",
          permissions: {},
        }),
      ).rejects.toBeInstanceOf(CatalogError);
      await expect(
        assignSectionStaffBatch(owner.id, course.id, {
          emails: "  ,; \n ",
          sectionIds: [section.id],
          role: "ta",
          permissions: {},
        }),
      ).rejects.toBeInstanceOf(CatalogError);
      expect(await db.query.sectionStaff.findMany()).toHaveLength(0);
    });

    it("writes one row per section for an address repeated in the paste", async () => {
      const owner = await makeUser({ isTeacher: true });
      const target = await makeUser();
      const course = await makeCourse(owner.id);
      const lab = await makeSection(course.id);
      const lecture = await makeSection(course.id);

      const result = await assignSectionStaffBatch(owner.id, course.id, {
        // The same mailbox three times, spelled three ways, plus a repeated
        // section id: one grant per (person, section) all the same.
        emails: `${target.email}, ${target.email.toUpperCase()}\n  ${target.email}  `,
        sectionIds: [lab.id, lecture.id, lab.id],
        role: "ta",
        permissions: { reviewResponses: true },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.added).toBe(2);
      expect(result.sections).toHaveLength(2);
      const rows = await db.query.sectionStaff.findMany();
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((r) => r.sectionId))).toEqual(
        new Set([lab.id, lecture.id]),
      );
    });

    it("stores every capability for a co-teacher, on every chosen section", async () => {
      const owner = await makeUser({ isTeacher: true });
      const co = await makeUser();
      const course = await makeCourse(owner.id);
      const lab = await makeSection(course.id);
      const lecture = await makeSection(course.id);

      await assignSectionStaffBatch(owner.id, course.id, {
        emails: [co.email],
        sectionIds: [lab.id, lecture.id],
        // Nothing ticked: a co-teacher holds everything by role, not by flag.
        role: "co_teacher",
        permissions: {},
      });

      const rows = await db.query.sectionStaff.findMany({
        where: eq(sectionStaff.userId, co.id),
      });
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.role).toBe("co_teacher");
        for (const permission of SECTION_PERMISSIONS) {
          expect(row[permission]).toBe(true);
        }
      }
    });

    it("grants a TA exactly the ticked flags, and cannot be widened by a stray field", async () => {
      const owner = await makeUser({ isTeacher: true });
      const ta = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);

      await assignSectionStaffBatch(owner.id, course.id, {
        emails: [ta.email],
        sectionIds: [section.id],
        role: "ta",
        permissions: {
          reviewResponses: true,
          sendPrivateResponses: true,
          // Deny-by-default: anything that is not exactly `true` grants nothing,
          // and a field outside the catalog is not a permission at all.
          exportParticipation: undefined,
          viewStudentIdentities: "yes" as unknown as boolean,
          manageEverything: true,
        } as never,
      });

      const row = await db.query.sectionStaff.findFirst({
        where: and(
          eq(sectionStaff.sectionId, section.id),
          eq(sectionStaff.userId, ta.id),
        ),
      });
      const granted = SECTION_PERMISSIONS.filter((p) => row![p]);
      expect(granted).toEqual(["reviewResponses", "sendPrivateResponses"]);
    });

    it("audits every write with the shared batch id and the section it touched", async () => {
      const owner = await makeUser({ isTeacher: true });
      const one = await makeUser();
      const two = await makeUser();
      const course = await makeCourse(owner.id);
      const lab = await makeSection(course.id);
      const lecture = await makeSection(course.id);

      const result = await assignSectionStaffBatch(owner.id, course.id, {
        emails: [one.email, two.email],
        sectionIds: [lab.id, lecture.id],
        role: "ta",
        permissions: { reviewResponses: true },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const events = await db.query.auditEvents.findMany({
        where: eq(auditEvents.action, "staff.assigned"),
      });
      expect(events).toHaveLength(4);
      for (const event of events) {
        expect(event.actorUserId).toBe(owner.id);
        expect(event.metadata).toMatchObject({ batchId: result.batchId });
        // The denormalized column too, so the section's audit history finds the
        // row by scope and not only by the staff row's id.
        expect([lab.id, lecture.id]).toContain(event.sectionId);
        expect((event.metadata as { sectionId: string }).sectionId).toBe(
          event.sectionId,
        );
      }
      // One id for the whole action, not one per write.
      expect(
        new Set(
          events.map((e) => (e.metadata as { batchId: string }).batchId),
        ).size,
      ).toBe(1);
      const pairs = events.map(
        (e) =>
          `${(e.after as { targetUserId: string }).targetUserId}:${e.sectionId}`,
      );
      expect(new Set(pairs).size).toBe(4);
    });

    it("tells an added grant from a changed one and from an unchanged one", async () => {
      const owner = await makeUser({ isTeacher: true });
      const ta = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      const request = {
        emails: [ta.email],
        sectionIds: [section.id],
        role: "ta" as const,
        permissions: { reviewResponses: true },
      };

      expect(
        await assignSectionStaffBatch(owner.id, course.id, request),
      ).toMatchObject({ ok: true, added: 1, updated: 0, unchanged: 0 });
      // Re-running the same request changes nothing — and still records that
      // somebody re-affirmed it, exactly as the single-section path does.
      expect(
        await assignSectionStaffBatch(owner.id, course.id, request),
      ).toMatchObject({ ok: true, added: 0, updated: 0, unchanged: 1 });
      expect(
        await assignSectionStaffBatch(owner.id, course.id, {
          ...request,
          permissions: { reviewResponses: true, markValidity: true },
        }),
      ).toMatchObject({ ok: true, added: 0, updated: 1, unchanged: 0 });

      const changes = await db.query.auditEvents.findMany({
        where: eq(auditEvents.action, "staff.permissions_changed"),
      });
      expect(changes).toHaveLength(2);
      expect(changes[1]!.before).toMatchObject({ markValidity: false });
      expect(changes[1]!.after).toMatchObject({ markValidity: true });
      const row = await db.query.sectionStaff.findFirst({
        where: eq(sectionStaff.userId, ta.id),
      });
      expect(row!.markValidity).toBe(true);
    });

    it("re-configures through the same path the single-section form uses", async () => {
      const owner = await makeUser({ isTeacher: true });
      const ta = await makeUser();
      const course = await makeCourse(owner.id);
      const section = await makeSection(course.id);
      await assignSectionStaff(owner.id, section.id, {
        email: ta.email,
        role: "ta",
        permissions: { reviewResponses: true },
      });

      const result = await assignSectionStaffBatch(owner.id, course.id, {
        emails: [ta.email],
        sectionIds: [section.id],
        role: "co_teacher",
        permissions: {},
      });

      expect(result).toMatchObject({ ok: true, added: 0, updated: 1 });
      const rows = await db.query.sectionStaff.findMany({
        where: eq(sectionStaff.userId, ta.id),
      });
      // Re-configured in place: still one grant on the section, not a second row.
      expect(rows).toHaveLength(1);
      expect(rows[0]!.role).toBe("co_teacher");
      expect(rows[0]!.publishPublicAnswers).toBe(true);
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
