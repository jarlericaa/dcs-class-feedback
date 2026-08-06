"use client";

import { useState } from "react";
import { DAY_NAMES } from "@/lib/days";

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

export type DeliveryMode = "one_time" | "weekly" | "custom_recurring" | "manual";

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
      <fieldset className="q-item">
        <legend className="q-item__legend">Who gets this form</legend>
        <div className="stack-3">
          <label className="choice">
            <input
              type="radio"
              name="audienceMode"
              value="all_sections"
              checked={audienceMode === "all_sections"}
              onChange={() => setAudienceMode("all_sections")}
            />
            <span>All sections in {courseCode}</span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name="audienceMode"
              value="selected_sections"
              checked={audienceMode === "selected_sections"}
              onChange={() => setAudienceMode("selected_sections")}
            />
            <span>Only the sections I choose</span>
          </label>

          {audienceMode === "selected_sections" && (
            <div className="form-grid" style={{ marginTop: "var(--s2)" }}>
              {sections.length === 0 ? (
                <p className="helper-text">
                  This course has no sections yet, so there is nobody to send a
                  form to.
                </p>
              ) : (
                sections.map((section) => (
                  <label className="choice" key={section.id}>
                    <input
                      type="checkbox"
                      name="sectionIds"
                      value={section.id}
                      checked={chosen.includes(section.id)}
                      onChange={() => toggle(section.id)}
                    />
                    <span>{section.title}</span>
                  </label>
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
      </fieldset>

      <fieldset className="q-item" style={{ marginTop: "var(--s5)" }}>
        <legend className="q-item__legend">When it goes out</legend>
        <div className="stack-3">
          {MODES.map((option) => (
            <label className="choice" key={option.key}>
              <input
                type="radio"
                name="deliveryMode"
                value={option.key}
                checked={mode === option.key}
                onChange={() => setMode(option.key)}
              />
              <span>
                {option.label}
                <span className="helper-text" style={{ display: "block" }}>
                  {option.hint}
                </span>
              </span>
            </label>
          ))}
        </div>

        {recurring && (
          <>
            <div className="form-grid" style={{ marginTop: "var(--s4)" }}>
              <div className="field-row">
                <label htmlFor="startDate">First one opens</label>
                <input
                  id="startDate"
                  className="field"
                  type="date"
                  name="startDate"
                  defaultValue={defaultStartDate}
                  required
                />
              </div>
              {mode === "custom_recurring" && (
                <div className="field-row">
                  <label htmlFor="intervalWeeks">Repeat every</label>
                  <select
                    id="intervalWeeks"
                    className="select-field"
                    name="intervalWeeks"
                    defaultValue={String(defaultIntervalWeeks)}
                  >
                    {[2, 3, 4, 6, 8, 12].map((n) => (
                      <option key={n} value={n}>
                        {n} weeks
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="form-grid">
              <div className="field-row">
                <label htmlFor="openDayOfWeek">Opens on</label>
                <select
                  id="openDayOfWeek"
                  className="select-field"
                  name="openDayOfWeek"
                  defaultValue={String(defaultOpenDayOfWeek)}
                >
                  {DAY_NAMES.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-row">
                <label htmlFor="openTime">Opens at</label>
                <input
                  id="openTime"
                  className="field"
                  type="time"
                  name="openTime"
                  defaultValue={defaultOpenTime}
                />
              </div>
              <div className="field-row">
                <label htmlFor="deadlineDayOfWeek">Closes on</label>
                <select
                  id="deadlineDayOfWeek"
                  className="select-field"
                  name="deadlineDayOfWeek"
                  defaultValue={String(defaultDeadlineDayOfWeek)}
                >
                  {DAY_NAMES.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-row">
                <label htmlFor="deadlineTime">Closes at</label>
                <input
                  id="deadlineTime"
                  className="field"
                  type="time"
                  name="deadlineTime"
                  defaultValue={defaultDeadlineTime}
                />
              </div>
            </div>
            <div className="form-grid">
              <div className="field-row">
                <label htmlFor="occurrenceCount">How many</label>
                <input
                  id="occurrenceCount"
                  className="field"
                  type="number"
                  min={1}
                  max={60}
                  name="occurrenceCount"
                  defaultValue={defaultOccurrenceCount}
                />
                <span className="helper-text">
                  Leave blank to use an end date instead.
                </span>
              </div>
              <div className="field-row">
                <label htmlFor="endDate">Or run until</label>
                <input
                  id="endDate"
                  className="field"
                  type="date"
                  name="endDate"
                  defaultValue={defaultEndDate}
                />
                <span className="helper-text">
                  Set one of these two, not both.
                </span>
              </div>
            </div>
          </>
        )}

        {mode === "one_time" && (
          <div className="form-grid" style={{ marginTop: "var(--s4)" }}>
            <div className="field-row">
              <label htmlFor="openDate">Opens</label>
              <input
                id="openDate"
                className="field"
                type="date"
                name="openDate"
                defaultValue={defaultOpenDate}
                required
              />
            </div>
            <div className="field-row">
              <label htmlFor="openAtTime">at</label>
              <input
                id="openAtTime"
                className="field"
                type="time"
                name="openAtTime"
                defaultValue={defaultOpenAtTime}
                required
              />
            </div>
            <div className="field-row">
              <label htmlFor="deadlineDate">Closes</label>
              <input
                id="deadlineDate"
                className="field"
                type="date"
                name="deadlineDate"
                defaultValue={defaultDeadlineDate}
                required
              />
            </div>
            <div className="field-row">
              <label htmlFor="deadlineAtTime">at</label>
              <input
                id="deadlineAtTime"
                className="field"
                type="time"
                name="deadlineAtTime"
                defaultValue={defaultDeadlineAtTime}
                required
              />
            </div>
          </div>
        )}

        {mode === "manual" && (
          <p className="helper-text" style={{ marginTop: "var(--s4)" }}>
            You will create each one from the form&rsquo;s page and press Open when it
            should go out. The deadline is still a hard deadline once it is open.
          </p>
        )}
      </fieldset>
    </>
  );
}
