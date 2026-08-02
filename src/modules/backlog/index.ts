import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  backlogQuestions,
  classSections,
  importBatches,
  publicAnswers,
  sectionBacklogVisibility,
  sourceLinks,
  studentSubmissionItems,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import {
  requireCourseStaffOrSectionGrant,
  requireSectionStaff,
} from "@/modules/authz";
import { getItemWithSection } from "@/modules/review";

/**
 * Course-level question backlog + legacy import
 * (question-backlog.md, legacy-question-import.md).
 * - the backlog belongs to the COURSE; exposure to a section is explicit
 * - legacy imports are ANONYMOUS BY DEFAULT; identity preserved only on
 *   explicit choice
 * - backlog/legacy items never count toward participation (they never create
 *   FormResponses at all)
 */

/**
 * Course backlog for the triage board. Staff-only: the backlog carries
 * question text that has not been vetted for publication, and provenance that
 * students must never see. Course staff qualify, and so does a section
 * assistant holding `manage_backlog_imports` on any section of the course —
 * that flag would otherwise be unusable.
 */
export async function listBacklogForCourse(
  actorUserId: string,
  courseId: string,
  opts: { state?: string; search?: string } = {},
) {
  await requireCourseStaffOrSectionGrant(
    db,
    actorUserId,
    courseId,
    "manageBacklogImports",
  );
  const rows = await db.query.backlogQuestions.findMany({
    where: eq(backlogQuestions.courseId, courseId),
    orderBy: desc(backlogQuestions.updatedAt),
    limit: 300,
  });
  const term = opts.search?.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (!opts.state || row.state === opts.state) &&
      (!term || row.text.toLowerCase().includes(term)),
  );
  const visibility = rows.length
    ? await db.query.sectionBacklogVisibility.findMany({
        where: inArray(
          sectionBacklogVisibility.backlogQuestionId,
          rows.map((r) => r.id),
        ),
      })
    : [];
  const visibleSections = new Map<string, string[]>();
  for (const row of visibility) {
    const list = visibleSections.get(row.backlogQuestionId) ?? [];
    list.push(row.sectionId);
    visibleSections.set(row.backlogQuestionId, list);
  }
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.state] = (counts[row.state] ?? 0) + 1;

  return {
    questions: filtered.map((question) => ({
      question,
      visibleSectionIds: visibleSections.get(question.id) ?? [],
    })),
    counts,
    total: rows.length,
  };
}

/**
 * Copy or move a current student submission item into the course backlog.
 * `preserveSource=true` keeps the internal link to the original item (used
 * for the asker's "answered" view if later published); default is NOT to.
 * Moving does not touch the FormResponse — participation credit stands.
 */
export async function copyOrMoveToBacklog(
  actorUserId: string,
  itemId: string,
  courseId: string,
  opts: { move?: boolean; preserveSource?: boolean } = {},
) {
  const { item, sectionId } = await getItemWithSection(itemId);
  await requireSectionStaff(db, actorUserId, sectionId, "manageBacklogImports");
  const section = await db.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });
  if (section?.courseId !== courseId) {
    throw new Error("Backlog course must match the section's course");
  }

  return db.transaction(async (tx) => {
    const [question] = await tx
      .insert(backlogQuestions)
      .values({
        courseId,
        text: item.originalText,
        category: item.category,
        topicId: item.topicId,
        state: "needs_review",
        provenance: opts.move ? "current_moved" : "current_copied",
        identityPreserved: opts.preserveSource ?? false,
        sourceItemId: opts.preserveSource ? item.id : null,
        createdByUserId: actorUserId,
      })
      .returning();
    if (opts.move) {
      await tx
        .update(studentSubmissionItems)
        .set({ reviewState: "moved_to_backlog", updatedAt: new Date() })
        .where(eq(studentSubmissionItems.id, itemId));
    }
    await writeAudit(tx, {
      actorUserId,
      action: opts.move
        ? "backlog.moved_from_submission"
        : "backlog.copied_from_submission",
      entityType: "backlog_question",
      entityId: question!.id,
      after: {
        itemId,
        preserveSource: opts.preserveSource ?? false,
      },
    });
    return question!;
  });
}

export interface LegacyEntry {
  text: string;
  category?: "content" | "logistics" | "misc";
  previouslyAnswered?: boolean;
  priorAnswerText?: string;
}

/**
 * Manual/CSV/copy-paste legacy import (MVP is human-in-the-loop; no automated
 * Typst/spreadsheet parsing). Everything imports ANONYMOUS: identityPreserved
 * is false and there is no source link — preserving identity for legacy data
 * is a separate, explicit act not supported by this bulk path.
 * Entry-level errors are surfaced per item; good rows still import.
 */
export async function importLegacyEntries(
  actorUserId: string,
  courseId: string,
  entries: LegacyEntry[],
  sourceDescription: string,
) {
  await requireCourseStaffOrSectionGrant(
    db,
    actorUserId,
    courseId,
    "manageBacklogImports",
  );

  const errors: { index: number; message: string }[] = [];
  const valid: LegacyEntry[] = [];
  entries.forEach((entry, index) => {
    if (!entry.text?.trim()) {
      errors.push({ index, message: "Question text is required" });
      return;
    }
    if (entry.previouslyAnswered && !entry.priorAnswerText?.trim()) {
      errors.push({
        index,
        message: "Marked previously answered but no prior answer text given",
      });
      return;
    }
    valid.push(entry);
  });

  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(importBatches)
      .values({
        kind: "legacy",
        sourceDescription,
        courseId,
        importerUserId: actorUserId,
        summary: { imported: valid.length, errored: errors.length, errors },
      })
      .returning();
    const created = [];
    for (const entry of valid) {
      const [question] = await tx
        .insert(backlogQuestions)
        .values({
          courseId,
          text: entry.text.trim(),
          category: entry.category,
          state: "imported",
          provenance: "legacy_import",
          identityPreserved: false, // anonymous-by-default (Risk R7)
          previouslyAnswered: entry.previouslyAnswered ?? false,
          priorAnswerText: entry.priorAnswerText,
          importBatchId: batch!.id,
          createdByUserId: actorUserId,
        })
        .returning();
      created.push(question!);
    }
    await writeAudit(tx, {
      actorUserId,
      action: "legacy.imported",
      entityType: "import_batch",
      entityId: batch!.id,
      after: { imported: valid.length, errored: errors.length },
    });
    return { importBatchId: batch!.id, created, errors };
  });
}

const BACKLOG_TRANSITIONS: Record<string, string[]> = {
  imported: ["needs_review", "archived"],
  needs_review: ["answerable", "not_suitable", "archived"],
  answerable: ["drafting", "archived"],
  drafting: ["scheduled", "published", "answerable", "archived"],
  scheduled: ["published", "drafting", "archived"],
  published: ["archived"],
  not_suitable: ["needs_review", "archived"],
  archived: [],
};

export async function setBacklogState(
  actorUserId: string,
  backlogQuestionId: string,
  state:
    | "needs_review"
    | "answerable"
    | "drafting"
    | "scheduled"
    | "published"
    | "archived"
    | "not_suitable",
) {
  const question = await db.query.backlogQuestions.findFirst({
    where: eq(backlogQuestions.id, backlogQuestionId),
  });
  if (!question) throw new Error("Backlog question not found");
  await requireCourseStaffOrSectionGrant(
    db,
    actorUserId,
    question.courseId,
    "manageBacklogImports",
  );
  if (!BACKLOG_TRANSITIONS[question.state]?.includes(state)) {
    throw new Error(`Invalid backlog transition ${question.state} → ${state}`);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(backlogQuestions)
      .set({ state, updatedAt: new Date() })
      .where(eq(backlogQuestions.id, backlogQuestionId));
    await writeAudit(tx, {
      actorUserId,
      action: "backlog.state_changed",
      entityType: "backlog_question",
      entityId: backlogQuestionId,
      before: { state: question.state },
      after: { state },
    });
  });
}

/**
 * Explicit per-section exposure. Nothing from the backlog ever reaches a
 * section's archive automatically.
 */
export async function makeVisibleToSection(
  actorUserId: string,
  backlogQuestionId: string,
  sectionId: string,
) {
  const question = await db.query.backlogQuestions.findFirst({
    where: eq(backlogQuestions.id, backlogQuestionId),
  });
  if (!question) throw new Error("Backlog question not found");
  await requireSectionStaff(db, actorUserId, sectionId, "manageBacklogImports");
  const section = await db.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });
  if (section?.courseId !== question.courseId) {
    throw new Error("Section does not belong to this backlog's course");
  }

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(sectionBacklogVisibility)
      .values({
        backlogQuestionId,
        sectionId,
        madeVisibleByUserId: actorUserId,
      })
      .onConflictDoNothing()
      .returning();
    if (row) {
      await writeAudit(tx, {
        actorUserId,
        action: "backlog.made_visible_to_section",
        entityType: "backlog_question",
        entityId: backlogQuestionId,
        after: { sectionId },
      });
    }
  });
}

/**
 * Draft a section PublicAnswer from a backlog question. Requires explicit
 * visibility (created here if missing). The answer links back to the backlog
 * question via SourceLink; a deliberately-anonymous legacy question publishes
 * with that backlog link only — never a student identity. Publishing then
 * uses the normal publishNow/schedulePublication path.
 */
export async function draftFromBacklog(
  actorUserId: string,
  backlogQuestionId: string,
  sectionId: string,
  input: { publicQuestionText?: string; answerBody?: string },
) {
  const question = await db.query.backlogQuestions.findFirst({
    where: eq(backlogQuestions.id, backlogQuestionId),
  });
  if (!question) throw new Error("Backlog question not found");
  await requireSectionStaff(db, actorUserId, sectionId, "draftPublicAnswers");
  if (!["answerable", "drafting"].includes(question.state)) {
    throw new Error(
      `Backlog question must be answerable/drafting to draft (is ${question.state})`,
    );
  }

  await makeVisibleToSection(actorUserId, backlogQuestionId, sectionId);

  return db.transaction(async (tx) => {
    const [answer] = await tx
      .insert(publicAnswers)
      .values({
        sectionId,
        publicQuestionText: input.publicQuestionText ?? question.text,
        answerBody:
          input.answerBody ??
          (question.previouslyAnswered ? question.priorAnswerText : null),
        state: "draft",
        category: question.category,
        topicId: question.topicId,
        sourceOrigin: question.provenance === "legacy_import" ? "legacy" : "current",
        createdByUserId: actorUserId,
      })
      .returning();
    const [link] = await tx
      .insert(sourceLinks)
      .values({
        publicAnswerId: answer!.id,
        backlogQuestionId,
        createdByUserId: actorUserId,
      })
      .returning();
    await tx
      .update(backlogQuestions)
      .set({ state: "drafting", updatedAt: new Date() })
      .where(
        and(
          eq(backlogQuestions.id, backlogQuestionId),
          eq(backlogQuestions.state, "answerable"),
        ),
      );
    await writeAudit(tx, {
      actorUserId,
      action: "public_answer.drafted",
      entityType: "public_answer",
      entityId: answer!.id,
      after: { fromBacklog: backlogQuestionId, sectionId },
    });
    await writeAudit(tx, {
      actorUserId,
      action: "source_link.created",
      entityType: "source_link",
      entityId: link!.id,
      after: { publicAnswerId: answer!.id, backlogQuestionId },
    });
    return answer!;
  });
}
