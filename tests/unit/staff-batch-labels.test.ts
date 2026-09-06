import { describe, expect, it } from "vitest";
import {
  STAFF_BATCH_PROBLEM_REASONS,
  UNKNOWN_STAFF_BATCH_PROBLEM,
  staffBatchProblemLabel,
  staffGrantSummary,
  staffScopeSentence,
} from "@/lib/staff-batch-labels";

/**
 * A refusal a teacher can act on. The codes are the contract; these cases pin
 * that every code says something specific, and that an unknown one degrades to
 * a safe sentence instead of printing an implementation detail.
 */

describe("staffBatchProblemLabel", () => {
  it("covers every reason in the vocabulary", () => {
    expect(STAFF_BATCH_PROBLEM_REASONS).toEqual([
      "invalid_format",
      "disallowed_domain",
      "no_account",
      "inactive_account",
      "too_many",
      "not_in_course",
      "role_not_allowed_for_scope",
    ]);
    for (const reason of STAFF_BATCH_PROBLEM_REASONS) {
      const label = staffBatchProblemLabel(reason);
      expect(label).not.toBe(UNKNOWN_STAFF_BATCH_PROBLEM);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("says something different for each reason", () => {
    const labels = STAFF_BATCH_PROBLEM_REASONS.map(staffBatchProblemLabel);
    expect(new Set(labels).size).toBe(STAFF_BATCH_PROBLEM_REASONS.length);
  });

  it("reads as a sentence, not as a code", () => {
    for (const reason of STAFF_BATCH_PROBLEM_REASONS) {
      const label = staffBatchProblemLabel(reason);
      expect(label).not.toContain("_");
      expect(label[0]).toBe(label[0]!.toUpperCase());
      expect(label.endsWith(".")).toBe(true);
    }
  });

  it("names the cap so the reader knows what to do next", () => {
    expect(staffBatchProblemLabel("too_many")).toContain("50");
  });

  it("tells an unknown account apart from a deactivated one", () => {
    expect(staffBatchProblemLabel("no_account")).not.toBe(
      staffBatchProblemLabel("inactive_account"),
    );
    expect(staffBatchProblemLabel("no_account")).toMatch(/sign in/i);
    expect(staffBatchProblemLabel("inactive_account")).toMatch(/deactivated/i);
  });

  it("falls back safely for a code it does not know", () => {
    for (const value of ["", "nonsense", "invalid_format ", "INVALID_FORMAT"]) {
      expect(staffBatchProblemLabel(value)).toBe(UNKNOWN_STAFF_BATCH_PROBLEM);
    }
  });

  /**
   * The fallback is a fixed sentence rather than the code de-underscored: a
   * fallback that echoed its input would print a validator's own message —
   * "Expected string, received null" — at a reader who cannot act on it.
   */
  it("never echoes what it was given, so validator text cannot leak", () => {
    const zodish = "Expected string, received null";
    expect(staffBatchProblemLabel(zodish)).toBe(UNKNOWN_STAFF_BATCH_PROBLEM);
    expect(staffBatchProblemLabel(zodish)).not.toContain("Expected");
    expect(staffBatchProblemLabel("<script>alert(1)</script>")).not.toContain(
      "script",
    );
  });

  it("is safe against a prototype key rather than returning a function", () => {
    for (const key of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(staffBatchProblemLabel(key)).toBe(UNKNOWN_STAFF_BATCH_PROBLEM);
    }
  });
});

/**
 * What the Add staff dialog says after a grant. Counts are per grant, which at
 * class-list scope means per person per class list, so the wording must not
 * imply people.
 */
describe("staffGrantSummary", () => {
  it("reports only the counts that happened", () => {
    expect(staffGrantSummary({ added: 2, updated: 0, unchanged: 0 })).toBe(
      "2 added",
    );
    expect(staffGrantSummary({ added: 0, updated: 3, unchanged: 0 })).toBe(
      "3 updated",
    );
    expect(staffGrantSummary({ added: 0, updated: 0, unchanged: 4 })).toBe(
      "4 already had this access",
    );
  });

  it("keeps the three counts distinct rather than collapsing them", () => {
    expect(staffGrantSummary({ added: 1, updated: 2, unchanged: 3 })).toBe(
      "1 added, 2 updated, 3 already had this access",
    );
  });

  /**
   * The interesting case: an owner who pasted a list everybody was already on
   * must be told nothing moved, not congratulated.
   */
  it("says so plainly when a re-affirmed grant changed nothing", () => {
    expect(staffGrantSummary({ added: 0, updated: 0, unchanged: 2 })).toContain(
      "already had this access",
    );
    expect(staffGrantSummary({ added: 0, updated: 0, unchanged: 0 })).toBe(
      "Nothing changed",
    );
  });

  it("never claims a number it was not given", () => {
    const summary = staffGrantSummary({ added: 1, updated: 0, unchanged: 0 });
    expect(summary).not.toMatch(/updated|already/);
    expect(summary).not.toContain("0");
  });
});

describe("staffScopeSentence", () => {
  it("names the future for a course-wide grant, which no list of titles can", () => {
    const sentence = staffScopeSentence([]);
    expect(sentence).toContain("every section");
    expect(sentence).toMatch(/added later/);
  });

  it("lists one, two or three class lists by name", () => {
    expect(staffScopeSentence(["Section A"])).toBe("Added to Section A.");
    expect(staffScopeSentence(["Section A", "Lab 1"])).toBe(
      "Added to Section A and Lab 1.",
    );
    expect(staffScopeSentence(["Section A", "Lab 1", "Lab 2"])).toBe(
      "Added to Section A, Lab 1 and Lab 2.",
    );
  });

  it("counts instead of listing beyond three", () => {
    expect(staffScopeSentence(["A", "B", "C", "D"])).toBe(
      "Added to 4 class lists.",
    );
    expect(
      staffScopeSentence(Array.from({ length: 8 }, (_, i) => `S${i}`)),
    ).toBe("Added to 8 class lists.");
  });

  /**
   * Length alone decides the branch. A blank title cannot exist — a section's
   * name is required in the database — but if one ever did, reporting a
   * class-list grant as course-wide would overstate how far the access reaches,
   * which is the one error this sentence must not make.
   */
  it("never reports a class-list grant as course-wide", () => {
    for (const titles of [[""], ["   "], ["", ""]]) {
      expect(staffScopeSentence(titles)).not.toContain("every section");
    }
  });
});
