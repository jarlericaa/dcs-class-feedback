import { redirectSectionToCourse } from "@/lib/legacy-section-redirect";

/**
 * Editorial work moved to the course (ADR-0005): one course, one Question
 * Backlog workspace.
 * This forwards the old section URL to it, keeping any meaningful query.
 */
export default async function SectionPublicationsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: sectionId } = await params;
  return redirectSectionToCourse(
    sectionId,
    (courseId) => `/teach/courses/${courseId}/backlog`,
    await searchParams,
  );
}
