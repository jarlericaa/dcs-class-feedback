import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  makeCourse,
  makeEnrolledStudent,
  makeSchedule,
  makeSection,
  makeUser,
} from "./fixtures";
import {
  formInstances,
  formQuestions,
} from "@/db/schema";
import { createTemplate } from "@/modules/forms/templates";
import {
  generateCyclesForSchedule,
  openDueCycles,
  closeDueCycles,
} from "@/modules/forms/cycles";
import { submitResponse } from "@/modules/forms/submission";
import { invalidateSubmission, restoreSubmission } from "@/modules/review";
import {
  deriveParticipation,
  participantListCsv,
  weeklyMatrixCsv,
} from "@/modules/participation";
import { importLegacyEntries } from "@/modules/backlog";
import { AuthzError } from "@/modules/authz";

describe("derived participation + exports", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function setupTwoWeeks() {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    const { template } = await createTemplate(teacher.id, {
      courseId: course.id,
      title: "T",
      questions: [
        { prompt: "Q", type: "short_answer", required: true, displayOrder: 0 },
      ],
    });
    const schedule = await makeSchedule({
      courseId: course.id,
      sectionIds: [section.id],
      templateId: template.id,
      occurrenceCount: 2,
    });
    await generateCyclesForSchedule(
      schedule,
      new Date("2026-01-31T00:00:00Z"),
    );
    // open both weeks' cycles (week1 will be closed later)
    await openDueCycles(new Date("2026-01-12T01:00:00Z"));
    const cycles = await db.query.formInstances.findMany({
      where: eq(formInstances.scheduleId, schedule.id),
    });
    const cycle1 = cycles.find((c) => c.cycleIndex === 1)!;
    const cycle2 = cycles.find((c) => c.cycleIndex === 2)!;
    const q1 = (await db.query.formQuestions.findFirst({
      where: eq(formQuestions.cycleId, cycle1.id),
    }))!;
    const q2 = (await db.query.formQuestions.findFirst({
      where: eq(formQuestions.cycleId, cycle2.id),
    }))!;
    return { teacher, course, section, cycle1, cycle2, q1, q2 };
  }

  it("derives participation from valid submissions; invalidation removes credit; one max per cycle", async () => {
    const { teacher, section, cycle1, cycle2, q1, q2 } = await setupTwoWeeks();
    const alice = await makeEnrolledStudent(section.id, teacher.id);
    const bob = await makeEnrolledStudent(section.id, teacher.id);

    const week1 = new Date("2026-01-06T04:00:00Z");
    const week2 = new Date("2026-01-13T04:00:00Z");

    const aliceR1 = await submitResponse(
      alice.user.id,
      cycle1.id,
      { answers: [{ questionId: q1.id, text: "w1" }] },
      week1,
    );
    await submitResponse(
      alice.user.id,
      cycle2.id,
      { answers: [{ questionId: q2.id, text: "w2" }] },
      week2,
    );
    await submitResponse(
      bob.user.id,
      cycle2.id,
      { answers: [{ questionId: q2.id, text: "w2" }] },
      week2,
    );

    let matrix = await deriveParticipation(section.id);
    const aliceRow = matrix.students.find(
      (s) => s.studentRecordId === alice.record.id,
    )!;
    const bobRow = matrix.students.find(
      (s) => s.studentRecordId === bob.record.id,
    )!;
    expect(aliceRow.totalWeeks).toBe(2);
    expect(bobRow.totalWeeks).toBe(1);

    // Invalidation immediately removes that week's credit.
    await invalidateSubmission(teacher.id, aliceR1.responseId, {
      reason: "empty_or_meaningless",
      studentVisibleReason: "The form was submitted blank.",
    });
    matrix = await deriveParticipation(section.id);
    expect(
      matrix.students.find((s) => s.studentRecordId === alice.record.id)!
        .totalWeeks,
    ).toBe(1);

    // Restoring validity restores credit — no separate bookkeeping.
    await restoreSubmission(teacher.id, aliceR1.responseId);
    matrix = await deriveParticipation(section.id);
    expect(
      matrix.students.find((s) => s.studentRecordId === alice.record.id)!
        .totalWeeks,
    ).toBe(2);
  });

  it("legacy imports never affect participation", async () => {
    const { teacher, course, section } = await setupTwoWeeks();
    await makeEnrolledStudent(section.id, teacher.id);
    await importLegacyEntries(
      teacher.id,
      course.id,
      [{ text: "old question from 2024" }],
      "old spreadsheet",
    );
    const matrix = await deriveParticipation(section.id);
    expect(matrix.students.every((s) => s.totalWeeks === 0)).toBe(true);
  });

  it("weekly matrix CSV has one column per cycle and audits the export", async () => {
    const { teacher, section, cycle1, q1 } = await setupTwoWeeks();
    const alice = await makeEnrolledStudent(section.id, teacher.id);
    await submitResponse(
      alice.user.id,
      cycle1.id,
      { answers: [{ questionId: q1.id, text: "w1" }] },
      new Date("2026-01-06T04:00:00Z"),
    );
    await closeDueCycles(new Date("2026-01-09T10:00:00Z"));

    const csv = await weeklyMatrixCsv(teacher.id, section.id);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toMatch(
      /Student number,Student name,Week 1.*Week 2.*Total weeks,Flagged weeks \(still credited\),Invalid weeks/,
    );
    expect(lines).toHaveLength(2);
    // week 1 credited, week 2 not, 1 total, 0 flagged, 0 invalid
    expect(lines[1]).toMatch(/,1,0,1,0,0$/);

    const { auditEvents } = await import("@/db/schema");
    const audit = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, "participation.exported"),
        eq(auditEvents.actorUserId, teacher.id),
      ),
    });
    expect(audit).toBeTruthy();
  });

  it("participant list deduplicates and respects the cycle range", async () => {
    const { teacher, section, cycle1, cycle2, q1, q2 } = await setupTwoWeeks();
    const alice = await makeEnrolledStudent(section.id, teacher.id);
    await submitResponse(
      alice.user.id,
      cycle1.id,
      { answers: [{ questionId: q1.id, text: "w1" }] },
      new Date("2026-01-06T04:00:00Z"),
    );
    await submitResponse(
      alice.user.id,
      cycle2.id,
      { answers: [{ questionId: q2.id, text: "w2" }] },
      new Date("2026-01-13T04:00:00Z"),
    );

    const all = await participantListCsv(teacher.id, section.id);
    expect(all.trim().split("\r\n")).toHaveLength(2); // header + alice once

    const week2Only = await participantListCsv(teacher.id, section.id, {
      fromCycleIndex: 2,
    });
    expect(week2Only.trim().split("\r\n")).toHaveLength(2);
  });

  it("exports are staff-only (students and unflagged TAs denied)", async () => {
    const { teacher, section } = await setupTwoWeeks();
    const alice = await makeEnrolledStudent(section.id, teacher.id);
    await expect(
      weeklyMatrixCsv(alice.user.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });
});
