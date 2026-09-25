"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FieldRow, Select } from "@/components/ui/form";
import { IconPlus } from "@/components/ui/icons";
import { RequiredMark } from "@/components/ui/required-mark";
import {
  derivedAcademicYear,
  MAX_START_YEAR,
  MIN_START_YEAR,
  SEMESTER_OPTIONS,
  type Semester,
} from "@/lib/term";

/**
 * Creating a course: a modal, not a form wedged into the top of the list.
 *
 * Owner spec `modal.md`, 2026-09-11. What it replaced was a full-width panel
 * that appeared above the course cards on `?new=1` — so pressing **New course**
 * pushed the whole list down the page, and the thing you were about to compare
 * your new course against scrolled out of view. A dialog leaves the list where
 * it is and dims it, which is the spec's first requirement and the reason for
 * the change.
 *
 * **It reuses `Dialog` rather than dressing up a modal of its own**, which is
 * the spec's other insistence ("not a separately designed component"). Radius,
 * elevation, scrim, Escape, the focus trap, focus return to the trigger and the
 * corner × all come from there, so this file contains no geometry at all — only
 * which fields, in which order.
 *
 * Two things the spec settled that are worth keeping visible here:
 *
 * - **The term is asked once, here.** It used to be a property of each class
 *   list, so a teacher retyped the same academic year per section and a course
 *   with no sections had no term to show. `courses.term` now holds it
 *   (migration `0007_course_term`), and new class lists inherit it.
 * - **The start year derives the ending year immediately**, so the teacher
 *   enters one year and can see the complete academic year before submitting.
 */
export function CreateCourseDialog({
  action,
  defaultStartYear,
  defaultSemester,
}: {
  /** The server action that creates the course. Redirects on both outcomes. */
  action: (formData: FormData) => void | Promise<void>;
  defaultStartYear: number;
  defaultSemester: Semester;
}) {
  return (
    <Dialog
      label={
        <>
          {/* Matches every other page-header action: icon, then verb. */}
          <IconPlus size={15} />
          New course
        </>
      }
      title="Create course"
      variant="primary"
    >
      <form action={action}>
          <FieldRow
            htmlFor="course-code"
            label={
              <>
                Course code
                <RequiredMark />
              </>
            }
          >
            <Field
              /*
                `data-autofocus`, not `autoFocus`: React's prop calls `.focus()`
                at mount, before the dialog is in the top layer, so
                `showModal()` then moves focus to the first focusable child —
                the corner ×. `Dialog` looks for this attribute after showing.
              */
              data-autofocus
              id="course-code"
              name="code"
              placeholder="e.g. CS 145"
              required
            />
          </FieldRow>

          {/*
            One question — which offering is this? — answered by two controls,
            so they are one `<fieldset>` with one required mark rather than two
            fields that happen to sit side by side. The `<legend>` is what makes
            "Semester" the accessible group name for both controls.
          */}
          {/*
            `gap-2` rather than the `gap-tight` a `FieldRow` uses, because this
            group has THREE levels — legend, sub-label, control — and at 6px the
            "Semester" legend sat 17px from the "Academic year" beneath it and
            read as a second label for the same control rather than as a level
            above it. Measured in the browser at 1440 and 390.
          */}
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="flex flex-wrap items-center gap-2 p-0 text-ui-sm font-semibold">
              Semester
              <RequiredMark />
            </legend>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <AcademicYearField defaultStartYear={defaultStartYear} />
              <div className="grid gap-tight">
                <label
                  className="text-meta text-ink-muted"
                  htmlFor="course-semester"
                >
                  Semester
                </label>
                <Select
                  defaultValue={defaultSemester}
                  id="course-semester"
                  name="semester"
                  required
                >
                  {SEMESTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </fieldset>

          {/*
            Leaving on the left, committing on the right — the same split
            §12g.2 made for the form editor's footer, so the two opposite
            outcomes of a form are never a few pixels apart. `mt-2` because the
            form's own `gap-4` already spaces the fields and the actions want
            one step more air than the gap between two fields.
          */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <button
              className={buttonClass({ variant: "danger" })}
              data-dialog-close
              type="button"
            >
              Cancel
            </button>
            <SubmitButton pendingLabel="Creating…" variant="primary">
              Create course
            </SubmitButton>
          </div>
        </form>
    </Dialog>
  );
}

function AcademicYearField({ defaultStartYear }: { defaultStartYear: number }) {
  const [startYear, setStartYear] = useState(String(defaultStartYear));
  const academicYear = derivedAcademicYear(startYear);

  return (
    <div className="grid gap-tight">
      <label className="text-meta text-ink-muted" htmlFor="course-year">
        Start year
      </label>
      <Field
        aria-describedby="course-year-preview"
        className="tabular-nums"
        id="course-year"
        name="startYear"
        required
        type="number"
        inputMode="numeric"
        min={MIN_START_YEAR}
        max={MAX_START_YEAR}
        step={1}
        value={startYear}
        onChange={(event) => setStartYear(event.target.value)}
        placeholder="2026"
      />
      <p className="term-fields__derived" id="course-year-preview" role="status">
        {academicYear ? (
          <>
            Academic year <strong>{academicYear}</strong>
          </>
        ) : (
          <>Enter the year this academic year starts in.</>
        )}
      </p>
    </div>
  );
}
