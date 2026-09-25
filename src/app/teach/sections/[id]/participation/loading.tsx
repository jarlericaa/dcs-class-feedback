import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

/**
 * The participation matrix — the widest thing in the app.
 *
 * Student, then a column per cycle. Eight is a term's worth of weeks and is
 * deliberately an over-estimate rather than an under-: the table scrolls
 * horizontally (§5.7), so too many columns are clipped by the same scroller the
 * real table uses, while too few would leave the sheet visibly narrow and then
 * jump wider.
 */
export default function Loading() {
  return (
    <SkeletonPage action crumbs={4} tabs={5}>
      <SkeletonTable columns={8} rows={6} />
    </SkeletonPage>
  );
}
