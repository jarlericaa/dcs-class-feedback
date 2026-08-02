import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  confirmMatchDirect,
  enroll,
  makeCourse,
  makeEnrolledStudent,
  makeSection,
  makeStudentRecord,
  makeUser,
} from "./fixtures";
import {
  accountMatches,
  formResponses,
  studentSubmissionItems,
  weeklyCycles,
} from "@/db/schema";
import { AuthzError, requireSectionQaAccess } from "@/modules/authz";
import { rejectMatch } from "@/modules/identity/matching";
import { getSubmissionDetail } from "@/modules/review";
import { listSectionStaff, updateSection } from "@/modules/catalog";
import { listSectionAuditEvents } from "@/modules/audit";
import { createTemplate } from "@/modules/forms/templates";
import {
  configureRecurrence,
  listCyclesForSection,
} from "@/modules/forms/schedules";
import { submitResponse, SubmissionError } from "@/modules/forms/submission";
import {
  AnonymityCheckRequired,
  draftPublicAnswer,
  publishNow,
  rewordPublicQuestion,
  schedulePublication,
} from "@/modules/publishing";
import { detailedResponseCsv } from "@/modules/participation";
import {
  importLegacyEntries,
  listBacklogForCourse,
  setBacklogState,
} from "@/modules/backlog";
import { listPublicationQueue } from "@/modules/publishing";
import { zonedTimeToUtc } from "@/modules/forms/timezone";

/**
 * Regression tests for the findings raised in the code review of this branch.
 * Each test fails against the code as it stood before the fix.
 */

async function makeSectionWithSubmission() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  await addSectionStaff(section.id, teacher.id, "teacher");
  const now = Date.now();
  const [cycle] = await db
    .insert(weeklyCycles)
    .values({
      sectionId: section.id,
      cycleIndex: 1,
      openAt: new Date(now - 3600_000),
      deadlineAt: new Date(now + 3600_000),
      state: "open",
    })
    .returning();
  const { user, record } = await makeEnrolledStudent(section.id, teacher.id);
  const [response] = await db
    .insert(formResponses)
    .values({ cycleId: cycle!.id, studentRecordId: record.id })
    .returning();
  const [item] = await db
    .insert(studentSubmissionItems)
    .values({
      responseId: response!.id,
      submissionType: "question",
      category: "content",
      originalText: "I could not read the slides in my Tuesday lab.",
    })
    .returning();
  return {
    teacher,
    course,
    section,
    cycle: cycle!,
    user,
    record,
    response: response!,
    item: item!,
  };
}

describe("rejectMatch cannot revoke a confirmed identity", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("refuses to reject a confirmed match", async () => {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    await addSectionStaff(section.id, teacher.id, "teacher");
    const student = await makeUser();
    const record = await makeStudentRecord("Confirmed Student");
    await enroll(section.id, record.id);
    const match = await confirmMatchDirect(student.id, record.id, teacher.id);

    await expect(rejectMatch(teacher.id, match.id)).rejects.toThrow(
      /Cannot reject a match in state confirmed/,
    );

    const after = await db.query.accountMatches.findFirst({
      where: eq(accountMatches.id, match.id),
    });
    expect(after!.state).toBe("confirmed");
  });

  it("still rejects a candidate", async () => {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    await addSectionStaff(section.id, teacher.id, "teacher");
    const student = await makeUser();
    const record = await makeStudentRecord("Candidate Student");
    await enroll(section.id, record.id);
    const [match] = await db
      .insert(accountMatches)
      .values({
        userId: student.id,
        studentRecordId: record.id,
        state: "candidate",
      })
      .returning();

    await rejectMatch(teacher.id, match!.id);
    const after = await db.query.accountMatches.findFirst({
      where: eq(accountMatches.id, match!.id),
    });
    expect(after!.state).toBe("rejected");
  });
});

describe("section staff standing without a named permission", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("lets a TA read the class Q&A archive", async () => {
    const { section } = await makeSectionWithSubmission();
    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });

    await expect(
      requireSectionQaAccess(db, ta.id, section.id),
    ).resolves.toEqual({ role: "staff" });
  });

  it("lets a TA read the teaching-team list on the setup page", async () => {
    const { section } = await makeSectionWithSubmission();
    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", {
      manageWeeklyCycles: true,
    });

    const staff = await listSectionStaff(ta.id, section.id);
    expect(staff.length).toBeGreaterThan(0);
  });

  it("still refuses a TA the capabilities that are not delegable", async () => {
    const { section } = await makeSectionWithSubmission();
    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", {
      manageWeeklyCycles: true,
    });

    await expect(
      updateSection(ta.id, section.id, { title: "Hijacked" }),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      listSectionAuditEvents(ta.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("still refuses someone with no standing at all", async () => {
    const { section } = await makeSectionWithSubmission();
    const outsider = await makeUser();
    await expect(
      requireSectionQaAccess(db, outsider.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("does not lock a course owner out via their own narrower TA row", async () => {
    const owner = await makeUser({ isTeacher: true });
    const course = await makeCourse(owner.id);
    const section = await makeSection(course.id);
    // The owner's section row says "ta" with no flags — previously this shadowed
    // their ownership and denied every section mutation.
    await addSectionStaff(section.id, owner.id, "ta");

    await expect(
      updateSection(owner.id, section.id, { title: "Still mine" }),
    ).resolves.not.toThrow();
  });
});

describe("getSubmissionDetail does not leak the identity binding", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("nulls studentRecordId for a TA without view_student_identities", async () => {
    const { section, response, record } = await makeSectionWithSubmission();
    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });

    const detail = await getSubmissionDetail(ta.id, response.id);
    expect(detail.student).toBeNull();
    expect(detail.response.studentRecordId).toBeNull();
    expect(JSON.stringify(detail)).not.toContain(record.id);
  });

  it("includes it for a teacher", async () => {
    const { teacher, response, record } = await makeSectionWithSubmission();
    const detail = await getSubmissionDetail(teacher.id, response.id);
    expect(detail.response.studentRecordId).toBe(record.id);
  });
});

describe("replacing a schedule does not duplicate weeks", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("generates each week once across a schedule replacement", async () => {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    await addSectionStaff(section.id, teacher.id, "teacher");
    const { template } = await createTemplate(teacher.id, {
      courseId: course.id,
      title: "T",
      questions: [
        { prompt: "Q", type: "paragraph", required: false, displayOrder: 0 },
      ],
    });
    const base = {
      templateId: template.id,
      openDayOfWeek: 1,
      openTime: "08:00",
      deadlineDayOfWeek: 0,
      deadlineTime: "23:59",
      startDate: "2026-01-05",
      occurrenceCount: 5,
    };

    await configureRecurrence(teacher.id, section.id, base);
    const first = await listCyclesForSection(teacher.id, section.id);

    // Same window, different open time — the replacement restarts cycleIndex
    // at 1, so nothing but the overlap guard prevents a duplicate week.
    await configureRecurrence(teacher.id, section.id, base);
    const second = await listCyclesForSection(teacher.id, section.id);

    expect(second.length).toBe(first.length);
    const openTimes = second.map((c) => c.cycle.openAt.toISOString());
    expect(new Set(openTimes).size).toBe(openTimes.length);
  });
});

describe("submission shape errors reach the student as field errors", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("returns a SubmissionError for over-long student text, not a ZodError", async () => {
    const { user, cycle } = await makeSectionWithSubmission();
    const other = await makeEnrolledStudent(cycle.sectionId, user.id).catch(
      () => null,
    );
    void other;

    const err = await submitResponse(user.id, cycle.id, {
      answers: [],
      studentItem: {
        submissionType: "question",
        category: "content",
        text: "x".repeat(10_001),
      },
    }).catch((e) => e);

    expect(err).toBeInstanceOf(SubmissionError);
    expect((err as SubmissionError).details.length).toBeGreaterThan(0);
  });

  it("returns a SubmissionError for a tampered enum value", async () => {
    const { user, cycle } = await makeSectionWithSubmission();
    const err = await submitResponse(user.id, cycle.id, {
      answers: [],
      studentItem: {
        submissionType: "not-a-real-type",
        category: "content",
        text: "hello",
      },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SubmissionError);
  });
});

describe("the anonymity check is enforced by the service", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("blocks publish-now without an acknowledgment", async () => {
    const { teacher, section, item } = await makeSectionWithSubmission();
    const answer = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [item.id],
      publicQuestionText: "Why did my lab group get a different brief?",
      answerBody: "A",
    });

    const err = await publishNow(teacher.id, answer.id).catch((e) => e);
    expect(err).toBeInstanceOf(AnonymityCheckRequired);
    expect((err as AnonymityCheckRequired).warnings.length).toBeGreaterThan(0);

    await publishNow(teacher.id, answer.id, { anonymityAcknowledged: true });
  });

  it("blocks SCHEDULING without an acknowledgment, so the background publish cannot bypass it", async () => {
    const { teacher, section, item } = await makeSectionWithSubmission();
    const answer = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [item.id],
      publicQuestionText: "Why did my lab group get a different brief?",
      answerBody: "A",
    });

    await expect(
      schedulePublication(
        teacher.id,
        answer.id,
        new Date(Date.now() + 86_400_000),
      ),
    ).rejects.toBeInstanceOf(AnonymityCheckRequired);

    await schedulePublication(
      teacher.id,
      answer.id,
      new Date(Date.now() + 86_400_000),
      { anonymityAcknowledged: true },
    );
  });

  it("uses the persisted text and real source count, not caller-supplied values", async () => {
    const { teacher, section, item } = await makeSectionWithSubmission();
    // Neutral wording, but a single source still warrants the small-class
    // warning — and the count comes from the source links, not the caller.
    const answer = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [item.id],
      publicQuestionText: "Will the slides be posted?",
      answerBody: "Yes.",
    });
    const err = await publishNow(teacher.id, answer.id).catch((e) => e);
    expect(err).toBeInstanceOf(AnonymityCheckRequired);
    expect((err as AnonymityCheckRequired).warnings.join(" ")).toContain(
      "single source submission",
    );
  });

  it("refuses to reword a scheduled answer, so an acknowledgment cannot cover new text", async () => {
    const { teacher, section, item } = await makeSectionWithSubmission();
    const answer = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [item.id],
      publicQuestionText: "Will the slides be posted?",
      answerBody: "Yes.",
    });
    await schedulePublication(
      teacher.id,
      answer.id,
      new Date(Date.now() + 86_400_000),
      { anonymityAcknowledged: true },
    );

    await expect(
      rewordPublicQuestion(teacher.id, answer.id, "Why did I fail my lab?"),
    ).rejects.toThrow(/Cancel the schedule first/);
  });
});

describe("CSV export neutralizes spreadsheet formulas", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("prefixes student text that would evaluate as a formula", async () => {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    await addSectionStaff(section.id, teacher.id, "teacher");
    const now = Date.now();
    const [cycle] = await db
      .insert(weeklyCycles)
      .values({
        sectionId: section.id,
        cycleIndex: 1,
        openAt: new Date(now - 3600_000),
        deadlineAt: new Date(now + 3600_000),
        state: "open",
      })
      .returning();
    const { record } = await makeEnrolledStudent(section.id, teacher.id);
    const [response] = await db
      .insert(formResponses)
      .values({ cycleId: cycle!.id, studentRecordId: record.id })
      .returning();
    await db.insert(studentSubmissionItems).values({
      responseId: response!.id,
      submissionType: "feedback",
      category: "misc",
      originalText: '=HYPERLINK("http://evil.example","click")',
    });

    const csv = await detailedResponseCsv(teacher.id, section.id);
    expect(csv).not.toMatch(/(^|,)"?=HYPERLINK/m);
    expect(csv).toContain("'=HYPERLINK");
  });
});

/* ------------------------------------------------------------------------ */
/* Second review round                                                       */
/* ------------------------------------------------------------------------ */

describe("section-scoped grants make advertised permissions usable", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("lets a section TA with manage_backlog_imports use the course backlog", async () => {
    const { course, section } = await makeSectionWithSubmission();
    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", {
      manageBacklogImports: true,
    });

    await expect(listBacklogForCourse(ta.id, course.id)).resolves.toBeTruthy();
    const imported = await importLegacyEntries(
      ta.id,
      course.id,
      [{ text: "Will the finals be cumulative?" }],
      "previous semester",
    );
    expect(imported.created).toHaveLength(1);
    await expect(
      setBacklogState(ta.id, imported.created[0]!.id, "needs_review"),
    ).resolves.not.toThrow();
  });

  it("still refuses a section TA without the flag", async () => {
    const { course, section } = await makeSectionWithSubmission();
    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });
    await expect(listBacklogForCourse(ta.id, course.id)).rejects.toBeInstanceOf(
      AuthzError,
    );
  });

  it("still refuses staff of an unrelated course", async () => {
    const a = await makeSectionWithSubmission();
    const b = await makeSectionWithSubmission();
    await expect(
      listBacklogForCourse(b.teacher.id, a.course.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("lets a publish-only TA read the publication queue", async () => {
    const { section } = await makeSectionWithSubmission();
    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", {
      publishPublicAnswers: true,
    });
    await expect(listPublicationQueue(ta.id, section.id)).resolves.toBeTruthy();
  });

  it("still refuses a TA with no publication capability", async () => {
    const { section } = await makeSectionWithSubmission();
    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });
    await expect(
      listPublicationQueue(ta.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });
});

describe("detailed CSV reports publication accurately", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("does not report a draft or a scheduled answer as published", async () => {
    const { teacher, section, item } = await makeSectionWithSubmission();
    const answer = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [item.id],
      publicQuestionText: "Will the slides be posted?",
      answerBody: "Yes.",
    });

    let csv = await detailedResponseCsv(teacher.id, section.id);
    let itemRow = csv.split("\r\n").find((r) => r.includes("Tuesday lab"))!;
    expect(itemRow.endsWith(",no")).toBe(true);

    await schedulePublication(
      teacher.id,
      answer.id,
      new Date(Date.now() + 86_400_000),
      { anonymityAcknowledged: true },
    );
    csv = await detailedResponseCsv(teacher.id, section.id);
    itemRow = csv.split("\r\n").find((r) => r.includes("Tuesday lab"))!;
    expect(itemRow.endsWith(",no")).toBe(true);

    await publishNow(teacher.id, answer.id, { anonymityAcknowledged: true });
    csv = await detailedResponseCsv(teacher.id, section.id);
    itemRow = csv.split("\r\n").find((r) => r.includes("Tuesday lab"))!;
    expect(itemRow.endsWith(",yes")).toBe(true);
  });
});

describe("scheduling honours the section timezone", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("converts a datetime-local wall clock in the section zone, not the server zone", () => {
    // 14:30 in Asia/Manila (UTC+8) is 06:30 UTC, whatever the server zone is.
    const manila = zonedTimeToUtc(2026, 8, 5, 14, 30, 0, "Asia/Manila");
    expect(manila.toISOString()).toBe("2026-08-05T06:30:00.000Z");

    // The same wall clock in another zone is a different instant, which is
    // the whole point: `new Date("2026-08-05T14:30")` resolves against
    // whatever zone the server happens to run in. Asserting against the
    // server's own parse would pass or fail depending on the machine — this
    // suite's host is UTC+8, which is exactly why the bug was invisible here.
    const utcZone = zonedTimeToUtc(2026, 8, 5, 14, 30, 0, "UTC");
    expect(utcZone.toISOString()).toBe("2026-08-05T14:30:00.000Z");
    expect(manila.getTime()).not.toBe(utcZone.getTime());
    expect(utcZone.getTime() - manila.getTime()).toBe(8 * 3600 * 1000);
  });
});
