import { SkeletonPage, SkeletonPanel } from "@/components/ui/skeleton";

/**
 * The publication queue: one sheet per draft answer, each holding the
 * reworded question and the answer under it — prose, not a table row.
 */
export default function Loading() {
  return (
    <SkeletonPage crumbs={4} tabs={5}>
      <SkeletonPanel />
      <SkeletonPanel />
    </SkeletonPage>
  );
}
