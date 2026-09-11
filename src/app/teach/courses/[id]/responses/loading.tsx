import {
  SkeletonControls,
  SkeletonPage,
  SkeletonPanel,
} from "@/components/ui/skeleton";

/**
 * Responses: the form/occurrence selectors, then one panel per response.
 *
 * Three controls, matching the real axis order — form, then occurrence, then
 * the filters (10.5.1) — and they take `min-h-control` so the list below them
 * starts where it will actually start.
 */
export default function Loading() {
  return (
    <SkeletonPage crumbs={3} tabs={5}>
      <SkeletonControls controls={3} />
      <SkeletonPanel />
      <SkeletonPanel />
    </SkeletonPage>
  );
}
