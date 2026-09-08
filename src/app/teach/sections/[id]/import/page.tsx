import { redirect } from "next/navigation";

/**
 * The roster importer moved onto the class list.
 *
 * It used to be its own destination carrying a two-step editable preview.
 * GitHub issue #12 asked for one step on the page the list already lives on, so
 * the import is now a modal behind the class list's own "Import the class list"
 * button.
 *
 * This route survives because links, bookmarks and a term of muscle memory
 * point at it. It forwards, rather than 404s, and resolves nothing: the
 * destination performs its own authorization, which is where authorization
 * belongs.
 */
export default async function SectionImportRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sectionId } = await params;
  redirect(`/teach/sections/${sectionId}/roster`);
}
