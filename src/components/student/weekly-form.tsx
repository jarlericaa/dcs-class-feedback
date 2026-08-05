"use client";

import { useActionState, useState } from "react";
import { Alert, FieldError } from "@/components/ui";

/**
 * The weekly form. A client component for ONE reason: input must survive a
 * failed submission. Answers live in React state, so a server-side validation
 * error re-renders the same values with inline messages instead of throwing
 * the student's work away.
 *
 * No domain rule lives here. Validation shown to the user is whatever the
 * server returned; the server is the only authority on what is valid.
 */

export interface FormQuestionView {
  id: string;
  prompt: string;
  description: string | null;
  type:
    | "short_answer"
    | "paragraph"
    | "multiple_choice"
    | "checkboxes"
    | "dropdown"
    | "linear_scale"
    | "yes_no"
    | "date"
    | "time";
  required: boolean;
  options: { stableId: string; label: string }[];
  scale: { min: number; max: number; step: number } | null;
}

export interface SubmitState {
  status: "idle" | "error";
  /** questionId → message; the "" key carries a form-level message */
  errors: Record<string, string>;
}

type AnswerValue = string | string[];

export function questionErrorAttributes(
  error: string | undefined,
  describedBy: string | undefined,
) {
  return {
    "aria-invalid": error ? ("true" as const) : undefined,
    "aria-describedby": describedBy,
  };
}

export function WeeklyForm({
  questions,
  action,
}: {
  questions: FormQuestionView[];
  action: (state: SubmitState, formData: FormData) => Promise<SubmitState>;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
    errors: {},
  } satisfies SubmitState);

  const [values, setValues] = useState<Record<string, AnswerValue>>({});
  const [itemText, setItemText] = useState("");
  const [itemType, setItemType] = useState("question");
  const [itemCategory, setItemCategory] = useState("content");

  const setValue = (questionId: string, value: AnswerValue) =>
    setValues((prev) => ({ ...prev, [questionId]: value }));

  const toggleCheckbox = (questionId: string, optionId: string) =>
    setValues((prev) => {
      const current = Array.isArray(prev[questionId])
        ? (prev[questionId] as string[])
        : [];
      return {
        ...prev,
        [questionId]: current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      };
    });

  const formError = state.errors[""];
  const errorCount = Object.keys(state.errors).filter((k) => k !== "").length;

  return (
    <form action={formAction} noValidate>
      {state.status === "error" && (
        <div style={{ marginBottom: "var(--s5)" }}>
          <Alert variant="error" title="Your form was not submitted">
            {formError ??
              `${errorCount} question${errorCount === 1 ? " needs" : "s need"} an answer before this can be sent. Everything you typed has been kept.`}
          </Alert>
        </div>
      )}

      {questions.map((question) => {
        const error = state.errors[question.id];
        const errorId = `error-${question.id}`;
        const describedBy =
          [
            question.description ? `desc-${question.id}` : null,
            error ? errorId : null,
          ]
            .filter(Boolean)
            .join(" ") || undefined;
        const value = values[question.id];

        return (
          <fieldset className="question" key={question.id}>
            <legend>{question.prompt}</legend>
            <p className="question__note">
              <span className={question.required ? "required-mark" : "optional-mark"}>
                {question.required ? "Required" : "Optional"}
              </span>
              {question.description && (
                <span id={`desc-${question.id}`}>{question.description}</span>
              )}
            </p>

            {(question.type === "short_answer" ||
              question.type === "paragraph") && (
              <textarea
                className="textarea-field"
                name={`q_${question.id}`}
                rows={question.type === "paragraph" ? 5 : 2}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => setValue(question.id, e.target.value)}
                {...questionErrorAttributes(error, describedBy)}
              />
            )}

            {(question.type === "multiple_choice" ||
              question.type === "checkboxes") && (
              <div
                className="choice-list"
                role="group"
                {...questionErrorAttributes(error, describedBy)}
              >
                {question.options.map((option) => {
                  const checked =
                    question.type === "checkboxes"
                      ? Array.isArray(value) && value.includes(option.stableId)
                      : value === option.stableId;
                  return (
                    <label className="choice" key={option.stableId}>
                      <input
                        type={
                          question.type === "checkboxes" ? "checkbox" : "radio"
                        }
                        name={`q_${question.id}`}
                        value={option.stableId}
                        checked={checked}
                        onChange={() =>
                          question.type === "checkboxes"
                            ? toggleCheckbox(question.id, option.stableId)
                            : setValue(question.id, option.stableId)
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {question.type === "dropdown" && (
              <select
                className="select-field"
                name={`q_${question.id}`}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => setValue(question.id, e.target.value)}
                {...questionErrorAttributes(error, describedBy)}
                style={{ maxWidth: 320 }}
              >
                <option value="">Select an option…</option>
                {question.options.map((option) => (
                  <option key={option.stableId} value={option.stableId}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}

            {question.type === "linear_scale" && question.scale && (
              <div
                className="scale-list"
                role="group"
                {...questionErrorAttributes(error, describedBy)}
              >
                {scaleValues(question.scale).map((v) => (
                  <label className="choice" key={v}>
                    <input
                      type="radio"
                      name={`q_${question.id}`}
                      value={v}
                      checked={value === String(v)}
                      onChange={() => setValue(question.id, String(v))}
                    />
                    <span>{v}</span>
                  </label>
                ))}
              </div>
            )}

            {question.type === "yes_no" && (
              <div
                className="scale-list"
                role="group"
                {...questionErrorAttributes(error, describedBy)}
              >
                {[
                  { key: "yes", label: "Yes" },
                  { key: "no", label: "No" },
                ].map((option) => (
                  <label className="choice" key={option.key}>
                    <input
                      type="radio"
                      name={`q_${question.id}`}
                      value={option.key}
                      checked={value === option.key}
                      onChange={() => setValue(question.id, option.key)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            )}

            {(question.type === "date" || question.type === "time") && (
              <input
                className="field"
                type={question.type}
                name={`q_${question.id}`}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => setValue(question.id, e.target.value)}
                {...questionErrorAttributes(error, describedBy)}
                style={{ maxWidth: 200 }}
              />
            )}

            <div className="question__error">
              <FieldError id={errorId} message={error} />
            </div>
          </fieldset>
        );
      })}

      <fieldset className="own-item">
        <legend>Anything you want to raise?</legend>
        <p className="own-item__note">
          Optional, and the only part of this form written entirely in your own
          words. Staff can reply to you privately here. If the whole class would
          benefit from the answer, they rewrite the question first and publish it
          without your name — your original wording is never shown to classmates.
        </p>
        <div className="form-grid" style={{ marginBottom: "var(--s3)" }}>
          <div className="field-row">
            <label htmlFor="item_type">What is this?</label>
            <select
              id="item_type"
              className="select-field"
              name="item_type"
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
            >
              <option value="question">A question</option>
              <option value="feedback">Feedback</option>
              <option value="concern">A concern</option>
              <option value="clarification">A clarification</option>
              <option value="suggestion">A suggestion</option>
            </select>
          </div>
          <div className="field-row">
            <label htmlFor="item_category">What is it about?</label>
            <select
              id="item_category"
              className="select-field"
              name="item_category"
              value={itemCategory}
              onChange={(e) => setItemCategory(e.target.value)}
            >
              <option value="content">Course content</option>
              <option value="logistics">Class logistics</option>
              <option value="misc">Something else</option>
            </select>
          </div>
        </div>
        <div className="field-row">
          <label htmlFor="item_text">
            Your message <span className="optional-mark">optional</span>
          </label>
          <textarea
            id="item_text"
            className="textarea-field"
            name="item_text"
            rows={5}
            maxLength={10000}
            value={itemText}
            onChange={(e) => setItemText(e.target.value)}
            placeholder="Ask anything about this week, or tell your teacher what would help."
            aria-invalid={state.errors.item ? "true" : undefined}
            aria-describedby={state.errors.item ? "error-item" : undefined}
          />
          <FieldError id="error-item" message={state.errors.item} />
        </div>
      </fieldset>

      <div className="submit-bar">
        <p className="submit-bar__note">
          Sending is final. You cannot edit or withdraw this form afterwards.
        </p>
        <button
          className="button button--primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "Submitting…" : "Submit this week's form"}
        </button>
      </div>
    </form>
  );
}

function scaleValues(scale: {
  min: number;
  max: number;
  step: number;
}): number[] {
  const step = scale.step > 0 ? scale.step : 1;
  const values: number[] = [];
  for (let v = scale.min; v <= scale.max; v += step) values.push(v);
  return values;
}
