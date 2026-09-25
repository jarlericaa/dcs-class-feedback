"use client";

import { SubmitButton } from "@/components/ui/submit-button";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui";
import { InfoTip } from "@/components/ui/info-tip";
import { RequiredMark } from "@/components/ui/required-mark";
import { IconPlus } from "@/components/ui/icons";
import { TemplatePreview } from "@/components/staff/template-preview";
import type { FormQuestionView } from "@/components/student/weekly-form";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  Choice,
  Field,
  FieldLabel,
  FieldRow,
  Select,
  Textarea,
} from "@/components/ui/form";

/**
 * Template question authoring. The editor keeps rows in React state and posts
 * them as JSON in a hidden field, so the server action receives one structured
 * payload rather than having to reconstruct arrays from flat form keys.
 *
 * This is input handling only. What counts as a valid question is decided by
 * questionDefinitionSchema on the server; anything this editor allows can
 * still be rejected there.
 */

export type QuestionType =
  | "short_answer"
  | "paragraph"
  | "multiple_choice"
  | "checkboxes"
  | "dropdown"
  | "linear_scale"
  | "yes_no"
  | "date"
  | "time";

const TYPE_LABELS: Record<QuestionType, string> = {
  short_answer: "Short answer",
  paragraph: "Paragraph",
  multiple_choice: "Multiple choice (one)",
  checkboxes: "Checkboxes (many)",
  dropdown: "Dropdown",
  linear_scale: "Linear scale",
  yes_no: "Yes / No",
  date: "Date",
  time: "Time",
};

/**
 * One question in the list, and — the point of this — WHICH ONE you are editing.
 *
 * The separation problem (§10.4.6) was solved once with alternating ground plus
 * a numbered chip, and the owner's verdict on 2026-09-11 was that it is still
 * not enough: on a long form you can see that the rows differ without seeing
 * which row your cursor is in. Alternating stripes cannot tell you that, because
 * they say something about a question's POSITION, not its state.
 *
 * So the stripe is gone and the ground is uniform, which frees the surface to
 * mean something. Three states, in ascending strength:
 *
 *   rest          `--paper-quiet`, no batten        — one of several
 *   hover         `--paper`, `--accent-edge` batten — the one you are about to touch
 *   focus-within  `--paper`, `--accent` batten      — **the one you are editing**
 *
 * `:focus-within` is the load-bearing one and it is why this works: "which
 * question am I editing" is a question about where the caret is, which hover
 * cannot answer and which no amount of striping can either. `hover:` is scoped
 * `not-focus-within` so pointing at a neighbour never outranks the row that
 * actually has your input — the same precedence bug the rail had (§12.7b).
 *
 * The batten is a `::before`, not a `border-left`, so turning it on shifts
 * nothing sideways. It is 3px and lives inside the card's own edge, which makes
 * it the third sanctioned border variation in DESIGN.md §5 — recorded there
 * rather than smuggled in. Still no shadow anywhere: a question that lifted off
 * the sheet would read as a floating card, which is the specific thing the
 * noticeboard theme rejects.
 */
const QUESTION_CARD = [
  "relative m-0 grid gap-3 min-w-0 px-6 py-4",
  "border-0 border-b border-b-rule-strong last:border-b-0",
  "bg-paper-quiet transition-colors duration-120",
  // the batten, off by default
  "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
  "before:bg-transparent before:transition-colors before:duration-120",
  // about to touch
  "hover:not-focus-within:bg-paper",
  "hover:not-focus-within:before:bg-accent-edge",
  // being edited
  "focus-within:bg-paper focus-within:before:bg-accent",
  // one group, so the chip below can answer the same state
  "group",
].join(" ");

/** The number's row: `float` so the fieldset's grid does not treat it as a cell. */
const QUESTION_LEGEND = [
  "float-left w-full pb-3",
  "text-strip font-bold uppercase text-ink-soft",
].join(" ");

/**
 * The number itself, as a chip rather than a whispered label — it was 11px
 * muted uppercase, the same treatment as every other eyebrow on the page, so it
 * marked no boundary at all. On focus it takes the accent, which gives the
 * active card a second channel besides its ground and batten: three, so the
 * state survives grayscale (DESIGN.md §9).
 */
const QUESTION_CHIP = [
  "inline-block rounded-stamp border border-rule-strong bg-paper",
  "px-2 py-0.5 tabular-nums transition-colors duration-120",
  "group-focus-within:border-accent group-focus-within:bg-accent-wash",
  "group-focus-within:text-accent-deep",
].join(" ");

const NEEDS_OPTIONS: QuestionType[] = [
  "multiple_choice",
  "checkboxes",
  "dropdown",
];

/**
 * One answer choice while it is being edited.
 *
 * `stableId` is the important field. Answers store `optionIds`, and exports join
 * on them, so an option that already exists must keep its id when its label is
 * corrected. The previous editor derived the id from the label on every save and
 * dropped ids entirely when loading a template, which silently re-identified
 * every option a teacher touched. `key` is React's; it never reaches the server.
 */
export interface DraftOption {
  key: string;
  /** absent for an option added in this session */
  stableId?: string;
  label: string;
}

export interface DraftQuestion {
  key: string;
  /**
   * Carried through the editor so a question keeps its identity across an edit.
   * Answers and exports join on it, and the per-occurrence editor uses it to tell
   * "this question, reworded" from "a new question". Absent for a row the reader
   * added in this session.
   */
  stableKey?: string;
  prompt: string;
  description: string;
  type: QuestionType;
  required: boolean;
  options: DraftOption[];
  scaleMin: number;
  scaleMax: number;
}

/**
 * Keys for rows the reader creates AFTER mount.
 *
 * This counter must never produce a key that appears in server-rendered HTML.
 * The module lives for the whole process on the server, so its counter keeps
 * climbing across requests while a fresh client starts at zero — which is
 * exactly the hydration mismatch this split avoids. Anything rendered during
 * SSR uses a key derived from its index instead.
 */
let seq = 0;
const nextKey = (prefix: string) => `${prefix}-new-${(seq += 1)}`;

/**
 * Not exported on purpose: exports of a "use client" module become client
 * references on the server, so a server component cannot call this to build a
 * default row. The editor seeds its own empty row when given none.
 *
 * `index` keeps the seeded key deterministic, so the server and the client agree
 * on the `id`/`htmlFor` pair it produces.
 */
function emptyQuestion(index: number): DraftQuestion {
  return {
    key: `q-${index}`,
    prompt: "",
    description: "",
    type: "paragraph",
    required: false,
    options: [],
    scaleMin: 1,
    scaleMax: 5,
  };
}

/** Two blank rows, because a choice question needs at least two to be valid. */
function seedOptions(questionKey: string): DraftOption[] {
  return [
    { key: `${questionKey}-o0`, label: "" },
    { key: `${questionKey}-o1`, label: "" },
  ];
}

export function TemplateEditor({
  initialQuestions,
  submitLabel,
  showTitleFields = true,
  defaultMaxStudentQuestions = 1,
  defaultStudentQuestionPrompt = "",
  defaultGeneralCommentEnabled = true,
  defaultGeneralCommentPrompt = "",
  defaultGeneralCommentRequired = false,
  defaultTitle = "",
  defaultDescription = "",
  versionNote,
  lockedStructure = false,
  lockedNote,
  hideStudentSection = false,
  previewLabel = "Preview form",
  extraActions,
  cancelHref,
  cancelLabel = "Cancel form",
}: {
  initialQuestions: DraftQuestion[];
  submitLabel: string;
  showTitleFields?: boolean;
  defaultMaxStudentQuestions?: number;
  defaultStudentQuestionPrompt?: string;
  defaultGeneralCommentEnabled?: boolean;
  defaultGeneralCommentPrompt?: string;
  defaultGeneralCommentRequired?: boolean;
  defaultTitle?: string;
  defaultDescription?: string;
  /** shown beside the save button, where the rule actually applies */
  versionNote?: string;
  /**
   * Someone has already answered this form, so structural change is refused
   * server-side (D4). The controls that would make one are removed rather than
   * left to fail: add, remove, reorder, answer type, required, and choices.
   * Wording stays editable, because that is what the policy allows.
   */
  lockedStructure?: boolean;
  /** why the structure is locked, in the reader's terms */
  lockedNote?: string;
  /** the per-occurrence editor inherits these settings and cannot change them */
  hideStudentSection?: boolean;
  previewLabel?: string;
  /** e.g. a "Reset to the base form" control, placed beside save */
  extraActions?: ReactNode;
  /**
   * Where "cancel" goes. Rendered next to save rather than as a stray link
   * under the form, so leaving and committing are the same decision in the
   * same place. `extraActions` stays the far-left slot for destructive things.
   */
  cancelHref?: string;
  cancelLabel?: string;
}) {
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    initialQuestions.length > 0 ? initialQuestions : [emptyQuestion(0)],
  );
  const [previewOpen, setPreviewOpen] = useState(false);

  // The student-additions settings are mirrored into state only so the preview
  // can reflect them. They still post as ordinary named form fields.
  const [maxStudentQuestions, setMaxStudentQuestions] = useState(
    String(defaultMaxStudentQuestions),
  );
  const [studentQuestionPrompt, setStudentQuestionPrompt] = useState(
    defaultStudentQuestionPrompt,
  );
  const [generalCommentPrompt, setGeneralCommentPrompt] = useState(
    defaultGeneralCommentPrompt,
  );
  const [generalComment, setGeneralComment] = useState(
    defaultGeneralCommentEnabled
      ? defaultGeneralCommentRequired
        ? "required"
        : "optional"
      : "off",
  );
  const [title, setTitle] = useState(defaultTitle);

  const update = (key: string, patch: Partial<DraftQuestion>) =>
    setQuestions((prev) =>
      prev.map((q) => (q.key === key ? { ...q, ...patch } : q)),
    );

  const move = (index: number, delta: number) =>
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  /** Switching INTO a choice type needs rows to type into straight away. */
  const changeType = (question: DraftQuestion, type: QuestionType) =>
    update(question.key, {
      type,
      options:
        NEEDS_OPTIONS.includes(type) && question.options.length === 0
          ? seedOptions(question.key)
          : question.options,
    });

  const setOptionLabel = (
    questionKey: string,
    optionKey: string,
    label: string,
  ) =>
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === questionKey
          ? {
              ...q,
              options: q.options.map((o) =>
                o.key === optionKey ? { ...o, label } : o,
              ),
            }
          : q,
      ),
    );

  const addOption = (questionKey: string) =>
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === questionKey
          ? { ...q, options: [...q.options, { key: nextKey("o"), label: "" }] }
          : q,
      ),
    );

  const removeOption = (questionKey: string, optionKey: string) =>
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === questionKey
          ? { ...q, options: q.options.filter((o) => o.key !== optionKey) }
          : q,
      ),
    );

  // Post-mount only, so the incrementing key never reaches server HTML.
  const addQuestion = () =>
    setQuestions((prev) => [
      ...prev,
      { ...emptyQuestion(prev.length), key: nextKey("q") },
    ]);

  /**
   * The server payload. An existing option keeps its `stableId`; a new one gets
   * one derived from its label, and order comes from position in the list.
   */
  const serializedQuestions = questions.map((q, index) => ({
    ...(q.stableKey ? { stableKey: q.stableKey } : {}),
    prompt: q.prompt.trim(),
    description: q.description.trim() || undefined,
    type: q.type,
    required: q.required,
    displayOrder: index,
    options: NEEDS_OPTIONS.includes(q.type)
      ? q.options
          .map((option, optionIndex) => ({
            stableId: option.stableId ?? slug(option.label, optionIndex),
            label: option.label.trim(),
            order: optionIndex,
          }))
          .filter((option) => option.label.length > 0)
      : undefined,
    scale:
      q.type === "linear_scale"
        ? { min: q.scaleMin, max: q.scaleMax, step: 1 }
        : undefined,
  }));
  const payload = JSON.stringify(serializedQuestions);

  /** The draft as the student form reads it. Ids are local to this render. */
  const previewQuestions: FormQuestionView[] = questions.map((q, index) => ({
    id: `preview-${index}`,
    prompt: q.prompt.trim() || `Question ${index + 1}`,
    description: q.description.trim() || null,
    type: q.type,
    required: q.required,
    options: NEEDS_OPTIONS.includes(q.type)
      ? q.options
          .filter((option) => option.label.trim().length > 0)
          .map((option, optionIndex) => ({
            stableId: option.stableId ?? `preview-option-${optionIndex}`,
            label: option.label.trim(),
          }))
      : [],
    scale:
      q.type === "linear_scale"
        ? { min: q.scaleMin, max: q.scaleMax, step: 1 }
        : null,
  }));

  return (
    <>
      <input type="hidden" name="questions" value={payload} />

      {showTitleFields && (
        <div className="form-grid">
          <FieldRow
            label={
              <>
                Template name <RequiredMark />
              </>
            }
            htmlFor="template-title"
          >
            <Field
              id="template-title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Weekly check-in"
              required
            />
          </FieldRow>
          <FieldRow
            label="Description (optional)"
            htmlFor="template-description"
          >
            <Field
              id="template-description"
              name="description"
              defaultValue={defaultDescription}
            />
          </FieldRow>
        </div>
      )}

      {/*
        Reference material, one fact per line, each with its own (i) — the
        owner's call (§10.4.8.1, 2026-09-11), replacing two `Disclose`
        dropdowns.

        Why it reads better as a line plus an icon: a collapsed dropdown in the
        middle of a form looks like something you have to decide about. These
        two are things you may want to LOOK UP — what markup a prompt accepts,
        what saving an edit does to forms already sent — so the fact stays
        visible as a sentence and only the detail is tucked away.

        They stay ABOVE the question list, which is where they were: both
        answer a question you have before you start writing, not after.
        Formatting used to sit below the list, where you found it only once you
        had already typed a prompt the wrong way.
      */}
      {/* The margin is conditional because the gap above it is: with title
          fields, this list follows them and needs separating; without them it
          is the first thing in its section, and `FormSection`'s own gap has
          already spaced it. A fixed `mt-4` double-spaced the new-form page. */}
      <ul className={cn("grid gap-tight", showTitleFields && "mt-4")}>
        <li className="flex items-center gap-2 text-ui-sm text-ink-soft">
          Prompts and helper text support Markdown and LaTeX maths.
          <InfoTip label="Formatting">
            <p>
              <code>**bold**</code>, lists, links, fenced code blocks,{" "}
              <code>https</code> images, and maths between <code>$…$</code> or{" "}
              <code>$$…$$</code>. HTML and scripts are removed before students
              see anything.
            </p>
          </InfoTip>
        </li>
        {versionNote && (
          <li className="flex items-center gap-2 text-ui-sm text-ink-soft">
            Editing this form later creates a new version.
            <InfoTip label="Versions">
              <p>{versionNote}</p>
            </InfoTip>
          </li>
        )}
      </ul>

      <div className="editor-head">
        <h3 className="editor-head__title">
          Questions
          <span className="editor-head__count">{questions.length}</span>
        </h3>
      </div>

      <div className="rounded-panel border border-rule bg-paper">
        {questions.map((question, index) => {
          const needsOptions = NEEDS_OPTIONS.includes(question.type);
          const filled = question.options.filter(
            (option) => option.label.trim().length > 0,
          ).length;
          return (
            <fieldset className={QUESTION_CARD} key={question.key}>
              {/* "Q3", not "Question 3": short enough to read as a marker in
                  the gutter, and the span is what carries the chip. */}
              <legend className={QUESTION_LEGEND}>
                <span className={QUESTION_CHIP}>Q{index + 1}</span>
              </legend>

              <FieldRow
                label="Question text"
                htmlFor={`prompt-${question.key}`}
              >
                <Field
                  id={`prompt-${question.key}`}
                  value={question.prompt}
                  onChange={(e) =>
                    update(question.key, { prompt: e.target.value })
                  }
                  placeholder="How was the pace this week?"
                />
              </FieldRow>

              {/* Helper text sits under the prompt it belongs to rather than
                  beside the type select, where a textarea next to a select
                  dragged the two labels out of alignment. */}
              <FieldRow
                label="Helper text (optional)"
                htmlFor={`desc-${question.key}`}
              >
                <Textarea
                  id={`desc-${question.key}`}
                  rows={2}
                  value={question.description}
                  onChange={(e) =>
                    update(question.key, { description: e.target.value })
                  }
                />
              </FieldRow>

              <FieldRow
                label="Answer type"
                htmlFor={`type-${question.key}`}
                className="max-w-[280px]"
              >
                <Select
                  id={`type-${question.key}`}
                  value={question.type}
                  disabled={lockedStructure}
                  onChange={(e) =>
                    changeType(question, e.target.value as QuestionType)
                  }
                >
                  {(Object.keys(TYPE_LABELS) as QuestionType[]).map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </FieldRow>

              {needsOptions && (
                <fieldset className="options">
                  <FieldLabel>Answer choices</FieldLabel>
                  <ol className="options__list">
                    {question.options.map((option, optionIndex) => (
                      <li className="options__row" key={option.key}>
                        <span className="options__number" aria-hidden="true">
                          {optionIndex + 1}
                        </span>
                        <label
                          className="visually-hidden"
                          htmlFor={`opt-${option.key}`}
                        >
                          Choice {optionIndex + 1}
                        </label>
                        <Field
                          id={`opt-${option.key}`}
                          value={option.label}
                          onChange={(e) =>
                            setOptionLabel(
                              question.key,
                              option.key,
                              e.target.value,
                            )
                          }
                          placeholder={
                            optionIndex === 0
                              ? "Too slow"
                              : optionIndex === 1
                                ? "Just right"
                                : "Another choice"
                          }
                        />
                        <button
                          className={buttonClass({
                            variant: "quiet",
                            size: "small",
                            className: "options__remove",
                          })}
                          type="button"
                          onClick={() => removeOption(question.key, option.key)}
                          disabled={
                            lockedStructure || question.options.length <= 2
                          }
                          aria-label={`Remove choice ${optionIndex + 1}`}
                          title={
                            question.options.length <= 2
                              ? "A choice question needs at least two choices"
                              : undefined
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ol>
                  <div className="options__foot">
                    {!lockedStructure && (
                      <button
                        className={buttonClass({
                          variant: "secondary",
                          size: "small",
                        })}
                        type="button"
                        onClick={() => addOption(question.key)}
                      >
                        <IconPlus size={14} />
                        Add option
                      </button>
                    )}
                    {/* Inline, and only once it is actually wrong — the server
                        rejects this too, so this is the early warning. */}
                    {filled < 2 && (
                      <span className="field-error" role="status">
                        Fill in at least two choices.
                      </span>
                    )}
                  </div>
                </fieldset>
              )}

              {question.type === "linear_scale" && (
                <div className="form-grid">
                  <FieldRow
                    label="Lowest value"
                    htmlFor={`min-${question.key}`}
                  >
                    <Field
                      id={`min-${question.key}`}
                      type="number"
                      value={question.scaleMin}
                      onChange={(e) =>
                        update(question.key, {
                          scaleMin: Number(e.target.value),
                        })
                      }
                    />
                  </FieldRow>
                  <FieldRow
                    label="Highest value"
                    htmlFor={`max-${question.key}`}
                  >
                    <Field
                      id={`max-${question.key}`}
                      type="number"
                      value={question.scaleMax}
                      onChange={(e) =>
                        update(question.key, {
                          scaleMax: Number(e.target.value),
                        })
                      }
                    />
                  </FieldRow>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
                <Choice
                  // was `.q-item__required` — it does not stretch to fill the
                  // action row like the controls beside it (§3.2).
                  className="flex-[0_1_auto]"
                  type="checkbox"
                  checked={question.required}
                  disabled={lockedStructure}
                  onChange={(e) =>
                    update(question.key, { required: e.target.checked })
                  }
                >
                  Required
                </Choice>
                {!lockedStructure && (
                  <span className="row">
                    <button
                      className={buttonClass({
                        variant: "quiet",
                        size: "small",
                      })}
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                    >
                      Move up
                    </button>
                    <button
                      className={buttonClass({
                        variant: "quiet",
                        size: "small",
                      })}
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === questions.length - 1}
                    >
                      Move down
                    </button>
                    <button
                      className={buttonClass({
                        variant: "danger",
                        size: "small",
                      })}
                      type="button"
                      onClick={() =>
                        setQuestions((prev) =>
                          prev.length === 1
                            ? prev
                            : prev.filter((q) => q.key !== question.key),
                        )
                      }
                      disabled={questions.length === 1}
                    >
                      Remove
                    </button>
                  </span>
                )}
              </div>
            </fieldset>
          );
        })}

        {/* The list's own action, at the END of the list. It still belongs to
            the list rather than to the bottom of the form, where it would
            compete with save - but adding from the HEAD meant scrolling up
            past every question you had just written, then back down to fill
            the new one in. Inside the frame so it reads as the list's last
            row. One label, matching "Add option". */}
        {!lockedStructure && (
          /* The list's own action, as its last row. No `border-top`: the
             question above it is no longer `:last-child`, so that item's own
             bottom border is the separator and a second one would double it. */
          <div className="flex p-3">
            <button
              className={buttonClass({ variant: "secondary", size: "small" })}
              type="button"
              onClick={addQuestion}
            >
              <IconPlus size={14} />
              Add question
            </button>
          </div>
        )}
      </div>

      {/* Standing alone rather than inside the list, so it keeps its own frame
          and takes no hover or active state — there is nothing to tell it apart
          from. */}
      <fieldset
        className={cn(
          "m-0 mt-6 grid gap-3 rounded-panel border border-rule px-6 py-4",
          hideStudentSection && "hidden",
        )}
      >
        <legend className={QUESTION_LEGEND}>Student additions</legend>
        {/* One fact, and it is the one that bears on the decision: what a
            student writes here can be answered for the whole class. How staff
            triage it internally is not the teacher's choice on this screen. */}
        <p className="helper-text mb-3">
          A question a student adds can be answered privately or rewritten and
          answered for the whole class. A general comment never is.
        </p>
        <div className="form-grid">
          <FieldRow
            label="Questions a student may add"
            htmlFor="max-student-questions"
          >
            <Field
              id="max-student-questions"
              type="number"
              name="maxStudentQuestions"
              min={0}
              max={10}
              value={maxStudentQuestions}
              onChange={(event) => setMaxStudentQuestions(event.target.value)}
              aria-describedby="max-student-questions-help"
            />
            <span className="helper-text" id="max-student-questions-help">
              Set 0 to hide the block.
            </span>
          </FieldRow>
          <FieldRow label="General comment" htmlFor="general-comment-enabled">
            <Select
              id="general-comment-enabled"
              name="generalComment"
              value={generalComment}
              onChange={(event) => setGeneralComment(event.target.value)}
            >
              <option value="optional">Shown, optional</option>
              <option value="required">Shown, required</option>
              <option value="off">Not shown</option>
            </Select>
          </FieldRow>
          <FieldRow
            label="Question prompt (optional)"
            htmlFor="student-question-prompt"
          >
            <Field
              id="student-question-prompt"
              name="studentQuestionPrompt"
              value={studentQuestionPrompt}
              onChange={(event) => setStudentQuestionPrompt(event.target.value)}
              placeholder="Ask a question about this week"
            />
          </FieldRow>
          <FieldRow
            label="Comment prompt (optional)"
            htmlFor="general-comment-prompt"
          >
            <Field
              id="general-comment-prompt"
              name="generalCommentPrompt"
              value={generalCommentPrompt}
              onChange={(event) => setGeneralCommentPrompt(event.target.value)}
              placeholder="Anything else you want us to know?"
            />
          </FieldRow>
        </div>
      </fieldset>

      {lockedStructure && (
        <div className="mt-6">
          <Alert variant="warning" title="The questions are locked">
            {lockedNote ??
              "Someone has already answered this form. You can still fix wording; adding, removing, reordering or retyping a question would invalidate the answers already given."}
          </Alert>
        </div>
      )}

      {/*
        TWO groups, so `.form-actions`' `space-between` has something to
        separate: leaving is on the left, committing is on the right (owner,
        2026-09-11). All three used to sit in ONE `.row`, so the container had a
        single child, space-between had nothing to distribute, and Cancel ended
        up shoulder-to-shoulder with Save — the two opposite outcomes of the
        page, a few pixels apart.

        DESIGN.md §7a still holds: one primary per view. Save is primary,
        Preview is secondary, Cancel is `quiet`.
      */}
      <div className="form-actions mt-6">
        <div className="row">
          {extraActions}
          {cancelHref && (
            <Link
              className={buttonClass({ variant: "quiet" })}
              href={cancelHref}
            >
              {cancelLabel}
            </Link>
          )}
        </div>
        <div className="row">
          <button
            className={buttonClass({ variant: "secondary" })}
            type="button"
            onClick={() => setPreviewOpen(true)}
          >
            {previewLabel}
          </button>
          <SubmitButton variant="primary" pendingLabel="Saving…">
            {submitLabel}
          </SubmitButton>
        </div>
      </div>

      {/* Mounted only while open, so closing it discards the preview's own
          answer state without touching a single value in the editor. */}
      {previewOpen && (
        <TemplatePreview
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          questions={previewQuestions}
          config={{
            maxStudentQuestions: Number.parseInt(maxStudentQuestions, 10) || 0,
            studentQuestionPrompt: studentQuestionPrompt.trim() || null,
            generalCommentEnabled: generalComment !== "off",
            generalCommentPrompt: generalCommentPrompt.trim() || null,
            generalCommentRequired: generalComment === "required",
          }}
        />
      )}
    </>
  );
}

/** Stable-ish option id derived from the label; uniqueness comes from index. */
function slug(label: string, index: number): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "option"}-${index}`;
}
