import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recurrenceSchedules } from "@/db/schema";
import {
  closeDueCycles,
  generateCyclesForSchedule,
  openDueCycles,
} from "@/modules/forms/cycles";
import { lockDueResponses } from "@/modules/forms/response-lock";
import { publishDueAnswers } from "@/modules/publishing/publish";
import {
  processEmailOutbox,
  queueDeadlineReminders,
} from "@/modules/email/outbox";

/**
 * DB-backed reconciliation poller (architecture-proposal.md §4).
 * One sweep = the whole scheduling surface, all idempotent:
 *  1. materialize upcoming cycles from active recurrence schedules
 *     (unique constraint prevents duplicates),
 *  2. open cycles past open-at still Scheduled (late-flagged in audit), which
 *     also queues the "form opened" email inside the same transaction,
 *  3. close cycles past deadline still Open, locking their responses in the same
 *     transaction so a closed cycle is never still editable,
 *  4. lock any response left submitted in an already-closed cycle (the backstop
 *     for a sweep that died mid-way),
 *  5. queue deadline reminders for cycles inside a configured offset window,
 *  6. publish Scheduled public answers past scheduled-at
 *     (state-guarded; failures flag the answer and stay Scheduled),
 *  7. deliver queued email with a claim-and-lease so concurrent workers never
 *     send the same message twice.
 *
 * Because every step re-checks current state, this sweep IS both the normal
 * scheduler tick and the scheduler-down recovery path. Run it on an interval
 * (scripts/scheduler.ts) and/or via POST /api/internal/scheduler/tick.
 *
 * pg-boss (the docs' recommended queue) is deliberately deferred: this poller
 * meets the same idempotency/reconciliation requirements with fewer moving
 * parts, and the email outbox reuses the same pattern rather than introducing a
 * broker.
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
  const responsesLocked = await lockDueResponses(now);
  const remindersQueued = await queueDeadlineReminders(now);
  const answersPublished = await publishDueAnswers(now);
  const email = await processEmailOutbox(now);

  return {
    cyclesGenerated,
    cyclesOpened,
    cyclesClosed,
    responsesLocked,
    remindersQueued,
    answersPublished,
    emailsSent: email.sent,
    emailsFailed: email.failed,
  };
}
