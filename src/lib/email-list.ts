import { normalizeEmail } from "@/modules/identity/email";

/**
 * One pasted blob of addresses → the distinct addresses it names.
 *
 * Adding several people at once means accepting whatever a teacher pastes: a
 * column copied out of a spreadsheet (newlines), a mail client's recipient list
 * (comma or semicolon separated), or a hand-typed line with stray spaces. So
 * splitting is deliberately permissive about separators and deliberately NOT
 * permissive about anything else — validity and domain are somebody else's
 * decision (`checkRosterEmail`), taken per address afterwards, so a refusal can
 * name the address it is about.
 *
 * Pure and I/O-free: how a pasted list becomes a set of addresses stays unit
 * testable, exactly like the identity rule it normalizes with.
 */

/**
 * How many addresses one action may carry. A cap because the batch is atomic
 * and audited per write: a paste of thousands would hold a transaction open and
 * bury the audit trail, and nobody adds a thousand staff to a course.
 */
export const EMAIL_LIST_LIMIT = 50;

export interface ParsedEmailList {
  /** Normalized and deduplicated, in first-seen order, at most `limit` long. */
  emails: string[];
  /**
   * The addresses past the cap, in order. Returned rather than dropped: silently
   * ignoring the tail of a paste would grant access to some of the people a
   * teacher named and say nothing about the rest.
   */
  overflow: string[];
}

/** Whitespace, commas and semicolons all separate. Runs collapse. */
const SEPARATORS = /[\s,;]+/;

export function parseEmailList(
  raw: string | readonly string[] | null | undefined,
  limit: number = EMAIL_LIST_LIMIT,
): ParsedEmailList {
  const blob =
    typeof raw === "string" ? raw : raw ? Array.from(raw).join("\n") : "";

  // Normalized before deduplication, and with the SAME normalization the
  // identity rule uses: two spellings of one mailbox must collapse here, or the
  // batch would write the same grant twice and audit it twice.
  const seen = new Set<string>();
  const distinct: string[] = [];
  for (const token of blob.split(SEPARATORS)) {
    const email = normalizeEmail(token);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    distinct.push(email);
  }

  const cap = Math.max(0, limit);
  return { emails: distinct.slice(0, cap), overflow: distinct.slice(cap) };
}
