import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/auth";
import { AuthzError } from "@/modules/authz";
import {
  detailedResponseCsv,
  participantListCsv,
  weeklyMatrixCsv,
} from "@/modules/participation";

/**
 * Participation CSV download.
 *
 * Authorization and the audit write both live in the participation services —
 * this handler only chooses the report and sets the download headers, so no
 * export can happen without the export_participation capability and an audit
 * record (Risk R4).
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
  const report = request.nextUrl.searchParams.get("report") ?? "weekly_matrix";

  try {
    let csv: string;
    let filename: string;
    switch (report) {
      case "participants":
        csv = await participantListCsv(userId, sectionId);
        filename = "participating-students.csv";
        break;
      case "detailed":
        csv = await detailedResponseCsv(userId, sectionId);
        filename = "detailed-responses.csv";
        break;
      case "weekly_matrix":
        csv = await weeklyMatrixCsv(userId, sectionId);
        filename = "weekly-participation.csv";
        break;
      default:
        return NextResponse.json({ error: "Unknown report" }, { status: 400 });
    }

    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
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
