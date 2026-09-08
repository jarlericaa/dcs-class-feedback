import { beforeEach, describe, expect, it } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  makeCourse,
  makeEnrolledStudent,
  makeSchedule,
  makeSection,
  makeUser,
} from "./fixtures";
import {
  auditEvents,
  enrollments,
  formInstanceSections,
  formInstances,
  formQuestions,
  privateResponses,
  studentSubmissionItems,
} from "@/db/schema";
import { createTemplate } from "@/modules/forms/templates";
import {
  closeDueCycles,
  generateCyclesForSchedule,
  openDueCycles,
  overrideCycleWindow,
  reopenCycle,
} from "@/modules/forms/cycles";
import { lockDueResponses } from "@/modules/forms/response-lock";
import {
  editSubmittedResponse,
  getStudentFormState,
  listResponseRevisions,
  ResponseConflictError,
  ResponseLockedError,
  saveDraft,
  SubmissionError,
  submitResponse,
} from "@/modules/forms/submission";
import { deriveParticipation } from "@/modules/participation";
import { getReviewQueue } from "@/modules/review";
import { AuthzError } from "@/modules/authz";

const TZ = "Asia/Manila";
const IN_WINDOW = new Date("2026-01-06T04:00:00Z");
const AFTER_DEADLINE = new Date("2026-01-10T10:00:00Z");

/**
 * project-specs.md §6.3 and §7 B3: draft → submit → edit → lock at the deadline,
 * with exactly one response per student per cycle and no second credit for an
 * edit.
 */
async function openCycle(
  studentSection: {
    maxStudentQuestions?: number;
    generalCommentEnabled?: boolean;
    generalCommentRequired?: boolean;
  } = {},
) {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  const { template } = await createTemplate(teacher.id, {
    courseId: course.id,
    title: "Weekly check-in",
    questions: [
      {
        prompt: "How was the pace?",
        type: "short_answer",
        required: true,
        displayOrder: 0,
      },
    ],
    studentSection,
  });
  const schedule = await makeSchedule({
    courseId: course.id,
    sectionIds: [section.id],
    templateId: template.id,
    occurrenceCount: 1,
    timezone: TZ,
  });
  await generateCyclesForSchedule(schedule, new Date("2026-01-05T00:00:00Z"));
  await openDueCycles(IN_WINDOW);
  const cycle = (await db.query.formInstances.findFirst({
    where: eq(formInstances.scheduleId, schedule.id),
  }))!;
  // The cycle-side snapshot, not the template-side row.
  const question = (await db.query.formQuestions.findFirst({
    where: eq(formQuestions.cycleId, cycle.id),
  }))!;
  const student = await makeEnrolledStudent(section.id);
  return { teacher, course, section, cycle, question, student };
}

describe("draft → submit → edit → deadline lock", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("a draft earns no credit and is invisible to staff", async () => {
    const { teacher, section, cycle, question, student } = await openCycle();
    const draft = await saveDraft(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "half written" }] },
      IN_WINDOW,
    );
    expect(draft.responseId).toBeTruthy();

    const row = (await db.query.formResponses.findFirst())!;
    expect(row.lifecycle).toBe("draft");
    // No submission timestamp: the participation anchor is not set by a draft.
    expect(row.submittedAt).toBeNull();

    const matrix = await deriveParticipation(section.id);
    expect(matrix.students[0]!.totalWeeks).toBe(0);

    const queue = await getReviewQueue(teacher.id, section.id, {});
    expect(queue.rows).toHaveLength(0);
  });

  it("a draft does not require the required questions, but submitting does", async () => {
    const { cycle, student } = await openCycle();
    // Empty draft is fine — that is what a draft is for.
    await expect(
      saveDraft(student.user.id, cycle.id, { answers: [] }, IN_WINDOW),
    ).resolves.toBeTruthy();
    await expect(
      submitResponse(student.user.id, cycle.id, { answers: [] }, IN_WINDOW),
    ).rejects.toBeInstanceOf(SubmissionError);
  });

  it("promotes the draft in place: one row, one credit, first timestamp kept", async () => {
    const { section, cycle, question, student } = await openCycle();
    const draft = await saveDraft(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "draft" }] },
      IN_WINDOW,
    );
    const submitted = await submitResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "final" }] },
      new Date(IN_WINDOW.getTime() + 60_000),
    );
    expect(submitted.responseId).toBe(draft.responseId);
    expect(submitted.firstSubmission).toBe(true);

    const rows = await db.query.formResponses.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lifecycle).toBe("submitted");

    const matrix = await deriveParticipation(section.id);
    expect(matrix.students[0]!.totalWeeks).toBe(1);
  });

  it("editing keeps one credit and records a revision trail", async () => {
    const { teacher, section, cycle, question, student } = await openCycle();
    const first = await submitResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "v1" }] },
      IN_WINDOW,
    );
    await editSubmittedResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "v2" }] },
      new Date(IN_WINDOW.getTime() + 60_000),
    );
    await editSubmittedResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "v3" }] },
      new Date(IN_WINDOW.getTime() + 120_000),
    );

    const row = (await db.query.formResponses.findFirst())!;
    expect(row.submittedAt!.getTime()).toBe(IN_WINDOW.getTime());
    expect(row.lastEditedAt!.getTime()).toBeGreaterThan(row.submittedAt!.getTime());

    // Still exactly one credit after two edits.
    const matrix = await deriveParticipation(section.id);
    expect(matrix.students[0]!.totalWeeks).toBe(1);

    const revisions = await listResponseRevisions(teacher.id, first.responseId);
    expect(revisions.map((r) => r.action)).toEqual([
      "submitted",
      "edited",
      "edited",
    ]);
    // The trail carries before/after content, not just the fact of a change.
    expect(revisions[1]!.before).toBeTruthy();
    expect(revisions[1]!.after).toBeTruthy();
  });

  it("locks at the deadline, in the same transaction as the close", async () => {
    const { course, section, cycle, question, student } = await openCycle();
    await submitResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "v1" }] },
      IN_WINDOW,
    );
    await closeDueCycles(AFTER_DEADLINE);

    const row = (await db.query.formResponses.findFirst())!;
    expect(row.lifecycle).toBe("locked");
    expect(row.lockedAt).not.toBeNull();

    await expect(
      editSubmittedResponse(
        student.user.id,
        cycle.id,
        { answers: [{ questionId: question.id, text: "too late" }] },
        AFTER_DEADLINE,
      ),
    ).rejects.toBeInstanceOf(ResponseLockedError);

    const lockAudit = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "response.locked"),
    });
    expect(lockAudit?.courseId).toBe(course.id);

    // Credit survives locking.
    const matrix = await deriveParticipation(section.id);
    expect(matrix.students[0]!.totalWeeks).toBe(1);
  });

  it("refuses an edit after the deadline even while the cycle is still open", async () => {
    const { cycle, question, student } = await openCycle();
    await submitResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "v1" }] },
      IN_WINDOW,
    );
    await expect(
      editSubmittedResponse(
        student.user.id,
        cycle.id,
        { answers: [{ questionId: question.id, text: "v2" }] },
        AFTER_DEADLINE,
      ),
    ).rejects.toBeInstanceOf(ResponseLockedError);
  });

  it("leaves a draft as a draft when the cycle closes, and it still earns nothing", async () => {
    const { section, cycle, question, student } = await openCycle();
    await saveDraft(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "never submitted" }] },
      IN_WINDOW,
    );
    await closeDueCycles(AFTER_DEADLINE);
    const row = (await db.query.formResponses.findFirst())!;
    expect(row.lifecycle).toBe("draft");
    const matrix = await deriveParticipation(section.id);
    expect(matrix.students[0]!.totalWeeks).toBe(0);
  });

  it("lockDueResponses is an idempotent backstop", async () => {
    const { cycle, question, student } = await openCycle();
    await submitResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "v1" }] },
      IN_WINDOW,
    );
    // Close the cycle without locking, as if the scheduler died mid-sweep.
    await db
      .update(formInstances)
      .set({ state: "closed" })
      .where(eq(formInstances.id, cycle.id));

    expect(await lockDueResponses(AFTER_DEADLINE)).toBe(1);
    expect(await lockDueResponses(AFTER_DEADLINE)).toBe(0);
  });

  it("reopening unlocks and audits, which is the only post-deadline edit route", async () => {
    const { teacher, cycle, question, student } = await openCycle();
    await submitResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "v1" }] },
      IN_WINDOW,
    );
    await closeDueCycles(AFTER_DEADLINE);
    await reopenCycle(teacher.id, cycle.id);

    const row = (await db.query.formResponses.findFirst())!;
    expect(row.lifecycle).toBe("submitted");
    expect(row.lockedAt).toBeNull();

    const unlocked = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "response.unlocked"),
    });
    expect(unlocked).toBeTruthy();
  });

  it("rejects a stale revision instead of silently losing an edit", async () => {
    const { cycle, question, student } = await openCycle();
    const first = await submitResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "v1" }] },
      IN_WINDOW,
    );
    await editSubmittedResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "v2" }] },
      IN_WINDOW,
    );
    // A second tab still holding the original revision must be refused.
    await expect(
      editSubmittedResponse(
        student.user.id,
        cycle.id,
        {
          answers: [{ questionId: question.id, text: "from a stale tab" }],
          expectedRevision: first.revision,
        },
        IN_WINDOW,
      ),
    ).rejects.toBeInstanceOf(ResponseConflictError);
  });

  it("two concurrent submissions produce exactly one response", async () => {
    const { cycle, question, student } = await openCycle();
    const input = { answers: [{ questionId: question.id, text: "race" }] };
    const results = await Promise.allSettled([
      submitResponse(student.user.id, cycle.id, input, IN_WINDOW),
      submitResponse(student.user.id, cycle.id, input, IN_WINDOW),
    ]);
    // Whatever the interleaving, the database ends with one row and any loser
    // fails with a domain error rather than a raw constraint violation.
    const rows = await db.query.formResponses.findMany();
    expect(rows).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(SubmissionError);
      }
    }
  });

  it("refuses a draft or submission from someone not enrolled", async () => {
    const { cycle, question } = await openCycle();
    const outsider = await makeUser({});
    for (const call of [saveDraft, submitResponse]) {
      await expect(
        call(
          outsider.id,
          cycle.id,
          { answers: [{ questionId: question.id, text: "x" }] },
          IN_WINDOW,
        ),
      ).rejects.toBeInstanceOf(AuthzError);
    }
  });

  it("refuses a student from reading another response's revision trail", async () => {
    const { cycle, question, student } = await openCycle();
    const { responseId } = await submitResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "v1" }] },
      IN_WINDOW,
    );
    await expect(
      listResponseRevisions(student.user.id, responseId),
    ).rejects.toBeInstanceOf(AuthzError);
  });
});

describe("repeatable questions and the general comment", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("creates one separately triageable record per question, plus one comment", async () => {
    const { cycle, question, student } = await openCycle({
      maxStudentQuestions: 3,
    });
    const result = await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: question.id, text: "ok" }],
        items: [
          { clientKey: "q1", kind: "question", category: "content", text: "First?" },
          { clientKey: "q2", kind: "question", category: "content", text: "Second?" },
          { clientKey: "q3", kind: "question", category: "logistics", text: "Third?" },
          {
            clientKey: "gc",
            kind: "general_comment",
            category: "misc",
            text: "Thanks for the class.",
          },
        ],
      },
      IN_WINDOW,
    );

    expect(result.studentItemIds).toHaveLength(3);
    expect(result.generalCommentId).toBeTruthy();

    const items = await db.query.studentSubmissionItems.findMany();
    const questions = items.filter((i) => i.kind === "question");
    const comments = items.filter((i) => i.kind === "general_comment");
    expect(questions.map((i) => i.ordinal).sort()).toEqual([0, 1, 2]);
    expect(comments).toHaveLength(1);
    // Each question is its own record, so each can be triaged independently.
    expect(new Set(questions.map((i) => i.id)).size).toBe(3);
  });

  it("refuses more questions than the template allows, whatever the client posts", async () => {
    const { cycle, question, student } = await openCycle({
      maxStudentQuestions: 1,
    });
    await expect(
      submitResponse(
        student.user.id,
        cycle.id,
        {
          answers: [{ questionId: question.id, text: "ok" }],
          items: [
            { clientKey: "a", kind: "question", text: "one?" },
            { clientKey: "b", kind: "question", text: "two?" },
          ],
        },
        IN_WINDOW,
      ),
    ).rejects.toThrow(/at most 1 question/);
  });

  it("refuses a second general comment (and the database agrees)", async () => {
    const { cycle, question, student } = await openCycle();
    await expect(
      submitResponse(
        student.user.id,
        cycle.id,
        {
          answers: [{ questionId: question.id, text: "ok" }],
          items: [
            { clientKey: "a", kind: "general_comment", text: "one" },
            { clientKey: "b", kind: "general_comment", text: "two" },
          ],
        },
        IN_WINDOW,
      ),
    ).rejects.toThrow(/one general comment/);
  });

  it("enforces a required general comment on submit but not on a draft", async () => {
    const { cycle, question, student } = await openCycle({
      generalCommentRequired: true,
    });
    const answers = [{ questionId: question.id, text: "ok" }];
    await expect(
      saveDraft(student.user.id, cycle.id, { answers }, IN_WINDOW),
    ).resolves.toBeTruthy();
    await expect(
      submitResponse(student.user.id, cycle.id, { answers }, IN_WINDOW),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/general comment is required/),
      details: [{ questionId: "generalComment", message: "Please fill this in." }],
    });
  });

  it("disables the block entirely when the template allows zero questions", async () => {
    const { cycle, question, student } = await openCycle({
      maxStudentQuestions: 0,
    });
    await expect(
      submitResponse(
        student.user.id,
        cycle.id,
        {
          answers: [{ questionId: question.id, text: "ok" }],
          items: [{ clientKey: "a", kind: "question", text: "sneaky?" }],
        },
        IN_WINDOW,
      ),
    ).rejects.toThrow(/at most 0 question/);
  });

  it("editing an untouched item preserves the original wording as a withdrawn row", async () => {
    const { course, teacher, section, cycle, question, student } = await openCycle();
    const submitted = await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: question.id, text: "ok" }],
        items: [{ clientKey: "q1", kind: "question", text: "original wording" }],
      },
      IN_WINDOW,
    );
    const originalId = submitted.studentItemId!;

    // Move the student to another audience section after the first save. The
    // response's original attribution must remain the audit scope for edits.
    const movedSection = await makeSection(course.id);
    await db.insert(formInstanceSections).values({
      instanceId: cycle.id,
      sectionId: movedSection.id,
    });
    await db
      .update(enrollments)
      .set({ sectionId: movedSection.id })
      .where(eq(enrollments.studentRecordId, student.record.id));

    const edited = await editSubmittedResponse(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: question.id, text: "ok" }],
        items: [
          {
            clientKey: "q1",
            itemId: originalId,
            kind: "question",
            text: "revised wording",
          },
        ],
      },
      new Date(IN_WINDOW.getTime() + 60_000),
    );
    const replacementId = edited.itemIdMappings.find(
      (mapping) => mapping.clientKey === "q1",
    )!.itemId;
    expect(replacementId).not.toBe(originalId);

    // A later edit must target the replacement, not the withdrawn original.
    // This is the id the client reconciles after a successful save.
    await db.insert(privateResponses).values({
      itemId: replacementId,
      authorUserId: teacher.id,
      authorRole: "staff",
      body: "a staff reply",
    });
    const refused = await editSubmittedResponse(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: question.id, text: "ok" }],
        items: [
          {
            clientKey: "q1",
            itemId: replacementId,
            kind: "question",
            text: "another revision",
          },
        ],
      },
      new Date(IN_WINDOW.getTime() + 120_000),
    );
    expect(refused.rejectedItemIds).toContain(replacementId);

    const original = (await db.query.studentSubmissionItems.findFirst({
      where: eq(studentSubmissionItems.id, originalId),
    }))!;
    // The original row and its text survive; it is withdrawn, never rewritten.
    expect(original.originalText).toBe("original wording");
    expect(original.withdrawnAt).not.toBeNull();
    expect(original.supersededByItemId).not.toBeNull();

    const live = await db.query.studentSubmissionItems.findMany({
      where: isNull(studentSubmissionItems.withdrawnAt),
    });
    expect(live).toHaveLength(1);
    expect(live[0]!.originalText).toBe("revised wording");

    const withdrawalAudit = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "response.item_withdrawn"),
    });
    expect(withdrawalAudit?.courseId).toBe(course.id);
    expect(withdrawalAudit?.sectionId).toBe(section.id);
  });

  it("refuses to replace an item staff have already replied to", async () => {
    const { teacher, cycle, question, student } = await openCycle();
    const submitted = await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: question.id, text: "ok" }],
        items: [{ clientKey: "q1", kind: "question", text: "answered already" }],
      },
      IN_WINDOW,
    );
    const itemId = submitted.studentItemId!;
    await db.insert(privateResponses).values({
      itemId,
      authorUserId: teacher.id,
      authorRole: "staff",
      body: "here is the answer",
    });

    const edited = await editSubmittedResponse(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: question.id, text: "ok" }],
        items: [
          { clientKey: "q1", itemId, kind: "question", text: "changed my mind" },
        ],
      },
      new Date(IN_WINDOW.getTime() + 60_000),
    );

    // The edit is reported as refused for that item, and the wording stands.
    expect(edited.rejectedItemIds).toContain(itemId);
    const item = (await db.query.studentSubmissionItems.findFirst({
      where: eq(studentSubmissionItems.id, itemId),
    }))!;
    expect(item.originalText).toBe("answered already");
    expect(item.withdrawnAt).toBeNull();
  });

  it("audits removing an untouched item with its response scope", async () => {
    const { course, section, cycle, question, student } = await openCycle({
      maxStudentQuestions: 2,
    });
    const submitted = await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: question.id, text: "ok" }],
        items: [{ clientKey: "q1", kind: "question", text: "remove me" }],
      },
      IN_WINDOW,
    );

    await editSubmittedResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "ok" }], items: [] },
      new Date(IN_WINDOW.getTime() + 60_000),
    );

    const withdrawalAudit = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "response.item_withdrawn"),
    });
    expect(withdrawalAudit?.entityId).toBe(submitted.studentItemId);
    expect(withdrawalAudit?.courseId).toBe(course.id);
    expect(withdrawalAudit?.sectionId).toBe(section.id);
  });

  it("hides withdrawn items from the staff review queue", async () => {
    const { teacher, section, cycle, question, student } = await openCycle();
    const submitted = await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: question.id, text: "ok" }],
        items: [{ clientKey: "q1", kind: "question", text: "v1" }],
      },
      IN_WINDOW,
    );
    await editSubmittedResponse(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: question.id, text: "ok" }],
        items: [
          {
            clientKey: "q1",
            itemId: submitted.studentItemId!,
            kind: "question",
            text: "v2",
          },
        ],
      },
      new Date(IN_WINDOW.getTime() + 60_000),
    );
    const queue = await getReviewQueue(teacher.id, section.id, {});
    const texts = queue.rows.flatMap((row) =>
      row.items.map((entry) => entry.item.originalText),
    );
    expect(texts).toEqual(["v2"]);
  });
});

describe("student form state", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("returns the draft so the student's typing is restored on reload", async () => {
    const { section, cycle, question, student } = await openCycle({
      maxStudentQuestions: 2,
    });
    await saveDraft(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: question.id, text: "in progress" }],
        items: [{ clientKey: "q1", kind: "question", text: "a question" }],
      },
      IN_WINDOW,
    );
    const state = (await getStudentFormState(
      student.user.id,
      section.id,
      IN_WINDOW,
    ))!;
    expect(state.response!.lifecycle).toBe("draft");
    expect(state.response!.answers[0]!.freeText).toBe("in progress");
    expect(state.response!.items[0]!.text).toBe("a question");
    expect(state.config.maxStudentQuestions).toBe(2);
    expect(state.canEdit).toBe(true);
  });
});

describe("per-occurrence window override", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("moves one week's window and audits it", async () => {
    const { teacher, cycle } = await openCycle();
    const openAt = new Date("2026-01-07T00:00:00Z");
    const deadlineAt = new Date("2026-01-11T00:00:00Z");
    const updated = await overrideCycleWindow(teacher.id, cycle.id, {
      openAt,
      deadlineAt,
    });
    expect(updated.openAt.getTime()).toBe(openAt.getTime());
    expect(updated.windowOverriddenByUserId).toBe(teacher.id);
    const audit = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "cycle.window_overridden"),
    });
    expect(audit).toBeTruthy();
  });

  it("rejects a deadline that is not after the open time", async () => {
    const { teacher, cycle } = await openCycle();
    await expect(
      overrideCycleWindow(teacher.id, cycle.id, {
        openAt: new Date("2026-01-08T00:00:00Z"),
        deadlineAt: new Date("2026-01-08T00:00:00Z"),
      }),
    ).rejects.toThrow(/after the open time/);
  });

  it("is refused once the week has a real submission, but a draft does not lock it", async () => {
    const { teacher, cycle, question, student } = await openCycle();
    await saveDraft(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "draft" }] },
      IN_WINDOW,
    );
    // A draft is not a submission, so the window is still movable.
    await expect(
      overrideCycleWindow(teacher.id, cycle.id, {
        openAt: new Date("2026-01-07T00:00:00Z"),
        deadlineAt: new Date("2026-01-11T00:00:00Z"),
      }),
    ).resolves.toBeTruthy();

    await submitResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: question.id, text: "real" }] },
      new Date("2026-01-08T00:00:00Z"),
    );
    await expect(
      overrideCycleWindow(teacher.id, cycle.id, {
        openAt: new Date("2026-01-09T00:00:00Z"),
        deadlineAt: new Date("2026-01-12T00:00:00Z"),
      }),
    ).rejects.toThrow(/already has a submission/);
  });

  it("refuses a staff member without manage_weekly_cycles", async () => {
    const { cycle } = await openCycle();
    const outsider = await makeUser({ isTeacher: true });
    await expect(
      overrideCycleWindow(outsider.id, cycle.id, {
        openAt: new Date("2026-01-07T00:00:00Z"),
        deadlineAt: new Date("2026-01-11T00:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(AuthzError);
  });
});
