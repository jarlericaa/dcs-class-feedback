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
import { formInstances, formQuestions } from "@/db/schema";
import { createTemplate } from "@/modules/forms/templates";
import { configureDelivery } from "@/modules/forms/schedules";
import {
  generateInstancesForSchedule,
  openDueCycles,
} from "@/modules/forms/cycles";
import { customizeInstanceQuestions } from "@/modules/forms/instances";
import { submitResponse } from "@/modules/forms/submission";
import { getCourseReviewQueue } from "@/modules/review";

/**
 * What the review view is actually reading (issue #10).
 *
 * The complaint was that the responses looked hardcoded — a fixed shape that
 * did not reflect an authored form. They are not: the queue reads the
 * OCCURRENCE's own `form_questions` snapshot. These tests hold that claim to
 * the three things it has to mean.
 *
 *  1. Every supported question type comes back with its real type and a value
 *     in the shape that type stores.
 *  2. The order is the AUTHORED order (`displayOrder`), not insertion order and
 *     not a grouping the reader never asked for.
 *  3. A question the form asked and the student skipped is still there, marked,
 *     rather than silently dropped — which used to make "not asked" and
 *     "left blank" identical on screen.
 *
 * Rendering is asserted separately: the module returns the prompt SOURCE, and
 * the page runs it through the one sanctioned renderer.
 */

const START = "2026-01-05"; // a Monday
const inWindow = new Date("2026-01-06T04:00:00Z");

/**
 * One question of every type the form builder offers, authored out of order.
 *
 * All optional, so a test can submit a single answer and still have a valid
 * submission — required-ness is asserted separately, where it is the subject.
 */
const ALL_TYPES = [
  // displayOrder is deliberately NOT the array order: a read model that
  // returned insertion order would pass a same-order fixture by accident.
  {
    prompt: "Anything else?",
    type: "paragraph" as const,
    required: false,
    displayOrder: 8,
  },
  {
    prompt: "How confident are you about $\\int x^3\\,dx$?",
    type: "linear_scale" as const,
    required: false,
    displayOrder: 0,
    scale: { min: 1, max: 5, step: 1 },
  },
  {
    prompt: "Which topic was hardest?",
    type: "multiple_choice" as const,
    required: false,
    displayOrder: 1,
    options: [
      { stableId: "rec", label: "Recursion", order: 0 },
      { stableId: "ptr", label: "Pointers", order: 1 },
    ],
  },
  {
    prompt: "Which resources did you use?",
    type: "checkboxes" as const,
    required: false,
    displayOrder: 2,
    options: [
      { stableId: "vid", label: "Videos", order: 0 },
      { stableId: "txt", label: "Textbook", order: 1 },
    ],
  },
  {
    prompt: "Preferred consultation slot",
    type: "dropdown" as const,
    required: false,
    displayOrder: 3,
    options: [
      { stableId: "am", label: "Morning", order: 0 },
      { stableId: "pm", label: "Afternoon", order: 1 },
    ],
  },
  {
    prompt: "Did you attend?",
    type: "yes_no" as const,
    required: false,
    displayOrder: 4,
  },
  {
    prompt: "Date you started",
    type: "date" as const,
    required: false,
    displayOrder: 5,
  },
  {
    prompt: "Time you started",
    type: "time" as const,
    required: false,
    displayOrder: 6,
  },
  {
    prompt: "In one line, the week",
    type: "short_answer" as const,
    required: false,
    displayOrder: 7,
  },
];

async function courseWithEveryType(
  questions: Parameters<typeof createTemplate>[1]["questions"],
) {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  await addSectionStaff(section.id, teacher.id, "teacher");
  const { template } = await createTemplate(teacher.id, {
    courseId: course.id,
    title: "Weekly feedback",
    questions,
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
    occurrenceCount: 2,
  });
  await generateInstancesForSchedule(schedule, new Date("2026-02-01T00:00:00Z"));
  const instances = await db.query.formInstances.findMany({
    where: eq(formInstances.scheduleId, schedule.id),
    orderBy: (t, { asc }) => [asc(t.cycleIndex)],
  });
  const cycle = instances[0]!;
  const snapshot = await db.query.formQuestions.findMany({
    where: eq(formQuestions.cycleId, cycle.id),
    orderBy: (t, { asc }) => [asc(t.displayOrder)],
  });
  return { teacher, course, section, template, instances, cycle, snapshot };
}

/**
 * Open the occurrences due by `at`, the way the scheduler does.
 *
 * Not `openInstanceNow`: that one refuses an occurrence whose deadline has
 * passed in real time, and these fixtures deliberately sit in a fixed January
 * so the window arithmetic is readable. Customization also locks once an
 * occurrence is open, so every test opens AFTER it has finished authoring.
 */
async function openBy(at: string) {
  await openDueCycles(new Date(at));
}

function byPrompt(
  snapshot: { id: string; prompt: string; type: string }[],
  prompt: string,
) {
  const found = snapshot.find((q) => q.prompt === prompt);
  if (!found) throw new Error(`no question authored with prompt: ${prompt}`);
  return found;
}

describe("the review queue reads the occurrence's own question snapshot", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("returns every question type with its real type and stored value", async () => {
    const { teacher, course, section, cycle, snapshot } =
      await courseWithEveryType(ALL_TYPES);
    await openBy("2026-01-05T01:00:00Z");
    const student = await makeEnrolledStudent(section.id);
    const q = (prompt: string) => byPrompt(snapshot, prompt).id;

    await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [
          { questionId: q("How confident are you about $\\int x^3\\,dx$?"), scaleValue: 4 },
          { questionId: q("Which topic was hardest?"), optionIds: ["rec"] },
          {
            questionId: q("Which resources did you use?"),
            optionIds: ["vid", "txt"],
          },
          { questionId: q("Preferred consultation slot"), optionIds: ["pm"] },
          { questionId: q("Did you attend?"), boolValue: true },
          { questionId: q("Date you started"), dateValue: "2026-01-06" },
          { questionId: q("Time you started"), timeValue: "09:30" },
          { questionId: q("In one line, the week"), text: "Dense but fair." },
          {
            questionId: q("Anything else?"),
            text: "More worked examples would help.",
          },
        ],
      },
      inWindow,
    );

    const queue = await getCourseReviewQueue(teacher.id, course.id, {
      instanceId: cycle.id,
    });
    const answers = queue.rows[0]!.answers;

    // Nine questions authored, nine rows back — nothing invented, nothing lost.
    expect(answers).toHaveLength(9);
    expect(answers.every((a) => a.answered)).toBe(true);
    expect(queue.rows[0]!.unansweredCount).toBe(0);

    const at = (order: number) =>
      answers.find((a) => a.displayOrder === order)!;
    expect(at(0).type).toBe("linear_scale");
    expect(at(0).value).toEqual({ scaleValue: 4 });
    // The scale settings travel with the question, so the review view can draw
    // 4 as "4 out of 5" rather than as a bare number.
    expect(at(0).scale).toMatchObject({ min: 1, max: 5 });

    expect(at(1).type).toBe("multiple_choice");
    expect(at(1).value).toEqual({
      optionIds: ["rec"],
      optionLabels: ["Recursion"],
    });

    expect(at(2).type).toBe("checkboxes");
    expect(at(2).value).toEqual({
      optionIds: ["vid", "txt"],
      optionLabels: ["Videos", "Textbook"],
    });

    expect(at(3).type).toBe("dropdown");
    expect(at(3).value).toEqual({
      optionIds: ["pm"],
      optionLabels: ["Afternoon"],
    });

    expect(at(4).type).toBe("yes_no");
    expect(at(4).value).toEqual({ boolValue: true });

    expect(at(5).type).toBe("date");
    expect(at(5).value).toEqual({ dateValue: "2026-01-06" });

    expect(at(6).type).toBe("time");
    expect(at(6).value).toEqual({ timeValue: "09:30" });

    // The two prose types carry text, not a jsonb value — which is exactly the
    // distinction the review view splits its layout on.
    expect(at(7).type).toBe("short_answer");
    expect(at(7).freeText).toBe("Dense but fair.");
    expect(at(7).value).toBeNull();
    expect(at(8).type).toBe("paragraph");
    expect(at(8).freeText).toBe("More worked examples would help.");
    expect(at(8).value).toBeNull();
  });

  it("returns them in the AUTHORED order, not the order they were written", async () => {
    const { teacher, course, section, cycle, snapshot } =
      await courseWithEveryType(ALL_TYPES);
    await openBy("2026-01-05T01:00:00Z");
    const student = await makeEnrolledStudent(section.id);
    await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [
          {
            questionId: byPrompt(snapshot, "In one line, the week").id,
            text: "Fine.",
          },
        ],
      },
      inWindow,
    );

    const queue = await getCourseReviewQueue(teacher.id, course.id, {
      instanceId: cycle.id,
    });
    const answers = queue.rows[0]!.answers;
    // The fixture authors "Anything else?" FIRST in the array and LAST in
    // displayOrder, so insertion order and authored order disagree.
    expect(answers.map((a) => a.displayOrder)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(answers[0]!.prompt).toBe(
      "How confident are you about $\\int x^3\\,dx$?",
    );
    expect(answers[8]!.prompt).toBe("Anything else?");
  });

  it("keeps a question the student left blank, marked as unanswered", async () => {
    const { teacher, course, section, cycle, snapshot } =
      await courseWithEveryType([
        {
          prompt: "How was the pace?",
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
        {
          prompt: "Rate the lab",
          type: "linear_scale",
          required: false,
          displayOrder: 2,
          scale: { min: 1, max: 5, step: 1 },
        },
      ]);
    await openBy("2026-01-05T01:00:00Z");
    const student = await makeEnrolledStudent(section.id);
    await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [
          { questionId: byPrompt(snapshot, "How was the pace?").id, text: "Good" },
        ],
      },
      inWindow,
    );

    const queue = await getCourseReviewQueue(teacher.id, course.id, {
      instanceId: cycle.id,
    });
    const answers = queue.rows[0]!.answers;
    // All three asked, so all three appear: two of them empty.
    expect(answers.map((a) => [a.prompt, a.answered])).toEqual([
      ["How was the pace?", true],
      ["What should we revisit?", false],
      ["Rate the lab", false],
    ]);
    expect(queue.rows[0]!.unansweredCount).toBe(2);
    // A blank row carries no value to render, and says which question it was.
    const blank = answers[2]!;
    expect(blank.value).toBeNull();
    expect(blank.freeText).toBeNull();
    expect(blank.required).toBe(false);
    expect(blank.scale).toMatchObject({ min: 1, max: 5 });
  });

  /**
   * The prompt SOURCE reaches the page, markup and all. Rendering is the page's
   * job, through `renderRichText` — the one sanctioned renderer — so the module
   * must not pre-mangle or pre-escape it.
   */
  it("hands the page the authored prompt source, and its help text", async () => {
    const { teacher, course, section, cycle, snapshot } =
      await courseWithEveryType([
        {
          prompt: "Is `O(n log n)` clear? See $\\sum_{i=1}^{n} i$",
          description: "**Optional.** Say which step lost you.",
          type: "paragraph",
          required: false,
          displayOrder: 0,
        },
      ]);
    await openBy("2026-01-05T01:00:00Z");
    const student = await makeEnrolledStudent(section.id);
    await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [
          { questionId: byPrompt(snapshot, snapshot[0]!.prompt).id, text: "Clear." },
        ],
      },
      inWindow,
    );

    const queue = await getCourseReviewQueue(teacher.id, course.id, {
      instanceId: cycle.id,
    });
    const answer = queue.rows[0]!.answers[0]!;
    expect(answer.prompt).toBe(
      "Is `O(n log n)` clear? See $\\sum_{i=1}^{n} i$",
    );
    expect(answer.description).toBe("**Optional.** Say which step lost you.");
  });

  /**
   * The whole point of a per-occurrence snapshot: one week's edit must not
   * change how another week's answers read back.
   */
  it("shows the occurrence's customized questions, not the base form's", async () => {
    const { teacher, course, section, instances, snapshot } =
      await courseWithEveryType([
        {
          prompt: "How was the pace?",
          type: "short_answer",
          required: true,
          displayOrder: 0,
        },
      ]);
    const week1 = instances[0]!;
    const week2 = instances[1]!;

    // Week 2 asks something else entirely, and only week 2.
    await customizeInstanceQuestions(teacher.id, week2.id, [
      {
        prompt: "Which lab bench were you on?",
        type: "short_answer",
        required: true,
        displayOrder: 0,
      },
    ]);
    // Both weeks open only now, after week 2 has been re-authored.
    await openBy("2026-01-12T01:00:00Z");

    const a = await makeEnrolledStudent(section.id);
    await submitResponse(
      a.user.id,
      week1.id,
      {
        answers: [
          { questionId: byPrompt(snapshot, "How was the pace?").id, text: "Brisk" },
        ],
      },
      inWindow,
    );
    const week2Questions = await db.query.formQuestions.findMany({
      where: eq(formQuestions.cycleId, week2.id),
    });
    const b = await makeEnrolledStudent(section.id);
    await submitResponse(
      b.user.id,
      week2.id,
      { answers: [{ questionId: week2Questions[0]!.id, text: "Bench 4" }] },
      new Date("2026-01-13T04:00:00Z"),
    );

    const first = await getCourseReviewQueue(teacher.id, course.id, {
      instanceId: week1.id,
    });
    expect(first.rows[0]!.answers.map((x) => x.prompt)).toEqual([
      "How was the pace?",
    ]);

    const second = await getCourseReviewQueue(teacher.id, course.id, {
      instanceId: week2.id,
    });
    expect(second.rows[0]!.answers.map((x) => x.prompt)).toEqual([
      "Which lab bench were you on?",
    ]);
    // And the two weeks' question ids are genuinely different rows, so nothing
    // is being resolved back to one shared question set.
    expect(second.rows[0]!.answers[0]!.questionId).not.toBe(
      first.rows[0]!.answers[0]!.questionId,
    );
  });

  /**
   * A response that answers NOTHING.
   *
   * A form must carry at least one question — `customizeInstanceQuestions`
   * refuses an empty set — so the emptiest real post is one where every
   * question is optional and the student skipped all of them to ask their own
   * thing. The layout has to survive a post whose whole form section is blank,
   * and the queue has to say so rather than returning an empty list that reads
   * as "this form asked nothing".
   */
  it("marks every question unanswered when the student only asked their own question", async () => {
    const { teacher, course, section, cycle } = await courseWithEveryType([
      {
        prompt: "How was the pace?",
        type: "short_answer",
        required: false,
        displayOrder: 0,
      },
      {
        prompt: "Rate the lab",
        type: "linear_scale",
        required: false,
        displayOrder: 1,
        scale: { min: 1, max: 5, step: 1 },
      },
    ]);
    await openBy("2026-01-05T01:00:00Z");
    const student = await makeEnrolledStudent(section.id);
    await submitResponse(
      student.user.id,
      cycle.id,
      {
        answers: [],
        studentItem: {
          submissionType: "question",
          category: "content",
          text: "Will the practice set be posted?",
        },
      },
      inWindow,
    );

    const queue = await getCourseReviewQueue(teacher.id, course.id, {
      instanceId: cycle.id,
    });
    const row = queue.rows[0]!;
    // Both questions present, both blank — not an empty list.
    expect(row.answers).toHaveLength(2);
    expect(row.answers.every((a) => !a.answered)).toBe(true);
    expect(row.unansweredCount).toBe(2);
    // And the thing they did send is still the post's subject.
    expect(row.items).toHaveLength(1);
    expect(row.items[0]!.item.originalText).toBe(
      "Will the practice set be posted?",
    );
  });
});
