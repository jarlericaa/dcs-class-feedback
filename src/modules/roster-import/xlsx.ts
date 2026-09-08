import ExcelJS from "exceljs";
import { normalizeStudentNumber } from "@/modules/crypto/student-number";
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
  emptyCourseMeta,
  type CourseMetadata,
  type ParsedRoster,
  type RosterRow,
  type RowError,
  type RowWarning,
} from "./types";

/**
 * CRS-style .xlsx class-list parser (project-specs.md §6.1).
 *
 * The hard part is not reading cells, it is **not corrupting student numbers**.
 * A spreadsheet that stored `02312345` as a number has already destroyed the
 * leading zero at the file level; nothing downstream can recover it. So we:
 *
 *  1. prefer the cell's *formatted text*, which honours a text-formatted or
 *     custom-`numFmt` cell and therefore usually preserves the zero;
 *  2. only fall back to the raw numeric value when the formatted text is the
 *     bare number too;
 *  3. refuse that row so staff can save the source cell as text and re-import.
 *
 * We never zero-pad: guessing the width would invent an identifier.
 */

export const MAX_XLSX_BYTES = 5 * 1024 * 1024;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** .xlsx is a ZIP. Reject anything else before handing it to the parser. */
export function looksLikeXlsx(buffer: Buffer | Uint8Array): boolean {
  if (buffer.length < 4) return false;
  return ZIP_MAGIC.every((byte, i) => buffer[i] === byte);
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("result" in value) return String(value.result ?? "");
    if ("hyperlink" in value && "text" in value) return String(value.text ?? "");
  }
  return String(value);
}

/**
 * Read a student number without losing a leading zero where that is possible at
 * all. Returns whether the value came from a numeric cell.
 */
function readStudentNumber(cell: ExcelJS.Cell): {
  value: string;
  wasNumeric: boolean;
} {
  const formatted = (cell.text ?? "").trim();
  const raw = cell.value;
  const isNumericCell = typeof raw === "number";
  if (!isNumericCell) return { value: formatted || cellText(cell).trim(), wasNumeric: false };
  const bare = String(raw);
  // A formatted text that differs from the bare number means the cell carries a
  // display format that preserved the identifier — trust it.
  if (formatted && formatted !== bare) {
    return { value: formatted, wasNumeric: false };
  }
  return { value: bare, wasNumeric: true };
}

/**
 * Course metadata sits above the table in a CRS export as loose label/value
 * pairs, so scan the pre-header rows for recognizable labels rather than
 * assuming fixed coordinates.
 */
function readCourseMetadata(
  rows: string[][],
  headerRowIndex: number,
): CourseMetadata {
  const meta = emptyCourseMeta();
  const assign = (label: string, value: string) => {
    const key = label.toLowerCase().replace(/[:\s_]+/g, " ").trim();
    if (!value) return;
    if (/^(course|subject)( code)?$/.test(key) && !meta.courseCode) {
      meta.courseCode = value;
    } else if (/^(course|subject) title$|^title$|^description$/.test(key) && !meta.courseTitle) {
      meta.courseTitle = value;
    } else if (/^section|^class( section)?$/.test(key) && !meta.sectionLabel) {
      meta.sectionLabel = value;
    } else if (/^(term|semester|academic year|school year|ay)$/.test(key) && !meta.term) {
      meta.term = value;
    } else if (/^units?$|^credits?$/.test(key) && !meta.units) {
      meta.units = value;
    } else if (/^(instructor|faculty|teacher|professor)$/.test(key) && !meta.instructor) {
      meta.instructor = value;
    }
  };
  for (let r = 0; r < headerRowIndex; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const label = (row[c] ?? "").trim();
      if (!label) continue;
      // "Course: CS 12" in a single cell, or label in one cell and value in the next.
      const inline = /^([^:]{2,40}):\s*(.+)$/.exec(label);
      if (inline) {
        assign(inline[1]!, inline[2]!.trim());
        continue;
      }
      const next = (row[c + 1] ?? "").trim();
      if (next) assign(label, next);
    }
  }
  return meta;
}

/** Find the header row: the first row that maps a student-number column. */
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const { columns } = mapHeaders(rows[i] ?? []);
    if (columns.studentNumber !== undefined) return i;
  }
  return -1;
}

export async function parseRosterXlsx(
  input: Buffer | Uint8Array | ArrayBuffer,
): Promise<ParsedRoster> {
  const buffer = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input as ArrayBuffer);
  const base: ParsedRoster = {
    source: "xlsx",
    rows: [],
    errors: [],
    courseMeta: emptyCourseMeta(),
    ignoredColumns: [],
    deniedColumns: [],
  };
  if (buffer.length === 0) return { ...base, fileError: "The file is empty." };
  if (buffer.length > MAX_XLSX_BYTES) {
    return {
      ...base,
      fileError: `The file is larger than ${Math.round(MAX_XLSX_BYTES / 1024 / 1024)} MB.`,
    };
  }
  if (!looksLikeXlsx(buffer)) {
    return {
      ...base,
      fileError:
        "That does not look like an .xlsx workbook. Export the class list as Excel, or paste it as CSV instead.",
    };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (err) {
    return {
      ...base,
      fileError: `Could not read the workbook: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { ...base, fileError: "The workbook has no sheets." };
  }

  // Materialize as text so header detection and metadata scanning are simple.
  const grid: string[][] = [];
  const cells: (ExcelJS.Cell | undefined)[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const textRow: string[] = [];
    const cellRow: (ExcelJS.Cell | undefined)[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      textRow[colNumber - 1] = cellText(cell).trim();
      cellRow[colNumber - 1] = cell;
    });
    grid[rowNumber - 1] = textRow;
    cells[rowNumber - 1] = cellRow;
  });

  const headerRowIndex = findHeaderRow(grid);
  if (headerRowIndex === -1) {
    return {
      ...base,
      fileError:
        'No student-number column found. The sheet needs a header row containing a "Student Number" column.',
    };
  }

  const header = grid[headerRowIndex] ?? [];
  const { columns, ignored, denied } = mapHeaders(header);
  const courseMeta = readCourseMetadata(grid, headerRowIndex);

  const hasName =
    columns.fullName !== undefined ||
    columns.familyName !== undefined ||
    columns.firstName !== undefined;
  if (!hasName) {
    return {
      ...base,
      courseMeta,
      ignoredColumns: ignored,
      deniedColumns: denied,
      fileError:
        'No name column found. The sheet needs either a "Name" column or "Family Name" and "First Name" columns.',
    };
  }
  if (columns.email === undefined) {
    return {
      ...base,
      courseMeta,
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

  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const textRow = grid[r] ?? [];
    const cellRow = cells[r] ?? [];
    const line = r + 1;
    const numberCell = cellRow[columns.studentNumber!];
    const { value: studentNumberRaw, wasNumeric } = numberCell
      ? readStudentNumber(numberCell)
      : { value: "", wasNumeric: false };
    const studentNumber = studentNumberRaw.trim();
    const familyName = at(textRow, "familyName");
    const firstName = at(textRow, "firstName");
    const middleName = at(textRow, "middleName");
    const fullName = composeFullName({
      fullName: at(textRow, "fullName"),
      familyName,
      firstName,
      middleName,
    });

    // Entirely blank rows are spacing, not data.
    if (!studentNumber && !fullName && textRow.every((c) => !c)) continue;

    if (!studentNumber) {
      errors.push({ line, message: "Missing student number" });
      continue;
    }
    if (!fullName) {
      errors.push({ line, message: "Missing student name" });
      continue;
    }

    const warnings: RowWarning[] = [];
    if (wasNumeric) warnings.push({ code: "numeric_student_number" });
    if (isMalformedStudentNumber(studentNumber)) {
      warnings.push({ code: "malformed_student_number" });
    }
    // Normalized, not raw — same reason as the CSV path: the number's identity
    // is its normalized form, so two spellings of it are one student.
    const numberKey = normalizeStudentNumber(studentNumber);
    const dupLine = seen.get(numberKey);
    if (dupLine !== undefined) {
      warnings.push({ code: "duplicate_student_number", firstSeenLine: dupLine });
    } else {
      seen.set(numberKey, line);
    }
    const emailRaw = at(textRow, "email");
    const emailResult = readRosterEmail(emailRaw, line, seenEmails);
    warnings.push(...emailResult.warnings);

    const crsStatusRaw = at(textRow, "enrollmentStatus");
    const crsStatus = normalizeCrsStatus(crsStatusRaw);
    if (crsStatus === "unknown" && crsStatusRaw) {
      warnings.push({ code: "unknown_status", raw: crsStatusRaw });
    } else if (crsStatus === "not_enrolled") {
      warnings.push({ code: "not_enrolled_status", raw: crsStatusRaw ?? "" });
    }

    const enlistmentCell =
      columns.enlistmentDate !== undefined
        ? cellRow[columns.enlistmentDate]
        : undefined;
    const enlistmentDate = parseEnlistmentDate(
      enlistmentCell?.value instanceof Date || typeof enlistmentCell?.value === "number"
        ? (enlistmentCell.value as Date | number)
        : at(textRow, "enlistmentDate"),
    );

    rows.push({
      line,
      rowKey: `r${line}`,
      studentNumber,
      numberWasNumericCell: wasNumeric,
      emailRaw,
      email: emailResult.email,
      familyName,
      firstName,
      middleName,
      livedName: at(textRow, "livedName"),
      preferredPronoun: at(textRow, "preferredPronoun"),
      program: at(textRow, "program"),
      crsStatusRaw,
      crsStatus,
      enlistmentDate,
      fullName,
      warnings,
    });
  }

  return {
    source: "xlsx",
    rows,
    errors,
    courseMeta,
    ignoredColumns: ignored,
    deniedColumns: denied,
  };
}
