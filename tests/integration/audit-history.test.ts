import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  makeCourse,
  makeEnrolledStudent,
  makeSchedule,
  makeSection,
  makeUser,
} from "./fixtures";
import {
  auditEvents,
  classSections,
  formInstances,
  formQuestions,
  publicAnswers,
  sectionStaff,
} from "@/db/schema";
import {
  AUDIT_ACTIONS,
  listSectionAuditActors,
  listSectionAuditEvents,
  STUDENT_ACTORS,
  SYSTEM_ACTOR,
} from "@/modules/audit";
import { AuthzError } from "@/modules/authz";
import {
  auditSentence,
  describeChanges,
  TEACHER_FACING_ACTIONS,
} from "@/lib/audit-story";
import { commitRosterImport, parseRosterCsv } from "@/modules/roster-import";
import {
  assignSectionStaff,
  createCourse,
  createSection,
  removeSectionStaff,
  updateCourse,
} from "@/modules/catalog";
import { createTemplate, createTemplateVersion } from "@/modules/forms/templates";
import {
  generateCyclesForSchedule,
  openDueCycles,
} from "@/modules/forms/cycles";
import { submitResponse } from "@/modules/forms/submission";
import {
  importLegacyEntries,
  makeVisibleToSection,
  setBacklogState,
} from "@/modules/backlog";
import {
  createPrivateResponse,
  setResponseReviewState,
} from "@/modules/review";
import { draftPublicAnswer, publishNow } from "@/modules/publishing";

/**
 * Audit history, filtered and readable (GitHub issue #16).
 *
 * Rows are inserted directly here rather than produced by exercising a
 * workflow, because what is under test is the READ side: which rows a filter
 * admits, in what order, across which page boundary, and what a row is allowed
 * to say. Building them by hand is the only way to pin an exact timestamp and
 * an exact action, which the date and allowlist tests need.
 *
 * What must not regress: the non-TA gate, the section scoping (including the
 * legacy fan-out for rows written before the audit table had a section
 * column), database pagination and ordering, and the rule that no sentence
 * names a student.
 */

const MANILA_OFFSET_HOURS = 8;

/** An instant, given a wall-clock time in the section's timezone. */
function manila(day: string, hour = 12, minute = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(
    Date.UTC(y!, m! - 1, d!, hour - MANILA_OFFSET_HOURS, minute, 0),
  );
}

async function setup() {
  const teacher = await makeUser({ isTeacher: true, displayName: "Owner One" });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  await addSectionStaff(section.id, teacher.id, "teacher");
  return { teacher, course, section };
}

interface RowSpec {
  action: string;
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string | null;
  createdAt?: Date;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  /** omit the denormalized column, forcing the legacy entity-id fan-out */
  withoutSectionColumn?: boolean;
  /** record only `course_id`, as the ten course-level writers do */
  courseOnly?: boolean;
  courseId?: string;
}

/** The course a section belongs to, for the course-only rows. */
async function courseOf(sectionId: string): Promise<string> {
  const row = await db.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
    columns: { courseId: true },
  });
  return row!.courseId;
}

async function writeRows(sectionId: string, specs: RowSpec[]) {
  for (const spec of specs) {
    const [row] = await db
      .insert(auditEvents)
      .values({
        action: spec.action,
        actorUserId: spec.actorUserId ?? null,
        entityType: spec.entityType ?? "class_section",
        entityId: spec.entityId === undefined ? sectionId : spec.entityId,
        before: spec.before ?? null,
        after: spec.after ?? null,
        metadata: spec.metadata ?? null,
        sectionId:
          spec.withoutSectionColumn || spec.courseOnly ? null : sectionId,
        courseId: spec.courseOnly
          ? (spec.courseId ?? await courseOf(sectionId))
          : null,
      })
      .returning();
    if (spec.createdAt) {
      // `created_at` defaults to now(), so an explicit instant is set after
      // the insert rather than fought with in it.
      await db
        .update(auditEvents)
        .set({ createdAt: spec.createdAt })
        .where(eq(auditEvents.id, row!.id));
    }
  }
}

describe("audit history: what a teacher is shown by default", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("withholds the platform's own records, and shows them on request", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      { action: "validity.invalidated", actorUserId: teacher.id },
      { action: "roster.imported", actorUserId: teacher.id },
      // The platform talking to itself: high volume, no decision in it.
      { action: "cycle.generated", actorUserId: null },
      { action: "email.sent", actorUserId: null },
      { action: "response.locked", actorUserId: null },
      { action: "response.marked_read", actorUserId: teacher.id },
      { action: "source_link.created", actorUserId: teacher.id },
    ]);

    const teacherView = await listSectionAuditEvents(teacher.id, section.id);
    expect(teacherView.total).toBe(2);
    expect(teacherView.rows.map((r) => r.event.action).sort()).toEqual([
      "roster.imported",
      "validity.invalidated",
    ]);

    // Withheld is not deleted: one explicit choice shows everything.
    const everything = await listSectionAuditEvents(teacher.id, section.id, {
      scope: "all",
    });
    expect(everything.total).toBe(7);
    expect(everything.rows.map((r) => r.event.action)).toContain("email.sent");
  });

  /**
   * A filter narrows; it never widens. Asking for a withheld action inside the
   * default scope must answer with nothing rather than quietly dropping the
   * filter and returning the whole list.
   */
  it("refuses a withheld action rather than ignoring the filter", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      { action: "validity.invalidated", actorUserId: teacher.id },
      { action: "email.sent", actorUserId: null },
    ]);

    const refused = await listSectionAuditEvents(teacher.id, section.id, {
      action: "email.sent",
    });
    expect(refused.total).toBe(0);
    expect(refused.rows).toEqual([]);

    // The same request in the wider scope is honoured.
    const allowed = await listSectionAuditEvents(teacher.id, section.id, {
      action: "email.sent",
      scope: "all",
    });
    expect(allowed.total).toBe(1);
  });

  it("filters by one action, counting only that action", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      { action: "validity.invalidated", actorUserId: teacher.id },
      { action: "validity.invalidated", actorUserId: teacher.id },
      { action: "validity.restored", actorUserId: teacher.id },
      { action: "roster.imported", actorUserId: teacher.id },
    ]);

    const page = await listSectionAuditEvents(teacher.id, section.id, {
      action: "validity.invalidated",
    });
    // The COUNT comes from the same predicate as the rows, so a filtered pager
    // cannot advertise a page it has nothing to fill with.
    expect(page.total).toBe(2);
    expect(page.totalPages).toBe(1);
    expect(page.rows).toHaveLength(2);
  });

  it("filters by actor, including the system as an explicit choice", async () => {
    const { teacher, section } = await setup();
    const colleague = await makeUser({ displayName: "Ana Cruz" });
    await addSectionStaff(section.id, colleague.id, "co_teacher");
    await writeRows(section.id, [
      { action: "validity.invalidated", actorUserId: teacher.id },
      { action: "validity.restored", actorUserId: colleague.id },
      { action: "public_answer.published", actorUserId: null },
    ]);

    const mine = await listSectionAuditEvents(teacher.id, section.id, {
      actor: teacher.id,
    });
    expect(mine.total).toBe(1);
    expect(mine.rows[0]!.event.actorUserId).toBe(teacher.id);

    const theirs = await listSectionAuditEvents(teacher.id, section.id, {
      actor: colleague.id,
    });
    expect(theirs.rows.map((r) => r.actor?.displayName)).toEqual(["Ana Cruz"]);

    // A null actor cannot be a form value, so `system` is the word for it.
    const system = await listSectionAuditEvents(teacher.id, section.id, {
      actor: SYSTEM_ACTOR,
    });
    expect(system.total).toBe(1);
    expect(system.rows[0]!.actor).toBeNull();
  });

  it("offers every actor in the section's history, not just the visible page", async () => {
    const { teacher, section } = await setup();
    const colleague = await makeUser({ displayName: "Ana Cruz" });
    await addSectionStaff(section.id, colleague.id, "co_teacher");
    await writeRows(section.id, [
      { action: "validity.invalidated", actorUserId: teacher.id },
      { action: "validity.restored", actorUserId: colleague.id },
      { action: "roster.imported", actorUserId: null },
    ]);

    const actors = await listSectionAuditActors(teacher.id, section.id);
    expect(actors.map((a) => a.name)).toEqual([
      "Ana Cruz",
      "Owner One",
      "The system",
    ]);
    expect(actors.find((a) => a.name === "The system")!.id).toBe(SYSTEM_ACTOR);
  });

  /**
   * The bug this test exists for: the actor selector listed whoever wrote a
   * row, and a submission is written by the student it is about — so student
   * names appeared in a `<select>`, contradicting the invariant the sentences
   * were built to hold.
   */
  it("never offers a student as an actor option", async () => {
    const { teacher, section } = await setup();
    const colleague = await makeUser({ displayName: "Ana Cruz" });
    await addSectionStaff(section.id, colleague.id, "co_teacher");
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    await writeRows(section.id, [
      { action: "validity.invalidated", actorUserId: teacher.id },
      { action: "public_answer.drafted", actorUserId: colleague.id },
      // Every action a student performs.
      {
        action: "response.submitted",
        actorUserId: student.id,
        entityType: "form_response",
      },
      {
        action: "response.edited",
        actorUserId: student.id,
        entityType: "form_response",
      },
      {
        action: "response.item_withdrawn",
        actorUserId: student.id,
        entityType: "student_submission_item",
      },
      {
        action: "private_response.student_follow_up",
        actorUserId: student.id,
        entityType: "private_response",
      },
    ]);

    const options = await listSectionAuditActors(teacher.id, section.id);
    const dump = JSON.stringify(options);
    expect(dump).not.toContain("Juan");
    expect(dump).not.toContain(student.id);
    // Staff are still offered, plus students as a GROUP so the dimension stays
    // usable without anybody being named.
    expect(options.map((o) => o.name)).toEqual([
      "Ana Cruz",
      "Owner One",
      "Students",
    ]);
    expect(options.find((o) => o.name === "Students")!.id).toBe(STUDENT_ACTORS);
  });

  it("offers no student group when students have done nothing here", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      { action: "validity.invalidated", actorUserId: teacher.id },
    ]);
    const options = await listSectionAuditActors(teacher.id, section.id);
    // A control that filters to nothing is worse than no control.
    expect(options.map((o) => o.id)).toEqual([teacher.id]);
  });

  it("still offers a teacher who is also enrolled, on their staff rows", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      // The same account both submits and decides. The staff row is what earns
      // the option; the submission must not remove it, and must not add a name.
      {
        action: "response.submitted",
        actorUserId: teacher.id,
        entityType: "form_response",
      },
      { action: "validity.restored", actorUserId: teacher.id },
    ]);
    const options = await listSectionAuditActors(teacher.id, section.id);
    expect(options.map((o) => o.name)).toEqual(["Owner One", "Students"]);
  });

  it("aligns the actor options with the scope being read", async () => {
    const { teacher, section } = await setup();
    const opsOnly = await makeUser({ displayName: "Ops Person" });
    await writeRows(section.id, [
      { action: "validity.invalidated", actorUserId: teacher.id },
      // Their only row is a withheld system record, so under the default scope
      // choosing them would return an empty page.
      { action: "student_number.revealed", actorUserId: opsOnly.id },
    ]);

    const teacherScope = await listSectionAuditActors(teacher.id, section.id);
    expect(teacherScope.map((o) => o.id)).toEqual([teacher.id]);

    const everything = await listSectionAuditActors(teacher.id, section.id, {
      scope: "all",
    });
    expect(everything.map((o) => o.name)).toEqual(["Ops Person", "Owner One"]);
  });

  /**
   * The page-facing read model, not just the control: a student's name and id
   * must not be in the payload at all, so no surface over it can print one.
   */
  it("masks the student actor in the rows it hands the page", async () => {
    const { teacher, section } = await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    await writeRows(section.id, [
      {
        action: "response.submitted",
        actorUserId: student.id,
        entityType: "form_response",
      },
      { action: "validity.invalidated", actorUserId: teacher.id },
    ]);

    const page = await listSectionAuditEvents(teacher.id, section.id);
    const dump = JSON.stringify(page.rows);
    expect(dump).not.toContain("Juan");
    expect(dump).not.toContain(student.id);

    const submission = page.rows.find(
      (r) => r.event.action === "response.submitted",
    )!;
    expect(submission.actor).toBeNull();
    // Masked in the DATA, not merely unprinted by the page.
    expect(submission.event.actorUserId).toBeNull();

    // A staff row is untouched: this is masking, not blanket anonymity.
    const decision = page.rows.find(
      (r) => r.event.action === "validity.invalidated",
    )!;
    expect(decision.actor?.displayName).toBe("Owner One");
    expect(decision.event.actorUserId).toBe(teacher.id);
  });

  it("filters to students as a group without naming one", async () => {
    const { teacher, section } = await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    await writeRows(section.id, [
      {
        action: "response.submitted",
        actorUserId: student.id,
        entityType: "form_response",
      },
      { action: "validity.invalidated", actorUserId: teacher.id },
    ]);

    const page = await listSectionAuditEvents(teacher.id, section.id, {
      actor: STUDENT_ACTORS,
    });
    expect(page.total).toBe(1);
    expect(page.rows[0]!.event.action).toBe("response.submitted");
    expect(JSON.stringify(page.rows)).not.toContain("Juan");
  });

  /**
   * A hand-edited `?actor=<a student's id>` must not become the per-student
   * activity view this page does not offer.
   */
  it("refuses to build a per-student view from a guessed actor id", async () => {
    const { teacher, section } = await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    await writeRows(section.id, [
      {
        action: "response.submitted",
        actorUserId: student.id,
        entityType: "form_response",
      },
      {
        action: "response.edited",
        actorUserId: student.id,
        entityType: "form_response",
      },
    ]);

    const forged = await listSectionAuditEvents(teacher.id, section.id, {
      actor: student.id,
    });
    expect(forged.total).toBe(0);
    expect(forged.rows).toEqual([]);
  });

  it("refuses a malformed actor filter without reaching the UUID query", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [{ action: "roster.imported", actorUserId: teacher.id }]);

    const result = await listSectionAuditEvents(teacher.id, section.id, {
      actor: "not-a-uuid",
    });
    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it("does not offer an actor from another section's history", async () => {
    const mine = await setup();
    const theirs = await setup();
    await writeRows(theirs.section.id, [
      { action: "validity.invalidated", actorUserId: theirs.teacher.id },
    ]);
    await writeRows(mine.section.id, [
      { action: "roster.imported", actorUserId: mine.teacher.id },
    ]);

    const actors = await listSectionAuditActors(mine.teacher.id, mine.section.id);
    expect(actors.map((a) => a.id)).toEqual([mine.teacher.id]);
  });
});

describe("audit history: dates are the section's calendar days", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  /**
   * The section is on Asia/Manila (UTC+8), so an instant late on the 5th UTC is
   * already the 6th locally. A UTC comparison gets this boundary wrong by up to
   * a day, which is the difference between "nothing happened that day" and the
   * row a teacher was looking for.
   */
  it("puts a row in the local day, not the UTC one", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      // 2026-09-05 23:30 Manila = 15:30Z on the 5th.
      {
        action: "validity.invalidated",
        actorUserId: teacher.id,
        createdAt: manila("2026-09-05", 23, 30),
      },
      // 2026-09-06 00:30 Manila = 16:30Z on the 5th — still the 5th in UTC.
      {
        action: "validity.restored",
        actorUserId: teacher.id,
        createdAt: manila("2026-09-06", 0, 30),
      },
    ]);

    const fifth = await listSectionAuditEvents(teacher.id, section.id, {
      from: "2026-09-05",
      to: "2026-09-05",
    });
    expect(fifth.rows.map((r) => r.event.action)).toEqual([
      "validity.invalidated",
    ]);

    const sixth = await listSectionAuditEvents(teacher.id, section.id, {
      from: "2026-09-06",
      to: "2026-09-06",
    });
    expect(sixth.rows.map((r) => r.event.action)).toEqual([
      "validity.restored",
    ]);
  });

  it("treats both ends as inclusive, so one day is one day", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      {
        action: "roster.imported",
        actorUserId: teacher.id,
        createdAt: manila("2026-09-04", 0, 0),
      },
      {
        action: "validity.invalidated",
        actorUserId: teacher.id,
        createdAt: manila("2026-09-05", 12, 0),
      },
      {
        action: "validity.restored",
        actorUserId: teacher.id,
        createdAt: manila("2026-09-06", 23, 59),
      },
      {
        action: "staff.assigned",
        actorUserId: teacher.id,
        createdAt: manila("2026-09-07", 0, 1),
      },
    ]);

    // Midnight of the 4th and the last minute of the 6th are both inside.
    const range = await listSectionAuditEvents(teacher.id, section.id, {
      from: "2026-09-04",
      to: "2026-09-06",
    });
    expect(range.total).toBe(3);
    expect(range.rows.map((r) => r.event.action)).not.toContain(
      "staff.assigned",
    );

    // A single day where "from" equals "to" is that whole day, not an empty
    // range — the bug an exclusive upper bound would produce.
    const oneDay = await listSectionAuditEvents(teacher.id, section.id, {
      from: "2026-09-05",
      to: "2026-09-05",
    });
    expect(oneDay.total).toBe(1);
  });

  it("applies one open-ended bound on its own", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      {
        action: "roster.imported",
        actorUserId: teacher.id,
        createdAt: manila("2026-09-01"),
      },
      {
        action: "validity.invalidated",
        actorUserId: teacher.id,
        createdAt: manila("2026-09-10"),
      },
    ]);

    expect(
      (await listSectionAuditEvents(teacher.id, section.id, { from: "2026-09-05" }))
        .total,
    ).toBe(1);
    expect(
      (await listSectionAuditEvents(teacher.id, section.id, { to: "2026-09-05" }))
        .total,
    ).toBe(1);
  });

  it("ignores a malformed date rather than erroring or emptying the list", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      { action: "roster.imported", actorUserId: teacher.id },
    ]);
    for (const bad of [
      "nonsense",
      "2026-13",
      "2026-02-31",
      "05-09-2026",
      "",
    ]) {
      const page = await listSectionAuditEvents(teacher.id, section.id, {
        from: bad,
        to: bad,
      });
      // A bad `?from=` in a URL shows the unfiltered list, not an error page.
      expect(page.total, bad).toBe(1);
    }
  });
});

describe("audit history: paging, ordering and scope", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("orders newest first and pages in the database", async () => {
    const { teacher, section } = await setup();
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];
    await writeRows(
      section.id,
      days.map((day) => ({
        action: "validity.invalidated",
        actorUserId: teacher.id,
        createdAt: manila(day),
        metadata: { day },
      })),
    );

    const all = await listSectionAuditEvents(teacher.id, section.id);
    expect(all.total).toBe(5);
    expect(
      all.rows.map((r) => (r.event.metadata as { day: string }).day),
    ).toEqual([...days].reverse());

    const seen: string[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const slice = await listSectionAuditEvents(teacher.id, section.id, {
        page,
        pageSize: 1,
      });
      expect(slice.total, `page ${page}`).toBe(5);
      expect(slice.totalPages, `page ${page}`).toBe(5);
      expect(slice.rows, `page ${page}`).toHaveLength(1);
      seen.push((slice.rows[0]!.event.metadata as { day: string }).day);
    }
    // Every row once, in the same order, with none repeated across a boundary.
    expect(seen).toEqual([...days].reverse());

    const past = await listSectionAuditEvents(teacher.id, section.id, {
      page: 6,
      pageSize: 1,
    });
    expect(past.rows).toEqual([]);
    expect(past.hasNext).toBe(false);
  });

  it("pages a filtered list consistently with its own count", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      ...Array.from({ length: 3 }, () => ({
        action: "validity.invalidated",
        actorUserId: teacher.id,
      })),
      ...Array.from({ length: 4 }, () => ({
        action: "roster.imported",
        actorUserId: teacher.id,
      })),
    ]);

    const filtered = await listSectionAuditEvents(teacher.id, section.id, {
      action: "validity.invalidated",
      page: 2,
      pageSize: 2,
    });
    expect(filtered.total).toBe(3);
    expect(filtered.totalPages).toBe(2);
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.hasNext).toBe(false);
  });

  it("keeps rows written before the audit table had a section column", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      // The legacy shape: no denormalized column, found only by fanning out
      // from the section to the ids it owns.
      {
        action: "section.updated",
        actorUserId: teacher.id,
        entityId: section.id,
        withoutSectionColumn: true,
      },
    ]);

    const page = await listSectionAuditEvents(teacher.id, section.id);
    expect(page.total).toBe(1);
    expect(page.rows[0]!.event.sectionId).toBeNull();
  });

  it("never reaches another section, filtered or not", async () => {
    const mine = await setup();
    const theirs = await setup();
    await writeRows(theirs.section.id, [
      { action: "validity.invalidated", actorUserId: theirs.teacher.id },
    ]);
    await writeRows(mine.section.id, [
      { action: "validity.invalidated", actorUserId: mine.teacher.id },
    ]);

    for (const opts of [
      {},
      { scope: "all" as const },
      { action: "validity.invalidated" },
      { from: "2020-01-01", to: "2030-01-01" },
    ]) {
      const page = await listSectionAuditEvents(
        mine.teacher.id,
        mine.section.id,
        opts,
      );
      expect(page.total, JSON.stringify(opts)).toBe(1);
      expect(page.rows[0]!.event.actorUserId).toBe(mine.teacher.id);
    }
  });

  it("stays non-delegable and refuses an unrelated reader", async () => {
    const { section } = await setup();
    const ta = await makeUser({});
    await addSectionStaff(section.id, ta.id, "ta", {
      reviewResponses: true,
      viewStudentIdentities: true,
      exportParticipation: true,
    });
    const outsider = await makeUser({ isTeacher: true });

    for (const userId of [ta.id, outsider.id]) {
      await expect(
        listSectionAuditEvents(userId, section.id),
      ).rejects.toBeInstanceOf(AuthzError);
      await expect(
        listSectionAuditActors(userId, section.id),
      ).rejects.toBeInstanceOf(AuthzError);
    }
  });

  it("still reads an archived course", async () => {
    const { teacher, section, course } = await setup();
    await writeRows(section.id, [
      { action: "roster.imported", actorUserId: teacher.id },
    ]);
    const { courses } = await import("@/db/schema");
    await db
      .update(courses)
      .set({ archivedAt: new Date() })
      .where(eq(courses.id, course.id));

    // Reading a closed term's record is a read; the services refuse writes.
    const page = await listSectionAuditEvents(teacher.id, section.id);
    expect(page.total).toBe(1);
  });
});

describe("audit history: what a row is allowed to say", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  /**
   * The subject of a sentence is resolved only for course-shaped entities. A
   * public question is staff-authored and already visible to that whole class,
   * so naming it is what turns a code into "published an answer to …".
   */
  it("names a public question as the object of a publication", async () => {
    const { teacher, section } = await setup();
    const [answer] = await db
      .insert(publicAnswers)
      .values({
        sectionId: section.id,
        publicQuestionText: "When will the practice set be available?",
        answerBody: "Friday.",
        state: "published",
        publishedAt: new Date(),
        createdByUserId: teacher.id,
      })
      .returning();
    await writeRows(section.id, [
      {
        action: "public_answer.published",
        actorUserId: teacher.id,
        entityType: "public_answer",
        entityId: answer!.id,
      },
    ]);

    const page = await listSectionAuditEvents(teacher.id, section.id);
    const row = page.rows[0]!;
    expect(row.subject).toBe("When will the practice set be available?");
    expect(
      auditSentence({
        action: row.event.action,
        entityType: row.event.entityType,
        actorName: row.actor?.displayName ?? null,
        subject: row.subject,
      }),
    ).toBe(
      "Owner One published an answer to “When will the practice set be available?”.",
    );
  });

  it("flattens a subject that was authored as rich text", async () => {
    const { teacher, section } = await setup();
    const [answer] = await db
      .insert(publicAnswers)
      .values({
        sectionId: section.id,
        // Staff may author `$...$` and Markdown; a `<select>`-free sentence is
        // still plain text, so the label arrives flattened rather than as
        // markup this page would have to render.
        publicQuestionText: "Is `O(n log n)` clear? See $\\sum_{i=1}^{n} i$",
        state: "published",
        publishedAt: new Date(),
        createdByUserId: teacher.id,
      })
      .returning();
    await writeRows(section.id, [
      {
        action: "public_answer.published",
        actorUserId: teacher.id,
        entityType: "public_answer",
        entityId: answer!.id,
      },
    ]);

    const page = await listSectionAuditEvents(teacher.id, section.id);
    const subject = page.rows[0]!.subject!;
    expect(subject).toContain("O(n log n)");
    // No backticks, no dollar-delimited source: nothing for a renderer to do.
    expect(subject).not.toContain("`");
    expect(subject).not.toContain("$");
  });

  it("names a class list, a course and an occurrence", async () => {
    const { teacher, section, course } = await setup();
    await db
      .update(classSections)
      .set({ title: "CS 33 Section A" })
      .where(eq(classSections.id, section.id));
    await writeRows(section.id, [
      {
        action: "section.updated",
        actorUserId: teacher.id,
        entityType: "class_section",
        entityId: section.id,
      },
      {
        action: "course.updated",
        actorUserId: teacher.id,
        entityType: "course",
        entityId: course.id,
      },
    ]);

    const page = await listSectionAuditEvents(teacher.id, section.id);
    const byAction = new Map(page.rows.map((r) => [r.event.action, r.subject]));
    expect(byAction.get("section.updated")).toBe("CS 33 Section A");
    expect(byAction.get("course.updated")).toBe(course.code);
  });

  /**
   * The subject map used to be keyed by entity id ALONE.
   *
   * Two rows can name the same id under different entity types — a stale row, a
   * hand-written one, a fixture, or one day a real collision — and the
   * student-shaped row then inherited the label resolved for the course-shaped
   * one. That is precisely the leak the type allowlist exists to prevent, so
   * the key carries the type that earned the lookup.
   */
  it("does not let a student-shaped row inherit a course entity's label", async () => {
    const { teacher, section } = await setup();
    await db
      .update(classSections)
      .set({ title: "CS 33 Section A" })
      .where(eq(classSections.id, section.id));
    await writeRows(section.id, [
      // The safe row: a class list, which resolves to its title.
      {
        action: "section.updated",
        actorUserId: teacher.id,
        entityType: "class_section",
        entityId: section.id,
      },
      // The same id under a student-shaped type, in the same page.
      {
        action: "validity.invalidated",
        actorUserId: teacher.id,
        entityType: "form_response",
        entityId: section.id,
      },
      {
        action: "roster.row_added",
        actorUserId: teacher.id,
        entityType: "student_record",
        entityId: section.id,
      },
    ]);

    const page = await listSectionAuditEvents(teacher.id, section.id);
    const byAction = new Map(page.rows.map((r) => [r.event.action, r.subject]));
    expect(byAction.get("section.updated")).toBe("CS 33 Section A");
    // Neither student-shaped row picked up the class list's name.
    expect(byAction.get("validity.invalidated")).toBeNull();
    expect(byAction.get("roster.row_added")).toBeNull();
  });

  /**
   * The lookups are constrained to this section's own course as well as to the
   * ids, so an id that reached the log by some other route resolves to nothing
   * rather than to another course's label.
   */
  it("resolves nothing for an id belonging to another course", async () => {
    const mine = await setup();
    const theirs = await setup();
    await db
      .update(classSections)
      .set({ title: "Other Course Section" })
      .where(eq(classSections.id, theirs.section.id));
    await writeRows(mine.section.id, [
      // A row filed under THIS section but naming another course's class list.
      {
        action: "section.updated",
        actorUserId: mine.teacher.id,
        entityType: "class_section",
        entityId: theirs.section.id,
      },
      {
        action: "course.updated",
        actorUserId: mine.teacher.id,
        entityType: "course",
        entityId: theirs.course.id,
      },
    ]);

    const page = await listSectionAuditEvents(mine.teacher.id, mine.section.id);
    expect(page.rows.every((r) => r.subject === null)).toBe(true);
    expect(JSON.stringify(page.rows)).not.toContain("Other Course Section");
    expect(JSON.stringify(page.rows)).not.toContain(theirs.course.code);
  });

  it("resolves nothing for a public answer belonging to another section", async () => {
    const mine = await setup();
    const theirs = await setup();
    const [alien] = await db
      .insert(publicAnswers)
      .values({
        sectionId: theirs.section.id,
        publicQuestionText: "A question from another class",
        state: "published",
        publishedAt: new Date(),
        createdByUserId: theirs.teacher.id,
      })
      .returning();
    await writeRows(mine.section.id, [
      {
        action: "public_answer.published",
        actorUserId: mine.teacher.id,
        entityType: "public_answer",
        entityId: alien!.id,
      },
    ]);

    const page = await listSectionAuditEvents(mine.teacher.id, mine.section.id);
    expect(page.rows[0]!.subject).toBeNull();
    expect(JSON.stringify(page.rows)).not.toContain("another class");
  });

  /**
   * The privacy rule of the feature. A submission, a student's question and a
   * student record all belong to one identifiable person, and no lookup exists
   * for them — so the read model cannot hand the page a name to print.
   */
  it("resolves NO subject for anything belonging to one student", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      {
        action: "validity.invalidated",
        actorUserId: teacher.id,
        entityType: "form_response",
        entityId: section.id, // a real uuid; the type is what decides
      },
      {
        action: "private_response.created",
        actorUserId: teacher.id,
        entityType: "private_response",
        entityId: section.id,
      },
      {
        action: "roster.row_added",
        actorUserId: teacher.id,
        entityType: "student_record",
        entityId: section.id,
      },
      {
        action: "item.type_category_corrected",
        actorUserId: teacher.id,
        entityType: "student_submission_item",
        entityId: section.id,
      },
    ]);

    const page = await listSectionAuditEvents(teacher.id, section.id, {
      scope: "all",
    });
    expect(page.total).toBe(4);
    expect(page.rows.every((r) => r.subject === null)).toBe(true);
    // And every sentence reads about a THING.
    for (const row of page.rows) {
      const sentence = auditSentence({
        action: row.event.action,
        entityType: row.event.entityType,
        actorName: row.actor?.displayName ?? null,
        subject: row.subject,
      });
      expect(sentence.startsWith("Owner One "), sentence).toBe(true);
      expect(sentence, sentence).not.toMatch(/Juan|Dela Cruz|@up\.edu\.ph/);
    }
  });

  /**
   * The other half of the same rule: the ACTOR of a submission is the student,
   * so an entry about one must not open with their name.
   */
  it("does not name the student who submitted", async () => {
    const { teacher, section } = await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    await writeRows(section.id, [
      {
        action: "response.submitted",
        actorUserId: student.id,
        entityType: "form_response",
        entityId: section.id,
      },
    ]);

    const page = await listSectionAuditEvents(teacher.id, section.id);
    const row = page.rows[0]!;
    /**
     * The name is not merely unprinted — it is not in the payload. This test
     * used to assert the opposite ("the row still carries who acted"), which
     * was the leak an independent review found: the actor selector was built
     * from the same distinct set and put student names in a `<select>`.
     *
     * Accountability is not lost. The audit ROW is untouched and append-only;
     * what is withheld is this read model's projection of it, and which student
     * a submission belongs to is answered where it belongs — beside the
     * submission, in the review inbox.
     */
    expect(row.actor).toBeNull();
    expect(row.event.actorUserId).toBeNull();
    const sentence = auditSentence({
      action: row.event.action,
      entityType: row.event.entityType,
      actorName: row.actor?.displayName ?? null,
      subject: row.subject,
    });
    expect(sentence).toBe("A student submitted a form.");
  });

  it("hands the page the payload it needs for a named-field diff", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      {
        action: "staff.permissions_changed",
        actorUserId: teacher.id,
        entityType: "section_staff",
        before: { role: "teacher", markValidity: true },
        after: { role: "ta", markValidity: false },
      },
    ]);

    const page = await listSectionAuditEvents(teacher.id, section.id);
    const row = page.rows[0]!;
    // The read model passes the payload through unchanged; turning it into
    // named fields is the page's pure step, tested in tests/unit.
    expect(row.event.before).toEqual({ role: "teacher", markValidity: true });
    expect(row.event.after).toEqual({ role: "ta", markValidity: false });
  });
});

describe("audit history: the owning course's own records", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  /**
   * Ten writers record only `course_id`, because a section's forms, templates,
   * schedules and bonus periods all live at the course level. Without the
   * course clause a section's history silently omitted every one of them, so
   * "why did this form change?" had no answer on this page.
   */
  it("shows a course-level row to a section of that course", async () => {
    const { teacher, section, course } = await setup();
    await writeRows(section.id, [
      {
        action: "template.created",
        actorUserId: teacher.id,
        entityType: "form_template",
        // A template id is not in the section fan-out, so before the course
        // clause this row was unreachable from here.
        entityId: course.id,
        courseOnly: true,
      },
      {
        action: "course.updated",
        actorUserId: teacher.id,
        entityType: "course",
        entityId: course.id,
        courseOnly: true,
      },
      {
        action: "staff.course_assigned",
        actorUserId: teacher.id,
        entityType: "course_staff",
        entityId: null,
        courseOnly: true,
      },
    ]);

    const page = await listSectionAuditEvents(teacher.id, section.id);
    expect(page.total).toBe(3);
    expect(page.rows.map((r) => r.event.action).sort()).toEqual([
      "course.updated",
      "staff.course_assigned",
      "template.created",
    ]);
    // The count and the rows come from the same predicate, so paging over the
    // widened scope stays consistent.
    expect(page.totalPages).toBe(1);
  });

  it("does not show another course's course-level rows", async () => {
    const mine = await setup();
    const theirs = await setup();
    await writeRows(theirs.section.id, [
      {
        action: "course.updated",
        actorUserId: theirs.teacher.id,
        entityType: "course",
        entityId: theirs.course.id,
        courseOnly: true,
        courseId: theirs.course.id,
      },
    ]);
    await writeRows(mine.section.id, [
      {
        action: "template.created",
        actorUserId: mine.teacher.id,
        entityType: "form_template",
        entityId: mine.course.id,
        courseOnly: true,
      },
    ]);

    const page = await listSectionAuditEvents(mine.teacher.id, mine.section.id);
    expect(page.total).toBe(1);
    expect(page.rows[0]!.event.action).toBe("template.created");
  });

  /**
   * The safety on the two lower cases. A row that explicitly says "section B"
   * must not reach section A — not by sharing a course, and not by naming an
   * entity id that happens to be in A's fan-out set. Scoping rests on what the
   * row says, never on uuid uniqueness.
   */
  it("excludes a row scoped to a sibling section, even with a colliding entity id", async () => {
    const teacher = await makeUser({ isTeacher: true, displayName: "Owner One" });
    const course = await makeCourse(teacher.id);
    const alpha = await makeSection(course.id);
    const beta = await makeSection(course.id);
    await addSectionStaff(alpha.id, teacher.id, "teacher");
    await addSectionStaff(beta.id, teacher.id, "teacher");

    // Filed against BETA, but naming an entity id that is in ALPHA's own
    // fan-out set (alpha's own section id) and carrying the shared course.
    await db.insert(auditEvents).values({
      action: "roster.row_deactivated",
      actorUserId: teacher.id,
      entityType: "enrollment",
      entityId: alpha.id,
      sectionId: beta.id,
      courseId: course.id,
    });
    await db.insert(auditEvents).values({
      action: "validity.invalidated",
      actorUserId: teacher.id,
      entityType: "form_response",
      entityId: alpha.id,
      sectionId: alpha.id,
    });

    const inAlpha = await listSectionAuditEvents(teacher.id, alpha.id);
    expect(inAlpha.total).toBe(1);
    expect(inAlpha.rows[0]!.event.action).toBe("validity.invalidated");

    const inBeta = await listSectionAuditEvents(teacher.id, beta.id);
    expect(inBeta.total).toBe(1);
    expect(inBeta.rows[0]!.event.action).toBe("roster.row_deactivated");
  });

  it("still finds a legacy row that recorded no scope at all", async () => {
    const { teacher, section } = await setup();
    // Written before the audit table had either column: reached only by the
    // entity-id fan-out, which the course clause must not have displaced.
    await db.insert(auditEvents).values({
      action: "section.updated",
      actorUserId: teacher.id,
      entityType: "class_section",
      entityId: section.id,
      sectionId: null,
      courseId: null,
    });

    const page = await listSectionAuditEvents(teacher.id, section.id);
    expect(page.total).toBe(1);
    expect(page.rows[0]!.event.sectionId).toBeNull();
    expect(page.rows[0]!.event.courseId).toBeNull();
  });

  it("offers a course-level actor in the actor filter", async () => {
    const { teacher, section, course } = await setup();
    const courseAdmin = await makeUser({ displayName: "Course Admin" });
    await writeRows(section.id, [
      {
        action: "course.updated",
        actorUserId: courseAdmin.id,
        entityType: "course",
        entityId: course.id,
        courseOnly: true,
      },
      { action: "validity.invalidated", actorUserId: teacher.id },
    ]);

    // The selector shares the scope predicate, so widening the list widens the
    // control with it rather than leaving it behind.
    const actors = await listSectionAuditActors(teacher.id, section.id);
    expect(actors.map((a) => a.name)).toEqual(["Course Admin", "Owner One"]);
  });
});

describe("audit history: the scope switch cannot be widened by accident", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  /**
   * `(opts.scope ?? "teacher") === "teacher"` fell through for any value that
   * was neither undefined nor "teacher" — so `"ALL"`, `"everything"` or a typo
   * silently dropped the allowlist clause and showed the platform's records.
   * Only the exact string `all` may widen.
   */
  it("treats any unrecognised scope as the default, never as all", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      { action: "validity.invalidated", actorUserId: teacher.id },
      { action: "email.sent", actorUserId: null },
      { action: "cycle.generated", actorUserId: null },
    ]);

    for (const scope of [
      undefined,
      "teacher",
      "ALL",
      "All",
      "everything",
      "",
      "all ",
      "teacher,all",
    ]) {
      const page = await listSectionAuditEvents(teacher.id, section.id, {
        scope,
      });
      expect(page.total, `scope=${JSON.stringify(scope)}`).toBe(1);
      expect(
        page.rows.map((r) => r.event.action),
        `scope=${JSON.stringify(scope)}`,
      ).toEqual(["validity.invalidated"]);
    }

    // The one value that does widen.
    const widened = await listSectionAuditEvents(teacher.id, section.id, {
      scope: "all",
    });
    expect(widened.total).toBe(3);
  });

  it("normalizes the same way for the actor options", async () => {
    const { teacher, section } = await setup();
    const opsOnly = await makeUser({ displayName: "Ops Person" });
    await writeRows(section.id, [
      { action: "validity.invalidated", actorUserId: teacher.id },
      { action: "student_number.revealed", actorUserId: opsOnly.id },
    ]);

    for (const scope of ["ALL", "everything", "", undefined]) {
      const actors = await listSectionAuditActors(teacher.id, section.id, {
        scope,
      });
      expect(actors.map((a) => a.id), `scope=${scope}`).toEqual([teacher.id]);
    }
    const widened = await listSectionAuditActors(teacher.id, section.id, {
      scope: "all",
    });
    expect(widened.map((a) => a.name)).toEqual(["Ops Person", "Owner One"]);
  });

  it("lets the wider scope select a system-only action", async () => {
    const { teacher, section } = await setup();
    await writeRows(section.id, [
      { action: "email.sent", actorUserId: null },
      { action: "validity.invalidated", actorUserId: teacher.id },
    ]);

    // Advertised by "Everything" and therefore selectable there — the page
    // builds its options from AUDIT_ACTIONS in that scope for this reason.
    const selected = await listSectionAuditEvents(teacher.id, section.id, {
      action: "email.sent",
      scope: "all",
    });
    expect(selected.total).toBe(1);
    expect(selected.rows[0]!.event.action).toBe("email.sent");
    expect(AUDIT_ACTIONS).toContain("email.sent");
    expect(TEACHER_FACING_ACTIONS).not.toContain("email.sent");
  });
});

describe("audit history: a real import, read back", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  /**
   * End to end against the actual writer rather than a copied payload: the
   * roster importer records a student's name and UP email, because those rows
   * exist to record who was granted access. The default reading of the page
   * must state that an import happened without becoming a list of names.
   */
  it("states the access grant without printing the name or the address", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(
        "student number,full name,up mail\n" +
          "2026-00001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n",
      ),
      "class list",
    );

    const page = await listSectionAuditEvents(teacher.id, section.id);
    const actions = page.rows.map((r) => r.event.action);
    expect(actions).toContain("roster.row_added");
    expect(actions).toContain("roster.email_linked");
    expect(actions).toContain("roster.imported");

    // The row itself is untouched and append-only: the name and the address are
    // still stored, which is what makes the grant auditable at all.
    const added = page.rows.find((r) => r.event.action === "roster.row_added")!;
    expect(added.event.after).toMatchObject({
      fullName: "Juan Dela Cruz",
      rosterEmail: "juan.delacruz@up.edu.ph",
    });

    // What the page READS says the field changed and withholds the value.
    for (const row of page.rows) {
      const sentence = auditSentence({
        action: row.event.action,
        entityType: row.event.entityType,
        actorName: row.actor?.displayName ?? null,
        subject: row.subject,
      });
      expect(sentence).not.toContain("Juan");
      expect(sentence).not.toContain("up.edu.ph");

      const changes = describeChanges(row.event.before, row.event.after);
      const rendered = JSON.stringify(changes);
      expect(rendered, row.event.action).not.toContain("Juan");
      expect(rendered, row.event.action).not.toContain("up.edu.ph");
    }

    const grant = describeChanges(added.event.before, added.event.after);
    expect(grant.map((c) => [c.label, c.after])).toEqual([
      ["Name", "withheld"],
      ["UP email", "withheld"],
    ]);
  });

  it("keeps the whole payload in the row for the technical disclosure", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(
        "student number,full name,up mail\n" +
          "2026-00002,Maria Santos,maria.santos@up.edu.ph\n",
      ),
      "class list",
    );

    /**
     * The deliberate staff-only exception. The default diff withholds; the raw
     * payload is what an incident is actually investigated from, and a redacted
     * version of it could not answer "what did the system store". This asserts
     * the projection did not mutate the row — the log is append-only.
     */
    const page = await listSectionAuditEvents(teacher.id, section.id);
    const linked = page.rows.find(
      (r) => r.event.action === "roster.email_linked",
    )!;
    expect(linked.event.after).toMatchObject({
      rosterEmail: "maria.santos@up.edu.ph",
    });
    expect(linked.event.before).toMatchObject({ rosterEmail: null });
  });
});

/**
 * Scope completeness: does a section's history actually CONTAIN its own
 * records?
 *
 * The read side has three cases (`sectionAuditScope`), and the third one — the
 * legacy fan-out by entity id — only reaches a row if the entity is still
 * findable from the section. Two kinds of writer fall outside it entirely:
 *
 * - a **course-owned** entity (a course, a form version, a backlog question)
 *   is reachable from no section at all, so without `courseId` on the row the
 *   record of "who changed the questions" existed and was invisible;
 * - a row whose entity is **deleted in the same transaction** (`staff.removed`)
 *   can never be found again by id, at any later time.
 *
 * These tests drive the real service writers rather than inserting rows, which
 * is the point: they fail if a writer stops recording its scope.
 */
describe("audit history: every writer records the scope it belongs to", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("shows course-owned records — the course, its forms, its backlog — to a section of that course", async () => {
    const teacher = await makeUser({ isTeacher: true, displayName: "Owner" });
    const course = await createCourse(teacher.id, {
      code: "CS 33",
      title: "Programming",
    });
    // Created AFTER the course, exactly as a new section is in practice: the
    // course-level history predates it and still belongs to it.
    const section = await createSection(teacher.id, {
      courseId: course.id,
      term: "2026-1",
      title: "Section A",
    });
    await updateCourse(teacher.id, course.id, { title: "Programming II" });

    const { template } = await createTemplate(teacher.id, {
      courseId: course.id,
      title: "Weekly",
      questions: [
        { prompt: "Pace?", type: "short_answer", required: true, displayOrder: 0 },
      ],
    });
    await createTemplateVersion(teacher.id, template.id, [
      { prompt: "Pace this week?", type: "short_answer", required: true, displayOrder: 0 },
    ]);

    const legacy = await importLegacyEntries(
      teacher.id,
      course.id,
      [{ text: "Why pointers?" }],
      "Old Q&A doc",
    );
    await setBacklogState(teacher.id, legacy.created[0]!.id, "needs_review");

    const page = await listSectionAuditEvents(teacher.id, section.id, {
      pageSize: 100,
    });
    const actions = page.rows.map((r) => r.event.action);
    expect(actions).toContain("course.created");
    expect(actions).toContain("course.updated");
    expect(actions).toContain("template.created");
    expect(actions).toContain("template.version_created");
    expect(actions).toContain("legacy.imported");
    expect(actions).toContain("backlog.state_changed");
    expect(actions).toContain("section.created");
  });

  it("keeps another course's records out, and keeps a sibling section's own act out", async () => {
    const teacher = await makeUser({ isTeacher: true });
    const course = await createCourse(teacher.id, { code: "CS 33", title: "A" });
    const a = await createSection(teacher.id, {
      courseId: course.id,
      term: "T",
      title: "A",
    });
    const b = await createSection(teacher.id, {
      courseId: course.id,
      term: "T",
      title: "B",
    });
    const other = await createCourse(teacher.id, { code: "CS 12", title: "B" });
    const otherSection = await createSection(teacher.id, {
      courseId: other.id,
      term: "T",
      title: "Only",
    });

    const legacy = await importLegacyEntries(
      teacher.id,
      course.id,
      [{ text: "Why pointers?" }],
      "Old doc",
    );
    const question = legacy.created[0]!;
    await setBacklogState(teacher.id, question.id, "needs_review");
    await setBacklogState(teacher.id, question.id, "answerable");
    // Exposing a backlog question is an act on ONE section. It is scoped to
    // that section, so its sibling — same course, same backlog — must not see
    // it, even though both share every course-level row.
    await makeVisibleToSection(teacher.id, question.id, a.id);

    const inA = (
      await listSectionAuditEvents(teacher.id, a.id, { pageSize: 100 })
    ).rows.map((r) => r.event.action);
    const inB = (
      await listSectionAuditEvents(teacher.id, b.id, { pageSize: 100 })
    ).rows.map((r) => r.event.action);
    const inOther = (
      await listSectionAuditEvents(teacher.id, otherSection.id, {
        pageSize: 100,
      })
    ).rows.map((r) => r.event.action);

    expect(inA).toContain("backlog.made_visible_to_section");
    expect(inB).not.toContain("backlog.made_visible_to_section");
    // The course-level rows are shared by both sections of the course...
    expect(inB).toContain("legacy.imported");
    // ...and reach neither the other course's section.
    expect(inOther).not.toContain("legacy.imported");
    expect(inOther).not.toContain("backlog.made_visible_to_section");
  });

  it("still shows a staff removal, whose section_staff row no longer exists", async () => {
    const owner = await makeUser({ isTeacher: true, displayName: "Owner" });
    const course = await createCourse(owner.id, { code: "CS 33", title: "A" });
    const section = await createSection(owner.id, {
      courseId: course.id,
      term: "T",
      title: "A",
    });
    const ta = await makeUser({ displayName: "Assistant" });
    await assignSectionStaff(owner.id, section.id, {
      email: ta.email,
      role: "ta",
      permissions: { reviewResponses: true },
    });
    const rows = await db.query.sectionStaff.findMany({
      where: eq(sectionStaff.sectionId, section.id),
    });
    const taRow = rows.find((r) => r.userId === ta.id)!;
    await removeSectionStaff(owner.id, section.id, taRow.id);

    const actions = (
      await listSectionAuditEvents(owner.id, section.id, { pageSize: 100 })
    ).rows.map((r) => r.event.action);
    // Would be missing entirely if the removal relied on the entity-id
    // fan-out: the row it names was deleted in the same transaction.
    expect(actions).toContain("staff.assigned");
    expect(actions).toContain("staff.removed");
  });

  it("records the section on every publication and review row", async () => {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    await addSectionStaff(section.id, teacher.id, "teacher");
    const { template } = await createTemplate(teacher.id, {
      courseId: course.id,
      title: "T",
      questions: [
        { prompt: "Pace?", type: "short_answer", required: true, displayOrder: 0 },
      ],
    });
    const schedule = await makeSchedule({
      courseId: course.id,
      sectionIds: [section.id],
      templateId: template.id,
      occurrenceCount: 1,
    });
    await generateCyclesForSchedule(schedule, new Date("2026-01-06T00:00:00Z"));
    await openDueCycles(new Date("2026-01-05T01:00:00Z"));
    const cycle = (await db.query.formInstances.findFirst({
      where: eq(formInstances.scheduleId, schedule.id),
    }))!;
    const question = (await db.query.formQuestions.findMany({
      where: eq(formQuestions.cycleId, cycle.id),
    }))[0]!;
    const student = await makeEnrolledStudent(section.id);
    const submitted = await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: question.id, text: "fine" }],
        studentItem: {
          submissionType: "question",
          category: "content",
          text: "What is recursion?",
        },
      },
      new Date("2026-01-06T04:00:00Z"),
    );

    await setResponseReviewState(teacher.id, submitted.responseId, "under_review");
    await createPrivateResponse(teacher.id, submitted.studentItemId!, "See slide 4.");
    const answer = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [submitted.studentItemId!],
      publicQuestionText: "How does recursion work?",
      answerBody: "A function that calls itself.",
      category: "content",
    });
    await publishNow(teacher.id, answer.id, { anonymityAcknowledged: true });

    // These entities ARE reachable from the section, so the fan-out found them
    // already. The section column is what makes that no longer load-bearing.
    const scoped = await db.query.auditEvents.findMany();
    const byAction = new Map(scoped.map((r) => [r.action, r]));
    for (const action of [
      "response.review_state_changed",
      "private_response.created",
      "public_answer.drafted",
      "source_link.created",
      "public_answer.published",
    ]) {
      expect(byAction.get(action), action).toBeDefined();
      expect(byAction.get(action)!.sectionId, action).toBe(section.id);
    }

    const actions = (
      await listSectionAuditEvents(teacher.id, section.id, { pageSize: 100 })
    ).rows.map((r) => r.event.action);
    expect(actions).toContain("public_answer.published");
    expect(actions).toContain("private_response.created");
  });
});
