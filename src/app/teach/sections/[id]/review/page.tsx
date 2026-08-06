import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classSections } from "@/db/schema";

/**
 * The review inbox moved to the course.
 *
 * A form shared by several sections has ONE queue — that is the point of sharing
 * it — so a per-section inbox would recreate a separation students never
 * experience. This route survives because links, bookmarks and the section nav
 * point at it: it forwards to the course inbox with this section preselected, so
 * a reader who arrives from a section context still lands on their own rows.
 *
 * Authorization happens on the destination. This resolves an id and nothing else.
 */
export default async function SectionReviewRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: sectionId } = await params;
  const sp = await searchParams;

  const section = await db.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
    columns: { id: true, courseId: true },
  });
  if (!section) redirect("/teach/courses");

  const query = new URLSearchParams({ section: sectionId });
  for (const key of ["selected", "filter", "cycle", "category", "q"] as const) {
    const value = sp[key];
    if (typeof value === "string" && value) query.set(key, value);
  }
  redirect(`/teach/courses/${section.courseId}/responses?${query.toString()}`);
}
