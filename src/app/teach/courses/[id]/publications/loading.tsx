import { SkeletonPage } from "@/components/ui/skeleton";

/**
 * The compatibility route redirects to Question Backlog; keep this fallback
 * quiet while navigation resolves.
 */
export default function Loading() {
  return (
    <SkeletonPage crumbs={4} tabs={5}>
      <div aria-hidden="true" />
    </SkeletonPage>
  );
}
