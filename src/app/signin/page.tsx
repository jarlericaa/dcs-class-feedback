import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EntryScreen } from "@/components/marketing/entry-screen";

/**
 * Auth.js redirects here, and it renders the same entry screen as `/` so the
 * signed-out experience is one screen rather than two that drift apart.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.userId) redirect("/");
  const { error } = await searchParams;
  return <EntryScreen error={error} />;
}
