import { redirectSectionToCourse } from "@/lib/legacy-section-redirect";

/**
 * Class Q&A is one archive per COURSE (ADR-0005), not one per class list.
 *
 * This forwards the old per-section URL and keeps the selected entry, search
 * and category, so a link a teacher sent to their class last term still opens
 * the same answer.
 */
export default async function SectionQaRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: sectionId } = await params;
  return redirectSectionToCourse(
    sectionId,
    (courseId) => `/courses/${courseId}/qa`,
    await searchParams,
  );
}
