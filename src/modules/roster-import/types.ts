import { z } from "zod";

/**
 * Shared shapes for roster parsing. Kept separate from the service so the CSV
 * and XLSX parsers can both produce them without importing database code.
 */

export type RowWarning =
  | { code: "numeric_student_number" }
  | { code: "malformed_student_number" }
  | { code: "duplicate_student_number"; firstSeenLine: number }
  | { code: "unknown_status"; raw: string }
  | { code: "not_enrolled_status"; raw: string }
  | { code: "missing_required"; field: string }
  | { code: "conflicting_existing_record"; field: string; existing: string }
  // --- email identity (docs/domain/student-identity.md) ---
  | { code: "missing_email" }
  | { code: "invalid_email" }
  | { code: "disallowed_email_domain"; domain: string }
  | { code: "duplicate_email"; firstSeenLine: number }
  | { code: "email_belongs_to_another_record"; existingLast4: string | null }
  | { code: "cross_section_email_conflict" };

export const WARNING_LABELS: Record<RowWarning["code"], string> = {
  numeric_student_number:
    "The spreadsheet stored this student number as a number, so any leading zero is already lost. Check it before importing.",
  malformed_student_number: "This does not look like a student number.",
  duplicate_student_number: "This student number appears more than once in the file.",
  unknown_status:
    "This enrollment status is not one we recognize — review before importing.",
  not_enrolled_status:
    "The spreadsheet does not consider this student enrolled.",
  missing_required: "A required field is empty.",
  conflicting_existing_record:
    "This differs from what is already stored for this student.",
  missing_email:
    "No UP email. Without one this student cannot be given access, so the row is not imported.",
  invalid_email: "This does not look like an email address.",
  disallowed_email_domain:
    "This email is not on an allowed university domain, so it can never sign in.",
  duplicate_email: "This email appears more than once in the file.",
  email_belongs_to_another_record:
    "Another student record already uses this email. Two students can never share one.",
  cross_section_email_conflict:
    "This student number already belongs to a student in another class, with a different UP email on file. Changing it here would change their access everywhere, so this row is not imported. Import them with their existing UP email, or ask an administrator to correct their identity.",
};

/**
 * Warnings that STOP a row being imported. Everything else is advisory and the
 * teacher decides. Anything touching the email is blocking, because the email is
 * the access key: guessing at it would hand one student another's classes.
 * Student-number cells that cannot be trusted are blocking too: importing one
 * would either create an identity that cannot be matched later or silently
 * accept a spreadsheet-corrupted value.
 */
export const BLOCKING_WARNINGS: readonly RowWarning["code"][] = [
  "missing_email",
  "invalid_email",
  "disallowed_email_domain",
  "duplicate_email",
  "email_belongs_to_another_record",
  "cross_section_email_conflict",
  "duplicate_student_number",
  "numeric_student_number",
  "malformed_student_number",
];

export function isBlocking(warning: RowWarning): boolean {
  return BLOCKING_WARNINGS.includes(warning.code);
}

export interface RosterRow {
  line: number;
  /** stable across preview → edit → commit */
  rowKey: string;
  studentNumber: string;
  /**
   * True when the source cell was numeric, so a leading zero cannot be
   * recovered. The row is refused instead of zero-padding: guessing the width
   * would invent an identifier.
   */
  numberWasNumericCell: boolean;
  /** Exactly as the file spelled it, so the preview shows what was uploaded. */
  emailRaw: string | null;
  /** Trimmed + lowercased. Empty when the cell was blank or unusable. */
  email: string;
  familyName: string | null;
  firstName: string | null;
  middleName: string | null;
  livedName: string | null;
  preferredPronoun: string | null;
  program: string | null;
  crsStatusRaw: string | null;
  crsStatus: "enrolled" | "not_enrolled" | "unknown";
  /** ISO date */
  enlistmentDate: string | null;
  fullName: string;
  warnings: RowWarning[];
  edited?: boolean;
}

export interface RowError {
  line: number;
  message: string;
}

export interface CourseMetadata {
  courseCode: string | null;
  courseTitle: string | null;
  sectionLabel: string | null;
  term: string | null;
  units: string | null;
  instructor: string | null;
}

export interface ParsedRoster {
  source: "xlsx" | "csv";
  rows: RosterRow[];
  errors: RowError[];
  courseMeta: CourseMetadata;
  /** headers present in the file that were not mapped */
  ignoredColumns: string[];
  /** headers refused on principle — must include Sex Assigned at Birth when present */
  deniedColumns: string[];
  fileError?: string;
}

export const emptyCourseMeta = (): CourseMetadata => ({
  courseCode: null,
  courseTitle: null,
  sectionLabel: null,
  term: null,
  units: null,
  instructor: null,
});

/**
 * Schema for preview rows posted back by the confirmation screen.
 *
 * The edited rows are untrusted input: a client could add rows, change a
 * student number, or send a megabyte of text. Everything is re-validated here
 * and re-resolved against live data inside the commit transaction.
 */
export const editedRosterRowSchema = z.object({
  line: z.number().int().min(0),
  rowKey: z.string().min(1).max(80),
  studentNumber: z.string().min(1).max(64),
  email: z.string().max(254).nullish(),
  familyName: z.string().max(200).nullish(),
  firstName: z.string().max(200).nullish(),
  middleName: z.string().max(200).nullish(),
  livedName: z.string().max(200).nullish(),
  preferredPronoun: z.string().max(60).nullish(),
  program: z.string().max(200).nullish(),
  crsStatusRaw: z.string().max(120).nullish(),
  crsStatus: z.enum(["enrolled", "not_enrolled", "unknown"]),
  enlistmentDate: z.string().max(40).nullish(),
  fullName: z.string().min(1).max(300),
});

export const editedRosterRowsSchema = z.array(editedRosterRowSchema).max(2000);
