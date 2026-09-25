import { SkeletonCards, SkeletonPage } from "@/components/ui/skeleton";

/**
 * My courses: a header action, then one card per course.
 *
 * Four tags because that is what a course card carries at most — forms, open
 * now, responses to answer, class lists — and the tag row is the tallest thing
 * in the card, so under-drawing it would let the list shift upward on arrival.
 * No tab bar: this route is the top of the staff workspace and has none.
 */
export default function Loading() {
  return (
    <SkeletonPage action crumbs={1}>
      <SkeletonCards cards={3} tags={4} />
    </SkeletonPage>
  );
}
