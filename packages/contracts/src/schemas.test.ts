import { describe, it, expect } from "vitest";
import { CreateCourseSchema } from "./schemas";

describe("Schemas", () => {
  it("should validate course creation schema", () => {
    const validData = {
      title: "CS 101",
      code: "CS101",
      semester: "Spring",
      year: 2024,
    };

    const result = CreateCourseSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("should reject invalid course data", () => {
    const invalidData = {
      title: "CS 101",
      // Missing required fields
    };

    const result = CreateCourseSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});
