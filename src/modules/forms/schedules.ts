import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  classSections,
  formInstanceSections,
  formInstances,
  formResponses,
  formScheduleSections,
  formTemplates,
  recurrenceSchedules,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import {
  requireCourseStaff,
  requireSectionStaff,
  type SectionPermission,
} from "@/modules/authz";
import { generateInstancesForSchedule } from "./cycles";
import {
  filterAuthorizedSections,
  getScheduleAudience,
  resolveAudienceSections,
  type AudienceInput,
} from "./audience";
import { parseDate, parseTime, zonedTimeToUtc } from "./timezone";

/**
 * Delivery configuration for a form (docs/FORMS-AUDIENCE-DYNAMIC-INSTANCES.md §3).
 *
 * A delivery configuration belongs to a COURSE and names an explicit audience.
 * Reconfiguring deactivates the previous one instead of mutating it, so instances
 * already generated keep their provenance and their (scheduleId, sequence)
 * uniqueness guarantee. A newly saved configuration materializes its first
 * instances immediately so staff see the result rather than waiting for a poll.
 *
 * Four delivery modes; `weekly` is one of them, not the shape of the product.
 */

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleError";
  }
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const DELIVERY_MODES = [
  "one_time",
  "weekly",
  "custom_recurring",
  "manual",
] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

/** What a teacher is choosing between, in the product's words. */
export const DELIVERY_LABELS: Record<DeliveryMode, string> = {
  one_time: "One time",
  weekly: "Every week",
  custom_recurring: "Custom schedule",
  manual: "Open manually",
};

export const DELIVERY_HINTS: Record<DeliveryMode, string> = {
  one_time: "Opens once, closes once. For a long-exam or end-of-term form.",
  weekly: "A new form every week, opened and closed for you.",
  custom_recurring: "A new form every few weeks, on the same day and time.",
  manual: "Nothing opens until you open it yourself.",
};

const timeField = z.string().regex(TIME_PATTERN, "Use a 24-hour HH:MM time");
const dateField = z.string().regex(DATE_PATTERN, "Use a YYYY-MM-DD date");
const optionalDate = dateField
  .optional()
  .or(z.literal("").transform(() => undefined));

/**
 * One input schema for all four modes. Fields irrelevant to the chosen mode are
 * ignored rather than refused, so switching mode in the UI never strips a value
 * the teacher may switch back to; `superRefine` then enforces exactly what the
 * chosen mode requires, mirroring the `recurrence_mode_fields` CHECK so the user
 * gets a field error instead of a database exception.
 */
export const deliveryInputSchema = z
  .object({
    templateId: z.string().uuid(),
    deliveryMode: z.enum(DELIVERY_MODES),
    audienceMode: z.enum(["all_sections", "selected_sections"]),
    sectionIds: z.array(z.string().uuid()).default([]),
    // recurring
    openDayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
    openTime: timeField.optional().or(z.literal("").transform(() => undefined)),
    deadlineDayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
    deadlineTime: timeField
      .optional()
      .or(z.literal("").transform(() => undefined)),
    startDate: optionalDate,
    endDate: optionalDate,
    occurrenceCount: z.coerce.number().int().positive().max(60).optional(),
    intervalWeeks: z.coerce.number().int().min(1).max(12).optional(),
    // one_time
    openDate: optionalDate,
    openAtTime: timeField
      .optional()
      .or(z.literal("").transform(() => undefined)),
    deadlineDate: optionalDate,
    deadlineAtTime: timeField
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .superRefine((input, ctx) => {
    const issue = (message: string, path: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });

    if (input.audienceMode === "selected_sections" && input.sectionIds.length === 0) {
      issue("Choose at least one section for this form.", "sectionIds");
    }

    if (input.deliveryMode === "weekly" || input.deliveryMode === "custom_recurring") {
      if (input.openDayOfWeek === undefined) issue("Choose an opening day.", "openDayOfWeek");
      if (!input.openTime) issue("Choose an opening time.", "openTime");
      if (input.deadlineDayOfWeek === undefined) {
        issue("Choose a closing day.", "deadlineDayOfWeek");
      }
      if (!input.deadlineTime) issue("Choose a closing time.", "deadlineTime");
      if (!input.startDate) issue("Choose the date the first one opens.", "startDate");
      if (input.endDate && input.occurrenceCount !== undefined) {
        issue(
          "Choose either an end date or a number of occurrences, not both",
          "endDate",
        );
      }
      if (
        input.openDayOfWeek !== undefined &&
        input.openDayOfWeek === input.deadlineDayOfWeek &&
        input.openTime &&
        input.deadlineTime &&
        input.deadlineTime <= input.openTime
      ) {
        issue(
          "A same-day deadline must be later than the open time; otherwise pick a different closing day",
          "deadlineTime",
        );
      }
      if (
        input.deliveryMode === "custom_recurring" &&
        (input.intervalWeeks ?? 1) < 2
      ) {
        issue(
          "A custom schedule repeats every 2 weeks or more. Choose “Every week” for weekly.",
          "intervalWeeks",
        );
      }
    }

    if (input.deliveryMode === "one_time") {
      if (!input.openDate) issue("Choose the date it opens.", "openDate");
      if (!input.openAtTime) issue("Choose the time it opens.", "openAtTime");
      if (!input.deadlineDate) issue("Choose the date it closes.", "deadlineDate");
      if (!input.deadlineAtTime) issue("Choose the time it closes.", "deadlineAtTime");
    }
  });

export type DeliveryInput = z.infer<typeof deliveryInputSchema>;

/** @deprecated Kept so existing callers/tests keep compiling. */
export const recurrenceInputSchema = deliveryInputSchema;
export type RecurrenceInput = DeliveryInput;

export { DAY_NAMES } from "@/lib/days";

function pad(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

/**
 * Save (or replace) the delivery configuration of one form.
 *
 * Authorization is deliberately two-sided: course-staff standing on the course,
 * AND `manageWeeklyCycles` on every section being targeted. Neither alone is
 * enough — the first stops a stranger configuring a course's forms, the second
 * stops a staff member sending a form into a section they do not run.
 */
export async function configureDelivery(
  actorUserId: string,
  courseId: string,
  rawInput: unknown,
) {
  await requireCourseStaff(db, actorUserId, courseId);
  const parsed = deliveryInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ScheduleError(
      parsed.error.issues.map((i) => i.message).join(" "),
    );
  }
  const input = parsed.data;

  const template = await db.query.formTemplates.findFirst({
    where: eq(formTemplates.id, input.templateId),
  });
  if (!template || template.courseId !== courseId) {
    throw new ScheduleError("Choose a form that belongs to this course");
  }

  const audienceInput: AudienceInput =
    input.audienceMode === "all_sections"
      ? { mode: "all_sections" }
      : { mode: "selected_sections", sectionIds: input.sectionIds };
  const sectionIds = await resolveAudienceSections(db, courseId, audienceInput);

  // Every targeted section, individually. A course-staff member who does not run
  // Section B cannot deliver a form into it.
  for (const sectionId of sectionIds) {
    await requireSectionStaff(db, actorUserId, sectionId, "manageWeeklyCycles");
  }

  const sections = await db.query.classSections.findMany({
    where: inArray(classSections.id, sectionIds),
  });
  const timezones = [...new Set(sections.map((s) => s.timezone))];
  if (timezones.length > 1) {
    // One instance has ONE window. Two timezones would make the deadline mean
    // two different moments, so this is refused rather than silently resolved.
    throw new ScheduleError(
      "These sections are in different timezones, so they cannot share one form window. Give each timezone its own form.",
    );
  }
  const timezone = timezones[0] ?? sections[0]?.timezone;
  if (!timezone) throw new ScheduleError("Section not found");

  const previous = await db.query.recurrenceSchedules.findFirst({
    where: and(
      eq(recurrenceSchedules.templateId, input.templateId),
      eq(recurrenceSchedules.active, true),
    ),
    orderBy: desc(recurrenceSchedules.createdAt),
  });
  const previousAudience = previous
    ? await getScheduleAudience(db, previous.id)
    : [];

  const oneTimeWindow =
    input.deliveryMode === "one_time"
      ? (() => {
          const open = parseDate(input.openDate!);
          const openAt = parseTime(pad(input.openAtTime!));
          const close = parseDate(input.deadlineDate!);
          const closeAt = parseTime(pad(input.deadlineAtTime!));
          const firstOpenAt = zonedTimeToUtc(
            open.y,
            open.mo,
            open.d,
            openAt.h,
            openAt.m,
            openAt.s,
            timezone,
          );
          const firstDeadlineAt = zonedTimeToUtc(
            close.y,
            close.mo,
            close.d,
            closeAt.h,
            closeAt.m,
            closeAt.s,
            timezone,
          );
          if (firstOpenAt.getTime() >= firstDeadlineAt.getTime()) {
            throw new ScheduleError("The deadline must be after the open time.");
          }
          return { firstOpenAt, firstDeadlineAt };
        })()
      : { firstOpenAt: null, firstDeadlineAt: null };

  const recurring =
    input.deliveryMode === "weekly" || input.deliveryMode === "custom_recurring";

  const created = await db.transaction(async (tx) => {
    if (previous) {
      // Retire rather than mutate: instances already generated from it keep a
      // valid reference and their idempotency constraint.
      await tx
        .update(recurrenceSchedules)
        .set({ active: false })
        .where(eq(recurrenceSchedules.id, previous.id));
    }
    const [row] = await tx
      .insert(recurrenceSchedules)
      .values({
        courseId,
        sectionId: null,
        frequency: "weekly",
        deliveryMode: input.deliveryMode,
        audienceMode: input.audienceMode,
        intervalWeeks:
          input.deliveryMode === "custom_recurring"
            ? (input.intervalWeeks ?? 2)
            : 1,
        openDayOfWeek: recurring ? input.openDayOfWeek! : null,
        openTime: recurring ? pad(input.openTime!) : null,
        deadlineDayOfWeek: recurring ? input.deadlineDayOfWeek! : null,
        deadlineTime: recurring ? pad(input.deadlineTime!) : null,
        startDate: recurring ? input.startDate! : null,
        endDate: recurring ? (input.endDate ?? null) : null,
        occurrenceCount: recurring ? (input.occurrenceCount ?? null) : null,
        firstOpenAt: oneTimeWindow.firstOpenAt,
        firstDeadlineAt: oneTimeWindow.firstDeadlineAt,
        templateId: input.templateId,
        timezone,
      })
      .returning();
    await tx.insert(formScheduleSections).values(
      sectionIds.map((sectionId) => ({
        scheduleId: row!.id,
        sectionId,
        createdByUserId: actorUserId,
      })),
    );
    await writeAudit(tx, {
      actorUserId,
      action: "form.delivery_configured",
      entityType: "recurrence_schedule",
      entityId: row!.id,
      before: previous
        ? {
            deliveryMode: previous.deliveryMode,
            openDayOfWeek: previous.openDayOfWeek,
            openTime: previous.openTime,
            deadlineDayOfWeek: previous.deadlineDayOfWeek,
            deadlineTime: previous.deadlineTime,
            startDate: previous.startDate,
            endDate: previous.endDate,
            occurrenceCount: previous.occurrenceCount,
            intervalWeeks: previous.intervalWeeks,
          }
        : undefined,
      after: {
        templateId: input.templateId,
        deliveryMode: row!.deliveryMode,
        audienceMode: row!.audienceMode,
        intervalWeeks: row!.intervalWeeks,
        openDayOfWeek: row!.openDayOfWeek,
        openTime: row!.openTime,
        deadlineDayOfWeek: row!.deadlineDayOfWeek,
        deadlineTime: row!.deadlineTime,
        startDate: row!.startDate,
        endDate: row!.endDate,
        occurrenceCount: row!.occurrenceCount,
        firstOpenAt: row!.firstOpenAt?.toISOString() ?? null,
        firstDeadlineAt: row!.firstDeadlineAt?.toISOString() ?? null,
        timezone: row!.timezone,
      },
      courseId,
      metadata: previous ? { replacedScheduleId: previous.id } : undefined,
    });
    // The audience gets its own audit row: it is the access-bearing part of this
    // change, and it must be findable as such.
    await writeAudit(tx, {
      actorUserId,
      action: "form.audience_set",
      entityType: "recurrence_schedule",
      entityId: row!.id,
      before: previous ? { sectionIds: previousAudience } : undefined,
      after: { audienceMode: input.audienceMode, sectionIds },
      courseId,
    });
    return row!;
  });

  // Materialize the near-term instances right away (idempotent).
  const generated = await generateInstancesForSchedule(created, new Date());
  return { schedule: created, instancesGenerated: generated, sectionIds };
}

/**
 * @deprecated The section-scoped entry point. Kept because a section may still
 * carry a legacy schedule; it delegates to the course-level service with a
 * single-section audience so there is exactly one implementation.
 */
export async function configureRecurrence(
  actorUserId: string,
  sectionId: string,
  rawInput: unknown,
) {
  const section = await db.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });
  if (!section) throw new ScheduleError("Section not found");
  const input =
    typeof rawInput === "object" && rawInput !== null
      ? { deliveryMode: "weekly", audienceMode: "selected_sections", ...rawInput, sectionIds: [sectionId] }
      : rawInput;
  const result = await configureDelivery(actorUserId, section.courseId, input);
  return {
    schedule: result.schedule,
    cyclesGenerated: result.instancesGenerated,
  };
}

/** The active delivery configuration of one form, with its audience. */
export async function getDeliveryForTemplate(templateId: string) {
  const schedule = await db.query.recurrenceSchedules.findFirst({
    where: and(
      eq(recurrenceSchedules.templateId, templateId),
      eq(recurrenceSchedules.active, true),
    ),
    orderBy: desc(recurrenceSchedules.createdAt),
  });
  if (!schedule) return null;
  const sectionIds = await getScheduleAudience(db, schedule.id);
  const sections = sectionIds.length
    ? await db.query.classSections.findMany({
        where: inArray(classSections.id, sectionIds),
        orderBy: asc(classSections.title),
      })
    : [];
  return { schedule, sections };
}

/**
 * The section's active schedule, if it has one.
 *
 * A section "has" a schedule when it is in that schedule's audience — which
 * covers both a legacy per-section schedule and a course-level one that includes
 * this section.
 */
export async function getActiveSchedule(sectionId: string) {
  const rows = await db.query.formScheduleSections.findMany({
    where: eq(formScheduleSections.sectionId, sectionId),
  });
  const scheduleIds = rows.map((r) => r.scheduleId);
  const schedule = scheduleIds.length
    ? await db.query.recurrenceSchedules.findFirst({
        where: and(
          inArray(recurrenceSchedules.id, scheduleIds),
          eq(recurrenceSchedules.active, true),
        ),
        orderBy: desc(recurrenceSchedules.createdAt),
      })
    : undefined;
  if (!schedule) return null;
  const template = await db.query.formTemplates.findFirst({
    where: eq(formTemplates.id, schedule.templateId),
  });
  return { schedule, template: template ?? null };
}

/** Stop generating new instances. Existing instances are untouched. */
export async function deactivateSchedule(
  actorUserId: string,
  scheduleId: string,
) {
  const schedule = await db.query.recurrenceSchedules.findFirst({
    where: eq(recurrenceSchedules.id, scheduleId),
  });
  if (!schedule) throw new ScheduleError("This form has no active schedule");
  await requireCourseStaff(db, actorUserId, schedule.courseId);
  if (!schedule.active) return;

  await db.transaction(async (tx) => {
    await tx
      .update(recurrenceSchedules)
      .set({ active: false })
      .where(eq(recurrenceSchedules.id, schedule.id));
    await writeAudit(tx, {
      actorUserId,
      action: "form.delivery_configured",
      entityType: "recurrence_schedule",
      entityId: schedule.id,
      before: { active: true },
      after: { active: false },
      courseId: schedule.courseId,
      metadata: { deactivated: true },
    });
  });
}

/**
 * Instances of a section with response counts and the structural edit-lock state
 * (D4: structural edits lock once one response exists). Newest first.
 *
 * "Of a section" means "whose audience includes this section". Counts are the
 * section's own — a shared form does not show a staff member another section's
 * volume here.
 */
export async function listCyclesForSection(
  actorUserId: string,
  sectionId: string,
) {
  await requireSectionStaff(db, actorUserId, sectionId, "manageWeeklyCycles", {
    allowArchived: true,
  });
  const audienceRows = await db.query.formInstanceSections.findMany({
    where: eq(formInstanceSections.sectionId, sectionId),
  });
  const ids = audienceRows.map((r) => r.instanceId);
  if (ids.length === 0) return [];
  const instances = await db.query.formInstances.findMany({
    where: inArray(formInstances.id, ids),
    orderBy: [desc(formInstances.cycleIndex), asc(formInstances.openAt)],
  });
  if (instances.length === 0) return [];
  const responses = await db.query.formResponses.findMany({
    where: and(
      inArray(
        formResponses.cycleId,
        instances.map((c) => c.id),
      ),
      eq(formResponses.sectionId, sectionId),
    ),
  });
  const counts = new Map<string, { total: number; valid: number }>();
  for (const r of responses) {
    const entry = counts.get(r.cycleId) ?? { total: 0, valid: 0 };
    entry.total += 1;
    if (r.validity === "valid") entry.valid += 1;
    counts.set(r.cycleId, entry);
  }
  // The edit lock is global to the instance, not per section: one response
  // anywhere in the audience freezes the structure for everyone.
  const anyResponses = await db.query.formResponses.findMany({
    where: and(
      inArray(
        formResponses.cycleId,
        instances.map((c) => c.id),
      ),
      inArray(formResponses.lifecycle, ["submitted", "locked"]),
    ),
    columns: { cycleId: true },
  });
  const locked = new Set(anyResponses.map((r) => r.cycleId));
  return instances.map((cycle) => {
    const count = counts.get(cycle.id) ?? { total: 0, valid: 0 };
    return {
      cycle,
      submissionCount: count.total,
      validCount: count.valid,
      editLocked: locked.has(cycle.id),
    };
  });
}

/**
 * The sections of a course this actor may act on with `permission` — the source
 * of the audience picker's options and of the review inbox's section filter.
 */
export async function listAudienceOptions(
  actorUserId: string,
  courseId: string,
  permission: SectionPermission = "manageWeeklyCycles",
) {
  const sections = await db.query.classSections.findMany({
    where: eq(classSections.courseId, courseId),
    orderBy: [asc(classSections.title), asc(classSections.id)],
  });
  const allowed = new Set(
    await filterAuthorizedSections(
      db,
      actorUserId,
      sections.map((s) => s.id),
      permission,
    ),
  );
  return sections.filter((s) => allowed.has(s.id));
}
