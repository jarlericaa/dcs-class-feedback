import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  formResponses,
  privateResponses,
  studentSubmissionItems,
  weeklyCycles,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { requireSectionStaff } from "@/modules/authz";

/**
 * Teacher review services (AGENTS.md §6.3, domain-model.md §3.2–3.5).
 * Review state, validity, and disposition are independent dimensions.
 * Everything staff-changing here is audited; nothing here is ever surfaced
 * to students directly (student projections live in publishing/history).
 */

async function getItemWithSection(itemId: string) {
  const item = await db.query.studentSubmissionItems.findFirst({
    where: eq(studentSubmissionItems.id, itemId),
  });
  if (!item) throw new Error("Submission item not found");
  const response = (await db.query.formResponses.findFirst({
    where: eq(formResponses.id, item.responseId),
  }))!;
  const cycle = (await db.query.weeklyCycles.findFirst({
    where: eq(weeklyCycles.id, response.cycleId),
  }))!;
  return { item, response, sectionId: cycle.sectionId };
}

export { getItemWithSection };

/**
 * Submissions for a section (optionally one cycle), for the review dashboard.
 * Identity is masked unless the actor holds viewStudentIdentities (teachers
 * and co-teachers always do; TAs only via the flag).
 */
export async function listSubmissionsForSection(
  actorUserId: string,
  sectionId: string,
  opts: { cycleId?: string } = {},
) {
  await requireSectionStaff(db, actorUserId, sectionId, "reviewResponses");
  let canSeeIdentities = true;
  try {
    await requireSectionStaff(db, actorUserId, sectionId, "viewStudentIdentities");
  } catch {
    canSeeIdentities = false;
  }

  const cycles = await db.query.weeklyCycles.findMany({
    where: opts.cycleId
      ? and(eq(weeklyCycles.sectionId, sectionId), eq(weeklyCycles.id, opts.cycleId))
      : eq(weeklyCycles.sectionId, sectionId),
    orderBy: asc(weeklyCycles.cycleIndex),
  });
  if (cycles.length === 0) return [];
  const responses = await db.query.formResponses.findMany({
    where: inArray(
      formResponses.cycleId,
      cycles.map((c) => c.id),
    ),
    with: { },
  });
  const items = responses.length
    ? await db.query.studentSubmissionItems.findMany({
        where: inArray(
          studentSubmissionItems.responseId,
          responses.map((r) => r.id),
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
  const cycle = (await db.query.weeklyCycles.findFirst({
    where: eq(weeklyCycles.id, response.cycleId),
  }))!;
  await requireSectionStaff(db, actorUserId, cycle.sectionId, "reviewResponses");
  await db
    .update(formResponses)
    .set({ state, updatedAt: new Date() })
    .where(eq(formResponses.id, responseId));
}

/**
 * Participation validity (participation-rules.md §2). Invalidating REQUIRES a
 * reason (staff-only; never shown to students). Always audited before/after.
 */
export async function setValidity(
  actorUserId: string,
  responseId: string,
  validity: "valid" | "invalid",
  reason?:
    | "spam"
    | "abusive_content"
    | "empty_or_meaningless"
    | "irrelevant"
    | "bad_faith_credit_attempt",
  note?: string,
) {
  const response = await db.query.formResponses.findFirst({
    where: eq(formResponses.id, responseId),
  });
  if (!response) throw new Error("Response not found");
  const cycle = (await db.query.weeklyCycles.findFirst({
    where: eq(weeklyCycles.id, response.cycleId),
  }))!;
  await requireSectionStaff(db, actorUserId, cycle.sectionId, "markValidity");
  if (validity === "invalid" && !reason) {
    throw new Error("An invalidation reason is required");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(formResponses)
      .set({
        validity,
        invalidationReason: validity === "invalid" ? reason : null,
        invalidationNote: validity === "invalid" ? (note ?? null) : null,
        updatedAt: new Date(),
      })
      .where(eq(formResponses.id, responseId));
    await writeAudit(tx, {
      actorUserId,
      action: "response.validity_changed",
      entityType: "form_response",
      entityId: responseId,
      before: {
        validity: response.validity,
        invalidationReason: response.invalidationReason,
      },
      after: { validity, invalidationReason: reason ?? null },
    });
  });
}

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
  const { sectionId } = await getItemWithSection(itemId);
  await requireSectionStaff(db, actorUserId, sectionId, "reviewResponses");
  await db
    .update(studentSubmissionItems)
    .set({ reviewState: state, updatedAt: new Date() })
    .where(eq(studentSubmissionItems.id, itemId));
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
