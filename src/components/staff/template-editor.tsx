"use client";

import { useState } from "react";
import { Alert } from "@/components/ui";

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

export interface DraftQuestion {
  key: string;
  prompt: string;
  description: string;
  type: QuestionType;
  required: boolean;
  /** one option label per line */
  optionsText: string;
  scaleMin: number;
  scaleMax: number;
}

/**
 * Not exported on purpose: exports of a "use client" module become client
 * references on the server, so a server component cannot call this to build a
 * default row. The editor seeds its own empty row when given none.
 */
function emptyQuestion(index: number): DraftQuestion {
  return {
    key: `q${index}-${Math.round(index * 7919) % 9973}`,
    prompt: "",
    description: "",
    type: "paragraph",
    required: false,
    optionsText: "",
    scaleMin: 1,
    scaleMax: 5,
  };
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
  note,
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
  note?: string;
}) {
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    initialQuestions.length > 0 ? initialQuestions : [emptyQuestion(0)],
  );
  const [counter, setCounter] = useState(initialQuestions.length + 1);

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

  const payload = JSON.stringify(
    questions.map((q, index) => ({
      prompt: q.prompt.trim(),
      description: q.description.trim() || undefined,
      type: q.type,
      required: q.required,
      displayOrder: index,
      options: NEEDS_OPTIONS.includes(q.type)
        ? q.optionsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((label, optionIndex) => ({
              stableId: slug(label, optionIndex),
              label,
              order: optionIndex,
            }))
        : undefined,
      scale:
        q.type === "linear_scale"
          ? { min: q.scaleMin, max: q.scaleMax, step: 1 }
          : undefined,
    })),
  );

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
              defaultValue={defaultTitle}
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

      {note && (
        <div style={{ margin: "16px 0" }}>
          <Alert variant="info">{note}</Alert>
        </div>
      )}

      <div className="stack-4" style={{ marginTop: 18 }}>
        {questions.map((question, index) => (
          <fieldset className="notice notice--pad" key={question.key}>
            <legend className="label">Question {index + 1}</legend>
            <div className="stack-4">
              <div className="field-row">
                <label htmlFor={`prompt-${question.key}`}>Question text</label>
                <input
                  id={`prompt-${question.key}`}
                  className="field"
                  value={question.prompt}
                  onChange={(e) => update(question.key, { prompt: e.target.value })}
                  placeholder="How was the pace this week?"
                />
              </div>
              <div className="form-grid">
                <div className="field-row">
                  <label htmlFor={`type-${question.key}`}>Answer type</label>
                  <select
                    id={`type-${question.key}`}
                    className="select-field"
                    value={question.type}
                    onChange={(e) =>
                      update(question.key, { type: e.target.value as QuestionType })
                    }
                  >
                    {(Object.keys(TYPE_LABELS) as QuestionType[]).map((type) => (
                      <option key={type} value={type}>
                        {TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-row">
                  <label htmlFor={`desc-${question.key}`}>Helper text</label>
                  <textarea
                    id={`desc-${question.key}`}
                    className="textarea-field"
                    rows={2}
                    value={question.description}
                    onChange={(e) =>
                      update(question.key, { description: e.target.value })
                    }
                    aria-describedby="rich-help"
                  />
                </div>
              </div>

              {NEEDS_OPTIONS.includes(question.type) && (
                <div className="field-row">
                  <label htmlFor={`options-${question.key}`}>
                    Options — one per line
                  </label>
                  <textarea
                    id={`options-${question.key}`}
                    className="textarea-field"
                    rows={3}
                    value={question.optionsText}
                    onChange={(e) =>
                      update(question.key, { optionsText: e.target.value })
                    }
                    placeholder={"Too slow\nJust right\nToo fast"}
                  />
                  <span className="helper-text">At least two options.</span>
                </div>
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
                        update(question.key, { scaleMin: Number(e.target.value) })
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
                        update(question.key, { scaleMax: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="row" style={{ justifyContent: "space-between" }}>
                <label className="choice" style={{ flex: "0 1 auto" }}>
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(e) =>
                      update(question.key, { required: e.target.checked })
                    }
                  />
                  <span>Required</span>
                </label>
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
              </div>
            </div>
          </fieldset>
        ))}
      </div>

      <p className="helper-text" id="rich-help" style={{ marginTop: 14 }}>
        Prompts and helper text support Markdown: <code>**bold**</code>, lists,
        links, fenced code blocks, <code>https</code> images, and LaTeX maths
        between <code>$…$</code> or <code>$$…$$</code>. HTML and scripts are
        removed before students see anything.
      </p>

      <fieldset className="notice notice--pad" style={{ marginTop: "var(--s5)" }}>
        <legend>Student questions and general comment</legend>
        <p className="muted small" style={{ marginTop: 0 }}>
          Each question a student adds becomes its own record you can triage,
          answer and merge independently. The general comment is tracked
          separately and is never published as a Q&amp;A entry.
        </p>
        <div className="form-grid">
          <div className="field-row">
            <label htmlFor="max-student-questions">
              How many questions may a student add?
            </label>
            <input
              id="max-student-questions"
              className="field"
              type="number"
              name="maxStudentQuestions"
              min={0}
              max={10}
              defaultValue={defaultMaxStudentQuestions}
              aria-describedby="max-student-questions-help"
            />
            <span className="helper-text" id="max-student-questions-help">
              0 hides the block entirely.
            </span>
          </div>
          <div className="field-row">
            <label htmlFor="student-question-prompt">
              Question prompt (optional)
            </label>
            <input
              id="student-question-prompt"
              className="field"
              name="studentQuestionPrompt"
              defaultValue={defaultStudentQuestionPrompt}
              placeholder="Ask a question about this week"
            />
          </div>
          <div className="field-row">
            <label htmlFor="general-comment-prompt">
              General comment prompt (optional)
            </label>
            <input
              id="general-comment-prompt"
              className="field"
              name="generalCommentPrompt"
              defaultValue={defaultGeneralCommentPrompt}
              placeholder="Anything else you want us to know?"
            />
          </div>
          <div className="field-row">
            <label htmlFor="general-comment-enabled">General comment</label>
            <select
              id="general-comment-enabled"
              className="select-field"
              name="generalComment"
              defaultValue={
                defaultGeneralCommentEnabled
                  ? defaultGeneralCommentRequired
                    ? "required"
                    : "optional"
                  : "off"
              }
            >
              <option value="optional">Shown, optional</option>
              <option value="required">Shown, required</option>
              <option value="off">Not shown</option>
            </select>
          </div>
        </div>
      </fieldset>

      <div className="form-actions">
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            setQuestions((prev) => [...prev, emptyQuestion(counter)]);
            setCounter((c) => c + 1);
          }}
        >
          Add another question
        </button>
        <button className="button button--primary" type="submit">
          {submitLabel}
        </button>
      </div>
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
