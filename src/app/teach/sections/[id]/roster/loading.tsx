import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

/** The class list: student number · name · UP email · status. */
export default function Loading() {
  return (
    <SkeletonPage action crumbs={4} tabs={5}>
      <SkeletonTable columns={4} rows={6} />
    </SkeletonPage>
  );
}
