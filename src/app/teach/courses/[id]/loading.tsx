import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

/**
 * A course's Forms tab: the five-column table 12e.2 rebuilt.
 *
 * Form · Delivery · Status · Responses · Actions — the column count is the
 * number that matters here, because a table placeholder with the wrong one
 * shifts every cell sideways when the real header lands.
 *
 * Five tabs: the four primary destinations plus `More` (§12c.2).
 */
export default function Loading() {
  return (
    <SkeletonPage action crumbs={3} tabs={5}>
      <SkeletonTable columns={5} rows={3} />
    </SkeletonPage>
  );
}
