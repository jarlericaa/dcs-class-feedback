/**
 * Academic term: storage form in, human form out.
 *
 * `class_sections.term` is free text (`text`, validated as a 1–64 character
 * string), and every shipped row uses the compact form `AY2026-1`. That is a
 * storage key, not something to show a teacher, and it is not something a
 * teacher should be asked to type either.
 *
 * So this module is an ADAPTER, not a migration. The builder composes the same
 * representation the database already holds, and these formatters turn it into
 * words at render time. No schema change, no data rewrite, and a value this
 * module cannot parse is passed through unchanged rather than hidden — a term
 * somebody typed by hand is still the truth about that section.
 */

export type Semester = "1" | "2" | "M";

export interface ParsedTerm {
  /** the year the academic year opens in: 2026 for 2026-2027 */
  startYear: number;
  endYear: number;
  semester: Semester;
}

const TERM_PATTERN = /^AY(\d{4})-([12M])$/i;

export const SEMESTER_LABELS: Record<Semester, string> = {
  "1": "1st semester",
  "2": "2nd semester",
  M: "Midyear",
};

export const SEMESTER_OPTIONS: { value: Semester; label: string }[] = [
  { value: "1", label: SEMESTER_LABELS["1"] },
  { value: "2", label: SEMESTER_LABELS["2"] },
  { value: "M", label: SEMESTER_LABELS.M },
];

/** A start year a section could plausibly run in. Rejects typos, not history. */
export const MIN_START_YEAR = 2000;
export const MAX_START_YEAR = 2100;

/** The stored representation. Unchanged from what the database already holds. */
export function encodeTerm(startYear: number, semester: Semester): string {
  return `AY${startYear}-${semester}`;
}

export function parseTerm(raw: string | null | undefined): ParsedTerm | null {
  const match = TERM_PATTERN.exec((raw ?? "").trim());
  if (!match) return null;
  const startYear = Number(match[1]);
  if (startYear < MIN_START_YEAR || startYear > MAX_START_YEAR) return null;
  return {
    startYear,
    endYear: startYear + 1,
    semester: match[2]!.toUpperCase() as Semester,
  };
}

/** "2026-2027". Empty when the stored value is not a recognized term. */
export function academicYearLabel(raw: string | null | undefined): string {
  const parsed = parseTerm(raw);
  return parsed ? `${parsed.startYear}-${parsed.endYear}` : "";
}

/** "1st semester". Empty when the stored value is not a recognized term. */
export function semesterLabel(raw: string | null | undefined): string {
  const parsed = parseTerm(raw);
  return parsed ? SEMESTER_LABELS[parsed.semester] : "";
}

/**
 * The two facts a term carries, ready to render as separate elements.
 *
 * Callers place them; this never joins them with a separator, because a metadata
 * line built by string concatenation is exactly what this pass removed.
 */
export function termParts(raw: string | null | undefined): string[] {
  const parsed = parseTerm(raw);
  if (!parsed) {
    const fallback = (raw ?? "").trim();
    return fallback ? [fallback] : [];
  }
  return [
    `${parsed.startYear}-${parsed.endYear}`,
    SEMESTER_LABELS[parsed.semester],
  ];
}

/**
 * One string, for the few places that genuinely need one — a document title, an
 * `aria-label`, a breadcrumb crumb. Prefer `termParts` in layout.
 */
export function formatTerm(raw: string | null | undefined): string {
  return termParts(raw).join(" · ");
}

/** Derived academic year for the builder, from whatever is currently typed. */
export function derivedAcademicYear(startYear: string): string {
  const year = Number.parseInt(startYear, 10);
  if (
    !Number.isInteger(year) ||
    year < MIN_START_YEAR ||
    year > MAX_START_YEAR
  ) {
    return "";
  }
  return `${year}-${year + 1}`;
}

/**
 * The term to file a new section under when nobody was asked.
 *
 * The Add-a-section form no longer collects one: a term describes the course's
 * offering, not one class list inside it, and typing the same academic year
 * once per section was busywork. `class_sections.term` is still `NOT NULL`
 * though, and `courses` has no term column to read instead — adding one is a
 * migration, which is out of scope here — so the value has to come from
 * somewhere.
 *
 * Preference order:
 *   1. a term the course is already using, so every section of one course
 *      agrees, and so the answer comes from the teacher's own earlier input
 *      rather than from a rule invented here;
 *   2. failing that (the course's first section), the current academic year.
 *
 * **[Assumption]** Step 2 reads the academic year as starting in August and
 * splits the year 1st = Aug–Dec, 2nd = Jan–May, Midyear = Jun–Jul. That is a
 * calendar convention this module had no business deciding on its own; it is
 * only ever used for a course with no sections yet, and it stays visible and
 * editable in exactly one place, so correcting it is a one-line change rather
 * than a data migration. Confirm it before real terms depend on it.
 */
export function fallbackTerm(existingTerms: readonly string[]): string {
  for (const candidate of existingTerms) {
    if (parseTerm(candidate)) return candidate;
  }
  return currentTerm();
}

/** The academic term today falls in, under the convention above. */
export function currentTerm(now: Date = new Date()): string {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const startYear = month >= 8 ? year : year - 1;
  const semester: Semester = month >= 8 ? "1" : month <= 5 ? "2" : "M";
  return encodeTerm(startYear, semester);
}
