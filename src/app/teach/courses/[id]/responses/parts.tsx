import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Category, Stamp } from "@/components/ui/status";
import { Tag, TagList } from "@/components/ui/tag";
import { IconChevron } from "@/components/ui/icons";
import { PreRenderedRichText } from "@/components/rich-text-client";
import { LongText } from "@/components/ui/long-text";
import { formatDateTime, initials } from "@/lib/datetime";

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

/** One student's answer to one question, with only what the view may show. */
export interface QuestionEntry {
  responseId: string;
  /** null when the reader lacks `view_student_identities` */
  who: string | null;
  sectionTitle: string | null;
  at: Date | null;
  timezone: string;
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
  | { kind: "prose"; entries: QuestionEntry[]; responded: number; skipped: number };

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
 * the selected state independently of the fill, which is 1.1:1 against its
 * neighbour by design — a mode switch must not look like the page's primary
 * action (DESIGN.md §7a, "one primary per view").
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
      className="inline-flex overflow-hidden rounded-control border border-control-edge"
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
        "inline-flex min-h-control-compact items-center px-3.5",
        "font-sans text-ui-sm font-semibold",
        "border-l border-control-edge first:border-l-0",
        "transition-colors duration-120 active:not-disabled:duration-0",
        current
          ? "bg-board-deep text-ink"
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

/** The sheet every region of this page is drawn on. `.notice`'s geometry. */
export function Sheet({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-panel border border-rule bg-paper p-6", className)}
    >
      {children}
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
  /** already-lowercased free-text narrowing from the page's one search box */
  search?: string;
}) {
  const meta = rendered.get(question.questionId);
  const responded = aggregate.responded;
  return (
    <Sheet>
      <div className="grid gap-2">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-sans text-strip uppercase text-ink-muted">
            Question {index + 1} of {total}
          </span>
          <Tag>{questionTypeLabel(question)}</Tag>
        </p>
        {/* Level 2: each question sheet is a top-level region of this page,
            and the only heading above it is the page title. A level-3 here
            skipped a level, which is what a screen-reader user navigating by
            heading actually notices. */}
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

      <div className="mt-5">
        {aggregate.kind === "choice" ? (
          <Distribution buckets={aggregate.buckets} total={responded} />
        ) : aggregate.kind === "scale" ? (
          <ScaleSummary aggregate={aggregate} />
        ) : (
          <ProseAnswers entries={aggregate.entries} search={search} />
        )}
      </div>
    </Sheet>
  );
}

/**
 * A horizontal distribution: the option, how far it got, and the two numbers.
 *
 * The bar is `aria-hidden` and the count and share are text beside it, because
 * a chart that hides its numbers behind a length is not an accessible chart
 * (DESIGN.md §12). It takes `.chart__bar`, which is `--rule-ink`: bars are
 * data, not action, so they stay off the accent (DESIGN.md §3, §11.5a).
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
    <ul className="m-0 grid list-none gap-3 p-0">
      {buckets.map((bucket) => {
        const percent = share(bucket.count, total);
        return (
          <li
            className={cn(
              "grid items-center gap-x-4 gap-y-1.5",
              // Narrow: the option and its numbers share a line and the bar
              // takes the one below. Wide: the mockup's three columns.
              "grid-cols-[minmax(0,1fr)_auto]",
              "sm:grid-cols-[minmax(6rem,14rem)_minmax(0,1fr)_auto]",
            )}
            key={bucket.key}
          >
            <span className="min-w-0 font-sans text-ui text-ink">
              {bucket.label}
            </span>
            <span className="order-last col-span-2 sm:order-none sm:col-span-1">
              <svg
                aria-hidden="true"
                className="block h-2.5 w-full bg-board-deep"
                focusable="false"
                preserveAspectRatio="none"
                viewBox="0 0 100 10"
              >
                <rect
                  className="chart__bar"
                  height="10"
                  width={percent}
                  x="0"
                  y="0"
                />
              </svg>
            </span>
            <span className="justify-self-end font-sans text-meta tabular-nums text-ink-muted">
              <span className="font-semibold text-ink">{bucket.count}</span>{" "}
              {percent}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A rating question, read across the week: the average, then where the answers
 * actually sat.
 *
 * The average alone is the number people quote and the one most able to
 * mislead — a flat 3 and a class split between 1 and 5 average the same — so
 * the distribution is not optional beside it.
 */
export function ScaleSummary({
  aggregate,
}: {
  aggregate: Extract<Aggregate, { kind: "scale" }>;
}) {
  const tallest = Math.max(1, ...aggregate.buckets.map((b) => b.count));
  if (aggregate.responded === 0) return <NoAnswersYet />;
  return (
    <div className="grid gap-5">
      <p className="flex items-baseline gap-2">
        {/* A real figure, in the document register the rest of this system
            sets a figure's value in. */}
        <strong className="font-document text-object-title tabular-nums text-ink">
          {aggregate.average.toFixed(1)}
        </strong>
        <span className="font-sans text-ui text-ink-muted">
          average of {aggregate.min}–{aggregate.max}
        </span>
      </p>
      <ul className="m-0 flex list-none items-end gap-2 p-0">
        {aggregate.buckets.map((bucket) => {
          const percent = share(bucket.count, aggregate.responded);
          const height = Math.round((bucket.count / tallest) * 100);
          return (
            <li
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
              key={bucket.key}
            >
              {/* The numbers first, and in text. The column below them is the
                  same fact drawn; it is `aria-hidden` because a bar is not
                  something to read out (DESIGN.md §12). */}
              <span className="font-sans text-meta tabular-nums text-ink-muted">
                {bucket.count} ({percent}%)
              </span>
              <svg
                aria-hidden="true"
                className="block h-14 w-full bg-board-deep"
                focusable="false"
                preserveAspectRatio="none"
                viewBox="0 0 10 100"
              >
                <rect
                  className="chart__bar"
                  height={height}
                  width="10"
                  x="0"
                  y={100 - height}
                />
              </svg>
              <span className="font-sans text-ui-sm font-semibold tabular-nums text-ink">
                {bucket.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Written answers, under the one prompt that asked for them.
 *
 * The prompt is printed once by `QuestionBlock` above; repeating it per student
 * is what made the old feed unreadable for this question. Each answer keeps the
 * document register and its own quiet provenance line.
 */
export function ProseAnswers({
  entries,
  search,
  limit = 6,
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
    <div className="grid gap-4">
      <ul className="m-0 grid list-none gap-4 p-0">
        {shown.map((entry) => (
          <ProseAnswer entry={entry} key={entry.responseId} />
        ))}
      </ul>
      {rest.length > 0 && (
        /* A native disclosure, so the rest of a thirty-answer question is one
           click away and reachable before hydration. Inset, because a bordered
           box inside this sheet would be a box within a box. */
        <details className="disclose disclose--inset">
          <summary>
            <IconChevron className="disclose__mark" size={15} />
            Show the other {rest.length}{" "}
            {rest.length === 1 ? "answer" : "answers"}
          </summary>
          <div className="disclose__body">
            <ul className="m-0 grid list-none gap-4 p-0">
              {rest.map((entry) => (
                <ProseAnswer entry={entry} key={entry.responseId} />
              ))}
            </ul>
          </div>
        </details>
      )}
    </div>
  );
}

function ProseAnswer({ entry }: { entry: QuestionEntry }) {
  return (
    <li className="grid gap-1">
      <LongText text={entry.answer.freeText ?? ""} />
      {/* Quiet and secondary: whose answer it is matters less here than what it
          says, which is the whole point of reading by question. */}
      <TagList
        items={[
          entry.who,
          entry.sectionTitle,
          entry.at ? formatDateTime(entry.at, entry.timezone) : null,
        ]}
      />
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
 * One student-originated question, as a row of the list at the foot of the
 * by-question view.
 *
 * The whole row is the link, and the grid is why the rows stay in rhythm: the
 * category flair sits in a column of its own with a floor and a ceiling, so a
 * long label cannot push the question text sideways and a short one cannot let
 * it drift back — which is the specific failure a row of free-floating chips
 * produces. Every row is the same height for the same reason: one padding
 * value, one alignment, no per-row exceptions.
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
  meta: (string | null)[];
  stamp: ReactNode;
}) {
  return (
    <li>
      <Link
        className={cn(
          "grid items-center gap-x-4 gap-y-2 px-4 py-3",
          "grid-cols-[auto_minmax(0,1fr)_auto]",
          "sm:grid-cols-[9.5rem_minmax(0,1fr)_auto_auto]",
          "text-left no-underline",
          "transition-colors duration-120 hover:bg-paper-quiet",
          "active:not-disabled:duration-0",
        )}
        href={href}
      >
        <span className="col-start-1 row-start-1">
          <Tag className="whitespace-nowrap">
            <Category value={category} />
          </Tag>
        </span>
        <span className="col-span-2 row-start-2 grid min-w-0 gap-0.5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          {/* The student's own words, in the document register, dense — this is
              a list row, not the reading surface. The reading surface is the
              submission this links to. */}
          <span className="truncate font-document text-doc-dense text-ink">
            {text}
          </span>
          <TagList items={meta} />
        </span>
        {/*
          Right-aligned, and that is what makes a column of these line up.

          Every row is its own grid — they have to be, because the row is a
          link and `display: contents` on a link destroys its hit area and its
          focus ring — so an `auto` column sizes to ITS OWN row's content and
          two rows' stamps started at different x. Measured: 1236 and 1191 on
          the same list. The chevron beside it is a fixed 16px, so aligning the
          stamp's trailing edge instead is stable no matter how long the label
          is, and it stays stable when a row carries two stamps.
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
                ? "border-control-edge bg-board-deep text-ink"
                : "border-rule bg-paper text-ink-muted hover:bg-paper-quiet hover:text-ink",
            )}
            href={option.href}
            key={option.key}
          >
            {option.label}
            <span className="font-sans text-meta tabular-nums text-ink-muted">
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
  when,
  stamp,
}: {
  href: string;
  who: string;
  mark: string;
  tags: (string | null)[];
  when: string;
  stamp: ReactNode;
}) {
  return (
    <li className="border-t border-rule first:border-t-0">
      <Link
        className={cn(
          "grid items-center gap-x-4 gap-y-2 px-4 py-3 no-underline",
          "grid-cols-[34px_minmax(0,1fr)_auto]",
          "sm:grid-cols-[34px_minmax(0,1fr)_auto_auto_auto]",
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
        <span className="col-start-2 row-start-1 grid min-w-0 gap-0.5">
          <span className="truncate font-sans text-ui font-bold text-ink">
            {who}
          </span>
          <TagList items={tags} />
        </span>
        <span className="col-span-2 col-start-2 row-start-2 font-sans text-meta tabular-nums text-ink-muted sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:justify-self-end">
          {when}
        </span>
        {/* Trailing edge, against the fixed chevron column — see
            `StudentQuestionRow` for why an `auto` column cannot align across
            rows that are each their own grid. */}
        <span className="col-start-3 row-start-1 justify-self-end sm:col-start-4">
          {stamp}
        </span>
        <IconChevron
          aria-hidden="true"
          className="col-start-3 row-start-1 hidden shrink-0 justify-self-end text-ink-faint sm:col-start-5 sm:block"
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
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-rule py-4 first:border-t-0 first:pt-0">
      <span
        aria-hidden="true"
        className="font-sans text-meta font-bold tabular-nums text-ink-faint"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* Level 3: the `Form answers` strip label above these is an h2
              (`StripLabel` renders one), so this is the next level down. */}
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
    return <LongText text={question.freeText ?? ""} />;
  }

  const scale = question.type === "linear_scale" ? scaleOf(question) : null;
  const value = (question.value ?? {}) as { scaleValue?: number };
  if (scale && value.scaleValue !== undefined) {
    return <ScaleAnswer max={scale.max} min={scale.min} value={value.scaleValue} />;
  }

  const chosen = chosenValues(question);
  if (chosen.length === 0) {
    return <AnswerChip>Answered</AnswerChip>;
  }
  return (
    <p className="flex flex-wrap gap-2">
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
        "font-document text-doc-staff text-ink",
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
    <p className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <span aria-hidden="true" className="grid min-w-0 flex-1 gap-1">
        <span className="flex gap-1">
          {steps.map((step) => (
            <span
              className={cn(
                "h-6 min-w-0 flex-1 rounded-control border",
                /* The checked-choice treatment from `form.tsx` — an accent edge
                   over `--accent-wash` — because that is what this is: the
                   option the student picked, shown back. It is one of the six
                   jobs the accent is allowed (DESIGN.md §3), and it is NOT the
                   solid accent, which would make a read-only reading look like
                   a control. */
                step <= value
                  ? "border-accent bg-accent-wash"
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

/** Who this submission is from, and when it arrived. */
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
    <Sheet className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
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
          {/* Metadata, deliberately secondary: the fact that matters on this
              screen is what the student wrote, not the minute it landed. */}
          <p className="font-sans text-meta tabular-nums text-ink-muted">
            Submitted {submitted}
          </p>
        </div>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </Sheet>
  );
}
