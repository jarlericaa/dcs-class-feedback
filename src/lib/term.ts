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
 * The Add-a-section form does not collect one: a term describes the course's
 * offering, not one class list inside it, and typing the same academic year
 * once per section was busywork. `class_sections.term` is `NOT NULL`, so the
 * value has to come from somewhere.
 *
 * Preference order, and the first entry is new as of 2026-09-11:
 *   1. **the course's own term**, which the create-course dialog now asks for
 *      once (`modal.md`, migration `0007_course_term`). This is the answer the
 *      teacher actually gave about this course, so it outranks everything
 *      below it;
 *   2. a term the course is already using on another section, which keeps a
 *      course that predates `courses.term` internally consistent;
 *   3. failing both, the current academic year.
 *
 * **[Assumption], and now a much narrower one.** Step 3 reads the academic year
 * as starting in August and splits it 1st = Aug–Dec, 2nd = Jan–May,
 * Midyear = Jun–Jul. That is a calendar convention this module had no business
 * deciding on its own — which is exactly why step 1 exists. It is now reached
 * only by a course created before the term column and holding no sections, and
 * it is still the default the dialog's two selects open on, where a teacher can
 * see it and change it. Confirm the convention before real terms depend on it.
 */
export function fallbackTerm(
  /** `courses.term`, or `null` for a course that predates it */
  courseTerm: string | null | undefined,
  existingTerms: readonly string[] = [],
): string {
  if (parseTerm(courseTerm)) return courseTerm!.trim();
  for (const candidate of existingTerms) {
    if (parseTerm(candidate)) return candidate;
  }
  return currentTerm();
}

/**
 * The two facts a course's term carries, preferring the course's own value.
 *
 * Every list that shows "CS 145 · 2026-2027 · 1st semester" used to derive that
 * from the course's SECTIONS, which meant a brand-new course showed no term at
 * all and a course whose sections disagreed showed "2 terms". Reading the
 * course first fixes both without changing what an existing course displays.
 *
 * Returns `["2 terms"]`-style summary only when there is genuinely nothing
 * better: the course has no term of its own AND its sections disagree.
 */
export function courseTermParts(
  courseTerm: string | null | undefined,
  sectionTerms: readonly string[] = [],
): string[] {
  if (parseTerm(courseTerm)) return termParts(courseTerm);
  const distinct = [...new Set(sectionTerms)];
  if (distinct.length === 1) return termParts(distinct[0]!);
  if (distinct.length > 1) return [`${distinct.length} terms`];
  return [];
}

/**
 * The academic years a teacher may file a course under, newest first.
 *
 * A window rather than the full `MIN_START_YEAR`–`MAX_START_YEAR` range: a
 * hundred-entry select is a worse control than a short one, and a course is
 * created for an offering that is either running now, just finished, or about
 * to start. Centred on the current academic year so the default is in the
 * middle of the list rather than at one end.
 */
export function academicYearOptions(
  now: Date = new Date(),
): { value: number; label: string }[] {
  const current = parseTerm(currentTerm(now))!.startYear;
  const years: { value: number; label: string }[] = [];
  for (let year = current + 1; year >= current - 3; year -= 1) {
    years.push({ value: year, label: `${year} - ${year + 1}` });
  }
  return years;
}

/** The academic term today falls in, under the convention above. */
export function currentTerm(now: Date = new Date()): string {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const startYear = month >= 8 ? year : year - 1;
  const semester: Semester = month >= 8 ? "1" : month <= 5 ? "2" : "M";
  return encodeTerm(startYear, semester);
}
