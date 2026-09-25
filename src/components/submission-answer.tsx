import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { LongText } from "@/components/ui/long-text";
import { Stamp } from "@/components/ui/status";
import { PreRenderedRichText } from "@/components/rich-text-client";
import { IconStar } from "@/components/ui/icons";

type ScalePresentation = "bars" | "stars";

/** The student-facing subset of a snapshotted question and its answer. */
export interface SubmissionAnswer {
  type: string;
  required: boolean;
  answered: boolean;
  value: unknown;
  freeText: string | null;
}

export interface SubmissionAnswerQuestion extends SubmissionAnswer {
  questionId: string;
  prompt: string;
  description: string | null;
  options: unknown;
  scale: unknown;
}

export type RenderedSubmissionQuestions = Map<
  string,
  { prompt: string; description: string }
>;

function scaleOf(question: SubmissionAnswer & { scale?: unknown }) {
  const scale = question.scale as { min?: number; max?: number } | null;
  const min = scale?.min ?? 1;
  const max = scale?.max ?? 5;
  return { min, max };
}

function chosenValues(
  answer: SubmissionAnswer,
): { key: string; label: string }[] {
  const value = (answer.value ?? {}) as {
    optionIds?: string[];
    optionLabels?: string[];
    scaleValue?: number;
    boolValue?: boolean;
    dateValue?: string;
    timeValue?: string;
  };
  if (value.optionIds?.length) {
    return value.optionIds.map((id, index) => ({
      key: id,
      label: value.optionLabels?.[index] ?? id,
    }));
  }
  if (value.optionLabels?.length) {
    return value.optionLabels.map((label) => ({ key: label, label }));
  }
  if (value.boolValue !== undefined) {
    return [
      { key: String(value.boolValue), label: value.boolValue ? "Yes" : "No" },
    ];
  }
  if (value.scaleValue !== undefined) {
    return [{ key: String(value.scaleValue), label: String(value.scaleValue) }];
  }
  const plain = value.dateValue ?? value.timeValue;
  return plain ? [{ key: plain, label: plain }] : [];
}

/**
 * The canonical read-only rendering for one submitted answer.
 *
 * Teacher response detail and student submission detail both use this so a
 * choice, scale, or authored text answer does not drift between roles.
 */
export function SubmittedAnswer({
  question,
  presentation = "bars",
}: {
  question: SubmissionAnswer & { options?: unknown; scale?: unknown };
  presentation?: ScalePresentation;
}) {
  if (!question.answered) {
    return (
      <p className="font-sans text-ui-sm italic text-ink-muted">
        {question.required
          ? "Left blank, though the form required it."
          : "The student left this optional question blank."}
      </p>
    );
  }

  if (question.type === "short_answer" || question.type === "paragraph") {
    return (
      <div className="w-full rounded-control border border-rule bg-paper-quiet px-3 py-2">
        <LongText surface="quiet" text={question.freeText ?? ""} />
      </div>
    );
  }

  const value = (question.value ?? {}) as { scaleValue?: number };
  if (question.type === "linear_scale" && value.scaleValue !== undefined) {
    const scale = scaleOf(question);
    return presentation === "stars" ? (
      <ScaleStars max={scale.max} min={scale.min} value={value.scaleValue} />
    ) : (
      <ScaleAnswer max={scale.max} min={scale.min} value={value.scaleValue} />
    );
  }

  const chosen = chosenValues(question);
  if (chosen.length === 0) return <AnswerChip>Answered</AnswerChip>;
  return (
    <p className="flex max-w-measure flex-wrap gap-2">
      {chosen.map((choice) => (
        <AnswerChip key={choice.key}>{choice.label}</AnswerChip>
      ))}
    </p>
  );
}

/** Numbered question block shared by teacher response detail and student history. */
export function SubmissionAnswerBlock({
  question,
  rendered,
  index,
  presentation = "bars",
}: {
  question: SubmissionAnswerQuestion;
  rendered: RenderedSubmissionQuestions;
  index: number;
  presentation?: ScalePresentation;
}) {
  const meta = rendered.get(question.questionId);
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-rule py-3 first:border-t-0 first:pt-0">
      <span
        aria-hidden="true"
        className="font-sans text-meta font-bold tabular-nums text-ink-faint"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div
            aria-level={3}
            className="max-w-measure font-document text-prompt font-bold text-ink"
            role="heading"
          >
            {meta?.prompt ? (
              <PreRenderedRichText
                className="rich-text--inline"
                html={meta.prompt}
              />
            ) : (
              question.prompt
            )}
          </div>
          {!question.answered && <Stamp tone="neutral">Not answered</Stamp>}
        </div>
        {meta?.description && (
          <div className="max-w-measure text-meta text-ink-muted">
            <PreRenderedRichText html={meta.description} />
          </div>
        )}
        <SubmittedAnswer presentation={presentation} question={question} />
      </div>
    </li>
  );
}

function AnswerChip({ children }: { children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-control items-center rounded-control px-3 py-1.5",
        "border border-rule bg-paper-quiet",
        "font-document text-doc-dense text-ink",
      )}
    >
      {children}
    </span>
  );
}

export function ScaleAnswer({
  min,
  max,
  value,
}: {
  min: number;
  max: number;
  value: number;
}) {
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <p className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <span
        aria-hidden="true"
        className="grid min-w-0 max-w-[22rem] flex-1 gap-1"
      >
        <span className="flex gap-1">
          {steps.map((step) => (
            <span
              className={cn(
                "h-5 min-w-0 flex-1 rounded-[2px] border",
                step <= value
                  ? "border-accent bg-accent"
                  : "border-rule-strong bg-paper",
              )}
              key={step}
            />
          ))}
        </span>
        <span className="flex gap-1">
          {steps.map((step) => (
            <span
              className="min-w-0 flex-1 text-center font-sans text-meta tabular-nums text-ink-muted"
              key={step}
            >
              {step}
            </span>
          ))}
        </span>
      </span>
      <span className="font-sans text-ui font-semibold tabular-nums text-ink">
        {value} / {max}
      </span>
    </p>
  );
}

/**
 * Compact read-only rating for the instructor submission detail. The value is
 * carried by the accessible name, while the stars keep the response quick to
 * scan without repeating the number in a second visual treatment.
 */
function ScaleStars({
  min,
  max,
  value,
}: {
  min: number;
  max: number;
  value: number;
}) {
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div
      aria-label={`${value} out of ${max}`}
      className="flex flex-wrap items-center gap-1"
      role="img"
    >
      {steps.map((step) => (
        <IconStar
          aria-hidden="true"
          className={step <= value ? "text-accent" : "text-rule-ink"}
          fill={step <= value ? "currentColor" : "none"}
          key={step}
          size={24}
        />
      ))}
    </div>
  );
}
