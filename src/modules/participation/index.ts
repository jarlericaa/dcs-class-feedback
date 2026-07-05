import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  enrollments,
  formQuestions,
  formResponses,
  privateResponses,
  questionAnswers,
  sourceLinks,
  studentRecords,
  studentSubmissionItems,
  weeklyCycles,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { requireSectionStaff } from "@/modules/authz";

/**
 * Derived participation (participation-rules.md §3): there is NO stored
 * participation table. A student participated in a cycle iff a FormResponse
 * exists for (cycle, student) with validity Valid. (All review states count —
 * review progress is independent of participation.) Marking a response
 * invalid removes the credit with no separate bookkeeping. Legacy/backlog
 * items never create responses, so they can never count.
 *
 * All three exports are identity-bearing → staff-only via the
 * exportParticipation flag, and every access is audited (Risk R4).
 */

export interface ParticipationMatrix {
  cycles: { id: string; cycleIndex: number; openAt: Date }[];
  students: {
    studentRecordId: string;
    studentNumber: string;
    fullName: string;
    participatedCycleIds: Set<string>;
    totalWeeks: number;
  }[];
}

export async function deriveParticipation(
  sectionId: string,
): Promise<ParticipationMatrix> {
  const cycles = await db.query.weeklyCycles.findMany({
    where: and(
      eq(weeklyCycles.sectionId, sectionId),
      // skipped/draft cycles never collected anything
      inArray(weeklyCycles.state, ["open", "closed", "archived"]),
    ),
    orderBy: asc(weeklyCycles.cycleIndex),
  });
  const enrolled = await db
    .select({
      studentRecordId: enrollments.studentRecordId,
      studentNumber: studentRecords.studentNumber,
      fullName: studentRecords.fullName,
    })
    .from(enrollments)
    .innerJoin(
      studentRecords,
      eq(studentRecords.id, enrollments.studentRecordId),
    )
    .where(eq(enrollments.sectionId, sectionId))
    .orderBy(asc(studentRecords.fullName));

  const responses = cycles.length
    ? await db.query.formResponses.findMany({
        where: and(
          inArray(
            formResponses.cycleId,
            cycles.map((c) => c.id),
          ),
          eq(formResponses.validity, "valid"),
        ),
      })
    : [];
  const byStudent = new Map<string, Set<string>>();
  for (const r of responses) {
    const set = byStudent.get(r.studentRecordId) ?? new Set<string>();
    set.add(r.cycleId);
    byStudent.set(r.studentRecordId, set);
  }

  return {
    cycles: cycles.map((c) => ({
      id: c.id,
      cycleIndex: c.cycleIndex,
      openAt: c.openAt,
    })),
    students: enrolled.map((s) => {
      const participated = byStudent.get(s.studentRecordId) ?? new Set<string>();
      return {
        ...s,
        participatedCycleIds: participated,
        totalWeeks: participated.size,
      };
    }),
  };
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

async function auditExport(
  actorUserId: string,
  sectionId: string,
  report: string,
) {
  await writeAudit(db, {
    actorUserId,
    action: "participation.exported",
    entityType: "class_section",
    entityId: sectionId,
    metadata: { report },
  });
}

/** 4.1 Weekly participation matrix: one row per student, one column per cycle. */
export async function weeklyMatrixCsv(
  actorUserId: string,
  sectionId: string,
): Promise<string> {
  await requireSectionStaff(db, actorUserId, sectionId, "exportParticipation");
  const matrix = await deriveParticipation(sectionId);
  const header = [
    "Student number",
    "Student name",
    ...matrix.cycles.map(
      (c) => `Week ${c.cycleIndex} (${c.openAt.toISOString().slice(0, 10)})`,
    ),
    "Total weeks",
  ];
  const rows = matrix.students.map((s) => [
    s.studentNumber,
    s.fullName,
    ...matrix.cycles.map((c) => (s.participatedCycleIds.has(c.id) ? "1" : "0")),
    s.totalWeeks,
  ]);
  await auditExport(actorUserId, sectionId, "weekly_matrix");
  return toCsv([header, ...rows]);
}

/** 4.2 Deduplicated participating-student list for a cycle range. */
export async function participantListCsv(
  actorUserId: string,
  sectionId: string,
  opts: { fromCycleIndex?: number; toCycleIndex?: number } = {},
): Promise<string> {
  await requireSectionStaff(db, actorUserId, sectionId, "exportParticipation");
  const matrix = await deriveParticipation(sectionId);
  const inRange = matrix.cycles.filter(
    (c) =>
      (opts.fromCycleIndex === undefined || c.cycleIndex >= opts.fromCycleIndex) &&
      (opts.toCycleIndex === undefined || c.cycleIndex <= opts.toCycleIndex),
  );
  const ids = new Set(inRange.map((c) => c.id));
  const participants = matrix.students.filter((s) =>
    [...s.participatedCycleIds].some((cid) => ids.has(cid)),
  );
  await auditExport(actorUserId, sectionId, "participant_list");
  return toCsv([
    ["Student number", "Student name"],
    ...participants.map((s) => [s.studentNumber, s.fullName]),
  ]);
}

/**
 * 4.3 Detailed response export — labels AND stable ids for choice answers;
 * validity + (staff-only) invalidation reason; response indicators.
 */
export async function detailedResponseCsv(
  actorUserId: string,
  sectionId: string,
): Promise<string> {
  await requireSectionStaff(db, actorUserId, sectionId, "exportParticipation");

  const cycles = await db.query.weeklyCycles.findMany({
    where: eq(weeklyCycles.sectionId, sectionId),
    orderBy: asc(weeklyCycles.cycleIndex),
  });
  const cycleById = new Map(cycles.map((c) => [c.id, c]));
  const responses = cycles.length
    ? await db.query.formResponses.findMany({
        where: inArray(
          formResponses.cycleId,
          cycles.map((c) => c.id),
        ),
      })
    : [];

  const header = [
    "Student number",
    "Student name",
    "Weekly cycle",
    "Submitted at",
    "Question stable id",
    "Question text",
    "Answer (labels)",
    "Answer (stable ids)",
    "Student-originated text",
    "Submission type",
    "Category",
    "Validity",
    "Invalidation reason",
    "Private response",
    "Publicly published",
  ];
  const rows: (string | number | null)[][] = [];

  for (const response of responses) {
    const student = (await db.query.studentRecords.findFirst({
      where: eq(studentRecords.id, response.studentRecordId),
    }))!;
    const cycle = cycleById.get(response.cycleId)!;
    const answers = await db.query.questionAnswers.findMany({
      where: eq(questionAnswers.responseId, response.id),
    });
    const items = await db.query.studentSubmissionItems.findMany({
      where: eq(studentSubmissionItems.responseId, response.id),
    });

    const base = [
      student.studentNumber,
      student.fullName,
      `Week ${cycle.cycleIndex}`,
      response.submittedAt.toISOString(),
    ];

    for (const answer of answers) {
      const question = (await db.query.formQuestions.findFirst({
        where: eq(formQuestions.id, answer.questionId),
      }))!;
      const value = (answer.value ?? {}) as {
        optionIds?: string[];
        optionLabels?: string[];
        scaleValue?: number;
        boolValue?: boolean;
        dateValue?: string;
        timeValue?: string;
      };
      const labels =
        answer.freeText ??
        value.optionLabels?.join("; ") ??
        value.scaleValue?.toString() ??
        (value.boolValue !== undefined ? (value.boolValue ? "Yes" : "No") : null) ??
        value.dateValue ??
        value.timeValue ??
        "";
      rows.push([
        ...base,
        question.stableKey,
        question.prompt,
        labels,
        value.optionIds?.join("; ") ?? "",
        null,
        null,
        null,
        response.validity,
        response.invalidationReason,
        null,
        null,
      ]);
    }

    for (const item of items) {
      const privateCount = await db.query.privateResponses.findMany({
        where: eq(privateResponses.itemId, item.id),
      });
      const links = await db.query.sourceLinks.findMany({
        where: eq(sourceLinks.itemId, item.id),
      });
      rows.push([
        ...base,
        null,
        null,
        null,
        null,
        item.originalText,
        item.submissionType,
        item.category,
        response.validity,
        response.invalidationReason,
        privateCount.length > 0 ? "yes" : "no",
        links.length > 0 ? "yes" : "no",
      ]);
    }
  }

  await auditExport(actorUserId, sectionId, "detailed_responses");
  return toCsv([header, ...rows]);
}
