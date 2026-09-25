"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { Field } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  devLoginAction,
  googleSignInAction,
  platformAdminSignInAction,
} from "@/app/signin/actions";

type LoginMode = "google" | "admin";

function errorMessage(error?: string) {
  if (error === "AccessDenied") return "That Google account is not allowed to sign in.";
  if (error === "CredentialsSignin") return "Incorrect username or password.";
  if (error === "DevLogin") return "No active development account matches that email.";
  if (error === "Google") return "Google sign-in could not be completed. Try again.";
  return error ? "Sign-in could not be completed. Try again." : null;
}

/** One quiet, shared signed-out front door for `/` and `/signin`. */
export function EntryScreen({
  error,
  initialMode = "google",
  googleConfigured = false,
  devAuthEnabled = false,
}: {
  error?: string;
  initialMode?: LoginMode;
  googleConfigured?: boolean;
  devAuthEnabled?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const message = errorMessage(error);
  const switchMode = (nextMode: LoginMode) => {
    setMode(nextMode);
    router.replace(nextMode === "admin" ? "/signin?method=admin" : "/signin", { scroll: false });
  };

  return (
    <main className="grid min-h-dvh place-items-start bg-board px-4 py-16 text-ink sm:place-items-center sm:py-20">
      <div className="w-full max-w-[29rem]">
        <p className="m-0 text-left text-xl font-bold tracking-[-0.03em]">Forms</p>
        <h1 className="m-0 mt-10 text-left font-document text-headline font-bold">
          Log in
        </h1>

        <section className="mt-6 rounded-panel border border-rule bg-paper p-6 sm:p-8" aria-label="Log in">
          {message && (
            <div className="mb-5" role="alert" aria-live="assertive">
              <Alert variant="error">{message}</Alert>
            </div>
          )}

          {mode === "google" ? (
            <div className="grid gap-4">
              <form action={googleSignInAction}>
                <SubmitButton
                  className="w-full justify-center"
                  disabled={!googleConfigured}
                  variant="secondary"
                  pendingLabel="Opening Google…"
                  title={!googleConfigured ? "Google sign-in is not configured" : undefined}
                >
                  <span aria-hidden="true" className="mr-2 text-lg font-bold text-[#4285f4]">G</span>
                  Sign in with Google
                </SubmitButton>
              </form>
              {!googleConfigured && (
                <p className="m-0 text-center text-ui-xs text-ink-muted">
                  Google sign-in is not configured in this environment.
                </p>
              )}

              <button
                className="min-h-control w-full rounded-control border border-rule-strong bg-paper-quiet px-4 py-2 text-ui-sm font-semibold text-ink transition-colors duration-120 hover:bg-board-deep focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                type="button"
                onClick={() => switchMode("admin")}
              >
                Use username and password instead
              </button>
            </div>
          ) : (
            <div>
              <p className="m-0 text-ui-sm font-semibold text-ink-soft">Platform administrator sign-in</p>
              <form action={platformAdminSignInAction} className="mt-5 grid gap-4">
                <div className="grid gap-1.5">
                  <label className="text-ui-sm font-semibold" htmlFor="admin-username">Username</label>
                  <Field autoComplete="username" autoCapitalize="none" autoCorrect="off" id="admin-username" name="username" required spellCheck={false} type="text" />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-ui-sm font-semibold" htmlFor="admin-password">Password</label>
                  <Field autoComplete="current-password" id="admin-password" name="password" required type="password" />
                </div>
                <SubmitButton className="mt-2 w-full justify-center" variant="primary" pendingLabel="Signing in…">Log in</SubmitButton>
              </form>
              <button
                className="mt-5 min-h-touch text-ui-sm font-semibold text-ink-muted underline underline-offset-4 transition-colors duration-120 hover:text-ink focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                type="button"
                onClick={() => switchMode("google")}
              >
                Back to Google sign-in
              </button>
            </div>
          )}

          {devAuthEnabled && (
            <details className="mt-6 border-t border-rule pt-4 text-ui-xs text-ink-muted">
              <summary className="cursor-pointer font-semibold">Development sign-in</summary>
              <form action={devLoginAction} className="mt-3 grid gap-2">
                <label htmlFor="dev-email">Existing user email</label>
                <Field id="dev-email" name="email" placeholder="teacher@up.edu.ph" required type="email" />
                <SubmitButton className="justify-center" variant="secondary" size="small" pendingLabel="Signing in…">Sign in locally</SubmitButton>
              </form>
            </details>
          )}
        </section>
      </div>
    </main>
  );
}
