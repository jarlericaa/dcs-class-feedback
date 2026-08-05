import { describe, expect, it } from "vitest";
import {
  academicYearLabel,
  derivedAcademicYear,
  encodeTerm,
  formatTerm,
  parseTerm,
  semesterLabel,
  termParts,
} from "@/lib/term";

/**
 * The term adapter is the only thing standing between a storage key and what a
 * teacher reads, so its round trip and its fallback both matter: a value it
 * cannot parse must survive to the screen unchanged rather than disappear.
 */
describe("academic term adapter", () => {
  it("round-trips the stored representation", () => {
    for (const [year, semester] of [
      [2026, "1"],
      [2026, "2"],
      [2030, "M"],
    ] as const) {
      const stored = encodeTerm(year, semester);
      const parsed = parseTerm(stored);
      expect(parsed).toEqual({
        startYear: year,
        endYear: year + 1,
        semester,
      });
    }
  });

  it("encodes exactly the shape already in the database", () => {
    expect(encodeTerm(2026, "1")).toBe("AY2026-1");
    expect(encodeTerm(2026, "M")).toBe("AY2026-M");
  });

  it("reads the shipped seed value", () => {
    expect(parseTerm("AY2026-1")).toEqual({
      startYear: 2026,
      endYear: 2027,
      semester: "1",
    });
    expect(academicYearLabel("AY2026-1")).toBe("2026-2027");
    expect(semesterLabel("AY2026-1")).toBe("1st semester");
  });

  it("tolerates surrounding whitespace and lower case", () => {
    expect(parseTerm("  ay2026-m  ")?.semester).toBe("M");
  });

  it("returns the two facts as separate parts, never pre-joined", () => {
    expect(termParts("AY2026-2")).toEqual(["2026-2027", "2nd semester"]);
  });

  it("passes an unparseable value through instead of destroying it", () => {
    // A term somebody typed by hand is still the truth about that section.
    expect(termParts("First sem 2026")).toEqual(["First sem 2026"]);
    expect(formatTerm("First sem 2026")).toBe("First sem 2026");
    expect(academicYearLabel("First sem 2026")).toBe("");
    expect(semesterLabel("First sem 2026")).toBe("");
  });

  it("treats blank and missing values as no term at all", () => {
    for (const value of [null, undefined, "", "   "]) {
      expect(termParts(value)).toEqual([]);
      expect(formatTerm(value)).toBe("");
    }
  });

  it("rejects a semester the product does not have", () => {
    expect(parseTerm("AY2026-3")).toBeNull();
    expect(parseTerm("AY2026-0")).toBeNull();
  });

  it("rejects a year outside the plausible range", () => {
    expect(parseTerm("AY1999-1")).toBeNull();
    expect(parseTerm("AY2101-1")).toBeNull();
    expect(parseTerm("AY26-1")).toBeNull();
  });

  it("derives the academic year from partial builder input", () => {
    expect(derivedAcademicYear("2026")).toBe("2026-2027");
    expect(derivedAcademicYear("2099")).toBe("2099-2100");
    // Mid-typing and nonsense both yield nothing to show, not a wrong year.
    expect(derivedAcademicYear("20")).toBe("");
    expect(derivedAcademicYear("")).toBe("");
    expect(derivedAcademicYear("abcd")).toBe("");
  });
});
