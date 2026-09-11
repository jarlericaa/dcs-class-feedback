"use client";

import { RequiredMark } from "@/components/ui/required-mark";
import { useState, type ReactNode } from "react";
import { DAY_NAMES } from "@/lib/days";
import { cn } from "@/lib/cn";
import {
  Choice,
  Field,
  FieldLabel,
  FieldRow,
  FormSection,
  Select,
} from "@/components/ui/form";

/**
 * Audience and delivery, as one control the teacher can reason about.
 *
 * Two decisions, kept visibly separate because they are separate: WHO gets the
 * form, and WHEN it goes out. Only the fields the chosen delivery mode actually
 * uses are shown — a one-time form has no opening weekday, and showing one
 * greyed out would imply the product supports something it does not.
 *
 * This is input handling only. `deliveryInputSchema` on the server decides what
 * is valid, and refuses anything this component allows through.
 */

export type DeliveryMode =
  "one_time" | "weekly" | "custom_recurring" | "manual";

const MODES: { key: DeliveryMode; label: string; hint: string }[] = [
  {
    key: "one_time",
    label: "One time",
    hint: "Opens once, closes once. For a long-exam or end-of-term form.",
  },
  {
    key: "weekly",
    label: "Every week",
    hint: "A new form every week, opened and closed for you.",
  },
  {
    key: "custom_recurring",
    label: "Custom schedule",
    hint: "A new form every few weeks, on the same day and time.",
  },
  {
    key: "manual",
    label: "Open manually",
    hint: "Nothing opens until you open it yourself.",
  },
];

export interface SectionOption {
  id: string;
  title: string;
  term: string;
}

export function DeliveryFields({
  sections,
  courseCode,
  defaultMode = "weekly",
  defaultAudienceMode = "all_sections",
  firstStep,
  defaultSectionIds = [],
  defaultOpenDayOfWeek = 1,
  defaultOpenTime = "08:00",
  defaultDeadlineDayOfWeek = 0,
  defaultDeadlineTime = "23:59",
  defaultStartDate = "",
  defaultEndDate = "",
  defaultOccurrenceCount = "",
  defaultIntervalWeeks = 2,
  defaultOpenDate = "",
  defaultOpenAtTime = "08:00",
  defaultDeadlineDate = "",
  defaultDeadlineAtTime = "23:59",
}: {
  sections: SectionOption[];
  courseCode: string;
  defaultMode?: DeliveryMode;
  defaultAudienceMode?: "all_sections" | "selected_sections";
  /**
   * The step number this component's FIRST group takes, when it is one of a
   * numbered sequence. It renders two groups (audience, then schedule), so the
   * caller's next step is `firstStep + 2`.
   *
   * Passed rather than counted so a form with no delivery step at all cannot
   * silently renumber the ones around it. **Omit it** where this component is
   * nested inside a panel that already has its own heading — the edit page's
   * "Who gets it, and when" — because a numbered step inside a named panel
   * numbers nothing.
   */
  firstStep?: number;
  defaultSectionIds?: string[];
  defaultOpenDayOfWeek?: number;
  defaultOpenTime?: string;
  defaultDeadlineDayOfWeek?: number;
  defaultDeadlineTime?: string;
  defaultStartDate?: string;
  defaultEndDate?: string;
  defaultOccurrenceCount?: string;
  defaultIntervalWeeks?: number;
  defaultOpenDate?: string;
  defaultOpenAtTime?: string;
  defaultDeadlineDate?: string;
  defaultDeadlineAtTime?: string;
}) {
  const [mode, setMode] = useState<DeliveryMode>(defaultMode);
  const [audienceMode, setAudienceMode] = useState(defaultAudienceMode);
  const [chosen, setChosen] = useState<string[]>(defaultSectionIds);

  const recurring = mode === "weekly" || mode === "custom_recurring";
  const toggle = (id: string) =>
    setChosen((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  /** What the teacher is about to commit to, in one sentence. */
  const audienceSummary =
    audienceMode === "all_sections"
      ? sections.length === 0
        ? `Every section of ${courseCode} — there are none yet.`
        : `Every section of ${courseCode}: ${sections.map((s) => s.title).join(", ")}. A section added later is included automatically.`
      : chosen.length === 0
        ? "Nobody yet — choose at least one section."
        : `Students in ${sections
            .filter((s) => chosen.includes(s.id))
            .map((s) => s.title)
            .join(", ")} can open this form.`;

  return (
    <>
      <Group step={firstStep} title="Audience">
        <div className="stack-3">
          <Choice
            type="radio"
            name="audienceMode"
            value="all_sections"
            checked={audienceMode === "all_sections"}
            onChange={() => setAudienceMode("all_sections")}
          >
            All sections in {courseCode}
          </Choice>
          <Choice
            type="radio"
            name="audienceMode"
            value="selected_sections"
            checked={audienceMode === "selected_sections"}
            onChange={() => setAudienceMode("selected_sections")}
          >
            Only the sections I choose
          </Choice>

          {audienceMode === "selected_sections" && (
            <div className="form-grid mt-2">
              {sections.length === 0 ? (
                <p className="helper-text">
                  This course has no sections yet, so there is nobody to send a
                  form to.
                </p>
              ) : (
                sections.map((section) => (
                  <Choice
                    key={section.id}
                    type="checkbox"
                    name="sectionIds"
                    value={section.id}
                    checked={chosen.includes(section.id)}
                    onChange={() => toggle(section.id)}
                  >
                    {section.title}
                  </Choice>
                ))
              )}
            </div>
          )}

          {/* One sentence, and it says what actually happens: these students can
              open it. Everyone else cannot. */}
          <p className="helper-text" role="status">
            {audienceSummary}
          </p>
        </div>
      </Group>

      <Group
        step={firstStep === undefined ? undefined : firstStep + 1}
        title="Schedule"
      >
        <div className="stack-3">
          {MODES.map((option) => (
            <Choice
              key={option.key}
              type="radio"
              name="deliveryMode"
              value={option.key}
              checked={mode === option.key}
              onChange={() => setMode(option.key)}
            >
              <span>
                {option.label}
                <span className="helper-text block">{option.hint}</span>
              </span>
            </Choice>
          ))}
        </div>

        {recurring && (
          <>
            <div className="form-grid">
              <FieldRow label="First one opens" htmlFor="startDate">
                <Field
                  id="startDate"
                  type="date"
                  name="startDate"
                  defaultValue={defaultStartDate}
                  required
                />
              </FieldRow>
              {mode === "custom_recurring" && (
                <FieldRow label="Repeat every" htmlFor="intervalWeeks">
                  <Select
                    id="intervalWeeks"
                    name="intervalWeeks"
                    defaultValue={String(defaultIntervalWeeks)}
                  >
                    {[2, 3, 4, 6, 8, 12].map((n) => (
                      <option key={n} value={n}>
                        {n} weeks
                      </option>
                    ))}
                  </Select>
                </FieldRow>
              )}
            </div>
            <div className="form-grid">
              <FieldRow label="Opens on" htmlFor="openDayOfWeek">
                <Select
                  id="openDayOfWeek"
                  name="openDayOfWeek"
                  defaultValue={String(defaultOpenDayOfWeek)}
                >
                  {DAY_NAMES.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </Select>
              </FieldRow>
              <FieldRow label="Opens at" htmlFor="openTime">
                <Field
                  id="openTime"
                  type="time"
                  name="openTime"
                  defaultValue={defaultOpenTime}
                />
              </FieldRow>
              <FieldRow label="Closes on" htmlFor="deadlineDayOfWeek">
                <Select
                  id="deadlineDayOfWeek"
                  name="deadlineDayOfWeek"
                  defaultValue={String(defaultDeadlineDayOfWeek)}
                >
                  {DAY_NAMES.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </Select>
              </FieldRow>
              <FieldRow label="Closes at" htmlFor="deadlineTime">
                <Field
                  id="deadlineTime"
                  type="time"
                  name="deadlineTime"
                  defaultValue={defaultDeadlineTime}
                />
              </FieldRow>
            </div>
            <div className="form-grid">
              <FieldRow label="How many" htmlFor="occurrenceCount">
                <Field
                  id="occurrenceCount"
                  type="number"
                  min={1}
                  max={60}
                  name="occurrenceCount"
                  defaultValue={defaultOccurrenceCount}
                />
                <span className="helper-text">
                  Leave blank to use an end date instead.
                </span>
              </FieldRow>
              <FieldRow label="Or run until" htmlFor="endDate">
                <Field
                  id="endDate"
                  type="date"
                  name="endDate"
                  defaultValue={defaultEndDate}
                />
                <span className="helper-text">
                  Set one of these two, not both.
                </span>
              </FieldRow>
            </div>
          </>
        )}

        {mode === "one_time" && (
          <div className="form-grid form-grid--stacked">
            <div className="field-row">
              <label htmlFor="openDate">
                Opens <RequiredMark />
              </label>
              <div className="datetime-pair">
                <Field
                  id="openDate"
                  type="date"
                  name="openDate"
                  defaultValue={defaultOpenDate}
                  required
                />
                <label className="visually-hidden" htmlFor="openAtTime">
                  Time it opens
                </label>
                <Field
                  id="openAtTime"
                  type="time"
                  name="openAtTime"
                  defaultValue={defaultOpenAtTime}
                  required
                />
              </div>
            </div>
            <div className="field-row">
              <label htmlFor="deadlineDate">
                Closes <RequiredMark />
              </label>
              <div className="datetime-pair">
                <Field
                  id="deadlineDate"
                  type="date"
                  name="deadlineDate"
                  defaultValue={defaultDeadlineDate}
                  required
                />
                <label className="visually-hidden" htmlFor="deadlineAtTime">
                  Time it closes
                </label>
                <Field
                  id="deadlineAtTime"
                  type="time"
                  name="deadlineAtTime"
                  defaultValue={defaultDeadlineAtTime}
                  required
                />
              </div>
            </div>
          </div>
        )}

        {mode === "manual" && (
          <p className="helper-text">
            You will create each one from the form&rsquo;s page and press Open
            when it should go out. The deadline is still a hard deadline once it
            is open.
          </p>
        )}
      </Group>
    </>
  );
}

/**
 * One of this component's two groups, in whichever frame its caller needs.
 *
 * With a `step` it is a numbered section of a longer form (the new-form
 * editor). Without one it is a plain labelled fieldset, because it is already
 * inside a panel with a heading of its own (the edit page) and a second
 * heading there would compete with the first.
 */
function Group({
  step,
  title,
  className,
  children,
}: {
  step?: number;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  if (step === undefined) {
    return (
      /* No margin of its own in either mode: numbered, the new-form page's
         `grid gap-4` separates the steps; unnumbered, the edit page's
         `stack-4` separates these two groups. A component that also spaced
         itself would double both. */
      <fieldset className={cn("m-0 grid gap-3 border-0 p-0", className)}>
        <FieldLabel>{title}</FieldLabel>
        {children}
      </fieldset>
    );
  }
  return (
    <FormSection step={step} title={title} className={className}>
      {children}
    </FormSection>
  );
}
