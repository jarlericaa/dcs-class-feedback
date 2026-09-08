import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import {
  formInstanceSections,
  formInstances,
  formQuestions,
  formResponses,
  recurrenceSchedules,
  templateVersions,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { AuthzError } from "@/modules/authz";
import {
  lockResponsesForCycle,
  unlockResponsesForCycle,
} from "./response-lock";
import { enqueueCycleOpened } from "@/modules/email/outbox";
import {
  getInstanceAudience,
  getScheduleAudience,
  requireInstanceStaff,
  resolveAudienceSections,
  setInstanceAudience,
} from "./audience";
import { getLatestTemplateVersion } from "./templates";
import {
  addDays,
  dayOfWeek,
  parseDate,
  parseTime,
  zonedTimeToUtc,
} from "./timezone";

/**
 * Form-instance generation and open/close.
 * Everything here is idempotent:
 * - generation is guarded by the unique (scheduleId, sequence) index and is safe
 *   to re-run any number of times;
 * - open/close are state-guarded transitions; re-running never double-fires.
 * The reconciliation poller (modules/scheduling) is the backstop when the
 * scheduler was down at open/deadline moments.
 *
 * `manual` delivery is deliberately absent from generation: those instances are
 * created and opened by a person (see modules/forms/instances.ts).
 */

export interface InstanceWindow {
  sequenceNumber: number;
  openAt: Date;
  deadlineAt: Date;
}

/** @deprecated name kept for existing callers; same shape. */
export type CycleWindow = InstanceWindow & { cycleIndex: number };

type Schedule = typeof recurrenceSchedules.$inferSelect;

/**
 * Pure occurrence math: windows whose openAt ≤ horizon.
 *
 * Handles the recurring modes. `intervalWeeks` is the only difference between
 * `weekly` (1) and `custom_recurring` (≥2) — the smallest honest generalization
 * of the controls that already existed.
 */
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
  > & { intervalWeeks?: number },
  horizon: Date,
): CycleWindow[] {
  if (
    schedule.openDayOfWeek === null ||
    schedule.openTime === null ||
    schedule.deadlineDayOfWeek === null ||
    schedule.deadlineTime === null ||
    schedule.startDate === null
  ) {
    return [];
  }
  const start = parseDate(schedule.startDate);
  const open = parseTime(schedule.openTime);
  const deadline = parseTime(schedule.deadlineTime);
  const step = Math.max(1, schedule.intervalWeeks ?? 1) * 7;

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
      sequenceNumber: index,
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
    openDate = addDays(openDate.y, openDate.mo, openDate.d, step);
  }
  return windows;
}

/** Days ahead of `now` for which instances are materialized. */
const GENERATION_HORIZON_DAYS = 14;

/** The windows a schedule should have materialized by `horizon`, per mode. */
function windowsFor(schedule: Schedule, horizon: Date): CycleWindow[] {
  switch (schedule.deliveryMode) {
    case "manual":
      // Nothing automatic: a person creates and opens each one.
      return [];
    case "one_time":
      if (!schedule.firstOpenAt || !schedule.firstDeadlineAt) return [];
      if (schedule.firstOpenAt.getTime() > horizon.getTime()) return [];
      return [
        {
          sequenceNumber: 1,
          cycleIndex: 1,
          openAt: schedule.firstOpenAt,
          deadlineAt: schedule.firstDeadlineAt,
        },
      ];
    case "weekly":
    case "custom_recurring":
      return computeCycleWindows(schedule, horizon);
  }
}

/**
 * Copy the source version's questions into a new instance's own snapshot.
 *
 * `stableKey` carries identity into the snapshot so exports and analytics can
 * follow a question across occurrences; `origin: "inherited"` records that this
 * copy has not been touched for this occurrence, which is what the per-occurrence
 * editor reads.
 */
async function snapshotQuestions(
  tx: DbOrTx,
  instanceId: string,
  questions: (typeof formQuestions.$inferSelect)[],
) {
  if (questions.length === 0) return;
  await tx.insert(formQuestions).values(
    questions.map((q) => ({
      cycleId: instanceId,
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
      origin: "inherited" as const,
      stableKey: q.stableKey,
    })),
  );
}

/**
 * Which of these instances belong to the given form definition?
 *
 * An instance names its form through its snapshotted version, or — for one with
 * no version yet — through the schedule that produced it. Both routes are checked
 * so the overlap guard cannot be defeated by a form with no questions.
 */
async function filterToTemplate(
  tx: DbOrTx,
  instances: (typeof formInstances.$inferSelect)[],
  templateId: string,
) {
  const versionIds = [
    ...new Set(
      instances.map((c) => c.templateVersionId).filter((v): v is string => !!v),
    ),
  ];
  const scheduleIds = [
    ...new Set(
      instances.map((c) => c.scheduleId).filter((v): v is string => !!v),
    ),
  ];
  const versions = versionIds.length
    ? await tx.query.templateVersions.findMany({
        where: inArray(templateVersions.id, versionIds),
      })
    : [];
  const schedules = scheduleIds.length
    ? await tx.query.recurrenceSchedules.findMany({
        where: inArray(recurrenceSchedules.id, scheduleIds),
      })
    : [];
  const versionTemplate = new Map(versions.map((v) => [v.id, v.templateId]));
  const scheduleTemplate = new Map(schedules.map((s) => [s.id, s.templateId]));
  return instances.filter((c) => {
    const fromVersion = c.templateVersionId
      ? versionTemplate.get(c.templateVersionId)
      : undefined;
    const fromSchedule = c.scheduleId
      ? scheduleTemplate.get(c.scheduleId)
      : undefined;
    return (fromVersion ?? fromSchedule) === templateId;
  });
}

/**
 * Materialize upcoming instances for one delivery configuration, snapshotting
 * the form's LATEST version into each newly-created instance and copying the
 * schedule's audience onto it.
 *
 * Idempotent: existing (scheduleId, sequence) rows are skipped via
 * onConflictDoNothing, and an overlapping window in the same course with an
 * intersecting audience is skipped explicitly.
 */
export async function generateInstancesForSchedule(
  schedule: Schedule,
  now: Date,
): Promise<number> {
  if (!schedule.active) return 0;
  const horizon = new Date(
    now.getTime() + GENERATION_HORIZON_DAYS * 24 * 3600 * 1000,
  );
  const windows = windowsFor(schedule, horizon);
  if (windows.length === 0) return 0;

  // `all_sections` re-resolves, so a section added mid-term starts receiving the
  // form; `selected_sections` uses the fixed list recorded when it was saved.
  const audience =
    schedule.audienceMode === "all_sections"
      ? await resolveAudienceSections(db, schedule.courseId, {
          mode: "all_sections",
        }).catch(() => [])
      : await getScheduleAudience(db, schedule.id);
  if (audience.length === 0) return 0;

  let created = 0;
  for (const w of windows) {
    await db.transaction(async (tx) => {
      /**
       * The (scheduleId, sequence) unique index makes re-running THIS schedule
       * idempotent, but it cannot see an instance belonging to a previous,
       * now-retired schedule for the same form. Reconfiguring creates a new row
       * whose sequence restarts at 1, so without this check a replacement would
       * generate a second instance covering a window that already exists —
       * letting one student answer the same form twice for one occurrence.
       *
       * Scoped to THIS FORM, not to the course: two different forms of a course
       * may legitimately open at the same moment (a weekly check-in and a
       * one-time LE form both opening Monday 08:00 is ordinary), and a
       * course-wide guard would silently swallow the second one.
       */
      const sameWindow = await tx.query.formInstances.findMany({
        where: and(
          eq(formInstances.courseId, schedule.courseId),
          eq(formInstances.openAt, w.openAt),
        ),
      });
      const sameForm = sameWindow.length
        ? await filterToTemplate(tx, sameWindow, schedule.templateId)
        : [];
      if (sameForm.length > 0) {
        const overlapping = await tx.query.formInstanceSections.findMany({
          where: and(
            inArray(
              formInstanceSections.instanceId,
              sameForm.map((c) => c.id),
            ),
            inArray(formInstanceSections.sectionId, audience),
          ),
        });
        if (overlapping.length > 0) return; // that window is already materialized
      }

      const snapshot = await getLatestTemplateVersion(tx, schedule.templateId);
      const [instance] = await tx
        .insert(formInstances)
        .values({
          courseId: schedule.courseId,
          sectionId: null,
          scheduleId: schedule.id,
          deliveryMode: schedule.deliveryMode,
          cycleIndex: w.sequenceNumber,
          openAt: w.openAt,
          deadlineAt: w.deadlineAt,
          templateVersionId: snapshot?.version.id ?? null,
          state: "scheduled",
        })
        .onConflictDoNothing()
        .returning();
      if (!instance) return; // already generated — idempotent no-op

      await setInstanceAudience(tx, instance.id, audience);
      await snapshotQuestions(tx, instance.id, snapshot?.questions ?? []);
      await writeAudit(tx, {
        actorUserId: null,
        action: "cycle.generated",
        entityType: "weekly_cycle",
        entityId: instance.id,
        after: {
          courseId: schedule.courseId,
          sectionIds: audience,
          deliveryMode: schedule.deliveryMode,
          sequenceNumber: w.sequenceNumber,
          openAt: w.openAt.toISOString(),
          deadlineAt: w.deadlineAt.toISOString(),
          templateVersionId: snapshot?.version.id ?? null,
        },
        courseId: schedule.courseId,
      });
      created += 1;
    });
  }
  return created;
}

/** @deprecated Renamed to generateInstancesForSchedule; same behaviour. */
export const generateCyclesForSchedule = generateInstancesForSchedule;

/** Consider an open/close more than this late (ms) worth flagging in audit. */
const LATE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * scheduled → open for every instance past its openAt. State-guarded.
 *
 * `manual` instances are excluded: they sit in `draft` until a person opens them,
 * and a manual instance that a person *did* schedule is theirs to open too.
 */
export async function openDueCycles(now: Date): Promise<number> {
  const due = await db.query.formInstances.findMany({
    where: and(
      eq(formInstances.state, "scheduled"),
      lte(formInstances.openAt, now),
    ),
    orderBy: asc(formInstances.openAt),
  });
  let opened = 0;
  for (const instance of due) {
    if (instance.deliveryMode === "manual") continue;
    await db.transaction(async (tx) => {
      const result = await tx
        .update(formInstances)
        .set({ state: "open", updatedAt: new Date() })
        .where(
          and(
            eq(formInstances.id, instance.id),
            eq(formInstances.state, "scheduled"),
          ),
        )
        .returning();
      if (result.length === 0) return; // raced — someone else opened it
      const late = now.getTime() - instance.openAt.getTime() > LATE_THRESHOLD_MS;
      await writeAudit(tx, {
        actorUserId: null,
        action: "cycle.opened",
        entityType: "weekly_cycle",
        entityId: instance.id,
        metadata: late ? { late: true } : undefined,
        courseId: instance.courseId,
        sectionId: instance.sectionId,
      });
      // Queued in the SAME transaction as the state change: a rolled-back open
      // can never leave mail queued, and a committed one always queues it. The
      // unique idempotency key makes a re-run a no-op.
      await enqueueCycleOpened(tx, instance.id, now);
      opened += 1;
    });
  }
  return opened;
}

/** open → closed for every instance past its deadline. State-guarded. */
export async function closeDueCycles(now: Date): Promise<number> {
  const due = await db.query.formInstances.findMany({
    where: and(
      eq(formInstances.state, "open"),
      lte(formInstances.deadlineAt, now),
    ),
  });
  let closed = 0;
  for (const instance of due) {
    await db.transaction(async (tx) => {
      // Exclusive row lock first: a concurrent submit takes FOR SHARE on this
      // same row, so a submission either commits before the close or observes
      // the closed state. Without this there is a window in which a response is
      // accepted into an instance that is being closed.
      await tx
        .select({ id: formInstances.id })
        .from(formInstances)
        .where(eq(formInstances.id, instance.id))
        .for("update")
        .limit(1);
      const result = await tx
        .update(formInstances)
        .set({ state: "closed", updatedAt: new Date() })
        .where(
          and(eq(formInstances.id, instance.id), eq(formInstances.state, "open")),
        )
        .returning();
      if (result.length === 0) return;
      const late =
        now.getTime() - instance.deadlineAt.getTime() > LATE_THRESHOLD_MS;
      await writeAudit(tx, {
        actorUserId: null,
        action: "cycle.closed",
        entityType: "weekly_cycle",
        entityId: instance.id,
        metadata: late ? { late: true } : undefined,
        courseId: instance.courseId,
        sectionId: instance.sectionId,
      });
      // "At the deadline the latest submitted version becomes locked" — done in
      // the same transaction, so the two facts can never disagree.
      await lockResponsesForCycle(
        tx,
        instance.id,
        now,
        instance.courseId,
        instance.sectionId ?? undefined,
      );
      closed += 1;
    });
  }
  return closed;
}

/**
 * Staff reopens a closed instance (audited; D5 = hard deadline + audited reopen).
 *
 * Requires `manageWeeklyCycles` on at least one audience section — and reopening
 * necessarily affects the whole audience, so it additionally requires the
 * permission on EVERY audience section. A staff member who runs only Section A
 * cannot reopen a course-wide form for Section B.
 */
export async function reopenCycle(actorUserId: string, instanceId: string) {
  const { instance } = await requireFullAudienceStaff(
    actorUserId,
    instanceId,
    "manageWeeklyCycles",
  );
  if (instance.state !== "closed") {
    throw new Error(`Cannot reopen a form in state ${instance.state}`);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(formInstances)
      .set({ state: "open", updatedAt: new Date() })
      .where(eq(formInstances.id, instanceId));
    await writeAudit(tx, {
      actorUserId,
      action: "cycle.reopened",
      entityType: "weekly_cycle",
      entityId: instanceId,
      before: { state: "closed" },
      after: { state: "open" },
      courseId: instance.courseId,
      sectionId: instance.sectionId,
    });
    // Reopening is the ONLY route to a post-deadline edit (docs/decisions/open-decisions.md D5).
    // Unlocking here is what makes the reopen meaningful, and each unlock is
    // recorded per response.
    await unlockResponsesForCycle(
      tx,
      instanceId,
      actorUserId,
      new Date(),
      instance.courseId,
      instance.sectionId ?? undefined,
    );
  });
}

/** Staff skips a draft/scheduled occurrence. */
export async function skipCycle(actorUserId: string, instanceId: string) {
  const { instance } = await requireFullAudienceStaff(
    actorUserId,
    instanceId,
    "manageWeeklyCycles",
  );
  if (instance.state !== "draft" && instance.state !== "scheduled") {
    throw new Error(`Cannot skip a form in state ${instance.state}`);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(formInstances)
      .set({ state: "skipped", updatedAt: new Date() })
      .where(eq(formInstances.id, instanceId));
    await writeAudit(tx, {
      actorUserId,
      action: "cycle.skipped",
      entityType: "weekly_cycle",
      entityId: instanceId,
      before: { state: instance.state },
      after: { state: "skipped" },
      courseId: instance.courseId,
    });
  });
}

/**
 * Undo a skip: a skipped occurrence goes back to `scheduled`.
 *
 * `skipCycle` only accepts `draft` or `scheduled`, so a skipped instance has
 * never opened and cannot hold a submission. Restoring it therefore discards
 * nothing and revives no response — the reconciliation poller simply picks it up
 * again on its normal schedule.
 */
export async function restoreSkippedCycle(
  actorUserId: string,
  instanceId: string,
) {
  const { instance } = await requireFullAudienceStaff(
    actorUserId,
    instanceId,
    "manageWeeklyCycles",
  );
  if (instance.state !== "skipped") {
    throw new Error(`Cannot restore a form in state ${instance.state}`);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(formInstances)
      .set({ state: "scheduled", updatedAt: new Date() })
      .where(eq(formInstances.id, instanceId));
    await writeAudit(tx, {
      actorUserId,
      action: "cycle.restored",
      entityType: "weekly_cycle",
      entityId: instanceId,
      before: { state: instance.state },
      after: { state: "scheduled" },
      courseId: instance.courseId,
    });
  });
}

/**
 * Override one occurrence's open/deadline window (docs/product/specification.md §6.2 step 4:
 * "Staff can pause, skip, or override a scheduled release").
 *
 * Refused once the occurrence has a real submission ANYWHERE in its audience:
 * moving the window under a student who already answered would change the rules
 * after the fact. Skipping or reopening remain the tools for that case.
 */
export async function overrideCycleWindow(
  actorUserId: string,
  instanceId: string,
  input: { openAt: Date; deadlineAt: Date },
) {
  const { instance } = await requireFullAudienceStaff(
    actorUserId,
    instanceId,
    "manageWeeklyCycles",
  );
  if (input.openAt.getTime() >= input.deadlineAt.getTime()) {
    throw new Error("The deadline must be after the open time.");
  }
  if (await cycleHasSubmissions(db, instanceId)) {
    throw new Error(
      "This form already has a submission, so its window is locked. Skip or reopen it instead.",
    );
  }
  const now = new Date();
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(formInstances)
      .set({
        openAt: input.openAt,
        deadlineAt: input.deadlineAt,
        windowOverriddenByUserId: actorUserId,
        windowOverriddenAt: now,
        updatedAt: now,
      })
      .where(eq(formInstances.id, instanceId))
      .returning();
    await writeAudit(tx, {
      actorUserId,
      action: "cycle.window_overridden",
      entityType: "weekly_cycle",
      entityId: instanceId,
      before: {
        openAt: instance.openAt.toISOString(),
        deadlineAt: instance.deadlineAt.toISOString(),
      },
      after: {
        openAt: input.openAt.toISOString(),
        deadlineAt: input.deadlineAt.toISOString(),
      },
      courseId: instance.courseId,
      sectionId: instance.sectionId,
    });
    return updated!;
  });
}

/**
 * Instance-lifecycle authorization: the permission on EVERY audience section.
 *
 * Opening, closing, skipping, reopening, and re-windowing an instance affect all
 * of its sections at once, so partial standing is not enough. Read models use
 * the looser `authorizedAudienceSections` and filter their rows instead.
 */
export async function requireFullAudienceStaff(
  actorUserId: string,
  instanceId: string,
  permission: "manageWeeklyCycles" | "manageTemplates",
) {
  const { instance, sectionIds } = await requireInstanceStaff(
    db,
    actorUserId,
    instanceId,
    permission,
  );
  const audience = await getInstanceAudience(db, instanceId);
  const missing = audience.filter((id) => !sectionIds.includes(id));
  if (missing.length > 0) {
    throw new AuthzError(
      "This form is shared with a section you do not have permission to manage.",
    );
  }
  return { instance, sectionIds: audience };
}

/**
 * Edit-lock check (D4): structural edits are locked once one real submission
 * exists anywhere in the instance's audience.
 *
 * A DRAFT does not lock anything — it is not a submission, and a single student
 * opening the form would otherwise freeze the occurrence for staff.
 */
export async function cycleHasSubmissions(
  dbx: DbOrTx,
  instanceId: string,
): Promise<boolean> {
  const one = await dbx.query.formResponses.findFirst({
    where: and(
      eq(formResponses.cycleId, instanceId),
      inArray(formResponses.lifecycle, ["submitted", "locked"]),
    ),
  });
  return !!one;
}
