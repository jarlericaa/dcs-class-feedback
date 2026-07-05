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

export async function publishNow(actorUserId: string, publicAnswerId: string) {
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
