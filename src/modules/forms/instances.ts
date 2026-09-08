import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/db";
import {
  classSections,
  formInstances,
  formQuestions,
  formResponses,
  formScheduleSections,
  formTemplates,
  lessonsTopics,
  recurrenceSchedules,
  studentSubmissionItems,
  templateVersions,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import {
  AuthzError,
  requireCourseStaff,
  requireSectionStaff,
} from "@/modules/authz";
import {
  filterAuthorizedSections,
  getAudiencesForInstances,
  getInstanceAudience,
  requireInstanceStaff,
  resolveAudienceSections,
  setInstanceAudience,
  type AudienceInput,
} from "./audience";
import { cycleHasSubmissions, requireFullAudienceStaff } from "./cycles";
import { questionDefinitionSchema } from "./questions";
import { getLatestTemplateVersion } from "./templates";
import { parseDate, parseTime, zonedTimeToUtc } from "./timezone";

/**
 * Form instances: read models, per-occurrence customization, focus/topic, manual
 * open/close, and the student preview.
 *
 * The customization rule this module exists to protect: editing one occurrence
 * edits ONLY that occurrence's own question snapshot. The base definition version
 * and every other occurrence are different rows, so "Week 4 only" is a property
 * of the schema rather than of this service remembering to be careful
 * (docs/domain/forms-and-audiences.md §5).
 */

export class InstanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstanceError";
  }
}

/** An instance's structural edits are frozen once anyone has submitted. */
export class InstanceLockedError extends InstanceError {
  constructor(
    message = "Someone has already answered this form, so its questions can no longer be added to, removed, reordered, or retyped. You can still fix wording.",
  ) {
    super(message);
    this.name = "InstanceLockedError";
  }
}

export type InstanceQuestion = typeof formQuestions.$inferSelect;
export type FormInstance = typeof formInstances.$inferSelect;

/**
 * How an occurrence is labelled in the UI.
 *
 * A sequence number is shown ONLY when the delivery mode actually has one — a
 * one-time LE form is not "Week 1", and the product never says "cycle".
 */
export function instanceLabel(instance: {
  deliveryMode: FormInstance["deliveryMode"];
  cycleIndex: number;
  title: string | null;
}): string {
  if (instance.title) return instance.title;
  switch (instance.deliveryMode) {
    case "weekly":
      return `Week ${instance.cycleIndex}`;
    case "custom_recurring":
      return `Occurrence ${instance.cycleIndex}`;
    case "one_time":
    case "manual":
      return "This form";
  }
}

/** Sequence numbers are meaningful only for the recurring modes. */
export function hasSequence(instance: {
  deliveryMode: FormInstance["deliveryMode"];
}): boolean {
  return (
    instance.deliveryMode === "weekly" ||
    instance.deliveryMode === "custom_recurring"
  );
}

// --- read models -----------------------------------------------------------

export interface CourseFormRow {
  template: typeof formTemplates.$inferSelect;
  latestVersionId: string | null;
  questionCount: number;
  schedule: typeof recurrenceSchedules.$inferSelect | null;
  /** the audience of the active schedule, as sections the actor may see */
  audienceSections: (typeof classSections.$inferSelect)[];
  /** true when the schedule targets sections this actor cannot see */
  audienceHasHiddenSections: boolean;
  instanceCount: number;
  openInstance: FormInstance | null;
  nextInstance: FormInstance | null;
  /** responses across the instances and sections this actor may see */
  responseCount: number;
  needsReviewCount: number;
}

/**
 * The course workspace's form list: one row per form definition, with its
 * delivery, audience, state, and counts.
 *
 * Counts are computed over the actor's authorized sections only, so a shared form
 * never shows a section-scoped staff member another section's volume.
 */
export async function listCourseForms(
  actorUserId: string,
  courseId: string,
): Promise<CourseFormRow[]> {
  await requireCourseStaff(db, actorUserId, courseId, { allowArchived: true });

  const templates = await db.query.formTemplates.findMany({
    where: eq(formTemplates.courseId, courseId),
    orderBy: asc(formTemplates.title),
  });
  if (templates.length === 0) return [];

  const sections = await db.query.classSections.findMany({
    where: eq(classSections.courseId, courseId),
    orderBy: [asc(classSections.title), asc(classSections.id)],
  });
  const visibleSectionIds = new Set(
    await filterAuthorizedSections(
      db,
      actorUserId,
      sections.map((s) => s.id),
      "reviewResponses",
    ),
  );
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  const schedules = await db.query.recurrenceSchedules.findMany({
    where: and(
      eq(recurrenceSchedules.courseId, courseId),
      eq(recurrenceSchedules.active, true),
    ),
    orderBy: desc(recurrenceSchedules.createdAt),
  });
  const scheduleByTemplate = new Map<
    string,
    typeof recurrenceSchedules.$inferSelect
  >();
  for (const schedule of schedules) {
    if (!scheduleByTemplate.has(schedule.templateId)) {
      scheduleByTemplate.set(schedule.templateId, schedule);
    }
  }
  const scheduleAudience = new Map<string, string[]>();
  if (schedules.length > 0) {
    const rows = await db.query.formScheduleSections.findMany({
      where: inArray(
        formScheduleSections.scheduleId,
        schedules.map((s) => s.id),
      ),
    });
    for (const row of rows) {
      const list = scheduleAudience.get(row.scheduleId) ?? [];
      list.push(row.sectionId);
      scheduleAudience.set(row.scheduleId, list);
    }
  }

  const instances = await db.query.formInstances.findMany({
    where: eq(formInstances.courseId, courseId),
    orderBy: [asc(formInstances.openAt)],
  });
  const versions = await db.query.templateVersions.findMany({
    where: inArray(
      templateVersions.templateId,
      templates.map((t) => t.id),
    ),
  });
  const versionToTemplate = new Map(versions.map((v) => [v.id, v.templateId]));
  const instancesByTemplate = new Map<string, FormInstance[]>();
  const scheduleToTemplate = new Map(schedules.map((s) => [s.id, s.templateId]));
  const allSchedules = await db.query.recurrenceSchedules.findMany({
    where: eq(recurrenceSchedules.courseId, courseId),
  });
  for (const s of allSchedules) scheduleToTemplate.set(s.id, s.templateId);
  for (const instance of instances) {
    const templateId =
      (instance.templateVersionId
        ? versionToTemplate.get(instance.templateVersionId)
        : undefined) ??
      (instance.scheduleId ? scheduleToTemplate.get(instance.scheduleId) : undefined);
    if (!templateId) continue;
    const list = instancesByTemplate.get(templateId) ?? [];
    list.push(instance);
    instancesByTemplate.set(templateId, list);
  }

  const responses = instances.length
    ? await db.query.formResponses.findMany({
        where: and(
          inArray(
            formResponses.cycleId,
            instances.map((c) => c.id),
          ),
          inArray(formResponses.lifecycle, ["submitted", "locked"]),
        ),
      })
    : [];
  const visibleResponses = responses.filter((r) =>
    visibleSectionIds.has(r.sectionId),
  );
  const items = visibleResponses.length
    ? await db.query.studentSubmissionItems.findMany({
        where: and(
          inArray(
            studentSubmissionItems.responseId,
            visibleResponses.map((r) => r.id),
          ),
          isNull(studentSubmissionItems.withdrawnAt),
        ),
      })
    : [];
  const openItemsByResponse = new Map<string, number>();
  for (const item of items) {
    if (item.kind !== "question") continue;
    if (item.reviewState === "resolved" || item.reviewState === "archived") {
      continue;
    }
    openItemsByResponse.set(
      item.responseId,
      (openItemsByResponse.get(item.responseId) ?? 0) + 1,
    );
  }

  const now = Date.now();
  const rows: CourseFormRow[] = [];
  for (const template of templates) {
    const latest = versions
      .filter((v) => v.templateId === template.id)
      .sort((a, b) => b.versionNumber - a.versionNumber)[0];
    const questionCount = latest
      ? (
          await db.query.formQuestions.findMany({
            where: eq(formQuestions.templateVersionId, latest.id),
          })
        ).length
      : 0;
    const schedule = scheduleByTemplate.get(template.id) ?? null;
    const audienceIds = schedule
      ? schedule.audienceMode === "all_sections"
        ? sections.filter((s) => s.active).map((s) => s.id)
        : (scheduleAudience.get(schedule.id) ?? [])
      : [];
    const mine = instancesByTemplate.get(template.id) ?? [];
    const templateResponses = visibleResponses.filter((r) =>
      mine.some((i) => i.id === r.cycleId),
    );
    rows.push({
      template,
      latestVersionId: latest?.id ?? null,
      questionCount,
      schedule,
      audienceSections: audienceIds
        .filter((id) => visibleSectionIds.has(id))
        .flatMap((id) => {
          const section = sectionById.get(id);
          return section ? [section] : [];
        }),
      audienceHasHiddenSections: audienceIds.some(
        (id) => !visibleSectionIds.has(id),
      ),
      instanceCount: mine.length,
      openInstance:
        mine.find(
          (i) =>
            i.state === "open" &&
            i.openAt.getTime() <= now &&
            i.deadlineAt.getTime() > now,
        ) ?? null,
      nextInstance:
        mine.find(
          (i) => i.state === "scheduled" || (i.state === "draft" && !i.scheduleId),
        ) ?? null,
      responseCount: templateResponses.length,
      needsReviewCount: templateResponses.filter(
        (r) => (openItemsByResponse.get(r.id) ?? 0) > 0,
      ).length,
    });
  }
  return rows;
}

export interface InstanceListRow {
  instance: FormInstance;
  label: string;
  audienceSections: (typeof classSections.$inferSelect)[];
  audienceHasHiddenSections: boolean;
  responseCount: number;
  editLocked: boolean;
  customized: boolean;
  questionCount: number;
}

/** Occurrences of one form, newest window first. */
export async function listInstancesForTemplate(
  actorUserId: string,
  templateId: string,
): Promise<InstanceListRow[]> {
  const template = await db.query.formTemplates.findFirst({
    where: eq(formTemplates.id, templateId),
  });
  if (!template) throw new InstanceError("Form not found");
  await requireCourseStaff(db, actorUserId, template.courseId, {
    allowArchived: true,
  });

  const instances = await instancesOfTemplate(db, templateId);
  if (instances.length === 0) return [];

  const audiences = await getAudiencesForInstances(
    db,
    instances.map((i) => i.id),
  );
  const allSectionIds = [...new Set([...audiences.values()].flat())];
  const visible = new Set(
    await filterAuthorizedSections(
      db,
      actorUserId,
      allSectionIds,
      "reviewResponses",
    ),
  );
  const sections = allSectionIds.length
    ? await db.query.classSections.findMany({
        where: inArray(classSections.id, allSectionIds),
        orderBy: asc(classSections.title),
      })
    : [];
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  const responses = await db.query.formResponses.findMany({
    where: and(
      inArray(
        formResponses.cycleId,
        instances.map((i) => i.id),
      ),
      inArray(formResponses.lifecycle, ["submitted", "locked"]),
    ),
  });
  const questions = await db.query.formQuestions.findMany({
    where: inArray(
      formQuestions.cycleId,
      instances.map((i) => i.id),
    ),
  });

  return instances
    .slice()
    .sort((a, b) => b.openAt.getTime() - a.openAt.getTime())
    .map((instance) => {
      const audience = audiences.get(instance.id) ?? [];
      const mine = responses.filter((r) => r.cycleId === instance.id);
      return {
        instance,
        label: instanceLabel(instance),
        audienceSections: audience
          .filter((id) => visible.has(id))
          .flatMap((id) => {
            const section = sectionById.get(id);
            return section ? [section] : [];
          }),
        audienceHasHiddenSections: audience.some((id) => !visible.has(id)),
        // Only the actor's own sections are counted.
        responseCount: mine.filter((r) => visible.has(r.sectionId)).length,
        // The lock is global to the instance: one response anywhere freezes it.
        editLocked: mine.length > 0,
        customized: !!instance.customizedAt,
        questionCount: questions.filter((q) => q.cycleId === instance.id).length,
      };
    });
}

/** Every instance generated from any schedule of this form definition. */
async function instancesOfTemplate(
  dbx: DbOrTx,
  templateId: string,
): Promise<FormInstance[]> {
  const versions = await dbx.query.templateVersions.findMany({
    where: eq(templateVersions.templateId, templateId),
  });
  const schedules = await dbx.query.recurrenceSchedules.findMany({
    where: eq(recurrenceSchedules.templateId, templateId),
  });
  const versionIds = versions.map((v) => v.id);
  const scheduleIds = schedules.map((s) => s.id);
  if (versionIds.length === 0 && scheduleIds.length === 0) return [];
  const byVersion = versionIds.length
    ? await dbx.query.formInstances.findMany({
        where: inArray(formInstances.templateVersionId, versionIds),
      })
    : [];
  const bySchedule = scheduleIds.length
    ? await dbx.query.formInstances.findMany({
        where: inArray(formInstances.scheduleId, scheduleIds),
      })
    : [];
  const byId = new Map<string, FormInstance>();
  for (const row of [...byVersion, ...bySchedule]) byId.set(row.id, row);
  return [...byId.values()];
}

export interface InstanceDetail {
  instance: FormInstance;
  label: string;
  template: typeof formTemplates.$inferSelect | null;
  baseVersion: typeof templateVersions.$inferSelect | null;
  questions: InstanceQuestion[];
  /** questions of the source version, for the "what the base form says" column */
  baseQuestions: InstanceQuestion[];
  audienceSections: (typeof classSections.$inferSelect)[];
  audienceHasHiddenSections: boolean;
  topics: (typeof lessonsTopics.$inferSelect)[];
  /** true once someone has submitted: structural edits are refused */
  editLocked: boolean;
  /** true when this occurrence's questions differ from the base version */
  customized: boolean;
  responseCount: number;
  timezone: string;
}

/**
 * Everything the per-occurrence editor needs.
 *
 * Requires `manageWeeklyCycles` on at least one audience section to read; the
 * write path additionally requires it on all of them.
 */
export async function getInstanceDetail(
  actorUserId: string,
  instanceId: string,
): Promise<InstanceDetail> {
  const { instance, sectionIds } = await requireInstanceStaff(
    db,
    actorUserId,
    instanceId,
    "manageWeeklyCycles",
    { allowArchived: true },
  );
  const audience = await getInstanceAudience(db, instanceId);
  const sections = audience.length
    ? await db.query.classSections.findMany({
        where: inArray(classSections.id, audience),
        orderBy: asc(classSections.title),
      })
    : [];
  const questions = await db.query.formQuestions.findMany({
    where: eq(formQuestions.cycleId, instanceId),
    orderBy: asc(formQuestions.displayOrder),
  });
  const baseVersion = instance.templateVersionId
    ? ((await db.query.templateVersions.findFirst({
        where: eq(templateVersions.id, instance.templateVersionId),
      })) ?? null)
    : null;
  const baseQuestions = baseVersion
    ? await db.query.formQuestions.findMany({
        where: eq(formQuestions.templateVersionId, baseVersion.id),
        orderBy: asc(formQuestions.displayOrder),
      })
    : [];
  const template = baseVersion
    ? ((await db.query.formTemplates.findFirst({
        where: eq(formTemplates.id, baseVersion.templateId),
      })) ?? null)
    : null;
  const responses = await db.query.formResponses.findMany({
    where: and(
      eq(formResponses.cycleId, instanceId),
      inArray(formResponses.lifecycle, ["submitted", "locked"]),
    ),
  });
  const topics = await db.query.lessonsTopics.findMany({
    where: eq(lessonsTopics.courseId, instance.courseId),
    orderBy: asc(lessonsTopics.displayOrder),
  });

  return {
    instance,
    label: instanceLabel(instance),
    template,
    baseVersion,
    questions,
    baseQuestions,
    audienceSections: sections.filter((s) => sectionIds.includes(s.id)),
    audienceHasHiddenSections: audience.some((id) => !sectionIds.includes(id)),
    topics,
    editLocked: responses.length > 0,
    customized:
      !!instance.customizedAt ||
      questions.some((q) => q.origin && q.origin !== "inherited"),
    responseCount: responses.filter((r) => sectionIds.includes(r.sectionId))
      .length,
    timezone: sections[0]?.timezone ?? "Asia/Manila",
  };
}

// --- per-occurrence customization ------------------------------------------

/**
 * A question as the instance editor posts it. `stableKey` is carried for a row
 * that already exists so identity survives an edit; a genuinely new question
 * omits it and gets a fresh key.
 */
export const instanceQuestionInputSchema = questionDefinitionSchema
  .innerType()
  .extend({ stableKey: z.string().uuid().optional() })
  .superRefine((q, ctx) => {
    const isChoice = ["multiple_choice", "checkboxes", "dropdown"].includes(
      q.type,
    );
    if (isChoice && (!q.options || q.options.length < 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${q.type} requires at least 2 options`,
      });
    }
    if (q.type === "linear_scale" && !q.scale) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "linear_scale requires scale settings",
      });
    }
  });
export type InstanceQuestionInput = z.infer<typeof instanceQuestionInputSchema>;

/** Structural identity of a question, for the "did this change structurally?" test. */
function structuralShape(q: {
  type: string;
  required: boolean;
  options?: unknown;
  scale?: unknown;
  validation?: unknown;
  displayOrder?: number;
}) {
  const optionIds = Array.isArray(q.options)
    ? (q.options as { stableId?: string }[]).map((o) => o.stableId ?? "")
    : [];
  return JSON.stringify({
    type: q.type,
    required: q.required,
    optionIds,
    scale: q.scale ?? null,
    validation: q.validation ?? null,
    displayOrder: q.displayOrder ?? 0,
  });
}

/** Cosmetic identity: the text a reader sees. */
function cosmeticShape(q: {
  prompt: string;
  description?: string | null;
  options?: unknown;
}) {
  const labels = Array.isArray(q.options)
    ? (q.options as { label?: string }[]).map((o) => o.label ?? "")
    : [];
  return JSON.stringify({
    prompt: q.prompt.trim(),
    description: (q.description ?? "").trim(),
    labels,
  });
}

/**
 * Save this occurrence's own question snapshot.
 *
 * Scope: THIS instance only. The base definition version and every other
 * occurrence are separate rows and are never touched.
 *
 * Locking (D4), enforced here rather than by hiding controls:
 * - before the first response, anything goes;
 * - after the first response, structural change is refused and only cosmetic
 *   text edits are applied — and those are audited;
 * - a closed, skipped, or archived occurrence is refused structural change
 *   regardless of its response count.
 */
export async function customizeInstanceQuestions(
  actorUserId: string,
  instanceId: string,
  rawQuestions: unknown,
) {
  const { instance } = await requireFullAudienceStaff(
    actorUserId,
    instanceId,
    "manageWeeklyCycles",
  );
  const parsed = z.array(instanceQuestionInputSchema).safeParse(rawQuestions);
  if (!parsed.success) {
    throw new InstanceError(
      parsed.error.issues.map((i) => i.message).join(" ") ||
        "Check the questions and try again.",
    );
  }
  const incoming = parsed.data.map((q, index) => ({
    ...q,
    displayOrder: q.displayOrder ?? index,
  }));
  if (incoming.length === 0) {
    throw new InstanceError("A form needs at least one question.");
  }

  const existing = await db.query.formQuestions.findMany({
    where: eq(formQuestions.cycleId, instanceId),
    orderBy: asc(formQuestions.displayOrder),
  });
  const locked = await cycleHasSubmissions(db, instanceId);
  const frozenState =
    instance.state === "closed" ||
    instance.state === "archived" ||
    instance.state === "skipped";

  const byKey = new Map(existing.map((q) => [q.stableKey, q]));
  const incomingKeys = new Set(
    incoming.map((q) => q.stableKey).filter((k): k is string => !!k),
  );

  const structuralChange =
    incoming.length !== existing.length ||
    existing.some((q) => !incomingKeys.has(q.stableKey)) ||
    incoming.some((q) => {
      if (!q.stableKey) return true; // a new question is structural
      const current = byKey.get(q.stableKey);
      if (!current) return true;
      return (
        structuralShape({
          type: q.type,
          required: q.required,
          options: q.options,
          scale: q.scale,
          validation: q.validation,
          displayOrder: q.displayOrder,
        }) !==
        structuralShape({
          type: current.type,
          required: current.required,
          options: current.options,
          scale: current.scale,
          validation: current.validation,
          displayOrder: current.displayOrder,
        })
      );
    });

  if (structuralChange && (locked || frozenState)) {
    throw new InstanceLockedError(
      frozenState && !locked
        ? "This form is no longer open, so its questions cannot be restructured. Reopen it first if that is what you meant."
        : undefined,
    );
  }

  // The base version's stable keys decide what counts as inherited.
  const baseKeys = new Set<string>();
  if (instance.templateVersionId) {
    const base = await db.query.formQuestions.findMany({
      where: eq(formQuestions.templateVersionId, instance.templateVersionId),
    });
    for (const q of base) baseKeys.add(q.stableKey);
  }

  const before = existing.map((q) => ({
    stableKey: q.stableKey,
    prompt: q.prompt,
    type: q.type,
    required: q.required,
    displayOrder: q.displayOrder,
    origin: q.origin,
  }));

  await db.transaction(async (tx) => {
    if (structuralChange) {
      // Rebuild the snapshot. Safe precisely because nobody has answered it:
      // no questionAnswers row can reference a question being replaced.
      await tx.delete(formQuestions).where(eq(formQuestions.cycleId, instanceId));
      for (const [index, q] of incoming.entries()) {
        const carried = q.stableKey ? byKey.get(q.stableKey) : undefined;
        const isInherited = !!q.stableKey && baseKeys.has(q.stableKey);
        const unchangedFromBase =
          isInherited &&
          carried &&
          structuralShape({
            type: q.type,
            required: q.required,
            options: q.options,
            scale: q.scale,
            validation: q.validation,
            displayOrder: q.displayOrder ?? index,
          }) ===
            structuralShape({
              type: carried.type,
              required: carried.required,
              options: carried.options,
              scale: carried.scale,
              validation: carried.validation,
              displayOrder: carried.displayOrder,
            }) &&
          cosmeticShape({
            prompt: q.prompt,
            description: q.description,
            options: q.options,
          }) ===
            cosmeticShape({
              prompt: carried.prompt,
              description: carried.description,
              options: carried.options,
            });
        await tx.insert(formQuestions).values({
          cycleId: instanceId,
          prompt: q.prompt,
          description: q.description,
          type: q.type,
          options: q.options ?? null,
          scale: q.scale ?? null,
          validation: q.validation ?? null,
          required: q.required,
          displayOrder: index,
          category: q.category,
          topicId: q.topicId,
          origin: isInherited
            ? unchangedFromBase
              ? "inherited"
              : "modified"
            : "instance_only",
          ...(q.stableKey ? { stableKey: q.stableKey } : {}),
        });
      }
    } else {
      // Cosmetic-only path: update wording in place, so every existing answer
      // stays attached to the question row it was given for.
      for (const q of incoming) {
        const current = byKey.get(q.stableKey!)!;
        const changed =
          cosmeticShape({
            prompt: q.prompt,
            description: q.description,
            options: q.options,
          }) !==
          cosmeticShape({
            prompt: current.prompt,
            description: current.description,
            options: current.options,
          });
        if (!changed) continue;
        const isInherited =
          !!q.stableKey && baseKeys.has(q.stableKey) ? true : false;
        await tx
          .update(formQuestions)
          .set({
            prompt: q.prompt,
            description: q.description ?? null,
            // Option LABELS may be corrected; their stableIds are unchanged, so
            // an already-stored optionId still resolves.
            options: q.options ?? current.options,
            origin: isInherited ? "modified" : (current.origin ?? "instance_only"),
          })
          .where(eq(formQuestions.id, current.id));
      }
    }

    const now = new Date();
    await tx
      .update(formInstances)
      .set({ customizedAt: now, customizedByUserId: actorUserId, updatedAt: now })
      .where(eq(formInstances.id, instanceId));

    const after = await tx.query.formQuestions.findMany({
      where: eq(formQuestions.cycleId, instanceId),
      orderBy: asc(formQuestions.displayOrder),
    });
    await writeAudit(tx, {
      actorUserId,
      action: structuralChange
        ? "cycle.questions_customized"
        : "cycle.questions_reworded",
      entityType: "weekly_cycle",
      entityId: instanceId,
      before: { questions: before },
      after: {
        questions: after.map((q) => ({
          stableKey: q.stableKey,
          prompt: q.prompt,
          type: q.type,
          required: q.required,
          displayOrder: q.displayOrder,
          origin: q.origin,
        })),
      },
      metadata: { structural: structuralChange, scope: "this_instance_only" },
      courseId: instance.courseId,
    });
  });
}

/**
 * Discard this occurrence's customizations and re-copy the base version.
 *
 * Refused once anyone has answered — replacing the snapshot would orphan their
 * answers, which is the same reason a structural edit is refused.
 */
export async function restoreInstanceToBase(
  actorUserId: string,
  instanceId: string,
) {
  const { instance } = await requireFullAudienceStaff(
    actorUserId,
    instanceId,
    "manageWeeklyCycles",
  );
  if (await cycleHasSubmissions(db, instanceId)) {
    throw new InstanceLockedError(
      "Someone has already answered this form, so it cannot be reset to the base form.",
    );
  }
  if (!instance.templateVersionId) {
    throw new InstanceError(
      "This form has no base version to go back to. Edit its questions instead.",
    );
  }
  const base = await db.query.formQuestions.findMany({
    where: eq(formQuestions.templateVersionId, instance.templateVersionId),
    orderBy: asc(formQuestions.displayOrder),
  });
  const before = await db.query.formQuestions.findMany({
    where: eq(formQuestions.cycleId, instanceId),
  });

  await db.transaction(async (tx) => {
    await tx.delete(formQuestions).where(eq(formQuestions.cycleId, instanceId));
    if (base.length > 0) {
      await tx.insert(formQuestions).values(
        base.map((q, index) => ({
          cycleId: instanceId,
          prompt: q.prompt,
          description: q.description,
          type: q.type,
          options: q.options,
          scale: q.scale,
          validation: q.validation,
          required: q.required,
          displayOrder: index,
          category: q.category,
          topicId: q.topicId,
          origin: "inherited" as const,
          stableKey: q.stableKey,
        })),
      );
    }
    const now = new Date();
    await tx
      .update(formInstances)
      .set({ customizedAt: null, customizedByUserId: null, updatedAt: now })
      .where(eq(formInstances.id, instanceId));
    await writeAudit(tx, {
      actorUserId,
      action: "cycle.questions_restored",
      entityType: "weekly_cycle",
      entityId: instanceId,
      before: { questions: before.map((q) => q.prompt) },
      after: { questions: base.map((q) => q.prompt) },
      courseId: instance.courseId,
    });
  });
}

const focusInputSchema = z.object({
  title: z.string().trim().max(200).optional(),
  focusLabel: z.string().trim().max(200).optional(),
  topicId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
});

/**
 * The occurrence's own title / focus / topic.
 *
 * Presentation only — it changes no question and invalidates no answer — so it
 * stays editable after the first response, and is audited like every other staff
 * change.
 */
export async function setInstanceFocus(
  actorUserId: string,
  instanceId: string,
  rawInput: unknown,
) {
  const { instance } = await requireFullAudienceStaff(
    actorUserId,
    instanceId,
    "manageWeeklyCycles",
  );
  const input = focusInputSchema.parse(rawInput);
  if (input.topicId) {
    const topic = await db.query.lessonsTopics.findFirst({
      where: eq(lessonsTopics.id, input.topicId),
    });
    if (!topic || topic.courseId !== instance.courseId) {
      throw new InstanceError("Choose a topic that belongs to this course.");
    }
  }
  await db.transaction(async (tx) => {
    await tx
      .update(formInstances)
      .set({
        title: input.title || null,
        focusLabel: input.focusLabel || null,
        topicId: input.topicId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(formInstances.id, instanceId));
    await writeAudit(tx, {
      actorUserId,
      action: "cycle.focus_changed",
      entityType: "weekly_cycle",
      entityId: instanceId,
      before: {
        title: instance.title,
        focusLabel: instance.focusLabel,
        topicId: instance.topicId,
      },
      after: {
        title: input.title || null,
        focusLabel: input.focusLabel || null,
        topicId: input.topicId ?? null,
      },
      courseId: instance.courseId,
    });
  });
}

// --- manual and one-off instances ------------------------------------------

const manualInstanceSchema = z.object({
  templateId: z.string().uuid(),
  audienceMode: z.enum(["all_sections", "selected_sections"]),
  sectionIds: z.array(z.string().uuid()).default([]),
  title: z.string().trim().max(200).optional(),
  openDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
  openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().or(z.literal("").transform(() => undefined)),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deadlineTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
});

/**
 * Create one instance staff will open by hand.
 *
 * Created `draft`: the scheduler never opens a `manual` instance, so nothing
 * reaches a student until a person presses the button. The window still exists —
 * a deadline is a hard deadline whichever way the form was opened.
 */
export async function createManualInstance(
  actorUserId: string,
  courseId: string,
  rawInput: unknown,
  now: Date = new Date(),
) {
  await requireCourseStaff(db, actorUserId, courseId);
  const input = manualInstanceSchema.parse(rawInput);
  const template = await db.query.formTemplates.findFirst({
    where: eq(formTemplates.id, input.templateId),
  });
  if (!template || template.courseId !== courseId) {
    throw new InstanceError("Choose a form that belongs to this course.");
  }

  const audienceInput: AudienceInput =
    input.audienceMode === "all_sections"
      ? { mode: "all_sections" }
      : { mode: "selected_sections", sectionIds: input.sectionIds };
  const sectionIds = await resolveAudienceSections(db, courseId, audienceInput);
  for (const sectionId of sectionIds) {
    await requireSectionStaff(db, actorUserId, sectionId, "manageWeeklyCycles");
  }
  const sections = await db.query.classSections.findMany({
    where: inArray(classSections.id, sectionIds),
  });
  const timezones = [...new Set(sections.map((s) => s.timezone))];
  if (timezones.length > 1) {
    throw new InstanceError(
      "These sections are in different timezones, so they cannot share one form window.",
    );
  }
  const timezone = timezones[0]!;

  const openAt = input.openDate
    ? toInstant(input.openDate, input.openTime ?? "00:00", timezone)
    : now;
  const deadlineAt = toInstant(
    input.deadlineDate,
    input.deadlineTime,
    timezone,
  );
  if (openAt.getTime() >= deadlineAt.getTime()) {
    throw new InstanceError("The deadline must be after the open time.");
  }

  const snapshot = await getLatestTemplateVersion(db, input.templateId);

  return db.transaction(async (tx) => {
    const existing = await tx.query.formInstances.findMany({
      where: eq(formInstances.courseId, courseId),
      columns: { id: true, cycleIndex: true, templateVersionId: true },
    });
    const [instance] = await tx
      .insert(formInstances)
      .values({
        courseId,
        sectionId: null,
        scheduleId: null,
        deliveryMode: "manual",
        // Manual instances have no schedule, so the sequence is only a stable
        // ordinal; the UI never renders it as "Week N" for this mode.
        cycleIndex: existing.length + 1,
        openAt,
        deadlineAt,
        templateVersionId: snapshot?.version.id ?? null,
        title: input.title || null,
        state: "draft",
      })
      .returning();
    await setInstanceAudience(tx, instance!.id, sectionIds);
    if (snapshot && snapshot.questions.length > 0) {
      await tx.insert(formQuestions).values(
        snapshot.questions.map((q) => ({
          cycleId: instance!.id,
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
    await writeAudit(tx, {
      actorUserId,
      action: "cycle.generated",
      entityType: "weekly_cycle",
      entityId: instance!.id,
      after: {
        courseId,
        sectionIds,
        deliveryMode: "manual",
        openAt: openAt.toISOString(),
        deadlineAt: deadlineAt.toISOString(),
        templateVersionId: snapshot?.version.id ?? null,
      },
      courseId,
      metadata: { manual: true },
    });
    return instance!;
  });
}

function toInstant(date: string, time: string, timezone: string): Date {
  const d = parseDate(date);
  const t = parseTime(time.length === 5 ? `${time}:00` : time);
  return zonedTimeToUtc(d.y, d.mo, d.d, t.h, t.m, t.s, timezone);
}

/** Staff opens a draft/scheduled instance now. Audited. */
export async function openInstanceNow(
  actorUserId: string,
  instanceId: string,
  now: Date = new Date(),
) {
  const { instance } = await requireFullAudienceStaff(
    actorUserId,
    instanceId,
    "manageWeeklyCycles",
  );
  if (instance.state !== "draft" && instance.state !== "scheduled") {
    throw new InstanceError(`This form is already ${instance.state}.`);
  }
  if (instance.deadlineAt.getTime() <= now.getTime()) {
    throw new InstanceError(
      "This form's deadline has already passed. Move the deadline before opening it.",
    );
  }
  const { enqueueCycleOpened } = await import("@/modules/email/outbox");
  await db.transaction(async (tx) => {
    const result = await tx
      .update(formInstances)
      .set({
        state: "open",
        // Opening by hand IS the open moment; leaving a future openAt would let
        // the submission guard refuse the very form staff just opened.
        openAt: instance.openAt.getTime() > now.getTime() ? now : instance.openAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(formInstances.id, instanceId),
          inArray(formInstances.state, ["draft", "scheduled"]),
        ),
      )
      .returning();
    if (result.length === 0) return;
    await writeAudit(tx, {
      actorUserId,
      action: "cycle.opened",
      entityType: "weekly_cycle",
      entityId: instanceId,
      before: { state: instance.state },
      after: { state: "open" },
      metadata: { manual: true },
      courseId: instance.courseId,
    });
    await enqueueCycleOpened(tx, instanceId, now);
  });
}

/** Staff closes an open instance early. Locks its responses, like the deadline. */
export async function closeInstanceNow(
  actorUserId: string,
  instanceId: string,
  now: Date = new Date(),
) {
  const { instance } = await requireFullAudienceStaff(
    actorUserId,
    instanceId,
    "manageWeeklyCycles",
  );
  if (instance.state !== "open") {
    throw new InstanceError(`This form is not open (it is ${instance.state}).`);
  }
  const { lockResponsesForCycle } = await import("./response-lock");
  await db.transaction(async (tx) => {
    await tx
      .select({ id: formInstances.id })
      .from(formInstances)
      .where(eq(formInstances.id, instanceId))
      .for("update")
      .limit(1);
    const result = await tx
      .update(formInstances)
      .set({
        state: "closed",
        // The deadline is what the student was told; closing early moves it, and
        // the audit row records that it moved.
        deadlineAt:
          instance.deadlineAt.getTime() > now.getTime() ? now : instance.deadlineAt,
        updatedAt: now,
      })
      .where(and(eq(formInstances.id, instanceId), eq(formInstances.state, "open")))
      .returning();
    if (result.length === 0) return;
    await writeAudit(tx, {
      actorUserId,
      action: "cycle.closed",
      entityType: "weekly_cycle",
      entityId: instanceId,
      before: {
        state: "open",
        deadlineAt: instance.deadlineAt.toISOString(),
      },
      after: { state: "closed", deadlineAt: result[0]!.deadlineAt.toISOString() },
      metadata: { manual: true },
      courseId: instance.courseId,
    });
    await lockResponsesForCycle(
      tx,
      instanceId,
      now,
      instance.sectionId ?? undefined,
    );
  });
}

// --- preview ---------------------------------------------------------------

export interface InstancePreview {
  label: string;
  formTitle: string;
  focusLabel: string | null;
  topicTitle: string | null;
  openAt: Date;
  deadlineAt: Date;
  timezone: string;
  questions: InstanceQuestion[];
  config: {
    maxStudentQuestions: number;
    studentQuestionPrompt: string | null;
    generalCommentEnabled: boolean;
    generalCommentPrompt: string | null;
    generalCommentRequired: boolean;
  };
}

/**
 * The exact student-facing projection of an instance, for "Preview as student".
 *
 * Reads only. It creates no response, saves nothing, and submits nothing — the
 * preview is a projection of persisted state, so what a teacher sees is what a
 * student will get rather than a re-implementation of it.
 */
export async function previewInstance(
  actorUserId: string,
  instanceId: string,
): Promise<InstancePreview> {
  const detail = await getInstanceDetail(actorUserId, instanceId);
  const { getStudentSectionConfig } = await import("./submission");
  const config = await getStudentSectionConfig(db, instanceId);
  const topic = detail.instance.topicId
    ? await db.query.lessonsTopics.findFirst({
        where: eq(lessonsTopics.id, detail.instance.topicId),
      })
    : null;
  return {
    label: detail.label,
    formTitle:
      detail.instance.title ??
      detail.baseVersion?.title ??
      detail.template?.title ??
      "Form",
    focusLabel: detail.instance.focusLabel,
    topicTitle: topic?.title ?? null,
    openAt: detail.instance.openAt,
    deadlineAt: detail.instance.deadlineAt,
    timezone: detail.timezone,
    questions: detail.questions,
    config,
  };
}

/** Guard used by the routes: staff standing on an instance, or a designed 403. */
export async function canManageInstance(
  actorUserId: string,
  instanceId: string,
): Promise<boolean> {
  try {
    await requireInstanceStaff(db, actorUserId, instanceId, "manageWeeklyCycles", {
      allowArchived: true,
    });
    return true;
  } catch (err) {
    if (err instanceof AuthzError) return false;
    throw err;
  }
}
