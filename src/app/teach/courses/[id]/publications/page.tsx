import { redirect } from "next/navigation";
import { courseBacklogHref } from "@/lib/legacy-section-redirect";

/**
 * Compatibility route for bookmarks from before the editorial workflow was
 * consolidated into Question Backlog.
 */
export default async function LegacyPublicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  redirect(courseBacklogHref(id, query));
}
