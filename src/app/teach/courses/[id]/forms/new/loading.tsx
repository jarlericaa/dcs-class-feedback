import { SkeletonPage, SkeletonPanel } from "@/components/ui/skeleton";

/**
 * The new-form editor: four numbered steps, each its own sheet (10.4.3a).
 *
 * Four panels, not a table — and NO tab bar, because a form's editor is a child
 * of Forms rather than a sibling of it, so `nested` suppresses the tabs on the
 * real page too (§12d.6). Drawing them here would put a row of tabs on screen
 * that then vanishes.
 */
export default function Loading() {
  return (
    <SkeletonPage crumbs={4}>
      <SkeletonPanel />
      <SkeletonPanel />
      <SkeletonPanel />
      <SkeletonPanel />
    </SkeletonPage>
  );
}
