import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { env } from "@/env";
import { Alert } from "@/components/ui";

/**
 * Sign-in. Establishes trust before a user enters a confidential university
 * workspace: says who may sign in, what the workspace contains, and that the
 * class archive is never internet-public.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.userId) redirect("/");
  const { error } = await searchParams;

  const googleConfigured = !!(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
  const domains = env.allowedEmailDomains;

  return (
    <div className="signin-frame">
      <div className="signin-layout">
        <section className="signin-intro">
          <span className="brand-mark" aria-hidden="true">
            cf
          </span>
          <h1>Weekly feedback that actually gets answered.</h1>
          <p>
            Tell your teacher what is working and what is not, every week. Ask
            the question you did not want to ask out loud.
          </p>
          <ul className="signin-points">
            <li>Your classmates never see who asked a question.</li>
            <li>Answers are published to your class section only.</li>
            <li>Never visible on the public internet.</li>
          </ul>
        </section>

        <section className="signin-card">
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
                  : "Something went wrong signing you in. Try again, and tell your teacher if it keeps happening."}
              </Alert>
            </div>
          )}

          {googleConfigured ? (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/" });
              }}
            >
              <button className="button button--primary" type="submit">
                Continue with your university Google account
              </button>
            </form>
          ) : (
            <div style={{ marginTop: 18 }}>
              <Alert variant="warning" title="Google sign-in is not configured">
                Set <code>AUTH_GOOGLE_ID</code> and{" "}
                <code>AUTH_GOOGLE_SECRET</code> to enable university sign-in.
                See the README.
              </Alert>
            </div>
          )}

          {env.devAuthEnabled && (
            <div className="dev-login">
              <h3>Development sign-in</h3>
              <p className="muted">
                Local development only. Signs in an existing seeded account by
                email, with no password. This is impossible to enable in a
                production build.
              </p>
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await signIn("dev-login", {
                    email: String(formData.get("email") ?? ""),
                    redirectTo: "/",
                  });
                }}
              >
                <div className="field-row">
                  <label htmlFor="dev-email">Email of an existing user</label>
                  <input
                    id="dev-email"
                    className="field"
                    name="email"
                    type="email"
                    placeholder="teacher@up.edu.ph"
                    required
                  />
                </div>
                <button className="button button--secondary" type="submit">
                  Development sign in
                </button>
              </form>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
