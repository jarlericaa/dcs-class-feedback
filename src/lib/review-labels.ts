/**
 * Staff review vocabulary, said the way a person would say it.
 *
 * The stored values (`empty_or_meaningless`, `flagged`, `clarification`) belong
 * to the domain and are queried by value, so they never change. This map lives
 * at the UI boundary, exactly like `audit-labels.ts`, so no page prints a raw
 * enum — `valid to invalid — Ana Reyes (teacher), empty_or_meaningless` was
 * three identifiers in one sentence.
 *
 * An unmapped value falls back to a de-underscored sentence, so a value added
 * later reads plainly instead of breaking.
 */

function humanize(value: string): string {
  const words = value.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The same three words `ValidityBadge` stamps, so a history line and the stamp
 * above it never call one state two things.
 */
const VALIDITY: Record<string, string> = {
  valid: "Valid",
  flagged: "Flagged",
  invalid: "Invalid",
};

const INVALIDATION_REASON: Record<string, string> = {
  empty_or_meaningless: "empty or meaningless",
  spam: "spam",
  abusive_content: "abusive content",
  irrelevant: "completely irrelevant",
  bad_faith_credit_attempt: "a bad-faith credit attempt",
};

const SUBMISSION_TYPE: Record<string, string> = {
  question: "Question",
  feedback: "Feedback",
  concern: "Concern",
  clarification: "Clarification",
  suggestion: "Suggestion",
};

/** What a validity value means in a sentence about a change. Staff-only. */
export function validityLabel(value: string): string {
  return VALIDITY[value] ?? humanize(value);
}

/** Lower-case, because it is always read inside a sentence. Staff-only. */
export function invalidationReasonLabel(value: string | null): string {
  if (!value) return "no reason given";
  return INVALIDATION_REASON[value] ?? value.replace(/_/g, " ");
}

/** What the student said this was: a question, a concern, a suggestion. */
export function submissionTypeLabel(value: string): string {
  return SUBMISSION_TYPE[value] ?? humanize(value);
}
