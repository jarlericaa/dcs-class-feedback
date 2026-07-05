import { parse } from "csv-parse/sync";
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accountMatches,
  enrollments,
  importBatches,
  studentRecords,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { requireSectionStaff } from "@/modules/authz";
import { normalizeName, tokenSetKey } from "@/modules/identity/normalize";

/**
 * Class-list CSV import (account-matching.md §9).
 * Flow: parse/validate → preview (create/update/deactivate/skip + row errors)
 * → commit (transaction, ImportBatch, audited). Never silently overwrites:
 * - enrollments.rosterName always records the imported name per section.
 * - canonical studentRecords.fullName updates ONLY while the record has no
 *   confirmed AccountMatch, and each change is audited with before/after.
 * - rows absent from a re-import DEACTIVATE the enrollment (never delete).
 * - confirmed matches key on student number and survive re-import.
 */

export interface RosterRow {
  line: number;
  studentNumber: string;
  fullName: string;
}

export interface RowError {
  line: number;
  message: string;
}

export interface ParsedRoster {
  rows: RosterRow[];
  errors: RowError[];
  fileError?: string;
}

const STUDENT_NUMBER_HEADERS = [
  "student number",
  "student_number",
  "studentnumber",
  "student no",
  "student no.",
  "number",
];
const FULL_NAME_HEADERS = ["full name", "full_name", "fullname", "name"];

function findColumn(headers: string[], candidates: string[]): number {
  const lowered = headers.map((h) => h.trim().toLowerCase());
  for (const c of candidates) {
    const idx = lowered.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Parse CSV text. Header row required; extra columns are ignored. */
export function parseRosterCsv(content: string): ParsedRoster {
  let records: string[][];
  try {
    records = parse(content, {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as string[][];
  } catch (err) {
    return {
      rows: [],
      errors: [],
      fileError: `Could not parse CSV: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (records.length === 0) {
    return { rows: [], errors: [], fileError: "File is empty" };
  }
  const header = records[0]!;
  const snIdx = findColumn(header, STUDENT_NUMBER_HEADERS);
  const nameIdx = findColumn(header, FULL_NAME_HEADERS);
  if (snIdx === -1 || nameIdx === -1) {
    return {
      rows: [],
      errors: [],
      fileError:
        'Required columns not found. Expected a "student number" column and a "full name" column in the header row.',
    };
  }

  const rows: RosterRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  for (let i = 1; i < records.length; i++) {
    const line = i + 1;
    const rec = records[i]!;
    const studentNumber = (rec[snIdx] ?? "").trim();
    const fullName = (rec[nameIdx] ?? "").trim();
    if (!studentNumber && !fullName) continue;
    if (!studentNumber) {
      errors.push({ line, message: "Missing student number" });
      continue;
    }
    if (!fullName) {
      errors.push({ line, message: "Missing full name" });
      continue;
    }
    const dupLine = seen.get(studentNumber);
    if (dupLine !== undefined) {
      errors.push({
        line,
        message: `Duplicate student number ${studentNumber} (first seen on line ${dupLine})`,
      });
      continue;
    }
    seen.set(studentNumber, line);
    rows.push({ line, studentNumber, fullName });
  }
  return { rows, errors };
}

export type PlannedAction =
  | { kind: "create"; row: RosterRow }
  | { kind: "enroll_existing"; row: RosterRow; studentRecordId: string }
  | { kind: "reactivate"; row: RosterRow; studentRecordId: string }
  | {
      kind: "update_name";
      row: RosterRow;
      studentRecordId: string;
      currentName: string;
    }
  | {
      /** name differs but record has a confirmed match — surfaced, NOT applied */
      kind: "name_diff_locked";
      row: RosterRow;
      studentRecordId: string;
      currentName: string;
    }
  | { kind: "unchanged"; row: RosterRow; studentRecordId: string };

export interface ImportPreview {
  actions: PlannedAction[];
  /** active enrollments whose student number is absent from the new file */
  toDeactivate: { studentRecordId: string; studentNumber: string; name: string }[];
  errors: RowError[];
  fileError?: string;
}

async function hasConfirmedMatch(studentRecordId: string): Promise<boolean> {
  const match = await db.query.accountMatches.findFirst({
    where: and(
      eq(accountMatches.studentRecordId, studentRecordId),
      eq(accountMatches.state, "confirmed"),
    ),
  });
  return !!match;
}

/** Compute the import plan without changing anything. Staff-only. */
export async function previewRosterImport(
  actorUserId: string,
  sectionId: string,
  parsed: ParsedRoster,
): Promise<ImportPreview> {
  await requireSectionStaff(db, actorUserId, sectionId);
  if (parsed.fileError) {
    return {
      actions: [],
      toDeactivate: [],
      errors: parsed.errors,
      fileError: parsed.fileError,
    };
  }

  const actions: PlannedAction[] = [];
  for (const row of parsed.rows) {
    const record = await db.query.studentRecords.findFirst({
      where: eq(studentRecords.studentNumber, row.studentNumber),
    });
    if (!record) {
      actions.push({ kind: "create", row });
      continue;
    }
    const enrollment = await db.query.enrollments.findFirst({
      where: and(
        eq(enrollments.sectionId, sectionId),
        eq(enrollments.studentRecordId, record.id),
      ),
    });
    const nameChanged = record.fullName !== row.fullName;
    if (!enrollment) {
      actions.push({ kind: "enroll_existing", row, studentRecordId: record.id });
    } else if (enrollment.status === "deactivated") {
      actions.push({ kind: "reactivate", row, studentRecordId: record.id });
    } else if (!nameChanged) {
      actions.push({ kind: "unchanged", row, studentRecordId: record.id });
    }
    if (nameChanged) {
      if (await hasConfirmedMatch(record.id)) {
        actions.push({
          kind: "name_diff_locked",
          row,
          studentRecordId: record.id,
          currentName: record.fullName,
        });
      } else {
        actions.push({
          kind: "update_name",
          row,
          studentRecordId: record.id,
          currentName: record.fullName,
        });
      }
    }
  }

  const numbers = parsed.rows.map((r) => r.studentNumber);
  const active = await db
    .select({
      studentRecordId: enrollments.studentRecordId,
      studentNumber: studentRecords.studentNumber,
      name: studentRecords.fullName,
    })
    .from(enrollments)
    .innerJoin(
      studentRecords,
      eq(studentRecords.id, enrollments.studentRecordId),
    )
    .where(
      and(
        eq(enrollments.sectionId, sectionId),
        eq(enrollments.status, "active"),
        numbers.length > 0
          ? notInArray(studentRecords.studentNumber, numbers)
          : undefined,
      ),
    );

  return { actions, toDeactivate: active, errors: parsed.errors };
}

export interface ImportSummary {
  importBatchId: string;
  created: number;
  enrolled: number;
  reactivated: number;
  namesUpdated: number;
  nameDiffsLocked: number;
  deactivated: number;
  unchanged: number;
  errored: number;
}

/**
 * Apply a roster import. Re-derives the plan inside the transaction from
 * current DB state (the preview is advisory; commit is race-safe).
 */
export async function commitRosterImport(
  actorUserId: string,
  sectionId: string,
  parsed: ParsedRoster,
  sourceDescription: string,
): Promise<ImportSummary> {
  await requireSectionStaff(db, actorUserId, sectionId);
  if (parsed.fileError) throw new Error(parsed.fileError);

  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(importBatches)
      .values({
        kind: "roster",
        sourceDescription,
        sectionId,
        importerUserId: actorUserId,
      })
      .returning();
    const batchId = batch!.id;

    const summary: ImportSummary = {
      importBatchId: batchId,
      created: 0,
      enrolled: 0,
      reactivated: 0,
      namesUpdated: 0,
      nameDiffsLocked: 0,
      deactivated: 0,
      unchanged: 0,
      errored: parsed.errors.length,
    };

    for (const row of parsed.rows) {
      let record = await tx.query.studentRecords.findFirst({
        where: eq(studentRecords.studentNumber, row.studentNumber),
      });
      if (!record) {
        [record] = await tx
          .insert(studentRecords)
          .values({
            studentNumber: row.studentNumber,
            fullName: row.fullName,
            normalizedFullName: normalizeName(row.fullName),
            normalizedTokens: tokenSetKey(row.fullName),
            createdByImportBatchId: batchId,
          })
          .returning();
        summary.created += 1;
      } else if (record.fullName !== row.fullName) {
        const confirmed = await tx.query.accountMatches.findFirst({
          where: and(
            eq(accountMatches.studentRecordId, record.id),
            eq(accountMatches.state, "confirmed"),
          ),
        });
        if (confirmed) {
          // Never silently change the canonical name of a verified identity.
          summary.nameDiffsLocked += 1;
        } else {
          await tx
            .update(studentRecords)
            .set({
              fullName: row.fullName,
              normalizedFullName: normalizeName(row.fullName),
              normalizedTokens: tokenSetKey(row.fullName),
              updatedAt: new Date(),
            })
            .where(eq(studentRecords.id, record.id));
          await writeAudit(tx, {
            actorUserId,
            action: "student_record.name_corrected",
            entityType: "student_record",
            entityId: record.id,
            before: { fullName: record.fullName },
            after: { fullName: row.fullName },
            metadata: { importBatchId: batchId },
          });
          summary.namesUpdated += 1;
        }
      }

      const enrollment = await tx.query.enrollments.findFirst({
        where: and(
          eq(enrollments.sectionId, sectionId),
          eq(enrollments.studentRecordId, record!.id),
        ),
      });
      if (!enrollment) {
        await tx.insert(enrollments).values({
          sectionId,
          studentRecordId: record!.id,
          rosterName: row.fullName,
          sourceImportBatchId: batchId,
        });
        summary.enrolled += 1;
      } else {
        const wasDeactivated = enrollment.status === "deactivated";
        await tx
          .update(enrollments)
          .set({
            status: "active",
            rosterName: row.fullName,
            updatedAt: new Date(),
          })
          .where(eq(enrollments.id, enrollment.id));
        if (wasDeactivated) summary.reactivated += 1;
        else summary.unchanged += 1;
      }
    }

    // Absent from the new list → deactivate (data preserved; D10 provisional).
    const numbers = parsed.rows.map((r) => r.studentNumber);
    const absent = await tx
      .select({ enrollmentId: enrollments.id })
      .from(enrollments)
      .innerJoin(
        studentRecords,
        eq(studentRecords.id, enrollments.studentRecordId),
      )
      .where(
        and(
          eq(enrollments.sectionId, sectionId),
          eq(enrollments.status, "active"),
          numbers.length > 0
            ? notInArray(studentRecords.studentNumber, numbers)
            : undefined,
        ),
      );
    for (const a of absent) {
      await tx
        .update(enrollments)
        .set({ status: "deactivated", updatedAt: new Date() })
        .where(eq(enrollments.id, a.enrollmentId));
      summary.deactivated += 1;
    }

    await tx
      .update(importBatches)
      .set({ summary })
      .where(eq(importBatches.id, batchId));
    await writeAudit(tx, {
      actorUserId,
      action: "roster.imported",
      entityType: "import_batch",
      entityId: batchId,
      after: summary as unknown as Record<string, unknown>,
      metadata: { sectionId },
    });

    return summary;
  });
}
