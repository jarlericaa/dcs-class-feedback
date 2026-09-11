"use client";

import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

/**
 * The last stop when a server component throws (DESIGN-TODO §5.3).
 *
 * Before this, an unhandled error rendered Next.js's own error page with none
 * of the app's chrome — and for a permissions-heavy product that is a routine
 * occurrence, not an edge case.
 *
 * It shows the reader NOTHING about the failure but the digest. `error.message`
 * from a server component can carry query fragments, ids, or a student's email
 * out of a stack trace, so it is never rendered; the digest is the id to quote
 * when reporting it, and the real message stays in the server log.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="boundary">
      <div className="boundary__sheet">
        <h1 className="panel-title">Something went wrong</h1>
        <p className="helper-text mt-3">
          The page could not be loaded. Nothing you were working on has been
          submitted or changed. Trying again usually works — if it does not, the
          reference below helps whoever looks into it.
        </p>
        {error.digest && (
          <p className="meta mt-3">
            Reference {error.digest}
          </p>
        )}
        <div className="row mt-6">
          <button
            className={buttonClass({ variant: "primary" })}
            type="button"
            onClick={reset}
          >
            Try again
          </button>
          <Link className={buttonClass({ variant: "secondary" })} href="/">
            Go to my classes
          </Link>
        </div>
      </div>
    </div>
  );
}
