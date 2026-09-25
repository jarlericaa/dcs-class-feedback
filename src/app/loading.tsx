import { SkeletonPage, SkeletonPanel } from "@/components/ui/skeleton";

/**
 * The fallback for a navigation that no closer skeleton covers.
 *
 * It used to be the ONLY one: a centred 52ch sheet with five bars, shown for
 * all 26 routes, so a navigation to the participation matrix and a navigation
 * to a form editor looked identical and neither looked like its destination.
 * The owner's ask was that a skeleton follow the layout of the page it
 * precedes, so the routes that are actually slow now carry their own
 * (`loading.tsx` beside each `page.tsx`, and the closest one wins).
 *
 * What is left for this file is the genuinely unknown case — a segment nobody
 * has written a skeleton for. It draws the shell, because the shell is the one
 * thing every route has, and one neutral panel for the content it cannot
 * predict. No tab bar and one crumb: guessing either would move the page when
 * the real one arrives, which is the whole failure this is meant to avoid.
 */
export default function Loading() {
  return (
    <SkeletonPage crumbs={1}>
      <SkeletonPanel />
    </SkeletonPage>
  );
}
