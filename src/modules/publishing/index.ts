import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  classSections,
  formInstances,
  formQuestions,
  formResponses,
  privateResponses,
  publicAnswers,
  publicAnswerApprovals,
  questionAnswers,
  sourceLinks,
  studentSubmissionItems,
  users,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import {
  PUBLICATION_PERMISSIONS,
  AuthzError,
  requireAnyCoursePermission,
  requireCourseQaAccess,
  requireCourseStaffOrSectionGrant,
  requireEnrolledStudent,
  requireSectionStaff,
} from "@/modules/authz";
import { hasSequence, instanceLabel } from "@/modules/forms/instances";
import { getItemWithSection } from "@/modules/review";
import { normalizePublicQuestionText } from "./dedupe";

export { publishDueAnswers } from "./publish";

/**
 * Public Q&A + source linking (docs/domain/public-qa.md).
 * Invariants enforced here:
 * - the original student wording is NEVER touched; rewording lives on the
 *   PublicAnswer only;
 * - every source stays linked (merge = many SourceLinks → one answer);
 * - SourceLink is internal-only: no student-visible public read model ever
 *   includes source/identity data;
 * - "public" = visible to the COURSE's class only (authz-gated, ADR-0005):
 *   one publication, one entry, read by every eligible student of the course.
 *
 * The section a question came from survives as internal provenance through
 * SourceLink → StudentSubmissionItem → FormResponse.sectionId. It is never an
 * audience boundary and never reaches a student-visible payload.
 */

/**
 * Authorize a WRITE to one course-owned public answer.
 *
 * Course staff qualify; so does a section assistant holding the named flag on
 * any section of the course, because that is the scope the flag advertises now
 * that the queue is course-wide. This governs the ENTRY only — reading the
 * SOURCE submissions behind it stays section-scoped and is checked separately,
 * per source, on the drafting path.
 */
async function requireAnswerCapability(
  courseId: string,
  actorUserId: string,
  permission:
    | "draftPublicAnswers"
    | "rewordPublicQuestions"
    | "publishPublicAnswers"
    | "schedulePublication",
) {
  return requireCourseStaffOrSectionGrant(
    db,
    actorUserId,
    courseId,
    permission,
  );
}

/**
 * Draft a public answer from one or more student submission items.
 *
 * Merge = multiple items. They may now span sections of the same course (one
 * course, one answer), but the actor must hold the permission on each source
 * section — see the check below.
 */
export async function draftPublicAnswer(
  actorUserId: string,
  input: {
    courseId: string;
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
  await requireAnswerCapability(input.courseId, actorUserId, "draftPublicAnswers");

  /**
   * Merge scope: every source item must belong to THIS course, and the actor
   * must hold `draft_public_answers` on EVERY source section individually.
   *
   * That second condition is what stops a merge becoming a permission bypass.
   * A course-wide answer may now legitimately draw on Lab A and Lab B at once —
   * it is one course, one answer — but an assistant authorized on Lab A only
   * still cannot reach into Lab B's submissions by naming them as co-sources.
   * The section a source came from is read from `formResponses.sectionId` (the
   * section the ASKER answered through), never from the instance audience.
   */
  const items: (typeof studentSubmissionItems.$inferSelect)[] = [];
  const sourceSectionIds = new Set<string>();
  for (const itemId of input.itemIds) {
    const { item, sectionId } = await getItemWithSection(itemId);
    const section = await db.query.classSections.findFirst({
      where: eq(classSections.id, sectionId),
    });
    if (section?.courseId !== input.courseId) {
      throw new Error(
        "All merged items must belong to the same course",
      );
    }
    await requireSectionStaff(db, actorUserId, sectionId, "draftPublicAnswers");
    sourceSectionIds.add(sectionId);
    items.push(item);
  }

  return db.transaction(async (tx) => {
    const [answer] = await tx
      .insert(publicAnswers)
      .values({
        courseId: input.courseId,
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
        courseId: input.courseId,
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
      courseId: input.courseId,
      after: {
        courseId: input.courseId,
        sourceCount: items.length,
        merged: items.length > 1,
        /* Internal provenance for the audit trail only — which class lists the
           sources came through. Never part of a student-visible payload. */
        sourceSectionIds: [...sourceSectionIds],
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
  await requireAnswerCapability(answer.courseId, actorUserId, "rewordPublicQuestions");
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
      courseId: answer.courseId,
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
  await requireAnswerCapability(answer.courseId, actorUserId, "draftPublicAnswers");
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
      courseId: answer.courseId,
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
  await requireAnswerCapability(answer.courseId, actorUserId, "publishPublicAnswers");
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
      courseId: answer.courseId,
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
  await requireAnswerCapability(answer.courseId, actorUserId, "schedulePublication");
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
      courseId: answer.courseId,
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
  await requireAnswerCapability(answer.courseId, actorUserId, "schedulePublication");
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
      courseId: answer.courseId,
    });
  });
}

/**
 * Publication queue: drafts, scheduled answers, failed publications and the
 * most recent published entries for one COURSE (ADR-0005). Staff-only — it
 * carries the source-link counts and failure reasons that never reach students.
 *
 * One queue per course, not per section: the teaching team of CS 33 works one
 * pipeline, and an answer drafted from a Lab A question is the same object
 * every instructor on the course sees.
 *
 * `publishFailed` rows stay in `scheduled` state by design (see
 * publishing/publish.ts), so staff can retry with publishNow or reschedule.
 */
export async function listCoursePublicationQueue(
  actorUserId: string,
  courseId: string,
) {
  await requireAnyCoursePermission(
    db,
    actorUserId,
    courseId,
    PUBLICATION_PERMISSIONS,
    { allowArchived: true },
  );
  const rows = await db.query.publicAnswers.findMany({
    where: eq(publicAnswers.courseId, courseId),
    orderBy: desc(publicAnswers.updatedAt),
  });
  if (rows.length === 0) {
    return { drafts: [], scheduled: [], failed: [], published: [], items: [] };
  }
  const links = await db.query.sourceLinks.findMany({
    where: inArray(
      sourceLinks.publicAnswerId,
      rows.map((r) => r.id),
    ),
  });
  const itemIds = links
    .map((link) => link.itemId)
    .filter((itemId): itemId is string => Boolean(itemId));
  const items = itemIds.length
    ? await db.query.studentSubmissionItems.findMany({
        where: inArray(studentSubmissionItems.id, itemIds),
      })
    : [];
  const responses = items.length
    ? await db.query.formResponses.findMany({
        where: inArray(
          formResponses.id,
          items.map((item) => item.responseId),
        ),
      })
    : [];
  const cycles = responses.length
    ? await db.query.formInstances.findMany({
        where: inArray(
          formInstances.id,
          responses.map((response) => response.cycleId),
        ),
      })
    : [];
  const creatorIds = [...new Set(rows.map((row) => row.createdByUserId))];
  const creators = await db.query.users.findMany({
    where: inArray(users.id, creatorIds),
  });
  const approvals = await db.query.publicAnswerApprovals.findMany({
    where: inArray(
      publicAnswerApprovals.publicAnswerId,
      rows.map((row) => row.id),
    ),
    orderBy: desc(publicAnswerApprovals.createdAt),
  });
  const sourceCount = new Map<string, number>();
  const sourceSubmissionCount = new Map<string, number>();
  const firstSourceCycle = new Map<string, (typeof formInstances.$inferSelect)>();
  for (const link of links) {
    sourceCount.set(
      link.publicAnswerId,
      (sourceCount.get(link.publicAnswerId) ?? 0) + 1,
    );
    if (link.itemId) {
      sourceSubmissionCount.set(
        link.publicAnswerId,
        (sourceSubmissionCount.get(link.publicAnswerId) ?? 0) + 1,
      );
      const item = items.find((candidate) => candidate.id === link.itemId);
      const response = item
        ? responses.find((candidate) => candidate.id === item.responseId)
        : undefined;
      const cycle = response
        ? cycles.find((candidate) => candidate.id === response.cycleId)
        : undefined;
      if (cycle && !firstSourceCycle.has(link.publicAnswerId)) {
        firstSourceCycle.set(link.publicAnswerId, cycle);
      }
    }
  }
  const latestApproval = new Map<string, (typeof publicAnswerApprovals.$inferSelect)>();
  for (const approval of approvals) {
    if (!latestApproval.has(approval.publicAnswerId)) {
      latestApproval.set(approval.publicAnswerId, approval);
    }
  }
  const creatorById = new Map(creators.map((creator) => [creator.id, creator]));
  const decorated = rows.map((answer) => ({
    answer,
    sourceCount: sourceCount.get(answer.id) ?? 0,
    linkedSubmissionCount: sourceSubmissionCount.get(answer.id) ?? 0,
    creatorName: creatorById.get(answer.createdByUserId)?.displayName ?? null,
    sourceOccurrence: (() => {
      const cycle = firstSourceCycle.get(answer.id);
      return cycle && hasSequence(cycle)
        ? instanceLabel(cycle)
        : null;
    })(),
    latestApproval: latestApproval.get(answer.id) ?? null,
  }));
  const active = decorated.filter(
    (item) => item.answer.state !== "published" && item.answer.state !== "unpublished",
  );
  return {
    drafts: decorated.filter((d) => d.answer.state === "draft"),
    scheduled: decorated.filter(
      (d) => d.answer.state === "scheduled" && !d.answer.publishFailed,
    ),
    failed: decorated.filter((d) => d.answer.publishFailed),
    published: decorated
      .filter((d) => d.answer.state === "published")
      .slice(0, 20),
    /**
     * The editorial list keeps the persisted state intact. `latestApproval` is
     * only a projection for the queue: an approval rejection returns the
     * PublicAnswer to `draft`, but remains useful as a Rejected filter result
     * until the next revision or approval decision.
     */
    items: active,
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
  await requireAnyCoursePermission(
    db,
    actorUserId,
    answer.courseId,
    PUBLICATION_PERMISSIONS,
    { allowArchived: true },
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
  const visibleSources: {
    id: string;
    submissionType: (typeof studentSubmissionItems.$inferSelect)["submissionType"];
    category: (typeof studentSubmissionItems.$inferSelect)["category"];
    originalText: string;
  }[] = [];
  let hiddenSourceCount = 0;
  for (const item of items) {
    const { sectionId } = await getItemWithSection(item.id);
    try {
      await requireSectionStaff(
        db,
        actorUserId,
        sectionId,
        "reviewResponses",
        { allowArchived: true },
      );
      visibleSources.push({
        id: item.id,
        submissionType: item.submissionType,
        category: item.category,
        originalText: item.originalText,
      });
    } catch (err) {
      if (err instanceof AuthzError) {
        hiddenSourceCount += 1;
        continue;
      }
      throw err;
    }
  }
  return {
    answer,
    sources: visibleSources,
    hiddenSourceCount,
    backlogSourceCount: links.filter((l) => l.backlogQuestionId).length,
    warnings: anonymityWarnings(answer.publicQuestionText, links.length),
  };
}

/**
 * Class Q&A archive — the class-facing read model, one per COURSE (ADR-0005).
 *
 * Access is limited to the course's staff and to students holding an active
 * enrolment in ANY of its sections. A Lab B student reading an answer that
 * originated in Lab A is the intended behaviour, not a leak: the projection is
 * identity-free AND provenance-free — no source links, no student data, no
 * drafts, and no origin section.
 *
 * There is deliberately no section filter here. Which class a question came
 * from is not part of navigating a shared archive, and offering it would invite
 * exactly the inference the anonymity rules exist to prevent.
 */
export async function listCourseQa(
  actorUserId: string,
  courseId: string,
  opts: {
    search?: string;
    category?: "content" | "logistics" | "misc";
    sort?: "newest" | "oldest";
  } = {},
) {
  await requireCourseQaAccess(db, actorUserId, courseId, { allowArchived: true });
  const conditions = [
    eq(publicAnswers.courseId, courseId),
    eq(publicAnswers.state, "published"),
  ];
  if (opts.category) {
    conditions.push(
      opts.category === "misc"
        ? or(eq(publicAnswers.category, "misc"), isNull(publicAnswers.category))!
        : eq(publicAnswers.category, opts.category),
    );
  }
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
    orderBy:
      opts.sort === "oldest"
        ? asc(publicAnswers.publishedAt)
        : desc(publicAnswers.publishedAt),
  });

  /**
   * Who answered, by display name.
   *
   * The ASKER stays anonymous — that is the promise this archive is built on,
   * and nothing below adds a source link, an identity or a draft. The
   * ANSWERER is a different person: a member of the teaching team putting
   * their name to a public statement to the class. "Answered by the teaching
   * team" left a class unable to tell which of four people had said it.
   *
   * `createdByUserId` is NOT NULL with a foreign key to `users`, so in practice
   * a name is always available; the nullable return is defensive only, for a
   * lookup that somehow misses. Callers must still handle null rather than
   * asserting, because that constraint is the only thing making it unreachable.
   */
  const authorIds = [
    ...new Set(
      rows.map((r) => r.createdByUserId).filter((v): v is string => !!v),
    ),
  ];
  const authorById = new Map(
    (authorIds.length
      ? await db.query.users.findMany({ where: inArray(users.id, authorIds) })
      : []
    ).map((u) => [u.id, u.displayName]),
  );

  // Anonymous projection for the asker — never include source information.
  // Group matching titles into one question thread while retaining every
  // published answer under it.
  const grouped = new Map<
    string,
    (typeof rows)[number][]
  >();
  for (const row of rows) {
    const key = normalizePublicQuestionText(row.publicQuestionText);
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  return [...grouped.values()].map((group) => {
    const first = group[0]!;
    return {
      id: first.id,
      question: first.publicQuestionText,
      answers: group.map((row) => ({
        id: row.id,
        answer: row.answerBody,
        publishedAt: row.publishedAt,
        /** the staff member who published it, or null when unattributed */
        answeredByName: row.createdByUserId
          ? (authorById.get(row.createdByUserId) ?? null)
          : null,
      })),
      category: first.category ?? "misc",
      topicId: first.topicId,
      publishedAt: first.publishedAt,
      sourceOrigin: first.sourceOrigin,
    };
  });
}

/**
 * Student submission history (docs/domain/public-qa.md §6).
 * Shows the student their own submissions, private responses, and — via the
 * internal source link — whether their question was publicly answered plus
 * the reworded public text. Never exposes validity, dispositions, drafts, or
 * other students' anything.
 */
export async function getStudentHistory(userId: string, sectionId: string) {
  const record = await requireEnrolledStudent(db, userId, sectionId, {
    allowArchived: true,
  });
  // Keyed on the response's own section, so a student in two sections of the
  // same course sees each submission once, under the section they answered
  // through — and never another section's history.
  const responses = await db.query.formResponses.findMany({
    where: and(
      eq(formResponses.sectionId, sectionId),
      eq(formResponses.studentRecordId, record.id),
    ),
  });
  if (responses.length === 0) return [];
  const cycles = await db.query.formInstances.findMany({
    where: inArray(
      formInstances.id,
      responses.map((r) => r.cycleId),
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
        /** deep-links the asker straight to the entry in the course archive */
        id: string;
        courseId: string;
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
            id: answer.id,
            courseId: answer.courseId,
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
        /**
         * `authorRole` and nothing more.
         *
         * A thread can hold the student's own follow-up alongside staff
         * replies, and without the role their own words render back at them as
         * "from your teaching team". The staff member's NAME is deliberately
         * absent: every student-facing surface in this product says "your
         * teaching team", so a reply is the team's, not one person's — a
         * teaching assistant delivering an unwelcome answer to a peer should
         * not be individually attributable.
         */
        privateResponses: privates.map((p) => ({
          body: p.body,
          createdAt: p.createdAt,
          authorRole: p.authorRole,
        })),
        publicAnswer: publicView,
      });
    }

    const instance = cycleById.get(response.cycleId) ?? null;
    history.push({
      responseId: response.id,
      cycleIndex: instance?.cycleIndex ?? null,
      /** what the student was told this form was called */
      formLabel: instance ? instanceLabel(instance) : null,
      sequenceLabel:
        instance && hasSequence(instance) ? instanceLabel(instance) : null,
      openAt: instance?.openAt ?? null,
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
  // Chronological by window: a course may now run several forms at once, so the
  // sequence number alone is no longer a total order.
  return history.sort(
    (a, b) =>
      (a.openAt?.getTime() ?? 0) - (b.openAt?.getTime() ?? 0) ||
      (a.cycleIndex ?? 0) - (b.cycleIndex ?? 0),
  );
}
