import { redirect } from "next/navigation";

/**
 * "Templates" became "Forms".
 *
 * The old route survives because links and bookmarks point at it. A form is no
 * longer a template waiting to be attached to a weekly schedule — it is the
 * object a teacher works on, so the destination is the course workspace.
 */
export default async function TemplatesRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; new?: string }>;
}) {
  const { id: courseId } = await params;
  const { edit, new: isNew } = await searchParams;
  if (edit) redirect(`/teach/courses/${courseId}/forms/${edit}`);
  if (isNew === "1") redirect(`/teach/courses/${courseId}/forms/new`);
  redirect(`/teach/courses/${courseId}`);
}
