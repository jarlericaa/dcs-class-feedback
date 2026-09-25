import { redirectSectionToCourse } from "@/lib/legacy-section-redirect";

/**
 * The question backlog was always course-owned; only its doorway was a section.
 * ADR-0005 moved the doorway to match, and this forwards the old URL to it.
 */
export default async function SectionBacklogRedirect({
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
