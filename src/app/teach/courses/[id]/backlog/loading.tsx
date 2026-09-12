import {
  SkeletonControls,
  SkeletonPage,
  SkeletonPanel,
} from "@/components/ui/skeleton";

/**
 * The question backlog: a filter row, then one sheet per question.
 *
 * Two controls — the state filter and the search — matching what the real
 * `FilterBar` renders above this list.
 */
export default function Loading() {
  return (
    <SkeletonPage action crumbs={4} tabs={5}>
      <SkeletonControls controls={2} />
      <SkeletonPanel />
      <SkeletonPanel />
    </SkeletonPage>
  );
}
