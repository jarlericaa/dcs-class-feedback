import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  makeCourse,
  makeEnrolledStudent,
  makeSection,
  makeUser,
} from "./fixtures";
import {
  auditEvents,
  formInstances,
  formQuestions,
  formResponses,
  responseReads,
} from "@/db/schema";
import { createTemplate } from "@/modules/forms/templates";
import { configureDelivery } from "@/modules/forms/schedules";
import {
  generateInstancesForSchedule,
  openDueCycles,
} from "@/modules/forms/cycles";
import { submitResponse } from "@/modules/forms/submission";
import {
  countUnread,
  getCourseReviewQueue,
  listReadResponseIds,
  markResponseRead,
  markResponsesRead,
  markResponseUnread,
  MAX_MARK_READ_IDS,
} from "@/modules/review";
import { getStudentHistory } from "@/modules/publishing";
import { AuthzError } from "@/modules/authz";

/**
 * Per-reader read state (GitHub issue #6).
 *
 * The properties that matter, and why each is not cosmetic:
 *
 *  - PER READER. A shared marker would let one assistant's skim hide a
 *    submission from the instructor who still has to decide on it, so the
 *    queue could empty with nothing answered.
 *  - Persistent. The whole request is "resume where you left off", which a
 *    session cookie cannot do across a reload or a second device.
 *  - Idempotent. Re-marking must neither duplicate a row, move `read_at`, nor
 *    add a second entry to an append-only audit log.
 *  - Authorized on the response's OWN section, so a shared form does not let
 *    standing on one audience section reach another's rows.
 *  - Invisible to students, and irrelevant to participation.
 */

const START = "2026-01-05"; // a Monday
const inWindow = new Date("2026-01-06T04:00:00Z");

async function week(sections = 1) {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const made = [];
  for (let i = 0; i < sections; i += 1) {
    const section = await makeSection(course.id);
    await addSectionStaff(section.id, teacher.id, "teacher");
    made.push(section);
  }
  const { template } = await createTemplate(teacher.id, {
    courseId: course.id,
    title: "Weekly feedback",
    questions: [
      {
        prompt: "How was the pace?",
        type: "short_answer",
        required: true,
        displayOrder: 0,
      },
    ],
  });
  const { schedule } = await configureDelivery(teacher.id, course.id, {
    templateId: template.id,
    deliveryMode: "weekly",
    audienceMode: "all_sections",
    sectionIds: [],
    openDayOfWeek: 1,
    openTime: "08:00",
    deadlineDayOfWeek: 5,
    deadlineTime: "17:00",
    startDate: START,
    occurrenceCount: 1,
  });
  await generateInstancesForSchedule(schedule, new Date("2026-02-01T00:00:00Z"));
  await openDueCycles(new Date("2026-01-05T01:00:00Z"));
  const cycle = (await db.query.formInstances.findFirst({
    where: and(
      eq(formInstances.scheduleId, schedule.id),
      eq(formInstances.state, "open"),
    ),
  }))!;
  const question = (await db.query.formQuestions.findFirst({
    where: eq(formQuestions.cycleId, cycle.id),
  }))!;
  return { teacher, course, sections: made, section: made[0]!, cycle, question };
}

async function answer(sectionId: string, cycleId: string, questionId: string) {
  const student = await makeEnrolledStudent(sectionId);
  const result = await submitResponse(
    student.user.id,
    cycleId,
    { answers: [{ questionId, text: "Fine" }] },
    inWindow,
  );
  return { student, responseId: result.responseId };
}

describe("per-reader read state", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("starts unread, marks read, and reads back per reader", async () => {
    const { teacher, section, cycle, question } = await week();
    const other = await makeUser({ isTeacher: true, displayName: "Co" });
    await addSectionStaff(section.id, other.id, "co_teacher");
    const a = await answer(section.id, cycle.id, question.id);
    const b = await answer(section.id, cycle.id, question.id);

    expect(
      await listReadResponseIds(teacher.id, [a.responseId, b.responseId]),
    ).toEqual(new Set());
    expect(await countUnread(teacher.id, [a.responseId, b.responseId])).toBe(2);

    await markResponseRead(teacher.id, a.responseId);

    expect(
      [...(await listReadResponseIds(teacher.id, [a.responseId, b.responseId]))],
    ).toEqual([a.responseId]);
    expect(await countUnread(teacher.id, [a.responseId, b.responseId])).toBe(1);

    // The other reader's own state is untouched: this is the property that
    // stops one skim from clearing a colleague's queue.
    expect(
      await listReadResponseIds(other.id, [a.responseId, b.responseId]),
    ).toEqual(new Set());
    expect(await countUnread(other.id, [a.responseId, b.responseId])).toBe(2);
  });

  it("is idempotent: no duplicate row, no moved timestamp, no second audit row", async () => {
    const { teacher, section, cycle, question } = await week();
    const a = await answer(section.id, cycle.id, question.id);

    await markResponseRead(teacher.id, a.responseId);
    const first = await db.query.responseReads.findMany({
      where: eq(responseReads.responseId, a.responseId),
    });
    expect(first).toHaveLength(1);

    await markResponseRead(teacher.id, a.responseId);
    await markResponseRead(teacher.id, a.responseId);
    const again = await db.query.responseReads.findMany({
      where: eq(responseReads.responseId, a.responseId),
    });
    expect(again).toHaveLength(1);
    // `read_at` is the first read, not the most recent page view.
    expect(again[0]!.readAt.getTime()).toBe(first[0]!.readAt.getTime());

    const audits = await db.query.auditEvents.findMany({
      where: eq(auditEvents.action, "response.marked_read"),
    });
    expect(audits).toHaveLength(1);
  });

  it("audits a deliberate mark, and does not audit one implied by resolving a post", async () => {
    const { teacher, section, cycle, question } = await week();
    const a = await answer(section.id, cycle.id, question.id);
    const b = await answer(section.id, cycle.id, question.id);

    await markResponseRead(teacher.id, a.responseId, "explicit");
    await markResponseRead(teacher.id, b.responseId, "resolved");

    // Both are read...
    expect(
      await countUnread(teacher.id, [a.responseId, b.responseId]),
    ).toBe(0);
    // ...but only the deliberate one left a row. The action that resolved the
    // other already has its own audit entry.
    const audits = await db.query.auditEvents.findMany({
      where: eq(auditEvents.action, "response.marked_read"),
    });
    expect(audits.map((e) => e.entityId)).toEqual([a.responseId]);
    expect(audits[0]!.sectionId).toBe(section.id);
    expect(audits[0]!.metadata).toEqual({ source: "explicit" });
  });

  it("marks unread again, and records that too", async () => {
    const { teacher, section, cycle, question } = await week();
    const a = await answer(section.id, cycle.id, question.id);

    await markResponseRead(teacher.id, a.responseId);
    await markResponseUnread(teacher.id, a.responseId);

    expect(await countUnread(teacher.id, [a.responseId])).toBe(1);
    expect(
      await db.query.responseReads.findMany({
        where: eq(responseReads.responseId, a.responseId),
      }),
    ).toHaveLength(0);
    const audits = await db.query.auditEvents.findMany({
      where: eq(auditEvents.action, "response.marked_unread"),
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.entityId).toBe(a.responseId);

    // Unreading something that was never read changes nothing and records
    // nothing — a no-op must not fill an append-only log.
    await markResponseUnread(teacher.id, a.responseId);
    expect(
      await db.query.auditEvents.findMany({
        where: eq(auditEvents.action, "response.marked_unread"),
      }),
    ).toHaveLength(1);
  });

  it("marks a whole set in one action, with ONE audit row carrying the count", async () => {
    const { teacher, section, cycle, question } = await week();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      ids.push((await answer(section.id, cycle.id, question.id)).responseId);
    }
    // One already read, so the sweep must report only what it changed.
    await markResponseRead(teacher.id, ids[0]!);

    const marked = await markResponsesRead(teacher.id, ids);
    expect(marked).toBe(2);
    expect(await countUnread(teacher.id, ids)).toBe(0);

    const bulk = await db.query.auditEvents.findMany({
      where: eq(auditEvents.action, "response.all_marked_read"),
    });
    expect(bulk).toHaveLength(1);
    expect(bulk[0]!.metadata).toEqual({ count: 2, requested: 3 });
    expect(bulk[0]!.sectionId).toBe(section.id);
    // No entity: a sweep is not about one response.
    expect(bulk[0]!.entityId).toBeNull();

    // A second sweep changes nothing, so it records nothing.
    expect(await markResponsesRead(teacher.id, ids)).toBe(0);
    expect(
      await db.query.auditEvents.findMany({
        where: eq(auditEvents.action, "response.all_marked_read"),
      }),
    ).toHaveLength(1);
  });

  it("refuses a response in a section the reader does not staff", async () => {
    const { section, cycle, question } = await week();
    const a = await answer(section.id, cycle.id, question.id);
    const outsider = await makeUser({ isTeacher: true });

    await expect(markResponseRead(outsider.id, a.responseId)).rejects.toThrow(
      AuthzError,
    );
    await expect(markResponseUnread(outsider.id, a.responseId)).rejects.toThrow(
      AuthzError,
    );
    // A guessed id must not reveal whether a response exists: missing and
    // existing-but-forbidden responses use the same public error.
    const missingId = "00000000-0000-4000-8000-000000000000";
    await expect(markResponseRead(outsider.id, a.responseId)).rejects.toThrow(
      "No access to this response",
    );
    await expect(markResponseRead(outsider.id, missingId)).rejects.toThrow(
      "No access to this response",
    );
    expect(
      await db.query.responseReads.findMany({
        where: eq(responseReads.responseId, a.responseId),
      }),
    ).toHaveLength(0);
  });

  it("does not expose read markers for responses outside the reader's sections", async () => {
    const { section, cycle, question } = await week();
    const response = await answer(section.id, cycle.id, question.id);
    const outsider = await makeUser({ isTeacher: true });

    // This is invalid state by normal means, but it proves the read-state
    // helpers themselves do not become a cross-section oracle if a caller
    // supplies a guessed id.
    await db.insert(responseReads).values({
      responseId: response.responseId,
      readerUserId: outsider.id,
    });
    expect(
      await listReadResponseIds(outsider.id, [response.responseId]),
    ).toEqual(new Set());
    expect(await countUnread(outsider.id, [response.responseId])).toBe(0);
  });

  /**
   * A bulk sweep is given a list, and a list can be tampered with. It must mark
   * what the reader legitimately holds and silently drop the rest — refusing
   * the whole batch would let one foreign id break a teacher's own week.
   */
  it("drops ids from another course out of a bulk sweep rather than failing it", async () => {
    const mine = await week();
    const theirs = await week();
    const ours = await answer(mine.section.id, mine.cycle.id, mine.question.id);
    const alien = await answer(
      theirs.section.id,
      theirs.cycle.id,
      theirs.question.id,
    );

    const marked = await markResponsesRead(mine.teacher.id, [
      ours.responseId,
      alien.responseId,
    ]);
    expect(marked).toBe(1);
    expect(await countUnread(mine.teacher.id, [ours.responseId])).toBe(0);
    // The other course's row is untouched, and its own teacher still sees it
    // as unread.
    expect(
      await db.query.responseReads.findMany({
        where: eq(responseReads.responseId, alien.responseId),
      }),
    ).toHaveLength(0);
    expect(
      await countUnread(theirs.teacher.id, [alien.responseId]),
    ).toBe(1);
  });

  /**
   * A shared form has several audience sections. Standing on one must not let a
   * reader mark another section's rows — the same rule the queue itself
   * enforces on reads.
   */
  it("does not let standing on one audience section reach another's responses", async () => {
    const { sections, cycle, question } = await week(2);
    const [a, b] = sections;
    const assistant = await makeUser({});
    await addSectionStaff(a!.id, assistant.id, "teacher");

    const mine = await answer(a!.id, cycle.id, question.id);
    const other = await answer(b!.id, cycle.id, question.id);

    await markResponseRead(assistant.id, mine.responseId);
    await expect(
      markResponseRead(assistant.id, other.responseId),
    ).rejects.toThrow(AuthzError);
    expect(
      await db.query.responseReads.findMany({
        where: eq(responseReads.responseId, other.responseId),
      }),
    ).toHaveLength(0);
  });

  /**
   * Read state must not leak into the things the product actually promises.
   * It is one staff member's bookkeeping.
   */
  it("changes nothing about the submission, its validity or the queue's counts", async () => {
    const { teacher, course, section, cycle, question } = await week();
    const a = await answer(section.id, cycle.id, question.id);

    const before = await getCourseReviewQueue(teacher.id, course.id, {
      instanceId: cycle.id,
    });
    await markResponseRead(teacher.id, a.responseId);
    const after = await getCourseReviewQueue(teacher.id, course.id, {
      instanceId: cycle.id,
    });

    expect(after.counts).toEqual(before.counts);
    const response = (await db.query.formResponses.findFirst({
      where: eq(formResponses.id, a.responseId),
    }))!;
    expect(response.validity).toBe("valid");
    expect(response.state).toBe(before.rows[0]!.response.state);
    expect(response.lifecycle).toBe("submitted");
    // And nothing in the queue's projection reports it: read state is resolved
    // separately by the page, per reader, so it can never ride along in a
    // payload that another surface reuses.
    expect(JSON.stringify(after.rows[0]!)).not.toContain("readAt");
  });

  /**
   * The read row cascades with its response, so no future hard-delete path can
   * leave a marker pointing at nothing.
   *
   * The response here is inserted directly rather than submitted, because a
   * real submission also writes answers and a revision, and neither of THOSE
   * cascades — the application never hard-deletes a response, which is why
   * that is fine. What is being asserted is this table's own constraint.
   */
  it("cascades its rows away with the response, never orphaning one", async () => {
    const { teacher, section, cycle } = await week();
    const student = await makeEnrolledStudent(section.id);
    const [bare] = await db
      .insert(formResponses)
      .values({
        cycleId: cycle.id,
        studentRecordId: student.record.id,
        sectionId: section.id,
        lifecycle: "submitted",
        submittedAt: inWindow,
      })
      .returning();
    await markResponseRead(teacher.id, bare!.id);
    expect(
      await db.query.responseReads.findMany({
        where: eq(responseReads.responseId, bare!.id),
      }),
    ).toHaveLength(1);

    await db.delete(formResponses).where(eq(formResponses.id, bare!.id));
    expect(
      await db.query.responseReads.findMany({
        where: eq(responseReads.responseId, bare!.id),
      }),
    ).toHaveLength(0);
  });

  /**
   * The student side of the promise.
   *
   * A student is never told whether staff have opened their submission. It
   * would be a claim the product does not make and a pressure it should not
   * apply — and the asking student cannot set the marker either, since read
   * state belongs to whoever is doing the reviewing.
   */
  it("is unreachable by the student who wrote the response", async () => {
    const { teacher, section, cycle, question } = await week();
    const student = await makeEnrolledStudent(section.id);
    const result = await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: question.id, text: "Fine" }],
        studentItem: {
          submissionType: "question",
          category: "content",
          text: "Will there be a practice set?",
        },
      },
      inWindow,
    );
    await markResponseRead(teacher.id, result.responseId);

    await expect(
      markResponseRead(student.user.id, result.responseId),
    ).rejects.toThrow(AuthzError);
    await expect(
      markResponseUnread(student.user.id, result.responseId),
    ).rejects.toThrow(AuthzError);
    expect(await markResponsesRead(student.user.id, [result.responseId])).toBe(
      0,
    );

    // And their own history says nothing about it.
    const history = await getStudentHistory(student.user.id, section.id);
    const payload = JSON.stringify(history);
    expect(payload).not.toContain("read");
    expect(payload).not.toContain("readAt");
    expect(payload).not.toContain(teacher.id);
  });

  it("answers nothing for an empty id list, without touching the database", async () => {
    const { teacher } = await week();
    expect(await listReadResponseIds(teacher.id, [])).toEqual(new Set());
    expect(await countUnread(teacher.id, [])).toBe(0);
    expect(await markResponsesRead(teacher.id, [])).toBe(0);
    expect(await db.query.auditEvents.findMany()).not.toContainEqual(
      expect.objectContaining({ action: "response.all_marked_read" }),
    );
  });

  /**
   * The count is distinct-ids minus distinct-rows.
   *
   * The database returns one row per response no matter how often the caller
   * named it, so subtracting that from a raw array length reported a response
   * the reader HAD read as still unread — a badge that never reaches zero.
   */
  it("counts a repeated id once", async () => {
    const { teacher, section, cycle, question } = await week();
    const a = await answer(section.id, cycle.id, question.id);
    const b = await answer(section.id, cycle.id, question.id);

    expect(await countUnread(teacher.id, [a.responseId, a.responseId])).toBe(1);

    await markResponseRead(teacher.id, a.responseId);
    expect(await countUnread(teacher.id, [a.responseId, a.responseId])).toBe(0);
    expect(
      await countUnread(teacher.id, [
        a.responseId,
        a.responseId,
        b.responseId,
        b.responseId,
      ]),
    ).toBe(1);
    // Never negative, however many times an id is repeated.
    expect(
      await countUnread(teacher.id, Array(20).fill(a.responseId)),
    ).toBe(0);
  });

  /**
   * The sweep REFUSES an oversized list rather than doing part of it.
   *
   * The ids arrive in a form field, so their number is caller-supplied. Past
   * the driver's bind-parameter limit an unbounded list fails as a 500, and
   * silently marking the first N would be worse than refusing: the control
   * says "mark these as read" and the reader would be told it had.
   */
  it("refuses more ids than it will mark, instead of truncating", async () => {
    const { teacher, section, cycle, question } = await week();
    const a = await answer(section.id, cycle.id, question.id);

    const tooMany = [
      a.responseId,
      ...Array.from(
        { length: MAX_MARK_READ_IDS },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      ),
    ];
    await expect(markResponsesRead(teacher.id, tooMany)).rejects.toThrow(
      /Too many responses to mark at once/,
    );
    // Nothing was marked, and nothing was logged: a refusal is not a partial.
    expect(await countUnread(teacher.id, [a.responseId])).toBe(1);
    expect(
      await db.query.auditEvents.findMany({
        where: eq(auditEvents.action, "response.all_marked_read"),
      }),
    ).toHaveLength(0);

    // The limit itself is allowed, so the bound refuses only what is over it.
    expect(
      await markResponsesRead(teacher.id, tooMany.slice(0, MAX_MARK_READ_IDS)),
    ).toBe(1);
  });
});
