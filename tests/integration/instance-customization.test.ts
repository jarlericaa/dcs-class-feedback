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
import { auditEvents, formInstances, formQuestions } from "@/db/schema";
import { createTemplate } from "@/modules/forms/templates";
import { configureDelivery } from "@/modules/forms/schedules";
import { generateInstancesForSchedule } from "@/modules/forms/cycles";
import {
  customizeInstanceQuestions,
  getInstanceDetail,
  InstanceLockedError,
  previewInstance,
  restoreInstanceToBase,
  setInstanceFocus,
} from "@/modules/forms/instances";
import {
  getStudentFormStateForInstance,
  submitResponse,
} from "@/modules/forms/submission";
import { AuthzError } from "@/modules/authz";

/**
 * Per-occurrence question customization: the "Customize Week 4" case.
 *
 * The property every test here defends is the same one: an edit to ONE occurrence
 * touches that occurrence and nothing else — not the base form, not the weeks
 * before it, not the weeks after it, and not an answer anyone has already sent.
 */

const START = "2026-01-05"; // a Monday

async function weeklyCourse(weeks = 5) {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  await addSectionStaff(section.id, teacher.id, "teacher");
  const { template } = await createTemplate(teacher.id, {
    courseId: course.id,
    title: "Weekly feedback",
    questions: [
      {
        prompt: "How was the pace this week?",
        type: "short_answer",
        required: true,
        displayOrder: 0,
      },
      {
        prompt: "What should we revisit?",
        type: "paragraph",
        required: false,
        displayOrder: 1,
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
    occurrenceCount: weeks,
  });
  // A horizon well past the last week, so every occurrence exists to edit.
  await generateInstancesForSchedule(schedule, new Date("2026-03-01T00:00:00Z"));
  const instances = await db.query.formInstances.findMany({
    where: eq(formInstances.scheduleId, schedule.id),
    orderBy: (t, { asc }) => [asc(t.cycleIndex)],
  });
  return { teacher, course, section, template, schedule, instances };
}

async function questionsOf(instanceId: string) {
  return db.query.formQuestions.findMany({
    where: eq(formQuestions.cycleId, instanceId),
    orderBy: (t, { asc }) => [asc(t.displayOrder)],
  });
}

/** The editor's payload shape: existing rows carry their stableKey. */
function asPayload(rows: Awaited<ReturnType<typeof questionsOf>>) {
  return rows.map((q, index) => ({
    stableKey: q.stableKey,
    prompt: q.prompt,
    description: q.description ?? undefined,
    type: q.type,
    required: q.required,
    displayOrder: index,
    options: (q.options ?? undefined) as undefined,
    scale: (q.scale ?? undefined) as undefined,
  }));
}

describe("per-occurrence question customization", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("a generated occurrence inherits the base questions", async () => {
    const { teacher, instances } = await weeklyCourse();
    const week4 = instances[3]!;
    const questions = await questionsOf(week4.id);
    expect(questions.map((q) => q.prompt)).toEqual([
      "How was the pace this week?",
      "What should we revisit?",
    ]);
    expect(questions.every((q) => q.origin === "inherited")).toBe(true);

    const detail = await getInstanceDetail(teacher.id, week4.id);
    expect(detail.label).toBe("Week 4");
    expect(detail.customized).toBe(false);
  });

  it("adding a Week 4 question changes Week 4 and nothing else", async () => {
    const { teacher, template, instances } = await weeklyCourse();
    const [week1, , week3, week4, week5] = instances;
    const before = await questionsOf(week4!.id);

    await customizeInstanceQuestions(teacher.id, week4!.id, [
      ...asPayload(before),
      {
        prompt: "What part of normalization was least clear this week?",
        type: "paragraph",
        required: false,
        displayOrder: 2,
      },
    ]);

    const after = await questionsOf(week4!.id);
    expect(after.map((q) => q.prompt)).toEqual([
      "How was the pace this week?",
      "What should we revisit?",
      "What part of normalization was least clear this week?",
    ]);
    expect(after[2]!.origin).toBe("instance_only");
    // The inherited two keep their identity, so exports still line up.
    expect(after[0]!.stableKey).toBe(before[0]!.stableKey);
    expect(after[1]!.stableKey).toBe(before[1]!.stableKey);
    expect(after[0]!.origin).toBe("inherited");

    // The BASE form is untouched.
    const baseVersion = (await db.query.templateVersions.findFirst({
      where: eq(
        (await import("@/db/schema")).templateVersions.templateId,
        template.id,
      ),
    }))!;
    const baseQuestions = await db.query.formQuestions.findMany({
      where: eq(formQuestions.templateVersionId, baseVersion.id),
    });
    expect(baseQuestions).toHaveLength(2);

    // Weeks 1, 3 and 5 are untouched.
    for (const other of [week1!, week3!, week5!]) {
      const q = await questionsOf(other.id);
      expect(q.map((x) => x.prompt)).toEqual([
        "How was the pace this week?",
        "What should we revisit?",
      ]);
    }
  });

  it("editing Week 4 does not change Week 3, and Week 5 stays on the base form", async () => {
    const { teacher, instances } = await weeklyCourse();
    const [, , week3, week4, week5] = instances;
    const before = await questionsOf(week4!.id);
    const edited = asPayload(before);
    edited[0]!.prompt = "How was the pace during the normalization week?";

    await customizeInstanceQuestions(teacher.id, week4!.id, edited);

    expect((await questionsOf(week4!.id))[0]!.prompt).toBe(
      "How was the pace during the normalization week?",
    );
    expect((await questionsOf(week3!.id))[0]!.prompt).toBe(
      "How was the pace this week?",
    );
    expect((await questionsOf(week5!.id))[0]!.prompt).toBe(
      "How was the pace this week?",
    );
    expect((await questionsOf(week4!.id))[0]!.origin).toBe("modified");
  });

  it("a student sees Week 4's question and not Week 5's", async () => {
    const { teacher, section, instances } = await weeklyCourse();
    const week4 = instances[3]!;
    const week5 = instances[4]!;
    const before = await questionsOf(week4.id);
    await customizeInstanceQuestions(teacher.id, week4.id, [
      ...asPayload(before),
      {
        prompt: "Which normalization form confused you?",
        type: "paragraph",
        required: false,
        displayOrder: 2,
      },
    ]);
    const w5before = await questionsOf(week5.id);
    await customizeInstanceQuestions(teacher.id, week5.id, [
      ...asPayload(w5before),
      {
        prompt: "How did the indexing lab go?",
        type: "paragraph",
        required: false,
        displayOrder: 2,
      },
    ]);

    const student = await makeEnrolledStudent(section.id, teacher.id);
    // Open week 4 so the student can actually read it.
    await db
      .update(formInstances)
      .set({ state: "open" })
      .where(eq(formInstances.id, week4.id));
    const state = (await getStudentFormStateForInstance(
      student.user.id,
      week4.id,
      new Date(week4.openAt.getTime() + 3600_000),
    ))!;
    const prompts = state.questions.map((q) => q.prompt);
    expect(prompts).toContain("Which normalization form confused you?");
    expect(prompts).not.toContain("How did the indexing lab go?");
  });

  it("an answer stays attached to the exact question it was given for", async () => {
    const { teacher, section, instances } = await weeklyCourse();
    const week4 = instances[3]!;
    await db
      .update(formInstances)
      .set({ state: "open" })
      .where(eq(formInstances.id, week4.id));
    const questions = await questionsOf(week4.id);
    const student = await makeEnrolledStudent(section.id, teacher.id);
    const at = new Date(week4.openAt.getTime() + 3600_000);
    const saved = await submitResponse(
      student.user.id,
      week4.id,
      { answers: [{ questionId: questions[0]!.id, text: "a bit fast" }] },
      at,
    );

    // A cosmetic fix is allowed after a response, and must not move the answer.
    const payload = asPayload(questions);
    payload[0]!.prompt = "How was the pace this week? (typo fixed)";
    await customizeInstanceQuestions(teacher.id, week4.id, payload);

    const answers = await db.query.questionAnswers.findMany({
      where: eq(
        (await import("@/db/schema")).questionAnswers.responseId,
        saved.responseId,
      ),
    });
    expect(answers).toHaveLength(1);
    // Same question row, so the answer never became an orphan.
    expect(answers[0]!.questionId).toBe(questions[0]!.id);
    const nowQuestions = await questionsOf(week4.id);
    expect(nowQuestions[0]!.id).toBe(questions[0]!.id);
    expect(nowQuestions[0]!.prompt).toBe(
      "How was the pace this week? (typo fixed)",
    );
    expect(nowQuestions[0]!.origin).toBe("modified");
  });

  it("blocks a structural edit once someone has answered, and audits the cosmetic one", async () => {
    const { teacher, section, instances } = await weeklyCourse();
    const week4 = instances[3]!;
    await db
      .update(formInstances)
      .set({ state: "open" })
      .where(eq(formInstances.id, week4.id));
    const questions = await questionsOf(week4.id);
    const student = await makeEnrolledStudent(section.id, teacher.id);
    await submitResponse(
      student.user.id,
      week4.id,
      { answers: [{ questionId: questions[0]!.id, text: "fine" }] },
      new Date(week4.openAt.getTime() + 3600_000),
    );

    // Adding a question is structural → refused.
    await expect(
      customizeInstanceQuestions(teacher.id, week4.id, [
        ...asPayload(questions),
        {
          prompt: "One more thing?",
          type: "paragraph",
          required: false,
          displayOrder: 2,
        },
      ]),
    ).rejects.toBeInstanceOf(InstanceLockedError);

    // Removing one is structural → refused.
    await expect(
      customizeInstanceQuestions(teacher.id, week4.id, [
        asPayload(questions)[0]!,
      ]),
    ).rejects.toBeInstanceOf(InstanceLockedError);

    // Changing a type is structural → refused.
    const retyped = asPayload(questions);
    retyped[1]!.type = "short_answer";
    await expect(
      customizeInstanceQuestions(teacher.id, week4.id, retyped),
    ).rejects.toBeInstanceOf(InstanceLockedError);

    // Making one required is structural → refused.
    const required = asPayload(questions);
    required[1]!.required = true;
    await expect(
      customizeInstanceQuestions(teacher.id, week4.id, required),
    ).rejects.toBeInstanceOf(InstanceLockedError);

    // A wording fix is allowed, and audited.
    const cosmetic = asPayload(questions);
    cosmetic[0]!.prompt = "How was the pace? (reworded)";
    await customizeInstanceQuestions(teacher.id, week4.id, cosmetic);
    const events = await db.query.auditEvents.findMany({
      where: and(
        eq(auditEvents.action, "cycle.questions_reworded"),
        eq(auditEvents.entityId, week4.id),
      ),
    });
    expect(events).toHaveLength(1);
    // The pre-edit wording survives in the audit row.
    expect(JSON.stringify(events[0]!.before)).toContain(
      "How was the pace this week?",
    );
  });

  it("resetting to the base form is allowed before a response and refused after", async () => {
    const { teacher, section, instances } = await weeklyCourse();
    const week4 = instances[3]!;
    const questions = await questionsOf(week4.id);
    await customizeInstanceQuestions(teacher.id, week4.id, [
      ...asPayload(questions),
      {
        prompt: "Extra for this week only",
        type: "paragraph",
        required: false,
        displayOrder: 2,
      },
    ]);
    expect(await questionsOf(week4.id)).toHaveLength(3);

    await restoreInstanceToBase(teacher.id, week4.id);
    const restored = await questionsOf(week4.id);
    expect(restored.map((q) => q.prompt)).toEqual([
      "How was the pace this week?",
      "What should we revisit?",
    ]);
    expect(restored.every((q) => q.origin === "inherited")).toBe(true);
    const reloaded = (await db.query.formInstances.findFirst({
      where: eq(formInstances.id, week4.id),
    }))!;
    expect(reloaded.customizedAt).toBeNull();

    // Once answered, resetting would orphan the answers, so it is refused.
    await db
      .update(formInstances)
      .set({ state: "open" })
      .where(eq(formInstances.id, week4.id));
    const student = await makeEnrolledStudent(section.id, teacher.id);
    await submitResponse(
      student.user.id,
      week4.id,
      { answers: [{ questionId: restored[0]!.id, text: "fine" }] },
      new Date(week4.openAt.getTime() + 3600_000),
    );
    await expect(
      restoreInstanceToBase(teacher.id, week4.id),
    ).rejects.toBeInstanceOf(InstanceLockedError);
  });

  it("a per-occurrence focus is presentation only, and survives a response", async () => {
    const { teacher, section, instances } = await weeklyCourse();
    const week4 = instances[3]!;
    await setInstanceFocus(teacher.id, week4.id, {
      focusLabel: "Normalization",
    });
    let reloaded = (await db.query.formInstances.findFirst({
      where: eq(formInstances.id, week4.id),
    }))!;
    expect(reloaded.focusLabel).toBe("Normalization");

    await db
      .update(formInstances)
      .set({ state: "open" })
      .where(eq(formInstances.id, week4.id));
    const questions = await questionsOf(week4.id);
    const student = await makeEnrolledStudent(section.id, teacher.id);
    await submitResponse(
      student.user.id,
      week4.id,
      { answers: [{ questionId: questions[0]!.id, text: "fine" }] },
      new Date(week4.openAt.getTime() + 3600_000),
    );

    // Still editable after a response: it changes no question and no answer.
    await setInstanceFocus(teacher.id, week4.id, {
      focusLabel: "Normal forms",
      title: "Week 4 — normalization",
    });
    reloaded = (await db.query.formInstances.findFirst({
      where: eq(formInstances.id, week4.id),
    }))!;
    expect(reloaded.focusLabel).toBe("Normal forms");
    expect(reloaded.title).toBe("Week 4 — normalization");

    // And the student sees it, so the extra question makes sense to them.
    const state = (await getStudentFormStateForInstance(
      student.user.id,
      week4.id,
      new Date(week4.openAt.getTime() + 7200_000),
    ))!;
    expect(state.focusLabel).toBe("Normal forms");
    expect(state.formTitle).toBe("Week 4 — normalization");
  });

  it("preview returns the exact current occurrence without saving or submitting", async () => {
    const { teacher, instances } = await weeklyCourse();
    const week4 = instances[3]!;
    const questions = await questionsOf(week4.id);
    await customizeInstanceQuestions(teacher.id, week4.id, [
      ...asPayload(questions),
      {
        prompt: "Only on week 4",
        type: "paragraph",
        required: false,
        displayOrder: 2,
      },
    ]);

    const before = await db.query.formResponses.findMany();
    const preview = await previewInstance(teacher.id, week4.id);
    expect(preview.label).toBe("Week 4");
    expect(preview.questions.map((q) => q.prompt)).toEqual([
      "How was the pace this week?",
      "What should we revisit?",
      "Only on week 4",
    ]);
    // Nothing was created by looking at it.
    expect(await db.query.formResponses.findMany()).toHaveLength(before.length);
  });

  it("refuses customization by staff without standing on the whole audience", async () => {
    const { teacher, course, instances } = await weeklyCourse();
    // A second section joins the audience, run by someone else.
    const other = await makeSection(course.id);
    const otherTeacher = await makeUser();
    await addSectionStaff(other.id, otherTeacher.id, "teacher");

    const week4 = instances[3]!;
    // Nobody outside the course can touch it at all.
    const stranger = await makeUser({ isTeacher: true });
    await expect(
      getInstanceDetail(stranger.id, week4.id),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      customizeInstanceQuestions(stranger.id, week4.id, [
        {
          prompt: "Injected",
          type: "paragraph",
          required: false,
          displayOrder: 0,
        },
      ]),
    ).rejects.toBeInstanceOf(AuthzError);

    // A teacher who runs only the OTHER section cannot restructure a form whose
    // audience includes a section they do not run.
    await db
      .insert((await import("@/db/schema")).formInstanceSections)
      .values({ instanceId: week4.id, sectionId: other.id });
    await expect(
      customizeInstanceQuestions(otherTeacher.id, week4.id, [
        {
          prompt: "Injected",
          type: "paragraph",
          required: false,
          displayOrder: 0,
        },
      ]),
    ).rejects.toBeInstanceOf(AuthzError);

    // The course's own teacher still can.
    const payload = asPayload(await questionsOf(week4.id));
    await customizeInstanceQuestions(teacher.id, week4.id, payload);
  });
});
