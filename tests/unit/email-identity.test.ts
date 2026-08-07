import { describe, expect, it } from "vitest";
import {
  checkRosterEmail,
  emailDomain,
  isAllowedEmailDomain,
  isValidEmailShape,
  normalizeEmail,
} from "@/modules/identity/email";

/**
 * The rule that decides who a student is. Everything downstream is a plain
 * equality against these outputs, so these cases ARE the identity policy.
 * The suite runs with ALLOWED_EMAIL_DOMAINS=up.edu.ph (tests/integration/setup-env).
 */

describe("normalizeEmail", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  student@up.edu.ph  ")).toBe("student@up.edu.ph");
  });

  it("lowercases", () => {
    expect(normalizeEmail("Student@UP.EDU.PH")).toBe("student@up.edu.ph");
  });

  it("is idempotent, so re-normalizing a stored value is a no-op", () => {
    const once = normalizeEmail(" Juan.DelaCruz@Up.Edu.Ph ");
    expect(normalizeEmail(once)).toBe(once);
  });

  it("treats null and undefined as empty rather than throwing", () => {
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });

  /**
   * Deliberate non-behaviour: two distinct mailboxes must never collapse into
   * one, or the collision would hand one student another's classes.
   */
  it("does NOT strip dots or +tags", () => {
    expect(normalizeEmail("a.b@up.edu.ph")).not.toBe(normalizeEmail("ab@up.edu.ph"));
    expect(normalizeEmail("a+x@up.edu.ph")).not.toBe(normalizeEmail("a@up.edu.ph"));
  });
});

describe("isValidEmailShape", () => {
  it("accepts an ordinary address", () => {
    expect(isValidEmailShape("juan.delacruz@up.edu.ph")).toBe(true);
  });

  it.each(["", "nope", "a@b", "a@@b.c", "a b@up.edu.ph", "@up.edu.ph"])(
    "rejects %j",
    (value) => {
      expect(isValidEmailShape(value)).toBe(false);
    },
  );
});

describe("emailDomain / isAllowedEmailDomain", () => {
  it("reads the domain after the last @", () => {
    expect(emailDomain("juan@up.edu.ph")).toBe("up.edu.ph");
  });

  it("admits the configured domain and refuses everything else", () => {
    expect(isAllowedEmailDomain("juan@up.edu.ph")).toBe(true);
    expect(isAllowedEmailDomain("juan@gmail.com")).toBe(false);
    expect(isAllowedEmailDomain("juan@notup.edu.ph")).toBe(false);
  });

  it("refuses a subdomain that merely ends with the allowed one", () => {
    expect(isAllowedEmailDomain("juan@evil-up.edu.ph")).toBe(false);
  });
});

describe("checkRosterEmail", () => {
  it("returns the normalized address for a usable cell", () => {
    expect(checkRosterEmail("  Juan@UP.edu.ph ")).toEqual({
      ok: true,
      email: "juan@up.edu.ph",
    });
  });

  it("distinguishes missing, malformed, and off-domain", () => {
    expect(checkRosterEmail("   ")).toEqual({ ok: false, problem: "missing" });
    expect(checkRosterEmail("nope")).toEqual({
      ok: false,
      problem: "invalid_format",
    });
    expect(checkRosterEmail("a@gmail.com")).toEqual({
      ok: false,
      problem: "disallowed_domain",
    });
  });
});
