import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

/**
 * A 404 in the app's own voice (DESIGN-TODO §5.3).
 *
 * It deliberately does NOT distinguish "no such thing" from "not yours" — the
 * authorization layer routes both here for resources the reader may not know
 * about, and saying which would confirm a course or section exists to someone
 * with no access (§9, deny-by-default).
 */
export default function NotFound() {
  return (
    <div className="boundary">
      <div className="boundary__sheet">
        <h1 className="panel-title">This page isn&rsquo;t here</h1>
        <p className="helper-text mt-3">
          The link may be out of date, or the course or class list it pointed at
          may have been removed. If someone sent you here, ask them to check the
          address.
        </p>
        <div className="row mt-6">
          <Link className={buttonClass({ variant: "primary" })} href="/">
            Go to my classes
          </Link>
        </div>
      </div>
    </div>
  );
}
