import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  classSections,
  formInstances,
  formQuestions,
  formResponses,
  privateResponses,
  publicAnswers,
  questionAnswers,
  sourceLinks,
  studentRecords,
  studentSubmissionItems,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { requireCourseStaff, requireSectionStaff } from "@/modules/authz";
import {
  filterAuthorizedSections,
  getAudiencesForInstances,
  instanceIdsForSection,
} from "@/modules/forms/audience";
import { hasSequence, instanceLabel } from "@/modules/forms/instances";

/**
 * Teacher review services (AGENTS.md §6.3, domain-model.md §3.2–3.5).
 * Review state, validity, and disposition are independent dimensions.
 * Everything staff-changing here is audited; nothing here is ever surfaced
 * to students directly (student projections live in publishing/history).
 *
 * The review inbox is COURSE/FORM-oriented: a form shared by several sections is
 * one queue with a section filter, not one queue per section — that separation is
 * not something students experience. What keeps that safe is that every read is
 * scoped to `formResponses.sectionId IN (the actor's authorized sections)`, so a
 * shared form never widens what a section-scoped staff member can see.
 */

/**
 * The section a submission item belongs to: the section its author answered
 * through, taken from the response. NOT the instance's audience — a shared
 * instance has several, and only the asker's own one may authorize an action on
 * their words.
 */
async function getItemWithSection(itemId: string) {
  const item = await db.query.studentSubmissionItems.findFirst({
    where: eq(studentSubmissionItems.id, itemId),
  });
  if (!item) throw new Error("Submission item not found");
  const response = (await db.query.formResponses.findFirst({
    where: eq(formResponses.id, item.responseId),
  }))!;
  return { item, response, sectionId: response.sectionId };
}

export { getItemWithSection };

/**
 * Submissions for a section (optionally one instance), for the review dashboard.
 * Identity is masked unless the actor holds viewStudentIdentities (teachers
 * and co-teachers always do; TAs only via the flag).
 */
export async function listSubmissionsForSection(
  actorUserId: string,
  sectionId: string,
  opts: { cycleId?: string } = {},
) {
  await requireSectionStaff(db, actorUserId, sectionId, "reviewResponses", { allowArchived: true });
  let canSeeIdentities = true;
  try {
    await requireSectionStaff(db, actorUserId, sectionId, "viewStudentIdentities", { allowArchived: true });
  } catch {
    canSeeIdentities = false;
  }

  const instanceIds = await instanceIdsForSection(db, sectionId);
  const scoped = opts.cycleId
    ? instanceIds.filter((id) => id === opts.cycleId)
    : instanceIds;
  if (scoped.length === 0) return [];
  const responses = await db.query.formResponses.findMany({
    // A draft is not a submission: it must not appear in any staff read model.
    // Scoped by the response's own section, so a shared instance yields only
    // this section's rows.
    where: and(
      inArray(formResponses.cycleId, scoped),
      eq(formResponses.sectionId, sectionId),
      inArray(formResponses.lifecycle, ["submitted", "locked"]),
    ),
  });
  const items = responses.length
    ? await db.query.studentSubmissionItems.findMany({
        // A withdrawn item was replaced by a pre-deadline edit; the live row is
        // the one staff should be triaging.
        where: and(
          isNull(studentSubmissionItems.withdrawnAt),
          inArray(
            studentSubmissionItems.responseId,
            responses.map((r) => r.id),
          ),
        ),
      })
    : [];
  const itemsByResponse = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByResponse.get(item.responseId) ?? [];
    list.push(item);
    itemsByResponse.set(item.responseId, list);
  }

  return responses.map((r) => ({
    response: {
      id: r.id,
      cycleId: r.cycleId,
      submittedAt: r.submittedAt,
      state: r.state,
      validity: r.validity,
      invalidationReason: r.invalidationReason,
      // Identity-bearing field masked without the flag:
      studentRecordId: canSeeIdentities ? r.studentRecordId : null,
    },
    items: itemsByResponse.get(r.id) ?? [],
  }));
}

export type ReviewFilter = "all" | "needs_review" | "answered" | "invalid";

export interface ReviewScope {
  /** every instance in scope, newest window first */
  instanceIds: string[];
  /** the sections whose responses this actor may read */
  sectionIds: string[];
  canSeeIdentities: boolean;
}

/**
 * Resolve which instances and which sections a review read may touch.
 *
 * This is the single place the shared-audience privacy rule lives: `sectionIds`
 * is the intersection of the requested scope with the sections the actor actually
 * holds `reviewResponses` on, and every query downstream filters
 * `formResponses.sectionId` by it.
 */
async function resolveReviewScope(
  actorUserId: string,
  target: { courseId: string } | { sectionId: string },
  opts: { sectionId?: string; instanceId?: string } = {},
): Promise<ReviewScope> {
  let sectionIds: string[];
  if ("sectionId" in target) {
    await requireSectionStaff(db, actorUserId, target.sectionId, "reviewResponses", {
      allowArchived: true,
    });
    sectionIds = [target.sectionId];
  } else {
    await requireCourseStaff(db, actorUserId, target.courseId, {
      allowArchived: true,
    });
    const sections = await db.query.classSections.findMany({
      where: eq(classSections.courseId, target.courseId),
      orderBy: [asc(classSections.title), asc(classSections.id)],
    });
    sectionIds = await filterAuthorizedSections(
      db,
      actorUserId,
      sections.map((s) => s.id),
      "reviewResponses",
    );
  }
  // A requested section filter narrows, and can never widen: an unauthorized id
  // simply drops out.
  if (opts.sectionId) {
    sectionIds = sectionIds.filter((id) => id === opts.sectionId);
  }

  // Identities are all-or-nothing per read: without the flag on EVERY section in
  // scope, the queue is rendered without identity rather than partially masked,
  // which would let a reader infer which rows came from which section.
  let canSeeIdentities = sectionIds.length > 0;
  for (const sectionId of sectionIds) {
    try {
      await requireSectionStaff(db, actorUserId, sectionId, "viewStudentIdentities", {
        allowArchived: true,
      });
    } catch {
      canSeeIdentities = false;
      break;
    }
  }

  const instanceIdSet = new Set<string>();
  for (const sectionId of sectionIds) {
    for (const id of await instanceIdsForSection(db, sectionId)) {
      instanceIdSet.add(id);
    }
  }
  let instanceIds = [...instanceIdSet];
  if (opts.instanceId) {
    instanceIds = instanceIds.filter((id) => id === opts.instanceId);
  }
  return { instanceIds, sectionIds, canSeeIdentities };
}

/**
 * Fully-joined review queue for the staff inbox: response + (masked) student
 * identity + form occurrence + items with their private replies and public
 * answers.
 *
 * Identity is included ONLY when the actor holds `view_student_identities`;
 * otherwise the student fields are null, not merely hidden in the UI. This is
 * a staff read model and must never be rendered on a student route.
 */
export async function getCourseReviewQueue(
  actorUserId: string,
  courseId: string,
  opts: {
    instanceId?: string;
    sectionId?: string;
    filter?: ReviewFilter;
  } = {},
) {
  return reviewQueue(
    actorUserId,
    await resolveReviewScope(actorUserId, { courseId }, opts),
    opts.filter,
  );
}

/**
 * @deprecated The section-scoped inbox. Kept because existing links and nav point
 * at it; it is now a section FILTER over the same implementation, which is the
 * whole point — a shared form must not have one inbox per section.
 */
export async function getReviewQueue(
  actorUserId: string,
  sectionId: string,
  opts: { cycleId?: string; filter?: ReviewFilter } = {},
) {
  return reviewQueue(
    actorUserId,
    await resolveReviewScope(
      actorUserId,
      { sectionId },
      { instanceId: opts.cycleId },
    ),
    opts.filter,
  );
}

async function reviewQueue(
  actorUserId: string,
  scope: ReviewScope,
  filterOpt?: ReviewFilter,
) {
  const { instanceIds, sectionIds, canSeeIdentities } = scope;
  const cycles = instanceIds.length
    ? await db.query.formInstances.findMany({
        where: inArray(formInstances.id, instanceIds),
        orderBy: [desc(formInstances.openAt), desc(formInstances.cycleIndex)],
      })
    : [];
  const cycleById = new Map(cycles.map((c) => [c.id, c]));
  const scopedCycleIds = cycles.map((c) => c.id);

  const responses =
    scopedCycleIds.length > 0 && sectionIds.length > 0
      ? await db.query.formResponses.findMany({
          where: and(
            inArray(formResponses.cycleId, scopedCycleIds),
            // The privacy rule, in one clause.
            inArray(formResponses.sectionId, sectionIds),
            inArray(formResponses.lifecycle, ["submitted", "locked"]),
          ),
          // submittedAt is nullable now (a draft has none), and drafts are
          // excluded above, but coalesce keeps the ordering total either way.
          orderBy: desc(
            sql`coalesce(${formResponses.submittedAt}, ${formResponses.createdAt})`,
          ),
        })
      : [];

  const items = responses.length
    ? await db.query.studentSubmissionItems.findMany({
        // A withdrawn item was replaced by a pre-deadline edit; the live row is
        // the one staff should be triaging.
        where: and(
          isNull(studentSubmissionItems.withdrawnAt),
          inArray(
            studentSubmissionItems.responseId,
            responses.map((r) => r.id),
          ),
        ),
      })
    : [];
  const privates = items.length
    ? await db.query.privateResponses.findMany({
        where: inArray(
          privateResponses.itemId,
          items.map((i) => i.id),
        ),
      })
    : [];
  const links = items.length
    ? await db.query.sourceLinks.findMany({
        where: inArray(
          sourceLinks.itemId,
          items.map((i) => i.id),
        ),
      })
    : [];
  const answers = links.length
    ? await db.query.publicAnswers.findMany({
        where: inArray(
          publicAnswers.id,
          links.map((l) => l.publicAnswerId),
        ),
      })
    : [];
  const answerById = new Map(answers.map((a) => [a.id, a]));

  const recordIds = [...new Set(responses.map((r) => r.studentRecordId))];
  const recordById = new Map(
    (canSeeIdentities && recordIds.length
      ? await db.query.studentRecords.findMany({
          where: inArray(studentRecords.id, recordIds),
        })
      : []
    ).map((r) => [r.id, r]),
  );

  const rows = responses.map((response) => {
    const record = canSeeIdentities
      ? (recordById.get(response.studentRecordId) ?? null)
      : null;
    const responseItems = items
      .filter((i) => i.responseId === response.id)
      .map((item) => {
        const itemLinks = links.filter((l) => l.itemId === item.id);
        return {
          item,
          privateResponses: privates.filter((p) => p.itemId === item.id),
          publicAnswers: itemLinks
            .map((l) => answerById.get(l.publicAnswerId))
            .filter((a): a is NonNullable<typeof a> => !!a),
        };
      });
    const answered = responseItems.some(
      (i) =>
        i.privateResponses.length > 0 ||
        i.publicAnswers.some((a) => a.state === "published"),
    );
    const instance = cycleById.get(response.cycleId) ?? null;
    return {
      response: {
        id: response.id,
        cycleId: response.cycleId,
        sectionId: response.sectionId,
        submittedAt: response.submittedAt,
        state: response.state,
        validity: response.validity,
        invalidationReason: response.invalidationReason,
        invalidationNote: response.invalidationNote,
      },
      student: record
        ? { fullName: record.fullName, studentNumber: record.studentNumber }
        : null,
      cycleIndex: instance?.cycleIndex ?? null,
      /** "Week 4", "This form", or the occurrence's own title — never "cycle". */
      instanceLabel: instance ? instanceLabel(instance) : null,
      /** null when the delivery mode has no sequence, so the UI can omit it */
      sequenceLabel:
        instance && hasSequence(instance) ? instanceLabel(instance) : null,
      items: responseItems,
      answered,
    };
  });

  const counts = {
    total: rows.length,
    needsReview: rows.filter(
      (r) => r.response.validity === "valid" && !r.answered && r.items.length > 0,
    ).length,
    answered: rows.filter((r) => r.answered).length,
    invalid: rows.filter((r) => r.response.validity === "invalid").length,
    withoutItems: rows.filter((r) => r.items.length === 0).length,
  };

  const filter = filterOpt ?? "all";
  const filtered = rows.filter((row) => {
    switch (filter) {
      case "needs_review":
        return row.response.validity === "valid" && !row.answered && row.items.length > 0;
      case "answered":
        return row.answered;
      case "invalid":
        return row.response.validity === "invalid";
      default:
        return true;
    }
  });

  // Sections and per-instance audiences, so the inbox can offer a section filter
  // and label a shared occurrence honestly ("All sections" vs one of them).
  const sections = sectionIds.length
    ? await db.query.classSections.findMany({
        where: inArray(classSections.id, sectionIds),
        orderBy: asc(classSections.title),
      })
    : [];
  const audiences = await getAudiencesForInstances(db, scopedCycleIds);

  return {
    rows: filtered,
    counts,
    cycles,
    /** occurrences with a human label, for the form/occurrence filter */
    instances: cycles.map((instance) => ({
      instance,
      label: instanceLabel(instance),
      /** how many of THIS actor's sections receive it */
      audienceSize: (audiences.get(instance.id) ?? []).filter((id) =>
        sectionIds.includes(id),
      ).length,
    })),
    /** the actor's own sections, for the section filter */
    sections,
    canSeeIdentities,
  };
}

/**
 * One submission with its answers, for the review detail pane. Staff-only and
 * identity-masked exactly like the queue.
 */
export async function getSubmissionDetail(
  actorUserId: string,
  responseId: string,
) {
  const response = await db.query.formResponses.findFirst({
    where: eq(formResponses.id, responseId),
  });
  if (!response) throw new Error("Response not found");
  const cycle = (await db.query.formInstances.findFirst({
    where: eq(formInstances.id, response.cycleId),
  }))!;
  // Authorized on the RESPONSE's section. With a shared form the instance has
  // several, and standing on one of the others must not open this submission.
  await requireSectionStaff(
    db,
    actorUserId,
    response.sectionId,
    "reviewResponses",
    { allowArchived: true },
  );
  let canSeeIdentities = true;
  try {
    await requireSectionStaff(
      db,
      actorUserId,
      response.sectionId,
      "viewStudentIdentities",
      { allowArchived: true },
    );
  } catch {
    canSeeIdentities = false;
  }

  const answers = await db.query.questionAnswers.findMany({
    where: eq(questionAnswers.responseId, responseId),
  });
  const questions = await db.query.formQuestions.findMany({
    where: eq(formQuestions.cycleId, response.cycleId),
    orderBy: asc(formQuestions.displayOrder),
  });
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const record = canSeeIdentities
    ? await db.query.studentRecords.findFirst({
        where: eq(studentRecords.id, response.studentRecordId),
      })
    : null;

  return {
    // Projected, not the raw row: formResponses carries studentRecordId, which
    // is the identity binding itself. Returning it to a TA without
    // view_student_identities would defeat the masking below.
    response: {
      id: response.id,
      cycleId: response.cycleId,
      sectionId: response.sectionId,
      submittedAt: response.submittedAt,
      state: response.state,
      validity: response.validity,
      invalidationReason: response.invalidationReason,
      invalidationNote: response.invalidationNote,
      studentRecordId: canSeeIdentities ? response.studentRecordId : null,
    },
    cycle,
    instance: cycle,
    instanceLabel: instanceLabel(cycle),
    sequenceLabel: hasSequence(cycle) ? instanceLabel(cycle) : null,
    student: record
      ? { fullName: record.fullName, studentNumber: record.studentNumber }
      : null,
    answers: questions
      .map((q) => {
        const answer = answers.find((a) => a.questionId === q.id);
        return answer
          ? {
              prompt: q.prompt,
              type: q.type,
              value: answer.value,
              freeText: answer.freeText,
            }
          : null;
      })
      .filter((a): a is NonNullable<typeof a> => !!a),
    unansweredCount: questions.filter(
      (q) => !answers.some((a) => a.questionId === q.id),
    ).length,
    questionCount: questionById.size,
  };
}

/** Staff opens/advances review state of a response. */
export async function setResponseReviewState(
  actorUserId: string,
  responseId: string,
  state: "under_review" | "reviewed" | "archived",
) {
  const response = await db.query.formResponses.findFirst({
    where: eq(formResponses.id, responseId),
  });
  if (!response) throw new Error("Response not found");
  await requireSectionStaff(
    db,
    actorUserId,
    response.sectionId,
    "reviewResponses",
  );
  await db.transaction(async (tx) => {
    await tx
      .update(formResponses)
      .set({ state, updatedAt: new Date() })
      .where(eq(formResponses.id, responseId));
    await writeAudit(tx, {
      actorUserId,
      action: "response.review_state_changed",
      entityType: "form_response",
      entityId: responseId,
      before: { state: response.state },
      after: { state },
    });
  });
}

/**
 * Validity now lives in ./validity.ts as a three-state workflow with a
 * flag-versus-finalize split.
 *
 * The old single `setValidity(valid|invalid)` was deleted rather than kept as a
 * wrapper: it gated on the `markValidity` flag alone, so any caller that reached
 * for it would have handed a Student Assistant the power to finalize an
 * invalidation — exactly what project-specs.md §4.2 forbids. Leaving a bypass in
 * place "for convenience" is how that rule gets quietly broken later.
 */
export {
  VALIDITY_TRANSITIONS,
  ValidityConflictError,
  ValidityError,
  confirmFlag,
  flagSubmission,
  getOwnValidity,
  getValidityHistory,
  invalidateSubmission,
  nextValidity,
  rejectFlag,
  restoreSubmission,
} from "./validity";
export type {
  InvalidationReason,
  OwnValidityView,
  ValidityAction,
  ValidityEventView,
  ValidityState,
} from "./validity";

/** Staff corrects the student-chosen type/category/topic. Audited. */
export async function correctItemTypeCategory(
  actorUserId: string,
  itemId: string,
  corrections: {
    submissionType?:
      | "question"
      | "feedback"
      | "concern"
      | "clarification"
      | "suggestion";
    category?: "content" | "logistics" | "misc";
    topicId?: string | null;
  },
) {
  const { item, sectionId } = await getItemWithSection(itemId);
  await requireSectionStaff(db, actorUserId, sectionId, "reviewResponses");

  await db.transaction(async (tx) => {
    await tx
      .update(studentSubmissionItems)
      .set({
        ...(corrections.submissionType
          ? { submissionType: corrections.submissionType }
          : {}),
        ...(corrections.category ? { category: corrections.category } : {}),
        ...(corrections.topicId !== undefined
          ? { topicId: corrections.topicId }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(studentSubmissionItems.id, itemId));
    await writeAudit(tx, {
      actorUserId,
      action: "item.type_category_corrected",
      entityType: "student_submission_item",
      entityId: itemId,
      before: {
        submissionType: item.submissionType,
        category: item.category,
        topicId: item.topicId,
      },
      after: corrections,
    });
  });
}

export async function setItemReviewState(
  actorUserId: string,
  itemId: string,
  state: "under_review" | "resolved" | "archived",
) {
  const { item, sectionId } = await getItemWithSection(itemId);
  await requireSectionStaff(db, actorUserId, sectionId, "reviewResponses");
  await db.transaction(async (tx) => {
    await tx
      .update(studentSubmissionItems)
      .set({ reviewState: state, updatedAt: new Date() })
      .where(eq(studentSubmissionItems.id, itemId));
    await writeAudit(tx, {
      actorUserId,
      action: "item.review_state_changed",
      entityType: "student_submission_item",
      entityId: itemId,
      before: { reviewState: item.reviewState },
      after: { reviewState: state },
    });
  });
}

/**
 * Private response — visible only to the asking student and staff. Updates
 * the item's disposition (undecided/public → private/private_and_public).
 */
export async function createPrivateResponse(
  actorUserId: string,
  itemId: string,
  body: string,
) {
  if (!body.trim()) throw new Error("Response body is required");
  const { item, sectionId } = await getItemWithSection(itemId);
  await requireSectionStaff(db, actorUserId, sectionId, "sendPrivateResponses");

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(privateResponses)
      .values({ itemId, authorUserId: actorUserId, body })
      .returning();
    const nextDisposition =
      item.disposition === "public" || item.disposition === "private_and_public"
        ? "private_and_public"
        : item.disposition === "merged"
          ? "merged"
          : "private";
    await tx
      .update(studentSubmissionItems)
      .set({
        disposition: nextDisposition,
        reviewState:
          item.reviewState === "new" ? "under_review" : item.reviewState,
        updatedAt: new Date(),
      })
      .where(eq(studentSubmissionItems.id, itemId));
    await writeAudit(tx, {
      actorUserId,
      action: "private_response.created",
      entityType: "private_response",
      entityId: created!.id,
      after: { itemId },
    });
    return created!;
  });
}
