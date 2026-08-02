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
  formQuestions,
  publicAnswers,
  sourceLinks,
  studentSubmissionItems,
  weeklyCycles,
} from "@/db/schema";
import { createTemplate } from "@/modules/forms/templates";
import {
  generateCyclesForSchedule,
  openDueCycles,
} from "@/modules/forms/cycles";
import { recurrenceSchedules } from "@/db/schema";
import { submitResponse } from "@/modules/forms/submission";
import {
  createPrivateResponse,
  listSubmissionsForSection,
  setValidity,
} from "@/modules/review";
import {
  anonymityWarnings,
  draftPublicAnswer,
  getStudentHistory,
  listSectionQa,
  publishNow,
  rewordPublicQuestion,
  schedulePublication,
} from "@/modules/publishing";
import { publishDueAnswers } from "@/modules/publishing/publish";
import { AuthzError } from "@/modules/authz";

const inWindow = new Date("2026-01-06T04:00:00Z");

async function fullSetup() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  const { template } = await createTemplate(teacher.id, {
    courseId: course.id,
    title: "T",
    questions: [
      {
        prompt: "Pace?",
        type: "short_answer",
        required: true,
        displayOrder: 0,
      },
    ],
  });
  const [schedule] = await db
    .insert(recurrenceSchedules)
    .values({
      sectionId: section.id,
      openDayOfWeek: 1,
      openTime: "08:00:00",
      deadlineDayOfWeek: 5,
      deadlineTime: "17:00:00",
      startDate: "2026-01-05",
      occurrenceCount: 4,
      templateId: template.id,
      timezone: "Asia/Manila",
    })
    .returning();
  await generateCyclesForSchedule(schedule!, new Date("2026-01-06T00:00:00Z"));
  await openDueCycles(new Date("2026-01-05T01:00:00Z"));
  const cycle = (await db.query.weeklyCycles.findFirst({
    where: and(
      eq(weeklyCycles.scheduleId, schedule!.id),
      eq(weeklyCycles.state, "open"),
    ),
  }))!;
  const questions = await db.query.formQuestions.findMany({
    where: eq(formQuestions.cycleId, cycle.id),
  });
  return { teacher, course, section, cycle, question: questions[0]! };
}

async function submitWithItem(
  sectionId: string,
  teacherId: string,
  cycleId: string,
  questionId: string,
  text: string,
) {
  const student = await makeEnrolledStudent(sectionId, teacherId);
  const result = await submitResponse(
    student.user.id,
    cycleId,
    {
      answers: [{ questionId, text: "fine" }],
      studentItem: { submissionType: "question", category: "content", text },
    },
    inWindow,
  );
  return { student, ...result };
}

describe("review + publishing + source links", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("merged public answer links every source; each asker sees 'answered'; archive stays anonymous", async () => {
    const { teacher, section, cycle, question } = await fullSetup();
    const a = await submitWithItem(
      section.id,
      teacher.id,
      cycle.id,
      question.id,
      "What is recursion?",
    );
    const b = await submitWithItem(
      section.id,
      teacher.id,
      cycle.id,
      question.id,
      "Please explain recursion again",
    );

    const answer = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [a.studentItemId!, b.studentItemId!],
      publicQuestionText: "Several students asked: how does recursion work?",
      answerBody: "Recursion is when a function calls itself...",
      category: "content",
    });

    // Both sources linked (merge), dispositions = merged.
    const links = await db.query.sourceLinks.findMany({
      where: eq(sourceLinks.publicAnswerId, answer.id),
    });
    expect(links).toHaveLength(2);
    const items = await db.query.studentSubmissionItems.findMany();
    expect(items.every((i) => i.disposition === "merged")).toBe(true);

    await publishNow(teacher.id, answer.id, { anonymityAcknowledged: true });

    // Each asker sees "answered" + the reworded public version.
    for (const s of [a, b]) {
      const history = await getStudentHistory(s.student.user.id, section.id);
      const item = history[0]!.items[0]!;
      expect(item.status).toBe("answered");
      expect(item.publicAnswer?.rewordedQuestion).toMatch(/Several students/);
      // Their own original text is preserved and visible to them.
      expect(item.originalText).toMatch(/recursion/i);
    }

    // The class archive projection carries NO identity or source fields.
    const archive = await listSectionQa(a.student.user.id, section.id);
    expect(archive).toHaveLength(1);
    const entry = archive[0]! as Record<string, unknown>;
    expect(entry.question).toMatch(/Several students/);
    expect("studentRecordId" in entry).toBe(false);
    expect("sourceLinks" in entry).toBe(false);
    expect("createdByUserId" in entry).toBe(false);
  });

  it("rewording updates the public text only; the original student wording is immutable", async () => {
    const { teacher, section, cycle, question } = await fullSetup();
    const a = await submitWithItem(
      section.id,
      teacher.id,
      cycle.id,
      question.id,
      "my ORIGINAL words",
    );
    const answer = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [a.studentItemId!],
      publicQuestionText: "first public wording",
      answerBody: "answer",
    });
    await rewordPublicQuestion(teacher.id, answer.id, "second public wording");

    const item = (await db.query.studentSubmissionItems.findFirst({
      where: eq(studentSubmissionItems.id, a.studentItemId!),
    }))!;
    expect(item.originalText).toBe("my ORIGINAL words");
    const updated = (await db.query.publicAnswers.findFirst({
      where: eq(publicAnswers.id, answer.id),
    }))!;
    expect(updated.publicQuestionText).toBe("second public wording");
  });

  it("drafts and scheduled answers are invisible to students; scheduled publish is idempotent", async () => {
    const { teacher, section, cycle, question } = await fullSetup();
    const a = await submitWithItem(
      section.id,
      teacher.id,
      cycle.id,
      question.id,
      "question A",
    );
    const answer = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [a.studentItemId!],
      publicQuestionText: "public Q",
      answerBody: "body",
    });

    // Draft: not in archive, student sees plain "submitted".
    expect(await listSectionQa(a.student.user.id, section.id)).toHaveLength(0);
    let history = await getStudentHistory(a.student.user.id, section.id);
    expect(history[0]!.items[0]!.status).toBe("submitted");

    await schedulePublication(
      teacher.id,
      answer.id,
      new Date("2026-01-07T00:00:00Z"),
      { anonymityAcknowledged: true },
    );
    expect(await listSectionQa(a.student.user.id, section.id)).toHaveLength(0);

    // Due publication publishes exactly once (idempotent re-run).
    expect(await publishDueAnswers(new Date("2026-01-07T01:00:00Z"))).toBe(1);
    expect(await publishDueAnswers(new Date("2026-01-07T02:00:00Z"))).toBe(0);
    expect(await listSectionQa(a.student.user.id, section.id)).toHaveLength(1);
    history = await getStudentHistory(a.student.user.id, section.id);
    expect(history[0]!.items[0]!.status).toBe("answered");
  });

  it("private responses are visible to the asker only; students never see validity", async () => {
    const { teacher, section, cycle, question } = await fullSetup();
    const a = await submitWithItem(
      section.id,
      teacher.id,
      cycle.id,
      question.id,
      "private question",
    );
    const other = await makeEnrolledStudent(section.id, teacher.id);

    await createPrivateResponse(
      teacher.id,
      a.studentItemId!,
      "here is a private reply",
    );
    await setValidity(teacher.id, a.responseId, "invalid", "spam", "test note");

    const own = await getStudentHistory(a.student.user.id, section.id);
    expect(own[0]!.items[0]!.privateResponses[0]!.body).toMatch(
      /private reply/,
    );
    // Neutral projection: no validity/invalidation anywhere in the payload.
    expect(JSON.stringify(own)).not.toMatch(/invalid|spam|validity/i);

    // The other student's history has no trace of A's data at all.
    const others = await getStudentHistory(other.user.id, section.id);
    expect(others).toHaveLength(0);
  });

  it("unauthorized users cannot draft/publish/list; TA flags gate publishing", async () => {
    const { teacher, section, cycle, question } = await fullSetup();
    const a = await submitWithItem(
      section.id,
      teacher.id,
      cycle.id,
      question.id,
      "q",
    );
    const outsiderTeacher = await makeUser({ isTeacher: true });

    await expect(
      draftPublicAnswer(outsiderTeacher.id, {
        sectionId: section.id,
        itemIds: [a.studentItemId!],
        publicQuestionText: "x",
      }),
    ).rejects.toBeInstanceOf(AuthzError);

    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", {
      draftPublicAnswers: true, // but NOT publishPublicAnswers
    });
    const answer = await draftPublicAnswer(ta.id, {
      sectionId: section.id,
      itemIds: [a.studentItemId!],
      publicQuestionText: "reworded",
      answerBody: "body",
    });
    await expect(
      publishNow(ta.id, answer.id, { anonymityAcknowledged: true }),
    ).rejects.toBeInstanceOf(AuthzError);
    await publishNow(teacher.id, answer.id, { anonymityAcknowledged: true }); // teacher may
  });

  it("review list masks identity for TAs without viewStudentIdentities", async () => {
    const { teacher, section, cycle, question } = await fullSetup();
    await submitWithItem(section.id, teacher.id, cycle.id, question.id, "q");

    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });
    const masked = await listSubmissionsForSection(ta.id, section.id);
    expect(masked[0]!.response.studentRecordId).toBeNull();

    const full = await listSubmissionsForSection(teacher.id, section.id);
    expect(full[0]!.response.studentRecordId).not.toBeNull();
  });

  it("invalidating requires a reason and is audited", async () => {
    const { teacher, section, cycle, question } = await fullSetup();
    const a = await submitWithItem(
      section.id,
      teacher.id,
      cycle.id,
      question.id,
      "q",
    );
    await expect(
      setValidity(teacher.id, a.responseId, "invalid"),
    ).rejects.toThrow(/reason/);
    await setValidity(teacher.id, a.responseId, "invalid", "spam");
    const { auditEvents } = await import("@/db/schema");
    const audit = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "response.validity_changed"),
    });
    expect(audit?.before).toMatchObject({ validity: "valid" });
    expect(audit?.after).toMatchObject({ validity: "invalid" });
  });

  it("anonymityWarnings flags personal wording and single-source publishes", () => {
    expect(
      anonymityWarnings("Why did my grade drop?", 1).length,
    ).toBeGreaterThan(0);
    expect(anonymityWarnings("How does recursion work?", 3)).toHaveLength(0);
    expect(
      anonymityWarnings("A student asked about arrays", 2).length,
    ).toBeGreaterThan(0);
  });
});
