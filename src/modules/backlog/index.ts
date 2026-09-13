import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
  AuthzError,
  requireCourseStaffOrSectionGrant,
  requireSectionStaff,
} from "@/modules/authz";
import { getItemWithSection } from "@/modules/review";
import { listCoursePublicationQueue } from "@/modules/publishing";

type PublicationQueue = Awaited<
  ReturnType<typeof listCoursePublicationQueue>
>;
type PublicationItem = PublicationQueue["items"][number];

/** The small work-oriented vocabulary the Question Backlog presents. */
export type QuestionBacklogStatus =
  | "needs-review"
  | "drafting"
  | "ready"
  | "scheduled"
  | "archived";

export type QuestionBacklogReadItem =
  | {
      key: `question:${string}`;
      kind: "question";
      status: QuestionBacklogStatus;
      question: typeof backlogQuestions.$inferSelect;
      publication: null;
      updatedAt: Date;
    }
  | {
      key: `answer:${string}`;
      kind: "answer";
      status: QuestionBacklogStatus;
      question: null;
      publication: PublicationItem;
      updatedAt: Date;
    };

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
 * The single staff read model for the course's editorial workflow.
 *
 * BacklogQuestion and PublicAnswer stay separate records because provenance,
 * source links, publication and the scheduler each have different invariants.
 * The reader should not have to know that: a question with a draft answer is
 * one row, ordered with manual/imported questions by the same updatedAt value.
 *
 * The two underlying readers retain their own authorization checks. A staff
 * member holding only a backlog flag sees backlog questions; one holding only a
 * publication flag sees answer drafts; course staff see both. A source item's
 * section authorization is still enforced when the answer is drafted, not
 * weakened by this course-level list.
 */
export async function listQuestionBacklog(
  actorUserId: string,
  courseId: string,
) {
  const [backlogResult, publicationResult] = await Promise.all([
    listBacklogForCourse(actorUserId, courseId).catch((error: unknown) => {
      if (error instanceof AuthzError) return null;
      throw error;
    }),
    listCoursePublicationQueue(actorUserId, courseId).catch((error: unknown) => {
      if (error instanceof AuthzError) return null;
      throw error;
    }),
  ]);

  if (!backlogResult && !publicationResult) {
    throw new AuthzError("No access to this course's question backlog");
  }

  const publications = publicationResult?.items ?? [];
  const linkedBacklogIds = new Set(
    publications.flatMap((item) =>
      item.backlogQuestionId ? [item.backlogQuestionId] : [],
    ),
  );

  const questionItems: QuestionBacklogReadItem[] = (backlogResult?.questions ?? [])
    .map(({ question }) => question)
    // Published questions have left editorial work and live in Class Q&A. A
    // legacy not_suitable state is presented as archived, not as a rejection.
    .filter((question) => question.state !== "published")
    .filter(
      (question) =>
        !linkedBacklogIds.has(question.id) ||
        question.state === "archived" ||
        question.state === "not_suitable",
    )
    .map((question) => ({
      key: `question:${question.id}` as const,
      kind: "question" as const,
      status: backlogQuestionStatus(question),
      question,
      publication: null,
      updatedAt: question.updatedAt,
    }));

  const answerItems: QuestionBacklogReadItem[] = publications.map((item) => ({
    key: `answer:${item.answer.id}` as const,
    kind: "answer" as const,
    status: publicationStatus(item),
    question: null,
    publication: item,
    updatedAt: item.answer.updatedAt,
  }));

  const items = [...questionItems, ...answerItems].sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
  );
  const counts: Record<QuestionBacklogStatus | "all", number> = {
    all: items.length,
    "needs-review": 0,
    drafting: 0,
    ready: 0,
    scheduled: 0,
    archived: 0,
  };
  for (const item of items) counts[item.status] += 1;

  return {
    items,
    counts,
    total: items.length,
    failed: publicationResult?.failed ?? [],
  };
}

/** The persisted answer states projected into the five backlog work states. */
function publicationStatus(item: PublicationItem): QuestionBacklogStatus {
  if (
    item.latestApproval?.decision === "rejected" &&
    item.answer.state === "draft"
  ) {
    return "needs-review";
  }
  if (item.answer.state === "scheduled") return "scheduled";
  if (item.answer.state === "awaiting_approval") return "needs-review";
  return item.answer.answerBody?.trim() ? "ready" : "drafting";
}

/** The persisted backlog states projected into the work-oriented vocabulary. */
function backlogQuestionStatus(
  question: typeof backlogQuestions.$inferSelect,
): QuestionBacklogStatus {
  if (question.state === "archived" || question.state === "not_suitable") {
    return "archived";
  }
  if (question.state === "answerable" || question.state === "drafting") {
    return "drafting";
  }
  if (question.state === "scheduled") return "scheduled";
  return "needs-review";
}

/** Add a staff-curated question without inventing a student source. */
export async function createManualBacklogQuestion(
  actorUserId: string,
  courseId: string,
  input: {
    text: string;
    category?: "content" | "logistics" | "misc";
    internalNote?: string;
  },
) {
  await requireCourseStaffOrSectionGrant(
    db,
    actorUserId,
    courseId,
    "manageBacklogImports",
  );
  const text = input.text.trim();
  if (!text) throw new Error("Question text is required");

  return db.transaction(async (tx) => {
    const [question] = await tx
      .insert(backlogQuestions)
      .values({
        courseId,
        text,
        category: input.category,
        internalNote: input.internalNote?.trim() || null,
        state: "needs_review",
        provenance: "manual_entry",
        identityPreserved: false,
        createdByUserId: actorUserId,
      })
      .returning();
    await writeAudit(tx, {
      actorUserId,
      action: "backlog.question_created",
      entityType: "backlog_question",
      entityId: question!.id,
      after: { provenance: "manual_entry", courseId },
      courseId,
    });
    return question!;
  });
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
    /*
     * A row action can be clicked more than once, and the page can be opened
     * in two tabs. Source-preserving current items are the stable identity for
     * this workflow, so an existing source link is a successful no-op rather
     * than another backlog question. The database keeps a non-unique index for
     * historical imports, so this guard belongs in the domain transaction.
     */
    if (opts.preserveSource) {
      /* The schema deliberately retains a non-unique source index for legacy
         rows. Serialize this source item while checking it so two quick clicks
         (or two tabs) cannot both observe "not yet added" and insert a pair. */
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${item.id}, 0))`,
      );
      const existing = await tx.query.backlogQuestions.findFirst({
        where: and(
          eq(backlogQuestions.courseId, courseId),
          eq(backlogQuestions.sourceItemId, item.id),
        ),
      });
      if (existing) return existing;
    }

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

/**
 * Read the source-preserving backlog membership for an already-authorized
 * course review list. This is intentionally a bounded lookup by the item ids
 * currently on screen, not a second unbounded backlog feed.
 */
export async function listBacklogSourceItemIds(
  actorUserId: string,
  courseId: string,
  itemIds: string[],
) {
  await requireCourseStaffOrSectionGrant(
    db,
    actorUserId,
    courseId,
    "manageBacklogImports",
    { allowArchived: true },
  );
  if (itemIds.length === 0) return new Set<string>();
  const rows = await db.query.backlogQuestions.findMany({
    where: and(
      eq(backlogQuestions.courseId, courseId),
      inArray(backlogQuestions.sourceItemId, itemIds),
    ),
    columns: { sourceItemId: true },
  });
  return new Set(
    rows.flatMap((row) => (row.sourceItemId ? [row.sourceItemId] : [])),
  );
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
  archived: ["needs_review"],
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
  if (question.sourceItemId) {
    const { sectionId } = await getItemWithSection(question.sourceItemId);
    // The backlog and its answer are course-owned, but a current submission
    // remains readable only through the section that authorized the actor.
    // Keep this check here so opening the shared editorial workspace cannot
    // turn a course-level draft permission into source-data access.
    await requireSectionStaff(
      db,
      actorUserId,
      sectionId,
      "draftPublicAnswers",
    );
  }
  if (!["needs_review", "answerable", "drafting"].includes(question.state)) {
    throw new Error(
      `Backlog question is not ready to draft (is ${question.state})`,
    );
  }

  return db.transaction(async (tx) => {
    /*
     * A retry must return the existing editorial item, not mint a second public
     * answer. The partial source-link index is intentionally not unique across
     * answers, so serialize this check in the domain transaction.
     */
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${backlogQuestionId}, 0))`,
    );
    const existingLink = await tx.query.sourceLinks.findFirst({
      where: eq(sourceLinks.backlogQuestionId, backlogQuestionId),
    });
    if (existingLink) {
      const existingAnswer = await tx.query.publicAnswers.findFirst({
        where: eq(publicAnswers.id, existingLink.publicAnswerId),
      });
      if (existingAnswer) return existingAnswer;
    }

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
        sourceOrigin:
          question.provenance === "legacy_import" ? "legacy" : "current",
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
          eq(backlogQuestions.state, question.state),
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
