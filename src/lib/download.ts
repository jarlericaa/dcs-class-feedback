/**
 * Headers for every export download (project-specs.md §11).
 *
 * Export bodies are identity- or grade-bearing and are generated in memory per
 * request — nothing is written to disk and nothing may be cached. `private` keeps
 * a shared proxy from storing it, `no-store` keeps the browser from writing it to
 * the disk cache or replaying it from history, and `nosniff` stops a CSV being
 * re-interpreted as HTML and executed in the origin.
 */

export type ExportFormat = "csv" | "xlsx" | "pdf";

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/** Strips anything that could break out of the Content-Disposition header. */
function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "export";
}

export function downloadHeaders(
  filename: string,
  format: ExportFormat,
): HeadersInit {
  return {
    "content-type": CONTENT_TYPES[format],
    "content-disposition": `attachment; filename="${safeFilename(filename)}"`,
    "cache-control": "no-store, private, max-age=0, must-revalidate",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
  };
}

/** `feedback-weekly_matrix-2026-08-03.csv` — no student data in the name. */
export function exportFilename(
  report: string,
  format: ExportFormat,
  now = new Date(),
): string {
  const date = now.toISOString().slice(0, 10);
  return `feedback-${safeFilename(report)}-${date}.${format}`;
}
