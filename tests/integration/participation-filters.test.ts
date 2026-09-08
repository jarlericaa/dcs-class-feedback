import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  enroll,
  makeCourse,
  makeEnrolledStudent,
  makeSection,
  makeStudentRecord,
  makeUser,
} from "./fixtures";
import { users } from "@/db/schema";
import {
  auditEvents,
  courseStaff,
  formInstances,
  formQuestions,
} from "@/db/schema";
import { createTemplate } from "@/modules/forms/templates";
import { configureDelivery } from "@/modules/forms/schedules";
import {
  generateInstancesForSchedule,
  openDueCycles,
} from "@/modules/forms/cycles";
import { submitResponse } from "@/modules/forms/submission";
import {
  cycleParticipationCsv,
  defaultCycleId,
  detailedResponseCsv,
  listAnswerFilters,
  listCycleParticipation,
  listSectionCycles,
  participantListCsv,
  responderListCsv,
  responderListXlsx,
  weeklyMatrixCsv,
} from "@/modules/participation";
import { AuthzError } from "@/modules/authz";

/**
 * Participation around week and answer filters (GitHub issue #15), and the
 * responder export for encoding (GitHub issue #8).
 *
 * The properties that matter:
 *
 *  - The week list is paginated IN THE DATABASE and one row per STUDENT, even
 *    when the filtered question is a checkbox group with several chosen options.
 *  - An answer filter narrows; it never silently widens. A malformed answer key
 *    or a question from another occurrence yields nothing, not everyone.
 *  - The export carries exactly what the screen carries, under the same filter.
 *  - Everything is scoped to THIS section under a shared form, gated on
 *    `exportParticipation`, and audited.
 */

const START = "2026-01-05"; // a Monday
const WEEK1 = new Date("2026-01-06T04:00:00Z");
const WEEK2 = new Date("2026-01-13T04:00:00Z");

async function course(opts: { weeks?: number; sections?: number } = {}) {
  const teacher = await makeUser({ isTeacher: true });
  const owned = await makeCourse(teacher.id);
  const sections = [];
  for (let i = 0; i < (opts.sections ?? 1); i += 1) {
    const section = await makeSection(owned.id);
    await addSectionStaff(section.id, teacher.id, "teacher");
    sections.push(section);
  }
  const { template } = await createTemplate(teacher.id, {
    courseId: owned.id,
    title: "Weekly feedback",
    questions: [
      {
        prompt: "How was this week's pace?",
        type: "multiple_choice",
        required: true,
        displayOrder: 0,
        options: [
          { stableId: "slow", label: "Too slow", order: 0 },
          { stableId: "right", label: "Just right", order: 1 },
          { stableId: "fast", label: "Too fast", order: 2 },
        ],
      },
      {
        prompt: "Which resources did you use?",
        type: "checkboxes",
        required: false,
        displayOrder: 1,
        options: [
          { stableId: "vid", label: "Videos", order: 0 },
          { stableId: "txt", label: "Textbook", order: 1 },
        ],
      },
      {
        prompt: "Rate the lectures",
        type: "linear_scale",
        required: false,
        displayOrder: 2,
        scale: { min: 1, max: 5, step: 1 },
      },
      {
        prompt: "Did you attend?",
        type: "yes_no",
        required: false,
        displayOrder: 3,
      },
      {
        prompt: "Anything else?",
        type: "paragraph",
        required: false,
        displayOrder: 4,
      },
    ],
  });
  const { schedule } = await configureDelivery(teacher.id, owned.id, {
    templateId: template.id,
    deliveryMode: "weekly",
    audienceMode: "all_sections",
    sectionIds: [],
    openDayOfWeek: 1,
    openTime: "08:00",
    deadlineDayOfWeek: 5,
    deadlineTime: "17:00",
    startDate: START,
    occurrenceCount: opts.weeks ?? 2,
  });
  await generateInstancesForSchedule(schedule, new Date("2026-03-01T00:00:00Z"));
  await openDueCycles(new Date("2026-01-20T01:00:00Z"));
  const instances = await db.query.formInstances.findMany({
    where: eq(formInstances.scheduleId, schedule.id),
    orderBy: (t, { asc }) => [asc(t.cycleIndex)],
  });
  const questions = await db.query.formQuestions.findMany({
    where: eq(formQuestions.cycleId, instances[0]!.id),
    orderBy: (t, { asc }) => [asc(t.displayOrder)],
  });
  const q = (prompt: string) => questions.find((x) => x.prompt === prompt)!;
  return {
    teacher,
    course: owned,
    section: sections[0]!,
    sections,
    instances,
    week1: instances[0]!,
    week2: instances[1]!,
    pace: q("How was this week's pace?"),
    resources: q("Which resources did you use?"),
    rating: q("Rate the lectures"),
    attended: q("Did you attend?"),
    prose: q("Anything else?"),
  };
}

/**
 * A student whose number is a specific, realistic one — the fixtures generate a
 * short unique number, which is fine for identity but says nothing about how a
 * real UP number is written.
 */
async function withNumber(sectionId: string, studentNumber: string) {
  const user = await makeUser({ displayName: "Numbered Student" });
  const record = await makeStudentRecord(
    "Numbered Student",
    studentNumber,
    `numbered-student@up.edu.ph`,
  );
  await db
    .update(users)
    .set({ email: record.rosterEmail! })
    .where(eq(users.id, user.id));
  await enroll(sectionId, record.id);
  return { userId: user.id, record };
}

describe("one week's participation, filtered", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("offers only the questions whose answers form a finite set", async () => {
    const c = await course();
    const filters = await listAnswerFilters(
      c.teacher.id,
      c.section.id,
      c.week1.id,
    );
    // The paragraph question is absent: "who wrote that" is a search, not a
    // filter, and offering it would be offering something unanswerable.
    expect(filters.map((f) => f.prompt)).toEqual([
      "How was this week's pace?",
      "Which resources did you use?",
      "Rate the lectures",
      "Did you attend?",
    ]);
    expect(
      filters.find((f) => f.prompt === "How was this week's pace?")!.options,
    ).toEqual([
      { key: "slow", label: "Too slow" },
      { key: "right", label: "Just right" },
      { key: "fast", label: "Too fast" },
    ]);
    expect(filters.find((f) => f.type === "yes_no")!.options).toEqual([
      { key: "yes", label: "Yes" },
      { key: "no", label: "No" },
    ]);
    // A scale is enumerated from its own settings, never invented.
    expect(
      filters.find((f) => f.type === "linear_scale")!.options.map((o) => o.key),
    ).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("lists everyone on the class list, answered or not, when nothing is filtered", async () => {
    const c = await course();
    const answered = await makeEnrolledStudent(c.section.id);
    const silent = await makeEnrolledStudent(c.section.id);
    await submitResponse(
      answered.user.id,
      c.week1.id,
      { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
      WEEK1,
    );

    const page = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
    });
    expect(page.total).toBe(2);
    const byId = new Map(page.rows.map((r) => [r.studentRecordId, r]));
    expect(byId.get(answered.record.id)!.participated).toBe(true);
    expect(byId.get(answered.record.id)!.submittedAt).toBeInstanceOf(Date);
    // "Who did NOT answer this week" is the same list, read the other way.
    expect(byId.get(silent.record.id)!.participated).toBe(false);
    expect(byId.get(silent.record.id)!.responseId).toBeNull();
    expect(byId.get(silent.record.id)!.submittedAt).toBeNull();
  });

  it("narrows to the students who gave one answer, and reports it back", async () => {
    const c = await course();
    const fast = await makeEnrolledStudent(c.section.id);
    const right = await makeEnrolledStudent(c.section.id);
    await makeEnrolledStudent(c.section.id); // answered nothing
    for (const [student, option] of [
      [fast, "fast"],
      [right, "right"],
    ] as const) {
      await submitResponse(
        student.user.id,
        c.week1.id,
        { answers: [{ questionId: c.pace.id, optionIds: [option] }] },
        WEEK1,
      );
    }

    const page = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: c.pace.id,
      answerKey: "fast",
    });
    expect(page.total).toBe(1);
    expect(page.rows[0]!.studentRecordId).toBe(fast.record.id);
    // The label is resolved from the stored labels, so a later rewording of
    // the option cannot change what this student is reported as having said.
    expect(page.rows[0]!.answerLabels).toBe("Too fast");
  });

  /**
   * A checkbox answer has several option rows. A join would multiply the
   * student across the page and break both the count and the pagination, which
   * is why the scope uses correlated sub-selects.
   */
  it("returns one row per student even for a multi-select answer", async () => {
    const c = await course();
    const both = await makeEnrolledStudent(c.section.id);
    await submitResponse(
      both.user.id,
      c.week1.id,
      {
        answers: [
          { questionId: c.pace.id, optionIds: ["right"] },
          { questionId: c.resources.id, optionIds: ["vid", "txt"] },
        ],
      },
      WEEK1,
    );

    const page = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: c.resources.id,
      answerKey: "vid",
    });
    expect(page.total).toBe(1);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]!.answerLabels).toBe("Videos, Textbook");
  });

  it("filters a scale and a yes/no by their stored shapes", async () => {
    const c = await course();
    const a = await makeEnrolledStudent(c.section.id);
    const b = await makeEnrolledStudent(c.section.id);
    await submitResponse(
      a.user.id,
      c.week1.id,
      {
        answers: [
          { questionId: c.pace.id, optionIds: ["right"] },
          { questionId: c.rating.id, scaleValue: 2 },
          { questionId: c.attended.id, boolValue: false },
        ],
      },
      WEEK1,
    );
    await submitResponse(
      b.user.id,
      c.week1.id,
      {
        answers: [
          { questionId: c.pace.id, optionIds: ["right"] },
          { questionId: c.rating.id, scaleValue: 5 },
          { questionId: c.attended.id, boolValue: true },
        ],
      },
      WEEK1,
    );

    const low = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: c.rating.id,
      answerKey: "2",
    });
    expect(low.rows.map((r) => r.studentRecordId)).toEqual([a.record.id]);
    expect(low.rows[0]!.answerLabels).toBe("2");

    const absent = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: c.attended.id,
      answerKey: "no",
    });
    expect(absent.rows.map((r) => r.studentRecordId)).toEqual([a.record.id]);
    expect(absent.rows[0]!.answerLabels).toBe("No");
  });

  /**
   * A filter that cannot be honoured must return NOTHING, never everyone.
   * Silently widening a filter is how a teacher emails the wrong students.
   */
  it("refuses rather than widens on a bad question or answer", async () => {
    const c = await course();
    const student = await makeEnrolledStudent(c.section.id);
    await submitResponse(
      student.user.id,
      c.week1.id,
      { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
      WEEK1,
    );

    // A prose question has no finite answer set, so it is not filterable.
    const prose = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: c.prose.id,
      answerKey: "anything",
    });
    expect(prose.total).toBe(0);

    // A hand-edited query parameter must be refused before PostgreSQL compares
    // it with the UUID question column.
    const malformed = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: "not-a-uuid",
      answerKey: "anything",
    });
    expect(malformed.total).toBe(0);
    expect(malformed.rows).toEqual([]);

    // A question from ANOTHER occurrence is a different form, not a narrower
    // filter.
    const week2Questions = await db.query.formQuestions.findMany({
      where: eq(formQuestions.cycleId, c.week2.id),
    });
    const crossed = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: week2Questions[0]!.id,
      answerKey: "right",
    });
    expect(crossed.total).toBe(0);

    // A nonsense scale key parses to nothing.
    const nonsense = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: c.rating.id,
      answerKey: "not-a-number",
    });
    expect(nonsense.total).toBe(0);

    // An option id that does not exist matches nobody, not everybody.
    const unknown = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: c.pace.id,
      answerKey: "no-such-option",
    });
    expect(unknown.total).toBe(0);
  });

  it("refuses a HALF-specified filter instead of falling back to everyone", async () => {
    // A question with no answer, or an answer with no question, names no set of
    // students. The dangerous reading is the permissive one: it answers a
    // narrowing request with the whole class list, which is then the list a
    // teacher contacts. Reachable by hand-editing the URL and by a stale link,
    // so it is refused in the scope builder both the screen and the file share.
    const c = await course();
    const answered = await makeEnrolledStudent(c.section.id);
    const silent = await makeEnrolledStudent(c.section.id);
    await submitResponse(
      answered.user.id,
      c.week1.id,
      { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
      WEEK1,
    );

    // Baseline: unfiltered really is everyone, so 0 below means "refused"
    // rather than "this section happens to be empty".
    const everyone = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
    });
    expect(everyone.total).toBe(2);
    expect(new Set(everyone.rows.map((r) => r.studentRecordId))).toEqual(
      new Set([answered.record.id, silent.record.id]),
    );

    const questionOnly = await listCycleParticipation(
      c.teacher.id,
      c.section.id,
      { cycleId: c.week1.id, questionId: c.pace.id },
    );
    expect(questionOnly.total).toBe(0);
    expect(questionOnly.rows).toEqual([]);

    const answerOnly = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      answerKey: "right",
    });
    expect(answerOnly.total).toBe(0);
    expect(answerOnly.rows).toEqual([]);

    // And the export cannot disagree with the screen: same scope builder, so a
    // half-specified download is a header and nothing else — never a file of
    // every student under a filtered-looking request.
    const csv = await cycleParticipationCsv(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: c.pace.id,
    });
    expect(csv.trim().split("\r\n")).toHaveLength(1);
  });

  /**
   * The values a URL actually delivers.
   *
   * `?question=&answer=` gives two empty strings, and `?answer=%20` gives a
   * single space — which is TRUTHY, so a naive both-or-neither test would let a
   * whitespace answer through as a filter naming something. Blank has to mean
   * absent, or the two readings diverge: one of them refuses, the other returns
   * the class list under a filtered-looking request.
   */
  it("treats a blank or whitespace URL value as no filter, never as a value", async () => {
    const c = await course();
    const answered = await makeEnrolledStudent(c.section.id);
    const silent = await makeEnrolledStudent(c.section.id);
    await submitResponse(
      answered.user.id,
      c.week1.id,
      { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
      WEEK1,
    );

    // Both blank: no filter was requested, so everyone is the honest answer.
    for (const [questionId, answerKey] of [
      ["", ""],
      ["   ", ""],
      ["", "  "],
    ] as const) {
      const page = await listCycleParticipation(c.teacher.id, c.section.id, {
        cycleId: c.week1.id,
        questionId,
        answerKey,
      });
      expect(page.total, `${JSON.stringify([questionId, answerKey])}`).toBe(2);
    }

    // One blank beside one value is the HALF-specified case: refused.
    for (const [questionId, answerKey] of [
      [c.pace.id, ""],
      [c.pace.id, "   "],
      ["", "right"],
      ["  ", "right"],
    ] as const) {
      const page = await listCycleParticipation(c.teacher.id, c.section.id, {
        cycleId: c.week1.id,
        questionId,
        answerKey,
      });
      expect(page.total, `${JSON.stringify([questionId, answerKey])}`).toBe(0);
      expect(page.rows).toEqual([]);
    }

    // A padded value that IS offered still works, so the normalization is
    // trimming rather than rejecting.
    const padded = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: ` ${c.pace.id} `,
      answerKey: " right ",
    });
    expect(padded.total).toBe(1);
    expect(padded.rows[0]!.studentRecordId).toBe(answered.record.id);
    expect(silent.record.id).not.toBe(answered.record.id);
  });

  /**
   * A scale key must be one of the OFFERED steps, not merely something
   * `parseInt` can read a number out of.
   *
   * `Number.parseInt("2abc")` is 2, so a per-type parse accepted `2abc`, `1e1`,
   * ` 2` and `2.9` as if the reader had asked for 2 — a filter answering a
   * request nobody made. And `999`, or an off-step value, is not an answer any
   * student could hold, so accepting it produced a confidently empty list
   * instead of a refusal.
   */
  it("accepts only the scale values the question offers", async () => {
    const c = await course();
    const two = await makeEnrolledStudent(c.section.id);
    await submitResponse(
      two.user.id,
      c.week1.id,
      {
        answers: [
          { questionId: c.pace.id, optionIds: ["right"] },
          { questionId: c.rating.id, scaleValue: 2 },
        ],
      },
      WEEK1,
    );

    // The offered key finds them.
    const offered = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: c.rating.id,
      answerKey: "2",
    });
    expect(offered.rows.map((r) => r.studentRecordId)).toEqual([two.record.id]);

    // Everything that merely PARSES to 2 is refused, so none of them can
    // masquerade as the offered key.
    for (const key of ["2abc", "2.9", "1e1", "+2", "02", "999", "0", "-1"]) {
      const page = await listCycleParticipation(c.teacher.id, c.section.id, {
        cycleId: c.week1.id,
        questionId: c.rating.id,
        answerKey: key,
      });
      expect(page.total, `scale key ${key}`).toBe(0);
      expect(page.rows, `scale key ${key}`).toEqual([]);
    }

    // Same rule for yes/no and for a choice id: only what the selector offers.
    for (const [questionId, key] of [
      [c.attended.id, "true"],
      [c.attended.id, "YES"],
      [c.pace.id, "RIGHT"],
      [c.pace.id, "no-such-option"],
    ] as const) {
      const page = await listCycleParticipation(c.teacher.id, c.section.id, {
        cycleId: c.week1.id,
        questionId,
        answerKey: key,
      });
      expect(page.total, `${key}`).toBe(0);
    }
  });

  /**
   * A refused filter must not leave its fingerprints on the file either: no
   * Answer column, and an audit row that records what was applied rather than
   * what was asked for.
   */
  it("does not claim a filter the export refused", async () => {
    const c = await course();
    const student = await makeEnrolledStudent(c.section.id);
    await submitResponse(
      student.user.id,
      c.week1.id,
      { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
      WEEK1,
    );

    const csv = await cycleParticipationCsv(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: c.pace.id,
      answerKey: "not-an-option",
      cycleLabel: "Week 1",
    });
    // Header only, and no Answer column claiming a narrowing that did not run.
    // An invalid answer key must not leave the export looking filtered.
    expect(csv.trim().split("\r\n")).toHaveLength(1);
    expect(csv).not.toContain("Answer");

    const events = await db.query.auditEvents.findMany({
      where: eq(auditEvents.action, "participation.exported"),
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.metadata).toMatchObject({
      report: "cycle_participation",
      cycleId: c.week1.id,
      questionId: null,
      answerKey: null,
      rows: 0,
    });
  });

  it("pages in the database, with a stable order across pages", async () => {
    const c = await course();
    for (let i = 0; i < 5; i += 1) {
      await makeEnrolledStudent(c.section.id);
    }
    const first = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      pageSize: 2,
    });
    expect(first.total).toBe(5);
    expect(first.totalPages).toBe(3);
    expect(first.rows).toHaveLength(2);
    const second = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      page: 2,
      pageSize: 2,
    });
    const third = await listCycleParticipation(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      page: 3,
      pageSize: 2,
    });
    const seen = [...first.rows, ...second.rows, ...third.rows].map(
      (r) => r.studentRecordId,
    );
    // Every student once, and no student twice.
    expect(new Set(seen).size).toBe(5);
    expect(seen).toHaveLength(5);
  });

  it("stays inside this section under a shared form", async () => {
    const c = await course({ sections: 2 });
    const [a, b] = c.sections;
    const mine = await makeEnrolledStudent(a!.id);
    const theirs = await makeEnrolledStudent(b!.id);
    for (const student of [mine, theirs]) {
      await submitResponse(
        student.user.id,
        c.week1.id,
        { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
        WEEK1,
      );
    }

    const inA = await listCycleParticipation(c.teacher.id, a!.id, {
      cycleId: c.week1.id,
    });
    expect(inA.rows.map((r) => r.studentRecordId)).toEqual([mine.record.id]);
    const inB = await listCycleParticipation(c.teacher.id, b!.id, {
      cycleId: c.week1.id,
    });
    expect(inB.rows.map((r) => r.studentRecordId)).toEqual([theirs.record.id]);
  });

  it("needs the export_participation capability", async () => {
    const c = await course();
    const ta = await makeUser({});
    await addSectionStaff(c.section.id, ta.id, "ta", { reviewResponses: true });
    for (const call of [
      () => listSectionCycles(ta.id, c.section.id),
      () => listAnswerFilters(ta.id, c.section.id, c.week1.id),
      () =>
        listCycleParticipation(ta.id, c.section.id, { cycleId: c.week1.id }),
      () => responderListCsv(ta.id, c.section.id, { cycleId: c.week1.id }),
      () => responderListXlsx(ta.id, c.section.id, { cycleId: c.week1.id }),
      () =>
        cycleParticipationCsv(ta.id, c.section.id, { cycleId: c.week1.id }),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(AuthzError);
    }
  });

  it("gives an assistant with the flag the SCREEN and the three original CSVs", async () => {
    // Decision D17 froze `export_participation` as a delegable flag for the
    // reports that already existed. Asserted here so the instructor-only rule
    // below cannot be satisfied by quietly hardening everything: a Student
    // Assistant who was granted the flag must keep what they were granted.
    const c = await course();
    const ta = await makeUser({});
    await addSectionStaff(c.section.id, ta.id, "ta", {
      reviewResponses: true,
      exportParticipation: true,
    });

    await expect(
      listCycleParticipation(ta.id, c.section.id, { cycleId: c.week1.id }),
    ).resolves.toBeDefined();
    await expect(
      listAnswerFilters(ta.id, c.section.id, c.week1.id),
    ).resolves.toBeDefined();
    await expect(weeklyMatrixCsv(ta.id, c.section.id)).resolves.toBeTypeOf(
      "string",
    );
    await expect(participantListCsv(ta.id, c.section.id)).resolves.toBeTypeOf(
      "string",
    );
    await expect(detailedResponseCsv(ta.id, c.section.id)).resolves.toBeTypeOf(
      "string",
    );
  });

  it("keeps the NEWER identity-bearing exports instructor-only, flag and all", async () => {
    // participation-rules.md §4: every export added after decision D17 —
    // the filtered week CSV and both responder formats — is instructor-only,
    // and `export_participation` does not reach it. The assistant here holds
    // the flag, so a failure of this test means the flag was silently widened
    // into the non-delegable set rather than that the assistant lacks standing.
    const c = await course();
    const ta = await makeUser({});
    await addSectionStaff(c.section.id, ta.id, "ta", {
      reviewResponses: true,
      exportParticipation: true,
    });

    for (const call of [
      () =>
        cycleParticipationCsv(ta.id, c.section.id, { cycleId: c.week1.id }),
      () => responderListCsv(ta.id, c.section.id, { cycleId: c.week1.id }),
      () => responderListXlsx(ta.id, c.section.id, { cycleId: c.week1.id }),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(AuthzError);
    }

    /**
     * A TA who ALSO holds course-wide standing is an Instructor and must pass.
     *
     * `requireNonTaSectionStaff` refuses a section-scoped `ta` row and then
     * re-admits them if they are course staff — the branch a "simplify this to
     * a role check" edit would delete, locking a co-instructor out of their own
     * course's exports. Asserted here because nothing else covers it.
     */
    const courseStaffTa = await makeUser({});
    await addSectionStaff(c.section.id, courseStaffTa.id, "ta", {
      reviewResponses: true,
    });
    await db
      .insert(courseStaff)
      .values({ courseId: c.course.id, userId: courseStaffTa.id, role: "teacher" });
    await expect(
      cycleParticipationCsv(courseStaffTa.id, c.section.id, {
        cycleId: c.week1.id,
      }),
    ).resolves.toBeTypeOf("string");
    await expect(
      responderListCsv(courseStaffTa.id, c.section.id, { cycleId: c.week1.id }),
    ).resolves.toBeTypeOf("string");

    // A co-teacher is an instructor and holds every one of them, without any
    // flag being set on their row — the role is the gate, not the permission.
    const coTeacher = await makeUser({});
    await addSectionStaff(c.section.id, coTeacher.id, "co_teacher");
    await expect(
      cycleParticipationCsv(coTeacher.id, c.section.id, {
        cycleId: c.week1.id,
      }),
    ).resolves.toBeTypeOf("string");
    await expect(
      responderListCsv(coTeacher.id, c.section.id, { cycleId: c.week1.id }),
    ).resolves.toBeTypeOf("string");
    await expect(
      responderListXlsx(coTeacher.id, c.section.id, { cycleId: c.week1.id }),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it("defaults to the last week anybody actually answered", async () => {
    const c = await course({ weeks: 3 });
    const student = await makeEnrolledStudent(c.section.id);
    const cycles = await listSectionCycles(c.teacher.id, c.section.id);
    // Nothing answered yet: there is no "this week", so the caller shows the
    // whole term.
    expect(defaultCycleId(cycles)).toBeNull();

    await submitResponse(
      student.user.id,
      c.week1.id,
      { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
      WEEK1,
    );
    expect(
      defaultCycleId(await listSectionCycles(c.teacher.id, c.section.id)),
    ).toBe(c.week1.id);

    const week2Questions = await db.query.formQuestions.findMany({
      where: eq(formQuestions.cycleId, c.week2.id),
    });
    await submitResponse(
      student.user.id,
      c.week2.id,
      { answers: [{ questionId: week2Questions[0]!.id, optionIds: ["right"] }] },
      WEEK2,
    );
    // The LATEST answered one, not the latest generated: week 3 exists and is
    // empty, and landing there would be correct and useless.
    expect(
      defaultCycleId(await listSectionCycles(c.teacher.id, c.section.id)),
    ).toBe(c.week2.id);
  });
});

describe("the exports match the filter on screen", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("exports the same rows the filtered list shows, and audits the filter", async () => {
    const c = await course();
    const fast = await makeEnrolledStudent(c.section.id);
    const right = await makeEnrolledStudent(c.section.id);
    for (const [student, option] of [
      [fast, "fast"],
      [right, "right"],
    ] as const) {
      await submitResponse(
        student.user.id,
        c.week1.id,
        { answers: [{ questionId: c.pace.id, optionIds: [option] }] },
        WEEK1,
      );
    }

    const csv = await cycleParticipationCsv(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      questionId: c.pace.id,
      answerKey: "fast",
      cycleLabel: "Week 1",
    });
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("Student number");
    expect(lines[0]).toContain("Answer");
    // One row: the filter narrowed the file exactly as it narrowed the screen.
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(fast.record.fullName);
    expect(lines[1]).toContain("Too fast");

    const events = await db.query.auditEvents.findMany({
      where: eq(auditEvents.action, "participation.exported"),
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.metadata).toMatchObject({
      report: "cycle_participation",
      cycleId: c.week1.id,
      questionId: c.pace.id,
      answerKey: "fast",
      rows: 1,
    });
    expect(events[0]!.sectionId).toBe(c.section.id);
    // The audit row names the filter, never a student.
    expect(JSON.stringify(events[0]!.metadata)).not.toContain(
      fast.record.fullName,
    );
  });

  it("drops the Answer column when nothing is filtered", async () => {
    const c = await course();
    const student = await makeEnrolledStudent(c.section.id);
    await submitResponse(
      student.user.id,
      c.week1.id,
      { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
      WEEK1,
    );
    const csv = await cycleParticipationCsv(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      cycleLabel: "Week 1",
    });
    expect(csv.split("\r\n")[0]).not.toContain("Answer");
    // Everyone on the list, answered or not — the same rows the screen shows.
    expect(csv.trim().split("\r\n")).toHaveLength(2);
  });
});

describe("the responder list, for encoding", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("exports who responded, by student number, with the encoding columns", async () => {
    const c = await course();
    const answered = await makeEnrolledStudent(c.section.id);
    await makeEnrolledStudent(c.section.id); // silent
    await submitResponse(
      answered.user.id,
      c.week1.id,
      { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
      WEEK1,
    );

    const csv = await responderListCsv(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
    });
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Student number,Student name,UP email,Submitted at");
    // Only the responder: this is the list an encoding sheet is filled from.
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(answered.record.fullName);
    expect(lines[1]).toContain(answered.record.rosterEmail!);
    // The FULL student number, not a masked tail — the file is gated and
    // audited, and a tail cannot be joined against an encoding sheet.
    expect(lines[1]!.startsWith("\u2026")).toBe(false);
    expect(lines[1]!.split(",")[0]!.length).toBeGreaterThan(4);
  });

  /**
   * Written in the READING format, so the column matches the numbers already in
   * the encoding sheet it is being pasted into. The stored plaintext is
   * normalized and carries no separator; restoring it is the difference between
   * a lookup that works and a column repaired by hand.
   */
  it("writes the number the way the sheet writes it", async () => {
    const c = await course();
    const student = await withNumber(c.section.id, "2026-00042");
    await submitResponse(
      student.userId,
      c.week1.id,
      { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
      WEEK1,
    );

    const csv = await responderListCsv(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
    });
    expect(csv).toContain("2026-00042,");
    // And never the unpunctuated stored form, which would not match.
    expect(csv).not.toContain("202600042");
  });

  it("optionally carries everyone, so the gap is visible in one file", async () => {
    const c = await course();
    const answered = await makeEnrolledStudent(c.section.id);
    const silent = await makeEnrolledStudent(c.section.id);
    await submitResponse(
      answered.user.id,
      c.week1.id,
      { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
      WEEK1,
    );

    const csv = await responderListCsv(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      includeNonResponders: true,
    });
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(
      "Student number,Student name,UP email,Submitted at,Responded,Enrolment",
    );
    expect(lines).toHaveLength(3);
    expect(csv).toContain(silent.record.fullName);
    expect(csv).toContain(",yes,active");
    expect(csv).toContain(",no,active");
  });

  it("sorts by student number, so it pastes into an encoding sheet", async () => {
    const c = await course();
    for (let i = 0; i < 3; i += 1) {
      const student = await makeEnrolledStudent(c.section.id);
      await submitResponse(
        student.user.id,
        c.week1.id,
        { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
        WEEK1,
      );
    }
    const csv = await responderListCsv(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
    });
    const numbers = csv
      .trim()
      .split("\r\n")
      .slice(1)
      .map((line) => line.split(",")[0]!);
    expect(numbers).toHaveLength(3);
    expect(numbers).toEqual([...numbers].sort());
  });

  it("produces a real spreadsheet through the shared tabular path", async () => {
    const c = await course();
    const student = await makeEnrolledStudent(c.section.id);
    await submitResponse(
      student.user.id,
      c.week1.id,
      { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
      WEEK1,
    );
    const buffer = await responderListXlsx(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      cycleLabel: "Week 1",
    });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    // An xlsx is a ZIP, so its first two bytes are the ZIP magic: this is the
    // file actually being a spreadsheet rather than a renamed CSV.
    expect(buffer.subarray(0, 2).toString("binary")).toBe("PK");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("audits every responder download, with no identity in the row", async () => {
    const c = await course();
    const student = await makeEnrolledStudent(c.section.id);
    await submitResponse(
      student.user.id,
      c.week1.id,
      { answers: [{ questionId: c.pace.id, optionIds: ["right"] }] },
      WEEK1,
    );
    await responderListCsv(c.teacher.id, c.section.id, { cycleId: c.week1.id });
    await responderListXlsx(c.teacher.id, c.section.id, {
      cycleId: c.week1.id,
      includeNonResponders: true,
    });

    const events = await db.query.auditEvents.findMany({
      where: and(
        eq(auditEvents.action, "export.responses"),
        eq(auditEvents.sectionId, c.section.id),
      ),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });
    expect(events).toHaveLength(2);
    expect(
      events.map((e) => (e.metadata as { format: string }).format).sort(),
    ).toEqual(["csv", "xlsx"]);
    expect(events[0]!.metadata).toMatchObject({
      report: "responders",
      cycleId: c.week1.id,
      rows: 1,
    });
    const dump = JSON.stringify(events);
    expect(dump).not.toContain(student.record.fullName);
    expect(dump).not.toContain(student.record.rosterEmail!);
  });

  it("exports nothing for a week this section does not receive", async () => {
    const mine = await course();
    const theirs = await course();
    const csv = await responderListCsv(mine.teacher.id, mine.section.id, {
      cycleId: theirs.week1.id,
    });
    // Header only: the occurrence is not in this section's audience.
    expect(csv.trim().split("\r\n")).toHaveLength(1);
  });
});
