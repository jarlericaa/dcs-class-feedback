import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  classSections,
  formResponses,
  formTemplates,
  recurrenceSchedules,
  weeklyCycles,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { requireSectionStaff } from "@/modules/authz";
import { generateCyclesForSchedule } from "./cycles";

/**
 * Recurrence schedule configuration (weekly-form-workflow.md §2).
 *
 * A section has at most ONE active schedule. Reconfiguring deactivates the
 * previous one instead of mutating it, so cycles already generated from the
 * old schedule keep their provenance and their (scheduleId, cycleIndex)
 * uniqueness guarantee. Newly saved schedules materialize their first cycles
 * immediately so staff can see the result rather than waiting for a poll.
 */

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleError";
  }
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const recurrenceInputSchema = z
  .object({
    templateId: z.string().uuid(),
    openDayOfWeek: z.coerce.number().int().min(0).max(6),
    openTime: z.string().regex(TIME_PATTERN, "Use a 24-hour HH:MM time"),
    deadlineDayOfWeek: z.coerce.number().int().min(0).max(6),
    deadlineTime: z.string().regex(TIME_PATTERN, "Use a 24-hour HH:MM time"),
    startDate: z.string().regex(DATE_PATTERN, "Use a YYYY-MM-DD date"),
    endDate: z
      .string()
      .regex(DATE_PATTERN, "Use a YYYY-MM-DD date")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    occurrenceCount: z.coerce.number().int().positive().max(60).optional(),
  })
  .superRefine((input, ctx) => {
    // Mirrors the recurrence_end_condition CHECK constraint so the user gets a
    // field error instead of a database exception.
    if (input.endDate && input.occurrenceCount !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose either an end date or a number of weeks, not both",
        path: ["endDate"],
      });
    }
    if (
      input.openDayOfWeek === input.deadlineDayOfWeek &&
      input.deadlineTime <= input.openTime
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A same-day deadline must be later than the open time; otherwise pick a different deadline day",
        path: ["deadlineTime"],
      });
    }
  });

export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;

/** The section's active schedule (with its template), or null. */
export async function getActiveSchedule(sectionId: string) {
  const schedule = await db.query.recurrenceSchedules.findFirst({
    where: and(
      eq(recurrenceSchedules.sectionId, sectionId),
      eq(recurrenceSchedules.active, true),
    ),
    orderBy: desc(recurrenceSchedules.createdAt),
  });
  if (!schedule) return null;
  const template = await db.query.formTemplates.findFirst({
    where: eq(formTemplates.id, schedule.templateId),
  });
  return { schedule, template: template ?? null };
}

/**
 * Create or replace the section's weekly schedule. Requires the
 * `manage_weekly_cycles` capability on the section.
 */
export async function configureRecurrence(
  actorUserId: string,
  sectionId: string,
  rawInput: unknown,
) {
  await requireSectionStaff(db, actorUserId, sectionId, "manageWeeklyCycles");
  const input = recurrenceInputSchema.parse(rawInput);

  const section = await db.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });
  if (!section) throw new ScheduleError("Section not found");

  const template = await db.query.formTemplates.findFirst({
    where: eq(formTemplates.id, input.templateId),
  });
  if (!template || template.courseId !== section.courseId) {
    throw new ScheduleError("Choose a template that belongs to this course");
  }

  const previous = await db.query.recurrenceSchedules.findFirst({
    where: and(
      eq(recurrenceSchedules.sectionId, sectionId),
      eq(recurrenceSchedules.active, true),
    ),
  });

  const created = await db.transaction(async (tx) => {
    if (previous) {
      // Retire rather than mutate: cycles already generated from it keep a
      // valid schedule reference and their idempotency constraint.
      await tx
        .update(recurrenceSchedules)
        .set({ active: false })
        .where(eq(recurrenceSchedules.id, previous.id));
    }
    const [row] = await tx
      .insert(recurrenceSchedules)
      .values({
        sectionId,
        frequency: "weekly",
        openDayOfWeek: input.openDayOfWeek,
        openTime: input.openTime.length === 5 ? `${input.openTime}:00` : input.openTime,
        deadlineDayOfWeek: input.deadlineDayOfWeek,
        deadlineTime:
          input.deadlineTime.length === 5
            ? `${input.deadlineTime}:00`
            : input.deadlineTime,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        occurrenceCount: input.occurrenceCount ?? null,
        templateId: input.templateId,
        timezone: section.timezone,
      })
      .returning();
    await writeAudit(tx, {
      actorUserId,
      action: "recurrence.configured",
      entityType: "recurrence_schedule",
      entityId: row!.id,
      before: previous
        ? {
            openDayOfWeek: previous.openDayOfWeek,
            openTime: previous.openTime,
            deadlineDayOfWeek: previous.deadlineDayOfWeek,
            deadlineTime: previous.deadlineTime,
            startDate: previous.startDate,
            endDate: previous.endDate,
            occurrenceCount: previous.occurrenceCount,
            templateId: previous.templateId,
          }
        : undefined,
      after: {
        sectionId,
        openDayOfWeek: row!.openDayOfWeek,
        openTime: row!.openTime,
        deadlineDayOfWeek: row!.deadlineDayOfWeek,
        deadlineTime: row!.deadlineTime,
        startDate: row!.startDate,
        endDate: row!.endDate,
        occurrenceCount: row!.occurrenceCount,
        templateId: row!.templateId,
        timezone: row!.timezone,
      },
      metadata: previous ? { replacedScheduleId: previous.id } : undefined,
    });
    return row!;
  });

  // Materialize the near-term cycles right away (idempotent).
  const generated = await generateCyclesForSchedule(created, new Date());
  return { schedule: created, cyclesGenerated: generated };
}

/** Stop generating new cycles. Existing cycles are untouched. */
export async function deactivateSchedule(
  actorUserId: string,
  sectionId: string,
) {
  await requireSectionStaff(db, actorUserId, sectionId, "manageWeeklyCycles");
  const active = await db.query.recurrenceSchedules.findFirst({
    where: and(
      eq(recurrenceSchedules.sectionId, sectionId),
      eq(recurrenceSchedules.active, true),
    ),
  });
  if (!active) throw new ScheduleError("This section has no active schedule");

  await db.transaction(async (tx) => {
    await tx
      .update(recurrenceSchedules)
      .set({ active: false })
      .where(eq(recurrenceSchedules.id, active.id));
    await writeAudit(tx, {
      actorUserId,
      action: "recurrence.configured",
      entityType: "recurrence_schedule",
      entityId: active.id,
      before: { active: true },
      after: { active: false },
      metadata: { sectionId, deactivated: true },
    });
  });
}

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Cycles of a section with submission counts and the structural edit-lock
 * state (Open D4, provisional: structural edits lock once one response
 * exists). Newest first. Requires `manage_weekly_cycles`.
 */
export async function listCyclesForSection(
  actorUserId: string,
  sectionId: string,
) {
  await requireSectionStaff(db, actorUserId, sectionId, "manageWeeklyCycles");
  const cycles = await db.query.weeklyCycles.findMany({
    where: eq(weeklyCycles.sectionId, sectionId),
    orderBy: [desc(weeklyCycles.cycleIndex), asc(weeklyCycles.openAt)],
  });
  if (cycles.length === 0) return [];
  const responses = await db.query.formResponses.findMany({
    where: inArray(
      formResponses.cycleId,
      cycles.map((c) => c.id),
    ),
  });
  const counts = new Map<string, { total: number; valid: number }>();
  for (const r of responses) {
    const entry = counts.get(r.cycleId) ?? { total: 0, valid: 0 };
    entry.total += 1;
    if (r.validity === "valid") entry.valid += 1;
    counts.set(r.cycleId, entry);
  }
  return cycles.map((cycle) => {
    const count = counts.get(cycle.id) ?? { total: 0, valid: 0 };
    return {
      cycle,
      submissionCount: count.total,
      validCount: count.valid,
      /** structural edits are locked once anyone has submitted */
      editLocked: count.total > 0,
    };
  });
}
