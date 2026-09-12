import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { ShellFrame } from "@/components/ui/shell-frame";

/**
 * A staff route that does not resolve, with the workspace still around it (§5.3).
 *
 * It deliberately does **not** distinguish "no such course" from "not your
 * course". The authorization layer sends both here for resources the reader may
 * not know about, and saying which would confirm to someone with no access that
 * a given course or class list exists (§9, deny-by-default). The copy is
 * therefore about the *link*, never about the thing.
 */
export default function TeachNotFound() {
  return (
    <ShellFrame>
      <main className="min-w-0 flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-panel border border-rule bg-paper p-6">
          <h1 className="font-document text-title font-bold">
            This page isn&rsquo;t here
          </h1>
          <p className="mt-3 max-w-measure text-ui-sm text-ink-muted">
            The link may be out of date, or it may point at something your
            account cannot reach. If someone sent you here, ask them to check
            the address.
          </p>
          <div className="mt-6">
            <Link
              className={buttonClass({ variant: "primary" })}
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
