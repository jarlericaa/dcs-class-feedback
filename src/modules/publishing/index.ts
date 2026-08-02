import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  formQuestions,
  formResponses,
  privateResponses,
  publicAnswers,
  questionAnswers,
  sourceLinks,
  studentSubmissionItems,
  weeklyCycles,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import {
  PUBLICATION_PERMISSIONS,
  requireAnySectionPermission,
  requireEnrolledStudent,
  requireSectionQaAccess,
  requireSectionStaff,
} from "@/modules/authz";
import { getItemWithSection } from "@/modules/review";

export { publishDueAnswers } from "./publish";

/**
 * Public Q&A + source linking (public-qa-and-source-linking.md).
 * Invariants enforced here:
 * - the original student wording is NEVER touched; rewording lives on the
 *   PublicAnswer only;
 * - every source stays linked (merge = many SourceLinks → one answer);
 * - SourceLink is internal-only: no student-visible public read model ever
 *   includes source/identity data;
 * - "public" = visible to that section's class only (authz-gated).
 */

/**
 * Draft a public answer from one or more student submission items (merge =
 * multiple items; D8 provisional: same section, cross-cycle allowed).
 */
export async function draftPublicAnswer(
  actorUserId: string,
  input: {
    sectionId: string;
    itemIds: string[];
    publicQuestionText: string;
    answerBody?: string;
    category?: "content" | "logistics" | "misc";
    topicId?: string;
  },
) {
  if (input.itemIds.length === 0) {
    throw new Error("At least one source item is required");
  }
  if (!input.publicQuestionText.trim()) {
    throw new Error("Public question text is required");
  }
  await requireSectionStaff(db, actorUserId, input.sectionId, "draftPublicAnswers");

  // Merge scope: every source item must belong to THIS section.
  const items: (typeof studentSubmissionItems.$inferSelect)[] = [];
  for (const itemId of input.itemIds) {
    const { item, sectionId } = await getItemWithSection(itemId);
    if (sectionId !== input.sectionId) {
      throw new Error(
        "All merged items must belong to the same class section (cross-section publishing goes through the course backlog)",
      );
    }
    items.push(item);
  }

  return db.transaction(async (tx) => {
    const [answer] = await tx
      .insert(publicAnswers)
      .values({
        sectionId: input.sectionId,
        publicQuestionText: input.publicQuestionText,
        answerBody: input.answerBody,
        state: "draft",
        category: input.category,
        topicId: input.topicId,
        sourceOrigin: "current",
        createdByUserId: actorUserId,
      })
      .returning();

    for (const item of items) {
      const [link] = await tx
        .insert(sourceLinks)
        .values({
          publicAnswerId: answer!.id,
          itemId: item.id,
          createdByUserId: actorUserId,
        })
        .returning();
      await writeAudit(tx, {
        actorUserId,
        action: "source_link.created",
        entityType: "source_link",
        entityId: link!.id,
        after: { publicAnswerId: answer!.id, itemId: item.id },
      });

      const merged = items.length > 1;
      const hasPrivate =
        item.disposition === "private" ||
        item.disposition === "private_and_public";
      const disposition = merged
        ? "merged"
        : hasPrivate
          ? "private_and_public"
          : "public";
      await tx
        .update(studentSubmissionItems)
        .set({
          disposition,
          reviewState:
            item.reviewState === "new" ? "under_review" : item.reviewState,
          updatedAt: new Date(),
        })
        .where(eq(studentSubmissionItems.id, item.id));
    }

    await writeAudit(tx, {
      actorUserId,
      action: "public_answer.drafted",
      entityType: "public_answer",
      entityId: answer!.id,
      after: {
        sectionId: input.sectionId,
        sourceCount: items.length,
        merged: items.length > 1,
      },
    });
    return answer!;
  });
}

/** Reword the PUBLIC question text. The original on the item is immutable. */
export async function rewordPublicQuestion(
  actorUserId: string,
  publicAnswerId: string,
  newText: string,
) {
  if (!newText.trim()) throw new Error("Public question text is required");
  const answer = await db.query.publicAnswers.findFirst({
    where: eq(publicAnswers.id, publicAnswerId),
  });
  if (!answer) throw new Error("Public answer not found");
  await requireSectionStaff(db, actorUserId, answer.sectionId, "rewordPublicQuestions");
  // A scheduled answer already carries an acknowledged anonymity check for its
  // current wording. Allowing an edit here would let different text go out
  // under that acknowledgment, so the schedule must be cancelled first.
  if (answer.state !== "draft") {
    throw new Error(
      `Cannot edit an answer in state ${answer.state}. Cancel the schedule first.`,
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(publicAnswers)
      .set({ publicQuestionText: newText, updatedAt: new Date() })
      .where(eq(publicAnswers.id, publicAnswerId));
    await writeAudit(tx, {
      actorUserId,
      action: "public_answer.reworded",
      entityType: "public_answer",
      entityId: publicAnswerId,
      before: { publicQuestionText: answer.publicQuestionText },
      after: { publicQuestionText: newText },
    });
  });
}

export async function updateAnswerBody(
  actorUserId: string,
  publicAnswerId: string,
  answerBody: string,
) {
  const answer = await db.query.publicAnswers.findFirst({
    where: eq(publicAnswers.id, publicAnswerId),
  });
  if (!answer) throw new Error("Public answer not found");
  await requireSectionStaff(db, actorUserId, answer.sectionId, "draftPublicAnswers");
  if (answer.state !== "draft") {
    throw new Error(
      `Cannot edit an answer in state ${answer.state}. Cancel the schedule first.`,
    );
  }
  await db.transaction(async (tx) => {
    await tx
      .update(publicAnswers)
      .set({ answerBody, updatedAt: new Date() })
      .where(eq(publicAnswers.id, publicAnswerId));
    await writeAudit(tx, {
      actorUserId,
      action: "public_answer.edited",
      entityType: "public_answer",
      entityId: publicAnswerId,
      before: { answerBody: answer.answerBody },
      after: { answerBody },
    });
  });
}

/**
 * Small-class anonymity heuristic (Risk R2): flags for the pre-publish
 * warning. The REQUIREMENT is that the publish UI warns; these heuristics are
 * intentionally conservative and cheap.
 */
export function anonymityWarnings(
  publicQuestionText: string,
  sourceCount: number,
): string[] {
  const warnings: string[] = [];
  const text = publicQuestionText.toLowerCase();
  if (/\b(i|my|me|myself|mine)\b/.test(text)) {
    warnings.push(
      "The question uses first-person wording — consider generalizing so it does not point to one student.",
    );
  }
  if (/\b(yesterday|last (week|meeting|class)|during my)\b/.test(text)) {
    warnings.push(
      "The question references a specific personal circumstance or moment — check that it cannot identify the asker.",
    );
  }
  if (sourceCount === 1) {
    warnings.push(
      "This answer has a single source submission — in a small class the asker may still be identifiable. Reword to remove identifying context if needed.",
    );
  }
  if (sourceCount > 1 && /\b(a student asked|one student)\b/.test(text)) {
    warnings.push(
      "Merged answer wording implies a single asker — rephrase unless that is safe and intentional.",
    );
  }
  return warnings;
}

/**
 * Raised when a publication would go out without the anonymity check having
 * been acknowledged. Carries the warnings so the UI can show exactly what to
 * look at rather than a generic refusal.
 */
export class AnonymityCheckRequired extends Error {
  constructor(readonly warnings: string[]) {
    super("The anonymity check has not been acknowledged");
    this.name = "AnonymityCheckRequired";
  }
}

/**
 * Enforce the pre-publish anonymity check at the SERVICE boundary
 * (Risk R2), using the persisted question text and the real source-link
 * count. Doing it in the page instead would trust client-submitted values:
 * the acknowledgment form could otherwise claim a benign question or a
 * merged source count and dodge the warning entirely.
 */
async function requireAnonymityAcknowledged(
  publicAnswerId: string,
  publicQuestionText: string,
  acknowledged: boolean,
) {
  const links = await db.query.sourceLinks.findMany({
    where: eq(sourceLinks.publicAnswerId, publicAnswerId),
  });
  const warnings = anonymityWarnings(publicQuestionText, links.length);
  if (warnings.length > 0 && !acknowledged) {
    throw new AnonymityCheckRequired(warnings);
  }
}

export async function publishNow(
  actorUserId: string,
  publicAnswerId: string,
  opts: { anonymityAcknowledged?: boolean } = {},
) {
  const answer = await db.query.publicAnswers.findFirst({
    where: eq(publicAnswers.id, publicAnswerId),
  });
  if (!answer) throw new Error("Public answer not found");
  await requireSectionStaff(db, actorUserId, answer.sectionId, "publishPublicAnswers");
  if (answer.state !== "draft" && answer.state !== "scheduled") {
    throw new Error(`Cannot publish an answer in state ${answer.state}`);
  }
  if (!answer.answerBody?.trim()) {
    throw new Error("Cannot publish without an answer body");
  }
  await requireAnonymityAcknowledged(
    publicAnswerId,
    answer.publicQuestionText,
    opts.anonymityAcknowledged ?? false,
  );

  await db.transaction(async (tx) => {
    await tx
      .update(publicAnswers)
      .set({
        state: "published",
        publishedAt: new Date(),
        scheduledAt: null,
        publishFailed: false,
        publishFailureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(publicAnswers.id, publicAnswerId));
    await writeAudit(tx, {
      actorUserId,
      action: "public_answer.published",
      entityType: "public_answer",
      entityId: publicAnswerId,
      before: { state: answer.state },
      after: { state: "published" },
    });
  });
}

export async function schedulePublication(
  actorUserId: string,
  publicAnswerId: string,
  scheduledAt: Date,
  opts: { anonymityAcknowledged?: boolean } = {},
) {
  const answer = await db.query.publicAnswers.findFirst({
    where: eq(publicAnswers.id, publicAnswerId),
  });
  if (!answer) throw new Error("Public answer not found");
  await requireSectionStaff(db, actorUserId, answer.sectionId, "schedulePublication");
  if (answer.state !== "draft" && answer.state !== "scheduled") {
    throw new Error(`Cannot schedule an answer in state ${answer.state}`);
  }
  if (!answer.answerBody?.trim()) {
    throw new Error("Cannot schedule without an answer body");
  }
  // Scheduling is the last human moment before the answer goes out: the
  // background executor publishes without asking anyone. The check therefore
  // has to happen here, not only on the publish-now path.
  await requireAnonymityAcknowledged(
    publicAnswerId,
    answer.publicQuestionText,
    opts.anonymityAcknowledged ?? false,
  );

  await db.transaction(async (tx) => {
    await tx
      .update(publicAnswers)
      .set({
        state: "scheduled",
        scheduledAt,
        publishFailed: false,
        publishFailureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(publicAnswers.id, publicAnswerId));
    await writeAudit(tx, {
      actorUserId,
      action: "public_answer.scheduled",
      entityType: "public_answer",
      entityId: publicAnswerId,
      after: { scheduledAt: scheduledAt.toISOString() },
    });
  });
}

export async function cancelScheduledPublication(
  actorUserId: string,
  publicAnswerId: string,
) {
  const answer = await db.query.publicAnswers.findFirst({
    where: eq(publicAnswers.id, publicAnswerId),
  });
  if (!answer) throw new Error("Public answer not found");
  await requireSectionStaff(db, actorUserId, answer.sectionId, "schedulePublication");
  if (answer.state !== "scheduled") {
    throw new Error("Only a scheduled answer can be cancelled");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(publicAnswers)
      .set({
        state: "draft",
        scheduledAt: null,
        publishFailed: false,
        publishFailureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(publicAnswers.id, publicAnswerId));
    await writeAudit(tx, {
      actorUserId,
      action: "public_answer.schedule_cancelled",
      entityType: "public_answer",
      entityId: publicAnswerId,
      before: { scheduledAt: answer.scheduledAt?.toISOString() },
    });
  });
}

/**
 * Publication queue: drafts, scheduled answers, failed publications and the
 * most recent published entries for one section. Staff-only — it carries the
 * source-link counts and failure reasons that never reach students.
 *
 * `publishFailed` rows stay in `scheduled` state by design (see
 * publishing/publish.ts), so staff can retry with publishNow or reschedule.
 */
export async function listPublicationQueue(
  actorUserId: string,
  sectionId: string,
) {
  await requireAnySectionPermission(
    db,
    actorUserId,
    sectionId,
    PUBLICATION_PERMISSIONS,
  );
  const rows = await db.query.publicAnswers.findMany({
    where: eq(publicAnswers.sectionId, sectionId),
    orderBy: desc(publicAnswers.updatedAt),
  });
  if (rows.length === 0) {
    return { drafts: [], scheduled: [], failed: [], published: [] };
  }
  const links = await db.query.sourceLinks.findMany({
    where: inArray(
      sourceLinks.publicAnswerId,
      rows.map((r) => r.id),
    ),
  });
  const sourceCount = new Map<string, number>();
  for (const link of links) {
    sourceCount.set(
      link.publicAnswerId,
      (sourceCount.get(link.publicAnswerId) ?? 0) + 1,
    );
  }
  const decorated = rows.map((answer) => ({
    answer,
    sourceCount: sourceCount.get(answer.id) ?? 0,
  }));
  return {
    drafts: decorated.filter((d) => d.answer.state === "draft"),
    scheduled: decorated.filter(
      (d) => d.answer.state === "scheduled" && !d.answer.publishFailed,
    ),
    failed: decorated.filter((d) => d.answer.publishFailed),
    published: decorated
      .filter((d) => d.answer.state === "published")
      .slice(0, 20),
  };
}

/**
 * One public answer with the ORIGINAL wording of its sources, for the staff
 * editor. The originals are staff-only context: they are never part of any
 * student-facing projection.
 */
export async function getPublicAnswerForEditing(
  actorUserId: string,
  publicAnswerId: string,
) {
  const answer = await db.query.publicAnswers.findFirst({
    where: eq(publicAnswers.id, publicAnswerId),
  });
  if (!answer) throw new Error("Public answer not found");
  await requireAnySectionPermission(
    db,
    actorUserId,
    answer.sectionId,
    PUBLICATION_PERMISSIONS,
  );
  const links = await db.query.sourceLinks.findMany({
    where: eq(sourceLinks.publicAnswerId, publicAnswerId),
  });
  const itemIds = links.map((l) => l.itemId).filter((v): v is string => !!v);
  const items = itemIds.length
    ? await db.query.studentSubmissionItems.findMany({
        where: inArray(studentSubmissionItems.id, itemIds),
      })
    : [];
  return {
    answer,
    sources: items.map((item) => ({
      id: item.id,
      submissionType: item.submissionType,
      category: item.category,
      originalText: item.originalText,
    })),
    backlogSourceCount: links.filter((l) => l.backlogQuestionId).length,
    warnings: anonymityWarnings(answer.publicQuestionText, links.length),
  };
}

/**
 * Section Q&A archive — the class-facing read model. Access limited to that
 * section's enrolled students and staff. The projection is intentionally
 * identity-free: no source links, no student data, no drafts.
 */
export async function listSectionQa(
  actorUserId: string,
  sectionId: string,
  opts: { search?: string; category?: "content" | "logistics" | "misc" } = {},
) {
  await requireSectionQaAccess(db, actorUserId, sectionId);
  const conditions = [
    eq(publicAnswers.sectionId, sectionId),
    eq(publicAnswers.state, "published"),
  ];
  if (opts.category) conditions.push(eq(publicAnswers.category, opts.category));
  if (opts.search?.trim()) {
    const term = `%${opts.search.trim()}%`;
    conditions.push(
      or(
        ilike(publicAnswers.publicQuestionText, term),
        ilike(publicAnswers.answerBody, term),
      )!,
    );
  }
  const rows = await db.query.publicAnswers.findMany({
    where: and(...conditions),
    orderBy: desc(publicAnswers.publishedAt),
  });
  // Anonymous projection — never include createdBy/source information.
  return rows.map((r) => ({
    id: r.id,
    question: r.publicQuestionText,
    answer: r.answerBody,
    category: r.category,
    topicId: r.topicId,
    publishedAt: r.publishedAt,
    sourceOrigin: r.sourceOrigin,
  }));
}

/**
 * Student submission history (public-qa-and-source-linking.md §6).
 * Shows the student their own submissions, private responses, and — via the
 * internal source link — whether their question was publicly answered plus
 * the reworded public text. Never exposes validity, dispositions, drafts, or
 * other students' anything.
 */
export async function getStudentHistory(userId: string, sectionId: string) {
  const record = await requireEnrolledStudent(db, userId, sectionId);
  const cycles = await db.query.weeklyCycles.findMany({
    where: eq(weeklyCycles.sectionId, sectionId),
  });
  if (cycles.length === 0) return [];
  const responses = await db.query.formResponses.findMany({
    where: and(
      inArray(
        formResponses.cycleId,
        cycles.map((c) => c.id),
      ),
      eq(formResponses.studentRecordId, record.id),
    ),
  });
  const cycleById = new Map(cycles.map((c) => [c.id, c]));

  const history = [];
  for (const response of responses) {
    const answers = await db.query.questionAnswers.findMany({
      where: eq(questionAnswers.responseId, response.id),
    });
    const questions = await db.query.formQuestions.findMany({
      where: eq(formQuestions.cycleId, response.cycleId),
    });
    const questionById = new Map(questions.map((q) => [q.id, q]));
    const items = await db.query.studentSubmissionItems.findMany({
      where: eq(studentSubmissionItems.responseId, response.id),
    });

    const itemViews = [];
    for (const item of items) {
      const privates = await db.query.privateResponses.findMany({
        where: eq(privateResponses.itemId, item.id),
      });
      const links = await db.query.sourceLinks.findMany({
        where: eq(sourceLinks.itemId, item.id),
      });
      let publicView: {
        rewordedQuestion: string;
        answer: string | null;
        publishedAt: Date | null;
      } | null = null;
      for (const link of links) {
        const answer = await db.query.publicAnswers.findFirst({
          where: and(
            eq(publicAnswers.id, link.publicAnswerId),
            eq(publicAnswers.state, "published"), // drafts/scheduled invisible
          ),
        });
        if (answer) {
          publicView = {
            rewordedQuestion: answer.publicQuestionText,
            answer: answer.answerBody,
            publishedAt: answer.publishedAt,
          };
          break;
        }
      }
      // Neutral label only: "Answered" iff a private response or a PUBLISHED
      // public answer exists. No-response/undecided stays "Submitted".
      const answered = privates.length > 0 || publicView !== null;
      itemViews.push({
        id: item.id,
        submissionType: item.submissionType,
        category: item.category,
        originalText: item.originalText,
        status: answered ? ("answered" as const) : ("submitted" as const),
        privateResponses: privates.map((p) => ({
          body: p.body,
          createdAt: p.createdAt,
        })),
        publicAnswer: publicView,
      });
    }

    history.push({
      responseId: response.id,
      cycleIndex: cycleById.get(response.cycleId)?.cycleIndex ?? null,
      submittedAt: response.submittedAt,
      status: "submitted" as const, // neutral; review/validity never exposed
      answers: answers.map((a) => ({
        prompt: questionById.get(a.questionId)?.prompt ?? "",
        value: a.value,
        freeText: a.freeText,
      })),
      items: itemViews,
    });
  }
  return history.sort(
    (a, b) => (a.cycleIndex ?? 0) - (b.cycleIndex ?? 0),
  );
}
