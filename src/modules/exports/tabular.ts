import ExcelJS from "exceljs";

/**
 * Shared tabular-export primitives.
 *
 * Extracted from the participation module so that CSV, XLSX and PDF exports all
 * neutralize the same way. Any new export must go through here — writing cells
 * by hand is how one path ends up unprotected.
 */

export type Cell = string | number | null | undefined;

export interface Sheet {
  name: string;
  header: string[];
  rows: Cell[][];
}

/**
 * Neutralize spreadsheet formula injection.
 *
 * These exports carry student-authored text straight into a staff member's
 * spreadsheet. Excel and Sheets evaluate any cell starting with =, +, - or @ as
 * a formula, so a submitted answer could execute in the reader's spreadsheet.
 * A leading apostrophe forces a literal string and is not displayed.
 *
 * Tab and carriage return are included because both can be used to shift content
 * into a neighbouring cell.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** CSV-escape a value, formula-neutralized first. */
export function csvEscape(value: Cell): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = neutralizeFormula(raw);
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

/** Excel forbids : \\ / ? * [ ] in sheet names and caps them at 31 characters. */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim() || "Sheet";
  return cleaned.slice(0, 31);
}

/**
 * Render sheets to an .xlsx buffer.
 *
 * Every cell is written as an explicitly-typed **string** after the same
 * neutralization the CSV path applies, except for real numbers. Writing a
 * `=...` string as a plain value would otherwise let ExcelJS store it as a
 * formula, which is exactly the injection the CSV path guards against.
 */
export async function toXlsxBuffer(sheets: Sheet[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Class Feedback";
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(safeSheetName(sheet.name));
    worksheet.addRow(sheet.header.map((h) => neutralizeFormula(h)));
    worksheet.getRow(1).font = { bold: true };
    for (const row of sheet.rows) {
      const values = row.map((cell) => {
        if (typeof cell === "number" && Number.isFinite(cell)) return cell;
        if (cell === null || cell === undefined) return "";
        return neutralizeFormula(String(cell));
      });
      // Strings are written as string cells: ExcelJS only produces a formula
      // from an explicit `{ formula }` value, which this path never constructs.
      worksheet.addRow(values);
    }
    worksheet.columns.forEach((column) => {
      column.width = Math.min(
        60,
        Math.max(
          12,
          ...[sheet.header, ...sheet.rows.slice(0, 200)].map((r) => {
            const idx = (column.number ?? 1) - 1;
            const value = Array.isArray(r) ? r[idx] : undefined;
            return value === null || value === undefined
              ? 12
              : String(value).length + 2;
          }),
        ),
      );
    });
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
