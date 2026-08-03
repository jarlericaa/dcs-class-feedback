import { redirect, unstable_rethrow } from "next/navigation";
import { signIn } from "@/auth";
import { env } from "@/env";
import { Alert } from "@/components/ui";

/**
 * The signed-out front door, shared by `/` and `/signin`.
 *
 * Deliberately one screen, not a marketing funnel: say what this is in a
 * sentence, show what the workspace actually looks like, and sign in. Sharing
 * the component means there is a single entry screen to keep looking right,
 * and Auth.js redirects to /signin without the user hitting a different page.
 *
 * The preview is built from the workspace's own markup vocabulary rather than
 * an image, so it cannot drift away from the real UI unnoticed.
 */
export function EntryScreen({ error }: { error?: string }) {
  const googleConfigured = !!(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
  const domains = env.allowedEmailDomains;

  return (
    <main className="entry" id="main-content">
      <div className="entry__card">
        <section className="entry__aside">
          <span className="entry__brand">
            <span className="entry__mark" aria-hidden="true">
              cf
            </span>
            Class Feedback
          </span>

          <h1>Weekly feedback that actually gets answered.</h1>
          <p>
            Tell your teacher what is working each week, and ask the question
            you did not want to ask out loud.
          </p>

          <div
            className="entry__preview"
            role="img"
            aria-label="Preview of the class Q&A: published questions with their category and age, shown anonymously"
          >
            <div className="entry__preview-bar">
              <span aria-hidden="true">⌕</span> DCS-101 · Class Q&amp;A
            </div>
            <div className="entry__preview-row">
              <b>Can the slide font be larger?</b>
              <span>
                <span className="entry__preview-tag">Logistics</span> · Anonymous
                · answered
              </span>
            </div>
            <div className="entry__preview-row">
              <b>Will the finals be cumulative?</b>
              <span>
                <span className="entry__preview-tag">Content</span> · Anonymous ·
                answered
              </span>
            </div>
          </div>

        </section>

        <section className="entry__main">
          <h2>Sign in</h2>
          <p>
            {domains.length > 0
              ? `Use your university Google account (${domains.join(", ")}).`
              : "Use your university Google account."}
          </p>

          {error && (
            <div style={{ marginTop: 18 }}>
              <Alert variant="error" title="Sign-in failed">
                {error === "AccessDenied"
                  ? "That account is not allowed to sign in. Use your university Google account."
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
                <button className="entry__btn entry__btn--primary" type="submit">
                  Continue with Google
                </button>
              </form>
            ) : (
              <Alert variant="warning" title="Google sign-in is not configured">
                Set <code>AUTH_GOOGLE_ID</code> and <code>AUTH_GOOGLE_SECRET</code>{" "}
                to enable university sign-in. See the README.
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
                <button className="entry__btn entry__btn--secondary" type="submit">
                  Development sign in
                </button>
              </form>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
