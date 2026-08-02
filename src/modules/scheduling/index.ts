import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recurrenceSchedules } from "@/db/schema";
import {
  closeDueCycles,
  generateCyclesForSchedule,
  openDueCycles,
} from "@/modules/forms/cycles";
import { publishDueAnswers } from "@/modules/publishing/publish";

/**
 * DB-backed reconciliation poller (architecture-proposal.md §4).
 * One sweep = the whole scheduling surface, all idempotent:
 *  1. materialize upcoming cycles from active recurrence schedules
 *     (unique constraint prevents duplicates),
 *  2. open cycles past open-at still Scheduled (late-flagged in audit),
 *  3. close cycles past deadline still Open,
 *  4. publish Scheduled public answers past scheduled-at
 *     (state-guarded; failures flag the answer and stay Scheduled).
 *
 * Because every step re-checks current state, this sweep IS both the normal
 * scheduler tick and the scheduler-down recovery path. Run it on an interval
 * (scripts/scheduler.ts) and/or via POST /api/internal/scheduler/tick.
 *
 * pg-boss (the docs' recommended queue) is deliberately deferred for this
 * foundation pass — this poller meets the same idempotency/reconciliation
 * requirements with fewer moving parts. See README "Remaining work".
 */
export async function reconcile(now: Date = new Date()) {
  const schedules = await db.query.recurrenceSchedules.findMany({
    where: eq(recurrenceSchedules.active, true),
  });
  let cyclesGenerated = 0;
  for (const schedule of schedules) {
    cyclesGenerated += await generateCyclesForSchedule(schedule, now);
  }
  const cyclesOpened = await openDueCycles(now);
  const cyclesClosed = await closeDueCycles(now);
  const answersPublished = await publishDueAnswers(now);

  return { cyclesGenerated, cyclesOpened, cyclesClosed, answersPublished };
}
