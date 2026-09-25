import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ShellFrame } from "@/components/ui/shell-frame";

/**
 * Placeholders that describe the page that is coming.
 *
 * The skeleton was one generic block of five bars in a centred 52ch sheet, used
 * by the root `loading.tsx` for all 26 routes — so navigating to the
 * participation matrix and navigating to a form editor showed the same thing,
 * and neither looked like where you were going. The owner's ask (2026-09-11):
 * *"improve it in such a way that it follows the layout of the current page."*
 *
 * **The point is not prettier bars, it is that the placeholder holds the real
 * layout still.** A skeleton whose shape differs from the page it precedes
 * makes the content JUMP when it lands, which is worse than no skeleton — the
 * reader starts reading, and the line moves. So these primitives are sized off
 * the same tokens the real components use (`--spacing-control` for a control
 * row, `--spacing-rail` for the rail, `--text-*` line boxes for text), and each
 * route composes the ones matching its own page.
 *
 * **Why this is not a spinner** (and `Spinner` exists beside it for the case
 * that is): a skeleton can be drawn only when the shape of what is arriving is
 * known. That is true of every route here — a course list is cards, the forms
 * page is a table — so this is the right tool for navigation, and `Spinner` is
 * for a wait with no shape to predict. DESIGN.md §9 records the split.
 *
 * Written in utilities. The six `.skeleton*` rules in `legacy.css` are deleted
 * in the same change, so this makes that file smaller (§11.6b).
 */

/**
 * One muted bar.
 *
 * `--board-deep` on paper, at the stamp radius — the same pairing the old rule
 * used, kept deliberately: a placeholder should read as *absence of content*,
 * not as a component with a fill of its own.
 */
export function Skeleton({
  /** Tailwind width utility. A fraction, so the bar tracks its column. */
  width = "w-full",
  /** Height utility. Defaults to a line of body text. */
  height = "h-3",
  className,
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "block rounded-stamp bg-board-deep",
        /*
          `motion-safe:` — the pulse is decoration and the bars communicate
          without it. This was a `@media (prefers-reduced-motion: reduce)`
          block in `legacy.css`; as a variant it sits on the thing it modifies
          and cannot be left behind when the rule moves.
        */
        "motion-safe:animate-pulse",
        height,
        width,
        className,
      )}
    />
  );
}

/**
 * Lines of prose. The last line is short, because the last line of a paragraph
 * always is — a block of equal-length bars reads as a table, not as text.
 */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ["w-full", "w-11/12", "w-10/12", "w-full", "w-9/12"];
  return (
    <span className={cn("grid gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? "w-7/12" : widths[i % widths.length]}
        />
      ))}
    </span>
  );
}

/**
 * A notice — the white sheet nearly every staff page is made of.
 *
 * Takes the real `.notice` geometry (hairline, 12px radius, 24px padding) so
 * the sheet does not resize when the content arrives inside it; only what is
 * *within* it is placeholder.
 */
export function SkeletonPanel({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 rounded-panel border border-rule bg-paper p-6",
        className,
      )}
    >
      {children ?? (
        <>
          <Skeleton height="h-5" width="w-5/12" />
          <SkeletonText lines={3} />
        </>
      )}
    </div>
  );
}

/**
 * A list of cards, as the courses list and the section lists draw them.
 *
 * Each card is title → meta → a row of tags and a trailing action, which is
 * `section-notice` exactly. The tag row matters more than it looks: those
 * chips are the tallest thing in the card, so leaving them out would make the
 * placeholder shorter than the real card and the list would shift upward on
 * arrival.
 */
export function SkeletonCards({
  cards = 3,
  tags = 3,
}: {
  cards?: number;
  tags?: number;
}) {
  return (
    <div className="grid gap-4">
      {Array.from({ length: cards }, (_, card) => (
        <div
          className="grid gap-4 rounded-panel border border-rule bg-paper p-6"
          key={card}
        >
          <div className="grid gap-2">
            <Skeleton height="h-6" width="w-32" />
            <Skeleton width="w-64" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="flex flex-wrap gap-2">
              {Array.from({ length: tags }, (_, tag) => (
                // The tag's own height, so the row is the height it will be.
                <Skeleton height="h-6" key={tag} width="w-20" />
              ))}
            </span>
            <Skeleton height="h-4" width="w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A data table, inside its sheet.
 *
 * `columns` is the real column count of the page being stood in for, not a
 * default — the forms table has five and the participation matrix has as many
 * as the term has weeks, and a placeholder with the wrong number of columns is
 * the one that shifts most visibly.
 */
export function SkeletonTable({
  columns = 4,
  rows = 4,
  className,
}: {
  columns?: number;
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-panel border border-rule bg-paper",
        className,
      )}
    >
      {/* The header takes the quiet fill the real `thead` has, so the band is
          already there rather than appearing under the first row. */}
      <div className="flex items-center gap-4 border-b border-rule bg-paper-quiet px-4 py-3">
        {Array.from({ length: columns }, (_, column) => (
          <span className="flex-1" key={column}>
            <Skeleton height="h-3" width="w-20" />
          </span>
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          className="flex items-center gap-4 border-b border-rule px-4 py-4 last:border-b-0"
          key={row}
        >
          {Array.from({ length: columns }, (_, column) => (
            <span className="flex-1" key={column}>
              {/* The first cell is the row's name and reads longer; the rest
                  are states and counts. */}
              <Skeleton width={column === 0 ? "w-9/12" : "w-16"} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A filter/search row, which most staff lists carry above their content.
 *
 * 38px — `--spacing-control`, via `min-h-control` — because that is what a real
 * control in that row measures (§12h.2c). Getting this wrong by the 3px the
 * buttons used to be off would shift the whole list.
 */
export function SkeletonControls({ controls = 3 }: { controls?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {Array.from({ length: controls }, (_, control) => (
        <Skeleton
          className="min-h-control rounded-control"
          height="h-control"
          key={control}
          width={control === 0 ? "w-64" : "w-40"}
        />
      ))}
    </div>
  );
}

/**
 * A route's whole loading state: the app's chrome, then this page's shape.
 *
 * `ShellFrame` draws the chrome and owns the reasoning for why it has to
 * (`shell-frame.tsx`). What this adds is the *page*: the tab bar, the crumb
 * trail, the heading and its action — each an argument rather than a default,
 * because getting the count wrong is what makes content jump when it lands.
 *
 * Pass what the real page has. Four tabs plus `More` is five; a `nested` page
 * (a form, an occurrence, the editor) has **none**, and drawing them there
 * would put a row of tabs on screen that then vanishes.
 */
export function SkeletonPage({
  /** Draw the course/section tab bar. Match the page being stood in for. */
  tabs = 0,
  /** Draw a breadcrumb trail of this many crumbs. */
  crumbs = 2,
  /** Draw a primary action in the page header. */
  action = false,
  children,
}: {
  tabs?: number;
  crumbs?: number;
  action?: boolean;
  children: ReactNode;
}) {
  return (
    <ShellFrame status="Loading">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {tabs > 0 && (
          <div
            aria-hidden="true"
            className="flex h-bar shrink-0 items-center gap-6 border-b border-rule bg-paper px-6"
          >
            {Array.from({ length: tabs }, (_, tab) => (
              <Skeleton height="h-3" key={tab} width="w-20" />
            ))}
          </div>
        )}

        <main className="min-w-0 flex-1 p-6">
          <div className="mx-auto grid max-w-5xl gap-6">
            <div className="grid gap-3">
              {crumbs > 0 && (
                <span aria-hidden="true" className="flex items-center gap-2">
                  {Array.from({ length: crumbs }, (_, crumb) => (
                    <Skeleton height="h-2.5" key={crumb} width="w-16" />
                  ))}
                </span>
              )}
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* The page title's own line box, so the heading does not grow
                    when the real one arrives. */}
                <Skeleton height="h-8" width="w-56" />
                {action && (
                  <Skeleton
                    className="rounded-control"
                    height="h-control"
                    width="w-36"
                  />
                )}
              </div>
            </div>
            {children}
          </div>
        </main>
      </div>
    </ShellFrame>
  );
}
