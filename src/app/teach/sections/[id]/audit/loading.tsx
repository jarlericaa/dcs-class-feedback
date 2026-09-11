import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

/**
 * Audit history: when · who · what · which entity.
 *
 * A long list by nature, so six rows — enough that the first screenful is
 * already the right height and the page does not grow as the real rows land.
 */
export default function Loading() {
  return (
    <SkeletonPage crumbs={4} tabs={5}>
      <SkeletonTable columns={4} rows={6} />
    </SkeletonPage>
  );
}
