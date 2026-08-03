import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import {
  formQuestions,
  formResponses,
  recurrenceSchedules,
  weeklyCycles,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import {
  lockResponsesForCycle,
  unlockResponsesForCycle,
} from "./response-lock";
import { enqueueCycleOpened } from "@/modules/email/outbox";
import { requireSectionStaff } from "@/modules/authz";
import { getLatestTemplateVersion } from "./templates";
import {
  addDays,
  dayOfWeek,
  parseDate,
  parseTime,
  zonedTimeToUtc,
} from "./timezone";

/**
 * Weekly-cycle generation and open/close (weekly-form-workflow.md §2).
 * Everything here is idempotent:
 * - generation is guarded by the unique (scheduleId, cycleIndex) index and
 *   is safe to re-run any number of times;
 * - open/close are state-guarded transitions; re-running never double-fires.
 * The reconciliation poller (modules/scheduling) is the backstop when the
 * scheduler was down at open/deadline moments.
 */

export interface CycleWindow {
  cycleIndex: number;
  openAt: Date;
  deadlineAt: Date;
}

type Schedule = typeof recurrenceSchedules.$inferSelect;

/** Pure occurrence math: windows whose openAt ≤ horizon. */
export function computeCycleWindows(
  schedule: Pick<
    Schedule,
    | "openDayOfWeek"
    | "openTime"
    | "deadlineDayOfWeek"
    | "deadlineTime"
    | "startDate"
    | "endDate"
    | "occurrenceCount"
    | "timezone"
  >,
  horizon: Date,
): CycleWindow[] {
  const start = parseDate(schedule.startDate);
  const open = parseTime(schedule.openTime);
  const deadline = parseTime(schedule.deadlineTime);

  // First open date: first day ≥ startDate whose weekday matches.
  const startDow = dayOfWeek(start.y, start.mo, start.d);
  const offset = (schedule.openDayOfWeek - startDow + 7) % 7;
  let openDate = addDays(start.y, start.mo, start.d, offset);

  // Deadline is openDate + N days (same-week wrap; same-day only when the
  // deadline time is strictly after the open time).
  let deadlineOffset =
    (schedule.deadlineDayOfWeek - schedule.openDayOfWeek + 7) % 7;
  const sameDayValid =
    deadline.h * 3600 + deadline.m * 60 + deadline.s >
    open.h * 3600 + open.m * 60 + open.s;
  if (deadlineOffset === 0 && !sameDayValid) deadlineOffset = 7;

  const windows: CycleWindow[] = [];
  const endDate = schedule.endDate ? parseDate(schedule.endDate) : null;
  const maxCount = schedule.occurrenceCount ?? Number.POSITIVE_INFINITY;

  for (let index = 1; index <= maxCount; index++) {
    if (endDate) {
      const beyond =
        openDate.y > endDate.y ||
        (openDate.y === endDate.y &&
          (openDate.mo > endDate.mo ||
            (openDate.mo === endDate.mo && openDate.d > endDate.d)));
      if (beyond) break;
    }
    const openAt = zonedTimeToUtc(
      openDate.y,
      openDate.mo,
      openDate.d,
      open.h,
      open.m,
      open.s,
      schedule.timezone,
    );
    if (openAt.getTime() > horizon.getTime()) break;
    const dl = addDays(openDate.y, openDate.mo, openDate.d, deadlineOffset);
    windows.push({
      cycleIndex: index,
      openAt,
      deadlineAt: zonedTimeToUtc(
        dl.y,
        dl.mo,
        dl.d,
        deadline.h,
        deadline.m,
        deadline.s,
        schedule.timezone,
      ),
    });
    openDate = addDays(openDate.y, openDate.mo, openDate.d, 7);
  }
  return windows;
}

/** Days ahead of `now` for which cycles are materialized. */
const GENERATION_HORIZON_DAYS = 14;

/**
 * Materialize upcoming cycles for one schedule, snapshotting the template's
 * LATEST version's questions into each newly-created cycle. Idempotent:
 * existing (scheduleId, cycleIndex) rows are skipped via onConflictDoNothing.
 */
export async function generateCyclesForSchedule(
  schedule: Schedule,
  now: Date,
): Promise<number> {
  if (!schedule.active) return 0;
  const horizon = new Date(
    now.getTime() + GENERATION_HORIZON_DAYS * 24 * 3600 * 1000,
  );
  const windows = computeCycleWindows(schedule, horizon);
  let created = 0;

  for (const w of windows) {
    await db.transaction(async (tx) => {
      // The (scheduleId, cycleIndex) unique index makes re-running THIS
      // schedule idempotent, but it cannot see cycles belonging to a previous,
      // now-retired schedule for the same section. Reconfiguring a schedule
      // creates a new row whose indices restart at 1, so without this check a
      // replacement would generate a second cycle covering a week that already
      // exists — letting one student submit twice for the same week and
      // producing duplicate participation columns.
      const overlapping = await tx.query.weeklyCycles.findFirst({
        where: and(
          eq(weeklyCycles.sectionId, schedule.sectionId),
          eq(weeklyCycles.openAt, w.openAt),
        ),
      });
      if (overlapping) return; // that week is already materialized

      const snapshot = await getLatestTemplateVersion(tx, schedule.templateId);
      const [cycle] = await tx
        .insert(weeklyCycles)
        .values({
          sectionId: schedule.sectionId,
          scheduleId: schedule.id,
          cycleIndex: w.cycleIndex,
          openAt: w.openAt,
          deadlineAt: w.deadlineAt,
          templateVersionId: snapshot?.version.id ?? null,
          state: "scheduled",
        })
        .onConflictDoNothing()
        .returning();
      if (!cycle) return; // already generated — idempotent no-op

      if (snapshot && snapshot.questions.length > 0) {
        await tx.insert(formQuestions).values(
          snapshot.questions.map((q) => ({
            cycleId: cycle.id,
            prompt: q.prompt,
            description: q.description,
            type: q.type,
            options: q.options,
            scale: q.scale,
            validation: q.validation,
            required: q.required,
            displayOrder: q.displayOrder,
            category: q.category,
            topicId: q.topicId,
            stableKey: q.stableKey, // identity carries into the snapshot
          })),
        );
      }
      await writeAudit(tx, {
        actorUserId: null,
        action: "cycle.generated",
        entityType: "weekly_cycle",
        entityId: cycle.id,
        after: {
          sectionId: schedule.sectionId,
          cycleIndex: w.cycleIndex,
          openAt: w.openAt.toISOString(),
          deadlineAt: w.deadlineAt.toISOString(),
          templateVersionId: snapshot?.version.id ?? null,
        },
      });
      created += 1;
    });
  }
  return created;
}

/** Consider an open/close more than this late (ms) worth flagging in audit. */
const LATE_THRESHOLD_MS = 5 * 60 * 1000;

/** scheduled → open for every cycle past its openAt. State-guarded. */
export async function openDueCycles(now: Date): Promise<number> {
  const due = await db.query.weeklyCycles.findMany({
    where: and(eq(weeklyCycles.state, "scheduled"), lte(weeklyCycles.openAt, now)),
    orderBy: asc(weeklyCycles.openAt),
  });
  let opened = 0;
  for (const cycle of due) {
    await db.transaction(async (tx) => {
      const result = await tx
        .update(weeklyCycles)
        .set({ state: "open", updatedAt: new Date() })
        .where(
          and(eq(weeklyCycles.id, cycle.id), eq(weeklyCycles.state, "scheduled")),
        )
        .returning();
      if (result.length === 0) return; // raced — someone else opened it
      const late = now.getTime() - cycle.openAt.getTime() > LATE_THRESHOLD_MS;
      await writeAudit(tx, {
        actorUserId: null,
        action: "cycle.opened",
        entityType: "weekly_cycle",
        entityId: cycle.id,
        metadata: late ? { late: true } : undefined,
        sectionId: cycle.sectionId,
      });
      // Queued in the SAME transaction as the state change: a rolled-back open
      // can never leave mail queued, and a committed one always queues it. The
      // unique idempotency key makes a re-run a no-op.
      await enqueueCycleOpened(tx, cycle.id, now);
      opened += 1;
    });
  }
  return opened;
}

/** open → closed for every cycle past its deadline. State-guarded. */
export async function closeDueCycles(now: Date): Promise<number> {
  const due = await db.query.weeklyCycles.findMany({
    where: and(eq(weeklyCycles.state, "open"), lte(weeklyCycles.deadlineAt, now)),
  });
  let closed = 0;
  for (const cycle of due) {
    await db.transaction(async (tx) => {
      // Exclusive row lock first: a concurrent submit takes FOR SHARE on this
      // same row, so a submission either commits before the close or observes
      // the closed state. Without this there is a window in which a response is
      // accepted into a cycle that is being closed.
      await tx
        .select({ id: weeklyCycles.id })
        .from(weeklyCycles)
        .where(eq(weeklyCycles.id, cycle.id))
        .for("update")
        .limit(1);
      const result = await tx
        .update(weeklyCycles)
        .set({ state: "closed", updatedAt: new Date() })
        .where(and(eq(weeklyCycles.id, cycle.id), eq(weeklyCycles.state, "open")))
        .returning();
      if (result.length === 0) return;
      const late =
        now.getTime() - cycle.deadlineAt.getTime() > LATE_THRESHOLD_MS;
      await writeAudit(tx, {
        actorUserId: null,
        action: "cycle.closed",
        entityType: "weekly_cycle",
        entityId: cycle.id,
        metadata: late ? { late: true } : undefined,
        sectionId: cycle.sectionId,
      });
      // "At the deadline the latest submitted version becomes locked" — done in
      // the same transaction, so the two facts can never disagree.
      await lockResponsesForCycle(tx, cycle.id, now, cycle.sectionId);
      closed += 1;
    });
  }
  return closed;
}

/** Staff reopens a closed cycle (audited; grace policy D5 = hard deadline + audited reopen, provisional). */
export async function reopenCycle(actorUserId: string, cycleId: string) {
  const cycle = await db.query.weeklyCycles.findFirst({
    where: eq(weeklyCycles.id, cycleId),
  });
  if (!cycle) throw new Error("Cycle not found");
  await requireSectionStaff(db, actorUserId, cycle.sectionId, "manageWeeklyCycles");
  if (cycle.state !== "closed") {
    throw new Error(`Cannot reopen a cycle in state ${cycle.state}`);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(weeklyCycles)
      .set({ state: "open", updatedAt: new Date() })
      .where(eq(weeklyCycles.id, cycleId));
    await writeAudit(tx, {
      actorUserId,
      action: "cycle.reopened",
      entityType: "weekly_cycle",
      entityId: cycleId,
      before: { state: "closed" },
      after: { state: "open" },
      sectionId: cycle.sectionId,
    });
    // Reopening is the ONLY route to a post-deadline edit (open-decisions.md D5).
    // Unlocking here is what makes the reopen meaningful, and each unlock is
    // recorded per response.
    await unlockResponsesForCycle(
      tx,
      cycleId,
      actorUserId,
      new Date(),
      cycle.sectionId,
    );
  });
}

/** Staff skips a draft/scheduled occurrence. */
export async function skipCycle(actorUserId: string, cycleId: string) {
  const cycle = await db.query.weeklyCycles.findFirst({
    where: eq(weeklyCycles.id, cycleId),
  });
  if (!cycle) throw new Error("Cycle not found");
  await requireSectionStaff(db, actorUserId, cycle.sectionId, "manageWeeklyCycles");
  if (cycle.state !== "draft" && cycle.state !== "scheduled") {
    throw new Error(`Cannot skip a cycle in state ${cycle.state}`);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(weeklyCycles)
      .set({ state: "skipped", updatedAt: new Date() })
      .where(eq(weeklyCycles.id, cycleId));
    await writeAudit(tx, {
      actorUserId,
      action: "cycle.skipped",
      entityType: "weekly_cycle",
      entityId: cycleId,
      before: { state: cycle.state },
      after: { state: "skipped" },
    });
  });
}

/**
 * Override one occurrence's open/deadline window (project-specs.md §6.2 step 4:
 * "Staff can pause, skip, or override a scheduled release").
 *
 * Refused once the occurrence has a real submission: moving the window under a
 * student who already answered would change the rules after the fact. Skipping
 * or reopening remain the tools for that case.
 */
export async function overrideCycleWindow(
  actorUserId: string,
  cycleId: string,
  input: { openAt: Date; deadlineAt: Date },
) {
  const cycle = await db.query.weeklyCycles.findFirst({
    where: eq(weeklyCycles.id, cycleId),
  });
  if (!cycle) throw new Error("Cycle not found");
  await requireSectionStaff(db, actorUserId, cycle.sectionId, "manageWeeklyCycles");
  if (input.openAt.getTime() >= input.deadlineAt.getTime()) {
    throw new Error("The deadline must be after the open time.");
  }
  if (await cycleHasSubmissions(db, cycleId)) {
    throw new Error(
      "This week already has a submission, so its window is locked. Skip or reopen it instead.",
    );
  }
  const now = new Date();
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(weeklyCycles)
      .set({
        openAt: input.openAt,
        deadlineAt: input.deadlineAt,
        windowOverriddenByUserId: actorUserId,
        windowOverriddenAt: now,
        updatedAt: now,
      })
      .where(eq(weeklyCycles.id, cycleId))
      .returning();
    await writeAudit(tx, {
      actorUserId,
      action: "cycle.window_overridden",
      entityType: "weekly_cycle",
      entityId: cycleId,
      before: {
        openAt: cycle.openAt.toISOString(),
        deadlineAt: cycle.deadlineAt.toISOString(),
      },
      after: {
        openAt: input.openAt.toISOString(),
        deadlineAt: input.deadlineAt.toISOString(),
      },
      sectionId: cycle.sectionId,
    });
    return updated!;
  });
}

/**
 * Edit-lock check (D4): structural cycle edits are locked once one real
 * submission exists.
 *
 * A DRAFT does not lock anything — it is not a submission, and a single student
 * opening the form would otherwise freeze the week for staff.
 */
export async function cycleHasSubmissions(
  dbx: DbOrTx,
  cycleId: string,
): Promise<boolean> {
  const one = await dbx.query.formResponses.findFirst({
    where: and(
      eq(formResponses.cycleId, cycleId),
      inArray(formResponses.lifecycle, ["submitted", "locked"]),
    ),
  });
  return !!one;
}
