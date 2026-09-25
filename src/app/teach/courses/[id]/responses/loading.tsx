import {
  Skeleton,
  SkeletonControls,
  SkeletonPage,
  SkeletonText,
} from "@/components/ui/skeleton";

/**
 * Responses: the compact view switch, one row of scope selectors, then one
 * sheet per question.
 *
 * It draws the page it precedes, which is the whole rule for a skeleton
 * (DESIGN.md §9). Three things here are the real page's geometry rather than a
 * guess, because getting any of them wrong moves the content when it lands:
 *
 * - the switch is **256px**, not full width. `ViewSwitch` hugs its two labels
 *   and measures ~259px; a full-width bar here would collapse to a quarter of
 *   itself on arrival, which is the exact defect this page just had.
 * - the selectors are **one row**, because they are one flex row on the real
 *   page — a course with one form and one section shows a single select and
 *   the row is still 38px tall either way.
 * - there is **no search bar**. By question is the default and it has no
 *   page-wide search; drawing one would promise a control that never appears.
 */
export default function Loading() {
  return (
    <SkeletonPage crumbs={3} tabs={5}>
      <div className="grid justify-items-start gap-3">
        <Skeleton
          className="rounded-control"
          height="h-control-compact"
          width="w-64"
        />
        <SkeletonControls controls={3} />
      </div>
      <QuestionSkeleton />
      <QuestionSkeleton />
    </SkeletonPage>
  );
}

/**
 * One question sheet: the order line and its type tag, the prompt, the count,
 * then the distribution rows — bars, not paragraphs, because that is what a
 * question sheet is mostly made of.
 */
function QuestionSkeleton() {
  return (
    <div className="grid gap-4 rounded-panel border border-rule bg-paper p-6">
      <div className="grid gap-2">
        <Skeleton height="h-2.5" width="w-28" />
        <Skeleton height="h-5" width="w-6/12" />
        <Skeleton height="h-2.5" width="w-20" />
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}
