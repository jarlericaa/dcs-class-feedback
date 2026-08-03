"use client";

import { useActionState } from "react";
import { Alert, Badge } from "@/components/ui";

/**
 * Roster import: paste → preview → confirm.
 *
 * The CSV stays in the form (and in this component's state) between the
 * preview and the confirm step. The previous implementation round-tripped the
 * whole file through the query string, which breaks on a real class list and
 * puts student names in browser history and server logs.
 *
 * The preview never changes anything; commitRosterImport re-derives the plan
 * inside its own transaction, so a stale preview cannot apply the wrong thing.
 */

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
  csv: string;
  message?: string;
  fileError?: string;
  actions?: PreviewAction[];
  deactivations?: { studentNumber: string; name: string }[];
  rowErrors?: { line: number; message: string }[];
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

export function RosterImport({
  action,
}: {
  action: (state: ImportState, formData: FormData) => Promise<ImportState>;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
    csv: "",
  } satisfies ImportState);

  const grouped = (state.actions ?? []).reduce<
    Record<string, PreviewAction[]>
  >((acc, item) => {
    (acc[item.kind] ??= []).push(item);
    return acc;
  }, {});

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

      <form action={formAction} className="card card--padded">
        <div className="field-row">
          <label htmlFor="csv">Paste the class list as CSV</label>
          <textarea
            id="csv"
            className="textarea-field"
            name="csv"
            rows={8}
            defaultValue={state.csv}
            placeholder={"student number,full name\n2026-0001,Juan Dela Cruz"}
            required
            aria-describedby="csv-help"
          />
          <span className="helper-text" id="csv-help">
            A header row is required, with a <code>student number</code> column
            and a <code>full name</code> column. Other columns are ignored.
          </span>
        </div>
        <div className="form-actions">
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
            </div>
          </div>

          <div className="card__body stack-gap">
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

            {Object.entries(grouped).map(([kind, items]) => {
              const copy = ACTION_COPY[kind as PreviewAction["kind"]];
              return (
                <div key={kind}>
                  <div className="row-gap" style={{ marginBottom: 8 }}>
                    <Badge tone={copy.tone}>{copy.label}</Badge>
                    <span className="muted small">{items.length} row(s)</span>
                  </div>
                  <ul className="data-list card">
                    {items.map((item, index) => (
                      <li key={`${item.studentNumber}-${index}`}>
                        <span className="data-list__main">
                          <strong>{item.fullName}</strong>
                          <small>
                            {item.studentNumber}
                            {item.kind === "update_name" &&
                              ` · currently “${item.currentName}”`}
                            {item.kind === "name_diff_locked" &&
                              ` · this student's account is already confirmed, so the canonical name stays “${item.currentName}”. Correct it by hand if the roster is right.`}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

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
                  {state.deactivations!.map((item) => (
                    <li key={item.studentNumber}>
                      <span className="data-list__main">
                        <strong>{item.name}</strong>
                        <small>{item.studentNumber}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="card__footer">
            <form action={formAction} className="stack-gap">
              <input type="hidden" name="csv" value={state.csv} />
              <div className="field-row" style={{ maxWidth: 420 }}>
                <label htmlFor="source">Where did this list come from?</label>
                <input
                  id="source"
                  className="field"
                  name="source"
                  placeholder="Registrar class list, 2 August"
                />
              </div>
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
