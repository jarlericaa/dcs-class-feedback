import { redirect } from "next/navigation";
import { currentUserId } from "@/auth";
import { AuthzError } from "@/modules/authz";
import {
  commitRosterImport,
  parseRosterCsv,
  previewRosterImport,
  type ImportPreview,
} from "@/modules/roster-import";

/** Roster CSV import: paste → preview → confirm. Nothing applies at preview. */
export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/signin");
  const { id: sectionId } = await params;
  const { done } = await searchParams;

  async function preview(formData: FormData) {
    "use server";
    // Round-trip the CSV so the confirm step re-validates from scratch.
    const csv = String(formData.get("csv") ?? "");
    redirect(
      `/teach/sections/${sectionId}/import?` +
        new URLSearchParams({ csv }).toString(),
    );
  }

  async function confirm(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const csv = String(formData.get("csv") ?? "");
    const summary = await commitRosterImport(
      uid,
      sectionId,
      parseRosterCsv(csv),
      String(formData.get("source") || "pasted CSV"),
    );
    redirect(
      `/teach/sections/${sectionId}/import?done=${encodeURIComponent(
        JSON.stringify(summary),
      )}`,
    );
  }

  const sp = await searchParams;
  const csv = (sp as Record<string, string>).csv ?? "";
  let previewResult: ImportPreview | null = null;
  if (csv) {
    try {
      previewResult = await previewRosterImport(userId, sectionId, parseRosterCsv(csv));
    } catch (err) {
      if (err instanceof AuthzError) {
        return <main><p>You do not have access to this section.</p></main>;
      }
      throw err;
    }
  }

  return (
    <main>
      <h1>Import class roster (CSV)</h1>
      <p>
        Required columns: <code>student number</code>, <code>full name</code>.
        Preview first — nothing changes until you confirm.
      </p>
      {done && (
        <p style={{ color: "green" }}>Import complete: {done}</p>
      )}
      <form action={preview}>
        <textarea
          name="csv"
          rows={8}
          style={{ width: "100%" }}
          defaultValue={csv}
          placeholder={"student number,full name\n2026-001,Juan Dela Cruz"}
          required
        />
        <button type="submit">Preview</button>
      </form>

      {previewResult && (
        <section>
          <h2>Preview</h2>
          {previewResult.fileError && (
            <p style={{ color: "crimson" }}>{previewResult.fileError}</p>
          )}
          <ul>
            {previewResult.actions.map((a, i) => (
              <li key={i}>
                {a.kind === "create" &&
                  `CREATE ${a.row.fullName} (${a.row.studentNumber})`}
                {a.kind === "enroll_existing" &&
                  `ENROLL existing record ${a.row.studentNumber}`}
                {a.kind === "reactivate" && `REACTIVATE ${a.row.studentNumber}`}
                {a.kind === "unchanged" && `unchanged ${a.row.studentNumber}`}
                {a.kind === "update_name" &&
                  `RENAME ${a.row.studentNumber}: "${a.currentName}" → "${a.row.fullName}"`}
                {a.kind === "name_diff_locked" &&
                  `LOCKED name difference for verified student ${a.row.studentNumber}: roster says "${a.row.fullName}", canonical stays "${a.currentName}" (correct manually if needed)`}
              </li>
            ))}
            {previewResult.toDeactivate.map((d) => (
              <li key={d.studentRecordId} style={{ color: "darkorange" }}>
                DEACTIVATE {d.name} ({d.studentNumber}) — absent from new list
                (kept, never deleted)
              </li>
            ))}
            {previewResult.errors.map((e, i) => (
              <li key={`e${i}`} style={{ color: "crimson" }}>
                Line {e.line}: {e.message}
              </li>
            ))}
          </ul>
          {!previewResult.fileError && (
            <form action={confirm}>
              <input type="hidden" name="csv" value={csv} />
              <input name="source" placeholder="Source description (e.g. registrar list v2)" />
              <button type="submit">Confirm import</button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
