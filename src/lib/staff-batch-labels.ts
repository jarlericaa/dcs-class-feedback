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

/**
 * What a grant actually did, as a short phrase.
 *
 * Three counts rather than one, because they answer different questions and
 * collapsing them would hide the interesting one: `added` is new access,
 * `updated` is access somebody already had at a different role, and `unchanged`
 * is the re-affirmed grant that looks like a no-op and is worth saying out loud
 * — an owner who pasted the wrong list needs to see that nothing moved.
 *
 * Zero terms are omitted so a plain success does not read as a report. Counts
 * are per grant, which at section scope means per person per class list: adding
 * two people to two class lists is four.
 */
export function staffGrantSummary(counts: {
  added: number;
  updated: number;
  unchanged: number;
}): string {
  const parts: string[] = [];
  if (counts.added > 0) parts.push(`${counts.added} added`);
  if (counts.updated > 0) parts.push(`${counts.updated} updated`);
  if (counts.unchanged > 0) {
    parts.push(`${counts.unchanged} already had this access`);
  }
  // Every count zero means the request named nobody the service had to touch.
  // It is not an error, and it must not be reported as a success either.
  if (parts.length === 0) return "Nothing changed";
  return parts.join(", ");
}

/**
 * Where the access reaches, said in terms of what the reader chose.
 *
 * An EMPTY list is course-wide standing, and it names the future explicitly:
 * that a grant covers sections which do not exist yet is the whole difference
 * between the two scopes, and it is not visible in any list of section names.
 *
 * Length is the only thing that decides which sentence this is — a blank title
 * is never treated as "no sections", because reporting a class-list grant as
 * course-wide would misstate how far the access reaches. Titles come from the
 * database, where a section's name cannot be blank.
 *
 * Beyond three class lists it counts instead of listing: a wrapped sentence of
 * eight titles is not read, and the table underneath already enumerates every
 * grant.
 */
export function staffScopeSentence(sectionTitles: readonly string[]): string {
  const [first, second, third] = sectionTitles;
  switch (sectionTitles.length) {
    case 0:
      return "They reach every section of this course, including sections added later.";
    case 1:
      return `Added to ${first}.`;
    case 2:
      return `Added to ${first} and ${second}.`;
    case 3:
      return `Added to ${first}, ${second} and ${third}.`;
    default:
      return `Added to ${sectionTitles.length} class lists.`;
  }
}
