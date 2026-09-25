import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EntryScreen } from "@/components/marketing/entry-screen";
import { env } from "@/env";

/**
 * Auth.js redirects here, and it renders the same entry screen as `/` so the
 * signed-out experience is one screen rather than two that drift apart.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; method?: string }>;
}) {
  const session = await auth();
  if (session?.principal?.type === "platform-admin") redirect("/admin");
  if (session?.userId) redirect("/");
  const { error, method } = await searchParams;
  return (
    <EntryScreen
      error={error}
      initialMode={method === "admin" ? "admin" : "google"}
      googleConfigured={!!(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET)}
      devAuthEnabled={env.devAuthEnabled}
    />
  );
}
