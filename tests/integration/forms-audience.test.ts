import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  linkRosterEmail,
  enroll,
  makeCourse,
  makeEnrolledStudent,
  makeSection,
  makeStudentRecord,
  makeUser,
} from "./fixtures";
import {
  formInstanceSections,
  formInstances,
  formQuestions,
  formResponses,
  publicAnswers,
} from "@/db/schema";
import { createTemplate } from "@/modules/forms/templates";
import { configureDelivery } from "@/modules/forms/schedules";
import { generateInstancesForSchedule, openDueCycles } from "@/modules/forms/cycles";
import { submitResponse } from "@/modules/forms/submission";
import { getCourseReviewQueue, getReviewQueue } from "@/modules/review";
import { draftPublicAnswer, listSectionQa, publishNow } from "@/modules/publishing";
import { listCourseForms } from "@/modules/forms/instances";
import { AuthzError } from "@/modules/authz";
import { deriveParticipation } from "@/modules/participation";

/**
 * Audience behaviour: a form that belongs to a COURSE and goes to one section,
 * several, or all of them.
 *
 * The rules under test are the load-bearing ones:
 * - students in different targeted sections answer the SAME instance;
 * - a student in two targeted sections cannot produce two responses;
 * - staff see only their own sections' responses, even on a shared form;
 * - a publication never crosses a section boundary.
 */

const START = "2026-01-05"; // a Monday
const IN_WINDOW = new Date("2026-01-06T04:00:00Z"); // Tue 12:00 Manila
const GENERATE_AT = new Date("2026-01-05T00:00:00Z");
const OPEN_AT = new Date("2026-01-05T01:00:00Z"); // Mon 09:00 Manila

async function makeCourseWithSections(count = 2) {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const sections = [];
  for (let i = 0; i < count; i++) {
    // Titles are deliberately ordered: audience order and response attribution
    // are both (title, id), so the tests can assert a deterministic outcome.
    const section = await makeSection(course.id);
    await db
      .update((await import("@/db/schema")).classSections)
      .set({ title: `Section ${String.fromCharCode(65 + i)}` })
      .where(eq((await import("@/db/schema")).classSections.id, section.id));
    await addSectionStaff(section.id, teacher.id, "teacher");
    sections.push({ ...section, title: `Section ${String.fromCharCode(65 + i)}` });
  }
  return { teacher, course, sections };
}

async function makeForm(teacherId: string, courseId: string, title = "Weekly feedback") {
  const { template } = await createTemplate(teacherId, {
    courseId,
    title,
    questions: [
      {
        prompt: "How was the pace this week?",
        type: "short_answer",
        required: true,
        displayOrder: 0,
      },
    ],
  });
  return template;
}

/** Open one instance of a weekly form with the given audience. */
async function openWeeklyForm(
  teacherId: string,
  courseId: string,
  audience:
    | { mode: "all_sections" }
    | { mode: "selected_sections"; sectionIds: string[] },
  templateId: string,
) {
  const { schedule } = await configureDelivery(teacherId, courseId, {
    templateId,
    deliveryMode: "weekly",
    audienceMode: audience.mode,
    sectionIds: audience.mode === "selected_sections" ? audience.sectionIds : [],
    openDayOfWeek: 1,
    openTime: "08:00",
    deadlineDayOfWeek: 5,
    deadlineTime: "17:00",
    startDate: START,
    occurrenceCount: 1,
  });
  await generateInstancesForSchedule(schedule, GENERATE_AT);
  await openDueCycles(OPEN_AT);
  const instance = (await db.query.formInstances.findFirst({
    where: and(
      eq(formInstances.scheduleId, schedule.id),
      eq(formInstances.state, "open"),
    ),
  }))!;
  const question = (await db.query.formQuestions.findFirst({
    where: eq(formQuestions.cycleId, instance.id),
  }))!;
  return { schedule, instance, question };
}

describe("form audiences", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("targets every section of the course, and each one receives the same instance", async () => {
    const { teacher, course, sections } = await makeCourseWithSections(3);
    const template = await makeForm(teacher.id, course.id);
    const { instance } = await openWeeklyForm(
      teacher.id,
      course.id,
      { mode: "all_sections" },
      template.id,
    );

    const audience = await db.query.formInstanceSections.findMany({
      where: eq(formInstanceSections.instanceId, instance.id),
    });
    expect(audience.map((a) => a.sectionId).sort()).toEqual(
      sections.map((s) => s.id).sort(),
    );
    // ONE instance, not one per section: that is the point of a shared form.
    const all = await db.query.formInstances.findMany();
    expect(all).toHaveLength(1);
  });

  it("targets only one section when told to", async () => {
    const { teacher, course, sections } = await makeCourseWithSections(2);
    const template = await makeForm(teacher.id, course.id);
    const { instance } = await openWeeklyForm(
      teacher.id,
      course.id,
      { mode: "selected_sections", sectionIds: [sections[0]!.id] },
      template.id,
    );
    const audience = await db.query.formInstanceSections.findMany({
      where: eq(formInstanceSections.instanceId, instance.id),
    });
    expect(audience.map((a) => a.sectionId)).toEqual([sections[0]!.id]);

    // A student of the untargeted section cannot reach it.
    const outsider = await makeEnrolledStudent(sections[1]!.id);
    await expect(
      submitResponse(
        outsider.user.id,
        instance.id,
        { answers: [] },
        IN_WINDOW,
      ),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("lets students in two targeted sections submit to the same instance, and aggregates the count", async () => {
    const { teacher, course, sections } = await makeCourseWithSections(2);
    const template = await makeForm(teacher.id, course.id);
    const { instance, question } = await openWeeklyForm(
      teacher.id,
      course.id,
      { mode: "selected_sections", sectionIds: [sections[0]!.id, sections[1]!.id] },
      template.id,
    );

    const a = await makeEnrolledStudent(sections[0]!.id);
    const b = await makeEnrolledStudent(sections[1]!.id);
    await submitResponse(
      a.user.id,
      instance.id,
      { answers: [{ questionId: question.id, text: "fine in A" }] },
      IN_WINDOW,
    );
    await submitResponse(
      b.user.id,
      instance.id,
      { answers: [{ questionId: question.id, text: "fine in B" }] },
      IN_WINDOW,
    );

    const responses = await db.query.formResponses.findMany({
      where: eq(formResponses.cycleId, instance.id),
    });
    expect(responses).toHaveLength(2);
    // Each response is attributed to the section its author answered through.
    expect(responses.map((r) => r.sectionId).sort()).toEqual(
      [sections[0]!.id, sections[1]!.id].sort(),
    );

    // The teacher, who runs both sections, sees an aggregated count.
    const queue = await getCourseReviewQueue(teacher.id, course.id);
    expect(queue.counts.total).toBe(2);
    const forms = await listCourseForms(teacher.id, course.id);
    expect(forms[0]!.responseCount).toBe(2);
  });

  it("filters the aggregated inbox by section without leaking the other one", async () => {
    const { teacher, course, sections } = await makeCourseWithSections(2);
    const template = await makeForm(teacher.id, course.id);
    const { instance, question } = await openWeeklyForm(
      teacher.id,
      course.id,
      { mode: "all_sections" },
      template.id,
    );
    const a = await makeEnrolledStudent(sections[0]!.id);
    const b = await makeEnrolledStudent(sections[1]!.id);
    await submitResponse(
      a.user.id,
      instance.id,
      { answers: [{ questionId: question.id, text: "from A" }] },
      IN_WINDOW,
    );
    await submitResponse(
      b.user.id,
      instance.id,
      { answers: [{ questionId: question.id, text: "from B" }] },
      IN_WINDOW,
    );

    const onlyA = await getCourseReviewQueue(teacher.id, course.id, {
      sectionId: sections[0]!.id,
    });
    expect(onlyA.counts.total).toBe(1);
    expect(onlyA.rows[0]!.response.sectionId).toBe(sections[0]!.id);

    const onlyB = await getCourseReviewQueue(teacher.id, course.id, {
      sectionId: sections[1]!.id,
    });
    expect(onlyB.counts.total).toBe(1);
    expect(onlyB.rows[0]!.response.sectionId).toBe(sections[1]!.id);
  });

  it("shows a section-scoped assistant only their own section's responses on a shared form", async () => {
    const { teacher, course, sections } = await makeCourseWithSections(2);
    const template = await makeForm(teacher.id, course.id);
    const { instance, question } = await openWeeklyForm(
      teacher.id,
      course.id,
      { mode: "all_sections" },
      template.id,
    );
    const a = await makeEnrolledStudent(sections[0]!.id);
    const b = await makeEnrolledStudent(sections[1]!.id);
    await submitResponse(
      a.user.id,
      instance.id,
      { answers: [{ questionId: question.id, text: "from A" }] },
      IN_WINDOW,
    );
    await submitResponse(
      b.user.id,
      instance.id,
      { answers: [{ questionId: question.id, text: "from B" }] },
      IN_WINDOW,
    );

    // A TA on Section A only, with review permission there and nowhere else.
    const ta = await makeUser();
    await addSectionStaff(sections[0]!.id, ta.id, "ta", {
      reviewResponses: true,
    });

    const queue = await getReviewQueue(ta.id, sections[0]!.id);
    expect(queue.counts.total).toBe(1);
    expect(queue.rows[0]!.response.sectionId).toBe(sections[0]!.id);
    // Not even the aggregate leaks: the count is over the TA's slice only.
    expect(
      queue.rows.every((r) => r.response.sectionId === sections[0]!.id),
    ).toBe(true);

    // And Section B is refused outright.
    await expect(getReviewQueue(ta.id, sections[1]!.id)).rejects.toBeInstanceOf(
      AuthzError,
    );
  });

  it("cannot produce two responses for a student enrolled in two targeted sections", async () => {
    const { teacher, course, sections } = await makeCourseWithSections(2);
    const template = await makeForm(teacher.id, course.id);
    const { instance, question } = await openWeeklyForm(
      teacher.id,
      course.id,
      { mode: "all_sections" },
      template.id,
    );

    // ONE student record, enrolled in BOTH targeted sections.
    const user = await makeUser({ displayName: "Double Enrolled" });
    const record = await makeStudentRecord("Double Enrolled");
    await linkRosterEmail(user.id, record.id);
    await enroll(sections[0]!.id, record.id);
    await enroll(sections[1]!.id, record.id);

    const first = await submitResponse(
      user.id,
      instance.id,
      { answers: [{ questionId: question.id, text: "once" }] },
      IN_WINDOW,
    );
    const second = await submitResponse(
      user.id,
      instance.id,
      { answers: [{ questionId: question.id, text: "twice" }] },
      new Date(IN_WINDOW.getTime() + 60_000),
    );
    // The second submit is an EDIT of the same row, never a second response.
    expect(second.responseId).toBe(first.responseId);

    const responses = await db.query.formResponses.findMany({
      where: eq(formResponses.cycleId, instance.id),
    });
    expect(responses).toHaveLength(1);
    // Attributed deterministically to the first audience section by title.
    expect(responses[0]!.sectionId).toBe(sections[0]!.id);

    // Participation counts it once in its own section and not at all in the other.
    const inA = await deriveParticipation(sections[0]!.id);
    const inB = await deriveParticipation(sections[1]!.id);
    expect(
      inA.students.find((s) => s.studentRecordId === record.id)!.totalWeeks,
    ).toBe(1);
    expect(
      inB.students.find((s) => s.studentRecordId === record.id)!.totalWeeks,
    ).toBe(0);
  });

  it("keeps a published answer inside the asker's own section", async () => {
    const { teacher, course, sections } = await makeCourseWithSections(2);
    const template = await makeForm(teacher.id, course.id);
    const { instance, question } = await openWeeklyForm(
      teacher.id,
      course.id,
      { mode: "all_sections" },
      template.id,
    );
    const a = await makeEnrolledStudent(sections[0]!.id);
    const b = await makeEnrolledStudent(sections[1]!.id);
    const asked = await submitResponse(
      a.user.id,
      instance.id,
      {
        answers: [{ questionId: question.id, text: "ok" }],
        studentItem: {
          submissionType: "question",
          category: "content",
          text: "Can you go over normalization again?",
        },
      },
      IN_WINDOW,
    );

    const answer = await draftPublicAnswer(teacher.id, {
      sectionId: sections[0]!.id,
      itemIds: [asked.studentItemId!],
      publicQuestionText: "Could we revisit normalization?",
      answerBody: "Yes — Thursday's session covers it again.",
    });
    expect(answer.sectionId).toBe(sections[0]!.id);

    // Publishing the SAME item into the other section is refused, even though
    // the form instance was shared with it.
    await expect(
      draftPublicAnswer(teacher.id, {
        sectionId: sections[1]!.id,
        itemIds: [asked.studentItemId!],
        publicQuestionText: "Could we revisit normalization?",
      }),
    ).rejects.toThrow(/same class section/);

    const rows = await db.query.publicAnswers.findMany({
      where: inArray(publicAnswers.sectionId, [
        sections[0]!.id,
        sections[1]!.id,
      ]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sectionId).toBe(sections[0]!.id);

    // Published for real, then checked from both sides of the boundary.
    await publishNow(teacher.id, answer.id, { anonymityAcknowledged: true });
    const archiveA = await listSectionQa(a.user.id, sections[0]!.id);
    const archiveB = await listSectionQa(b.user.id, sections[1]!.id);
    expect(archiveA).toHaveLength(1);
    // The other section's student sees nothing of it, even though they answered
    // the same form.
    expect(archiveB).toHaveLength(0);
  });
});
