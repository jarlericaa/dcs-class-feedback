import { beforeEach, describe, expect, it } from "vitest";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  makeCourse,
  makeEnrolledStudent,
  makeInstance,
  makeSection,
  makeUser,
} from "./fixtures";
import {
  formResponses,
  privateResponses,
  studentSubmissionItems,
} from "@/db/schema";
import { AuthzError } from "@/modules/authz";
import {
  createPrivateResponse,
  declineToAnswer,
  getCourseReviewQueue,
} from "@/modules/review";
import { getStudentHistory } from "@/modules/publishing";

/**
 * Who may open the COURSE review queue, and what they see in it.
 *
 * The queue is course-scoped because a form shared by several sections has one
 * queue — that is the point of sharing it. `review_responses`, however, is a
 * per-SECTION flag. Gating the queue on course-level standing therefore made
 * the advertised permission unusable for the exact person it exists for: a
 * section assistant could hold the flag and still be refused the only inbox
 * there is.
 *
 * These tests pin both halves of the fix. The gate admits a section grant; the
 * SCOPE does not widen with it — an assistant granted the flag on Section A
 * still sees nothing from Section B.
 */

async function courseWithTwoSections() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const sectionA = await makeSection(course.id);
  const sectionB = await makeSection(course.id);
  await addSectionStaff(sectionA.id, teacher.id, "teacher");
  await addSectionStaff(sectionB.id, teacher.id, "teacher");

  const now = Date.now();
  const cycle = await makeInstance({
    courseId: course.id,
    sectionIds: [sectionA.id, sectionB.id],
    openAt: new Date(now - 3600_000),
    deadlineAt: new Date(now + 3600_000),
  });

  const submitTo = async (sectionId: string, text: string) => {
    const { record } = await makeEnrolledStudent(sectionId);
    const [response] = await db
      .insert(formResponses)
      .values({
        cycleId: cycle.id,
        studentRecordId: record.id,
        sectionId,
        submittedAt: new Date(),
      })
      .returning();
    await db.insert(studentSubmissionItems).values({
      responseId: response!.id,
      submissionType: "question",
      category: "content",
      originalText: text,
    });
    return response!;
  };

  const inA = await submitTo(sectionA.id, "A question from section A.");
  const inB = await submitTo(sectionB.id, "A question from section B.");
  return { teacher, course, sectionA, sectionB, inA, inB };
}

describe("course review queue access", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("admits a section assistant holding review_responses on one section", async () => {
    const { course, sectionA } = await courseWithTwoSections();
    const ta = await makeUser({ displayName: "Assistant" });
    await addSectionStaff(sectionA.id, ta.id, "ta", { reviewResponses: true });

    const queue = await getCourseReviewQueue(ta.id, course.id);
    expect(queue.rows.length).toBe(1);
    expect(queue.sections.map((s) => s.id)).toEqual([sectionA.id]);
  });

  it("does not let that grant reach the course's other sections", async () => {
    const { course, sectionA, sectionB, inB } = await courseWithTwoSections();
    const ta = await makeUser({ displayName: "Assistant" });
    await addSectionStaff(sectionA.id, ta.id, "ta", { reviewResponses: true });

    const queue = await getCourseReviewQueue(ta.id, course.id);
    expect(queue.rows.map((r) => r.response.id)).not.toContain(inB.id);
    expect(queue.sections.map((s) => s.id)).not.toContain(sectionB.id);
  });

  it("still refuses a section member who was never granted the flag", async () => {
    const { course, sectionA } = await courseWithTwoSections();
    const ta = await makeUser({ displayName: "Assistant" });
    await addSectionStaff(sectionA.id, ta.id, "ta", { reviewResponses: false });

    await expect(getCourseReviewQueue(ta.id, course.id)).rejects.toBeInstanceOf(
      AuthzError,
    );
  });

  it("still refuses a stranger to the course", async () => {
    const { course } = await courseWithTwoSections();
    const outsider = await makeUser({ isTeacher: true });

    await expect(
      getCourseReviewQueue(outsider.id, course.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("still refuses an enrolled student", async () => {
    const { course, sectionA } = await courseWithTwoSections();
    const { user } = await makeEnrolledStudent(sectionA.id);

    await expect(
      getCourseReviewQueue(user.id, course.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("gives course staff every section, as before", async () => {
    const { teacher, course, sectionA, sectionB } =
      await courseWithTwoSections();

    const queue = await getCourseReviewQueue(teacher.id, course.id);
    expect(queue.rows.length).toBe(2);
    expect(queue.sections.map((s) => s.id).sort()).toEqual(
      [sectionA.id, sectionB.id].sort(),
    );
  });

  it("masks identity for an assistant without view_student_identities", async () => {
    const { course, sectionA } = await courseWithTwoSections();
    const ta = await makeUser({ displayName: "Assistant" });
    await addSectionStaff(sectionA.id, ta.id, "ta", { reviewResponses: true });

    const queue = await getCourseReviewQueue(ta.id, course.id);
    expect(queue.canSeeIdentities).toBe(false);
    expect(queue.rows[0]!.student).toBeNull();
  });
});

/**
 * The feed reads one occurrence but has to offer every other one in its week
 * switcher, and it must not count work that no action can clear.
 */
describe("course review queue — the feed's read model", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function courseWithTwoWeeks() {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    await addSectionStaff(section.id, teacher.id, "teacher");
    const now = Date.now();
    const week1 = await makeInstance({
      courseId: course.id,
      sectionIds: [section.id],
      openAt: new Date(now - 14 * 86_400_000),
      deadlineAt: new Date(now - 7 * 86_400_000),
      cycleIndex: 1,
      state: "closed",
    });
    const week2 = await makeInstance({
      courseId: course.id,
      sectionIds: [section.id],
      openAt: new Date(now - 3600_000),
      deadlineAt: new Date(now + 3600_000),
      cycleIndex: 2,
    });
    const add = async (
      cycleId: string,
      kind: "question" | "general_comment" | null,
    ) => {
      const { record } = await makeEnrolledStudent(section.id);
      const [response] = await db
        .insert(formResponses)
        .values({
          cycleId,
          studentRecordId: record.id,
          sectionId: section.id,
          submittedAt: new Date(),
        })
        .returning();
      if (kind) {
        await db.insert(studentSubmissionItems).values({
          responseId: response!.id,
          kind,
          submissionType: kind === "general_comment" ? "feedback" : "question",
          category: "content",
          originalText: "Something a student wrote.",
        });
      }
      return response!;
    };
    return { teacher, course, section, week1, week2, add };
  }

  it("reads one occurrence but still lists every other one", async () => {
    const { teacher, course, week1, week2, add } = await courseWithTwoWeeks();
    await add(week1.id, "question");
    await add(week2.id, "question");
    await add(week2.id, "question");

    const queue = await getCourseReviewQueue(teacher.id, course.id, {
      instanceId: week2.id,
    });
    // The rows are the requested week only...
    expect(queue.rows.length).toBe(2);
    expect(queue.rows.every((r) => r.response.cycleId === week2.id)).toBe(true);
    // ...but the switcher still has somewhere else to go.
    const byId = new Map(queue.instances.map((i) => [i.instance.id, i]));
    expect(byId.size).toBe(2);
    expect(byId.get(week1.id)!.responseCount).toBe(1);
    expect(byId.get(week2.id)!.responseCount).toBe(2);
  });

  it("does not count a general comment as needing a reply", async () => {
    const { teacher, course, week2, add } = await courseWithTwoWeeks();
    await add(week2.id, "general_comment");
    await add(week2.id, "question");
    // Answered the form and asked nothing.
    await add(week2.id, null);

    const queue = await getCourseReviewQueue(teacher.id, course.id, {
      instanceId: week2.id,
    });
    expect(queue.counts.total).toBe(3);
    // Only the real question. A comment can never be published and is never
    // triaged, so counting it would put a number on the queue that no action
    // ever clears.
    expect(queue.counts.needsReview).toBe(1);

    const waiting = await getCourseReviewQueue(teacher.id, course.id, {
      instanceId: week2.id,
      filter: "needs_review",
    });
    expect(waiting.rows.length).toBe(1);
    expect(waiting.rows[0]!.items[0]!.item.kind).toBe("question");
  });

  it("carries each response's form answers, so the feed needs no second read", async () => {
    const { teacher, course, week2, add } = await courseWithTwoWeeks();
    await add(week2.id, "question");

    const queue = await getCourseReviewQueue(teacher.id, course.id, {
      instanceId: week2.id,
    });
    // No questions were configured on this fixture, so the shape is what
    // matters: the field exists and the feed can render it without a per-row
    // detail query.
    expect(Array.isArray(queue.rows[0]!.answers)).toBe(true);
  });
});

/**
 * "Will not answer" — the third outcome, alongside a private reply and a public
 * answer. Without it the queue never empties: a question a teacher has read and
 * deliberately left keeps counting as work forever.
 */
describe("declining to answer a question", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function oneQuestion(kind: "question" | "general_comment" = "question") {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    await addSectionStaff(section.id, teacher.id, "teacher");
    const now = Date.now();
    const cycle = await makeInstance({
      courseId: course.id,
      sectionIds: [section.id],
      openAt: new Date(now - 3600_000),
      deadlineAt: new Date(now + 3600_000),
    });
    const { record } = await makeEnrolledStudent(section.id);
    const [response] = await db
      .insert(formResponses)
      .values({
        cycleId: cycle.id,
        studentRecordId: record.id,
        sectionId: section.id,
        submittedAt: new Date(),
      })
      .returning();
    const [item] = await db
      .insert(studentSubmissionItems)
      .values({
        responseId: response!.id,
        kind,
        submissionType: kind === "general_comment" ? "feedback" : "question",
        category: "content",
        originalText: "Could you go over recursion again?",
      })
      .returning();
    return { teacher, course, section, response: response!, item: item! };
  }

  it("settles the question and clears it from the queue count", async () => {
    const { teacher, course, item } = await oneQuestion();
    const before = await getCourseReviewQueue(teacher.id, course.id);
    expect(before.counts.needsReview).toBe(1);

    await declineToAnswer(teacher.id, item.id);

    const after = await getCourseReviewQueue(teacher.id, course.id);
    expect(after.counts.needsReview).toBe(0);
    expect(after.rows[0]!.items[0]!.settled).toBe(true);
    expect(after.rows[0]!.outstanding).toBe(false);
    // Not "answered": nothing was said to anybody.
    expect(after.rows[0]!.answered).toBe(false);
  });

  it("never destroys the student's words and can be reversed", async () => {
    const { teacher, course, item } = await oneQuestion();
    await declineToAnswer(teacher.id, item.id);
    await declineToAnswer(teacher.id, item.id, { undo: true });

    const queue = await getCourseReviewQueue(teacher.id, course.id);
    expect(queue.counts.needsReview).toBe(1);
    expect(queue.rows[0]!.items[0]!.item.originalText).toBe(
      "Could you go over recursion again?",
    );
    expect(queue.rows[0]!.items[0]!.item.disposition).toBe("undecided");
  });

  it("records the decision in the audit log, since the student is never told", async () => {
    const { teacher, item } = await oneQuestion();
    await declineToAnswer(teacher.id, item.id);

    const events = await db.query.auditEvents.findMany();
    const declined = events.find((e) => e.action === "item.answer_declined");
    expect(declined).toBeTruthy();
    expect(declined!.entityId).toBe(item.id);
  });

  it("refuses a general comment, which is never triaged", async () => {
    const { teacher, item } = await oneQuestion("general_comment");
    await expect(declineToAnswer(teacher.id, item.id)).rejects.toThrow();
  });

  it("refuses a question that has already been replied to", async () => {
    const { teacher, item } = await oneQuestion();
    await createPrivateResponse(teacher.id, item.id, "Yes — Thursday.");
    await expect(declineToAnswer(teacher.id, item.id)).rejects.toThrow();
  });

  it("refuses somebody without review_responses on the section", async () => {
    const { course, section, item } = await oneQuestion();
    const ta = await makeUser({ displayName: "Assistant" });
    await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: false });
    expect(course).toBeTruthy();

    await expect(declineToAnswer(ta.id, item.id)).rejects.toBeInstanceOf(
      AuthzError,
    );
  });
});

/**
 * A private thread is a conversation, not a broadcast: staff colleagues answer
 * each other's students, and `privateMessageRole` allows the asker's own
 * follow-up in the same list. Unattributed, a classmate's words read as a
 * colleague's answer.
 */
describe("who wrote each message in a thread", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function threadFixture() {
    const teacher = await makeUser({
      isTeacher: true,
      displayName: "Prof Reyes",
    });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    await addSectionStaff(section.id, teacher.id, "teacher");
    const now = Date.now();
    const cycle = await makeInstance({
      courseId: course.id,
      sectionIds: [section.id],
      openAt: new Date(now - 3600_000),
      deadlineAt: new Date(now + 3600_000),
    });
    const { user: studentUser, record } = await makeEnrolledStudent(section.id);
    const [response] = await db
      .insert(formResponses)
      .values({
        cycleId: cycle.id,
        studentRecordId: record.id,
        sectionId: section.id,
        submittedAt: new Date(),
      })
      .returning();
    const [item] = await db
      .insert(studentSubmissionItems)
      .values({
        responseId: response!.id,
        submissionType: "question",
        category: "content",
        originalText: "Could you go over recursion again?",
      })
      .returning();
    return { teacher, course, section, studentUser, record, item: item! };
  }

  it("names the staff member who replied", async () => {
    const { teacher, course, item } = await threadFixture();
    await createPrivateResponse(teacher.id, item.id, "Thursday, at the start.");

    const queue = await getCourseReviewQueue(teacher.id, course.id);
    const message = queue.rows[0]!.items[0]!.privateResponses[0]!;
    expect(message.authorRole).toBe("staff");
    expect(message.authorName).toBe("Prof Reyes");
  });

  it("attributes the asker's own follow-up to the asker, not to staff", async () => {
    const { teacher, course, studentUser, record, item } =
      await threadFixture();
    await createPrivateResponse(teacher.id, item.id, "Thursday.");
    await db.insert(privateResponses).values({
      itemId: item.id,
      authorUserId: studentUser.id,
      authorRole: "student",
      body: "Thank you!",
    });

    const queue = await getCourseReviewQueue(teacher.id, course.id);
    const thread = queue.rows[0]!.items[0]!.privateResponses;
    const followUp = thread.find((m) => m.authorRole === "student")!;
    // The roster name staff already know them by — never the account name.
    expect(followUp.authorName).toBe(record.fullName);
    expect(thread.find((m) => m.authorRole === "staff")!.authorName).toBe(
      "Prof Reyes",
    );
  });

  it("masks the follow-up's author for a reader without identity access", async () => {
    const { teacher, course, section, studentUser, item } =
      await threadFixture();
    await createPrivateResponse(teacher.id, item.id, "Thursday.");
    await db.insert(privateResponses).values({
      itemId: item.id,
      authorUserId: studentUser.id,
      authorRole: "student",
      body: "Thank you!",
    });
    const ta = await makeUser({ displayName: "Assistant" });
    await addSectionStaff(section.id, ta.id, "ta", {
      reviewResponses: true,
      viewStudentIdentities: false,
    });

    const queue = await getCourseReviewQueue(ta.id, course.id);
    expect(queue.canSeeIdentities).toBe(false);
    const thread = queue.rows[0]!.items[0]!.privateResponses;
    // The student's name is withheld exactly as it is on the row itself...
    expect(thread.find((m) => m.authorRole === "student")!.authorName).toBeNull();
    // ...while the colleague who replied is still named. Staff identity is not
    // what view_student_identities protects.
    expect(thread.find((m) => m.authorRole === "staff")!.authorName).toBe(
      "Prof Reyes",
    );
  });
});

/**
 * The student's own view of the same thread.
 *
 * Both sides read one conversation, so both need to know who said what — but
 * they are told different things about it. §3.5 and every student-facing
 * surface attribute a reply to "your teaching team", never to an individual.
 */
describe("the student's projection of a thread", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("carries the author's ROLE and never the staff member's name", async () => {
    const teacher = await makeUser({
      isTeacher: true,
      displayName: "Prof Reyes",
    });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    await addSectionStaff(section.id, teacher.id, "teacher");
    const now = Date.now();
    const cycle = await makeInstance({
      courseId: course.id,
      sectionIds: [section.id],
      openAt: new Date(now - 7 * 86_400_000),
      deadlineAt: new Date(now - 3600_000),
      state: "closed",
    });
    const { user: studentUser, record } = await makeEnrolledStudent(section.id);
    const [response] = await db
      .insert(formResponses)
      .values({
        cycleId: cycle.id,
        studentRecordId: record.id,
        sectionId: section.id,
        submittedAt: new Date(now - 2 * 86_400_000),
      })
      .returning();
    const [item] = await db
      .insert(studentSubmissionItems)
      .values({
        responseId: response!.id,
        submissionType: "question",
        category: "content",
        originalText: "Could you go over recursion again?",
      })
      .returning();
    await createPrivateResponse(teacher.id, item!.id, "Thursday.");
    await db.insert(privateResponses).values({
      itemId: item!.id,
      authorUserId: studentUser.id,
      authorRole: "student",
      body: "Thank you!",
    });

    const history = await getStudentHistory(studentUser.id, section.id);
    const thread = history[0]!.items[0]!.privateResponses;
    expect(thread).toHaveLength(2);

    // The role is there, so the student's own words are not handed back to them
    // labelled as the teaching team's.
    expect(thread.map((m) => m.authorRole).sort()).toEqual([
      "staff",
      "student",
    ]);

    // And the individual staff member is not named on this side of the thread.
    const serialized = JSON.stringify(history);
    expect(serialized).not.toContain("Prof Reyes");
  });
});
