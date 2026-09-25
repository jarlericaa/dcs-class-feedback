import { NextResponse } from "next/server";
import { currentUserId } from "@/auth";
import { AuthzError } from "@/modules/authz";
import { courseWeeklyMatrixCsv } from "@/modules/participation";

/** Download the course-wide form participation matrix. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id: courseId } = await params;

  try {
    const body = await courseWeeklyMatrixCsv(userId, courseId);
    return new NextResponse(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="course-participation.csv"',
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
