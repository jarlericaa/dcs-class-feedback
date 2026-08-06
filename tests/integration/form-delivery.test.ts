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
import { formInstances, formQuestions } from "@/db/schema";
import { createTemplate } from "@/modules/forms/templates";
import {
  configureDelivery,
  ScheduleError,
} from "@/modules/forms/schedules";
import {
  closeDueCycles,
  generateInstancesForSchedule,
  openDueCycles,
} from "@/modules/forms/cycles";
import {
  closeInstanceNow,
  createManualInstance,
  instanceLabel,
  openInstanceNow,
} from "@/modules/forms/instances";
import { submitResponse } from "@/modules/forms/submission";
import { reconcile } from "@/modules/scheduling";

/**
 * The four delivery modes, and the promise that old weekly data keeps working.
 *
 * `weekly` is one mode among four; nothing here should read as though it were the
 * shape of the product, and a one-time form must never be labelled "Week 1".
 */

const START = "2026-01-05"; // a Monday

async function workspace() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  await addSectionStaff(section.id, teacher.id, "teacher");
  const { template } = await createTemplate(teacher.id, {
    courseId: course.id,
    title: "Feedback",
    questions: [
      { prompt: "Pace?", type: "short_answer", required: true, displayOrder: 0 },
    ],
  });
  return { teacher, course, section, template };
}

describe("delivery modes", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("a one-time LE form produces exactly one occurrence, with no week number", async () => {
    const { teacher, course, section, template } = await workspace();
    const { schedule, instancesGenerated } = await configureDelivery(
      teacher.id,
      course.id,
      {
        templateId: template.id,
        deliveryMode: "one_time",
        audienceMode: "selected_sections",
        sectionIds: [section.id],
        openDate: "2026-03-02",
        openAtTime: "08:00",
        deadlineDate: "2026-03-06",
        deadlineAtTime: "23:59",
      },
    );
    expect(schedule.deliveryMode).toBe("one_time");
    // Saving materializes it (its window is already inside the horizon), and
    // re-running never produces a second one.
    expect(instancesGenerated).toBe(1);
    expect(
      await generateInstancesForSchedule(
        schedule,
        new Date("2026-03-05T00:00:00Z"),
      ),
    ).toBe(0);

    const instances = await db.query.formInstances.findMany({
      where: eq(formInstances.scheduleId, schedule.id),
    });
    expect(instances).toHaveLength(1);
    expect(instances[0]!.deliveryMode).toBe("one_time");
    // The label a teacher and a student see: not "Week 1".
    expect(instanceLabel(instances[0]!)).toBe("This form");
    expect(instanceLabel(instances[0]!)).not.toMatch(/week/i);
  });

  it("a weekly form produces one occurrence per week", async () => {
    const { teacher, course, section, template } = await workspace();
    const { schedule } = await configureDelivery(teacher.id, course.id, {
      templateId: template.id,
      deliveryMode: "weekly",
      audienceMode: "selected_sections",
      sectionIds: [section.id],
      openDayOfWeek: 1,
      openTime: "08:00",
      deadlineDayOfWeek: 5,
      deadlineTime: "17:00",
      startDate: START,
      occurrenceCount: 4,
    });
    await generateInstancesForSchedule(schedule, new Date("2026-02-01T00:00:00Z"));
    const instances = await db.query.formInstances.findMany({
      where: eq(formInstances.scheduleId, schedule.id),
      orderBy: (t, { asc }) => [asc(t.cycleIndex)],
    });
    expect(instances).toHaveLength(4);
    // Seven days apart.
    const gaps = instances
      .slice(1)
      .map((c, i) => c.openAt.getTime() - instances[i]!.openAt.getTime());
    expect(gaps.every((g) => g === 7 * 24 * 3600 * 1000)).toBe(true);
    expect(instanceLabel(instances[2]!)).toBe("Week 3");
  });

  it("a custom schedule repeats every N weeks and refuses N of 1", async () => {
    const { teacher, course, section, template } = await workspace();
    const { schedule } = await configureDelivery(teacher.id, course.id, {
      templateId: template.id,
      deliveryMode: "custom_recurring",
      audienceMode: "selected_sections",
      sectionIds: [section.id],
      intervalWeeks: 3,
      openDayOfWeek: 1,
      openTime: "08:00",
      deadlineDayOfWeek: 5,
      deadlineTime: "17:00",
      startDate: START,
      occurrenceCount: 3,
    });
    await generateInstancesForSchedule(schedule, new Date("2026-04-01T00:00:00Z"));
    const instances = await db.query.formInstances.findMany({
      where: eq(formInstances.scheduleId, schedule.id),
      orderBy: (t, { asc }) => [asc(t.cycleIndex)],
    });
    expect(instances).toHaveLength(3);
    expect(
      instances[1]!.openAt.getTime() - instances[0]!.openAt.getTime(),
    ).toBe(21 * 24 * 3600 * 1000);
    expect(instanceLabel(instances[1]!)).toBe("Occurrence 2");

    // "Every 1 week" is `weekly`; a custom schedule claiming it is refused
    // rather than silently becoming a duplicate of the simpler mode.
    await expect(
      configureDelivery(teacher.id, course.id, {
        templateId: template.id,
        deliveryMode: "custom_recurring",
        audienceMode: "selected_sections",
        sectionIds: [section.id],
        intervalWeeks: 1,
        openDayOfWeek: 1,
        openTime: "08:00",
        deadlineDayOfWeek: 5,
        deadlineTime: "17:00",
        startDate: START,
        occurrenceCount: 3,
      }),
    ).rejects.toBeInstanceOf(ScheduleError);
  });

  it("a manual form opens and closes only when a person says so", async () => {
    const { teacher, course, section, template } = await workspace();
    const { schedule, instancesGenerated } = await configureDelivery(
      teacher.id,
      course.id,
      {
        templateId: template.id,
        deliveryMode: "manual",
        audienceMode: "selected_sections",
        sectionIds: [section.id],
      },
    );
    // Nothing is generated, and nothing ever will be by the scheduler.
    expect(instancesGenerated).toBe(0);
    expect(
      await generateInstancesForSchedule(schedule, new Date("2026-06-01T00:00:00Z")),
    ).toBe(0);

    const now = new Date("2026-01-06T04:00:00Z");
    const instance = await createManualInstance(
      teacher.id,
      course.id,
      {
        templateId: template.id,
        audienceMode: "selected_sections",
        sectionIds: [section.id],
        title: "LE 1 feedback",
        deadlineDate: "2026-01-09",
        deadlineTime: "23:59",
      },
      now,
    );
    expect(instance.state).toBe("draft");
    expect(instanceLabel(instance)).toBe("LE 1 feedback");

    // The scheduler leaves a draft manual form alone even once its openAt passed.
    expect(await openDueCycles(new Date("2026-01-07T00:00:00Z"))).toBe(0);
    const stillDraft = (await db.query.formInstances.findFirst({
      where: eq(formInstances.id, instance.id),
    }))!;
    expect(stillDraft.state).toBe("draft");

    // A student cannot submit to it while it is a draft.
    const student = await makeEnrolledStudent(section.id, teacher.id);
    const question = (await db.query.formQuestions.findFirst({
      where: eq(formQuestions.cycleId, instance.id),
    }))!;
    await expect(
      submitResponse(
        student.user.id,
        instance.id,
        { answers: [{ questionId: question.id, text: "early" }] },
        now,
      ),
    ).rejects.toThrow(/not open/);

    await openInstanceNow(teacher.id, instance.id, now);
    const opened = (await db.query.formInstances.findFirst({
      where: eq(formInstances.id, instance.id),
    }))!;
    expect(opened.state).toBe("open");

    await submitResponse(
      student.user.id,
      instance.id,
      { answers: [{ questionId: question.id, text: "fine" }] },
      new Date(now.getTime() + 60_000),
    );

    // Closing early locks what came in, exactly as the deadline would.
    await closeInstanceNow(
      teacher.id,
      instance.id,
      new Date(now.getTime() + 120_000),
    );
    const closed = (await db.query.formInstances.findFirst({
      where: eq(formInstances.id, instance.id),
    }))!;
    expect(closed.state).toBe("closed");
    const response = (await db.query.formResponses.findFirst())!;
    expect(response.lifecycle).toBe("locked");
  });

  it("a one-time and a weekly form coexist in one course", async () => {
    const { teacher, course, template } = await workspace();
    const { template: le } = await createTemplate(teacher.id, {
      courseId: course.id,
      title: "LE 1 feedback",
      purpose: "Long exam",
      questions: [
        {
          prompt: "Was the exam length fair?",
          type: "yes_no",
          required: true,
          displayOrder: 0,
        },
      ],
    });

    const weekly = await configureDelivery(teacher.id, course.id, {
      templateId: template.id,
      deliveryMode: "weekly",
      audienceMode: "all_sections",
      sectionIds: [],
      openDayOfWeek: 1,
      openTime: "08:00",
      deadlineDayOfWeek: 5,
      deadlineTime: "17:00",
      startDate: START,
      occurrenceCount: 2,
    });
    const oneTime = await configureDelivery(teacher.id, course.id, {
      templateId: le.id,
      deliveryMode: "one_time",
      audienceMode: "all_sections",
      sectionIds: [],
      openDate: "2026-01-12",
      openAtTime: "08:00",
      deadlineDate: "2026-01-16",
      deadlineAtTime: "23:59",
    });

    // Both schedules stay active: replacing one must not retire the other, which
    // is why retirement is keyed on the FORM rather than on the section.
    expect(weekly.schedule.active).toBe(true);
    const reloaded = (await db.query.recurrenceSchedules.findFirst({
      where: eq(
        (await import("@/db/schema")).recurrenceSchedules.id,
        weekly.schedule.id,
      ),
    }))!;
    expect(reloaded.active).toBe(true);
    expect(oneTime.schedule.active).toBe(true);

    await generateInstancesForSchedule(
      weekly.schedule,
      new Date("2026-01-20T00:00:00Z"),
    );
    await generateInstancesForSchedule(
      oneTime.schedule,
      new Date("2026-01-20T00:00:00Z"),
    );
    const instances = await db.query.formInstances.findMany();
    const labels = instances.map((i) => instanceLabel(i)).sort();
    expect(labels).toContain("Week 1");
    expect(labels).toContain("This form");
    // Nothing anywhere calls the LE form a week.
    expect(
      instances
        .filter((i) => i.deliveryMode === "one_time")
        .every((i) => !/week/i.test(instanceLabel(i))),
    ).toBe(true);
  });

  it("old per-section weekly data keeps generating, opening, closing, and accepting answers", async () => {
    // A schedule shaped like a pre-migration one: weekly, one section, no course
    // audience beyond it. This is the regression guard for the compatibility
    // promise in docs/FORMS-AUDIENCE-DYNAMIC-INSTANCES.md §6.2.
    const { teacher, course, section, template } = await workspace();
    const schedule = await makeSchedule({
      courseId: course.id,
      sectionIds: [section.id],
      templateId: template.id,
      occurrenceCount: 2,
      startDate: START,
    });

    const result = await reconcile(new Date("2026-01-12T02:00:00Z"));
    expect(result.cyclesGenerated).toBeGreaterThanOrEqual(2);
    const byIndex = new Map(
      (
        await db.query.formInstances.findMany({
          where: eq(formInstances.scheduleId, schedule.id),
        })
      ).map((c) => [c.cycleIndex, c]),
    );
    expect(byIndex.get(1)!.state).toBe("closed");
    expect(byIndex.get(2)!.state).toBe("open");

    const student = await makeEnrolledStudent(section.id, teacher.id);
    const open = byIndex.get(2)!;
    const question = (await db.query.formQuestions.findFirst({
      where: eq(formQuestions.cycleId, open.id),
    }))!;
    const saved = await submitResponse(
      student.user.id,
      open.id,
      { answers: [{ questionId: question.id, text: "still works" }] },
      new Date("2026-01-13T04:00:00Z"),
    );
    expect(saved.responseId).toBeTruthy();
    const response = (await db.query.formResponses.findFirst())!;
    // Backfilled behaviour: the response is attributed to its one section.
    expect(response.sectionId).toBe(section.id);

    expect(await closeDueCycles(new Date("2026-01-16T10:00:00Z"))).toBe(1);
  });

  it("refuses a schedule whose sections are in different timezones", async () => {
    const { teacher, course, section, template } = await workspace();
    const other = await makeSection(course.id);
    await addSectionStaff(other.id, teacher.id, "teacher");
    await db
      .update((await import("@/db/schema")).classSections)
      .set({ timezone: "Asia/Tokyo" })
      .where(eq((await import("@/db/schema")).classSections.id, other.id));

    await expect(
      configureDelivery(teacher.id, course.id, {
        templateId: template.id,
        deliveryMode: "weekly",
        audienceMode: "selected_sections",
        sectionIds: [section.id, other.id],
        openDayOfWeek: 1,
        openTime: "08:00",
        deadlineDayOfWeek: 5,
        deadlineTime: "17:00",
        startDate: START,
        occurrenceCount: 1,
      }),
    ).rejects.toThrow(/timezone/);
  });

  it("refuses to deliver into a section the actor does not run", async () => {
    const { course, section, template } = await workspace();
    const other = await makeSection(course.id);
    // A co-teacher who runs only `section`, and is not course staff.
    const coTeacher = await makeUser();
    await addSectionStaff(section.id, coTeacher.id, "co_teacher");

    await expect(
      configureDelivery(coTeacher.id, course.id, {
        templateId: template.id,
        deliveryMode: "weekly",
        audienceMode: "selected_sections",
        sectionIds: [section.id, other.id],
        openDayOfWeek: 1,
        openTime: "08:00",
        deadlineDayOfWeek: 5,
        deadlineTime: "17:00",
        startDate: START,
        occurrenceCount: 1,
      }),
    ).rejects.toThrow();
  });
});
