import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { isBlocking, parseRosterXlsx } from "@/modules/roster-import";

/**
 * The XLSX parser's in-file duplicate rule, which has to match the CSV one.
 *
 * A student number's identity is its NORMALIZED form — that is what the
 * uniqueness hash and every lookup are keyed on — so two spellings of one
 * number are one student. Both parsers compared raw cells, which let
 * `2026-00001` and `202600001` pass as two people; downstream they resolve to
 * the same record and the later row silently reassigns the earlier one's UP
 * email, which is the access key.
 *
 * Unlike the CSV path, XLSX keeps the duplicated row and marks it — the warning
 * is blocking, so the row is refused at commit while still counting as present
 * for the deactivation pass.
 */
async function workbook(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Class List");
  sheet.addRow(["Student Number", "Full Name", "UP Mail"]);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("parseRosterXlsx in-file duplicate student numbers", () => {
  it("parses a clean sheet", async () => {
    const parsed = await parseRosterXlsx(
      await workbook([
        ["2026-00001", "Juan Dela Cruz", "juan@up.edu.ph"],
        ["2026-00002", "Maria Santos", "maria@up.edu.ph"],
      ]),
    );
    expect(parsed.fileError).toBeUndefined();
    expect(parsed.rows).toHaveLength(2);
    expect(
      parsed.rows.flatMap((r) => r.warnings.map((w) => w.code)),
    ).not.toContain("duplicate_student_number");
  });

  it("flags a punctuation variant of an earlier number as a duplicate", async () => {
    const parsed = await parseRosterXlsx(
      await workbook([
        ["2026-00001", "Juan Dela Cruz", "juan@up.edu.ph"],
        ["202600001", "Maria Santos", "maria@up.edu.ph"],
      ]),
    );
    expect(parsed.rows).toHaveLength(2);
    // The SECOND row is the flagged one, so the first spelling keeps the row.
    expect(parsed.rows[0]!.warnings.map((w) => w.code)).not.toContain(
      "duplicate_student_number",
    );
    expect(parsed.rows[1]!.warnings).toContainEqual({
      code: "duplicate_student_number",
      firstSeenLine: 2,
    });
  });

  it("refuses a bare numeric cell until it is saved as text", async () => {
    const parsed = await parseRosterXlsx(
      await workbook([[202600001, "Numeric", "numeric@up.edu.ph"]]),
    );
    const warning = parsed.rows[0]!.warnings.find(
      (item) => item.code === "numeric_student_number",
    );
    expect(warning).toBeDefined();
    expect(isBlocking(warning!)).toBe(true);
  });

  it.each(["2026 00001", "2026--00001", " 2026-00001 "])(
    "treats %s as the same number",
    async (spelling) => {
      const parsed = await parseRosterXlsx(
        await workbook([
          ["2026-00001", "Juan Dela Cruz", "juan@up.edu.ph"],
          [spelling, "Maria Santos", "maria@up.edu.ph"],
        ]),
      );
      expect(parsed.rows[1]!.warnings.map((w) => w.code)).toContain(
        "duplicate_student_number",
      );
    },
  );
});
