import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

/**
 * Teaching team: person · standing · scope · actions.
 *
 * Every scope is visible in one table (that is why `fixedSection` has no
 * caller), so four columns is the real shape rather than a guess.
 */
export default function Loading() {
  return (
    <SkeletonPage action crumbs={3} tabs={5}>
      <SkeletonTable columns={4} rows={3} />
    </SkeletonPage>
  );
}
