import { describe, expect, it } from "vitest";
import {
  academicYearLabel,
  academicYearOptions,
  courseTermParts,
  currentTerm,
  derivedAcademicYear,
  encodeTerm,
  fallbackTerm,
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

/**
 * The course's own term, and what reads it.
 *
 * These three functions exist because of migration `0007_course_term`: the term
 * moved from being a property of each class list to a property of the course
 * offering. Every one of them has to keep a course that PREDATES that column
 * rendering exactly as it did, which is the only way the migration could stay
 * additive — so each test below pairs the new path with the old one.
 */
describe("a course's own term", () => {
  describe("fallbackTerm", () => {
    it("prefers the course's own term over its sections'", () => {
      expect(fallbackTerm("AY2026-1", ["AY2024-2", "AY2025-1"])).toBe(
        "AY2026-1",
      );
    });

    it("falls back to a section's term for a course that predates the column", () => {
      expect(fallbackTerm(null, ["AY2024-2"])).toBe("AY2024-2");
      expect(fallbackTerm(undefined, ["AY2024-2"])).toBe("AY2024-2");
    });

    it("skips section terms it cannot parse rather than inheriting a typo", () => {
      expect(fallbackTerm(null, ["First sem", "AY2025-M"])).toBe("AY2025-M");
    });

    it("ignores a course term it cannot parse", () => {
      // Same rule as the sections: an unparseable value is not inherited.
      expect(fallbackTerm("whenever", ["AY2025-1"])).toBe("AY2025-1");
    });

    it("lands on the current term only when nothing else is known", () => {
      expect(fallbackTerm(null, [])).toBe(currentTerm());
      expect(fallbackTerm(null)).toBe(currentTerm());
    });

    it("trims the course term, as the section path already did", () => {
      expect(fallbackTerm("  AY2026-1  ", [])).toBe("AY2026-1");
    });
  });

  describe("courseTermParts", () => {
    it("reads the course's term when it has one", () => {
      expect(courseTermParts("AY2026-1", [])).toEqual([
        "2026-2027",
        "1st semester",
      ]);
    });

    it("shows a term for a course with no class lists yet", () => {
      // The state a course spends its first five minutes in. Before the column
      // this rendered nothing at all.
      expect(courseTermParts("AY2026-2", [])).toEqual([
        "2026-2027",
        "2nd semester",
      ]);
    });

    it("keeps the old reading for a course that predates the column", () => {
      expect(courseTermParts(null, ["AY2026-1"])).toEqual([
        "2026-2027",
        "1st semester",
      ]);
      expect(courseTermParts(null, ["AY2026-1", "AY2026-1"])).toEqual([
        "2026-2027",
        "1st semester",
      ]);
      expect(courseTermParts(null, ["AY2026-1", "AY2025-2"])).toEqual([
        "2 terms",
      ]);
      expect(courseTermParts(null, [])).toEqual([]);
    });

    it("does not say '2 terms' when the course itself answers the question", () => {
      // The course's term settles it; disagreeing sections are not a summary.
      expect(courseTermParts("AY2026-1", ["AY2025-1", "AY2024-2"])).toEqual([
        "2026-2027",
        "1st semester",
      ]);
    });
  });

  describe("academicYearOptions", () => {
    it("offers a short window centred on the current academic year", () => {
      const options = academicYearOptions(new Date("2026-09-01T00:00:00Z"));
      expect(options.map((o) => o.value)).toEqual([2027, 2026, 2025, 2024, 2023]);
      expect(options[1]).toEqual({ value: 2026, label: "2026 - 2027" });
    });

    it("includes the term the dialog opens on, so the default is selectable", () => {
      for (const iso of [
        "2026-01-15T00:00:00Z",
        "2026-06-15T00:00:00Z",
        "2026-09-01T00:00:00Z",
      ]) {
        const now = new Date(iso);
        const opening = parseTerm(currentTerm(now))!;
        expect(
          academicYearOptions(now).map((o) => o.value),
        ).toContain(opening.startYear);
      }
    });
  });
});
