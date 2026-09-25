import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { primaryNavFor } from "@/lib/nav-context";
import { AccessDenied } from "@/components/ui";
import { listOpenInstancesForStudent } from "@/modules/forms/submission";
import { AuthzError } from "@/modules/authz";
import { getSectionWithCourse } from "@/modules/catalog";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * Legacy section entry point.
 *
 * Forms are now entered through the course workspace. A single live form still
 * gets the direct-action shortcut; otherwise the course Forms tab owns the list.
 */
export default async function SectionEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: sectionId } = await params;
  const path = `/sections/${sectionId}`;

  let open: Awaited<ReturnType<typeof listOpenInstancesForStudent>>;
  try {
    open = await listOpenInstancesForStudent(user.id, sectionId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="student"
          navGroups={await primaryNavFor(user, path)}
          title="Class section"
        >
          <AccessDenied what="this class section" />
        </AppShell>
      );
    }
    throw err;
  }

  const { course } = await getSectionWithCourse(sectionId);
  if (open.length === 1) redirect(`/forms/${open[0]!.instance.id}`);
  redirect(`/courses/${course.id}`);
}
