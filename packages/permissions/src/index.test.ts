import { describe, it, expect } from "vitest";
import { hasPermission, requirePermission, PermissionError } from "./index";

describe("Permissions", () => {
  it("should allow instructors to create courses", () => {
    const result = hasPermission("instructor", "course:create");
    expect(result).toBe(true);
  });

  it("should deny students from creating courses", () => {
    const result = hasPermission("student", "course:create");
    expect(result).toBe(false);
  });

  it("should throw error when permission is denied", () => {
    expect(() => {
      requirePermission("student", "course:create");
    }).toThrow(PermissionError);
  });

  it("should allow students to submit forms", () => {
    const result = hasPermission("student", "form:submit");
    expect(result).toBe(true);
  });
});
