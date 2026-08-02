import { describe, expect, it } from "vitest";
import { parseRosterCsv } from "@/modules/roster-import";

describe("parseRosterCsv", () => {
  it("parses valid rows with header detection", () => {
    const parsed = parseRosterCsv(
      "Student Number,Full Name\n2026-001,Juan Dela Cruz\n2026-002,Maria Santos\n",
    );
    expect(parsed.fileError).toBeUndefined();
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      studentNumber: "2026-001",
      fullName: "Juan Dela Cruz",
    });
  });

  it("accepts alternate header spellings and extra columns", () => {
    const parsed = parseRosterCsv(
      "no,student_number,name\nx,2026-001,Juan Dela Cruz\n",
    );
    expect(parsed.fileError).toBeUndefined();
    expect(parsed.rows).toHaveLength(1);
  });

  it("rejects files without required columns", () => {
    const parsed = parseRosterCsv("id,email\n1,a@b.c\n");
    expect(parsed.fileError).toMatch(/Required columns/);
  });

  it("reports row-level errors without failing the file", () => {
    const parsed = parseRosterCsv(
      "student number,full name\n,No Number\n2026-001,\n2026-002,Ok Name\n",
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.errors[0]!.message).toMatch(/student number/i);
  });

  it("detects in-file duplicate student numbers", () => {
    const parsed = parseRosterCsv(
      "student number,full name\n2026-001,A\n2026-001,B\n",
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors[0]!.message).toMatch(/Duplicate/);
  });

  it("handles empty files", () => {
    expect(parseRosterCsv("").fileError).toBeDefined();
  });
});
