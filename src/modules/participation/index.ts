import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  enrollments,
  formInstances,
  formQuestions,
  formResponses,
  privateResponses,
  publicAnswers,
  questionAnswers,
  sourceLinks,
  studentRecords,
  studentSubmissionItems,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { requireInstructor, requireSectionStaff } from "@/modules/authz";
import { instanceIdsForSection } from "@/modules/forms/audience";
import { instanceLabel } from "@/modules/forms/instances";
import { toCsv, toXlsxBuffer, type Cell } from "@/modules/exports/tabular";
import { buildPage, parsePageParams, type Page } from "@/lib/pagination";
import { revealStudentNumber } from "@/modules/crypto/student-number";
import { formatStudentNumber } from "@/lib/student-number";

/**
 * Derived participation (participation-rules.md §3): there is NO stored
 * participation table. A student participated in an occurrence iff a FormResponse
 * exists for (instance, student) with validity Valid.
 *
 * Per-section, and stays per-section under a shared form: the occurrences counted
 * are those whose AUDIENCE includes this section, and the responses counted are
 * those attributed to it. A course-wide form therefore contributes one column to
 * each of its sections' matrices, carrying only that section's own answers. (All review states count —
 * review progress is independent of participation.) Marking a response
 * invalid removes the credit with no separate bookkeeping. Legacy/backlog
 * items never create responses, so they can never count.
 *
 * Every export here is identity-bearing, and every access is audited (Risk R4).
 * They do NOT all share one gate, and the split is deliberate
 * (participation-rules.md §4, decision D17):
 *
 * - **`exportParticipation`**, the delegable TA flag, reaches the three reports
 *   that existed when D17 was taken: `weeklyMatrixCsv`, `participantListCsv`
 *   and `detailedResponseCsv`. D17 froze the flag for those rather than break
 *   sections already delegating them, so a Student Assistant granted it keeps
 *   what they were granted. The same flag opens the dashboard read models
 *   (`listSectionCycles`, `listAnswerFilters`, `listCycleParticipation`), which
 *   is the screen the flag is for.
 * - **`requireInstructor`**, teacher/co-teacher/course-staff only, gates the two
 *   exports added in 2026-09: `cycleParticipationCsv` (the filtered week) and
 *   `responderListCsv` / `responderListXlsx`. D17 made every export added after
 *   it instructor-only, and §4 names an XLSX variant specifically. A Student
 *   Assistant holding `exportParticipation` therefore reads the screen and the
 *   three older files, and is refused these two — the flag does not widen into
 *   the non-delegable set.
 *
 * Both gates allow an archived course: reading a closed term's record is a
 * read, and the services refuse every write regardless.
 *
 * Two shapes of question, and the difference is the whole design (GitHub issue
 * #15). "How is the section doing over the term" is the MATRIX, computed whole
 * because every cell of it is wanted at once. "Who answered this week, and who
 * said that" is `listCycleParticipation`, which is one week, filterable, and
 * paginated in the database — because it is a list a teacher reads and acts on
 * name by name, and it must not have to load a class to show twenty-five rows.
 */

export interface ParticipationMatrix {
  cycles: {
    id: string;
    cycleIndex: number;
    /** "Week 3", "This form", or the occurrence's own title — never "cycle". */
    label: string;
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
  const instanceIds = await instanceIdsForSection(db, sectionId);
  const cycles = instanceIds.length
    ? await db.query.formInstances.findMany({
        where: and(
          inArray(formInstances.id, instanceIds),
          // skipped/draft occurrences never collected anything
          inArray(formInstances.state, ["open", "closed", "archived"]),
        ),
        orderBy: [asc(formInstances.openAt), asc(formInstances.cycleIndex)],
      })
    : [];
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
          // This section's own responses only.
          eq(formResponses.sectionId, sectionId),
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
      /** "Week 3", "This form", or the occurrence's title — never "cycle". */
      label: instanceLabel(c),
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
      /**
       * No mean weeks participated. A section average answers no question a
       * teacher can act on — it moves when anyone joins or drops, and it tells
       * you nothing about whom to chase (GitHub issue #15). "Who answered this
       * week" and "who said that" are the actionable questions, and they are
       * `listCycleParticipation` below.
       */
      neverParticipated: activeStudents.filter((s) => s.totalWeeks === 0).length,
    },
  };
}

/**
 * Plaintext student number for an identity-bearing export row.
 *
 * Every caller has already passed its own gate — `exportParticipation` for the
 * three legacy CSVs, `requireInstructor` for the two added in 2026-09 (see the
 * module header) — and audits itself, so revealing here is authorized either
 * way. A record that predates the encryption backfill degrades to its last four
 * characters rather than failing the whole export.
 *
 * Written in the READING format — `2026-00001`, not `202600001`. The stored
 * plaintext is normalized and has no separator, but every one of these files is
 * opened by a person or pasted into a sheet whose own numbers carry the
 * separator, and a column that will not match on a lookup is a column that has
 * to be repaired by hand. `formatStudentNumber` restores it only for the one
 * shape it is known to belong to, so a value of any other shape — including the
 * degraded tail above — is written exactly as it is.
 */
function studentNumberOf(row: {
  studentRecordId: string;
  studentNumberCiphertext: string | null;
  studentNumberLast4: string | null;
}): string {
  try {
    return (
      formatStudentNumber(
        revealStudentNumber({
          id: row.studentRecordId,
          studentNumberCiphertext: row.studentNumberCiphertext,
        }),
      ) ?? ""
    );
  } catch {
    return row.studentNumberLast4 ? `…${row.studentNumberLast4}` : "";
  }
}

async function auditExport(
  actorUserId: string,
  sectionId: string,
  report: string,
  extra: Record<string, unknown> = {},
) {
  await writeAudit(db, {
    actorUserId,
    action: "participation.exported",
    entityType: "class_section",
    entityId: sectionId,
    sectionId,
    // Which report, and which filter it was taken under. Ids and counts only:
    // never a name, an address or a student number.
    metadata: { report, ...extra },
  });
}

/**
 * 4.1 Weekly participation matrix: one row per student, one column per cycle.
 * Delegable: `exportParticipation` (decision D17).
 */
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
      (c) => `${c.label} (${c.openAt.toISOString().slice(0, 10)})`,
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

/**
 * 4.2 Deduplicated participating-student list for a cycle range.
 * Delegable: `exportParticipation` (decision D17).
 */
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
 * Delegable: `exportParticipation` (decision D17).
 */
export async function detailedResponseCsv(
  actorUserId: string,
  sectionId: string,
): Promise<string> {
  await requireSectionStaff(db, actorUserId, sectionId, "exportParticipation", { allowArchived: true });

  const instanceIds = await instanceIdsForSection(db, sectionId);
  const cycles = instanceIds.length
    ? await db.query.formInstances.findMany({
        where: inArray(formInstances.id, instanceIds),
        orderBy: [asc(formInstances.openAt), asc(formInstances.cycleIndex)],
      })
    : [];
  const cycleById = new Map(cycles.map((c) => [c.id, c]));
  const responses = cycles.length
    ? await db.query.formResponses.findMany({
        // Drafts are not submissions: they must not appear in a staff export.
        // Scoped to this section, so a shared form does not export another
        // section's answers into this one's file.
        where: and(
          inArray(
            formResponses.cycleId,
            cycles.map((c) => c.id),
          ),
          eq(formResponses.sectionId, sectionId),
          inArray(formResponses.lifecycle, ["submitted", "locked"]),
        ),
      })
    : [];

  const header = [
    "Student number",
    "Student name",
    "Form occurrence",
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
      instanceLabel(cycle),
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

// ---------------------------------------------------------------------------
// One week at a time: who answered, and who said what (GitHub issue #15)
// ---------------------------------------------------------------------------

/**
 * The occurrences a section actually collected through, newest first.
 *
 * A complete, finite selector — one option per occurrence — so it is returned
 * whole rather than paginated: a term has a couple of dozen weeks and hiding
 * half of them behind a page control would make "pick a week" a search.
 */
export async function listSectionCycles(actorUserId: string, sectionId: string) {
  await requireSectionStaff(db, actorUserId, sectionId, "exportParticipation", {
    allowArchived: true,
  });
  const instanceIds = await instanceIdsForSection(db, sectionId);
  if (instanceIds.length === 0) return [];
  const cycles = await db.query.formInstances.findMany({
    where: and(
      inArray(formInstances.id, instanceIds),
      inArray(formInstances.state, ["open", "closed", "archived"]),
    ),
    orderBy: [asc(formInstances.openAt), asc(formInstances.cycleIndex)],
  });
  const counts = await db
    .select({
      cycleId: formResponses.cycleId,
      responses: sql<number>`count(*)::int`,
    })
    .from(formResponses)
    .where(
      and(
        inArray(
          formResponses.cycleId,
          cycles.map((c) => c.id),
        ),
        eq(formResponses.sectionId, sectionId),
        inArray(formResponses.lifecycle, ["submitted", "locked"]),
      ),
    )
    .groupBy(formResponses.cycleId);
  const byCycle = new Map(counts.map((c) => [c.cycleId, c.responses]));
  return cycles.map((cycle) => ({
    id: cycle.id,
    cycleIndex: cycle.cycleIndex,
    label: instanceLabel(cycle),
    openAt: cycle.openAt,
    deadlineAt: cycle.deadlineAt,
    state: cycle.state,
    /** submissions attributed to THIS section */
    responseCount: byCycle.get(cycle.id) ?? 0,
  }));
}

/**
 * Which week to show when the reader has not chosen one.
 *
 * The most recent occurrence anybody actually answered. Landing on next week's
 * empty form would be technically correct and useless — the same rule the
 * review column uses, for the same reason. Null when the section has collected
 * nothing at all, and the caller then shows the whole-term matrix, because
 * "this week" has no meaning yet.
 */
export function defaultCycleId(
  cycles: { id: string; responseCount: number }[],
): string | null {
  for (let i = cycles.length - 1; i >= 0; i -= 1) {
    if (cycles[i]!.responseCount > 0) return cycles[i]!.id;
  }
  return null;
}

/**
 * The answers a week can be filtered BY.
 *
 * Only questions whose answers form a finite set: a choice, a dropdown, a
 * checkbox group, a scale, a yes/no. A free-text question has no list to pick
 * from — "narrow to students who wrote *that*" is a search, not a filter — so
 * it is not offered, rather than offered and then unable to answer.
 *
 * Complete and finite, so returned whole: this is a `<select>`, and a form with
 * a dozen questions is not a list to page through.
 */
export interface AnswerFilterOption {
  /** the value that goes in the URL — a stable option id, a number, or yes/no */
  key: string;
  label: string;
}

export interface AnswerFilterQuestion {
  questionId: string;
  prompt: string;
  type: string;
  options: AnswerFilterOption[];
}

export async function listAnswerFilters(
  actorUserId: string,
  sectionId: string,
  cycleId: string,
): Promise<AnswerFilterQuestion[]> {
  await requireSectionStaff(db, actorUserId, sectionId, "exportParticipation", {
    allowArchived: true,
  });
  // The cycle must be one this section actually receives, or a guessed id
  // would read another section's form.
  const reachable = await instanceIdsForSection(db, sectionId);
  if (!reachable.includes(cycleId)) return [];

  const questions = await db.query.formQuestions.findMany({
    where: eq(formQuestions.cycleId, cycleId),
    orderBy: asc(formQuestions.displayOrder),
  });

  return questions.flatMap((question) => {
    const options = enumerableAnswers(question);
    return options.length > 0
      ? [
          {
            questionId: question.id,
            prompt: question.prompt,
            type: question.type,
            options,
          },
        ]
      : [];
  });
}

/** The finite answer set for one question, or empty when it has none. */
function enumerableAnswers(question: {
  type: string;
  options: unknown;
  scale: unknown;
}): AnswerFilterOption[] {
  switch (question.type) {
    case "multiple_choice":
    case "checkboxes":
    case "dropdown": {
      const options = (question.options ?? []) as {
        stableId: string;
        label: string;
      }[];
      return options.map((option) => ({
        key: option.stableId,
        label: option.label,
      }));
    }
    case "yes_no":
      return [
        { key: "yes", label: "Yes" },
        { key: "no", label: "No" },
      ];
    case "linear_scale": {
      const scale = (question.scale ?? {}) as {
        min?: number;
        max?: number;
        step?: number;
      };
      const min = scale.min ?? 1;
      const max = scale.max;
      const step = scale.step && scale.step > 0 ? scale.step : 1;
      // A scale wider than this is not a filter anyone scans; the number
      // itself is what a reader would search for instead.
      if (max === undefined || max <= min || (max - min) / step > 20) return [];
      const out: AnswerFilterOption[] = [];
      for (let value = min; value <= max; value += step) {
        out.push({ key: String(value), label: `${value} of ${max}` });
      }
      return out;
    }
    default:
      // short_answer, paragraph, date, time: no finite set to offer.
      return [];
  }
}

/**
 * A query-string value that carries nothing, as `undefined`.
 *
 * `?question=` yields `""` and `?answer=%20` yields `" "`; the second is truthy
 * and would otherwise read as a filter that names something. One place, so the
 * scope builder, the export header and the audit row all agree on what "no
 * filter" means.
 */
function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The SQL predicate for "this answer to this question", or null.
 *
 * The key must be one the question ACTUALLY OFFERS: it is looked up in
 * `enumerableAnswers`, the same list the selector is built from, before any SQL
 * is written. That is one rule for every type instead of a per-type parse, and
 * it closes a gap a per-type parse had — `Number.parseInt("2abc")` is 2, so a
 * scale filter used to accept `2abc`, `1e1`, ` 2` and `2.9` as if they were the
 * offered value `2`, and it accepted `999` and off-step values that no student
 * could ever hold. None of those widened the result to everyone, but a filter
 * quietly answering a request nobody made is the wrong kind of correct.
 *
 * Null means REFUSE. The caller drops the whole scope rather than falling back
 * to unfiltered, because silently widening a filter is how a teacher contacts
 * the wrong students.
 */
function answerPredicate(
  question: { type: string; options: unknown; scale: unknown },
  key: string,
): SQL | null {
  if (!enumerableAnswers(question).some((option) => option.key === key)) {
    return null;
  }
  switch (question.type) {
    case "multiple_choice":
    case "checkboxes":
    case "dropdown":
      // `@>` on the ids array: the option the student actually chose, by its
      // stable id rather than by a label that may since have been reworded.
      return sql`${questionAnswers.value} -> 'optionIds' @> ${JSON.stringify([key])}::jsonb`;
    case "yes_no":
      return sql`${questionAnswers.value} ->> 'boolValue' = ${key === "yes" ? "true" : "false"}`;
    case "linear_scale":
      // Already known to be one of the offered steps, so the key is written
      // through as the canonical string it was generated from.
      return sql`${questionAnswers.value} ->> 'scaleValue' = ${key}`;
    default:
      return null;
  }
}

export interface CycleParticipationRow {
  studentRecordId: string;
  fullName: string;
  studentNumberLast4: string | null;
  active: boolean;
  /** null when they did not submit at all */
  responseId: string | null;
  submittedAt: Date | null;
  validity: "valid" | "flagged" | "invalid" | null;
  /** credited for this week — submitted and not marked invalid */
  participated: boolean;
  /** their answer to the filtered question, as labels; null when unfiltered */
  answerLabels: string | null;
}

export interface CycleParticipationFilter {
  cycleId: string;
  questionId?: string;
  answerKey?: string;
  page?: string | number | null;
  pageSize?: string | number | null;
}

/**
 * One week's participation, filterable and paginated IN THE DATABASE.
 *
 * The list a teacher works from: who answered this week, and — with a question
 * and an answer chosen — which of them said that. Ordered by name so the page
 * boundaries are stable and the order matches an encoding sheet.
 *
 * Every clause is scoped to this section: the enrolments are its own, and the
 * response join carries `sectionId` so a form shared with three sections yields
 * only this one's answers.
 */
export async function listCycleParticipation(
  actorUserId: string,
  sectionId: string,
  filter: CycleParticipationFilter,
): Promise<Page<CycleParticipationRow>> {
  await requireSectionStaff(db, actorUserId, sectionId, "exportParticipation", {
    allowArchived: true,
  });
  const params = parsePageParams(filter, 25);
  const scope = await cycleScope(sectionId, filter);
  if (!scope) return buildPage<CycleParticipationRow>([], 0, params);

  const [{ count: total } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(enrollments)
    .innerJoin(studentRecords, eq(studentRecords.id, enrollments.studentRecordId))
    .where(and(eq(enrollments.sectionId, sectionId), scope.where));

  const rows = await db
    .select({
      studentRecordId: studentRecords.id,
      fullName: studentRecords.fullName,
      studentNumberLast4: studentRecords.studentNumberLast4,
      status: enrollments.status,
      responseId: sql<string | null>`${scope.responseId}`,
      submittedAt: sql<Date | null>`${scope.submittedAt}`,
      validity: sql<string | null>`${scope.validity}`,
      answerLabels: sql<string | null>`${scope.answerLabels}`,
    })
    .from(enrollments)
    .innerJoin(studentRecords, eq(studentRecords.id, enrollments.studentRecordId))
    .where(and(eq(enrollments.sectionId, sectionId), scope.where))
    .orderBy(asc(studentRecords.fullName), asc(studentRecords.id))
    .limit(params.pageSize)
    .offset(params.offset);

  return buildPage<CycleParticipationRow>(
    rows.map((row) => ({
      studentRecordId: row.studentRecordId,
      fullName: row.fullName,
      studentNumberLast4: row.studentNumberLast4,
      active: row.status === "active",
      responseId: row.responseId,
      submittedAt: row.submittedAt ? new Date(row.submittedAt) : null,
      validity: (row.validity as CycleParticipationRow["validity"]) ?? null,
      /** Credit rule, unchanged: submitted and not invalid (decision D15). */
      participated: !!row.responseId && row.validity !== "invalid",
      answerLabels: row.answerLabels,
    })),
    total,
    params,
  );
}

/**
 * The correlated sub-selects and the WHERE clause for one week's list.
 *
 * Sub-selects rather than a LEFT JOIN so the row count stays one per STUDENT: a
 * checkbox answer has several option rows, and joining would multiply a student
 * across pages. Null when the cycle is not one this section receives.
 */
async function cycleScope(
  sectionId: string,
  filter: CycleParticipationFilter,
): Promise<{
  where: SQL;
  responseId: SQL;
  submittedAt: SQL;
  validity: SQL;
  answerLabels: SQL;
  filterApplied: boolean;
} | null> {
  const reachable = await instanceIdsForSection(db, sectionId);
  if (!reachable.includes(filter.cycleId)) return null;

  /**
   * Blank is ABSENT, not a value.
   *
   * These arrive from a query string, where `?question=&answer=` gives two
   * empty strings and `?answer=%20` gives a single space — and a space is
   * truthy, so without this a whitespace answer would read as a filter that
   * names something. Normalizing first means the both-or-neither test below
   * judges real content: two blanks are no filter at all, and one blank beside
   * one value is the half-specified case.
   */
  const questionId = blankToUndefined(filter.questionId);
  const answerKey = blankToUndefined(filter.answerKey);
  // The value comes from a query string. Refuse malformed ids before the UUID
  // comparison below so a hand-edited URL returns no matches, not a database
  // error.
  if (questionId && !z.string().uuid().safeParse(questionId).success) return null;

  const response = sql`(
    select r.id from ${formResponses} r
    where r.cycle_id = ${filter.cycleId}
      and r.section_id = ${sectionId}
      and r.student_record_id = ${studentRecords.id}
      and r.lifecycle in ('submitted', 'locked')
    limit 1
  )`;
  const responseId = sql<string | null>`${response}`;
  const submittedAt = sql<Date | null>`(
    select r.submitted_at from ${formResponses} r
    where r.id = ${response}
  )`;
  const validity = sql<string | null>`(
    select r.validity::text from ${formResponses} r
    where r.id = ${response}
  )`;

  // No answer filter: everyone enrolled, answered or not, so "who did NOT
  // answer this week" is one read of the same list.
  let where: SQL = sql`true`;
  let answerLabels: SQL = sql<string | null>`null::text`;

  /**
   * A HALF-SPECIFIED answer filter is refused, not ignored.
   *
   * The two parts only mean something together: a question with no answer, or
   * an answer with no question, cannot name a set of students. Falling through
   * to the unfiltered branch would answer a narrowing request with EVERY
   * enrolled student — the exact widening participation-rules.md §4.4 forbids,
   * and the one that matters most because the list is what a teacher then
   * contacts. `?question=…` alone is reachable by hand-editing the URL, by a
   * stale link, and by any future control that clears one select and not the
   * other, so it is checked here in the shared scope builder rather than in
   * each caller.
   */
  if (!!questionId !== !!answerKey) return null;

  if (questionId && answerKey) {
    const question = await db.query.formQuestions.findFirst({
      where: and(
        eq(formQuestions.id, questionId),
        eq(formQuestions.cycleId, filter.cycleId),
      ),
    });
    // A question id from another occurrence is not a narrower filter, it is a
    // different form. Refused rather than ignored.
    if (!question) return null;
    const predicate = answerPredicate(question, answerKey);
    if (!predicate) return null;

    where = sql`exists (
      select 1 from ${questionAnswers}
      where ${questionAnswers.responseId} = ${response}
        and ${questionAnswers.questionId} = ${questionId}
        and ${predicate}
    )`;
    answerLabels = sql<string | null>`(
      select coalesce(
        (select string_agg(label, ', ')
           from jsonb_array_elements_text(qa.value -> 'optionLabels') as label),
        qa.value ->> 'scaleValue',
        case qa.value ->> 'boolValue' when 'true' then 'Yes' when 'false' then 'No' end
      )
      from ${questionAnswers} qa
      where qa.response_id = ${response}
        and qa.question_id = ${questionId}
      limit 1
    )`;
  }

  return {
    where,
    responseId,
    submittedAt,
    validity,
    answerLabels,
    filterApplied: !!(questionId && answerKey),
  };
}

/**
 * The same week's list, whole, for an export.
 *
 * Not paginated, deliberately: a file is the one place a reader wants every row
 * at once, and the page control exists to keep a SCREEN readable. It runs the
 * identical scope builder, so an export can never disagree with what is on
 * screen above it — which is the whole requirement in GitHub issue #15.
 */
async function cycleParticipationAll(
  sectionId: string,
  filter: CycleParticipationFilter,
): Promise<{ rows: CycleParticipationRow[]; filterApplied: boolean }> {
  const scope = await cycleScope(sectionId, filter);
  if (!scope) return { rows: [], filterApplied: false };
  const rows = await db
    .select({
      studentRecordId: studentRecords.id,
      fullName: studentRecords.fullName,
      studentNumberLast4: studentRecords.studentNumberLast4,
      status: enrollments.status,
      responseId: sql<string | null>`${scope.responseId}`,
      submittedAt: sql<Date | null>`${scope.submittedAt}`,
      validity: sql<string | null>`${scope.validity}`,
      answerLabels: sql<string | null>`${scope.answerLabels}`,
    })
    .from(enrollments)
    .innerJoin(studentRecords, eq(studentRecords.id, enrollments.studentRecordId))
    .where(and(eq(enrollments.sectionId, sectionId), scope.where))
    .orderBy(asc(studentRecords.fullName), asc(studentRecords.id));
  return {
    rows: rows.map((row) => ({
      studentRecordId: row.studentRecordId,
      fullName: row.fullName,
      studentNumberLast4: row.studentNumberLast4,
      active: row.status === "active",
      responseId: row.responseId,
      submittedAt: row.submittedAt ? new Date(row.submittedAt) : null,
      validity: (row.validity as CycleParticipationRow["validity"]) ?? null,
      participated: !!row.responseId && row.validity !== "invalid",
      answerLabels: row.answerLabels,
    })),
    filterApplied: scope.filterApplied,
  };
}

/**
 * 4.4 One week's participation, matching whatever filter is on screen.
 *
 * The export the reworked dashboard hands back: the same rows, the same order,
 * the same narrowing. Carries the full student number, so it is audited like
 * every other identity-bearing file here.
 *
 * INSTRUCTOR-ONLY, unlike the three original participation CSVs. Decision D17
 * froze `export_participation` as a delegable flag for the reports that already
 * existed and made every export added after it instructor-only, so a Student
 * Assistant holding the flag reads the dashboard above but does not take the
 * file away (participation-rules.md §4). The screen is gated on the flag; the
 * download is gated on the role.
 */
export async function cycleParticipationCsv(
  actorUserId: string,
  sectionId: string,
  filter: CycleParticipationFilter & { cycleLabel?: string },
): Promise<string> {
  await requireInstructor(db, actorUserId, sectionId, { allowArchived: true });
  const { rows, filterApplied } = await cycleParticipationAll(sectionId, filter);
  const numbers = await revealNumbers(rows.map((r) => r.studentRecordId));
  /**
   * The header and the audit row describe the filter that was actually
   * APPLIED, normalized exactly as `cycleScope` normalizes it. Reading the raw
   * values here would put an Answer column on a file that has no answers in it,
   * and would record a filter in the audit log that the query refused.
   */
  const questionId = blankToUndefined(filter.questionId);
  const answerKey = blankToUndefined(filter.answerKey);
  const filtered = filterApplied;
  const header = [
    "Student number",
    "Student name",
    "Form occurrence",
    "Participated",
    "Submitted at",
    "Validity",
    "Enrolment",
    ...(filtered ? ["Answer"] : []),
  ];
  const body = rows.map((row) => [
    numbers.get(row.studentRecordId) ?? "",
    row.fullName,
    filter.cycleLabel ?? "",
    row.participated ? "1" : "0",
    row.submittedAt?.toISOString() ?? "",
    row.validity ?? "no submission",
    row.active ? "active" : "dropped",
    ...(filtered ? [row.answerLabels ?? ""] : []),
  ]);
  await auditExport(actorUserId, sectionId, "cycle_participation", {
    cycleId: filter.cycleId,
    questionId: filtered ? questionId : null,
    answerKey: filtered ? answerKey : null,
    rows: rows.length,
  });
  return toCsv([header, ...body]);
}

// ---------------------------------------------------------------------------
// Who has responded, for encoding (GitHub issue #8)
// ---------------------------------------------------------------------------

/**
 * The list an encoding sheet is filled from: who submitted for one occurrence.
 *
 * Ordered by STUDENT NUMBER, not by name, because that is the column an
 * encoding sheet is keyed on and pasting into it should not need a re-sort. The
 * number is sealed, so the ordering happens after decryption rather than in
 * SQL; a row whose number cannot be read sorts last under its name, so it is
 * visible rather than silently first.
 *
 * `includeNonResponders` puts everyone on the list in one file with a Responded
 * column, so the gap is visible in one place instead of two files to diff.
 */
export interface ResponderExportOptions {
  cycleId: string;
  includeNonResponders?: boolean;
  cycleLabel?: string;
}

async function responderRows(
  sectionId: string,
  opts: ResponderExportOptions,
): Promise<
  {
    studentNumber: string;
    fullName: string;
    email: string;
    submittedAt: Date | null;
    responded: boolean;
    active: boolean;
  }[]
> {
  const scope = await cycleScope(sectionId, { cycleId: opts.cycleId });
  if (!scope) return [];
  const rows = await db
    .select({
      studentRecordId: studentRecords.id,
      fullName: studentRecords.fullName,
      email: studentRecords.rosterEmail,
      status: enrollments.status,
      responseId: sql<string | null>`${scope.responseId}`,
      submittedAt: sql<Date | null>`${scope.submittedAt}`,
    })
    .from(enrollments)
    .innerJoin(studentRecords, eq(studentRecords.id, enrollments.studentRecordId))
    .where(eq(enrollments.sectionId, sectionId));

  const numbers = await revealNumbers(rows.map((r) => r.studentRecordId));
  const mapped = rows
    .filter((row) => opts.includeNonResponders || !!row.responseId)
    .map((row) => ({
      studentNumber: numbers.get(row.studentRecordId) ?? "",
      fullName: row.fullName,
      email: row.email ?? "",
      submittedAt: row.submittedAt ? new Date(row.submittedAt) : null,
      responded: !!row.responseId,
      active: row.status === "active",
    }));
  return mapped.sort((a, b) => {
    if (!a.studentNumber || !b.studentNumber) {
      if (a.studentNumber === b.studentNumber) {
        return a.fullName.localeCompare(b.fullName);
      }
      return a.studentNumber ? -1 : 1;
    }
    return a.studentNumber.localeCompare(b.studentNumber);
  });
}

const RESPONDER_HEADER = [
  "Student number",
  "Student name",
  "UP email",
  "Submitted at",
] as const;

function responderSheet(
  rows: Awaited<ReturnType<typeof responderRows>>,
  includeNonResponders: boolean,
): Cell[][] {
  const header: Cell[] = [
    ...RESPONDER_HEADER,
    ...(includeNonResponders ? ["Responded", "Enrolment"] : []),
  ];
  return [
    header,
    ...rows.map((row) => [
      row.studentNumber,
      row.fullName,
      row.email,
      row.submittedAt?.toISOString() ?? "",
      ...(includeNonResponders
        ? [row.responded ? "yes" : "no", row.active ? "active" : "dropped"]
        : []),
    ]),
  ];
}

/**
 * One-click responder list as CSV. Audited, and INSTRUCTOR-ONLY: it is one of
 * the exports added after decision D17, so `export_participation` does not
 * reach it (participation-rules.md §4.5). It carries a name, a UP email and a
 * full student number per row — the widest identity payload of any export here.
 */
export async function responderListCsv(
  actorUserId: string,
  sectionId: string,
  opts: ResponderExportOptions,
): Promise<string> {
  await requireInstructor(db, actorUserId, sectionId, { allowArchived: true });
  const rows = await responderRows(sectionId, opts);
  await auditResponderExport(actorUserId, sectionId, opts, rows.length, "csv");
  return toCsv(responderSheet(rows, !!opts.includeNonResponders));
}

/**
 * The same list as a spreadsheet, through the shared tabular path.
 *
 * `toXlsxBuffer` already exists and already neutralizes formula injection the
 * same way the CSV path does — which matters here more than anywhere, because
 * these cells carry names a student typed. Writing an xlsx by hand is how one
 * export path ends up unprotected.
 *
 * Instructor-only, on the same footing as the CSV above: an XLSX variant is
 * explicitly named as instructor-only in participation-rules.md §4, and two
 * formats of one report must never disagree about who may download it.
 */
export async function responderListXlsx(
  actorUserId: string,
  sectionId: string,
  opts: ResponderExportOptions,
): Promise<Buffer> {
  await requireInstructor(db, actorUserId, sectionId, { allowArchived: true });
  const rows = await responderRows(sectionId, opts);
  const sheet = responderSheet(rows, !!opts.includeNonResponders);
  await auditResponderExport(actorUserId, sectionId, opts, rows.length, "xlsx");
  return toXlsxBuffer([
    {
      name: opts.cycleLabel ? `Responded — ${opts.cycleLabel}` : "Responded",
      header: sheet[0]!.map((cell) => String(cell ?? "")),
      rows: sheet.slice(1),
    },
  ]);
}

async function auditResponderExport(
  actorUserId: string,
  sectionId: string,
  opts: ResponderExportOptions,
  rowCount: number,
  format: "csv" | "xlsx",
) {
  await writeAudit(db, {
    actorUserId,
    /**
     * `export.responses` was declared for exactly this and had no writer until
     * now. Metadata only — a count, a format, an occurrence id — never a name,
     * an address or a student number.
     */
    action: "export.responses",
    entityType: "class_section",
    entityId: sectionId,
    sectionId,
    metadata: {
      report: "responders",
      cycleId: opts.cycleId,
      includeNonResponders: !!opts.includeNonResponders,
      format,
      rows: rowCount,
    },
  });
}

/**
 * Plaintext student numbers for a set of records, in one pass.
 *
 * Only ever called from an export that has already passed its own gate and that
 * audits itself. Both callers today are the instructor-only ones
 * (`cycleParticipationCsv` and the responder lists), but the requirement is the
 * gate, not which gate — see the module header. A record predating the
 * encryption backfill degrades to its last four rather than failing the file.
 */
async function revealNumbers(
  recordIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(recordIds)];
  if (unique.length === 0) return new Map();
  const records = await db.query.studentRecords.findMany({
    where: inArray(studentRecords.id, unique),
    columns: {
      id: true,
      studentNumberCiphertext: true,
      studentNumberLast4: true,
    },
  });
  return new Map(
    records.map((record) => [
      record.id,
      studentNumberOf({
        studentRecordId: record.id,
        studentNumberCiphertext: record.studentNumberCiphertext,
        studentNumberLast4: record.studentNumberLast4,
      }),
    ]),
  );
}
