import { env } from "@/env";

/**
 * Email identity (docs/student-identity.md).
 *
 * The teacher-uploaded class list carries the student's UP email, and that email
 * — normalized, compared with exact equality — is the ONLY thing that resolves an
 * authenticated user to a student record. No name similarity, no student-number
 * claim, no manual confirmation.
 *
 * Pure functions, no I/O: the rule that decides who a student is stays unit
 * testable in isolation.
 */

/**
 * The one normalization, used on BOTH sides of every comparison: the address a
 * user signs in with, and the address a teacher imported. Trim and lowercase
 * only — nothing that could make two distinct mailboxes collide (no dot
 * stripping, no `+tag` removal), because collapsing addresses would hand one
 * student access to another's record.
 */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Deliberately conservative: one @, no whitespace, a dotted domain. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isValidEmailShape(normalized: string): boolean {
  return normalized.length <= 254 && EMAIL_SHAPE.test(normalized);
}

export function emailDomain(normalized: string): string {
  return normalized.slice(normalized.lastIndexOf("@") + 1);
}

/**
 * Domain allow-list, from the configured ALLOWED_EMAIL_DOMAINS. An empty list
 * rejects everything — a misconfigured deployment must refuse sign-ins rather
 * than admit the whole internet.
 */
export function isAllowedEmailDomain(normalized: string): boolean {
  const domain = emailDomain(normalized);
  return domain.length > 0 && env.allowedEmailDomains.includes(domain);
}

export type EmailProblem = "missing" | "invalid_format" | "disallowed_domain";

/**
 * Validate one class-list cell. Returns the normalized address or why it was
 * refused, so the import preview can show a row-level reason before commit.
 */
export function checkRosterEmail(
  raw: string | null | undefined,
): { ok: true; email: string } | { ok: false; problem: EmailProblem } {
  const email = normalizeEmail(raw);
  if (!email) return { ok: false, problem: "missing" };
  if (!isValidEmailShape(email)) return { ok: false, problem: "invalid_format" };
  if (!isAllowedEmailDomain(email)) {
    return { ok: false, problem: "disallowed_domain" };
  }
  return { ok: true, email };
}
