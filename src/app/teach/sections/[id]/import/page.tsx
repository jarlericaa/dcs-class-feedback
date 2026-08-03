import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { loadStaffSection } from "@/lib/staff-section";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionNav } from "@/components/layout/nav";
import { AccessDenied, Alert, Breadcrumbs } from "@/components/ui";
import {
  RosterImport,
  type ImportState,
  type PreviewAction,
} from "@/components/staff/roster-import";
import {
  commitRosterImport,
  parseRosterCsv,
  previewRosterImport,
} from "@/modules/roster-import";
import { AuthzError } from "@/modules/authz";
import { toShellUser } from "@/lib/session";

/**
 * Roster CSV import. Preview applies nothing; the commit re-derives the plan
 * from current data inside its own transaction, and deactivation never
 * deletes a student's history.
 */
export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sectionId } = await params;
  const ctx = await loadStaffSection(sectionId, "viewStudentIdentities");
  if (!ctx.ok) {
    return (
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={[]}
        title="Roster import"
      >
        <AccessDenied what="this section's roster" />
      </AppShell>
    );
  }
  const { user, access, section, course } = ctx;

  async function run(
    _prev: ImportState,
    formData: FormData,
  ): Promise<ImportState> {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const csv = String(formData.get("csv") ?? "");
    const intent = String(formData.get("intent") ?? "preview");
    const parsed = parseRosterCsv(csv);

    try {
      if (intent === "commit") {
        const summary = await commitRosterImport(
          uid,
          sectionId,
          parsed,
          String(formData.get("source") || "pasted CSV"),
        );
        revalidatePath(`/teach/sections/${sectionId}/import`);
        return {
          status: "done",
          csv: "",
          summary: summary as unknown as Record<string, number | string>,
        };
      }

      const preview = await previewRosterImport(uid, sectionId, parsed);
      return {
        status: "preview",
        csv,
        fileError: preview.fileError,
        rowErrors: preview.errors,
        actions: preview.actions.map((action): PreviewAction => ({
          kind: action.kind,
          studentNumber: action.row.studentNumber,
          fullName: action.row.fullName,
          currentName:
            action.kind === "update_name" || action.kind === "name_diff_locked"
              ? action.currentName
              : undefined,
        })),
        deactivations: preview.toDeactivate.map((d) => ({
          studentNumber: d.studentNumber,
          name: d.name,
        })),
      };
    } catch (err) {
      if (err instanceof AuthzError) {
        return { status: "error", csv, message: err.message };
      }
      if (err instanceof Error) {
        return { status: "error", csv, message: err.message };
      }
      throw err;
    }
  }

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={staffSectionNav(access, `/teach/sections/${sectionId}/import`)}
      contextLabel={section.title}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/", label: "Overview" },
            { label: `${course.code} · ${section.term}` },
            { label: "Roster import" },
          ]}
        />
      }
      eyebrow="Staff only"
      title="Import the class list"
    >
      <div className="stack-gap">
        <Alert variant="info" title="How matching works">
          Class lists only have a student number and a name, so the platform
          proposes account matches but never confirms one. You confirm every
          student on the account matches page.
        </Alert>
        <RosterImport action={run} />
      </div>
    </AppShell>
  );
}
