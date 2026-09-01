import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { loadStaffSection, sectionLabel } from "@/lib/staff-section";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionTabs } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import { AccessDenied } from "@/components/ui";
import {
  RosterImport,
  type ImportState,
  type PreviewRow,
} from "@/components/staff/roster-import";
import {
  applyPreviewEdits,
  commitRosterImport,
  parseRosterCsv,
  parseRosterXlsx,
  previewRosterImport,
  type ParsedRoster,
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
  const path = `/teach/sections/${sectionId}/import`;
  const ctx = await loadStaffSection(sectionId, "viewStudentIdentities");
  if (!ctx.ok) {
    return (
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={await primaryNavFor(ctx.user, path)}
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
    const intent = String(formData.get("intent") ?? "preview");
    const csv = String(formData.get("csv") ?? "");

    try {
      // On confirm, the roster is the one the preview produced, plus whatever the
      // staff member corrected. Both are re-validated: applyPreviewEdits accepts
      // only rowKeys that were actually parsed, and commitRosterImport re-derives
      // every action from live data inside its transaction.
      let parsed: ParsedRoster;
      let fileName: string | undefined;
      if (intent === "commit") {
        const raw = String(formData.get("parsed") ?? "");
        if (!raw) {
          return { status: "error", csv, message: "The preview expired. Preview the list again." };
        }
        parsed = applyPreviewEdits(
          JSON.parse(raw) as ParsedRoster,
          JSON.parse(String(formData.get("edits") ?? "[]")),
        );
        const summary = await commitRosterImport(
          uid,
          sectionId,
          parsed,
          String(formData.get("source") || "class list"),
        );
        revalidatePath(`/teach/sections/${sectionId}/import`);
        return {
          status: "done",
          csv: "",
          summary: summary as unknown as Record<string, number | string>,
        };
      }

      const upload = formData.get("file");
      if (upload instanceof File && upload.size > 0) {
        fileName = upload.name;
        parsed = await parseRosterXlsx(
          Buffer.from(await upload.arrayBuffer()),
        );
      } else if (csv.trim()) {
        parsed = parseRosterCsv(csv);
      } else {
        return {
          status: "error",
          csv,
          message: "Choose an .xlsx class list, or paste the list as CSV.",
        };
      }

      const preview = await previewRosterImport(uid, sectionId, parsed);
      if (preview.fileError) {
        return { status: "preview", csv, fileError: preview.fileError };
      }

      // One preview row per parsed row, carrying the planned action. `blocked`
      // wins over every other plan for a row: it is what actually happens.
      const planByKey = new Map(
        preview.actions
          .filter((a) => a.kind !== "unchanged")
          .sort((a, b) =>
            a.kind === "blocked" ? 1 : b.kind === "blocked" ? -1 : 0,
          )
          .map((a) => [a.row.rowKey, a]),
      );
      const rows: PreviewRow[] = parsed.rows.map((row) => {
        const action = planByKey.get(row.rowKey);
        return {
          rowKey: row.rowKey,
          line: row.line,
          studentNumber: row.studentNumber,
          // What the file said, so a teacher fixes what they can see. The
          // normalized form is derived on commit, never round-tripped.
          email: row.emailRaw ?? row.email,
          fullName: row.fullName,
          familyName: row.familyName,
          firstName: row.firstName,
          middleName: row.middleName,
          livedName: row.livedName,
          preferredPronoun: row.preferredPronoun,
          program: row.program,
          crsStatusRaw: row.crsStatusRaw,
          crsStatus: row.crsStatus,
          enlistmentDate: row.enlistmentDate,
          warnings: row.warnings.map((warning) => ({
            code: warning.code,
            detail:
              warning.code === "duplicate_student_number" ||
              warning.code === "duplicate_email"
                ? `first seen on line ${warning.firstSeenLine}`
                : warning.code === "unknown_status" ||
                    warning.code === "not_enrolled_status"
                  ? warning.raw
                  : warning.code === "conflicting_existing_record"
                    ? `${warning.field}: stored “${warning.existing}”`
                    : warning.code === "disallowed_email_domain"
                      ? warning.domain
                      : warning.code === "email_belongs_to_another_record"
                        ? // The tail of the OTHER student's number, never their
                          // name or email: enough to find the clash in the file,
                          // not enough to learn who they are.
                          warning.existingLast4
                          ? `student number ending ${warning.existingLast4}`
                          : undefined
                        : undefined,
          })),
          plan: action?.kind ?? "unchanged",
          currentName:
            action?.kind === "update_name" ? action.currentName : undefined,
          currentEmail:
            action?.kind === "link_email" ? action.currentEmail : undefined,
        };
      });

      return {
        status: "preview",
        csv,
        parsed: JSON.stringify(parsed),
        source: parsed.source,
        fileName,
        rows,
        rowErrors: preview.errors,
        ignoredColumns: preview.ignoredColumns,
        deniedColumns: preview.deniedColumns,
        courseMeta: preview.courseMeta as unknown as Record<string, string | null>,
        deactivations: preview.toDeactivate.map((d) => ({
          studentNumberLast4: d.studentNumberLast4,
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
      navGroups={await primaryNavFor(user, path, {
        /* A section is reached through its course, and the course now has its
           own rail row — so mark that one rather than the courses index. */
        fallbackHref: `/teach/courses/${course.id}`,
      })}
      tabs={staffSectionTabs(access, path, {
        activeHref: `/teach/sections/${sectionId}/roster`,
      })}
      tabsLabel={sectionLabel(course.code, section.title)}
      tabsMode="menu"
      contextLabel={sectionLabel(course.code, section.title)}
      title="Import the class list"
    >
      {/* No "how matching works" explainer: there is no matching. The reader is
          here to upload a file; the field's own helper text carries what the
          file needs and what is never imported. */}
      <RosterImport action={run} />
    </AppShell>
  );
}
