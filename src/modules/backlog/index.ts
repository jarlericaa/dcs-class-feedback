import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  backlogQuestions,
  classSections,
  importBatches,
  publicAnswers,
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
 * (docs/domain/question-backlog.md, docs/domain/legacy-question-import.md).
 * - the backlog belongs to the COURSE, and so does what it publishes into:
 *   one backlog item becomes ONE course PublicAnswer (ADR-0005). There is no
 *   per-section exposure step and no section to choose;
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
    { allowArchived: true },
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
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.state] = (counts[row.state] ?? 0) + 1;

  /**
   * No per-question section list any more. Under the old model a backlog item
   * carried the set of sections it had been exposed to, because publishing meant
   * choosing them; publishing now produces one course-wide answer, so there is
   * nothing per-section left to report.
   */
  return {
    questions: filtered.map((question) => ({ question })),
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
      // The backlog belongs to the course, and a backlog_question id is
      // reachable from no section — the scope has to be recorded here.
      courseId,
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
      // A legacy batch carries a course and no section, so unlike a roster
      // batch it is not reachable from the section fan-out.
      courseId,
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
      courseId: question.courseId,
    });
  });
}

/**
 * Draft the course's PublicAnswer from a backlog question (ADR-0005).
 *
 * One backlog item, one course entry — no target section is asked for and none
 * is recorded. The answer links back to the backlog question via SourceLink, so
 * a deliberately-anonymous legacy question publishes with that backlog link
 * only and never a student identity. Publishing then uses the normal
 * publishNow/schedulePublication path.
 */
export async function draftFromBacklog(
  actorUserId: string,
  backlogQuestionId: string,
  input: { publicQuestionText?: string; answerBody?: string } = {},
) {
  const question = await db.query.backlogQuestions.findFirst({
    where: eq(backlogQuestions.id, backlogQuestionId),
  });
  if (!question) throw new Error("Backlog question not found");
  await requireCourseStaffOrSectionGrant(
    db,
    actorUserId,
    question.courseId,
    "draftPublicAnswers",
  );
  if (!["answerable", "drafting"].includes(question.state)) {
    throw new Error(
      `Backlog question must be answerable/drafting to draft (is ${question.state})`,
    );
  }

  return db.transaction(async (tx) => {
    const [answer] = await tx
      .insert(publicAnswers)
      .values({
        courseId: question.courseId,
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
      after: { fromBacklog: backlogQuestionId, courseId: question.courseId },
      courseId: question.courseId,
    });
    await writeAudit(tx, {
      actorUserId,
      action: "source_link.created",
      entityType: "source_link",
      entityId: link!.id,
      after: { publicAnswerId: answer!.id, backlogQuestionId },
      courseId: question.courseId,
    });
    return answer!;
  });
}
