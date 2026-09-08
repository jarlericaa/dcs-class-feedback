import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { publicAnswers } from "@/db/schema";
import { writeAudit } from "@/modules/audit";

/**
 * Scheduled-publication executor (docs/domain/public-qa.md §7.1).
 * Idempotent: the transition is state-guarded (`scheduled` → `published`
 * only), so re-runs and replays never double-publish. A failure leaves the
 * answer `scheduled` with publishFailed + reason, surfaced in-app for staff
 * retry/resolve. Late publications (reconciliation after downtime) are
 * flagged in both the row and the audit record.
 */

/** More than this past scheduledAt counts as a late (reconciled) publish. */
const LATE_THRESHOLD_MS = 5 * 60 * 1000;

export async function publishDueAnswers(now: Date = new Date()): Promise<number> {
  const due = await db.query.publicAnswers.findMany({
    where: and(
      eq(publicAnswers.state, "scheduled"),
      lte(publicAnswers.scheduledAt, now),
    ),
  });
  let published = 0;
  for (const answer of due) {
    try {
      await db.transaction(async (tx) => {
        const late =
          now.getTime() - (answer.scheduledAt?.getTime() ?? now.getTime()) >
          LATE_THRESHOLD_MS;
        const result = await tx
          .update(publicAnswers)
          .set({
            state: "published",
            publishedAt: now,
            publishFailed: false,
            publishFailureReason: null,
            publishedLate: late,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(publicAnswers.id, answer.id),
              eq(publicAnswers.state, "scheduled"),
            ),
          )
          .returning();
        if (result.length === 0) return; // raced — already handled
        await writeAudit(tx, {
          actorUserId: null,
          action: "public_answer.published",
          entityType: "public_answer",
          entityId: answer.id,
          metadata: { scheduled: true, ...(late ? { late: true } : {}) },
          sectionId: answer.sectionId,
        });
        published += 1;
      });
    } catch (err) {
      // Failure recovery state: stays `scheduled`, flagged for staff.
      const reason = err instanceof Error ? err.message : String(err);
      await db
        .update(publicAnswers)
        .set({
          publishFailed: true,
          publishFailureReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(publicAnswers.id, answer.id));
      await writeAudit(db, {
        actorUserId: null,
        action: "public_answer.publish_failed",
        entityType: "public_answer",
        entityId: answer.id,
        metadata: { reason },
        sectionId: answer.sectionId,
      });
    }
  }
  return published;
}
