"use client";

import { useActionState, useState } from "react";
import { PreRenderedRichText } from "@/components/rich-text-client";
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
  /**
   * Sanitized HTML for `prompt` / `description`, pre-rendered on the server.
   *
   * This is a client component, so it cannot run the markdown pipeline itself —
   * and it must not: shipping a sanitizer to the browser would create a second
   * place where HTML is trusted. The plain strings above remain the fallback and
   * the accessible label source.
   */
  promptHtml?: string;
  descriptionHtml?: string;
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
  status: "idle" | "error" | "saved" | "submitted";
  /** questionId → message; the "" key carries a form-level message */
  errors: Record<string, string>;
  message?: string;
  /** items whose edit was refused because staff already acted on them */
  rejectedItemIds?: string[];
}

/** The student's own question / general-comment blocks. */
export interface StudentItemView {
  clientKey: string;
  itemId?: string;
  kind: "question" | "general_comment";
  submissionType: string;
  category: string;
  text: string;
  /** false once staff have replied to or published it */
  editable: boolean;
}

export interface StudentSectionConfigView {
  maxStudentQuestions: number;
  studentQuestionPrompt: string | null;
  generalCommentEnabled: boolean;
  generalCommentPrompt: string | null;
  generalCommentRequired: boolean;
}

type AnswerValue = string | string[];

/**
 * `aria-invalid` + `aria-describedby` for one question's control.
 *
 * Shared so a grouped control (radios, checkboxes, a scale) is marked invalid
 * the same way a single input is. Applying this only to inputs — the easy half —
 * leaves the grouped questions announcing no error at all.
 */
export function questionErrorAttributes(
  error: string | undefined,
  describedBy: string | undefined,
) {
  return {
    "aria-invalid": error ? ("true" as const) : undefined,
    "aria-describedby": describedBy,
  };
}

let keyCounter = 0;
const nextKey = () => `new-${(keyCounter += 1)}`;

export function WeeklyForm({
  questions,
  action,
  deadlineLabel,
  config,
  lifecycle = "new",
  revision,
  initialAnswers = {},
  initialItems = [],
  lastEditedLabel,
}: {
  questions: FormQuestionView[];
  action: (state: SubmitState, formData: FormData) => Promise<SubmitState>;
  deadlineLabel: string;
  config: StudentSectionConfigView;
  /** "new" = nothing saved yet */
  lifecycle?: "new" | "draft" | "submitted" | "locked";
  revision?: number;
  initialAnswers?: Record<string, AnswerValue>;
  initialItems?: StudentItemView[];
  lastEditedLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
    errors: {},
  } satisfies SubmitState);

  const [values, setValues] =
    useState<Record<string, AnswerValue>>(initialAnswers);

  // Repeatable question blocks + the single general comment (project-specs.md
  // §5.2). Held in state so a failed server validation never loses typed text.
  const [items, setItems] = useState<StudentItemView[]>(() => {
    const existing = initialItems.filter((item) => item.kind === "question");
    const comment = initialItems.find(
      (item) => item.kind === "general_comment",
    );
    return [
      ...(existing.length > 0
        ? existing
        : config.maxStudentQuestions > 0
          ? [
              {
                clientKey: nextKey(),
                kind: "question" as const,
                submissionType: "question",
                category: "content",
                text: "",
                editable: true,
              },
            ]
          : []),
      ...(config.generalCommentEnabled
        ? [
            comment ?? {
              clientKey: nextKey(),
              kind: "general_comment" as const,
              submissionType: "feedback",
              category: "misc",
              text: "",
              editable: true,
            },
          ]
        : []),
    ];
  });

  const questionItems = items.filter((item) => item.kind === "question");
  const commentItem = items.find((item) => item.kind === "general_comment");
  const locked = lifecycle === "locked";
  const rejected = new Set(state.rejectedItemIds ?? []);

  const updateItem = (clientKey: string, patch: Partial<StudentItemView>) =>
    setItems((prev) =>
      prev.map((item) =>
        item.clientKey === clientKey ? { ...item, ...patch } : item,
      ),
    );
  const addQuestion = () =>
    setItems((prev) => [
      ...prev.filter((i) => i.kind === "question"),
      {
        clientKey: nextKey(),
        kind: "question" as const,
        submissionType: "question",
        category: "content",
        text: "",
        editable: true,
      },
      ...prev.filter((i) => i.kind === "general_comment"),
    ]);
  const removeQuestion = (clientKey: string) =>
    setItems((prev) => prev.filter((item) => item.clientKey !== clientKey));

  /** Posted as one JSON field so the server sees a typed array, not loose keys. */
  const itemsPayload = JSON.stringify(
    items
      .filter((item) => item.text.trim().length > 0 || item.itemId)
      .map((item) => ({
        clientKey: item.clientKey,
        itemId: item.itemId,
        kind: item.kind,
        submissionType: item.submissionType,
        category: item.category,
        text: item.text,
      })),
  );

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
      {/* One JSON field so the server receives a typed array of items rather
          than a set of loose, positionally-guessed form keys. */}
      <input type="hidden" name="items" value={itemsPayload} />
      {/* Lost-update detection: the server refuses a save built on a stale
          revision instead of silently overwriting a newer one. */}
      {revision !== undefined && (
        <input type="hidden" name="expectedRevision" value={revision} />
      )}
      {state.status === "error" && (
        <div style={{ marginBottom: "var(--s5)" }}>
          <Alert variant="error" title="Your form was not submitted">
            {formError ??
              `Check ${errorCount} question${errorCount === 1 ? "" : "s"} below. Everything you typed has been kept.`}
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
            <legend>
              {question.promptHtml ? (
                <PreRenderedRichText
                  html={question.promptHtml}
                  className="rich-text--inline"
                />
              ) : (
                question.prompt
              )}
            </legend>
            <p className="question__note">
              <span
                className={
                  question.required ? "required-mark" : "optional-mark"
                }
              >
                {question.required ? "Required" : "Optional"}
              </span>
            </p>
            {(question.descriptionHtml || question.description) && (
              <div className="question__desc" id={`desc-${question.id}`}>
                {question.descriptionHtml ? (
                  <PreRenderedRichText html={question.descriptionHtml} />
                ) : (
                  <p>{question.description}</p>
                )}
              </div>
            )}

            {(question.type === "short_answer" ||
              question.type === "paragraph") && (
              <textarea
                className="textarea-field"
                name={`q_${question.id}`}
                rows={question.type === "paragraph" ? 4 : 2}
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
                style={{ maxWidth: 220 }}
              />
            )}

            <div className="question__error">
              <FieldError id={errorId} message={error} />
            </div>
          </fieldset>
        );
      })}

      {config.maxStudentQuestions > 0 && (
        <fieldset className="own-item">
          <legend>
            {config.studentQuestionPrompt ?? "Anything you want to raise?"}
          </legend>
          {/* One line, not two paragraphs. What a student needs before typing
              is the privacy consequence — that an answer may go to the whole
              class, reworded, without their name. How staff track items
              internally is not their concern. */}
          <p className="own-item__note">
            <span className="optional-mark">Optional.</span> Staff may reply
            privately, or rewrite the question and answer it for the whole class
            — never with your name or your own wording.
          </p>

          {questionItems.map((item, index) => {
            const refused = item.itemId ? rejected.has(item.itemId) : false;
            const readOnly = locked || !item.editable;
            return (
              <div key={item.clientKey} className="own-item__block">
                {/* "Question 1" numbers nothing when only one is allowed. */}
                {config.maxStudentQuestions > 1 && (
                  <div className="own-item__block-head">
                    <h3 className="label">Question {index + 1}</h3>
                    {questionItems.length > 1 && !readOnly && (
                      <button
                        type="button"
                        className="button button--quiet button--small"
                        onClick={() => removeQuestion(item.clientKey)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}

                {!item.editable && !locked && (
                  <Alert variant="info">
                    Staff have already replied to or published this one, so its
                    original wording is kept as it was.
                  </Alert>
                )}
                {refused && (
                  <Alert variant="warning">
                    This could not be changed because staff have already acted
                    on it. Your original wording stands.
                  </Alert>
                )}

                <div className="form-grid" style={{ marginBottom: 12 }}>
                  <div className="field-row">
                    <label htmlFor={`item_type_${item.clientKey}`}>
                      What is this?
                    </label>
                    <select
                      id={`item_type_${item.clientKey}`}
                      className="select-field"
                      value={item.submissionType}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateItem(item.clientKey, {
                          submissionType: e.target.value,
                        })
                      }
                    >
                      <option value="question">Question</option>
                      <option value="feedback">Feedback</option>
                      <option value="concern">Concern</option>
                      <option value="clarification">Clarification</option>
                      <option value="suggestion">Suggestion</option>
                    </select>
                  </div>
                  <div className="field-row">
                    <label htmlFor={`item_category_${item.clientKey}`}>
                      Topic area
                    </label>
                    <select
                      id={`item_category_${item.clientKey}`}
                      className="select-field"
                      value={item.category}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateItem(item.clientKey, { category: e.target.value })
                      }
                    >
                      <option value="content">Course content</option>
                      <option value="logistics">Logistics</option>
                      <option value="misc">Something else</option>
                    </select>
                  </div>
                </div>
                <div className="field-row">
                  <label htmlFor={`item_text_${item.clientKey}`}>
                    Your message
                  </label>
                  <textarea
                    id={`item_text_${item.clientKey}`}
                    className="textarea-field"
                    rows={4}
                    maxLength={10000}
                    value={item.text}
                    readOnly={readOnly}
                    onChange={(e) =>
                      updateItem(item.clientKey, { text: e.target.value })
                    }
                    placeholder="Ask anything about this week, or tell your teacher what would help."
                    aria-invalid={state.errors.item ? "true" : undefined}
                    aria-describedby={
                      state.errors.item ? "error-item" : undefined
                    }
                  />
                </div>
              </div>
            );
          })}

          <FieldError id="error-item" message={state.errors.item} />

          {questionItems.length < config.maxStudentQuestions && !locked && (
            <button
              type="button"
              className="button button--secondary own-item__add"
              onClick={addQuestion}
            >
              Add another question
            </button>
          )}
        </fieldset>
      )}

      {config.generalCommentEnabled && commentItem && (
        <fieldset className="own-item">
          <legend>{config.generalCommentPrompt ?? "Anything else?"}</legend>
          <p className="own-item__note">
            <span
              className={
                config.generalCommentRequired
                  ? "required-mark"
                  : "optional-mark"
              }
            >
              {config.generalCommentRequired ? "Required." : "Optional."}
            </span>{" "}
            {/* Kept: it is the difference between this box and the one above,
                and a student could otherwise expect an answer here. */}
            Never published to the class.
          </p>
          <div className="field-row">
            <label className="visually-hidden" htmlFor="general_comment">
              General comment
            </label>
            <textarea
              id="general_comment"
              className="textarea-field"
              rows={3}
              maxLength={10000}
              value={commentItem.text}
              readOnly={locked || !commentItem.editable}
              onChange={(e) =>
                updateItem(commentItem.clientKey, { text: e.target.value })
              }
            />
          </div>
        </fieldset>
      )}

      <div className="submit-bar">
        <p className="submit-bar__note">
          {locked ? (
            <>This week is closed, so it can no longer be changed.</>
          ) : lifecycle === "submitted" ? (
            <>
              Submitted
              {lastEditedLabel ? ` · last edited ${lastEditedLabel}` : ""}. You
              can keep editing until {deadlineLabel}.
            </>
          ) : (
            <>
              Closes {deadlineLabel}. Save a draft as often as you like; you can
              still edit after submitting, until the deadline.
            </>
          )}
        </p>
        {!locked && (
          <>
            {lifecycle !== "submitted" && (
              <button
                className="button button--secondary"
                type="submit"
                name="intent"
                value="draft"
                disabled={pending}
              >
                {pending ? "Saving…" : "Save draft"}
              </button>
            )}
            <button
              className="button button--primary"
              type="submit"
              name="intent"
              value={lifecycle === "submitted" ? "edit" : "submit"}
              disabled={pending}
            >
              {pending
                ? "Working…"
                : lifecycle === "submitted"
                  ? "Save changes"
                  : "Submit this week's form"}
            </button>
          </>
        )}
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
