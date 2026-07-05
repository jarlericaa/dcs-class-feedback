import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { env } from "@/env";

export default async function SignInPage() {
  const session = await auth();
  if (session?.userId) redirect("/");

  const googleConfigured = !!(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);

  return (
    <main>
      <h1>Class Feedback — Sign in</h1>
      {googleConfigured ? (
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button type="submit">Sign in with your university Google account</button>
        </form>
      ) : (
        <p>
          Google sign-in is not configured. Set AUTH_GOOGLE_ID /
          AUTH_GOOGLE_SECRET (see README).
        </p>
      )}

      {env.devAuthEnabled && (
        <form
          action={async (formData: FormData) => {
            "use server";
            await signIn("dev-login", {
              email: String(formData.get("email") ?? ""),
              redirectTo: "/",
            });
          }}
          style={{ marginTop: "2rem", borderTop: "1px solid #ccc", paddingTop: "1rem" }}
        >
          <h2>Dev login (local development only)</h2>
          <p>Signs in an existing seeded user by email. Never available in production.</p>
          <input name="email" type="email" placeholder="teacher@up.edu.ph" required />
          <button type="submit">Dev sign in</button>
        </form>
      )}
    </main>
  );
}
