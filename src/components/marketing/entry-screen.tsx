import { redirect, unstable_rethrow } from "next/navigation";
import { signIn } from "@/auth";
import { env } from "@/env";
import { Alert } from "@/components/ui";
import { IconCheck } from "@/components/ui/icons";

/**
 * The signed-out front door, shared by `/` and `/signin`.
 *
 * One posted notice on the board: what this is, who may come in, what happens
 * to what you write, and the way in. Not a marketing funnel — there is nothing
 * to sell here, and everything to be clear about, because a student decides
 * whether to trust the anonymity promise before they ever sign in.
 *
 * The terms below describe what the system actually does. Never state a
 * stronger anonymity guarantee than the product provides.
 */
export function EntryScreen({ error }: { error?: string }) {
  const googleConfigured = !!(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
  const domains = env.allowedEmailDomains;

  return (
    <div className="entry">
      <div className="entry__mast">
        <span className="ws-brand__mark" aria-hidden="true">
          cf
        </span>
        <span className="ws-brand__name">Class Feedback</span>
      </div>

      <main className="entry__sheet" id="main-content">
        <div className="entry__grid">
          <section className="entry__about">
            <h1>Say what would help this week.</h1>
            <p className="entry__lede">
              One short form per class, every week. Your teaching team reads it,
              replies to you privately, and publishes the answers the whole
              class needs — without your name attached.
            </p>

            <ul className="entry__terms">
              <li>
                <IconCheck size={15} />
                <span>
                  Only your teaching team can see who wrote a submission.
                  Classmates never can.
                </span>
              </li>
              <li>
                <IconCheck size={15} />
                <span>
                  Answers published to the class are anonymous, and your
                  original wording is never shown — staff rewrite the question
                  before it goes up.
                </span>
              </li>
              <li>
                <IconCheck size={15} />
                <span>
                  Nothing here is on the public internet. Each class section
                  sees only its own archive.
                </span>
              </li>
              <li>
                <IconCheck size={15} />
                <span>
                  A submitted form cannot be edited or withdrawn, so read it
                  before you send it.
                </span>
              </li>
            </ul>
          </section>

          <section className="entry__signin" aria-labelledby="entry-signin">
            <h2 id="entry-signin">Sign in</h2>
            <p>
              {domains.length > 0
                ? `Use your university Google account (${domains.join(", ")}). Other accounts are turned away.`
                : "Use your university Google account. Other accounts are turned away."}
            </p>

            {error && (
              <div style={{ marginTop: "var(--s4)" }}>
                <Alert variant="error" title="Sign-in failed">
                  {error === "AccessDenied"
                    ? "That account is not allowed to sign in. Use your university Google account instead."
                    : error === "DevLogin"
                      ? "No active account matches that email. Development sign-in only works for an account that already exists — try one of the seeded addresses."
                      : "Something went wrong signing you in. Try again, and tell your teacher if it keeps happening."}
                </Alert>
              </div>
            )}

            <div className="entry__actions">
              {googleConfigured ? (
                <form
                  action={async () => {
                    "use server";
                    try {
                      await signIn("google", { redirectTo: "/" });
                    } catch (err) {
                      // signIn signals success by throwing a redirect, so hand
                      // Next's own control-flow errors straight back.
                      unstable_rethrow(err);
                      redirect("/signin?error=Google");
                    }
                  }}
                >
                  <button className="button button--primary" type="submit">
                    Continue with Google
                  </button>
                </form>
              ) : (
                <Alert
                  variant="warning"
                  title="Google sign-in is not configured"
                >
                  Set <code>AUTH_GOOGLE_ID</code> and{" "}
                  <code>AUTH_GOOGLE_SECRET</code> to enable university sign-in.
                  See the README.
                </Alert>
              )}
            </div>

            {env.devAuthEnabled && (
              <div className="entry__dev">
                <h3>Development sign-in</h3>
                <p>
                  Local development only. Signs in an existing seeded account by
                  email, with no password. Impossible to enable in a production
                  build.
                </p>
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    try {
                      await signIn("dev-login", {
                        email: String(formData.get("email") ?? ""),
                        redirectTo: "/",
                      });
                    } catch (err) {
                      // A successful sign-in throws a redirect, so hand Next's
                      // own control-flow errors back untouched. Anything else
                      // means the credentials were rejected: show a message
                      // rather than a 500 page.
                      unstable_rethrow(err);
                      redirect("/signin?error=DevLogin");
                    }
                  }}
                >
                  <label className="visually-hidden" htmlFor="dev-email">
                    Email of an existing user
                  </label>
                  <input
                    id="dev-email"
                    className="field"
                    name="email"
                    type="email"
                    placeholder="teacher@up.edu.ph"
                    required
                  />
                  <button className="button button--secondary" type="submit">
                    Development sign in
                  </button>
                </form>
              </div>
            )}
          </section>
        </div>
      </main>

      <p className="entry__foot">
        Class Feedback · University of the Philippines, Department of Computer
        Science
      </p>
    </div>
  );
}
