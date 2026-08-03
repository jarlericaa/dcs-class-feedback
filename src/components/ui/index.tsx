import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared presentational vocabulary. These components receive
 * already-authorized data and emit markup only — no data access, no
 * authorization, no domain rules.
 *
 * Status is always text + shape + colour, never colour alone
 * (docs/CLAUDE_UI_SCREEN_SPEC.md visual QA checklist).
 */

export type Tone = "green" | "amber" | "red" | "neutral";

const TONE_DOT: Record<Tone, string> = {
  green: "●",
  amber: "◆",
  red: "■",
  neutral: "○",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      <span className="badge__dot" aria-hidden="true">
        {TONE_DOT[tone]}
      </span>
      {children}
    </span>
  );
}

export function Alert({
  variant,
  title,
  children,
}: {
  variant: "error" | "success" | "warning" | "info";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`alert alert--${variant}`}
      role={variant === "error" ? "alert" : "status"}
    >
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && (
        <Link className="button button--secondary" href={action.href}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Standard "you cannot see this" page body. Server already denied access. */
export function AccessDenied({ what = "this page" }: { what?: string }) {
  return (
    <EmptyState title="You do not have access">
      Your account is not authorized to view {what}. If you think this is a
      mistake, ask the teacher who manages this class section.
    </EmptyState>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
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
            {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
            {index < items.length - 1 && <span aria-hidden="true"> ›</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Inline validation message wired to an input through aria-describedby. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="field-error" id={id}>
      <span aria-hidden="true">⚠</span>
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
          <Link className="button button--secondary" href={href(page - 1)} rel="prev">
            ‹ Previous
          </Link>
        ) : (
          <span className="button button--secondary" aria-disabled="true">
            ‹ Previous
          </span>
        )}
        {page < totalPages ? (
          <Link className="button button--secondary" href={href(page + 1)} rel="next">
            Next ›
          </Link>
        ) : (
          <span className="button button--secondary" aria-disabled="true">
            Next ›
          </span>
        )}
      </div>
    </nav>
  );
}

/** A GET filter form. Submitting resets to page 1 by omitting `page`. */
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
    <form className="filter-bar" method="get" action={action}>
      <fieldset>
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
      <table className="table chart__table">
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
  return <Badge tone={tone}>{label}</Badge>;
}

/** What a STUDENT sees about their own submission: counted or not. Never "flagged". */
export function CreditBadge({ counted }: { counted: boolean }) {
  return (
    <Badge tone={counted ? "green" : "red"}>
      {counted ? "Counted toward bonus" : "Not counted"}
    </Badge>
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
  return <Badge tone={tone}>{label}</Badge>;
}

/** Banner shown on every staff page of an archived, read-only course. */
export function ArchivedNotice({ courseCode }: { courseCode?: string }) {
  return (
    <Alert variant="info" title="This course is archived">
      {courseCode ? `${courseCode} is ` : "This course is "}read-only. Exports and
      history still work; everything else is refused by the server until an
      instructor restores it.
    </Alert>
  );
}

export type CycleStateName =
  | "draft"
  | "scheduled"
  | "open"
  | "closed"
  | "archived"
  | "skipped";

/** Cycle state as words + tone. Text carries the meaning on its own. */
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
  return <Badge tone={tone}>{label}</Badge>;
}
