import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { reconcile } from "@/modules/scheduling";

/**
 * Scheduler tick endpoint — for cron/uptime services in deployments that
 * cannot run scripts/scheduler.ts. Guarded by SCHEDULER_SECRET.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-scheduler-secret");
  if (!env.SCHEDULER_SECRET || secret !== env.SCHEDULER_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await reconcile();
  return NextResponse.json(result);
}
