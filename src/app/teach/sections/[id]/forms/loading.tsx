import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

/** A class list's forms: form · window · state · responses. */
export default function Loading() {
  return (
    <SkeletonPage action crumbs={4} tabs={5}>
      <SkeletonTable columns={4} rows={3} />
    </SkeletonPage>
  );
}
