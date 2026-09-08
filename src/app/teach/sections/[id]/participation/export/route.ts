import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/auth";
import { AuthzError } from "@/modules/authz";
import {
  cycleParticipationCsv,
  detailedResponseCsv,
  listSectionCycles,
  participantListCsv,
  responderListCsv,
  responderListXlsx,
  weeklyMatrixCsv,
} from "@/modules/participation";

/**
 * Participation and responder downloads.
 *
 * Authorization and the audit write both live in the participation services —
 * this handler only chooses the report, passes the filter through, and sets the
 * download headers. It therefore adds no gate of its own, and every report
 * below is identity-bearing and audited (Risk R4). What it does NOT do is share
 * one gate: which one applies depends on the report, and the split is
 * deliberate (docs/domain/participation.md §4, decision D17).
 *
 * - `weekly_matrix`, `participants` and `detailed` — the three reports that
 *   existed when D17 was taken — require the delegable `export_participation`
 *   flag, so a Student Assistant granted it keeps what they were granted.
 * - `week` and `responders` — added in 2026-09, and the responder list also in
 *   XLSX — are **instructor-only** (`requireInstructor`: teacher, co-teacher or
 *   course staff). They can therefore succeed for an instructor who holds no
 *   `export_participation` flag at all, and they are refused for an assistant
 *   who holds it. D17 made every export added after it instructor-only.
 *
 * A refusal from either gate surfaces the same way: the service throws
 * `AuthzError` and the catch below answers 403.
 *
 * The filter comes from the same query parameters the dashboard puts in its
 * URL, which is what makes "the export matches what is on screen" true by
 * construction rather than by two code paths agreeing (GitHub issue #15).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id: sectionId } = await params;
  const query = request.nextUrl.searchParams;
  const report = query.get("report") ?? "weekly_matrix";
  const week = query.get("week");
  const questionId = query.get("question") ?? undefined;
  const answerKey = query.get("answer") ?? undefined;
  const includeNonResponders = query.get("include") === "all";

  try {
    /**
     * Which occurrence, resolved through the section's own list rather than
     * from the query string. An id this section does not receive is refused
     * here, before any service sees it — and the label for the filename comes
     * from the same lookup, so a file can never be named after another
     * section's week.
     */
    const needsCycle = report === "responders" || report === "week";
    let cycleLabel: string | undefined;
    if (needsCycle) {
      if (!week || week === "all") {
        return NextResponse.json(
          { error: "Choose a week for this report" },
          { status: 400 },
        );
      }
      const cycles = await listSectionCycles(userId, sectionId);
      const cycle = cycles.find((c) => c.id === week);
      if (!cycle) {
        return NextResponse.json({ error: "Unknown week" }, { status: 404 });
      }
      cycleLabel = cycle.label;
    }

    let body: string | Buffer;
    let filename: string;
    let contentType = "text/csv; charset=utf-8";
    switch (report) {
      case "responders": {
        const xlsx = query.get("format") === "xlsx";
        const opts = {
          cycleId: week!,
          includeNonResponders,
          cycleLabel,
        };
        const stem = `${includeNonResponders ? "everyone" : "responded"}-${slug(cycleLabel!)}`;
        if (xlsx) {
          body = await responderListXlsx(userId, sectionId, opts);
          filename = `${stem}.xlsx`;
          contentType =
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        } else {
          body = await responderListCsv(userId, sectionId, opts);
          filename = `${stem}.csv`;
        }
        break;
      }
      case "week":
        body = await cycleParticipationCsv(userId, sectionId, {
          cycleId: week!,
          questionId,
          answerKey,
          cycleLabel,
        });
        filename = `participation-${slug(cycleLabel!)}.csv`;
        break;
      case "participants":
        body = await participantListCsv(userId, sectionId);
        filename = "participating-students.csv";
        break;
      case "detailed":
        body = await detailedResponseCsv(userId, sectionId);
        filename = "detailed-responses.csv";
        break;
      case "weekly_matrix":
        body = await weeklyMatrixCsv(userId, sectionId);
        filename = "weekly-participation.csv";
        break;
      default:
        return NextResponse.json({ error: "Unknown report" }, { status: 400 });
    }

    return new NextResponse(body as unknown as BodyInit, {
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename="${filename}"`,
        // Identity-bearing: never let a shared cache keep a copy.
        "cache-control": "no-store, private",
      },
    });
  } catch (err) {
    if (err instanceof AuthzError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}

/**
 * A week label as a filename fragment.
 *
 * The label is staff-authored — a form's own title can be an occurrence label —
 * so it is reduced to letters, digits and hyphens before it reaches a
 * `Content-Disposition` header, where a quote or a newline would let it break
 * out of the filename.
 */
function slug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "week"
  );
}
