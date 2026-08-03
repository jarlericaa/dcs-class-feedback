"use client";

import { useActionState, useState } from "react";
import { Alert, Badge } from "@/components/ui";

/**
 * Roster import: upload an XLSX (or paste CSV) → EDITABLE preview → confirm.
 *
 * Two things this component exists to get right:
 *
 * 1. The parsed rows stay in this component's state between preview and confirm,
 *    and are posted back in a hidden field. They are never round-tripped through
 *    the query string, which would put student names in browser history and
 *    server logs.
 * 2. The preview is editable, because an `.xlsx` numeric cell has already lost a
 *    leading zero before the file reached us. Staff fix the value here rather
 *    than us guessing a width and inventing an identifier.
 *
 * The preview changes nothing; commitRosterImport re-validates the edited rows
 * as untrusted input and re-derives the plan inside its own transaction, so a
 * stale or tampered preview cannot apply the wrong thing.
 */

export type WarningCode =
  | "numeric_student_number"
  | "malformed_student_number"
  | "duplicate_student_number"
  | "unknown_status"
  | "not_enrolled_status"
  | "missing_required"
  | "conflicting_existing_record";

export interface PreviewRow {
  rowKey: string;
  line: number;
  studentNumber: string;
  fullName: string;
  familyName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  livedName?: string | null;
  preferredPronoun?: string | null;
  program?: string | null;
  crsStatusRaw?: string | null;
  crsStatus: "enrolled" | "not_enrolled" | "unknown";
  enlistmentDate?: string | null;
  warnings: { code: WarningCode; detail?: string }[];
  plan: PreviewAction["kind"];
  currentName?: string;
}

export interface PreviewAction {
  kind:
    | "create"
    | "enroll_existing"
    | "reactivate"
    | "update_name"
    | "name_diff_locked"
    | "unchanged";
  studentNumber: string;
  fullName: string;
  currentName?: string;
}

export interface ImportState {
  status: "idle" | "preview" | "done" | "error";
  /** raw pasted CSV, kept so the textarea survives a failed attempt */
  csv: string;
  /** serialized parsed roster, posted back on confirm */
  parsed?: string;
  source?: "csv" | "xlsx";
  fileName?: string;
  message?: string;
  fileError?: string;
  rows?: PreviewRow[];
  deactivations?: { studentNumberLast4: string | null; name: string }[];
  rowErrors?: { line: number; message: string }[];
  ignoredColumns?: string[];
  deniedColumns?: string[];
  courseMeta?: Record<string, string | null>;
  summary?: Record<string, number | string>;
}

const ACTION_COPY: Record<
  PreviewAction["kind"],
  { label: string; tone: "green" | "amber" | "neutral" | "red" }
> = {
  create: { label: "New student record", tone: "green" },
  enroll_existing: { label: "Enrol existing record", tone: "green" },
  reactivate: { label: "Reactivate enrolment", tone: "amber" },
  update_name: { label: "Update name", tone: "amber" },
  name_diff_locked: { label: "Name change blocked", tone: "red" },
  unchanged: { label: "No change", tone: "neutral" },
};

const WARNING_COPY: Record<WarningCode, { label: string; tone: "amber" | "red" }> = {
  numeric_student_number: {
    label: "Stored as a number — check for a lost leading zero",
    tone: "red",
  },
  malformed_student_number: { label: "Does not look like a student number", tone: "red" },
  duplicate_student_number: { label: "Duplicate in this file", tone: "red" },
  unknown_status: { label: "Unrecognized enrollment status", tone: "amber" },
  not_enrolled_status: { label: "Not enrolled per the spreadsheet", tone: "amber" },
  missing_required: { label: "Missing a required field", tone: "red" },
  conflicting_existing_record: { label: "Differs from stored data", tone: "amber" },
};

export function RosterImport({
  action,
}: {
  action: (state: ImportState, formData: FormData) => Promise<ImportState>;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
    csv: "",
  } satisfies ImportState);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [edits, setEdits] = useState<Record<string, Partial<PreviewRow>>>({});

  const rows = state.rows ?? [];
  const rowValue = (row: PreviewRow, field: keyof PreviewRow) =>
    (edits[row.rowKey]?.[field] as string | undefined) ??
    ((row[field] as string | null | undefined) ?? "");
  const setEdit = (rowKey: string, field: keyof PreviewRow, value: string) =>
    setEdits((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [field]: value },
    }));

  // Rows needing attention float to the top so they are impossible to miss.
  const ordered = [...rows].sort(
    (a, b) => b.warnings.length - a.warnings.length || a.line - b.line,
  );
  const editedRows = rows
    .filter((row) => edits[row.rowKey])
    .map((row) => ({
      line: row.line,
      rowKey: row.rowKey,
      studentNumber: String(rowValue(row, "studentNumber")),
      fullName: String(rowValue(row, "fullName")),
      familyName: row.familyName ?? null,
      firstName: row.firstName ?? null,
      middleName: row.middleName ?? null,
      livedName: String(rowValue(row, "livedName")) || null,
      preferredPronoun: String(rowValue(row, "preferredPronoun")) || null,
      program: String(rowValue(row, "program")) || null,
      crsStatusRaw: row.crsStatusRaw ?? null,
      crsStatus: (edits[row.rowKey]?.crsStatus ?? row.crsStatus) as PreviewRow["crsStatus"],
      enlistmentDate: row.enlistmentDate ?? null,
    }));

  return (
    <div className="stack-gap">
      {state.status === "done" && state.summary && (
        <Alert variant="success" title="Import complete">
          {Object.entries(state.summary)
            .filter(([key]) => key !== "importBatchId")
            .map(([key, value]) => `${humanize(key)}: ${value}`)
            .join(" · ")}
        </Alert>
      )}
      {state.status === "error" && (
        <Alert variant="error" title="Import failed">
          {state.message}
        </Alert>
      )}
      {state.fileError && (
        <Alert variant="error" title="This file cannot be read">
          {state.fileError}
        </Alert>
      )}

      <form action={formAction} className="card card--padded" encType="multipart/form-data">
        <div
          className="row-gap"
          role="group"
          aria-label="How to provide the class list"
          style={{ marginBottom: 12 }}
        >
          <button
            type="button"
            className={`button ${mode === "file" ? "button--primary" : "button--secondary"}`}
            aria-pressed={mode === "file"}
            onClick={() => setMode("file")}
          >
            Upload the CRS file
          </button>
          <button
            type="button"
            className={`button ${mode === "paste" ? "button--primary" : "button--secondary"}`}
            aria-pressed={mode === "paste"}
            onClick={() => setMode("paste")}
          >
            Paste CSV instead
          </button>
        </div>

        {mode === "file" ? (
          <div className="field-row">
            <label htmlFor="roster-file">CRS class list (.xlsx)</label>
            <input
              id="roster-file"
              className="field"
              type="file"
              name="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-describedby="roster-file-help"
            />
            <span className="helper-text" id="roster-file-help">
              The sheet needs a header row with a <code>Student Number</code>{" "}
              column and a name column. Course details and the extra student
              columns are detected automatically.{" "}
              <strong>Sex Assigned at Birth is never imported.</strong>
            </span>
          </div>
        ) : (
          <div className="field-row">
            <label htmlFor="csv">Paste the class list as CSV</label>
            <textarea
              id="csv"
              className="textarea-field"
              name="csv"
              rows={8}
              defaultValue={state.csv}
              placeholder={"student number,full name\n2026-0001,Juan Dela Cruz"}
              aria-describedby="csv-help"
            />
            <span className="helper-text" id="csv-help">
              A header row is required, with a <code>student number</code> column
              and a name column. Unrecognized columns are reported and ignored.
            </span>
          </div>
        )}

        <div className="form-actions">
          <p className="muted small" style={{ margin: 0 }}>
            Previewing changes nothing.
          </p>
          <button
            className="button button--secondary"
            type="submit"
            name="intent"
            value="preview"
            disabled={pending}
          >
            {pending ? "Working…" : "Preview changes"}
          </button>
        </div>
      </form>

      {state.status === "preview" && !state.fileError && (
        <section className="card">
          <div className="card__header">
            <div>
              <h2>Preview</h2>
              <p>
                Nothing has been applied yet. Fix anything flagged below, then
                confirm.
              </p>
            </div>
          </div>

          <div className="card__body stack-gap">
            {state.courseMeta &&
              Object.values(state.courseMeta).some((v) => v) && (
                <div>
                  <h3>Detected course details</h3>
                  <ul className="data-list card">
                    {Object.entries(state.courseMeta)
                      .filter(([, value]) => value)
                      .map(([key, value]) => (
                        <li key={key}>
                          <span className="data-list__main">
                            <strong>{value}</strong>
                            <small>{humanize(key)}</small>
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

            {(state.deniedColumns?.length ?? 0) > 0 && (
              <Alert variant="info" title="Columns deliberately not imported">
                {state.deniedColumns!.join(", ")} — this product has no use for
                it, so it is never stored.
              </Alert>
            )}
            {(state.ignoredColumns?.length ?? 0) > 0 && (
              <Alert variant="info" title="Columns not recognized">
                {state.ignoredColumns!.join(", ")} — these were left out. Rename
                the header if one of them should have been imported.
              </Alert>
            )}

            {(state.rowErrors?.length ?? 0) > 0 && (
              <Alert variant="warning" title="Some rows will be skipped">
                <ul>
                  {state.rowErrors!.map((rowError, index) => (
                    <li key={index}>
                      Line {rowError.line}: {rowError.message}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}

            <div className="table-scroll">
              <table className="table">
                <caption className="visually-hidden">
                  Rows to import, with editable student numbers and names
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Line</th>
                    <th scope="col">Student number</th>
                    <th scope="col">Name</th>
                    <th scope="col">Status</th>
                    <th scope="col">Plan</th>
                    <th scope="col">Needs attention</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((row) => {
                    const copy = ACTION_COPY[row.plan];
                    return (
                      <tr key={row.rowKey}>
                        <td>{row.line}</td>
                        <td>
                          <label
                            className="visually-hidden"
                            htmlFor={`sn-${row.rowKey}`}
                          >
                            Student number on line {row.line}
                          </label>
                          <input
                            id={`sn-${row.rowKey}`}
                            className="field"
                            value={String(rowValue(row, "studentNumber"))}
                            onChange={(e) =>
                              setEdit(row.rowKey, "studentNumber", e.target.value)
                            }
                            aria-invalid={row.warnings.some(
                              (w) =>
                                w.code === "numeric_student_number" ||
                                w.code === "malformed_student_number" ||
                                w.code === "duplicate_student_number",
                            )}
                          />
                        </td>
                        <td>
                          <label
                            className="visually-hidden"
                            htmlFor={`nm-${row.rowKey}`}
                          >
                            Name on line {row.line}
                          </label>
                          <input
                            id={`nm-${row.rowKey}`}
                            className="field"
                            value={String(rowValue(row, "fullName"))}
                            onChange={(e) =>
                              setEdit(row.rowKey, "fullName", e.target.value)
                            }
                          />
                          {row.currentName && (
                            <small className="muted">
                              currently “{row.currentName}”
                            </small>
                          )}
                        </td>
                        <td>{row.crsStatusRaw ?? row.crsStatus}</td>
                        <td>
                          <Badge tone={copy.tone}>{copy.label}</Badge>
                        </td>
                        <td>
                          {row.warnings.length === 0 ? (
                            <span className="muted small">—</span>
                          ) : (
                            <ul className="plain-list">
                              {row.warnings.map((warning, i) => (
                                <li key={i}>
                                  <Badge tone={WARNING_COPY[warning.code].tone}>
                                    {WARNING_COPY[warning.code].label}
                                  </Badge>
                                  {warning.detail && (
                                    <small className="muted"> {warning.detail}</small>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {(state.deactivations?.length ?? 0) > 0 && (
              <div>
                <div className="row-gap" style={{ marginBottom: 8 }}>
                  <Badge tone="amber">Deactivate enrolment</Badge>
                  <span className="muted small">
                    {state.deactivations!.length} student(s) absent from this file
                  </span>
                </div>
                <Alert variant="info">
                  Deactivation never deletes anything. Their submissions,
                  history and participation record are kept.
                </Alert>
                <ul className="data-list card" style={{ marginTop: 10 }}>
                  {state.deactivations!.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      <span className="data-list__main">
                        <strong>{item.name}</strong>
                        <small>
                          {item.studentNumberLast4
                            ? `…${item.studentNumberLast4}`
                            : "student number not shown"}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="card__footer">
            <form action={formAction} className="stack-gap">
              <input type="hidden" name="parsed" value={state.parsed ?? ""} />
              <input
                type="hidden"
                name="edits"
                value={JSON.stringify(editedRows)}
              />
              <div className="field-row" style={{ maxWidth: 420 }}>
                <label htmlFor="source">Where did this list come from?</label>
                <input
                  id="source"
                  className="field"
                  name="source"
                  defaultValue={
                    state.fileName ??
                    (state.source === "xlsx" ? "CRS class list" : "pasted CSV")
                  }
                />
                <span className="helper-text">
                  Recorded on the import so the change can be traced later.
                </span>
              </div>
              {editedRows.length > 0 && (
                <Alert variant="info">
                  {editedRows.length} row(s) edited here will be imported with
                  your corrections, and the edit is recorded in the audit log.
                </Alert>
              )}
              <div>
                <button
                  className="button button--primary"
                  type="submit"
                  name="intent"
                  value="commit"
                  disabled={pending}
                >
                  {pending ? "Importing…" : "Confirm import"}
                </button>
              </div>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}

function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
