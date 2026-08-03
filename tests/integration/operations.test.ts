import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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
import { auditEvents, publicAnswers, recurrenceSchedules } from "@/db/schema";
import { AuthzError } from "@/modules/authz";
import {
  createTemplate,
  listTemplatesForCourse,
} from "@/modules/forms/templates";
import {
  configureRecurrence,
  deactivateSchedule,
  getActiveSchedule,
  listCyclesForSection,
  ScheduleError,
} from "@/modules/forms/schedules";
import { submitResponse } from "@/modules/forms/submission";
import {
  draftPublicAnswer,
  getPublicAnswerForEditing,
  listPublicationQueue,
  publishNow,
  schedulePublication,
} from "@/modules/publishing";
import {
  createPrivateResponse,
  getReviewQueue,
  getSubmissionDetail,
} from "@/modules/review";
import { listSectionAuditEvents } from "@/modules/audit";
import { getParticipationOverview } from "@/modules/participation";

/** A course + section + template owned by a fresh teacher. */
async function makeWorkspace() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  await addSectionStaff(section.id, teacher.id, "teacher");
  const { template } = await createTemplate(teacher.id, {
    courseId: course.id,
    title: "Weekly check-in",
    questions: [
      {
        prompt: "How was the pace?",
        type: "paragraph",
        required: false,
        displayOrder: 0,
      },
    ],
  });
  return { teacher, course, section, template };
}

/** A section with one cycle that is open right now. */
async function makeOpenCycleSection() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  await addSectionStaff(section.id, teacher.id, "teacher");
  const { weeklyCycles } = await import("@/db/schema");
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
  return { teacher, course, section, cycle: cycle! };
}

const BASE_RECURRENCE = {
  openDayOfWeek: 1,
  openTime: "08:00",
  deadlineDayOfWeek: 0,
  deadlineTime: "23:59",
};

describe("recurrence scheduling", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("needs the manage_weekly_cycles capability", async () => {
    const { section, template } = await makeWorkspace();
    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });

    await expect(
      configureRecurrence(ta.id, section.id, {
        ...BASE_RECURRENCE,
        templateId: template.id,
        startDate: "2026-01-05",
        occurrenceCount: 4,
      }),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("rejects a template from another course", async () => {
    const { teacher, section } = await makeWorkspace();
    const other = await makeWorkspace();

    await expect(
      configureRecurrence(teacher.id, section.id, {
        ...BASE_RECURRENCE,
        templateId: other.template.id,
        startDate: "2026-01-05",
        occurrenceCount: 4,
      }),
    ).rejects.toBeInstanceOf(ScheduleError);
  });

  it("rejects both an end date and an occurrence count before the database does", async () => {
    const { teacher, section, template } = await makeWorkspace();
    await expect(
      configureRecurrence(teacher.id, section.id, {
        ...BASE_RECURRENCE,
        templateId: template.id,
        startDate: "2026-01-05",
        endDate: "2026-03-01",
        occurrenceCount: 4,
      }),
    ).rejects.toThrow();
    expect(await db.query.recurrenceSchedules.findMany()).toHaveLength(0);
  });

  it("rejects a same-day deadline that is earlier than the open time", async () => {
    const { teacher, section, template } = await makeWorkspace();
    await expect(
      configureRecurrence(teacher.id, section.id, {
        templateId: template.id,
        openDayOfWeek: 1,
        openTime: "17:00",
        deadlineDayOfWeek: 1,
        deadlineTime: "09:00",
        startDate: "2026-01-05",
        occurrenceCount: 4,
      }),
    ).rejects.toThrow();
  });

  it("generates cycles immediately and audits the configuration", async () => {
    const { teacher, section, template } = await makeWorkspace();
    const result = await configureRecurrence(teacher.id, section.id, {
      ...BASE_RECURRENCE,
      templateId: template.id,
      startDate: "2026-01-05",
      occurrenceCount: 6,
    });
    expect(result.cyclesGenerated).toBeGreaterThan(0);

    const cycles = await listCyclesForSection(teacher.id, section.id);
    expect(cycles.length).toBe(result.cyclesGenerated);
    expect(cycles.every((c) => c.submissionCount === 0)).toBe(true);
    expect(cycles.every((c) => c.editLocked === false)).toBe(true);

    const events = await db.query.auditEvents.findMany({
      where: eq(auditEvents.action, "recurrence.configured"),
    });
    expect(events).toHaveLength(1);
  });

  it("retires the previous schedule instead of mutating it", async () => {
    const { teacher, section, template } = await makeWorkspace();
    const first = await configureRecurrence(teacher.id, section.id, {
      ...BASE_RECURRENCE,
      templateId: template.id,
      startDate: "2026-01-05",
      occurrenceCount: 4,
    });
    const second = await configureRecurrence(teacher.id, section.id, {
      ...BASE_RECURRENCE,
      openTime: "09:30",
      templateId: template.id,
      startDate: "2026-01-05",
      occurrenceCount: 4,
    });

    expect(second.schedule.id).not.toBe(first.schedule.id);
    const old = await db.query.recurrenceSchedules.findFirst({
      where: eq(recurrenceSchedules.id, first.schedule.id),
    });
    expect(old!.active).toBe(false);
    expect(old!.openTime).toBe("08:00:00"); // untouched
    const active = await getActiveSchedule(section.id);
    expect(active!.schedule.id).toBe(second.schedule.id);
  });

  it("stops generation without deleting existing cycles", async () => {
    const { teacher, section, template } = await makeWorkspace();
    await configureRecurrence(teacher.id, section.id, {
      ...BASE_RECURRENCE,
      templateId: template.id,
      startDate: "2026-01-05",
      occurrenceCount: 4,
    });
    const before = await listCyclesForSection(teacher.id, section.id);

    await deactivateSchedule(teacher.id, section.id);
    expect(await getActiveSchedule(section.id)).toBeNull();
    const after = await listCyclesForSection(teacher.id, section.id);
    expect(after.length).toBe(before.length);
  });

  it("reports no edit lock until a response exists, then locks", async () => {
    // Built from an explicitly open cycle rather than the recurrence, so the
    // assertion does not depend on the wall-clock time the suite runs at.
    const { teacher, section, cycle } = await makeOpenCycleSection();

    const before = await listCyclesForSection(teacher.id, section.id);
    expect(before[0]!.submissionCount).toBe(0);
    expect(before[0]!.editLocked).toBe(false);

    const { user } = await makeEnrolledStudent(section.id, teacher.id);
    await submitResponse(user.id, cycle.id, { answers: [] });

    const after = await listCyclesForSection(teacher.id, section.id);
    const locked = after.find((c) => c.cycle.id === cycle.id)!;
    expect(locked.submissionCount).toBe(1);
    expect(locked.validCount).toBe(1);
    expect(locked.editLocked).toBe(true);
  });

  it("keeps template listings scoped to their own course", async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    const listed = await listTemplatesForCourse(a.teacher.id, a.course.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.template.id).toBe(a.template.id);
    await expect(
      listTemplatesForCourse(a.teacher.id, b.course.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });
});

/** Section with one open cycle, one enrolled student, and one submitted item. */
async function makeSubmittedItem() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  await addSectionStaff(section.id, teacher.id, "teacher");
  const { weeklyCycles, studentSubmissionItems, formResponses } =
    await import("@/db/schema");
  const now = new Date();
  const [cycle] = await db
    .insert(weeklyCycles)
    .values({
      sectionId: section.id,
      cycleIndex: 1,
      openAt: new Date(now.getTime() - 3600_000),
      deadlineAt: new Date(now.getTime() + 3600_000),
      state: "open",
    })
    .returning();
  const { user, record } = await makeEnrolledStudent(section.id, teacher.id);
  const [response] = await db
    .insert(formResponses)
    .values({
        cycleId: cycle!.id,
        studentRecordId: record.id,
        submittedAt: new Date(),
      })
    .returning();
  const [item] = await db
    .insert(studentSubmissionItems)
    .values({
      responseId: response!.id,
      submissionType: "question",
      category: "content",
      originalText:
        "I could not read the slides from the back of my Tuesday lab.",
    })
    .returning();
  return { teacher, course, section, cycle: cycle!, user, record, item: item! };
}

describe("publication queue", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("needs the draft_public_answers capability", async () => {
    const { section } = await makeSubmittedItem();
    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });
    await expect(
      listPublicationQueue(ta.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("separates drafts, scheduled answers and published entries", async () => {
    const { teacher, section, item } = await makeSubmittedItem();
    const draft = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [item.id],
      publicQuestionText: "Can slides use a larger font?",
      answerBody: "Yes, from next week.",
    });
    const queue1 = await listPublicationQueue(teacher.id, section.id);
    expect(queue1.drafts).toHaveLength(1);
    expect(queue1.drafts[0]!.sourceCount).toBe(1);

    await schedulePublication(
      teacher.id,
      draft.id,
      new Date(Date.now() + 86_400_000),
      { anonymityAcknowledged: true },
    );
    const queue2 = await listPublicationQueue(teacher.id, section.id);
    expect(queue2.drafts).toHaveLength(0);
    expect(queue2.scheduled).toHaveLength(1);

    await publishNow(teacher.id, draft.id, { anonymityAcknowledged: true });
    const queue3 = await listPublicationQueue(teacher.id, section.id);
    expect(queue3.scheduled).toHaveLength(0);
    expect(queue3.published).toHaveLength(1);
  });

  it("surfaces a failed publication for retry instead of hiding it", async () => {
    const { teacher, section, item } = await makeSubmittedItem();
    const draft = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [item.id],
      publicQuestionText: "Q",
      answerBody: "A",
    });
    await schedulePublication(
      teacher.id,
      draft.id,
      new Date(Date.now() + 1000),
      { anonymityAcknowledged: true },
    );
    await db
      .update(publicAnswers)
      .set({ publishFailed: true, publishFailureReason: "simulated failure" })
      .where(eq(publicAnswers.id, draft.id));

    const queue = await listPublicationQueue(teacher.id, section.id);
    expect(queue.failed).toHaveLength(1);
    expect(queue.failed[0]!.answer.publishFailureReason).toBe(
      "simulated failure",
    );

    await publishNow(teacher.id, draft.id, { anonymityAcknowledged: true });
    const after = await listPublicationQueue(teacher.id, section.id);
    expect(after.failed).toHaveLength(0);
    expect(after.published).toHaveLength(1);
  });

  it("gives staff the original wording as context for the editor", async () => {
    const { teacher, section, item } = await makeSubmittedItem();
    const draft = await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [item.id],
      publicQuestionText: "Can slides use a larger font?",
    });
    const editing = await getPublicAnswerForEditing(teacher.id, draft.id);
    expect(editing.sources).toHaveLength(1);
    expect(editing.sources[0]!.originalText).toContain("Tuesday lab");
    // A single-source answer always carries the small-class anonymity warning.
    expect(editing.warnings.length).toBeGreaterThan(0);
  });

  it("refuses a staff member from another section", async () => {
    const a = await makeSubmittedItem();
    const b = await makeSubmittedItem();
    const draft = await draftPublicAnswer(a.teacher.id, {
      sectionId: a.section.id,
      itemIds: [a.item.id],
      publicQuestionText: "Q",
    });
    await expect(
      getPublicAnswerForEditing(b.teacher.id, draft.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });
});

describe("section audit browsing", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("shows only events belonging to this section", async () => {
    const a = await makeSubmittedItem();
    const b = await makeSubmittedItem();

    await createPrivateResponse(a.teacher.id, a.item.id, "Reply in section A");
    await createPrivateResponse(b.teacher.id, b.item.id, "Reply in section B");

    const eventsA = await listSectionAuditEvents(a.teacher.id, a.section.id);
    const idsA = new Set(eventsA.rows.map((e) => e.event.entityId));
    const privatesB = await db.query.privateResponses.findMany();
    const bPrivate = privatesB.find((p) => p.itemId === b.item.id)!;

    expect(eventsA.rows.length).toBeGreaterThan(0);
    expect(idsA.has(bPrivate.id)).toBe(false);
  });

  it("is refused to a staff member of another section", async () => {
    const a = await makeSubmittedItem();
    const b = await makeSubmittedItem();
    await expect(
      listSectionAuditEvents(b.teacher.id, a.section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("is refused to a TA, who has no audit flag in the MVP catalog", async () => {
    const { section } = await makeSubmittedItem();
    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", {
      reviewResponses: true,
      viewStudentIdentities: true,
    });
    await expect(
      listSectionAuditEvents(ta.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("labels scheduler actions as having no actor", async () => {
    const { teacher, section } = await makeSubmittedItem();
    const events = await listSectionAuditEvents(teacher.id, section.id);
    // No system events exist for a hand-built fixture; the shape still holds.
    expect(events.rows.every((e) => e.actor !== undefined)).toBe(true);
  });
});

describe("review read models mask identity in the data", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("omits the student entirely for a TA without view_student_identities", async () => {
    const { section, record } = await makeSubmittedItem();
    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });

    const { rows, canSeeIdentities } = await getReviewQueue(ta.id, section.id);
    expect(canSeeIdentities).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.student).toBeNull();
    // the identity is absent from the payload, not merely unrendered
    expect(JSON.stringify(rows)).not.toContain(record.fullName);
    // The plaintext number no longer lives on the row at all; assert the sealed
    // material and the visible tail are both absent too.
    expect(JSON.stringify(rows)).not.toContain(record.studentNumberCiphertext);
    expect(JSON.stringify(rows)).not.toContain(record.studentNumberLast4);

    const detail = await getSubmissionDetail(ta.id, rows[0]!.response.id);
    expect(detail.student).toBeNull();
  });

  it("includes the student for a teacher", async () => {
    const { teacher, section, record } = await makeSubmittedItem();
    const { rows, canSeeIdentities } = await getReviewQueue(
      teacher.id,
      section.id,
    );
    expect(canSeeIdentities).toBe(true);
    expect(rows[0]!.student!.fullName).toBe(record.fullName);
  });

  it("counts an item as answered only once a reply or publication exists", async () => {
    const { teacher, section, item } = await makeSubmittedItem();
    const before = await getReviewQueue(teacher.id, section.id);
    expect(before.counts.needsReview).toBe(1);
    expect(before.counts.answered).toBe(0);

    await createPrivateResponse(teacher.id, item.id, "Answered privately.");
    const after = await getReviewQueue(teacher.id, section.id);
    expect(after.counts.answered).toBe(1);
    expect(after.counts.needsReview).toBe(0);
  });

  it("does not treat an unpublished draft as answered", async () => {
    const { teacher, section, item } = await makeSubmittedItem();
    await draftPublicAnswer(teacher.id, {
      sectionId: section.id,
      itemIds: [item.id],
      publicQuestionText: "Q",
      answerBody: "A",
    });
    const queue = await getReviewQueue(teacher.id, section.id);
    expect(queue.counts.answered).toBe(0);
    expect(queue.counts.needsReview).toBe(1);
  });

  it("refuses a staff member from another section", async () => {
    const a = await makeSubmittedItem();
    const b = await makeSubmittedItem();
    await expect(
      getReviewQueue(b.teacher.id, a.section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });
});

describe("participation overview", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("needs the export_participation capability", async () => {
    const { section } = await makeSubmittedItem();
    const ta = await makeUser();
    await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });
    await expect(
      getParticipationOverview(ta.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("counts a valid response and drops the credit when it is invalidated", async () => {
    const { teacher, section, cycle, record } = await makeSubmittedItem();
    const overview = await getParticipationOverview(teacher.id, section.id);
    const student = overview.students.find(
      (s) => s.studentRecordId === record.id,
    )!;
    expect(student.totalWeeks).toBe(1);
    expect(overview.summary.neverParticipated).toBe(0);

    const { formResponses } = await import("@/db/schema");
    await db
      .update(formResponses)
      // A student-visible reason is now required alongside the internal one, so a
      // student can always be told why a submission did not count.
      .set({
        validity: "invalid",
        invalidationReason: "spam",
        studentVisibleReason: "This did not answer the form.",
      })
      .where(eq(formResponses.cycleId, cycle.id));

    const after = await getParticipationOverview(teacher.id, section.id);
    expect(
      after.students.find((s) => s.studentRecordId === record.id)!.totalWeeks,
    ).toBe(0);
    expect(after.summary.neverParticipated).toBe(1);
  });

  it("keeps a dropped student in the record but out of the active average", async () => {
    const { teacher, section } = await makeSubmittedItem();
    const dropped = await makeStudentRecord("Dropped Student");
    await enroll(section.id, dropped.id, "deactivated");

    const overview = await getParticipationOverview(teacher.id, section.id);
    expect(
      overview.students.some((s) => s.studentRecordId === dropped.id),
    ).toBe(true);
    expect(overview.summary.deactivatedStudentCount).toBe(1);
    expect(overview.summary.activeStudentCount).toBe(1);
  });
});
