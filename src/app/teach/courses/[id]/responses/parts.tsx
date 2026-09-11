import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Stamp } from "@/components/ui/status";
import { Tag, TagList } from "@/components/ui/tag";
import { IconChevron, IconForward, IconSearch } from "@/components/ui/icons";
import { PreRenderedRichText } from "@/components/rich-text-client";
import { LongText } from "@/components/ui/long-text";
import { categoryShortLabel } from "@/lib/threads";
import { initials } from "@/lib/datetime";

/**
 * The Responses tab's two axes through one week of submissions, and the
 * individual submission behind them.
 *
 * Nothing here talks to the database or decides an authorization question: the
 * page resolves both, and everything below takes already-scoped, already-masked
 * data. A `who` of `null` means the reader does not hold
 * `view_student_identities` and there is no name to render — never a name that
 * has been blanked out further down.
 *
 * **Why a route-local file rather than `components/ui/`.** Every piece of the
 * system this screen needed already existed — `Tag`, `Category`, `Stamp`,
 * `StripLabel`, `Quote`, `Thread`, `Dialog`, `buttonClass`, `LongText`. What is
 * here is the arrangement of them for one screen, which DESIGN-TODO §11.6 is
 * explicit does not earn a shared primitive. The one candidate that would is a
 * segmented control, and §13.3 leaves it as an open owner choice (§11.1), so
 * `ViewSwitch` deliberately stays local and matches `.segment`'s existing
 * recipe rather than founding a second one.
 */

/* ========================================================================== */
/* shared shapes                                                              */
/* ========================================================================== */

/** One question of an occurrence's snapshot, and one student's answer to it. */
export interface AnswerRow {
  questionId: string;
  prompt: string;
  description: string | null;
  type: string;
  required: boolean;
  displayOrder: number;
  /** the authored choice list — `[{ stableId, label }]` */
  options: unknown;
  scale: unknown;
  /** false when the form asked and the student left it blank */
  answered: boolean;
  value: unknown;
  freeText: string | null;
}

/** Prompt and help text, already through the one sanctioned renderer. */
export type RenderedQuestions = Map<
  string,
  { prompt: string; description: string }
>;

/**
 * One student's answer to one question, with only what the view may show.
 *
 * `when` arrives already formatted in the section's own timezone: this file
 * draws, it does not decide what a date means. `who` is carried so a future
 * surface can use it and stays null when the reader lacks
 * `view_student_identities` — the aggregate list deliberately does not print
 * it (see `ProseAnswer`).
 */
export interface QuestionEntry {
  responseId: string;
  /** null when the reader lacks `view_student_identities` */
  who: string | null;
  sectionTitle: string | null;
  /** formatted in the section's timezone, or null when never submitted */
  when: string | null;
  answer: AnswerRow;
}

interface Option {
  stableId?: string;
  label?: string;
}

function optionsOf(question: AnswerRow): Option[] {
  return Array.isArray(question.options) ? (question.options as Option[]) : [];
}

function scaleOf(question: AnswerRow): { min: number; max: number } | null {
  const scale = question.scale as { min?: number; max?: number } | null;
  const min = scale?.min ?? 1;
  const max = scale?.max;
  if (max === undefined || max <= min) return null;
  return { min, max };
}

/**
 * What the question is, said the way a reader would say it.
 *
 * A second copy of `template-editor.tsx`'s `TYPE_LABELS` on purpose: that file
 * is a `"use client"` module, and importing one constant out of it would pull
 * the whole editor into this server component's graph — the exact boundary
 * fault AGENTS.md §13 names. The wording also differs by design: the editor is
 * naming a type you are about to *choose* ("Multiple choice (one)"), this is
 * naming one you are *reading*.
 */
export function questionTypeLabel(question: AnswerRow): string {
  switch (question.type) {
    case "short_answer":
      return "Short answer";
    case "paragraph":
      return "Long answer";
    case "multiple_choice":
      return "Multiple choice";
    case "checkboxes":
      return "Checkboxes";
    case "dropdown":
      return "Dropdown";
    case "linear_scale": {
      const scale = scaleOf(question);
      /* An en dash, because it is a range. The bounds come from the question's
         own scale, so "Scale (1–5)" is a fact about this question rather than
         a guess at the usual one. */
      return scale ? `Scale (${scale.min}–${scale.max})` : "Scale";
    }
    case "yes_no":
      return "Yes / no";
    case "date":
      return "Date";
    case "time":
      return "Time";
    default:
      return "Question";
  }
}

/** The two question types whose answer is prose a person wrote. */
const PROSE_TYPES = new Set(["short_answer", "paragraph"]);

/* ========================================================================== */
/* aggregation — pure                                                          */
/* ========================================================================== */

export interface Bucket {
  key: string;
  label: string;
  count: number;
}

export type Aggregate =
  | { kind: "choice"; buckets: Bucket[]; responded: number; skipped: number }
  | {
      kind: "scale";
      min: number;
      max: number;
      average: number;
      buckets: Bucket[];
      responded: number;
      skipped: number;
    }
  | {
      kind: "prose";
      entries: QuestionEntry[];
      responded: number;
      skipped: number;
    };

/**
 * One question, read across every student who was asked it.
 *
 * Three deliberate choices:
 *
 * 1. **Every authored option gets a row, including the ones nobody picked.** A
 *    distribution assembled only from the answers given cannot tell "no student
 *    chose Too fast" from "the question never offered it", and the second is a
 *    different fact about the week. This is what `options` on the answer row is
 *    carried for.
 * 2. **Percentages are of the students who ANSWERED**, not of the students who
 *    submitted. An optional question half the class skipped would otherwise
 *    report every option at half its real share.
 * 3. **Skipped is counted, never dropped.** A question the form asked and a
 *    student left blank is a fact, and a total that silently excluded it would
 *    not add up against the submission count beside it.
 */
export function aggregateQuestion(
  question: AnswerRow,
  entries: QuestionEntry[],
): Aggregate {
  const answered = entries.filter((entry) => entry.answer.answered);
  const skipped = entries.length - answered.length;

  if (PROSE_TYPES.has(question.type)) {
    return {
      kind: "prose",
      entries: answered.filter((entry) => (entry.answer.freeText ?? "").trim()),
      responded: answered.length,
      skipped,
    };
  }

  const scale = question.type === "linear_scale" ? scaleOf(question) : null;
  if (scale) {
    const counts = new Map<number, number>();
    let sum = 0;
    let scored = 0;
    for (const entry of answered) {
      const value = (entry.answer.value ?? {}) as { scaleValue?: number };
      if (value.scaleValue === undefined) continue;
      counts.set(value.scaleValue, (counts.get(value.scaleValue) ?? 0) + 1);
      sum += value.scaleValue;
      scored += 1;
    }
    const buckets: Bucket[] = [];
    for (let point = scale.min; point <= scale.max; point += 1) {
      buckets.push({
        key: String(point),
        label: String(point),
        count: counts.get(point) ?? 0,
      });
    }
    return {
      kind: "scale",
      min: scale.min,
      max: scale.max,
      /* One decimal, and rounded here rather than at the point of display, so
         the figure and the distribution beneath it can never disagree. */
      average: scored === 0 ? 0 : Math.round((sum / scored) * 10) / 10,
      buckets,
      responded: scored,
      skipped,
    };
  }

  /* Everything else is categorical: a choice, a checkbox set, a yes/no, a date
     or a time. Its buckets are the authored options where the question has
     them, and the distinct values given where it does not. */
  const counts = new Map<string, { label: string; count: number }>();
  const seed = (key: string, label: string) => {
    if (!counts.has(key)) counts.set(key, { label, count: 0 });
  };
  if (question.type === "yes_no") {
    seed("true", "Yes");
    seed("false", "No");
  }
  const authored = optionsOf(question);
  for (const option of authored) {
    if (option.stableId) seed(option.stableId, option.label ?? option.stableId);
  }

  for (const entry of answered) {
    for (const { key, label } of chosenValues(entry.answer)) {
      seed(key, label);
      const bucket = counts.get(key)!;
      bucket.count += 1;
      /* Where the question HAS an authored option list, that list's label wins:
         an option renamed after a student answered is still the same option
         (answers store `optionIds`), and the current wording is the one to
         print. Only a question with no option list at all — a date, a time —
         takes its label from the answer. */
      if (label && authored.length === 0) bucket.label = label;
    }
  }

  return {
    kind: "choice",
    buckets: [...counts].map(([key, bucket]) => ({ key, ...bucket })),
    responded: answered.length,
    skipped,
  };
}

/** The bucket keys one answer contributes. Checkboxes contribute several. */
function chosenValues(answer: AnswerRow): { key: string; label: string }[] {
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

/** `12` of `28` as a whole percent, and 0 rather than NaN when nobody answered. */
function share(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

/* ========================================================================== */
/* the view switch                                                             */
/* ========================================================================== */

export type ResponsesView = "question" | "submission";

/**
 * Which axis through the week this reader is on.
 *
 * Two links rather than two buttons, because the selection lives in the URL
 * like every other selection in this app (DESIGN.md §7): it is shareable, it
 * survives reload, and it needs no client state. `aria-current="page"` carries
 * the selected state independently of the fill.
 *
 * **`w-fit` and `justify-self-start`, and both are load-bearing.** This shipped
 * as a bare `inline-flex` and drew **1080px** — the entire content column, with
 * a bordered void trailing the two labels. `inline-flex` sets the element's
 * INNER layout; it does not stop a grid item from being stretched by the
 * default `justify-items: stretch` of the container it sits in. `w-fit` makes
 * the box hug its content and `justify-self-start` keeps it at the left edge,
 * so the switch measures its two labels and nothing more at any width. Not a
 * pixel width: the labels are what set it.
 *
 * The selected option takes the accent fill, which is the approved mockup's
 * call and is legal under DESIGN.md §3 — a chosen option is "a checked choice",
 * one of the accent's six jobs. It keeps `--radius-control`; it does not become
 * a pill, and the page's real primary action still lives in the header.
 */
export function ViewSwitch({
  current,
  hrefFor,
}: {
  current: ResponsesView;
  hrefFor: (view: ResponsesView) => string;
}) {
  return (
    <nav
      aria-label="Responses view"
      className={cn(
        "inline-flex w-fit justify-self-start self-start",
        "overflow-hidden rounded-control border border-control-edge",
      )}
    >
      <ViewOption current={current === "question"} href={hrefFor("question")}>
        By question
      </ViewOption>
      <ViewOption
        current={current === "submission"}
        href={hrefFor("submission")}
      >
        By submission
      </ViewOption>
    </nav>
  );
}

function ViewOption({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex min-h-control-compact items-center px-4",
        "font-sans text-ui-sm font-semibold whitespace-nowrap",
        "border-l border-control-edge first:border-l-0",
        "transition-colors duration-120 active:not-disabled:duration-0",
        current
          ? "bg-accent text-on-accent"
          : "bg-paper text-ink-muted hover:bg-paper-quiet hover:text-ink",
      )}
      href={href}
    >
      {children}
    </Link>
  );
}

/* ========================================================================== */
/* by question                                                                 */
/* ========================================================================== */

/**
 * A scope fact that is not a choice — the form's name when a course runs only
 * one of them.
 *
 * It takes the SELECT's geometry, not a label's: same 38px control height, same
 * 6px radius, same paper fill and hairline, same interface type, so it sits in
 * the control cluster as a peer of the week selector rather than as bold text
 * floating beside it. What it deliberately does not take is a caret, a hover or
 * a focus ring — there is nothing to open, and a control that looks clickable
 * and is not is worse than a plain word. It is not greyed out either: the fact
 * is current, it is simply not a decision.
 */
export function ScopeChip({ children }: { children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-control items-center rounded-control",
        "border border-control-edge bg-paper px-control-pad",
        "font-sans text-ui text-ink",
      )}
    >
      {children}
    </span>
  );
}

/**
 * The sheet every region of this page is drawn on. `.notice`'s geometry.
 *
 * `tone` draws a 3px batten down the sheet's left edge — green for a normal
 * region, maroon for the invalidated one. It is the batten DESIGN.md §5
 * sanctions: drawn INSIDE the element's own edge as a `::before`, so switching
 * it on shifts no content and it is not a coloured `border-left` (anti-pattern
 * 7). The approved mockup uses it to tell one region of a submission from the
 * next without giving each its own container.
 */
export function Sheet({
  children,
  className,
  title,
  aside,
  tone,
  flush,
}: {
  children: ReactNode;
  className?: string;
  /** a panel title in the document register, with a hairline under it */
  title?: ReactNode;
  /** sits opposite the title — a stamp, a figure, a count */
  aside?: ReactNode;
  tone?: "accent" | "critical";
  /** the body owns its own padding: a list of rows that rule to the edges */
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-panel border border-rule bg-paper",
        tone &&
          cn(
            "relative before:absolute before:inset-y-0 before:left-0",
            "before:w-[3px] before:rounded-l-panel before:content-['']",
            tone === "accent" ? "before:bg-accent" : "before:bg-red",
          ),
        title === undefined && !flush ? "p-6" : "",
        className,
      )}
    >
      {title !== undefined && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule px-6 py-4">
          <h2 className="min-w-0 font-document text-panel-title font-bold text-ink">
            {title}
          </h2>
          {aside}
        </div>
      )}
      {title === undefined || flush ? (
        children
      ) : (
        <div className="p-6">{children}</div>
      )}
    </section>
  );
}

/**
 * The prompt, in the register the student read it in.
 *
 * A `div` carrying `role="heading"` rather than an `<h3>`, and that is forced
 * rather than chosen: a prompt is staff-authored rich text, `PreRenderedRichText`
 * renders it into a `div` (it must — the sanitizer is `server-only`, see
 * `rich-text-client.tsx`), and a `div` is not phrasing content so it cannot sit
 * inside a heading element. The ARIA form gives a screen reader the same
 * heading, at the same level, with markup that is actually valid.
 *
 * It is Charter because a person wrote it, and it outranks the answers beneath
 * it — `--text-prompt` exists in the ramp for exactly this (DESIGN-TODO 10.6.1).
 */
function QuestionPrompt({
  meta,
  fallback,
  level,
}: {
  meta: { prompt: string } | undefined;
  fallback: string;
  level: number;
}) {
  return (
    <div
      aria-level={level}
      className="max-w-measure font-document text-prompt font-bold text-ink"
      role="heading"
    >
      {meta?.prompt ? (
        <PreRenderedRichText className="rich-text--inline" html={meta.prompt} />
      ) : (
        fallback
      )}
    </div>
  );
}

/**
 * One question, read across the week.
 *
 * The numbering is information, not decoration: it is the order the form put
 * the questions in, which is the order the student answered them and the only
 * thing that ties this block to the same question on a submission's own screen.
 * That is the exception DESIGN.md anti-pattern 12 names.
 *
 * A rating question puts its average in `aside`, opposite the prompt, because
 * that is the one number a reader comes to a rating question for. A long-answer
 * question puts its own search there, because that is the only question type
 * where searching means anything — there is no page-wide search on this view.
 */
export function QuestionBlock({
  question,
  rendered,
  index,
  total,
  aggregate,
  search,
}: {
  question: AnswerRow;
  rendered: RenderedQuestions;
  index: number;
  total: number;
  aggregate: Aggregate;
  /** the long-answer search: its form, and the term already applied */
  search?: { action: string; hidden: [string, string][]; value: string };
}) {
  const meta = rendered.get(question.questionId);
  const responded = aggregate.responded;
  return (
    <Sheet>
      <div
        className={cn(
          // A grid, not `flex-wrap`: wrapping let the prompt shrink to a
          // three-word column on a phone rather than pushing the search onto
          // its own line. One column below `sm`, two above it, and the prompt
          // never competes with the control beside it.
          "grid items-start gap-x-6 gap-y-3",
          "sm:grid-cols-[minmax(0,1fr)_auto]",
        )}
      >
        <div className="grid min-w-0 gap-2">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-sans text-strip uppercase text-ink-muted">
              Question {index + 1} of {total}
            </span>
            <Tag>{questionTypeLabel(question)}</Tag>
          </p>
          {/* Level 2: each question sheet is a top-level region of this page,
              and the only heading above it is the page title. */}
          <QuestionPrompt fallback={question.prompt} level={2} meta={meta} />
          {meta?.description && (
            <div className="max-w-measure text-meta text-ink-muted">
              <PreRenderedRichText html={meta.description} />
            </div>
          )}
          <p className="font-sans text-meta tabular-nums text-ink-muted">
            {responded} {responded === 1 ? "response" : "responses"}
            {aggregate.skipped > 0 && ` · ${aggregate.skipped} skipped`}
          </p>
        </div>

        {aggregate.kind === "scale" && aggregate.responded > 0 && (
          <ScaleFigure aggregate={aggregate} />
        )}
        {aggregate.kind === "prose" && search && (
          <AnswerSearch
            action={search.action}
            hidden={search.hidden}
            questionId={question.questionId}
            value={search.value}
          />
        )}
      </div>

      <div className="mt-4">
        {aggregate.kind === "choice" ? (
          <Distribution buckets={aggregate.buckets} total={responded} />
        ) : aggregate.kind === "scale" ? (
          <ScaleSummary aggregate={aggregate} />
        ) : (
          <ProseAnswers
            entries={aggregate.entries}
            search={search?.value.trim().toLowerCase()}
          />
        )}
      </div>
    </Sheet>
  );
}

/**
 * The one search on this view, and it belongs to the question it narrows.
 *
 * A page-wide `Search` box sat under the week selector at full width and said
 * nothing about what it searched. Written answers are the only thing on a
 * by-question page there is any point searching, so the control lives in that
 * question's own header where its scope is obvious from where it is.
 *
 * A plain GET form carrying the page's other selections as hidden fields, so it
 * works before hydration like every other filter in this app.
 */
function AnswerSearch({
  action,
  hidden,
  questionId,
  value,
}: {
  action: string;
  hidden: [string, string][];
  questionId: string;
  value: string;
}) {
  const id = `q-search-${questionId}`;
  return (
    <form
      action={action}
      className="feedbar__search w-full sm:w-[20rem]"
      method="get"
    >
      {hidden.map(([name, hiddenValue]) => (
        <input key={name} name={name} type="hidden" value={hiddenValue} />
      ))}
      <IconSearch size={15} />
      <label className="visually-hidden" htmlFor={id}>
        Search the written answers to this question
      </label>
      <input
        defaultValue={value}
        id={id}
        name="q"
        placeholder="Search responses…"
        type="search"
      />
      <button className="visually-hidden" type="submit">
        Search
      </button>
    </form>
  );
}

/**
 * A horizontal distribution: the option, how far it got, and the two numbers.
 *
 * **The fill is the accent, and that is a deliberate reversal.** An earlier
 * pass put these on `.chart__bar` (`--rule-ink`) reasoning that bars are data
 * rather than action. The design owner rejected that for this screen: the
 * Responses analytics are the point of the by-question view, and a column of
 * grey bars reads as disabled. The exception is scoped HERE — `.chart__bar`
 * and every other chart in the app are untouched, so this is not a licence to
 * turn the app's data visualisations green.
 *
 * The bar is `aria-hidden` and the count and share are text beside it, because
 * a chart that hides its numbers behind a length is not an accessible chart
 * (DESIGN.md §12). The list is held to a reading measure: a 1080px-wide bar
 * says no more than a 400px one and makes the label impossible to pair with
 * its own number.
 */
export function Distribution({
  buckets,
  total,
}: {
  buckets: Bucket[];
  total: number;
}) {
  if (buckets.length === 0) {
    return <NoAnswersYet />;
  }
  return (
    <ul className="m-0 grid max-w-measure list-none gap-2.5 p-0">
      {buckets.map((bucket) => {
        const percent = share(bucket.count, total);
        return (
          <li
            className={cn(
              "grid items-center gap-x-4 gap-y-1.5",
              // Narrow: the option and its numbers share a line and the bar
              // takes the one below. Wide: the mockup's three columns.
              "grid-cols-[minmax(0,1fr)_auto]",
              "sm:grid-cols-[minmax(5rem,11rem)_minmax(0,1fr)_5.5rem]",
            )}
            key={bucket.key}
          >
            <span className="min-w-0 font-sans text-ui-sm text-ink">
              {bucket.label}
            </span>
            <span className="order-last col-span-2 sm:order-none sm:col-span-1">
              <span className="block h-2.5 w-full rounded-[2px] bg-board-deep">
                <svg
                  aria-hidden="true"
                  className="block h-full w-full"
                  focusable="false"
                  preserveAspectRatio="none"
                  viewBox="0 0 100 10"
                >
                  <rect
                    className="fill-accent"
                    height="10"
                    width={percent}
                    x="0"
                    y="0"
                  />
                </svg>
              </span>
            </span>
            <span className="flex items-baseline justify-end gap-2 font-sans text-meta tabular-nums text-ink-muted">
              <span className="font-semibold text-ink">{bucket.count}</span>
              <span className="w-9 text-right">{percent}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The number a reader comes to a rating question for, opposite the prompt. */
function ScaleFigure({
  aggregate,
}: {
  aggregate: Extract<Aggregate, { kind: "scale" }>;
}) {
  return (
    <p className="shrink-0 text-right">
      <strong className="block font-document text-object-title tabular-nums text-ink">
        {aggregate.average.toFixed(1)} / {aggregate.max}
      </strong>
      <span className="block font-sans text-meta text-ink-muted">
        average rating
      </span>
    </p>
  );
}

/**
 * Where the ratings actually sat.
 *
 * The average above is the number people quote and the one most able to
 * mislead — a flat 3 and a class split between 1 and 5 average the same — so
 * the distribution is not optional beside it.
 *
 * **No track behind the bars.** Each bucket used to sit inside a full-height
 * `--board-deep` rectangle, so a scale where four of five buckets held nothing
 * drew five equal-height columns and the one real answer was told apart only by
 * its colour. That is not a column chart; it is five boxes. The plot area is
 * now transparent, every bar grows from a shared baseline in proportion to the
 * tallest bucket, and a bucket with no answers draws nothing at all — which is
 * the honest picture of "nobody chose this".
 *
 * Columns are `--spacing-scale-cell` wide, the step the system already uses for
 * a scale's cells, rather than stretched across the sheet: five 200px blocks
 * were a wall of colour that said nothing five 58px ones do not.
 */
export function ScaleSummary({
  aggregate,
}: {
  aggregate: Extract<Aggregate, { kind: "scale" }>;
}) {
  const tallest = Math.max(1, ...aggregate.buckets.map((b) => b.count));
  if (aggregate.responded === 0) return <NoAnswersYet />;
  return (
    <ul className="m-0 flex max-w-[26rem] list-none items-end gap-2 p-0">
      {aggregate.buckets.map((bucket) => {
        const percent = share(bucket.count, aggregate.responded);
        const height = Math.round((bucket.count / tallest) * 100);
        return (
          <li
            /* `--spacing-scale-cell` is the ceiling, not the width: five 58px
               columns overflow a 320px phone and wrapped onto a second row,
               which broke the comparison the chart exists for. They share the
               line instead and never wrap. */
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5 sm:max-w-scale-cell"
            key={bucket.key}
          >
            {/* The numbers first, and in text. The column below them is the
                same fact drawn; it is `aria-hidden` because a bar is not
                something to read out (DESIGN.md §12). */}
            <span className="font-sans text-meta tabular-nums text-ink-muted">
              {bucket.count} ({percent}%)
            </span>
            {/* The plot area: transparent, with one hairline for the baseline
                the bars stand on. A zero bucket draws a zero-height rect,
                which is nothing — no box, no colour, no false equivalence
                with the bucket beside it that actually has answers. */}
            <span className="block h-12 w-full border-b border-rule">
              <svg
                aria-hidden="true"
                className="block h-full w-full"
                focusable="false"
                preserveAspectRatio="none"
                viewBox="0 0 10 100"
              >
                <rect
                  className="fill-accent"
                  height={height}
                  width="10"
                  x="0"
                  y={100 - height}
                />
              </svg>
            </span>
            <span className="font-sans text-ui-sm font-semibold tabular-nums text-ink">
              {bucket.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Written answers, under the one prompt that asked for them.
 *
 * The prompt is printed once by `QuestionBlock` above; repeating it per student
 * is what made the old feed unreadable for this question.
 *
 * **No provenance on these rows.** This view answers "what did the class say",
 * and a section and a timestamp beside every line answered a question nobody
 * reading by question is asking — while taking the eye off the words, which
 * are the entire point. Who said it, and when, belong to that student's own
 * submission, which is one click away through the by-submission list. The data
 * is still carried on `QuestionEntry`; it is simply not printed here.
 */
export function ProseAnswers({
  entries,
  search,
  limit = 3,
}: {
  entries: QuestionEntry[];
  search?: string;
  limit?: number;
}) {
  const matching = search
    ? entries.filter((entry) =>
        (entry.answer.freeText ?? "").toLowerCase().includes(search),
      )
    : entries;
  if (matching.length === 0) {
    return (
      <p className="max-w-measure-empty font-sans text-ui-sm text-ink-muted">
        {entries.length === 0
          ? "Nobody has written an answer to this question yet."
          : "No answer to this question matches the search."}
      </p>
    );
  }
  const shown = matching.slice(0, limit);
  const rest = matching.slice(limit);
  return (
    <div className="grid gap-3">
      <ul className="m-0 grid list-none gap-2 p-0">
        {shown.map((entry) => (
          <ProseAnswer entry={entry} key={entry.responseId} />
        ))}
      </ul>
      {rest.length > 0 && (
        /* A native disclosure, so the rest of a thirty-answer question is one
           click away and works before hydration — but drawn as the quiet
           onward control the approved design shows, not as a bordered box
           inside a box. */
        <details className="group">
          <summary
            className={cn(
              "inline-flex cursor-pointer list-none items-center gap-2",
              "font-sans text-ui-sm font-semibold text-accent-deep",
              "[&::-webkit-details-marker]:hidden",
              "hover:underline hover:underline-offset-4",
            )}
          >
            <span className="group-open:hidden">
              View all {matching.length} responses
            </span>
            <span className="hidden group-open:inline">
              Show only the first {limit}
            </span>
            <IconForward
              aria-hidden="true"
              className="shrink-0 transition-transform duration-120 group-open:-rotate-90"
              size={15}
            />
          </summary>
          <ul className="m-0 mt-2 grid list-none gap-2 p-0">
            {rest.map((entry) => (
              <ProseAnswer entry={entry} key={entry.responseId} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * One written answer, as its own contained row.
 *
 * A bordered quiet-paper block rather than divider-separated paragraphs: a run
 * of answers to the same prompt needs to read as a list of separate people's
 * replies, and a hairline between two paragraphs of the same serif did not do
 * that. It carries no quotation marks — the container is the quoting — and no
 * name, section or timestamp, because this view is what the class said and the
 * provenance belongs to the submission behind it.
 */
function ProseAnswer({ entry }: { entry: QuestionEntry }) {
  return (
    <li>
      <blockquote
        className={cn(
          "m-0 max-w-measure rounded-control border border-rule bg-paper-quiet",
          "px-4 py-2.5 font-document text-doc-dense text-ink",
        )}
      >
        {entry.answer.freeText}
      </blockquote>
    </li>
  );
}

function NoAnswersYet() {
  return (
    <p className="max-w-measure-empty font-sans text-ui-sm text-ink-muted">
      Nobody has answered this question yet.
    </p>
  );
}

/* ========================================================================== */
/* student questions and feedback                                              */
/* ========================================================================== */

/** What a student-originated item is still owed, in one word. */
export function ItemStamp({
  published,
  declined,
  isComment,
  settled,
}: {
  published: boolean;
  declined: boolean;
  isComment: boolean;
  settled: boolean;
}) {
  if (published) return <Stamp tone="green">Published</Stamp>;
  if (declined) return <Stamp tone="neutral">Not being answered</Stamp>;
  if (isComment) return <Stamp tone="neutral">No reply needed</Stamp>;
  if (settled) return <Stamp tone="green">Answered</Stamp>;
  return <Stamp tone="amber">Needs reply</Stamp>;
}

/**
 * A question's category, as restrained flair.
 *
 * **Coloured, by owner decision on 2026-09-12**, and this is the one place in
 * the app where a category is. `Category` in `status.tsx` — the word plus a
 * drawn silhouette — is untouched and still governs everywhere else; DESIGN.md
 * §3 records the exception rather than being quietly contradicted by it.
 *
 * What the colour is allowed to be is fenced. Four washed families assigned by
 * MEANING (`--color-cat-*`, declared once in `globals.css`), each with its own
 * deep ink at 7:1 or better, so the WORD still carries the meaning and the hue
 * only makes it findable in a column — it survives grayscale exactly as the
 * neutral chip it replaced did. Not eight hues, not one per value as they
 * arrive, and no literal in this file.
 *
 * A category is still not a status: it says what the question is ABOUT, while
 * the stamp beside it says what the question still NEEDS. They keep different
 * shapes (`--radius-stamp` with no mark here, a marked `Stamp` there) and
 * different vocabularies for that reason.
 *
 * It hugs its own content by default. A LIST passes `w-full` so that every
 * flair fills the same fixed column and CONTENT and LOGISTICS put the question
 * text at exactly the same x — the width belongs to the row's grid, not to the
 * flair, or the flair stretches to whatever container it lands in next.
 */
/**
 * The four category families, by MEANING.
 *
 * A map rather than a cycle: `content` is always the blue one, whatever order
 * the questions arrive in, so the colour is a fact about the category and not
 * about its position in a list. An unknown slug falls to the neutral family
 * rather than inventing a hue — a category nobody has named should not arrive
 * wearing a colour nobody chose.
 */
const CATEGORY_TONE: Record<string, string> = {
  content: "border-cat-content-edge bg-cat-content-wash text-cat-content",
  logistics: "border-amber-edge bg-amber-wash text-amber-deep",
  assessment:
    "border-cat-assessment-edge bg-cat-assessment-wash text-cat-assessment",
  misc: "border-cat-other-edge bg-cat-other-wash text-cat-other",
};
const CATEGORY_FALLBACK =
  "border-cat-other-edge bg-cat-other-wash text-cat-other";

export function CategoryFlair({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center justify-center px-2",
        "rounded-stamp border",
        "font-sans text-strip uppercase",
        CATEGORY_TONE[value ?? ""] ?? CATEGORY_FALLBACK,
        className,
      )}
    >
      {categoryShortLabel(value)}
    </span>
  );
}

/**
 * One student-originated question, as a row of the list at the foot of the
 * by-question view.
 *
 * The whole row is the link, and the grid is why the rows stay in rhythm: the
 * flair sits in a fixed column, the stamp is aligned on its trailing edge
 * against the fixed chevron, and one padding value governs every row. A longer
 * category or a longer state cannot move anything in the row above or below it.
 */
export function StudentQuestionRow({
  href,
  category,
  text,
  meta,
  stamp,
}: {
  href: string;
  category: string | null;
  text: string;
  /** already-formatted quiet facts, at most two */
  meta: (string | null)[];
  stamp: ReactNode;
}) {
  const line = meta.filter(Boolean).join(" · ");
  return (
    <li className="border-t border-rule first:border-t-0">
      <Link
        className={cn(
          "grid items-center gap-x-4 gap-y-2 px-5 py-3",
          "grid-cols-[auto_minmax(0,1fr)_auto]",
          "sm:grid-cols-[6.5rem_minmax(0,1fr)_auto_auto]",
          "text-left no-underline",
          "transition-colors duration-120 hover:bg-paper-quiet",
          "active:not-disabled:duration-0",
        )}
        href={href}
      >
        <span className="col-start-1 row-start-1 grid">
          <CategoryFlair className="w-full" value={category} />
        </span>
        <span className="col-span-2 row-start-2 grid min-w-0 gap-0.5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          {/* The student's own words, in the document register, dense — this is
              a list row, not the reading surface. The reading surface is the
              submission this links to. */}
          <span className="truncate font-document text-doc-dense text-ink">
            {text}
          </span>
          {line && (
            <span className="truncate font-sans text-meta tabular-nums text-ink-muted">
              {line}
            </span>
          )}
        </span>
        {/*
          Right-aligned, and that is what makes a column of these line up.
          Every row is its own grid — they have to be, because the row is a
          link and `display: contents` on a link destroys its hit area and its
          focus ring — so an `auto` column sizes to ITS OWN row's content and
          two rows' stamps started 45px apart. The chevron beside it is a fixed
          16px, so aligning the stamp's trailing edge is stable however long
          the label is.
        */}
        <span className="col-start-2 row-start-1 justify-self-end sm:col-start-3">
          {stamp}
        </span>
        <IconChevron
          aria-hidden="true"
          className="col-start-3 row-start-1 shrink-0 justify-self-end text-ink-faint sm:col-start-4"
          size={16}
        />
      </Link>
    </li>
  );
}

/**
 * The task filters over that list.
 *
 * Links, not a select: there are three of them, each carries its own count, and
 * the count IS the summary line that used to sit above the feed saying
 * "N responses shown". A filter that states how much work it holds is worth
 * more than a sentence that states how much is on screen.
 */
export function FilterChips({
  options,
  current,
  label,
}: {
  options: { key: string; label: string; count: number; href: string }[];
  current: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2">
      {options.map((option) => {
        const active = option.key === current;
        return (
          <Link
            aria-current={active ? "true" : undefined}
            className={cn(
              "inline-flex min-h-control-sm items-center gap-2 px-2.5",
              "rounded-control border font-sans text-ui-sm font-semibold",
              "transition-colors duration-120 active:not-disabled:duration-0",
              active
                ? "border-accent bg-accent text-on-accent"
                : "border-rule bg-paper text-ink-muted hover:bg-paper-quiet hover:text-ink",
            )}
            href={option.href}
            key={option.key}
          >
            {option.label}
            <span
              className={cn(
                "font-sans text-meta tabular-nums",
                active ? "text-on-accent/80" : "text-ink-muted",
              )}
            >
              {option.count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/* ========================================================================== */
/* by submission                                                               */
/* ========================================================================== */

/**
 * One submission, as one row of the list — and the whole row is the link.
 *
 * There is exactly one interactive element in it, which is what makes the whole
 * row safely clickable: a destructive control nested inside a link is both
 * invalid markup and a way to invalidate somebody's week by missing a chevron
 * by four pixels. Invalidation lives on the submission's own screen.
 */
export function SubmissionRow({
  href,
  who,
  mark,
  tags,
  date,
  time,
  stamp,
}: {
  href: string;
  who: string;
  mark: string;
  tags: (string | null)[];
  date: string;
  time: string;
  stamp: ReactNode;
}) {
  return (
    <li className="border-t border-rule first:border-t-0">
      <Link
        className={cn(
          "grid items-center gap-x-4 gap-y-2 px-5 py-3 no-underline",
          "grid-cols-[auto_minmax(0,1fr)_auto]",
          "sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]",
          "transition-colors duration-120 hover:bg-paper-quiet",
          "active:not-disabled:duration-0",
        )}
        href={href}
      >
        <span
          aria-hidden="true"
          className={cn(
            "col-start-1 row-start-1 grid size-control-compact place-items-center",
            "rounded-control bg-board-deep",
            "font-sans text-meta font-bold text-ink-soft",
          )}
        >
          {mark}
        </span>
        <span className="col-start-2 row-start-1 grid min-w-0 gap-1">
          <span className="truncate font-sans text-ui font-bold text-ink">
            {who}
          </span>
          {/* Week, section and state on one line of compact flair — the three
              facts a reader scans a list of forty submissions for. */}
          <span className="flex flex-wrap items-center gap-tight">
            <TagList items={tags} />
            {stamp}
          </span>
        </span>
        {/* The date over the time, so a column of these compares day by day
            without the hour getting in the way. */}
        <span className="col-span-2 col-start-2 row-start-2 font-sans text-meta tabular-nums text-ink-muted sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:justify-self-end sm:text-right">
          <span className="block whitespace-nowrap">{date}</span>
          <span className="block whitespace-nowrap">{time}</span>
        </span>
        <IconChevron
          aria-hidden="true"
          className="col-start-3 row-start-1 shrink-0 justify-self-end text-ink-faint sm:col-start-4"
          size={16}
        />
      </Link>
    </li>
  );
}

/* ========================================================================== */
/* one submission                                                              */
/* ========================================================================== */

/**
 * One fixed form answer, under the question that asked for it.
 *
 * Numbered, ruled, and identically spaced — the three things the old feed did
 * not do, which is why one question ran into the next. The number is the form's
 * own order (DESIGN.md anti-pattern 12's exception: the order is information),
 * and it is the same order the by-question view counts in.
 */
export function AnswerBlock({
  question,
  rendered,
  index,
}: {
  question: AnswerRow;
  rendered: RenderedQuestions;
  index: number;
}) {
  const meta = rendered.get(question.questionId);
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-rule py-4 first:border-t-0 first:pt-0">
      <span
        aria-hidden="true"
        className="font-sans text-meta font-bold tabular-nums text-ink-faint"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* Level 3: the sheet's own `Form answers` title is an h2, so this is
              the next level down. */}
          <QuestionPrompt fallback={question.prompt} level={3} meta={meta} />
          {!question.answered && <Stamp tone="neutral">Not answered</Stamp>}
        </div>
        {meta?.description && (
          <div className="max-w-measure text-meta text-ink-muted">
            <PreRenderedRichText html={meta.description} />
          </div>
        )}
        <SubmittedAnswer question={question} />
      </div>
    </li>
  );
}

function SubmittedAnswer({ question }: { question: AnswerRow }) {
  if (!question.answered) {
    return (
      <p className="font-sans text-ui-sm italic text-ink-muted">
        {question.required
          ? "Left blank, though the form required it."
          : "The student left this optional question blank."}
      </p>
    );
  }

  if (PROSE_TYPES.has(question.type)) {
    /* Read-only, and it has to LOOK read-only.

       This was a rounded, hairline-bordered box — which is the recipe for a
       textarea in this system, so a teacher's eye read the student's answer as
       a field they could type into. It is the authored-text treatment instead:
       quiet paper, the 1px quote rule and indent `.post__words` already
       carries, no radius and no control border. `LongText` still clamps an
       essay so one answer cannot bury the two below it. */
    return (
      <div className="max-w-measure bg-paper-quiet py-2 pr-3">
        <LongText text={question.freeText ?? ""} />
      </div>
    );
  }

  const scale = question.type === "linear_scale" ? scaleOf(question) : null;
  const value = (question.value ?? {}) as { scaleValue?: number };
  if (scale && value.scaleValue !== undefined) {
    return (
      <ScaleAnswer max={scale.max} min={scale.min} value={value.scaleValue} />
    );
  }

  const chosen = chosenValues(question);
  if (chosen.length === 0) {
    return <AnswerChip>Answered</AnswerChip>;
  }
  return (
    <p className="flex max-w-measure flex-wrap gap-2">
      {chosen.map((choice) => (
        <AnswerChip key={choice.key}>{choice.label}</AnswerChip>
      ))}
    </p>
  );
}

/**
 * The value the student gave, drawn as the field they gave it in.
 *
 * A quiet filled field rather than a stamp: this is an ANSWER, and a stamp
 * would read as a status about the submission. Nothing in this system carries
 * status without a tone and a shape, so nothing that is not a status may borrow
 * the shape (DESIGN.md §9).
 */
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

/**
 * One student's rating, read-only.
 *
 * Every segment UP TO the value is filled, not just the segment at it. "4 out
 * of 5" is a quantity, and a single lit box four places along reads as "the
 * fourth option", which is a different claim — the same reason the compact
 * meter in the old feed filled a run rather than a cell.
 *
 * The segments are `aria-hidden` and the value is stated in words beside them:
 * a row of boxes is not something to read out.
 */
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
        /* Capped rather than stretched to the measure: the number reads as the
           segments' value, and a column of whitespace between the two made it
           float free of the thing it describes. */
        className="grid min-w-0 max-w-[22rem] flex-1 gap-1"
      >
        <span className="flex gap-1">
          {steps.map((step) => (
            <span
              className={cn(
                "h-6 min-w-0 flex-1 rounded-[3px] border",
                /* Every segment UP TO the value, in the solid accent — the
                   approved treatment. A single lit box four places along reads
                   as "the fourth option"; a filled run reads as "four out of
                   five", which is what the number actually means. */
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
 * The staff answer itself — the thing the Instructor response section is for.
 *
 * Set one step up from `.thread__body` in the document register and given room
 * above it, because everything else in that message (a mark, a name, a
 * relative time, a stamp) is machine text ABOUT the answer, and it was reading
 * at the same weight as the answer.
 */
export function AnswerBody({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 max-w-measure font-document text-doc-staff text-ink">
      {children}
    </p>
  );
}

/**
 * Who this submission is from, when it arrived, and the one exceptional action.
 *
 * Three zones, left to right: identity, the timestamp held quiet under its own
 * label, and the action. The action slot is state-dependent and carries exactly
 * one control — `Invalidate submission` or `Revert invalidation`, never both.
 */
export function SubmissionHeader({
  who,
  tags,
  submitted,
  action,
}: {
  who: string;
  tags: (string | null)[];
  submitted: string;
  action?: ReactNode;
}) {
  return (
    <Sheet className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 p-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-control-compact shrink-0 place-items-center",
            "rounded-control bg-board-deep",
            "font-sans text-meta font-bold text-ink-soft",
          )}
        >
          {initials(who)}
        </span>
        <div className="grid min-w-0 gap-1.5">
          <h2 className="min-w-0 font-document text-panel-title font-bold text-ink">
            {who}
          </h2>
          <TagList items={tags} />
        </div>
      </div>
      <p className="shrink-0 font-sans text-meta tabular-nums text-ink-muted">
        <span className="block text-ink-soft">Submitted</span>
        <span className="block whitespace-nowrap">{submitted}</span>
      </p>
      {action && (
        /* Wraps, and does not `shrink-0`. Two controls side by side — `Mark as
           unread` beside `Invalidate submission` — are wider than a 320px
           phone's content column, and an unshrinkable row of them pushed the
           page into horizontal scroll. */
        <div className="flex flex-wrap items-center gap-2">{action}</div>
      )}
    </Sheet>
  );
}
