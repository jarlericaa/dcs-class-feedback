/**
 * CRS class-list column recognition (project-specs.md §6.1).
 *
 * Pure data + pure functions: no I/O, no database, so the whole mapping is unit
 * testable without a spreadsheet.
 */

/**
 * Columns we refuse to map, ever.
 *
 * `Sex Assigned at Birth` is on the sample class list and is unnecessary for
 * this product (project-specs.md §6.1 step 6). It is excluded here — at the
 * mapping layer — rather than "just not read later", so there is no code path in
 * which its value reaches a row object, let alone the database.
 */
export const DENIED_HEADERS = [
  "sex assigned at birth",
  "sex_assigned_at_birth",
  "sexassignedatbirth",
  "sex at birth",
  "sex",
  "gender",
] as const;

export type RosterField =
  | "studentNumber"
  | "fullName"
  | "familyName"
  | "firstName"
  | "middleName"
  | "livedName"
  | "preferredPronoun"
  | "program"
  | "enrollmentStatus"
  | "enlistmentDate";

/** Header synonyms, lowercased. First match wins. */
export const FIELD_HEADERS: Record<RosterField, string[]> = {
  studentNumber: [
    "student number",
    "student_number",
    "studentnumber",
    "student no",
    "student no.",
    "studentno",
    "student id",
    "number",
  ],
  fullName: ["full name", "full_name", "fullname", "name", "student name"],
  familyName: [
    "family name",
    "family_name",
    "familyname",
    "last name",
    "lastname",
    "surname",
  ],
  firstName: [
    "first name",
    "first_name",
    "firstname",
    "given name",
    "givenname",
  ],
  middleName: ["middle name", "middle_name", "middlename", "middle initial"],
  livedName: [
    "lived name",
    "lived_name",
    "livedname",
    "preferred name",
    "preferred_name",
    "preferredname",
    "nickname",
  ],
  preferredPronoun: [
    "preferred pronoun",
    "preferred_pronoun",
    "preferredpronoun",
    "pronoun",
    "pronouns",
  ],
  program: ["program", "programme", "degree program", "course", "curriculum"],
  enrollmentStatus: [
    "enrollment status",
    "enrolment status",
    "enrollment_status",
    "status",
    "registration status",
  ],
  enlistmentDate: [
    "enlistment date",
    "enlistment_date",
    "enlistmentdate",
    "date enlisted",
    "enlisted",
    "date of enlistment",
  ],
};

export type CrsStatus = "enrolled" | "not_enrolled" | "unknown";

/**
 * CRS status code → normalized status.
 *
 * The registrar's complete code list is still outstanding
 * (project-specs.md §14), so this is deliberately conservative: only codes we
 * are confident about are mapped, and everything else becomes `unknown` and is
 * flagged for staff review. That is noisy but never silently enrolls or drops
 * somebody on a guess.
 */
const ENROLLED_CODES = [
  "enrolled",
  "enlisted",
  "registered",
  "active",
  "regular",
  "e",
  "r",
];
const NOT_ENROLLED_CODES = [
  "dropped",
  "drop",
  "withdrawn",
  "withdrew",
  "cancelled",
  "canceled",
  "deleted",
  "waitlisted",
  "waitlist",
  "wl",
  "for approval",
  "pending",
  "not enrolled",
  "unenrolled",
  "d",
  "w",
];

export function normalizeCrsStatus(raw: string | null | undefined): CrsStatus {
  if (!raw) return "unknown";
  const value = raw.trim().toLowerCase();
  if (!value) return "unknown";
  if (ENROLLED_CODES.includes(value)) return "enrolled";
  if (NOT_ENROLLED_CODES.includes(value)) return "not_enrolled";
  return "unknown";
}

export function isDeniedHeader(header: string): boolean {
  const value = header.trim().toLowerCase();
  return DENIED_HEADERS.some((denied) => value === denied);
}

/**
 * Map a header row to column indexes.
 *
 * Returns which headers were ignored so the preview can tell staff what was
 * dropped — including the denied column, which staff should see was refused
 * rather than silently missed.
 */
export function mapHeaders(headers: string[]): {
  columns: Partial<Record<RosterField, number>>;
  ignored: string[];
  denied: string[];
} {
  const lowered = headers.map((h) => (h ?? "").trim().toLowerCase());
  const columns: Partial<Record<RosterField, number>> = {};
  const used = new Set<number>();
  const denied: string[] = [];

  lowered.forEach((header, index) => {
    if (header && isDeniedHeader(header)) {
      denied.push(headers[index]!.trim());
      used.add(index);
    }
  });

  for (const [field, candidates] of Object.entries(FIELD_HEADERS) as [
    RosterField,
    string[],
  ][]) {
    for (const candidate of candidates) {
      const index = lowered.indexOf(candidate);
      if (index !== -1 && !used.has(index)) {
        columns[field] = index;
        used.add(index);
        break;
      }
    }
  }

  const ignored = headers
    .map((h, i) => ({ h: (h ?? "").trim(), i }))
    .filter(({ h, i }) => h.length > 0 && !used.has(i))
    .map(({ h }) => h);

  return { columns, ignored, denied };
}

/** Build a display name from whichever name columns the file provided. */
export function composeFullName(parts: {
  fullName?: string | null;
  familyName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
}): string {
  if (parts.fullName?.trim()) return parts.fullName.trim();
  const given = [parts.firstName, parts.middleName]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" ");
  const family = parts.familyName?.trim() ?? "";
  return [given, family].filter(Boolean).join(" ").trim();
}

/**
 * A student number must contain at least one digit or letter after
 * normalization, and must not look like a decimal — `2.02312e+8` is what a
 * spreadsheet produces when it has already destroyed the value.
 */
export function isMalformedStudentNumber(raw: string): boolean {
  const value = raw.trim();
  if (!value) return true;
  if (!/[A-Za-z0-9]/.test(value)) return true;
  if (/e\+?\d+$/i.test(value)) return true;
  if (/^\d+\.\d+$/.test(value)) return true;
  return false;
}

/** Excel serial date or an ISO-ish string → ISO date, or null. */
export function parseEnlistmentDate(
  value: string | number | Date | null | undefined,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    // Excel's epoch is 1899-12-30 (its 1900 leap-year bug included).
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(ms);
    return Number.isNaN(date.getTime())
      ? null
      : date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}
