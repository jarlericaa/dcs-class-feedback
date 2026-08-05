"use client";

import { useId, useState } from "react";
import {
  MAX_START_YEAR,
  MIN_START_YEAR,
  SEMESTER_OPTIONS,
  derivedAcademicYear,
  encodeTerm,
  parseTerm,
  type Semester,
} from "@/lib/term";

/**
 * The academic term, asked for the way a teacher thinks about it.
 *
 * Two inputs — the year the academic year opens in, and which semester — and the
 * derived academic year shown back immediately, so the teacher can see that
 * typing 2026 means 2026-2027 before they submit. They never type the `AY`
 * prefix and never type the ending year; both are the product's job.
 *
 * A client component only because the derived year updates as you type. It
 * submits a hidden `term` field carrying the SAME stored representation the
 * database already holds, so the server action, the Zod schema and every
 * existing row are untouched by this.
 *
 * A section whose stored term this cannot parse keeps its value: the builder
 * starts blank, the current value is shown as-is, and leaving the fields alone
 * submits the original string rather than overwriting it with a guess.
 */
export function TermFields({
  defaultTerm,
  legend = "Academic term",
}: {
  /** the section's current stored term, if it has one */
  defaultTerm?: string;
  legend?: string;
}) {
  const uid = useId();
  const yearId = `term-year-${uid}`;
  const semesterId = `term-semester-${uid}`;
  const derivedId = `term-derived-${uid}`;

  const parsed = parseTerm(defaultTerm);
  const unparsed = !!defaultTerm?.trim() && !parsed;

  const [startYear, setStartYear] = useState(
    parsed ? String(parsed.startYear) : "",
  );
  const [semester, setSemester] = useState<Semester>(parsed?.semester ?? "1");

  const academicYear = derivedAcademicYear(startYear);
  // Nothing usable typed: submit the original string so an unrecognized term
  // survives an unrelated edit on the same form.
  const term = academicYear
    ? encodeTerm(Number.parseInt(startYear, 10), semester)
    : (defaultTerm ?? "");

  return (
    <fieldset className="term-fields">
      <legend className="field-label">{legend}</legend>
      <input type="hidden" name="term" value={term} />

      <div className="term-fields__grid">
        <div className="field-row">
          <label htmlFor={yearId}>Start year</label>
          <input
            id={yearId}
            className="field term-fields__year"
            type="number"
            inputMode="numeric"
            min={MIN_START_YEAR}
            max={MAX_START_YEAR}
            step={1}
            value={startYear}
            onChange={(event) => setStartYear(event.target.value)}
            placeholder="2026"
            required={!unparsed}
            aria-describedby={derivedId}
          />
        </div>

        <div className="field-row">
          <label htmlFor={semesterId}>Semester</label>
          <select
            id={semesterId}
            className="select-field"
            value={semester}
            onChange={(event) => setSemester(event.target.value as Semester)}
          >
            {SEMESTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* The derived year, said back before submit. role=status so a screen
          reader hears it change rather than having to hunt for it. */}
      <p className="term-fields__derived" id={derivedId} role="status">
        {academicYear ? (
          <>
            Academic year <strong>{academicYear}</strong>
          </>
        ) : unparsed ? (
          <>Currently set to “{defaultTerm}”. Enter a start year to replace it.</>
        ) : (
          <>Enter the year this academic year starts in.</>
        )}
      </p>
    </fieldset>
  );
}
