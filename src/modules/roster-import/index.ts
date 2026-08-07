import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { and, eq, ne, notInArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { enrollments, importBatches, studentRecords } from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { requireSectionStaff } from "@/modules/authz";
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
  readRosterEmail,
  type RosterField,
} from "./crs-columns";
import {
  editedRosterRowsSchema,
  emptyCourseMeta,
  isBlocking,
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
 * Class-list import (docs/student-identity.md, project-specs.md §6.1).
 *
 * Flow: parse (XLSX upload, or pasted CSV as a fallback) → editable preview
 * (create/enroll/reactivate/rename/deactivate + per-row warnings) → commit in a
 * transaction with an ImportBatch, audited.
 *
 * The imported UP email IS the student's access: importing an address is what
 * gives that person their classes, so an email that is missing, malformed, off
 * an allowed domain, duplicated in the file, or already held by a different
 * student record BLOCKS its row rather than being guessed at.
 *
 * Never silently overwrites:
 * - enrollments.rosterName always records the imported name per section;
 * - rows absent from a re-import DEACTIVATE the enrollment (never delete);
 * - a record is keyed by student number, so re-importing the same person is
 *   idempotent and their email link survives.
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
  if (columns.email === undefined) {
    return {
      ...base,
      ignoredColumns: ignored,
      deniedColumns: denied,
      fileError:
        'No UP email column found. Add a column headed "UP Mail" (or "email"): the email is what gives each student access to their classes.',
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
  const seenEmails = new Map<string, number>();
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
    const emailRaw = at(rec, "email");
    const emailResult = readRosterEmail(emailRaw, line, seenEmails);
    warnings.push(...emailResult.warnings);
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
      emailRaw,
      email: emailResult.email,
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
  // Emails are re-checked from scratch across the whole edited file, so fixing
  // one address cannot leave a stale duplicate flag on another row — or clear a
  // real one.
  const seenEmails = new Map<string, number>();
  const rows = parsed.rows.map((row) => {
    const patch = byKey.get(row.rowKey);
    const emailRaw = patch ? (patch.email ?? null) : row.emailRaw;
    const emailResult = readRosterEmail(emailRaw, row.line, seenEmails);
    if (!patch) {
      return {
        ...row,
        emailRaw,
        email: emailResult.email,
        warnings: [
          ...row.warnings.filter((w) => !EMAIL_WARNINGS.includes(w.code)),
          ...emailResult.warnings,
        ],
      };
    }
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
      studentNumber !== row.studentNumber ||
      fullName !== row.fullName ||
      emailResult.email !== row.email;
    const warnings: RowWarning[] = [...emailResult.warnings];
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
      emailRaw,
      email: emailResult.email,
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

/** Email findings are recomputed wholesale; anything else survives an edit. */
const EMAIL_WARNINGS: readonly RowWarning["code"][] = [
  "missing_email",
  "invalid_email",
  "disallowed_email_domain",
  "duplicate_email",
  "email_belongs_to_another_record",
  "cross_section_email_conflict",
];

/** Findings that come from live data, so they are re-derived, never carried. */
const LIVE_WARNINGS: readonly RowWarning["code"][] = [
  "email_belongs_to_another_record",
  "cross_section_email_conflict",
];

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
      /** the record's UP email is being set or changed — this IS the access grant */
      kind: "link_email";
      row: RosterRow;
      studentRecordId: string;
      currentEmail: string | null;
    }
  | {
      /** refused: the row carries a blocking warning and is not imported */
      kind: "blocked";
      row: RosterRow;
      studentRecordId?: string;
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
  /** rows that will NOT be imported because of a blocking warning */
  blockedCount: number;
  fileError?: string;
}

/**
 * Does another student record already hold this email?
 *
 * "Another" is the whole point: re-importing the SAME person with the SAME
 * address is idempotent, so a record whose id matches is not a conflict.
 */
async function conflictingEmailOwner(
  dbx: DbOrTx,
  email: string,
  ownRecordId: string | null,
) {
  if (!email) return null;
  const owner = await dbx.query.studentRecords.findFirst({
    where: eq(studentRecords.rosterEmail, email),
  });
  if (!owner || owner.id === ownRecordId) return null;
  return owner;
}

/**
 * Row checks that only live data can answer. Shared by preview and commit so
 * the two can never disagree about whether a row is importable — commit calls
 * it again inside its own transaction rather than trusting what preview found.
 *
 * Two distinct hazards, both about the fact that `roster_email` is GLOBAL while
 * import authority is section-scoped:
 *
 * 1. the address is already another student's — two records can never share one;
 * 2. the student number is already someone else's, that someone is in a section
 *    this import does not cover, and the file carries a different address.
 *    Applying it would silently move a student's access in a class this teacher
 *    has no authority over, so the row is refused instead.
 */
async function liveRowWarnings(
  dbx: DbOrTx,
  sectionId: string,
  row: RosterRow,
  record: typeof studentRecords.$inferSelect | undefined,
): Promise<RowWarning[]> {
  const warnings: RowWarning[] = [];

  const owner = await conflictingEmailOwner(dbx, row.email, record?.id ?? null);
  if (owner) {
    warnings.push({
      code: "email_belongs_to_another_record",
      existingLast4: owner.studentNumberLast4,
    });
  }

  // No stored record yet → no existing identity to overwrite, so nothing here
  // can be a cross-section problem.
  if (!record) return warnings;
  if (record.rosterEmail === row.email) return warnings;

  // Staff who already hold this student in THIS section may correct their
  // details, which is the ordinary "fix a typo in the class list" case.
  const enrolledHere = await dbx.query.enrollments.findFirst({
    where: and(
      eq(enrollments.sectionId, sectionId),
      eq(enrollments.studentRecordId, record.id),
    ),
  });
  if (enrolledHere) return warnings;

  // Not in this section, but in some other one: the address on file belongs to
  // a class this importer has no standing on. Deny by default. A record with no
  // enrolment anywhere is nobody else's, so adopting it is allowed.
  const elsewhere = await dbx.query.enrollments.findFirst({
    where: and(
      eq(enrollments.studentRecordId, record.id),
      ne(enrollments.sectionId, sectionId),
    ),
  });
  if (elsewhere) warnings.push({ code: "cross_section_email_conflict" });
  return warnings;
}

/**
 * Every student number the uploaded file MENTIONS — presence, not success.
 *
 * This is the set the deactivation pass complements, and the distinction is the
 * whole point: a row refused over its email still proves the teacher listed that
 * student, so it must never count as absent. Keying deactivation on successfully
 * imported rows instead would silently drop a student from the class because of
 * a typo in one cell.
 *
 * A number too malformed to match any record contributes a hash that matches
 * nothing, which is harmless — nothing is ever resolved by name.
 */
function presentStudentNumberHashes(parsed: ParsedRoster): string[] {
  return [
    ...new Set(parsed.rows.map((row) => studentNumberHash(row.studentNumber))),
  ];
}

/**
 * Active enrollments this import would deactivate: those whose student number
 * the file does not mention at all (D10 — deactivate, never delete).
 *
 * `everyRowBlocked` is the safety valve. A file that imported nothing tells us
 * nothing reliable about who left, so it removes nobody; without this, a class
 * list uploaded with a broken email column would empty the section.
 */
async function enrollmentsToDeactivate(
  dbx: DbOrTx,
  sectionId: string,
  parsed: ParsedRoster,
  everyRowBlocked: boolean,
) {
  if (everyRowBlocked) return [];
  const present = presentStudentNumberHashes(parsed);
  return dbx
    .select({
      enrollmentId: enrollments.id,
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
        present.length > 0
          ? notInArray(studentRecords.studentNumberHash, present)
          : undefined,
      ),
    );
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
    blockedCount: 0,
  };
  if (parsed.fileError) return { ...shell, fileError: parsed.fileError };

  const actions: PlannedAction[] = [];
  for (const row of parsed.rows) {
    const record = await db.query.studentRecords.findFirst({
      where: eq(studentRecords.studentNumberHash, studentNumberHash(row.studentNumber)),
    });
    // Conflicts only live data can see. Assigned rather than pushed so previewing
    // the same parsed roster twice cannot accumulate duplicate warnings.
    row.warnings = [
      ...row.warnings.filter((w) => !LIVE_WARNINGS.includes(w.code)),
      ...(await liveRowWarnings(db, sectionId, row, record)),
    ];
    if (row.warnings.some(isBlocking)) {
      actions.push({ kind: "blocked", row, studentRecordId: record?.id });
      continue;
    }
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
    const emailChanged = record.rosterEmail !== row.email;
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
    } else if (!nameChanged && !emailChanged) {
      actions.push({ kind: "unchanged", row, studentRecordId: record.id });
    }
    if (emailChanged) {
      actions.push({
        kind: "link_email",
        row,
        studentRecordId: record.id,
        currentEmail: record.rosterEmail,
      });
    }
    if (nameChanged) {
      actions.push({
        kind: "update_name",
        row,
        studentRecordId: record.id,
        currentName: record.fullName,
      });
    }
  }

  const blockedCount = actions.filter((a) => a.kind === "blocked").length;
  // Exactly the computation commit performs, from the same helper, so what the
  // preview promises about deactivation is what actually happens.
  const active = await enrollmentsToDeactivate(
    db,
    sectionId,
    parsed,
    parsed.rows.length > 0 && blockedCount === parsed.rows.length,
  );

  return {
    ...shell,
    actions,
    toDeactivate: active.map(({ studentRecordId, studentNumberLast4, name }) => ({
      studentRecordId,
      studentNumberLast4,
      name,
    })),
    warningCount: parsed.rows.reduce((sum, r) => sum + r.warnings.length, 0),
    blockedCount,
  };
}

export interface ImportSummary {
  importBatchId: string;
  created: number;
  enrolled: number;
  reactivated: number;
  namesUpdated: number;
  /** records whose UP email was set or changed — i.e. access granted or moved */
  emailsLinked: number;
  /** rows refused because of a blocking email or duplicate problem */
  blocked: number;
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
      emailsLinked: 0,
      blocked: 0,
      fieldsUpdated: 0,
      deactivated: 0,
      unchanged: 0,
      warned: parsed.rows.filter((r) => r.warnings.length > 0).length,
      notEnrolled: parsed.rows.filter((r) => r.crsStatus !== "enrolled").length,
      editedRows,
      errored: parsed.errors.length,
    };

    let blockedRows = 0;

    for (const row of parsed.rows) {
      const hash = studentNumberHash(row.studentNumber);
      let record = await tx.query.studentRecords.findFirst({
        where: eq(studentRecords.studentNumberHash, hash),
      });

      // Re-derived inside the transaction, never trusted from the preview: the
      // email is the access key, so a row whose address is missing, malformed,
      // off-domain, duplicated here, owned by a different student, or attached to
      // a student this section has no authority over is refused rather than
      // resolved on a guess.
      // Live findings are DISCARDED and re-derived, never inherited: a warning
      // left on the row by an earlier preview — possibly of a different section —
      // must not decide this import in either direction.
      const blocking = [
        ...new Set(
          [
            ...row.warnings.filter((w) => !LIVE_WARNINGS.includes(w.code)),
            ...(await liveRowWarnings(tx, sectionId, row, record)),
          ]
            .filter(isBlocking)
            .map((w) => w.code),
        ),
      ];
      if (blocking.length > 0) {
        summary.blocked += 1;
        blockedRows += 1;
        await writeAudit(tx, {
          actorUserId,
          action: "roster.row_rejected",
          entityType: "import_batch",
          entityId: batchId,
          // Row position and machine-readable reasons only: no student number,
          // no name, no address.
          metadata: { rowKey: row.rowKey, line: row.line, reasons: blocking },
          sectionId,
        });
        // Deliberately NOT recorded as absent: see enrollmentsToDeactivate.
        continue;
      }

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
            rosterEmail: row.email,
            familyName: row.familyName,
            firstName: row.firstName,
            livedName: row.livedName,
            preferredPronoun: row.preferredPronoun,
            program: row.program,
            createdByImportBatchId: batchId,
          })
          .returning();
        summary.created += 1;
        summary.emailsLinked += 1;
        await writeAudit(tx, {
          actorUserId,
          action: "roster.row_added",
          entityType: "student_record",
          entityId: id,
          after: { fullName: row.fullName, rosterEmail: row.email },
          metadata: { importBatchId: batchId, last4: sealed.last4 },
          sectionId,
        });
        // The linkage is its own event: it is what grants access, and it must be
        // findable without reading every import.
        await writeAudit(tx, {
          actorUserId,
          action: "roster.email_linked",
          entityType: "student_record",
          entityId: id,
          before: { rosterEmail: null },
          after: { rosterEmail: row.email },
          metadata: { importBatchId: batchId },
          sectionId,
        });
      } else {
        if (record.rosterEmail !== row.email) {
          await tx
            .update(studentRecords)
            .set({ rosterEmail: row.email, updatedAt: new Date() })
            .where(eq(studentRecords.id, record.id));
          await writeAudit(tx, {
            actorUserId,
            action: "roster.email_linked",
            entityType: "student_record",
            entityId: record.id,
            before: { rosterEmail: record.rosterEmail },
            after: { rosterEmail: row.email },
            metadata: { importBatchId: batchId },
            sectionId,
          });
          summary.emailsLinked += 1;
        }
        if (record.fullName !== row.fullName) {
          // The name is a label, never an identity key, so a corrected spelling
          // is applied — and audited with what it used to be.
          await tx
            .update(studentRecords)
            .set({ fullName: row.fullName, updatedAt: new Date() })
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

    // Absent from the new list → deactivate (data preserved; D10). Keyed on the
    // student numbers the file MENTIONS, not on the rows that imported cleanly:
    // a student whose row was refused is still on the class list the teacher
    // uploaded, and dropping them over a bad email cell would be silent and
    // wrong. Same helper the preview used, so the two agree by construction.
    const absent = await enrollmentsToDeactivate(
      tx,
      sectionId,
      parsed,
      parsed.rows.length > 0 && blockedRows === parsed.rows.length,
    );
    for (const a of absent) {
      await tx
        .update(enrollments)
        .set({ status: "deactivated", updatedAt: new Date() })
        .where(eq(enrollments.id, a.enrollmentId));
      await writeAudit(tx, {
        actorUserId,
        action: "roster.row_deactivated",
        entityType: "enrollment",
        entityId: a.enrollmentId,
        before: { status: "active" },
        after: { status: "deactivated" },
        metadata: { importBatchId: batchId, studentRecordId: a.studentRecordId },
        sectionId,
      });
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
