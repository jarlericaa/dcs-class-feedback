import { describe, expect, it } from "vitest";
import { describeValidationError } from "@/lib/form-errors";

/**
 * The four routes that relay a save failure into a page banner used to print
 * Zod's own wording. "String must contain at least 1 character(s)" names
 * neither the field nor the fix.
 */
function zod(issues: unknown[]): Error {
  const err = new Error(JSON.stringify(issues));
  err.name = "ZodError";
  return err;
}

describe("describeValidationError", () => {
  it("leaves non-validation errors alone", () => {
    expect(describeValidationError(new Error("Nope"))).toBeNull();
    expect(describeValidationError("not an error")).toBeNull();
  });

  it("names the empty field instead of quoting Zod", () => {
    const message = describeValidationError(
      zod([
        {
          code: "too_small",
          message: "String must contain at least 1 character(s)",
          path: ["questions", 0, "prompt"],
        },
      ]),
    );
    expect(message).toBe("Question text (item 1) cannot be empty.");
    expect(message).not.toMatch(/character\(s\)/);
  });

  it("names a top-level field with no index", () => {
    expect(
      describeValidationError(
        zod([{ message: "Required", path: ["title"] }]),
      ),
    ).toBe("Form name cannot be empty.");
  });

  it("keeps an unmapped message but adds the field it belongs to", () => {
    expect(
      describeValidationError(
        zod([{ message: "Must be a Monday", path: ["startDate"] }]),
      ),
    ).toBe("First one opens: Must be a Monday.");
  });

  it("deduplicates and caps the list so a banner stays readable", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      message: "Required",
      path: ["questions", i, "prompt"],
    }));
    const message = describeValidationError(zod(many))!;
    expect(message).toMatch(/and 3 more/);
    expect(message.split("cannot be empty").length - 1).toBe(3);
  });

  it("falls back to something actionable when the payload is unreadable", () => {
    const err = new Error("not json");
    err.name = "ZodError";
    expect(describeValidationError(err)).toBe(
      "Check the values you entered and try again.",
    );
  });
});
