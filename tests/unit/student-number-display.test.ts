import { describe, expect, it } from "vitest";

import {
  formatStudentNumber,
  studentNumberTail,
} from "@/lib/student-number";
import { normalizeStudentNumber } from "@/modules/crypto/student-number";

/**
 * Reading a student number back after normalization has thrown its
 * punctuation away.
 *
 * The rule is narrow deliberately: restore the separator for the one shape it
 * is known to belong to, and print anything else exactly as stored. A
 * mis-split identifier is worse than an unpunctuated one, and this formatter
 * must never be the reason two students look like each other.
 */
describe("formatStudentNumber", () => {
  it("restores the separator on a UP-format number", () => {
    expect(formatStudentNumber("202600001")).toBe("2026-00001");
    expect(formatStudentNumber("201912345")).toBe("2019-12345");
  });

  it("round-trips a real number through normalization", () => {
    // The whole point: what a teacher typed comes back looking like what they
    // typed, even though the stored form has no separator.
    for (const typed of ["2026-00001", "2026 00001", "202600001"]) {
      expect(formatStudentNumber(normalizeStudentNumber(typed))).toBe(
        "2026-00001",
      );
    }
  });

  it("keeps leading zeroes, in both halves", () => {
    expect(formatStudentNumber("000000001")).toBe("0000-00001");
    expect(formatStudentNumber("202600000")).toBe("2026-00000");
  });

  it("prints anything of another shape exactly as stored", () => {
    // Eight digits, ten digits, and a value carrying a letter: none of these
    // is a shape this code has been told the separator's position for.
    expect(formatStudentNumber("20260001")).toBe("20260001");
    expect(formatStudentNumber("2026000012")).toBe("2026000012");
    expect(formatStudentNumber("2026A0001")).toBe("2026A0001");
    expect(formatStudentNumber("ABC")).toBe("ABC");
  });

  it("never invents a number where there is none", () => {
    expect(formatStudentNumber(null)).toBeNull();
    expect(formatStudentNumber(undefined)).toBeNull();
    expect(formatStudentNumber("")).toBeNull();
    expect(formatStudentNumber("   ")).toBeNull();
  });

  it("does not silently repair an already-punctuated value", () => {
    // Nothing stored should look like this — normalization strips the dash
    // before sealing — so it is printed as found rather than parsed.
    expect(formatStudentNumber("2026-00001")).toBe("2026-00001");
  });
});

describe("studentNumberTail", () => {
  it("marks a partial value as partial", () => {
    expect(studentNumberTail("0001")).toBe("…0001");
  });

  it("says nothing when there is not even a tail", () => {
    expect(studentNumberTail(null)).toBeNull();
    expect(studentNumberTail("")).toBeNull();
  });
});
