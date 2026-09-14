import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

/** Course-level form participation: a wide student-by-form matrix. */
export default function Loading() {
  return (
    <SkeletonPage crumbs={3} tabs={5}>
      <SkeletonTable columns={6} rows={6} />
    </SkeletonPage>
  );
}
