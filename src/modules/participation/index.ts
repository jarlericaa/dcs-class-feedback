import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  enrollments,
  formQuestions,
  formResponses,
  privateResponses,
  publicAnswers,
  questionAnswers,
  sourceLinks,
  studentRecords,
  studentSubmissionItems,
  weeklyCycles,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { requireSectionStaff } from "@/modules/authz";
import { toCsv } from "@/modules/exports/tabular";
import { revealStudentNumber } from "@/modules/crypto/student-number";

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
  cycles: {
    id: string;
    cycleIndex: number;
    openAt: Date;
    bonusPeriodId: string | null;
  }[];
  students: {
    studentRecordId: string;
    /** sealed; decrypt through revealStudentNumber only where authorized */
    studentNumberCiphertext: string | null;
    /** safe for staff list views without decrypting the table */
    studentNumberLast4: string | null;
    fullName: string;
    /** cycles that earned credit (valid OR flagged — decision D15) */
    participatedCycleIds: Set<string>;
    /** flagged but still credited; STAFF-ONLY, never in a student payload */
    flaggedCycleIds: Set<string>;
    invalidCycleIds: Set<string>;
    /** cycleId → the reasons; studentVisible is the only student-readable one */
    invalidReasons: Map<
      string,
      { staffReason: string | null; studentVisibleReason: string | null }
    >;
    totalWeeks: number;
  }[];
}

/**
 * Derivation primitive — deliberately unauthorized, like every other `derive*`
 * here. Callers authorize; this only computes.
 *
 * Credit rule (participation-rules.md §3): a response counts when its lifecycle
 * is `submitted` or `locked` (a draft is not a submission) AND its validity is
 * not `invalid` (so a `flagged` response still counts, because a flag is an
 * unconfirmed suspicion — decision D15).
 */
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
      studentNumberCiphertext: studentRecords.studentNumberCiphertext,
      studentNumberLast4: studentRecords.studentNumberLast4,
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
          inArray(formResponses.lifecycle, ["submitted", "locked"]),
        ),
      })
    : [];
  const credited = new Map<string, Set<string>>();
  const flagged = new Map<string, Set<string>>();
  const invalid = new Map<string, Set<string>>();
  const reasons = new Map<
    string,
    Map<string, { staffReason: string | null; studentVisibleReason: string | null }>
  >();
  const add = (map: Map<string, Set<string>>, key: string, value: string) => {
    const set = map.get(key) ?? new Set<string>();
    set.add(value);
    map.set(key, set);
  };
  for (const r of responses) {
    if (r.validity === "invalid") {
      add(invalid, r.studentRecordId, r.cycleId);
      const perStudent = reasons.get(r.studentRecordId) ?? new Map();
      perStudent.set(r.cycleId, {
        staffReason: r.invalidationReason ?? null,
        studentVisibleReason: r.studentVisibleReason ?? null,
      });
      reasons.set(r.studentRecordId, perStudent);
      continue;
    }
    if (r.validity === "flagged") add(flagged, r.studentRecordId, r.cycleId);
    add(credited, r.studentRecordId, r.cycleId);
  }

  return {
    cycles: cycles.map((c) => ({
      id: c.id,
      cycleIndex: c.cycleIndex,
      openAt: c.openAt,
      bonusPeriodId: c.bonusPeriodId,
    })),
    students: enrolled.map((s) => {
      const participated = credited.get(s.studentRecordId) ?? new Set<string>();
      return {
        ...s,
        participatedCycleIds: participated,
        flaggedCycleIds: flagged.get(s.studentRecordId) ?? new Set<string>(),
        invalidCycleIds: invalid.get(s.studentRecordId) ?? new Set<string>(),
        invalidReasons: reasons.get(s.studentRecordId) ?? new Map(),
        totalWeeks: participated.size,
      };
    }),
  };
}

/**
 * Participation dashboard read model. Identity-bearing, so it needs the same
 * `export_participation` capability as the CSVs (Risk R4). Viewing is not
 * audited; producing a file is — see auditExport.
 */
export async function getParticipationOverview(
  actorUserId: string,
  sectionId: string,
) {
  await requireSectionStaff(db, actorUserId, sectionId, "exportParticipation", { allowArchived: true });
  const matrix = await deriveParticipation(sectionId);
  const activeEnrollments = await db.query.enrollments.findMany({
    where: and(
      eq(enrollments.sectionId, sectionId),
      eq(enrollments.status, "active"),
    ),
  });
  const activeIds = new Set(activeEnrollments.map((e) => e.studentRecordId));
  const cycleCount = matrix.cycles.length;
  const students = matrix.students.map((s) => ({
    ...s,
    active: activeIds.has(s.studentRecordId),
    rate: cycleCount === 0 ? 0 : s.totalWeeks / cycleCount,
  }));
  const activeStudents = students.filter((s) => s.active);
  return {
    cycles: matrix.cycles,
    students,
    summary: {
      cycleCount,
      activeStudentCount: activeStudents.length,
      deactivatedStudentCount: students.length - activeStudents.length,
      /** mean weeks participated across ACTIVE students only */
      averageWeeks:
        activeStudents.length === 0
          ? 0
          : activeStudents.reduce((sum, s) => sum + s.totalWeeks, 0) /
            activeStudents.length,
      neverParticipated: activeStudents.filter((s) => s.totalWeeks === 0).length,
    },
  };
}

/**
 * Plaintext student number for an identity-bearing export row.
 *
 * These three reports are already gated on `exportParticipation` and audited, so
 * revealing here is authorized. A record that predates the encryption backfill
 * degrades to its last four characters rather than failing the whole export.
 */
function studentNumberOf(row: {
  studentRecordId: string;
  studentNumberCiphertext: string | null;
  studentNumberLast4: string | null;
}): string {
  try {
    return revealStudentNumber({
      id: row.studentRecordId,
      studentNumberCiphertext: row.studentNumberCiphertext,
    });
  } catch {
    return row.studentNumberLast4 ? `…${row.studentNumberLast4}` : "";
  }
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
  await requireSectionStaff(db, actorUserId, sectionId, "exportParticipation", { allowArchived: true });
  const matrix = await deriveParticipation(sectionId);
  const header = [
    "Student number",
    "Student name",
    ...matrix.cycles.map(
      (c) => `Week ${c.cycleIndex} (${c.openAt.toISOString().slice(0, 10)})`,
    ),
    "Total weeks",
    "Flagged weeks (still credited)",
    "Invalid weeks",
  ];
  const rows = matrix.students.map((s) => [
    studentNumberOf(s),
    s.fullName,
    ...matrix.cycles.map((c) => (s.participatedCycleIds.has(c.id) ? "1" : "0")),
    s.totalWeeks,
    s.flaggedCycleIds.size,
    s.invalidCycleIds.size,
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
  await requireSectionStaff(db, actorUserId, sectionId, "exportParticipation", { allowArchived: true });
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
    ...participants.map((s) => [studentNumberOf(s), s.fullName]),
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
  await requireSectionStaff(db, actorUserId, sectionId, "exportParticipation", { allowArchived: true });

  const cycles = await db.query.weeklyCycles.findMany({
    where: eq(weeklyCycles.sectionId, sectionId),
    orderBy: asc(weeklyCycles.cycleIndex),
  });
  const cycleById = new Map(cycles.map((c) => [c.id, c]));
  const responses = cycles.length
    ? await db.query.formResponses.findMany({
        // Drafts are not submissions: they must not appear in a staff export.
        where: and(
          inArray(
            formResponses.cycleId,
            cycles.map((c) => c.id),
          ),
          inArray(formResponses.lifecycle, ["submitted", "locked"]),
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
    "Invalidation reason (staff-only)",
    "Student-visible reason",
    "Revision",
    "Last edited at",
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
      studentNumberOf({
        studentRecordId: student.id,
        studentNumberCiphertext: student.studentNumberCiphertext,
        studentNumberLast4: student.studentNumberLast4,
      }),
      student.fullName,
      `Week ${cycle.cycleIndex}`,
      response.submittedAt?.toISOString() ?? "",
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
        response.studentVisibleReason,
        response.revision,
        response.lastEditedAt?.toISOString() ?? "",
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
      // A source link is created as soon as a DRAFT exists, so its presence
      // alone does not mean the class ever saw the answer. Report "yes" only
      // when a linked answer actually reached the published state.
      const linkedAnswerIds = links.map((l) => l.publicAnswerId);
      const publishedLinks = linkedAnswerIds.length
        ? await db.query.publicAnswers.findMany({
            where: and(
              inArray(publicAnswers.id, linkedAnswerIds),
              eq(publicAnswers.state, "published"),
            ),
          })
        : [];
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
        response.studentVisibleReason,
        response.revision,
        response.lastEditedAt?.toISOString() ?? "",
        privateCount.length > 0 ? "yes" : "no",
        publishedLinks.length > 0 ? "yes" : "no",
      ]);
    }
  }

  await auditExport(actorUserId, sectionId, "detailed_responses");
  return toCsv([header, ...rows]);
}
