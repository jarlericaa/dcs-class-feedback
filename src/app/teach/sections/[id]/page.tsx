import { redirect } from "next/navigation";

import { firstStaffSectionHref } from "@/components/layout/nav";
import { requireUser } from "@/lib/session";
import { authz } from "@/modules/authz";

/**
 * The staff root of one class section.
 *
 * A section has no overview of its own — it is a set of peer views — but the
 * sidebar needs somewhere stable to point for an assistant whose only standing
 * is on the section, and a bookmark of `/teach/sections/<id>` should land
 * somewhere rather than 404. So this resolves the reader's first permitted view
 * and forwards to it.
 *
 * It reads permissions to choose a destination and nothing else. Authorization
 * happens on whichever page it lands on, which re-checks from scratch.
 */
export default async function StaffSectionRootPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: sectionId } = await params;

  const access = await authz.getSectionAccess(user.id, sectionId);
  // No staff standing — including the enrolled-student case, whose section
  // lives under /sections. Sending them to their own view is both more useful
  // than a denial and says nothing about whether a staff view exists.
  if (!access?.staff) {
    if (access?.studentRecordId) redirect(`/sections/${sectionId}`);
    redirect("/");
  }

  const href = firstStaffSectionHref(access);
  redirect(href ?? "/");
}
