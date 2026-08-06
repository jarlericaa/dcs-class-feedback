"use client";

import { useState, type ReactNode } from "react";
import { Alert, Disclose } from "@/components/ui";
import { IconPlus } from "@/components/ui/icons";
import { TemplatePreview } from "@/components/staff/template-preview";
import type { FormQuestionView } from "@/components/student/weekly-form";

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

  const setOptionLabel = (questionKey: string, optionKey: string, label: string) =>
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
          <div className="field-row">
            <label htmlFor="template-title">Template name</label>
            <input
              id="template-title"
              className="field"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Weekly check-in"
              required
            />
          </div>
          <div className="field-row">
            <label htmlFor="template-description">Description (optional)</label>
            <input
              id="template-description"
              className="field"
              name="description"
              defaultValue={defaultDescription}
            />
          </div>
        </div>
      )}

      {/* The list's own action sits with the list, not at the bottom of the
          whole form competing with save. One label, matching "Add option". */}
      <div className="editor-head">
        <h3 className="editor-head__title">
          Questions
          <span className="editor-head__count">{questions.length}</span>
        </h3>
        <div className="row">
          <button
            className="button button--secondary button--small"
            type="button"
            onClick={() => setPreviewOpen(true)}
          >
            {previewLabel}
          </button>
          {!lockedStructure && (
            <button
              className="button button--secondary button--small"
              type="button"
              onClick={addQuestion}
            >
              <IconPlus size={14} />
              Add question
            </button>
          )}
        </div>
      </div>

      <div className="q-list">
        {questions.map((question, index) => {
          const needsOptions = NEEDS_OPTIONS.includes(question.type);
          const filled = question.options.filter(
            (option) => option.label.trim().length > 0,
          ).length;
          return (
            <fieldset className="q-item" key={question.key}>
              <legend className="q-item__legend">Question {index + 1}</legend>

              <div className="field-row">
                <label htmlFor={`prompt-${question.key}`}>Question text</label>
                <input
                  id={`prompt-${question.key}`}
                  className="field"
                  value={question.prompt}
                  onChange={(e) =>
                    update(question.key, { prompt: e.target.value })
                  }
                  placeholder="How was the pace this week?"
                />
              </div>

              {/* Helper text sits under the prompt it belongs to rather than
                  beside the type select, where a textarea next to a select
                  dragged the two labels out of alignment. */}
              <div className="field-row">
                <label htmlFor={`desc-${question.key}`}>
                  Helper text (optional)
                </label>
                <textarea
                  id={`desc-${question.key}`}
                  className="textarea-field"
                  rows={2}
                  value={question.description}
                  onChange={(e) =>
                    update(question.key, { description: e.target.value })
                  }
                />
              </div>

              <div className="field-row q-item__type">
                <label htmlFor={`type-${question.key}`}>Answer type</label>
                <select
                  id={`type-${question.key}`}
                  className="select-field"
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
                </select>
              </div>

              {needsOptions && (
                <fieldset className="options">
                  <legend className="field-label">Answer choices</legend>
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
                        <input
                          id={`opt-${option.key}`}
                          className="field"
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
                          className="button button--quiet button--small options__remove"
                          type="button"
                          onClick={() => removeOption(question.key, option.key)}
                          disabled={lockedStructure || question.options.length <= 2}
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
                        className="button button--secondary button--small"
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
                  <div className="field-row">
                    <label htmlFor={`min-${question.key}`}>Lowest value</label>
                    <input
                      id={`min-${question.key}`}
                      className="field"
                      type="number"
                      value={question.scaleMin}
                      onChange={(e) =>
                        update(question.key, {
                          scaleMin: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="field-row">
                    <label htmlFor={`max-${question.key}`}>Highest value</label>
                    <input
                      id={`max-${question.key}`}
                      className="field"
                      type="number"
                      value={question.scaleMax}
                      onChange={(e) =>
                        update(question.key, {
                          scaleMax: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="q-item__actions">
                <label className="choice q-item__required">
                  <input
                    type="checkbox"
                    checked={question.required}
                    disabled={lockedStructure}
                    onChange={(e) =>
                      update(question.key, { required: e.target.checked })
                    }
                  />
                  <span>Required</span>
                </label>
                {!lockedStructure && (
                  <span className="row">
                    <button
                      className="button button--quiet button--small"
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                    >
                      Move up
                    </button>
                    <button
                      className="button button--quiet button--small"
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === questions.length - 1}
                    >
                      Move down
                    </button>
                    <button
                      className="button button--danger button--small"
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
      </div>

      {/* Reference material, not instructions: behind a disclosure rather than a
          permanent paragraph on every editor screen. */}
      <div style={{ marginTop: "var(--s4)" }}>
        <Disclose label="Formatting">
          <p className="helper-text">
            Prompts and helper text support Markdown: <code>**bold**</code>,
            lists, links, fenced code blocks, <code>https</code> images, and
            LaTeX maths between <code>$…$</code> or <code>$$…$$</code>. HTML and
            scripts are removed before students see anything.
          </p>
        </Disclose>
      </div>

      <fieldset
        className="q-item"
        style={{
          marginTop: "var(--s5)",
          display: hideStudentSection ? "none" : undefined,
        }}
      >
        <legend className="q-item__legend">Student additions</legend>
        {/* One fact, and it is the one that bears on the decision: what a
            student writes here can be answered for the whole class. How staff
            triage it internally is not the teacher's choice on this screen. */}
        <p className="helper-text" style={{ marginBottom: "var(--s3)" }}>
          A question a student adds can be answered privately or rewritten and
          answered for the whole class. A general comment never is.
        </p>
        <div className="form-grid">
          <div className="field-row">
            <label htmlFor="max-student-questions">Questions a student may add</label>
            <input
              id="max-student-questions"
              className="field"
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
          </div>
          <div className="field-row">
            <label htmlFor="general-comment-enabled">General comment</label>
            <select
              id="general-comment-enabled"
              className="select-field"
              name="generalComment"
              value={generalComment}
              onChange={(event) => setGeneralComment(event.target.value)}
            >
              <option value="optional">Shown, optional</option>
              <option value="required">Shown, required</option>
              <option value="off">Not shown</option>
            </select>
          </div>
          <div className="field-row">
            <label htmlFor="student-question-prompt">
              Question prompt (optional)
            </label>
            <input
              id="student-question-prompt"
              className="field"
              name="studentQuestionPrompt"
              value={studentQuestionPrompt}
              onChange={(event) => setStudentQuestionPrompt(event.target.value)}
              placeholder="Ask a question about this week"
            />
          </div>
          <div className="field-row">
            <label htmlFor="general-comment-prompt">
              Comment prompt (optional)
            </label>
            <input
              id="general-comment-prompt"
              className="field"
              name="generalCommentPrompt"
              value={generalCommentPrompt}
              onChange={(event) => setGeneralCommentPrompt(event.target.value)}
              placeholder="Anything else you want us to know?"
            />
          </div>
        </div>
      </fieldset>

      {lockedStructure && (
        <div style={{ marginTop: "var(--s5)" }}>
          <Alert variant="warning" title="The questions are locked">
            {lockedNote ??
              "Someone has already answered this form. You can still fix wording; adding, removing, reordering or retyping a question would invalidate the answers already given."}
          </Alert>
        </div>
      )}

      {versionNote && (
        <div style={{ marginTop: "var(--s5)" }}>
          <Alert variant="info">{versionNote}</Alert>
        </div>
      )}

      <div className="form-actions" style={{ marginTop: "var(--s5)" }}>
        {extraActions}
        <button
          className="button button--secondary"
          type="button"
          onClick={() => setPreviewOpen(true)}
        >
          {previewLabel}
        </button>
        <button className="button button--primary" type="submit">
          {submitLabel}
        </button>
      </div>

      {/* Mounted only while open, so closing it discards the preview's own
          answer state without touching a single value in the editor. */}
      {previewOpen && (
        <TemplatePreview
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          questions={previewQuestions}
          templateName={title}
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
