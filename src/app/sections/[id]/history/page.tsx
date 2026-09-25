import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { primaryNavFor } from "@/lib/nav-context";
import { AccessDenied } from "@/components/ui";
import { getStudentHistory } from "@/modules/publishing";
import { AuthzError } from "@/modules/authz";
import { getSectionWithCourse } from "@/modules/catalog";
import { requireUser, toShellUser } from "@/lib/session";

/** Legacy section history URL; the course owns the submission archive now. */
export default async function HistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: sectionId } = await params;
  const path = `/sections/${sectionId}/history`;

  try {
    /* Authorize before redirecting, so an old URL cannot probe a course. */
    await getStudentHistory(user.id, sectionId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="student"
          navGroups={await primaryNavFor(user, path)}
          title="My submissions"
        >
          <AccessDenied what="this class section" />
        </AppShell>
      );
    }
    throw err;
  }

  const { course } = await getSectionWithCourse(sectionId);
  redirect(`/courses/${course.id}/submissions`);
}
