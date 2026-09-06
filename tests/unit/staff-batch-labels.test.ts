import { describe, expect, it } from "vitest";
import {
  STAFF_BATCH_PROBLEM_REASONS,
  UNKNOWN_STAFF_BATCH_PROBLEM,
  staffBatchProblemLabel,
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
