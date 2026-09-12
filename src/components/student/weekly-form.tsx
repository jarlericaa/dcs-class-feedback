"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { PreRenderedRichText } from "@/components/rich-text-client";
import { Alert, FieldError } from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  Choice,
  ChoiceList,
  Field,
  FieldRow,
  Label,
  OwnItem,
  OwnItemBlock,
  Question,
  QuestionDesc,
  ScaleList,
  ScaleInput,
  Select,
  Textarea,
} from "@/components/ui/form";
import { RequiredMark } from "@/components/ui/required-mark";

/**
 * The student form. A client component for ONE reason: input must survive a
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
  /** questionId → message; "" is form-level, and item keys are student blocks */
  errors: Record<string, string>;
  message?: string;
  /** items whose edit was refused because staff already acted on them */
  rejectedItemIds?: string[];
  /** canonical server row ids for the client blocks written by the action */
  itemIdMappings?: { clientKey: string; itemId: string }[];
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

/**
 * "Optional" beside a prompt, or the required asterisk on it.
 *
 * One helper for all three places a prompt is marked — the teacher's
 * questions, the student's own question, the general comment — because they
 * were three copies of the same decision and had already drifted: two said
 * "Optional." with a full stop under the question, one said "OPTIONAL" in
 * small caps beside it.
 *
 * No vertical-align override. The word is 12px against an 18px serif prompt,
 * and `align-middle` centred it on the prompt's box, which floats it above the
 * text it sits beside; the default baseline alignment is what "in line with
 * the question" means.
 */
function PromptMark({ required }: { required: boolean }) {
  return required ? (
    <RequiredMark />
  ) : (
    <span className="ml-2 font-sans text-meta font-normal text-ink-muted">
      Optional
    </span>
  );
}

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
  preview = false,
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
  /**
   * Teacher looking at their own draft template. Every control stays live so
   * the reading is honest, but the submit bar is replaced: a preview has
   * nowhere to post, and the caller passes an inert action.
   */
  preview?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
    errors: {},
  } satisfies SubmitState);

  const [values, setValues] =
    useState<Record<string, AnswerValue>>(initialAnswers);
  // React's id is stable across the server render and client hydration.
  // Generated keys must not come from a module-level counter: the server may
  // render more than one form before the browser hydrates it.
  const generatedId = useId();
  const [nextQuestionIndex, setNextQuestionIndex] = useState(1);

  // Repeatable question blocks + the single general comment (docs/product/specification.md
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
                clientKey: `${generatedId}-question-0`,
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
              clientKey: `${generatedId}-comment`,
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

  // Replacements receive a new immutable row id. Keep the client block tied to
  // that canonical row so a later edit cannot accidentally create a second
  // live item or bypass the server's already-acted-on warning.
  useEffect(() => {
    if (!state.itemIdMappings?.length) return;
    const itemIds = new Map(
      state.itemIdMappings.map(({ clientKey, itemId }) => [clientKey, itemId]),
    );
    setItems((prev) =>
      prev.map((item) => {
        const itemId = itemIds.get(item.clientKey);
        return itemId && item.itemId !== itemId ? { ...item, itemId } : item;
      }),
    );
  }, [state.itemIdMappings]);

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
  const addQuestion = () => {
    const clientKey = `${generatedId}-question-${nextQuestionIndex}`;
    setNextQuestionIndex((index) => index + 1);
    setItems((prev) => [
      ...prev.filter((i) => i.kind === "question"),
      {
        clientKey,
        kind: "question" as const,
        submissionType: "question",
        category: "content",
        text: "",
        editable: true,
      },
      ...prev.filter((i) => i.kind === "general_comment"),
    ]);
  };
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
        <div className="mb-6">
          <Alert variant="error" title="Your form was not submitted">
            {formError ??
              `Check the highlighted field${errorCount === 1 ? "" : "s"} below. Everything you typed has been kept.`}
          </Alert>
        </div>
      )}
      {(state.status === "saved" || state.status === "submitted") &&
        state.message && (
          <div className="mb-6">
            <Alert variant={state.status === "saved" ? "info" : "success"}>
              {state.message}
            </Alert>
          </div>
        )}

      {questions.map((question) => {
        const error = state.errors[question.id];
        const errorId = `error-${question.id}`;
        const legendId = `question-${question.id}-legend`;
        const describedBy =
          [
            question.description ? `desc-${question.id}` : null,
            error ? errorId : null,
          ]
            .filter(Boolean)
            .join(" ") || undefined;
        const value = values[question.id];

        return (
          <Question
            key={question.id}
            legendId={legendId}
            /*
              Required is a red asterisk ON the prompt, the way every form a
              student has already filled in marks it (owner, 2026-09-11) — and
              `RequiredMark` is exactly that, already carrying the three
              channels that let the glyph replace the word: its presence
              against unmarked questions, a visually-hidden "required", and the
              control's own `required` attribute.

              Optional says so beside the prompt rather than under it. It used
              to be a line of its own below the question, which gave a
              one-word qualifier the same vertical weight as the question it
              qualified.
            */
            legend={
              <>
                {question.promptHtml ? (
                  <PreRenderedRichText
                    html={question.promptHtml}
                    className="rich-text--inline"
                  />
                ) : (
                  question.prompt
                )}
                <PromptMark required={question.required} />
              </>
            }
          >
            {(question.descriptionHtml || question.description) && (
              <div id={`desc-${question.id}`}>
                <QuestionDesc>
                  {question.descriptionHtml ? (
                    <PreRenderedRichText html={question.descriptionHtml} />
                  ) : (
                    <p>{question.description}</p>
                  )}
                </QuestionDesc>
              </div>
            )}

            {(question.type === "short_answer" ||
              question.type === "paragraph") && (
              <Textarea
                name={`q_${question.id}`}
                aria-labelledby={legendId}
                rows={question.type === "paragraph" ? 4 : 2}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => setValue(question.id, e.target.value)}
                {...questionErrorAttributes(error, describedBy)}
              />
            )}

            {(question.type === "multiple_choice" ||
              question.type === "checkboxes") && (
              <ChoiceList
                role="group"
                aria-labelledby={legendId}
                {...questionErrorAttributes(error, describedBy)}
              >
                {question.options.map((option) => {
                  const checked =
                    question.type === "checkboxes"
                      ? Array.isArray(value) && value.includes(option.stableId)
                      : value === option.stableId;
                  return (
                    <Choice
                      key={option.stableId}
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
                      {...questionErrorAttributes(error, describedBy)}
                    >
                      <span>{option.label}</span>
                    </Choice>
                  );
                })}
              </ChoiceList>
            )}

            {question.type === "dropdown" && (
              <Select
                name={`q_${question.id}`}
                aria-labelledby={legendId}
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
              </Select>
            )}

            {question.type === "linear_scale" && question.scale && (
              <ScaleInput
                labelledBy={legendId}
                name={`q_${question.id}`}
                onValueChange={(next) => setValue(question.id, next)}
                scale={question.scale}
                value={typeof value === "string" ? value : ""}
                {...questionErrorAttributes(error, describedBy)}
              />
            )}

            {question.type === "yes_no" && (
              <ScaleList
                role="group"
                aria-labelledby={legendId}
                {...questionErrorAttributes(error, describedBy)}
              >
                {[
                  { key: "yes", label: "Yes" },
                  { key: "no", label: "No" },
                ].map((option) => (
                  <Choice
                    key={option.key}
                    type="radio"
                    name={`q_${question.id}`}
                    value={option.key}
                    checked={value === option.key}
                    onChange={() => setValue(question.id, option.key)}
                    {...questionErrorAttributes(error, describedBy)}
                  >
                    <span>{option.label}</span>
                  </Choice>
                ))}
              </ScaleList>
            )}

            {(question.type === "date" || question.type === "time") && (
              <Field
                type={question.type}
                name={`q_${question.id}`}
                aria-labelledby={legendId}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => setValue(question.id, e.target.value)}
                {...questionErrorAttributes(error, describedBy)}
                className="max-w-55"
              />
            )}

            <div className="mt-2">
              <FieldError id={errorId} message={error} />
            </div>
          </Question>
        );
      })}

      {config.maxStudentQuestions > 0 && (
        <OwnItem
          legend={
            <>
              {config.studentQuestionPrompt ?? "Anything you want to raise?"}
              <PromptMark required={false} />
            </>
          }
        >

          {questionItems.map((item, index) => {
            const refused = item.itemId ? rejected.has(item.itemId) : false;
            const readOnly = locked || !item.editable;
            return (
              <OwnItemBlock key={item.clientKey}>
                {/* "Question 1" numbers nothing when only one is allowed. */}
                {config.maxStudentQuestions > 1 && (
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Label className="text-ink-soft">
                      Question {index + 1}
                    </Label>
                    {questionItems.length > 1 && !readOnly && (
                      <Button
                        variant="quiet"
                        size="small"
                        onClick={() => removeQuestion(item.clientKey)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                )}

                {!item.editable && !locked && (
                  /* Short enough for one line. It read "Staff have already
                     replied to or published this one, so its original wording
                     is kept as it was." — 95 characters, which cannot fit one
                     line inside the 68ch reading measure no matter how the box
                     is laid out, so the fix is the sentence and not the CSS
                     (owner, 2026-09-11). */
                  <Alert variant="info">
                    Answered by staff, so its wording is kept as it was.
                  </Alert>
                )}
                {refused && (
                  <Alert variant="warning">
                    This could not be changed because staff have already acted
                    on it. Your original wording stands.
                  </Alert>
                )}

                <div className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] items-start gap-4">
                  <FieldRow
                    label="What is this?"
                    htmlFor={`item_type_${item.clientKey}`}
                  >
                    <Select
                      id={`item_type_${item.clientKey}`}
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
                    </Select>
                  </FieldRow>
                  <FieldRow
                    label="Topic area"
                    htmlFor={`item_category_${item.clientKey}`}
                  >
                    <Select
                      id={`item_category_${item.clientKey}`}
                      value={item.category}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateItem(item.clientKey, { category: e.target.value })
                      }
                    >
                      <option value="content">Course content</option>
                      <option value="logistics">Logistics</option>
                      <option value="misc">Something else</option>
                    </Select>
                  </FieldRow>
                </div>
                <FieldRow
                  label="Your message"
                  htmlFor={`item_text_${item.clientKey}`}
                >
                  <Textarea
                    id={`item_text_${item.clientKey}`}
                    rows={4}
                    maxLength={10000}
                    value={item.text}
                    readOnly={readOnly}
                    onChange={(e) =>
                      updateItem(item.clientKey, { text: e.target.value })
                    }
                    placeholder="Ask anything about this form, or tell your teacher what would help."
                    aria-invalid={state.errors.item ? "true" : undefined}
                    aria-describedby={
                      state.errors.item ? "error-item" : undefined
                    }
                  />
                </FieldRow>
              </OwnItemBlock>
            );
          })}

          <FieldError id="error-item" message={state.errors.item} />

          {questionItems.length < config.maxStudentQuestions && !locked && (
            <Button variant="secondary" className="mt-4" onClick={addQuestion}>
              Add another question
            </Button>
          )}
        </OwnItem>
      )}

      {config.generalCommentEnabled && commentItem && (
        <OwnItem
          legend={
            <>
              {config.generalCommentPrompt ?? "Anything else?"}
              <PromptMark required={config.generalCommentRequired} />
            </>
          }
        >
          <div className="grid gap-tight">
            <label className="visually-hidden" htmlFor="general_comment">
              General comment
            </label>
            <Textarea
              id="general_comment"
              rows={3}
              maxLength={10000}
              value={commentItem.text}
              readOnly={locked || !commentItem.editable}
              onChange={(e) =>
                updateItem(commentItem.clientKey, { text: e.target.value })
              }
              aria-invalid={state.errors.generalComment ? "true" : undefined}
              aria-describedby={
                state.errors.generalComment
                  ? "error-general-comment"
                  : undefined
              }
            />
          </div>
          <FieldError
            id="error-general-comment"
            message={state.errors.generalComment}
          />
        </OwnItem>
      )}

      {preview ? (
        <div
          className={
            "mt-6 flex flex-wrap items-center justify-between gap-4 border-t-2 border-t-rule-ink pt-6 max-md:flex-col-reverse max-md:items-stretch"
          }
        >
          <p className="text-ui-sm text-ink-muted">
            This is a preview. Students see a submit button here.
          </p>
        </div>
      ) : (
        <div
          className={
            "mt-6 flex flex-wrap items-center justify-between gap-4 border-t-2 border-t-rule-ink pt-6 max-md:flex-col-reverse max-md:items-stretch"
          }
        >
          {/*
            `basis-full`, and no `max-w-[44ch]`.

            Two faults, one line. The clamp broke "Submitted. You can keep
            editing until Sunday 13 Sept, 11:59 pm." after about half of it,
            and it was an ad-hoc geometry value of the kind §7 greps for. Even
            unclamped it would still wrap, because it was a flex item beside
            the Save and Submit buttons and lost the width contest on anything
            but a very wide panel — so it takes a row of its own.
          */}
          <p className="basis-full text-ui-sm text-ink-muted">
            {locked ? (
              <>This form is closed, so it can no longer be changed.</>
            ) : lifecycle === "submitted" ? (
              <>
                Submitted
                {lastEditedLabel ? ` · last edited ${lastEditedLabel}` : ""}.
                You can keep editing until {deadlineLabel}.
              </>
            ) : (
              <>
                Closes {deadlineLabel}. Save a draft as often as you like; you
                can still edit after submitting, until the deadline.
              </>
            )}
          </p>
          {!locked && (
            <>
              {lifecycle !== "submitted" && (
                <Button
                  variant="secondary"
                  type="submit"
                  name="intent"
                  value="draft"
                  disabled={pending}
                  className="max-md:w-full"
                >
                  {pending ? "Saving…" : "Save draft"}
                </Button>
              )}
              <Button
                variant="primary"
                type="submit"
                name="intent"
                value={lifecycle === "submitted" ? "edit" : "submit"}
                disabled={pending}
                className="max-md:w-full"
              >
                {pending
                  ? "Working…"
                  : lifecycle === "submitted"
                    ? "Save changes"
                    : "Submit this form"}
              </Button>
            </>
          )}
        </div>
      )}
    </form>
  );
}

