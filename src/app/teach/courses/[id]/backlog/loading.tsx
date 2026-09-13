import {
  Skeleton,
  SkeletonControls,
  SkeletonPage,
  SkeletonPanel,
  SkeletonText,
} from "@/components/ui/skeleton";

/**
 * Mirrors the consolidated editorial workspace: a compact list on the left and
 * the selected question's editor on the right.
 */
export default function Loading() {
  return (
    <SkeletonPage crumbs={4} tabs={5}>
      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.92fr)_minmax(440px,1.08fr)]">
        <div className="grid gap-3">
          <SkeletonControls controls={4} />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton
                height="h-8"
                width={index === 0 ? "w-16" : "w-28"}
                key={index}
              />
            ))}
          </div>
          {Array.from({ length: 7 }, (_, index) => (
            <SkeletonPanel className="gap-3" key={index}>
              <div className="flex gap-2">
                <Skeleton height="h-6" width="w-28" />
                <Skeleton height="h-6" width="w-20" />
              </div>
              <Skeleton
                height="h-5"
                width={index % 2 === 0 ? "w-11/12" : "w-8/12"}
              />
            </SkeletonPanel>
          ))}
        </div>
        <SkeletonPanel className="gap-6">
          <Skeleton height="h-4" width="w-40" />
          <div className="grid gap-3 border-b border-rule pb-6">
            <Skeleton height="h-6" width="w-36" />
            <SkeletonText lines={2} />
          </div>
          <div className="grid gap-3">
            <Skeleton height="h-6" width="w-28" />
            <SkeletonText lines={3} />
          </div>
          <div className="mt-auto flex justify-between gap-3 border-t border-rule pt-6">
            <Skeleton height="h-control" width="w-28" />
            <div className="flex gap-2">
              <Skeleton height="h-control" width="w-28" />
              <Skeleton height="h-control" width="w-36" />
            </div>
          </div>
        </SkeletonPanel>
      </div>
    </SkeletonPage>
  );
}
