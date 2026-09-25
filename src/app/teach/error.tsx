"use client";

import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { ShellFrame } from "@/components/ui/shell-frame";

/**
 * A staff route threw. The chrome stays (§5.3).
 *
 * The root `error.tsx` catches this too, but it renders a standalone sheet on
 * the board — correct when the shell itself could not be built, wrong here:
 * every route under `/teach` is a page *inside* a workspace, and losing the top
 * bar and the rail makes a failed query look like a failed sign-in. This keeps
 * the frame and replaces only the column that broke.
 *
 * Same disclosure rule as the root boundary, and it is a privacy rule rather
 * than a style one: `error.message` from a server component can carry a query
 * fragment, a record id, or a student's address out of a stack trace, so it is
 * **never** rendered. The digest is the reference to quote; the message stays
 * in the server log.
 *
 * This is not where an unauthorized course lands. Those are caught in the page
 * and render `AccessDenied` inside the real shell, which says less and says it
 * on purpose (§9, deny-by-default: it never confirms the thing exists).
 */
export default function TeachError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ShellFrame>
      <main className="min-w-0 flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-panel border border-rule bg-paper p-6">
          {/* `role="alert"`, so a reader who was mid-navigation is told rather
              than left to discover it. DESIGN.md §9's error shape. */}
          <div role="alert">
            <h1 className="font-document text-title font-bold">
              This page could not be loaded
            </h1>
            <p className="mt-3 max-w-measure text-ui-sm text-ink-muted">
              Nothing you were working on has been submitted or changed. Trying
              again usually works — the rest of the workspace is unaffected, so
              you can also carry on somewhere else.
            </p>
          </div>
          {error.digest && (
            <p className="mt-3 text-meta text-ink-muted">
              Reference {error.digest}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className={buttonClass({ variant: "primary" })}
              onClick={reset}
              type="button"
            >
              Try again
            </button>
            <Link
              className={buttonClass({ variant: "secondary" })}
              href="/teach/courses"
            >
              My courses
            </Link>
          </div>
        </div>
      </main>
    </ShellFrame>
  );
}
