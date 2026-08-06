import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { formResponseRevisions, formResponses, weeklyCycles } from "@/db/schema";
import { writeAudit } from "@/modules/audit";

/**
 * Deadline locking (project-specs.md §6.3 step 5: "On deadline, the latest
 * submitted version is locked").
 *
 * Locking is applied in the SAME transaction as the cycle's open→closed
 * transition, so there is no instant at which a cycle is closed but its responses
 * are still editable. `lockDueResponses` exists only as an idempotent backstop
 * for cycles that closed while the scheduler was down.
 */

/** Lock every submitted response of a cycle. Idempotent and state-guarded. */
export async function lockResponsesForCycle(
  dbx: DbOrTx,
  cycleId: string,
  now: Date,
  sectionId?: string,
): Promise<number> {
  const locked = await dbx
    .update(formResponses)
    // The revision is bumped so the lock gets its own entry in the trail:
    // (responseId, revision) is unique, so reusing the content revision would
    // collide with the row written by the last edit.
    .set({
      lifecycle: "locked",
      lockedAt: now,
      revision: sql`${formResponses.revision} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(formResponses.cycleId, cycleId),
        eq(formResponses.lifecycle, "submitted"),
      ),
    )
    .returning({ id: formResponses.id, revision: formResponses.revision });

  for (const row of locked) {
    await dbx.insert(formResponseRevisions).values({
      responseId: row.id,
      revision: row.revision,
      action: "locked",
      // null actor: the deadline locked it, not a person.
      actorUserId: null,
      after: { lifecycle: "locked", lockedAt: now.toISOString() },
    });
  }
  if (locked.length > 0) {
    await writeAudit(dbx, {
      actorUserId: null,
      action: "response.locked",
      entityType: "weekly_cycle",
      entityId: cycleId,
      metadata: { lockedCount: locked.length },
      sectionId: sectionId ?? null,
    });
  }
  // Drafts are deliberately left as drafts: an unsubmitted draft in a closed
  // cycle earns nothing and is not a submission that could be "locked".
  return locked.length;
}

/**
 * Reopening a cycle unlocks its responses so students can submit or edit again.
 *
 * This is the ONLY route to a post-deadline edit (open-decisions.md D5). It needs
 * `manageWeeklyCycles`, which the caller has already checked, and every unlock is
 * recorded per response.
 */
export async function unlockResponsesForCycle(
  dbx: DbOrTx,
  cycleId: string,
  actorUserId: string,
  now: Date,
  sectionId?: string,
): Promise<number> {
  const unlocked = await dbx
    .update(formResponses)
    .set({
      lifecycle: "submitted",
      lockedAt: null,
      revision: sql`${formResponses.revision} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(formResponses.cycleId, cycleId),
        eq(formResponses.lifecycle, "locked"),
      ),
    )
    .returning({ id: formResponses.id, revision: formResponses.revision });

  for (const row of unlocked) {
    await dbx.insert(formResponseRevisions).values({
      responseId: row.id,
      revision: row.revision,
      action: "unlocked",
      actorUserId,
      after: { lifecycle: "submitted" },
    });
  }
  if (unlocked.length > 0) {
    await writeAudit(dbx, {
      actorUserId,
      action: "response.unlocked",
      entityType: "weekly_cycle",
      entityId: cycleId,
      metadata: { unlockedCount: unlocked.length },
      sectionId: sectionId ?? null,
    });
  }
  return unlocked.length;
}

/**
 * Backstop for the reconciliation sweep: lock anything left submitted in a cycle
 * that is already closed or past its deadline. Idempotent.
 */
export async function lockDueResponses(now: Date = new Date()): Promise<number> {
  const due = await db.query.weeklyCycles.findMany({
    where: and(
      inArray(weeklyCycles.state, ["closed", "archived"]),
      lte(weeklyCycles.deadlineAt, now),
    ),
  });
  let total = 0;
  for (const cycle of due) {
    total += await db.transaction((tx) =>
      lockResponsesForCycle(tx, cycle.id, now, cycle.sectionId ?? undefined),
    );
  }
  return total;
}
