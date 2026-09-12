import {
  Skeleton,
  SkeletonControls,
  SkeletonPage,
  SkeletonPanel,
  SkeletonText,
} from "@/components/ui/skeleton";

/**
 * The publication queue: one sheet per draft answer, each holding the
 * reworded question and the answer under it — prose, not a table row.
 */
export default function Loading() {
  return (
    <SkeletonPage crumbs={4} tabs={5}>
      <SkeletonControls controls={2} />
      <div className="grid gap-3">
        <SkeletonPanel className="gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton height="h-6" width="w-32" />
            <Skeleton height="h-6" width="w-20" />
          </div>
          <Skeleton height="h-7" width="w-8/12" />
          <div className="flex flex-wrap gap-4">
            <Skeleton height="h-3" width="w-32" />
            <Skeleton height="h-3" width="w-24" />
            <Skeleton height="h-3" width="w-28" />
          </div>
          <div className="grid gap-3 border-t border-rule pt-5">
            <Skeleton height="h-4" width="w-28" />
            <SkeletonText lines={2} />
            <Skeleton height="h-4" width="w-24" />
            <SkeletonText lines={3} />
          </div>
          <Skeleton height="h-10" width="w-full" />
          <div className="flex flex-wrap justify-between gap-3">
            <div className="flex gap-2">
              <Skeleton height="h-control" width="w-28" />
              <Skeleton height="h-control" width="w-28" />
            </div>
            <div className="flex gap-2">
              <Skeleton height="h-control" width="w-28" />
              <Skeleton height="h-control" width="w-36" />
            </div>
          </div>
        </SkeletonPanel>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="publication-loading-row grid gap-3 rounded-panel border border-rule bg-paper p-4"
            key={index}
          >
            <div className="flex flex-wrap gap-2">
              <Skeleton height="h-6" width="w-28" />
              <Skeleton height="h-6" width="w-20" />
            </div>
            <Skeleton height="h-5" width="w-7/12" />
            <div className="flex flex-wrap gap-4">
              <Skeleton height="h-3" width="w-28" />
              <Skeleton height="h-3" width="w-24" />
              <Skeleton height="h-3" width="w-24" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
