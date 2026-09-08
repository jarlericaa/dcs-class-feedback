import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  makeCourse,
  makeEnrolledStudent,
  makeSchedule,
  makeSection,
  makeUser,
} from "./fixtures";
import {
  formInstances,
  formQuestions,
  publicAnswers,
  sourceLinks,
  studentSubmissionItems,
} from "@/db/schema";
import { createTemplate } from "@/modules/forms/templates";
import {
  generateCyclesForSchedule,
  openDueCycles,
} from "@/modules/forms/cycles";
import { submitResponse } from "@/modules/forms/submission";
import {
  createPrivateResponse,
  listSubmissionsForSection,
  invalidateSubmission,
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
  const schedule = await makeSchedule({
    courseId: course.id,
    sectionIds: [section.id],
    templateId: template.id,
    occurrenceCount: 1,
  });
  await generateCyclesForSchedule(schedule, new Date("2026-01-06T00:00:00Z"));
  await openDueCycles(new Date("2026-01-05T01:00:00Z"));
  const cycle = (await db.query.formInstances.findFirst({
    where: and(
      eq(formInstances.scheduleId, schedule.id),
      eq(formInstances.state, "open"),
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
  const student = await makeEnrolledStudent(sectionId);
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

  /**
   * Issue #14: the class is told WHO answered.
   *
   * The asker stays anonymous — that is what this archive is for — but "the
   * teaching team" left a class unable to tell which of several people had made
   * a public statement to them. The answerer is staff putting their name to it.
   */
  it("names the staff member who answered, and still hides the asker", async () => {
    const { section, cycle, question } = await fullSetup();
    const publisher = await makeUser({
      isTeacher: true,
      displayName: "Maria Santos",
    });
    await addSectionStaff(section.id, publisher.id, "teacher");
    const asker = await submitWithItem(
      section.id,
      publisher.id,
      cycle.id,
      question.id,
      "When is the practice set available?",
    );

    const answer = await draftPublicAnswer(publisher.id, {
      sectionId: section.id,
      itemIds: [asker.studentItemId!],
      publicQuestionText: "When is the practice set available?",
      answerBody: "Friday.",
    });
    await publishNow(publisher.id, answer.id, { anonymityAcknowledged: true });

    const archive = await listSectionQa(asker.student.user.id, section.id);
    expect(archive).toHaveLength(1);
    expect(archive[0]!.answers[0]!.answeredByName).toBe("Maria Santos");

    // Naming the answerer must not have widened anything else: no asker
    // identity, no source link, no author id in the projection.
    const entry = archive[0]! as Record<string, unknown>;
    expect("studentRecordId" in entry).toBe(false);
    expect("sourceLinks" in entry).toBe(false);
    expect("createdByUserId" in entry).toBe(false);
    expect(JSON.stringify(archive)).not.toContain(
      asker.student.record.fullName,
    );
  });

  /**
   * Attribution is mandatory in the database, which is why naming the answerer
   * (above) is always possible.
   *
   * `public_answers.created_by_user_id` is NOT NULL with a foreign key to
   * `users`, so there is no such thing as a published answer nobody wrote. The
   * page still falls back to "Anonymous" rather than crashing on a missing
   * name, and this test records that the fallback is DEFENSIVE — if this
   * constraint is ever relaxed, that fallback becomes reachable and the Q&A
   * copy needs revisiting.
   */
  it("refuses to strip the author from a published answer", async () => {
    const { teacher, section, cycle, question } = await fullSetup();
    const asker = await submitWithItem(
      section.id,
      teacher.id,
      cycle.id,
      question.id,
      "Who wrote this?",
    );
    const answer = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [asker.studentItemId!],
      publicQuestionText: "Who wrote this?",
      answerBody: "Nobody in particular.",
    });
    await publishNow(teacher.id, answer.id, { anonymityAcknowledged: true });

    // Drizzle wraps the driver error, so the constraint is asserted on the
    // cause rather than on the wrapper's "Failed query" message.
    const rejection = await db
      .update(publicAnswers)
      .set({ createdByUserId: null as unknown as string })
      .where(eq(publicAnswers.id, answer.id))
      .then(
        () => null,
        (err: unknown) => err as { cause?: { code?: string } },
      );
    expect(rejection).not.toBeNull();
    // 23502 = not_null_violation.
    expect(rejection!.cause?.code).toBe("23502");
  });

  it("groups separately published answers with the same public question", async () => {
    const { teacher, section, cycle, question } = await fullSetup();
    const a = await submitWithItem(
      section.id,
      teacher.id,
      cycle.id,
      question.id,
      "What is the integral of x^3?",
    );
    const b = await submitWithItem(
      section.id,
      teacher.id,
      cycle.id,
      question.id,
      "Please explain the integral of x^3",
    );

    const first = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [a.studentItemId!],
      publicQuestionText: "What is the integral of x^3?",
      answerBody: "Use the power rule.",
    });
    await publishNow(teacher.id, first.id, { anonymityAcknowledged: true });

    const second = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [b.studentItemId!],
      publicQuestionText: "  what is the integral of x^3?  ",
      answerBody: "Integrate term by term.",
    });
    await publishNow(teacher.id, second.id, {
      anonymityAcknowledged: true,
    });

    expect(
      await db.query.publicAnswers.findMany({
        where: eq(publicAnswers.sectionId, section.id),
      }),
    ).toHaveLength(2);
    expect(await db.query.sourceLinks.findMany()).toHaveLength(2);
    const archive = await listSectionQa(a.student.user.id, section.id);
    expect(archive).toHaveLength(1);
    expect(archive[0]!.answers).toHaveLength(2);
    expect(archive[0]!.answers.map((answer) => answer.answer)).toEqual([
      "Integrate term by term.",
      "Use the power rule.",
    ]);

    for (const student of [a, b]) {
      const history = await getStudentHistory(student.student.user.id, section.id);
      expect(history[0]!.items[0]!.status).toBe("answered");
    }
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
    const archive = await listSectionQa(a.student.user.id, section.id);
    expect(archive).toHaveLength(1);
    expect(archive[0]!.category).toBe("misc");
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
    const other = await makeEnrolledStudent(section.id);

    await createPrivateResponse(
      teacher.id,
      a.studentItemId!,
      "here is a private reply",
    );
    await invalidateSubmission(teacher.id, a.responseId, {
      reason: "spam",
      studentVisibleReason: "This did not answer the form.",
      note: "test note",
    });

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
    // Both reasons are required: the internal one for staff, and a separate
    // student-visible one, because the student is now told why it did not count.
    await expect(
      invalidateSubmission(teacher.id, a.responseId, {
        reason: "spam",
        studentVisibleReason: "   ",
      }),
    ).rejects.toThrow(/student-visible reason/);
    await invalidateSubmission(teacher.id, a.responseId, {
      reason: "spam",
      studentVisibleReason: "This was spam.",
    });
    const { auditEvents } = await import("@/db/schema");
    const audit = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "validity.invalidated"),
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
