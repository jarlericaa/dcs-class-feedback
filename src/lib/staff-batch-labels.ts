/**
 * Why an address (or a selected section) was refused when staff are added in
 * one action — said the way a person would say it.
 *
 * The vocabulary lives beside the sentences on purpose: a code with no sentence
 * would fall back to the generic line and quietly stop telling the reader
 * anything, so the list of codes and the map of sentences cannot drift apart.
 * Nothing here touches the database, which keeps the whole reason vocabulary
 * unit-testable on its own.
 *
 * Codes are the contract; sentences are the UI boundary and may be rewritten.
 */

export const STAFF_BATCH_PROBLEM_REASONS = [
  "invalid_format",
  "disallowed_domain",
  "no_account",
  "inactive_account",
  "too_many",
  "not_in_course",
  "role_not_allowed_for_scope",
] as const;

export type BatchProblemReason = (typeof STAFF_BATCH_PROBLEM_REASONS)[number];

const LABELS: Record<BatchProblemReason, string> = {
  invalid_format: "That is not a valid email address.",
  disallowed_domain:
    "Only university addresses can be given access, so this one was refused.",
  no_account:
    "No account exists for this address yet. They have to sign in once before they can be given access.",
  inactive_account:
    "This account is deactivated, so it cannot be given access.",
  too_many:
    "Too many addresses at once. Add up to 50 people per batch, then repeat for the rest.",
  not_in_course: "That section is not part of this course.",
  role_not_allowed_for_scope:
    "That role cannot be granted on a section, so nothing was changed.",
};

/**
 * A generic line for a code this build does not know — a newer server, or a
 * value that reached the UI from somewhere it should not have. Deliberately a
 * fixed sentence rather than the code de-underscored: a fallback that echoes
 * its input would print validator text (a raw Zod message, say) at a reader who
 * cannot act on it.
 */
const UNKNOWN = "This address could not be added.";

export function staffBatchProblemLabel(reason: string): string {
  // `hasOwn`, not a bare lookup: a plain object inherits Object.prototype, so
  // an unknown code of "toString" or "constructor" would otherwise return a
  // function where a sentence belongs.
  return Object.hasOwn(LABELS, reason)
    ? LABELS[reason as BatchProblemReason]
    : UNKNOWN;
}

/** The fallback sentence, exported so callers can recognize it if they must. */
export const UNKNOWN_STAFF_BATCH_PROBLEM = UNKNOWN;
