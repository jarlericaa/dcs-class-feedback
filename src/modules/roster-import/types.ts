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
  | { code: "conflicting_existing_record"; field: string; existing: string };

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
};

export interface RosterRow {
  line: number;
  /** stable across preview → edit → commit */
  rowKey: string;
  studentNumber: string;
  /**
   * True when the source cell was numeric, so a leading zero cannot be
   * recovered. We warn instead of zero-padding: guessing the width would invent
   * an identifier.
   */
  numberWasNumericCell: boolean;
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
