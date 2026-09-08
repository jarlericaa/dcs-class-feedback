import { and, asc, desc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { formQuestions, formTemplates, templateVersions } from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { requireCourseStaff, requireSectionStaff } from "@/modules/authz";
import { questionDefinitionSchema, type QuestionDefinition } from "./questions";

/**
 * Form definitions ("templates" is the historical table name).
 *
 * Definitions snapshot on apply (weekly-form-workflow.md §6):
 * - every save creates a NEW immutable TemplateVersion with its own question rows
 * - already-generated instances keep their snapshot; no version is ever mutated
 * - stableKey carries question identity across versions/snapshots for exports
 *
 * A definition owns the course, title, description, optional purpose label,
 * ownership, and archived state. It does NOT own a delivery pattern: weekly is
 * one of four delivery modes and lives on the schedule
 * (docs/domain/forms-and-audiences.md §2.1).
 */

async function insertVersionQuestions(
  dbx: DbOrTx,
  templateVersionId: string,
  questions: QuestionDefinition[],
  stableKeys?: Map<number, string>,
) {
  if (questions.length === 0) return;
  await dbx.insert(formQuestions).values(
    questions.map((q, i) => ({
      templateVersionId,
      prompt: q.prompt,
      description: q.description,
      type: q.type,
      options: q.options ?? null,
      scale: q.scale ?? null,
      validation: q.validation ?? null,
      required: q.required,
      displayOrder: q.displayOrder ?? i,
      category: q.category,
      topicId: q.topicId,
      ...(stableKeys?.has(i) ? { stableKey: stableKeys.get(i)! } : {}),
    })),
  );
}

/**
 * Per-version configuration for the student-originated part of the form
 * (project-specs.md §5.2). Snapshotted onto the version, so changing it later
 * cannot alter a cycle that already collected answers.
 */
export interface StudentSectionConfig {
  /** 0–10 repeatable "Ask a Question" entries. 0 disables the block. */
  maxStudentQuestions?: number;
  studentQuestionPrompt?: string | null;
  generalCommentEnabled?: boolean;
  generalCommentPrompt?: string | null;
  generalCommentRequired?: boolean;
}

export const DEFAULT_STUDENT_SECTION: Required<
  Pick<
    StudentSectionConfig,
    "maxStudentQuestions" | "generalCommentEnabled" | "generalCommentRequired"
  >
> = {
  maxStudentQuestions: 1,
  generalCommentEnabled: true,
  generalCommentRequired: false,
};

function normalizeStudentSection(input: StudentSectionConfig | undefined) {
  return {
    maxStudentQuestions: Math.max(
      0,
      Math.min(10, input?.maxStudentQuestions ?? DEFAULT_STUDENT_SECTION.maxStudentQuestions),
    ),
    studentQuestionPrompt: input?.studentQuestionPrompt?.trim() || null,
    generalCommentEnabled:
      input?.generalCommentEnabled ?? DEFAULT_STUDENT_SECTION.generalCommentEnabled,
    generalCommentPrompt: input?.generalCommentPrompt?.trim() || null,
    generalCommentRequired:
      input?.generalCommentRequired ?? DEFAULT_STUDENT_SECTION.generalCommentRequired,
  };
}

export async function createTemplate(
  actorUserId: string,
  input: {
    courseId: string;
    title: string;
    description?: string;
    /** Optional organizing label. Free text on purpose — see the schema comment. */
    purpose?: string;
    visibility?: "private" | "course_shared";
    questions: QuestionDefinition[];
    studentSection?: StudentSectionConfig;
  },
) {
  await requireCourseStaff(db, actorUserId, input.courseId);
  const questions = input.questions.map((q) =>
    questionDefinitionSchema.parse(q),
  );

  return db.transaction(async (tx) => {
    const [template] = await tx
      .insert(formTemplates)
      .values({
        courseId: input.courseId,
        ownerUserId: actorUserId,
        title: input.title,
        description: input.description,
        purpose: input.purpose?.trim() || null,
        visibility: input.visibility ?? "private",
      })
      .returning();
    const [version] = await tx
      .insert(templateVersions)
      .values({
        templateId: template!.id,
        versionNumber: 1,
        createdByUserId: actorUserId,
        title: input.title,
        description: input.description ?? null,
        ...normalizeStudentSection(input.studentSection),
      })
      .returning();
    await insertVersionQuestions(tx, version!.id, questions);
    await writeAudit(tx, {
      actorUserId,
      action: "template.created",
      entityType: "form_template",
      entityId: template!.id,
      after: {
        title: input.title,
        purpose: input.purpose?.trim() || null,
        questionCount: questions.length,
      },
      courseId: input.courseId,
    });
    return { template: template!, version: version! };
  });
}

/**
 * "Editing" a template = creating the next TemplateVersion. Prior versions
 * and cycles generated from them are untouched.
 * `keepStableKeyFrom` maps new-question index → previous question id whose
 * stableKey should carry over (same conceptual question, edited wording).
 */
export async function createTemplateVersion(
  actorUserId: string,
  templateId: string,
  questions: QuestionDefinition[],
  keepStableKeyFrom?: Record<number, string>,
  studentSection?: StudentSectionConfig,
) {
  const template = await db.query.formTemplates.findFirst({
    where: eq(formTemplates.id, templateId),
  });
  if (!template) throw new Error("Template not found");
  await requireCourseStaff(db, actorUserId, template.courseId);
  const parsed = questions.map((q) => questionDefinitionSchema.parse(q));

  return db.transaction(async (tx) => {
    const latest = await tx.query.templateVersions.findFirst({
      where: eq(templateVersions.templateId, templateId),
      orderBy: desc(templateVersions.versionNumber),
    });
    const nextNumber = (latest?.versionNumber ?? 0) + 1;

    const stableKeys = new Map<number, string>();
    if (keepStableKeyFrom) {
      for (const [idxStr, prevQuestionId] of Object.entries(keepStableKeyFrom)) {
        const prev = await tx.query.formQuestions.findFirst({
          where: eq(formQuestions.id, prevQuestionId),
        });
        if (prev) stableKeys.set(Number(idxStr), prev.stableKey);
      }
    }

    const [version] = await tx
      .insert(templateVersions)
      .values({
        templateId,
        versionNumber: nextNumber,
        createdByUserId: actorUserId,
        title: template.title,
        description: template.description,
        // Carry the previous version's configuration forward unless this save
        // changes it, so editing questions never silently resets the student
        // section.
        ...normalizeStudentSection(
          studentSection ??
            (latest
              ? {
                  maxStudentQuestions: latest.maxStudentQuestions,
                  studentQuestionPrompt: latest.studentQuestionPrompt,
                  generalCommentEnabled: latest.generalCommentEnabled,
                  generalCommentPrompt: latest.generalCommentPrompt,
                  generalCommentRequired: latest.generalCommentRequired,
                }
              : undefined),
        ),
      })
      .returning();
    await insertVersionQuestions(tx, version!.id, parsed, stableKeys);
    await writeAudit(tx, {
      actorUserId,
      action: "template.version_created",
      entityType: "template_version",
      entityId: version!.id,
      after: { templateId, versionNumber: nextNumber },
    });
    return version!;
  });
}

/**
 * Rename a form, or change its description, purpose label, or archived state.
 *
 * These are properties of the DEFINITION, not of any occurrence: changing them
 * touches no snapshot, so no already-collected answer is affected. Every
 * occurrence keeps the title it was generated with, because that title is
 * snapshotted onto its version.
 */
export async function updateTemplateDetails(
  actorUserId: string,
  templateId: string,
  input: {
    title?: string;
    description?: string | null;
    purpose?: string | null;
    archived?: boolean;
  },
) {
  const template = await db.query.formTemplates.findFirst({
    where: eq(formTemplates.id, templateId),
  });
  if (!template) throw new Error("Form not found");
  await requireCourseStaff(db, actorUserId, template.courseId);
  const title = input.title?.trim();
  if (input.title !== undefined && !title) {
    throw new Error("A form needs a name.");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(formTemplates)
      .set({
        ...(title ? { title } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.purpose !== undefined
          ? { purpose: input.purpose?.trim() || null }
          : {}),
        ...(input.archived !== undefined ? { archived: input.archived } : {}),
      })
      .where(eq(formTemplates.id, templateId));
    await writeAudit(tx, {
      actorUserId,
      action: "template.created",
      entityType: "form_template",
      entityId: templateId,
      before: {
        title: template.title,
        description: template.description,
        purpose: template.purpose,
        archived: template.archived,
      },
      after: input,
      courseId: template.courseId,
      metadata: { detailsUpdated: true },
    });
  });
}

/**
 * Definitions of a course with their latest version and question count, for the
 * form list and the delivery picker. Course-staff only.
 */
export async function listTemplatesForCourse(
  actorUserId: string,
  courseId: string,
) {
  await requireCourseStaff(db, actorUserId, courseId, { allowArchived: true });
  const templates = await db.query.formTemplates.findMany({
    where: eq(formTemplates.courseId, courseId),
    orderBy: asc(formTemplates.title),
  });
  const detailed = [];
  for (const template of templates) {
    const latest = await getLatestTemplateVersion(db, template.id);
    detailed.push({
      template,
      latestVersion: latest?.version ?? null,
      questionCount: latest?.questions.length ?? 0,
    });
  }
  return detailed;
}

/**
 * Templates usable by a section's schedule picker. Section staff with
 * `manage_weekly_cycles` need to choose a template even when they are not
 * course staff, so this authorizes on the SECTION and then reads only the
 * templates of that section's own course.
 */
export async function listTemplatesForSection(
  actorUserId: string,
  sectionId: string,
  courseId: string,
) {
  await requireSectionStaff(db, actorUserId, sectionId, "manageWeeklyCycles", { allowArchived: true });
  const templates = await db.query.formTemplates.findMany({
    where: and(
      eq(formTemplates.courseId, courseId),
      eq(formTemplates.archived, false),
    ),
    orderBy: asc(formTemplates.title),
  });
  const detailed = [];
  for (const template of templates) {
    const latest = await getLatestTemplateVersion(db, template.id);
    detailed.push({
      template,
      latestVersion: latest?.version ?? null,
      questionCount: latest?.questions.length ?? 0,
    });
  }
  return detailed;
}

/** One template with every version and the latest version's questions. */
export async function getTemplateDetail(
  actorUserId: string,
  templateId: string,
) {
  const template = await db.query.formTemplates.findFirst({
    where: eq(formTemplates.id, templateId),
  });
  if (!template) throw new Error("Template not found");
  await requireCourseStaff(db, actorUserId, template.courseId, { allowArchived: true });
  const versions = await db.query.templateVersions.findMany({
    where: eq(templateVersions.templateId, templateId),
    orderBy: desc(templateVersions.versionNumber),
  });
  const latest = await getLatestTemplateVersion(db, templateId);
  return {
    template,
    versions,
    questions: (latest?.questions ?? []).sort(
      (a, b) => a.displayOrder - b.displayOrder,
    ),
  };
}

export async function getLatestTemplateVersion(
  dbx: DbOrTx,
  templateId: string,
) {
  const version = await dbx.query.templateVersions.findFirst({
    where: eq(templateVersions.templateId, templateId),
    orderBy: desc(templateVersions.versionNumber),
  });
  if (!version) return null;
  const questions = await dbx.query.formQuestions.findMany({
    where: and(eq(formQuestions.templateVersionId, version.id)),
  });
  return { version, questions };
}
