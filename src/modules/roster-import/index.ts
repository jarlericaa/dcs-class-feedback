import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { and, eq, inArray, notInArray } from "drizzle-orm";
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
import {
  normalizeStudentNumber,
  sealStudentNumber,
  studentNumberHash,
} from "@/modules/crypto/student-number";
import {
  composeFullName,
  isMalformedStudentNumber,
  mapHeaders,
  normalizeCrsStatus,
  parseEnlistmentDate,
  type RosterField,
} from "./crs-columns";
import {
  editedRosterRowsSchema,
  emptyCourseMeta,
  type ParsedRoster,
  type RosterRow,
  type RowError,
  type RowWarning,
} from "./types";

export * from "./types";
export { parseRosterXlsx, looksLikeXlsx, MAX_XLSX_BYTES } from "./xlsx";
export {
  normalizeCrsStatus,
  isDeniedHeader,
  DENIED_HEADERS,
} from "./crs-columns";

/**
 * Class-list import (account-matching.md §9, project-specs.md §6.1).
 *
 * Flow: parse (XLSX upload, or pasted CSV as a fallback) → editable preview
 * (create/enroll/reactivate/rename/deactivate + per-row warnings) → commit in a
 * transaction with an ImportBatch, audited.
 *
 * Never silently overwrites:
 * - enrollments.rosterName always records the imported name per section;
 * - canonical studentRecords.fullName updates ONLY while the record has no
 *   confirmed AccountMatch, and each change is audited with before/after;
 * - rows absent from a re-import DEACTIVATE the enrollment (never delete);
 * - confirmed matches key on the student number and survive re-import.
 *
 * Student numbers are sealed on write and looked up by keyed hash, so no code
 * path here holds a plaintext number longer than the call that supplied it.
 */

/** Parse pasted CSV text. Same row shape as the XLSX path. */
export function parseRosterCsv(content: string): ParsedRoster {
  const base: ParsedRoster = {
    source: "csv",
    rows: [],
    errors: [],
    courseMeta: emptyCourseMeta(),
    ignoredColumns: [],
    deniedColumns: [],
  };
  let records: string[][];
  try {
    records = parse(content, {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as string[][];
  } catch (err) {
    return {
      ...base,
      fileError: `Could not parse CSV: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (records.length === 0) return { ...base, fileError: "File is empty" };

  const header = records[0]!;
  const { columns, ignored, denied } = mapHeaders(header);
  const hasName =
    columns.fullName !== undefined ||
    columns.familyName !== undefined ||
    columns.firstName !== undefined;
  if (columns.studentNumber === undefined || !hasName) {
    return {
      ...base,
      ignoredColumns: ignored,
      deniedColumns: denied,
      fileError:
        'Required columns not found. Expected a "student number" column and a name column in the header row.',
    };
  }

  const at = (row: string[], field: RosterField): string | null => {
    const index = columns[field];
    if (index === undefined) return null;
    const value = (row[index] ?? "").trim();
    return value.length ? value : null;
  };

  const rows: RosterRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  for (let i = 1; i < records.length; i++) {
    const line = i + 1;
    const rec = records[i]!;
    const studentNumber = (rec[columns.studentNumber] ?? "").trim();
    const familyName = at(rec, "familyName");
    const firstName = at(rec, "firstName");
    const middleName = at(rec, "middleName");
    const fullName = composeFullName({
      fullName: at(rec, "fullName"),
      familyName,
      firstName,
      middleName,
    });
    if (!studentNumber && !fullName) continue;
    if (!studentNumber) {
      errors.push({ line, message: "Missing student number" });
      continue;
    }
    if (!fullName) {
      errors.push({ line, message: "Missing full name" });
      continue;
    }

    const warnings: RowWarning[] = [];
    if (isMalformedStudentNumber(studentNumber)) {
      warnings.push({ code: "malformed_student_number" });
    }
    const dupLine = seen.get(studentNumber.toUpperCase());
    if (dupLine !== undefined) {
      // Reported as a row error too, so the existing "duplicates are surfaced"
      // behaviour of the CSV path is preserved for callers reading `errors`.
      errors.push({
        line,
        message: `Duplicate student number ${studentNumber} (first seen on line ${dupLine})`,
      });
      warnings.push({ code: "duplicate_student_number", firstSeenLine: dupLine });
      continue;
    }
    seen.set(studentNumber.toUpperCase(), line);

    const crsStatusRaw = at(rec, "enrollmentStatus");
    const crsStatus = normalizeCrsStatus(crsStatusRaw);
    if (crsStatus === "unknown" && crsStatusRaw) {
      warnings.push({ code: "unknown_status", raw: crsStatusRaw });
    } else if (crsStatus === "not_enrolled") {
      warnings.push({ code: "not_enrolled_status", raw: crsStatusRaw ?? "" });
    }

    rows.push({
      line,
      rowKey: `r${line}`,
      studentNumber,
      numberWasNumericCell: false,
      familyName,
      firstName,
      middleName,
      livedName: at(rec, "livedName"),
      preferredPronoun: at(rec, "preferredPronoun"),
      program: at(rec, "program"),
      crsStatusRaw,
      crsStatus,
      enlistmentDate: parseEnlistmentDate(at(rec, "enlistmentDate")),
      fullName,
      warnings,
    });
  }
  return {
    source: "csv",
    rows,
    errors,
    courseMeta: emptyCourseMeta(),
    ignoredColumns: ignored,
    deniedColumns: denied,
  };
}

/**
 * Merge staff edits from the confirmation screen back into a parsed roster.
 *
 * Edited values are untrusted: only rows whose `rowKey` was actually parsed are
 * accepted, so a client cannot inject a student who was never in the file, and
 * derived fields (warnings, normalized status) are recomputed rather than taken
 * from the client.
 */
export function applyPreviewEdits(
  parsed: ParsedRoster,
  edited: unknown,
): ParsedRoster {
  const result = editedRosterRowsSchema.safeParse(edited);
  if (!result.success) return parsed;
  const byKey = new Map(result.data.map((row) => [row.rowKey, row]));
  const rows = parsed.rows.map((row) => {
    const patch = byKey.get(row.rowKey);
    if (!patch) return row;
    const studentNumber = patch.studentNumber.trim();
    const fullName = composeFullName({
      fullName: patch.fullName,
      familyName: patch.familyName ?? null,
      firstName: patch.firstName ?? null,
      middleName: patch.middleName ?? null,
    });
    const crsStatusRaw = patch.crsStatusRaw ?? null;
    const crsStatus = normalizeCrsStatus(crsStatusRaw) === "unknown"
      ? patch.crsStatus
      : normalizeCrsStatus(crsStatusRaw);
    const changed =
      studentNumber !== row.studentNumber || fullName !== row.fullName;
    const warnings: RowWarning[] = [];
    if (isMalformedStudentNumber(studentNumber)) {
      warnings.push({ code: "malformed_student_number" });
    }
    if (crsStatus === "unknown" && crsStatusRaw) {
      warnings.push({ code: "unknown_status", raw: crsStatusRaw });
    } else if (crsStatus === "not_enrolled") {
      warnings.push({ code: "not_enrolled_status", raw: crsStatusRaw ?? "" });
    }
    return {
      ...row,
      studentNumber,
      fullName,
      familyName: patch.familyName ?? null,
      firstName: patch.firstName ?? null,
      middleName: patch.middleName ?? null,
      livedName: patch.livedName ?? null,
      preferredPronoun: patch.preferredPronoun ?? null,
      program: patch.program ?? null,
      crsStatusRaw,
      crsStatus,
      enlistmentDate: parseEnlistmentDate(patch.enlistmentDate ?? null),
      // Editing a numeric-cell number is exactly how staff fix a lost zero.
      numberWasNumericCell: changed ? false : row.numberWasNumericCell,
      warnings,
      edited: changed || row.edited,
    };
  });
  // Duplicates can appear or disappear once staff edit numbers — recompute.
  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeStudentNumber(row.studentNumber);
    const first = seen.get(key);
    if (first !== undefined) {
      row.warnings = [
        ...row.warnings.filter((w) => w.code !== "duplicate_student_number"),
        { code: "duplicate_student_number", firstSeenLine: first },
      ];
    } else {
      seen.set(key, row.line);
    }
  }
  return { ...parsed, rows };
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
  toDeactivate: {
    studentRecordId: string;
    studentNumberLast4: string | null;
    name: string;
  }[];
  errors: RowError[];
  courseMeta: ParsedRoster["courseMeta"];
  ignoredColumns: string[];
  deniedColumns: string[];
  warningCount: number;
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
  await requireSectionStaff(db, actorUserId, sectionId, "viewStudentIdentities");
  const shell: ImportPreview = {
    actions: [],
    toDeactivate: [],
    errors: parsed.errors,
    courseMeta: parsed.courseMeta,
    ignoredColumns: parsed.ignoredColumns,
    deniedColumns: parsed.deniedColumns,
    warningCount: 0,
  };
  if (parsed.fileError) return { ...shell, fileError: parsed.fileError };

  const actions: PlannedAction[] = [];
  for (const row of parsed.rows) {
    const record = await db.query.studentRecords.findFirst({
      where: eq(studentRecords.studentNumberHash, studentNumberHash(row.studentNumber)),
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
    // Surface any stored field this file would change, so "conflicting existing
    // record" is visible in the preview rather than discovered afterwards.
    for (const [field, incoming, existing] of [
      ["program", row.program, record.program],
      ["livedName", row.livedName, record.livedName],
      ["preferredPronoun", row.preferredPronoun, record.preferredPronoun],
    ] as const) {
      if (incoming && existing && incoming !== existing) {
        row.warnings.push({
          code: "conflicting_existing_record",
          field,
          existing,
        });
      }
    }
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

  const hashes = parsed.rows.map((r) => studentNumberHash(r.studentNumber));
  const active = await db
    .select({
      studentRecordId: enrollments.studentRecordId,
      studentNumberLast4: studentRecords.studentNumberLast4,
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
        hashes.length > 0
          ? notInArray(studentRecords.studentNumberHash, hashes)
          : undefined,
      ),
    );

  return {
    ...shell,
    actions,
    toDeactivate: active,
    warningCount: parsed.rows.reduce((sum, r) => sum + r.warnings.length, 0),
  };
}

export interface ImportSummary {
  importBatchId: string;
  created: number;
  enrolled: number;
  reactivated: number;
  namesUpdated: number;
  nameDiffsLocked: number;
  fieldsUpdated: number;
  deactivated: number;
  unchanged: number;
  warned: number;
  notEnrolled: number;
  editedRows: number;
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
  await requireSectionStaff(db, actorUserId, sectionId, "viewStudentIdentities");
  if (parsed.fileError) throw new Error(parsed.fileError);

  const editedRows = parsed.rows.filter((r) => r.edited).length;

  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(importBatches)
      .values({
        kind: "roster",
        sourceDescription,
        sectionId,
        importerUserId: actorUserId,
        sourceKind: parsed.source === "xlsx" ? "xlsx" : "csv",
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
      fieldsUpdated: 0,
      deactivated: 0,
      unchanged: 0,
      warned: parsed.rows.filter((r) => r.warnings.length > 0).length,
      notEnrolled: parsed.rows.filter((r) => r.crsStatus !== "enrolled").length,
      editedRows,
      errored: parsed.errors.length,
    };

    for (const row of parsed.rows) {
      const hash = studentNumberHash(row.studentNumber);
      let record = await tx.query.studentRecords.findFirst({
        where: eq(studentRecords.studentNumberHash, hash),
      });
      if (!record) {
        // The row id must exist before sealing: it is the ciphertext's AAD, which
        // is what stops a ciphertext being moved onto another student's row.
        const id = randomUUID();
        const sealed = sealStudentNumber(row.studentNumber, id);
        [record] = await tx
          .insert(studentRecords)
          .values({
            id,
            studentNumberCiphertext: sealed.ciphertext,
            studentNumberHash: sealed.hash,
            studentNumberLast4: sealed.last4,
            encKeyVersion: sealed.encKeyVersion,
            fullName: row.fullName,
            normalizedFullName: normalizeName(row.fullName),
            normalizedTokens: tokenSetKey(row.fullName),
            familyName: row.familyName,
            firstName: row.firstName,
            livedName: row.livedName,
            preferredPronoun: row.preferredPronoun,
            program: row.program,
            createdByImportBatchId: batchId,
          })
          .returning();
        summary.created += 1;
      } else {
        if (record.fullName !== row.fullName) {
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
              sectionId,
            });
            summary.namesUpdated += 1;
          }
        }
        // Fill in CRS detail fields, but never blank an existing value with an
        // empty cell from a thinner export.
        const patch: Record<string, string> = {};
        const before: Record<string, string | null> = {};
        for (const [field, incoming] of [
          ["familyName", row.familyName],
          ["firstName", row.firstName],
          ["livedName", row.livedName],
          ["preferredPronoun", row.preferredPronoun],
          ["program", row.program],
        ] as const) {
          if (incoming && record[field] !== incoming) {
            patch[field] = incoming;
            before[field] = record[field] ?? null;
          }
        }
        if (Object.keys(patch).length > 0) {
          await tx
            .update(studentRecords)
            .set({ ...patch, updatedAt: new Date() })
            .where(eq(studentRecords.id, record.id));
          await writeAudit(tx, {
            actorUserId,
            action: "student_record.fields_updated",
            entityType: "student_record",
            entityId: record.id,
            before,
            after: patch,
            metadata: { importBatchId: batchId },
            sectionId,
          });
          summary.fieldsUpdated += 1;
        }
      }

      const enrollmentValues = {
        rosterName: row.fullName,
        crsStatusRaw: row.crsStatusRaw,
        crsStatus: row.crsStatus,
        enlistmentDate: row.enlistmentDate
          ? new Date(`${row.enlistmentDate}T00:00:00Z`)
          : null,
        program: row.program,
        livedNameSnapshot: row.livedName,
        pronounSnapshot: row.preferredPronoun,
        lastImportBatchId: batchId,
      };

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
          sourceImportBatchId: batchId,
          ...enrollmentValues,
        });
        summary.enrolled += 1;
      } else {
        const wasDeactivated = enrollment.status === "deactivated";
        await tx
          .update(enrollments)
          .set({ status: "active", updatedAt: new Date(), ...enrollmentValues })
          .where(eq(enrollments.id, enrollment.id));
        if (wasDeactivated) summary.reactivated += 1;
        else summary.unchanged += 1;
      }
    }

    // Absent from the new list → deactivate (data preserved; D10).
    const hashes = parsed.rows.map((r) => studentNumberHash(r.studentNumber));
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
          hashes.length > 0
            ? notInArray(studentRecords.studentNumberHash, hashes)
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
      .set({ summary, committedAt: new Date(), committedByUserId: actorUserId })
      .where(eq(importBatches.id, batchId));
    if (editedRows > 0) {
      await writeAudit(tx, {
        actorUserId,
        action: "roster.preview_edited",
        entityType: "import_batch",
        entityId: batchId,
        // Row keys and a count only: the edited values themselves are student PII.
        metadata: {
          editedRows,
          rowKeys: parsed.rows.filter((r) => r.edited).map((r) => r.rowKey),
        },
        sectionId,
      });
    }
    await writeAudit(tx, {
      actorUserId,
      action: "roster.imported",
      entityType: "import_batch",
      entityId: batchId,
      after: summary as unknown as Record<string, unknown>,
      metadata: { sectionId, source: parsed.source },
      sectionId,
    });

    return summary;
  });
}

/** Lookup helper shared by the claim flow and any other by-number read. */
export async function findStudentRecordByNumber(rawStudentNumber: string) {
  const hash = studentNumberHash(rawStudentNumber);
  return (
    (await db.query.studentRecords.findFirst({
      where: eq(studentRecords.studentNumberHash, hash),
    })) ?? null
  );
}

/** Batch variant, keyed by lookup hash. */
export async function findStudentRecordsByNumbers(rawNumbers: string[]) {
  if (rawNumbers.length === 0) return new Map<string, typeof studentRecords.$inferSelect>();
  const hashes = rawNumbers.map(studentNumberHash);
  const rows = await db.query.studentRecords.findMany({
    where: inArray(studentRecords.studentNumberHash, hashes),
  });
  return new Map(rows.map((r) => [r.studentNumberHash!, r]));
}
