import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  makeCourse,
  makeEnrolledStudent,
  makeSchedule,
  makeSection,
  makeUser,
} from "./fixtures";
import { formInstances, formQuestions } from "@/db/schema";
import {
  createTemplate,
  createTemplateVersion,
} from "@/modules/forms/templates";
import {
  closeDueCycles,
  generateCyclesForSchedule,
  openDueCycles,
} from "@/modules/forms/cycles";
import { submitResponse, SubmissionError } from "@/modules/forms/submission";
import { reconcile } from "@/modules/scheduling";

const TZ = "Asia/Manila";

async function setupSectionWithSchedule() {
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
      {
        prompt: "Rate the lecture",
        type: "linear_scale",
        required: false,
        displayOrder: 1,
        scale: { min: 1, max: 5, step: 1 },
      },
    ],
  });
  const schedule = await makeSchedule({
    courseId: course.id,
    sectionIds: [section.id],
    templateId: template.id,
    occurrenceCount: 4,
    timezone: TZ,
  });
  return { teacher, course, section, template, schedule };
}

describe("weekly cycles + template snapshots", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("generates cycles idempotently (unique constraint, double-run safe)", async () => {
    const { schedule } = await setupSectionWithSchedule();
    const now = new Date("2026-01-20T00:00:00Z");
    const first = await generateCyclesForSchedule(schedule, now);
    expect(first).toBeGreaterThan(0);
    const second = await generateCyclesForSchedule(schedule, now);
    expect(second).toBe(0);

    const cycles = await db.query.formInstances.findMany({
      where: eq(formInstances.scheduleId, schedule.id),
    });
    const indexes = cycles.map((c) => c.cycleIndex).sort();
    expect(new Set(indexes).size).toBe(indexes.length);
  });

  it("snapshots template questions into cycles; later template edits do not change them", async () => {
    const { teacher, template, schedule } = await setupSectionWithSchedule();
    // Horizon covers only week 1 — cycle 2 must not exist before the edit.
    await generateCyclesForSchedule(schedule, new Date("2025-12-23T00:00:00Z"));
    const cycle = (await db.query.formInstances.findFirst({
      where: eq(formInstances.scheduleId, schedule.id),
    }))!;
    const before = await db.query.formQuestions.findMany({
      where: eq(formQuestions.cycleId, cycle.id),
    });
    expect(before).toHaveLength(2);

    // Edit the template → NEW version; existing cycle untouched.
    await createTemplateVersion(teacher.id, template.id, [
      {
        prompt: "Completely different question",
        type: "paragraph",
        required: true,
        displayOrder: 0,
      },
    ]);
    const after = await db.query.formQuestions.findMany({
      where: eq(formQuestions.cycleId, cycle.id),
    });
    expect(after.map((quest) => quest.prompt).sort()).toEqual(
      before.map((quest) => quest.prompt).sort(),
    );

    // But a newly generated cycle uses the new version.
    await generateCyclesForSchedule(schedule, new Date("2026-01-13T00:00:00Z"));
    const cycle2 = (await db.query.formInstances.findFirst({
      where: and(
        eq(formInstances.scheduleId, schedule.id),
        eq(formInstances.cycleIndex, 2),
      ),
    }))!;
    const q2 = await db.query.formQuestions.findMany({
      where: eq(formQuestions.cycleId, cycle2.id),
    });
    expect(q2).toHaveLength(1);
    expect(q2[0]!.prompt).toBe("Completely different question");
  });

  it("open/close transitions are idempotent and time-guarded", async () => {
    const { schedule } = await setupSectionWithSchedule();
    await generateCyclesForSchedule(schedule, new Date("2026-01-06T00:00:00Z"));

    // Before open time: nothing opens.
    expect(await openDueCycles(new Date("2026-01-04T00:00:00Z"))).toBe(0);
    // After open time: opens exactly once.
    const afterOpen = new Date("2026-01-05T01:00:00Z"); // 09:00 Manila
    expect(await openDueCycles(afterOpen)).toBe(1);
    expect(await openDueCycles(afterOpen)).toBe(0);
    // After deadline: closes exactly once.
    const afterDeadline = new Date("2026-01-09T10:00:00Z"); // 18:00 Manila Friday
    expect(await closeDueCycles(afterDeadline)).toBe(1);
    expect(await closeDueCycles(afterDeadline)).toBe(0);
  });

  it("reconcile() catches up after scheduler downtime (generate + open + close in one sweep)", async () => {
    await setupSectionWithSchedule();
    // Scheduler "was down" until after week 1's deadline: one sweep should
    // generate cycles, open due ones, and close the past-deadline one.
    const result = await reconcile(new Date("2026-01-12T02:00:00Z"));
    expect(result.cyclesGenerated).toBeGreaterThanOrEqual(2);
    // week 1 opened AND closed; week 2 open (Mon 10:00 Manila)
    const cycles = await db.query.formInstances.findMany();
    const byIndex = new Map(cycles.map((c) => [c.cycleIndex, c.state]));
    expect(byIndex.get(1)).toBe("closed");
    expect(byIndex.get(2)).toBe("open");
  });
});

describe("submission rules", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function openCycleWithStudent() {
    const fixtures = await setupSectionWithSchedule();
    await generateCyclesForSchedule(
      fixtures.schedule,
      new Date("2026-01-06T00:00:00Z"),
    );
    await openDueCycles(new Date("2026-01-05T01:00:00Z"));
    const cycle = (await db.query.formInstances.findFirst({
      where: and(
        eq(formInstances.scheduleId, fixtures.schedule.id),
        eq(formInstances.state, "open"),
      ),
    }))!;
    const questions = await db.query.formQuestions.findMany({
      where: eq(formQuestions.cycleId, cycle.id),
    });
    const student = await makeEnrolledStudent(fixtures.section.id);
    return { ...fixtures, cycle, questions, student };
  }

  const inWindow = new Date("2026-01-06T04:00:00Z");

  it("accepts a valid submission and defaults validity to valid", async () => {
    const { cycle, questions, student } = await openCycleWithStudent();
    const required = questions.find((q) => q.required)!;
    const { responseId, studentItemId } = await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [{ questionId: required.id, text: "Good pace" }],
        studentItem: {
          submissionType: "question",
          category: "content",
          text: "Can you explain recursion again?",
        },
      },
      inWindow,
    );
    expect(responseId).toBeTruthy();
    expect(studentItemId).toBeTruthy();
    const response = await db.query.formResponses.findFirst();
    expect(response!.validity).toBe("valid");
    expect(response!.state).toBe("submitted");
  });

  /**
   * docs/product/specification.md §6.3 step 4 now allows editing until the deadline, so a
   * second submit is an EDIT of the same response, not a duplicate. The rule that
   * matters — one response per student per cycle — is asserted directly.
   */
  it("treats a second submission as an edit of the same response, never a duplicate", async () => {
    const { cycle, questions, student } = await openCycleWithStudent();
    const required = questions.find((q) => q.required)!;
    const first = await submitResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: required.id, text: "first" }] },
      inWindow,
    );
    const second = await submitResponse(
      student.user.id,
      cycle.id,
      { answers: [{ questionId: required.id, text: "second" }] },
      new Date(inWindow.getTime() + 60_000),
    );

    expect(second.responseId).toBe(first.responseId);
    expect(second.firstSubmission).toBe(false);
    expect(second.revision).toBeGreaterThan(first.revision);

    const all = await db.query.formResponses.findMany();
    expect(all).toHaveLength(1);
    // The participation anchor never moves, so an edit cannot mint a second credit.
    expect(all[0]!.submittedAt!.getTime()).toBe(inWindow.getTime());
    expect(all[0]!.lastEditedAt).not.toBeNull();

    const answers = await db.query.questionAnswers.findMany();
    expect(answers).toHaveLength(1);
    expect(answers[0]!.freeText).toBe("second");
  });

  it("rejects submissions missing required answers", async () => {
    const { cycle, student } = await openCycleWithStudent();
    await expect(
      submitResponse(student.user.id, cycle.id, { answers: [] }, inWindow),
    ).rejects.toBeInstanceOf(SubmissionError);
  });

  it("rejects submissions after the deadline even if the cycle is still open", async () => {
    const { cycle, questions, student } = await openCycleWithStudent();
    const required = questions.find((q) => q.required)!;
    const lateTime = new Date("2026-01-09T09:30:00Z"); // 17:30 Manila Friday
    await expect(
      submitResponse(
        student.user.id,
        cycle.id,
        { answers: [{ questionId: required.id, text: "late" }] },
        lateTime,
      ),
    ).rejects.toThrow(/deadline/);
  });

  it("rejects submissions from unenrolled users", async () => {
    const { cycle, questions } = await openCycleWithStudent();
    const outsider = await makeUser();
    const required = questions.find((q) => q.required)!;
    await expect(
      submitResponse(
        outsider.id,
        cycle.id,
        { answers: [{ questionId: required.id, text: "hi" }] },
        inWindow,
      ),
    ).rejects.toThrow();
  });
});
