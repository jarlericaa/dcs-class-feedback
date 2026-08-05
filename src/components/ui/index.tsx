import Link from "next/link";
import type { ReactNode } from "react";
import {
  CategoryMark,
  IconBack,
  IconCheck,
  IconChevron,
  IconError,
  IconForward,
  IconInfo,
  IconWarning,
  StampMark,
} from "./icons";
import { categoryShape, categoryShortLabel } from "@/lib/threads";

/**
 * Shared presentational vocabulary. These components receive already-authorized
 * data and emit markup only — no data access, no authorization, no domain rules.
 *
 * Status is always a word AND a shape AND a tone, never a tone alone
 * (DESIGN.md §9). The shape is drawn, not a Unicode glyph.
 */

export type Tone = "green" | "amber" | "red" | "neutral";

const TONE_SHAPE = {
  green: "square",
  amber: "triangle",
  red: "diamond",
  neutral: "hollow",
} as const;

/** Status as a stamp: bordered, squared off, and readable in grayscale. */
export function Stamp({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span className={`stamp stamp--${tone}`}>
      <StampMark shape={TONE_SHAPE[tone]} />
      {children}
    </span>
  );
}

const ALERT_ICON = {
  error: IconError,
  success: IconCheck,
  warning: IconWarning,
  info: IconInfo,
} as const;

export function Alert({
  variant,
  title,
  children,
}: {
  variant: "error" | "success" | "warning" | "info";
  title?: string;
  children: ReactNode;
}) {
  const Glyph = ALERT_ICON[variant];
  return (
    <div
      className={`alert alert--${variant}`}
      role={variant === "error" ? "alert" : "status"}
    >
      <Glyph className="alert__icon" size={16} />
      <div className="alert__body">
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

/**
 * A notice: one flat sheet on the board. `title` is optional so a notice can
 * be a plain bounded region; when present it is rendered in the document
 * register with a hairline under it.
 */
export function Notice({
  title,
  titleId,
  description,
  aside,
  footer,
  roomy,
  flush,
  as: Tag = "section",
  children,
}: {
  title?: ReactNode;
  titleId?: string;
  description?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  /** student surfaces breathe more than staff surfaces */
  roomy?: boolean;
  /** the body owns its own padding (lists, tables) */
  flush?: boolean;
  as?: "section" | "article" | "div";
  children?: ReactNode;
}) {
  return (
    <Tag
      className={`notice${roomy ? " notice--roomy" : ""}`}
      aria-labelledby={titleId}
    >
      {(title || aside) && (
        <div className="notice__head">
          <div style={{ minWidth: 0 }}>
            {title && (
              <h2 className="panel-title" id={titleId}>
                {title}
              </h2>
            )}
            {description && <p>{description}</p>}
          </div>
          {aside && <div className="row">{aside}</div>}
        </div>
      )}
      {children !== undefined && (
        <div className={`notice__body${flush ? " notice__body--flush" : ""}`}>
          {children}
        </div>
      )}
      {footer && <div className="notice__foot">{footer}</div>}
    </Tag>
  );
}

/**
 * A batten: the printed strip label that divides one region of the board from
 * the next. This replaces the eyebrow/kicker pattern, which is banned.
 */
export function StripLabel({
  children,
  count,
  id,
}: {
  children: ReactNode;
  count?: ReactNode;
  id?: string;
}) {
  return (
    <h2 className="strip" id={id}>
      <span>{children}</span>
      {count !== undefined && <span className="strip__count">{count}</span>}
    </h2>
  );
}

/**
 * An occasional form, closed by default.
 *
 * A create-or-configure form that is always expanded pushes the page's actual
 * content out of reach, so every one of them lives behind this instead. The
 * summary carries the action's name, which is also how the reader finds it —
 * `<details>`, so it works with JavaScript off and its open state is real.
 */
export function Disclose({
  label,
  inset,
  id,
  children,
}: {
  label: string;
  /** sits inside a notice as one of its rows rather than as its own box */
  inset?: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <details className={`disclose${inset ? " disclose--inset" : ""}`} id={id}>
      <summary>
        <IconChevron className="disclose__mark" size={15} />
        {label}
      </summary>
      <div className="disclose__body">{children}</div>
    </details>
  );
}

/**
 * Nothing is here yet. An empty state states what is missing and carries the
 * action that fills it — an empty state that only describes the next step makes
 * the reader go and find it.
 */
export function EmptyState({
  title,
  children,
  action,
  primary,
}: {
  title: string;
  children?: ReactNode;
  action?: { href: string; label: string };
  /** the action IS this page's main action, so it looks like it */
  primary?: boolean;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && (
        <Link
          className={`button button--${primary ? "primary" : "secondary"}`}
          href={action.href}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/**
 * The standard "you cannot see this" body. The server has already denied
 * access; this never explains why, never names what is inside, and never
 * distinguishes "does not exist" from "not yours".
 */
export function AccessDenied({ what = "this page" }: { what?: string }) {
  return (
    <EmptyState title="You do not have access">
      Your account is not authorized to view {what}. If you think that is a
      mistake, ask the teacher who manages this class section.
    </EmptyState>
  );
}

/**
 * Metadata as separate elements, never a string built with middle dots.
 *
 * `DCS-101 · AY2026-1 · Asia/Manila` reads as generated telemetry: three
 * unrelated facts welded into one sentence, so none of them can be scanned and
 * none can be styled or dropped independently. Each fact is its own element
 * here, the separator is presentational, and a fact with no value simply is not
 * rendered rather than leaving a stray dot behind.
 */
export function MetaList({
  items,
  className,
}: {
  items: (string | null | undefined | false)[];
  className?: string;
}) {
  const facts = items.filter((item): item is string => !!item && item !== "");
  if (facts.length === 0) return null;
  return (
    <p className={`meta-list${className ? ` ${className}` : ""}`}>
      {facts.map((fact, index) => (
        <span className="meta-list__item" key={`${fact}-${index}`}>
          {fact}
        </span>
      ))}
    </p>
  );
}

/**
 * What this section needs from the teacher, in words.
 *
 * This replaces `1 submission · 1 answered`, which restated the status stamp in
 * metadata and told the teacher nothing to do. A count only appears when it is
 * the subject of the sentence, and the sentence only claims what the counts
 * prove — `0 submissions · 0 answered` beside "Nothing waiting" used to imply
 * the week was handled when nothing had arrived.
 */
export function ReviewStatusLine({
  total,
  needsReview,
}: {
  total: number;
  needsReview: number;
}) {
  if (total === 0) {
    return <p className="status-line">No submissions yet</p>;
  }
  if (needsReview > 0) {
    return (
      <p className="status-line status-line--attention">
        {needsReview === 1
          ? "1 submission needs a reply"
          : `${needsReview} submissions need replies`}
      </p>
    );
  }
  return <p className="status-line">All submissions answered</p>;
}

/** A real count and what it counts. Never a decorative number. */
export function Figure({
  value,
  label,
  attention,
}: {
  value: ReactNode;
  label: string;
  attention?: boolean;
}) {
  return (
    <div className={`figure${attention ? " figure--attention" : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function FigureRow({ children }: { children: ReactNode }) {
  return <div className="figure-row">{children}</div>;
}

/** A question category: a word and a drawn silhouette. Never a colour. */
export function Category({ value }: { value: string | null | undefined }) {
  return (
    <span className="category">
      <CategoryMark shape={categoryShape(value)} />
      {categoryShortLabel(value)}
    </span>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: { href?: string; label: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="breadcrumbs">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              item.label
            )}
            {index < items.length - 1 && <span aria-hidden="true"> /</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Quoted or attributed text — the student's original wording, a private reply,
 * a published answer. Always in the document register, always labelled, never
 * overwritten by a reworded version.
 */
export function Quote({
  label,
  tone,
  children,
  staff,
}: {
  label: ReactNode;
  tone?: "private" | "public";
  staff?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`quote${tone ? ` quote--${tone}` : ""}`}>
      <p className="quote__label">{label}</p>
      <div className={`doc${staff ? " doc--staff" : ""}`}>{children}</div>
    </div>
  );
}

/** Inline validation message, wired to its input through aria-describedby. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="field-error" id={id}>
      <IconWarning size={15} />
      <span>{message}</span>
    </p>
  );
}

/**
 * Page navigation for a paginated list.
 *
 * Links, not buttons, so pages are shareable and work without JavaScript. All
 * existing query parameters are preserved so paging never silently drops the
 * filters the staff member set.
 */
export function Pagination({
  page,
  totalPages,
  total,
  basePath,
  params = {},
  label = "results",
}: {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  params?: Record<string, string | undefined>;
  label?: string;
}) {
  if (total === 0) return null;
  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "" && key !== "page") {
        search.set(key, value);
      }
    }
    if (target > 1) search.set("page", String(target));
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  return (
    <nav className="pagination" aria-label="Pagination">
      <p className="pagination__summary" role="status">
        {total} {label} · page {page} of {totalPages}
      </p>
      <div className="pagination__controls">
        {page > 1 ? (
          <Link
            className="button button--secondary button--small"
            href={href(page - 1)}
            rel="prev"
          >
            <IconBack size={15} />
            Previous
          </Link>
        ) : (
          <span
            className="button button--secondary button--small"
            aria-disabled="true"
          >
            <IconBack size={15} />
            Previous
          </span>
        )}
        {page < totalPages ? (
          <Link
            className="button button--secondary button--small"
            href={href(page + 1)}
            rel="next"
          >
            Next
            <IconForward size={15} />
          </Link>
        ) : (
          <span
            className="button button--secondary button--small"
            aria-disabled="true"
          >
            Next
            <IconForward size={15} />
          </span>
        )}
      </div>
    </nav>
  );
}

/**
 * A GET filter strip above a list. Submitting resets to page 1 by omitting
 * `page`. Renders as the system's `.toolbar`, so every filter row on every
 * surface looks the same.
 */
export function FilterBar({
  action,
  children,
  legend = "Filters",
}: {
  action: string;
  children: ReactNode;
  legend?: string;
}) {
  return (
    <form className="toolbar" method="get" action={action}>
      <fieldset className="toolbar__fields">
        <legend className="visually-hidden">{legend}</legend>
        {children}
        <button className="button button--secondary" type="submit">
          Apply filters
        </button>
      </fieldset>
    </form>
  );
}

export interface ChartBucket {
  label: string;
  count: number;
}

/**
 * Horizontal bar chart for a structured prompt.
 *
 * The SVG is decorative (`aria-hidden`) and the equivalent table is ALWAYS
 * rendered rather than offered as an alternative, because an "accessible chart"
 * that hides its numbers behind a hover is not accessible. Screen readers and
 * keyboard users get the table; sighted users get both.
 */
export function BarChart({
  buckets,
  caption,
  unansweredCount,
}: {
  buckets: ChartBucket[];
  caption: string;
  unansweredCount?: number;
}) {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const rowHeight = 26;
  const height = Math.max(rowHeight, buckets.length * rowHeight);
  const percent = (count: number) =>
    total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
  return (
    <figure className="chart">
      <figcaption>{caption}</figcaption>
      {buckets.length > 0 && (
        <svg
          className="chart__svg"
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          role="presentation"
          aria-hidden="true"
          focusable="false"
        >
          {buckets.map((bucket, index) => (
            <rect
              key={bucket.label}
              x={0}
              y={index * rowHeight + 4}
              width={(bucket.count / max) * 100}
              height={rowHeight - 8}
              className="chart__bar"
            />
          ))}
        </svg>
      )}
      <table className="data-table chart__table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Answer</th>
            <th scope="col">Responses</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {buckets.length === 0 && (
            <tr>
              <td colSpan={3}>No answers yet.</td>
            </tr>
          )}
          {buckets.map((bucket) => (
            <tr key={bucket.label}>
              <th scope="row">{bucket.label}</th>
              <td>{bucket.count}</td>
              <td>{percent(bucket.count)}%</td>
            </tr>
          ))}
        </tbody>
        {unansweredCount !== undefined && (
          <tfoot>
            <tr>
              <th scope="row">Skipped this question</th>
              <td>{unansweredCount}</td>
              <td>—</td>
            </tr>
          </tfoot>
        )}
      </table>
    </figure>
  );
}

export type ValidityName = "valid" | "flagged" | "invalid";

/**
 * STAFF-FACING validity badge. Never render this for a student: `flagged` is an
 * internal state a student must not learn about (decision D15).
 */
export function ValidityBadge({ validity }: { validity: ValidityName }) {
  const map: Record<ValidityName, { tone: Tone; label: string }> = {
    valid: { tone: "green", label: "Valid" },
    flagged: { tone: "amber", label: "Flagged — awaiting instructor" },
    invalid: { tone: "red", label: "Invalid" },
  };
  const { tone, label } = map[validity];
  return <Stamp tone={tone}>{label}</Stamp>;
}

/** What a STUDENT sees about their own submission: counted or not. Never "flagged". */
export function CreditBadge({ counted }: { counted: boolean }) {
  return (
    <Stamp tone={counted ? "green" : "red"}>
      {counted ? "Counted" : "Not counted"}
    </Stamp>
  );
}

export type PriorityName = "low" | "normal" | "high" | "urgent";

export function PriorityBadge({ priority }: { priority: PriorityName }) {
  const map: Record<PriorityName, { tone: Tone; label: string }> = {
    low: { tone: "neutral", label: "Low" },
    normal: { tone: "neutral", label: "Normal" },
    high: { tone: "amber", label: "High" },
    urgent: { tone: "red", label: "Urgent" },
  };
  const { tone, label } = map[priority];
  return <Stamp tone={tone}>{label}</Stamp>;
}

/** Banner shown on every staff page of an archived, read-only course. */
export function ArchivedNotice({ courseCode }: { courseCode?: string }) {
  return (
    <Alert variant="info" title="This course is archived">
      {courseCode ? `${courseCode} is ` : "This course is "}read-only. Exports
      and history still work; everything else is refused by the server until an
      instructor restores it.
    </Alert>
  );
}

export type CycleStateName =
  "draft" | "scheduled" | "open" | "closed" | "archived" | "skipped";

/** Cycle state as words + shape + tone. Text carries the meaning on its own. */
export function CycleStateBadge({ state }: { state: CycleStateName }) {
  const map: Record<CycleStateName, { tone: Tone; label: string }> = {
    draft: { tone: "neutral", label: "Draft" },
    scheduled: { tone: "amber", label: "Scheduled" },
    open: { tone: "green", label: "Open" },
    closed: { tone: "neutral", label: "Closed" },
    archived: { tone: "neutral", label: "Archived" },
    skipped: { tone: "neutral", label: "Skipped" },
  };
  const { tone, label } = map[state];
  return <Stamp tone={tone}>{label}</Stamp>;
}
