import { SubmitButton } from "@/components/ui/submit-button";
import { RequiredMark } from "@/components/ui/required-mark";
import { Dialog } from "@/components/ui/dialog";
import { Field, FieldRow, Textarea } from "@/components/ui/form";

/**
 * Import the class list, as a modal on the class list itself.
 *
 * It used to be its own navigation destination with a two-step editable
 * preview. GitHub issue #12 asked for one step on the page the list already
 * lives on: choose a CSV, apply, read what happened. So this is a server
 * component holding a plain form — no client state at all, because there is
 * nothing to hold between steps any more.
 *
 * The class list accepts the registrar's `.xlsx` export and pasted or uploaded
 * CSV. Both paths use the same server-side safety and identity rules.
 *
 * Nothing is previewed and nothing is confirmed, which is safe because it never
 * depended on the preview: `commitRosterImport` re-derives every decision from
 * live data inside one transaction, refuses a row whose UP email it cannot
 * trust, and deactivates rather than deletes anyone the file no longer
 * mentions. What the reader loses is the chance to fix the FILE first, so the
 * screen that follows has to say exactly which lines were refused — see
 * `getRosterImportOutcome`.
 */
export function RosterImportDialog({
  action,
  label = "Import the class list",
  sectionTitle,
}: {
  action: (formData: FormData) => Promise<void>;
  label?: string;
  sectionTitle: string;
}) {
  return (
    <Dialog
      variant="primary"
      label={label}
      title="Import the class list"
      description={`This replaces the whole class list for ${sectionTitle}.`}
    >
      <form action={action} encType="multipart/form-data">
        <FieldRow
          label={
            <>
              The class list, as CSV or Excel <RequiredMark />
            </>
          }
          htmlFor="roster-file"
        >
          <Field
            id="roster-file"
            type="file"
            name="file"
            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            // The asterisk beside the label promises this; without it the
            // browser would let an empty submit through to the server.
            required
          />
          <span className="helper-text">
            Upload a CRS-style .xlsx or CSV file with a student number, a name
            and their UP email. The UP email is what gives that person access,
            so a row without a usable one is not imported. Sex and gender
            columns are refused.
          </span>
        </FieldRow>

        {/* Kept because it is how a short list or a corrected row actually
            arrives — pasted out of the spreadsheet. Same parser, same rules. */}
        <details className="disclose disclose--inset">
          <summary>Or paste the rows instead</summary>
          <div className="disclose__body">
            <FieldRow label="Rows as CSV" htmlFor="roster-csv">
              <Textarea
                id="roster-csv"
                name="csv"
                rows={6}
                placeholder={
                  "Student Number,Name,UP Mail\n2026-00001,Juan Dela Cruz,juan@up.edu.ph"
                }
              />
            </FieldRow>
          </div>
        </details>

        {/* Said before the button, not after it: this applies immediately. */}
        <p className="helper-text">
          Applying this takes effect at once. Students the file no longer lists
          are marked as dropped and keep everything they have already written —
          nothing is deleted.
        </p>

        <div className="row">
          <SubmitButton variant="primary" pendingLabel="Importing…">
            Import and apply
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
