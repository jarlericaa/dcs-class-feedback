/**
 * Validation failures, said to the person who has to fix them.
 *
 * Zod's own messages are written for a developer reading a stack trace. Four
 * routes relayed them straight into a page banner, so a teacher who left a
 * question prompt empty was told:
 *
 *     String must contain at least 1 character(s)
 *
 * which names neither the field that is wrong nor what to do about it — the
 * "Broken Error Recovery" failure in the Intent anti-pattern catalog, and a
 * direct violation of Nielsen H9. The server-side schema stays the authority on
 * what is valid; this only decides how the refusal reads.
 */

/** Field paths, in the words the form uses for them. */
const FIELD_LABELS: Record<string, string> = {
  title: "Form name",
  code: "Course code",
  term: "Term",
  prompt: "Question text",
  questions: "Questions",
  options: "Answer choices",
  label: "Answer choice",
  email: "University email",
  startDate: "First one opens",
  endDate: "Or run until",
  openDate: "Opening date",
  deadlineDate: "Closing date",
  openTime: "Opening time",
  deadlineTime: "Closing time",
  occurrenceCount: "How many",
  intervalWeeks: "Repeat every",
  sectionIds: "Sections",
  studentVisibleReason: "What the student sees",
  body: "Your reply",
  publicQuestion: "Public version of the question",
  answerBody: "Answer",
};

interface ZodIssue {
  message?: string;
  path?: (string | number)[];
  code?: string;
}

/** "Questions → 1 → Question text" reads better than "questions.1.prompt". */
function describePath(path: (string | number)[] | undefined): string | null {
  if (!path || path.length === 0) return null;
  const named = [...path]
    .reverse()
    .find((part): part is string => typeof part === "string");
  if (!named) return null;
  const label = FIELD_LABELS[named];
  if (!label) return null;
  // A numeric segment means one row of a repeated field; naming which one saves
  // the reader scanning ten identical question blocks.
  const index = path.find((part) => typeof part === "number");
  return index === undefined ? label : `${label} (item ${Number(index) + 1})`;
}

/** Zod's phrasing, rewritten as an instruction. */
function describeIssue(issue: ZodIssue): string {
  const field = describePath(issue.path);
  const raw = issue.message ?? "";
  const empty =
    /at least 1 character/i.test(raw) ||
    /required/i.test(raw) ||
    /expected string, received undefined/i.test(raw);
  if (empty) {
    return field ? `${field} cannot be empty.` : "Something required was left blank.";
  }
  if (/at least (\d+) element/i.test(raw)) {
    const n = raw.match(/at least (\d+) element/i)![1];
    return field
      ? `${field}: add at least ${n}.`
      : `Add at least ${n} of something that is missing.`;
  }
  if (/invalid email/i.test(raw)) {
    return `${field ?? "The email address"} is not a valid email address.`;
  }
  // Anything unmapped still gets its field name, which is the part Zod omits,
  // and a full stop, so a banner of several reasons reads as sentences.
  const sentence = /[.!?]$/.test(raw) ? raw : `${raw}.`;
  return field ? `${field}: ${sentence}` : sentence;
}

/**
 * A validation error as one or more sentences a person can act on.
 *
 * Returns null when `err` is not a Zod error, so callers keep their own
 * handling for domain errors, which are already written for humans.
 */
export function describeValidationError(err: unknown): string | null {
  if (!(err instanceof Error) || err.name !== "ZodError") return null;
  let issues: ZodIssue[];
  try {
    issues = JSON.parse(err.message) as ZodIssue[];
  } catch {
    return "Check the values you entered and try again.";
  }
  if (!Array.isArray(issues) || issues.length === 0) {
    return "Check the values you entered and try again.";
  }
  const sentences = [...new Set(issues.map(describeIssue))].filter(Boolean);
  if (sentences.length === 0) {
    return "Check the values you entered and try again.";
  }
  // Three is enough to act on; a wall of them is not read.
  const shown = sentences.slice(0, 3).join(" ");
  return sentences.length > 3
    ? `${shown} (and ${sentences.length - 3} more.)`
    : shown;
}
