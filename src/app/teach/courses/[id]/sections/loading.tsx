import { SkeletonCards, SkeletonPage } from "@/components/ui/skeleton";

/** Class lists: a card per list, each with its term and its student count. */
export default function Loading() {
  return (
    <SkeletonPage action crumbs={3} tabs={5}>
      <SkeletonCards cards={2} tags={2} />
    </SkeletonPage>
  );
}
