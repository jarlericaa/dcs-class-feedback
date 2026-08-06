import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  makeCourse,
  makeEnrolledStudent,
  makeSection,
  makeUser,
} from "./fixtures";
import { classSections, formInstances, formQuestions } from "@/db/schema";
import { createTemplate } from "@/modules/forms/templates";
import { configureDelivery } from "@/modules/forms/schedules";
import { generateInstancesForSchedule, openDueCycles } from "@/modules/forms/cycles";
import {
  getStudentFormStateForInstance,
  listOpenInstancesForStudent,
  submitResponse,
} from "@/modules/forms/submission";
import { getStudentHistory } from "@/modules/publishing";
import { getOwnValidity } from "@/modules/review";
import { listCourseForms } from "@/modules/forms/instances";
import { AuthzError } from "@/modules/authz";

/**
 * What a shared form must NOT leak.
 *
 * Sharing one questionnaire across a course's sections aggregates the teacher's
 * work; it must not aggregate anybody's visibility. Every projection a student can
 * reach is checked for the audience, the other sections, and staff-only state.
 */

const START = "2026-01-05";
const IN_WINDOW = new Date("2026-01-06T04:00:00Z");

async function sharedForm() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const a = await makeSection(course.id);
  const b = await makeSection(course.id);
  await db
    .update(classSections)
    .set({ title: "Section A" })
    .where(eq(classSections.id, a.id));
  await db
    .update(classSections)
    .set({ title: "Section B" })
    .where(eq(classSections.id, b.id));
  await addSectionStaff(a.id, teacher.id, "teacher");
  await addSectionStaff(b.id, teacher.id, "teacher");

  const { template } = await createTemplate(teacher.id, {
    courseId: course.id,
    title: "Weekly feedback",
    questions: [
      { prompt: "Pace?", type: "short_answer", required: true, displayOrder: 0 },
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
  await generateInstancesForSchedule(schedule, new Date("2026-01-05T00:00:00Z"));
  await openDueCycles(new Date("2026-01-05T01:00:00Z"));
  const instance = (await db.query.formInstances.findFirst({
    where: eq(formInstances.scheduleId, schedule.id),
  }))!;
  const question = (await db.query.formQuestions.findFirst({
    where: eq(formQuestions.cycleId, instance.id),
  }))!;
  return { teacher, course, sectionA: a, sectionB: b, instance, question };
}

describe("shared-form privacy", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("the student projection carries no audience, no other section, and no counts", async () => {
    const { teacher, sectionA, instance } = await sharedForm();
    const student = await makeEnrolledStudent(sectionA.id, teacher.id);
    const state = (await getStudentFormStateForInstance(
      student.user.id,
      instance.id,
      IN_WINDOW,
    ))!;

    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("Section B");
    // The one section it names is their own, and only as an internal id plus a
    // label the page shows when it distinguishes something.
    expect(state.attributedSectionId).toBe(sectionA.id);
    expect(state.showSectionLabel).toBe(false);
    // Nothing about review, validity, or how many people answered.
    expect(serialized).not.toMatch(/needsReview|validity|invalidationNote/);
    expect(Object.keys(state)).not.toContain("responseCount");
  });

  it("a student outside the audience cannot open or submit the form", async () => {
    const { instance, question } = await sharedForm();
    // A section of a DIFFERENT course, so it was never in the audience.
    const otherTeacher = await makeUser({ isTeacher: true });
    const otherCourse = await makeCourse(otherTeacher.id);
    const otherSection = await makeSection(otherCourse.id);
    const outsider = await makeEnrolledStudent(otherSection.id, otherTeacher.id);

    await expect(
      getStudentFormStateForInstance(outsider.user.id, instance.id, IN_WINDOW),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      submitResponse(
        outsider.user.id,
        instance.id,
        { answers: [{ questionId: question.id, text: "sneaking in" }] },
        IN_WINDOW,
      ),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("a deactivated enrolment loses access even while the form is open", async () => {
    const { teacher, sectionA, instance, question } = await sharedForm();
    const student = await makeEnrolledStudent(sectionA.id, teacher.id);
    await db
      .update((await import("@/db/schema")).enrollments)
      .set({ status: "deactivated" })
      .where(
        eq(
          (await import("@/db/schema")).enrollments.studentRecordId,
          student.record.id,
        ),
      );
    await expect(
      submitResponse(
        student.user.id,
        instance.id,
        { answers: [{ questionId: question.id, text: "still here?" }] },
        IN_WINDOW,
      ),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("one student's history and own-validity view never reach into the other section", async () => {
    const { teacher, sectionA, sectionB, instance, question } =
      await sharedForm();
    const a = await makeEnrolledStudent(sectionA.id, teacher.id);
    const b = await makeEnrolledStudent(sectionB.id, teacher.id);
    await submitResponse(
      a.user.id,
      instance.id,
      {
        answers: [{ questionId: question.id, text: "A's answer" }],
        studentItem: {
          submissionType: "question",
          category: "content",
          text: "A's private question",
        },
      },
      IN_WINDOW,
    );
    await submitResponse(
      b.user.id,
      instance.id,
      {
        answers: [{ questionId: question.id, text: "B's answer" }],
        studentItem: {
          submissionType: "question",
          category: "content",
          text: "B's private question",
        },
      },
      IN_WINDOW,
    );

    const historyA = await getStudentHistory(a.user.id, sectionA.id);
    expect(historyA).toHaveLength(1);
    const serializedA = JSON.stringify(historyA);
    expect(serializedA).toContain("A's private question");
    expect(serializedA).not.toContain("B's");

    // A cannot even ask for B's section.
    await expect(
      getStudentHistory(a.user.id, sectionB.id),
    ).rejects.toBeInstanceOf(AuthzError);

    const validityA = await getOwnValidity(a.user.id, sectionA.id);
    expect(validityA.size).toBe(1);
    const entry = [...validityA.values()][0]!;
    // Only "does it count" and, if not, the one reason a human wrote for them.
    expect(Object.keys(entry).sort()).toEqual([
      "counted",
      "cycleId",
      "reason",
      "responseId",
    ]);
  });

  it("a form appears once for a student enrolled in two of its sections", async () => {
    const { teacher, sectionA, sectionB } = await sharedForm();
    const { confirmMatchDirect, enroll, makeStudentRecord } = await import(
      "./fixtures"
    );
    const user = await makeUser({ displayName: "Double Enrolled" });
    const record = await makeStudentRecord("Double Enrolled");
    await confirmMatchDirect(user.id, record.id, teacher.id);
    await enroll(sectionA.id, record.id);
    await enroll(sectionB.id, record.id);

    // Asked through EITHER section, it is the same single instance.
    const throughA = await listOpenInstancesForStudent(
      user.id,
      sectionA.id,
      IN_WINDOW,
    );
    const throughB = await listOpenInstancesForStudent(
      user.id,
      sectionB.id,
      IN_WINDOW,
    );
    expect(throughA).toHaveLength(1);
    expect(throughB).toHaveLength(1);
    expect(throughA[0]!.instance.id).toBe(throughB[0]!.instance.id);
  });

  it("unauthorized staff cannot read the course's forms at all", async () => {
    const { course } = await sharedForm();
    const stranger = await makeUser({ isTeacher: true });
    await expect(listCourseForms(stranger.id, course.id)).rejects.toBeInstanceOf(
      AuthzError,
    );
  });
});
