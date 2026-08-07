import { describe, expect, it } from "vitest";
import { parseRosterCsv } from "@/modules/roster-import";

const HEADER = "Student Number,Full Name,UP Mail";

describe("parseRosterCsv", () => {
  it("parses valid rows with header detection", () => {
    const parsed = parseRosterCsv(
      `${HEADER}\n2026-001,Juan Dela Cruz,juan@up.edu.ph\n2026-002,Maria Santos,maria@up.edu.ph\n`,
    );
    expect(parsed.fileError).toBeUndefined();
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      studentNumber: "2026-001",
      fullName: "Juan Dela Cruz",
      email: "juan@up.edu.ph",
    });
  });

  it("accepts alternate header spellings and extra columns", () => {
    const parsed = parseRosterCsv(
      "no,student_number,name,university email\nx,2026-001,Juan Dela Cruz,juan@up.edu.ph\n",
    );
    expect(parsed.fileError).toBeUndefined();
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.email).toBe("juan@up.edu.ph");
  });

  it.each(["email", "e-mail", "upmail", "up mail", "school email"])(
    "recognizes %s as the email column",
    (header) => {
      const parsed = parseRosterCsv(
        `student number,full name,${header}\n2026-001,A B,a.b@up.edu.ph\n`,
      );
      expect(parsed.fileError).toBeUndefined();
      expect(parsed.rows[0]!.email).toBe("a.b@up.edu.ph");
    },
  );

  it("rejects files without required columns", () => {
    const parsed = parseRosterCsv("id,email\n1,a@b.c\n");
    expect(parsed.fileError).toMatch(/Required columns/);
  });

  it("rejects a file with no email column, naming what to add", () => {
    const parsed = parseRosterCsv(
      "student number,full name\n2026-001,Juan Dela Cruz\n",
    );
    expect(parsed.fileError).toMatch(/UP email column/i);
  });

  it("reports row-level errors without failing the file", () => {
    const parsed = parseRosterCsv(
      `${HEADER}\n,No Number,x@up.edu.ph\n2026-001,,y@up.edu.ph\n2026-002,Ok Name,z@up.edu.ph\n`,
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.errors[0]!.message).toMatch(/student number/i);
  });

  it("detects in-file duplicate student numbers", () => {
    const parsed = parseRosterCsv(
      `${HEADER}\n2026-001,A,a@up.edu.ph\n2026-001,B,b@up.edu.ph\n`,
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors[0]!.message).toMatch(/Duplicate/);
  });

  it("flags the SECOND row of a duplicated email, not the first", () => {
    const parsed = parseRosterCsv(
      `${HEADER}\n2026-001,A,dupe@up.edu.ph\n2026-002,B,DUPE@UP.EDU.PH\n`,
    );
    expect(parsed.rows[0]!.warnings).toEqual([]);
    expect(parsed.rows[1]!.warnings).toContainEqual({
      code: "duplicate_email",
      firstSeenLine: 2,
    });
  });

  it("warns per row about a missing, malformed, or off-domain email", () => {
    const parsed = parseRosterCsv(
      `${HEADER}\n` +
        "2026-001,A,\n" +
        "2026-002,B,nope\n" +
        "2026-003,C,c@gmail.com\n",
    );
    expect(parsed.rows.map((r) => r.warnings.map((w) => w.code))).toEqual([
      ["missing_email"],
      ["invalid_email"],
      ["disallowed_email_domain"],
    ]);
  });

  it("handles empty files", () => {
    expect(parseRosterCsv("").fileError).toBeDefined();
  });
});
