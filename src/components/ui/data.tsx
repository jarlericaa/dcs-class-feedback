import Link from "next/link";
import type { ReactNode } from "react";
import { IconBack, IconForward } from "./icons";
import { buttonClass } from "@/components/ui/button";

/**
 * Reading a set rather than one thing: metadata lines, pagination, filter bars
 * and the one chart idiom the app has.
 *
 * `MetaList` is the dot-separated FACT line. It is not `Tag` (./tag): tags are
 * countable facts to compare, while this also carries eyebrow labels above a
 * title and whole sentences of prose, neither of which belongs in a chip.
 */

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
}: {
  page: number;
  totalPages: number;
  /** only to decide whether there is anything to page through */
  total: number;
  basePath: string;
  params?: Record<string, string | undefined>;
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
      {/* "Page 1 of 4", and nothing else (owner, 2026-09-11). It used to lead
          with the row count — "3 students · page 1 of 1" — which is a fact
          about the LIST rather than about paging through it, and the panel
          heading above already carries the count as a tag. */}
      <p className="pagination__summary" role="status">
        Page {page} of {totalPages}
      </p>
      <div className="pagination__controls">
        {page > 1 ? (
          <Link
            className={buttonClass({ variant: "secondary", size: "small" })}
            href={href(page - 1)}
            rel="prev"
          >
            <IconBack size={15} />
            Previous
          </Link>
        ) : (
          <span
            className={buttonClass({ variant: "secondary", size: "small" })}
            aria-disabled="true"
          >
            <IconBack size={15} />
            Previous
          </span>
        )}
        {page < totalPages ? (
          <Link
            className={buttonClass({ variant: "secondary", size: "small" })}
            href={href(page + 1)}
            rel="next"
          >
            Next
            <IconForward size={15} />
          </Link>
        ) : (
          <span
            className={buttonClass({ variant: "secondary", size: "small" })}
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
        <button className={buttonClass({ variant: "secondary" })} type="submit">
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
