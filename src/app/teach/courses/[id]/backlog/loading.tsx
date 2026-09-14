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
      <div className="grid gap-4">
        {/* Search and Filter are the only universal backlog controls. Action
            skeletons would briefly promise Add/Import to assistants who do not
            hold those permissions. */}
        <SkeletonControls controls={2} />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton
              height="h-8"
              width={index === 0 ? "w-16" : "w-28"}
              key={index}
            />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
          <div className="grid gap-3">
            {Array.from({ length: 7 }, (_, index) => (
              <SkeletonPanel className="gap-3" key={index}>
                <Skeleton
                  height="h-5"
                  width={index % 2 === 0 ? "w-11/12" : "w-8/12"}
                />
                <div className="flex gap-2">
                  <Skeleton height="h-6" width="w-28" />
                  <Skeleton height="h-6" width="w-20" />
                </div>
              </SkeletonPanel>
            ))}
          </div>
          <SkeletonPanel className="gap-6">
            <Skeleton height="h-4" width="w-40" />
            <div className="grid gap-3 border-b border-rule pb-6">
              <Skeleton height="h-10" width="w-11/12" />
              <div className="flex gap-2">
                <Skeleton height="h-6" width="w-28" />
                <Skeleton height="h-6" width="w-20" />
              </div>
              <SkeletonText lines={2} />
            </div>
            <div className="grid gap-3">
              <Skeleton height="h-6" width="w-28" />
              <SkeletonText lines={3} />
            </div>
          </SkeletonPanel>
        </div>
      </div>
    </SkeletonPage>
  );
}
