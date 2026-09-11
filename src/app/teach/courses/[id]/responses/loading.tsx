import {
  Skeleton,
  SkeletonControls,
  SkeletonPanel,
  SkeletonPage,
  SkeletonText,
} from "@/components/ui/skeleton";

/**
 * Responses: the view switch, the scope selectors, then one sheet per question.
 *
 * It draws the page it precedes, which is the whole rule for a skeleton
 * (DESIGN.md §9): the two-option segment at its real 34px, three controls at
 * the real 38px, and question-shaped sheets rather than the feed of student
 * posts this used to stand in for. A placeholder whose shape differs from the
 * page it precedes makes the content jump when it lands.
 *
 * By question is the default, so the question blocks are what is predicted. A
 * reader who asked for By submission gets a slightly wrong shape for one paint,
 * which is the correct trade: the default is what nearly every navigation here
 * lands on.
 */
export default function Loading() {
  return (
    <SkeletonPage crumbs={3} tabs={5}>
      <div className="grid gap-3">
        {/* The view switch: two options behind one 6px-radius border, at
            `--spacing-control-compact`, exactly as `ViewSwitch` draws it. */}
        <Skeleton
          className="rounded-control"
          height="h-control-compact"
          width="w-56"
        />
        <SkeletonControls controls={3} />
      </div>
      <QuestionSkeleton />
      <QuestionSkeleton />
    </SkeletonPage>
  );
}

/** One question sheet: the order line, the prompt, the count, the answers. */
function QuestionSkeleton() {
  return (
    <SkeletonPanel>
      <Skeleton height="h-2.5" width="w-28" />
      <Skeleton height="h-5" width="w-7/12" />
      <Skeleton height="h-2.5" width="w-24" />
      <SkeletonText lines={3} />
    </SkeletonPanel>
  );
}
