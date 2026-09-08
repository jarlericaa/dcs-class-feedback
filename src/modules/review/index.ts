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
  users,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import {
  requireCourseStaffOrSectionGrant,
  requireSectionStaff,
} from "@/modules/authz";
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
 * Per-reader read state, so a reader can resume where they left off
 * (GitHub issue #6). Kept in its own module because it is about the READER,
 * not about the submission.
 */
export {
  countUnread,
  listReadResponseIds,
  markResponseRead,
  markResponsesRead,
  markResponseUnread,
  MAX_MARK_READ_IDS,
  type ReadSource,
} from "./reads";

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
    // Course staff, OR anyone holding `review_responses` on at least one
    // section of the course. The narrower `requireCourseStaff` locked a
    // section-scoped assistant out of the only inbox that exists — the queue is
    // per-course because a shared form has ONE queue, so gating it on
    // course-level standing made the advertised permission unusable.
    //
    // This admits nothing extra: filterAuthorizedSections below still reduces
    // the scope to the sections this actor may actually read, so a section
    // assistant sees exactly their own rows.
    await requireCourseStaffOrSectionGrant(
      db,
      actorUserId,
      target.courseId,
      "reviewResponses",
      { allowArchived: true },
    );
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
  // NB: a requested instance narrows the ROWS, not the scope. The feed reads one
  // week at a time but still has to offer every other week in its switcher, and
  // narrowing here would hide them.

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
  return { instanceIds: [...instanceIdSet], sectionIds, canSeeIdentities };
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
    { instanceId: opts.instanceId },
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
    { instanceId: opts.cycleId },
  );
}

async function reviewQueue(
  actorUserId: string,
  scope: ReviewScope,
  filterOpt?: ReviewFilter,
  opts: { instanceId?: string } = {},
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

  /**
   * How many submissions each occurrence holds, over the WHOLE scope.
   *
   * Two columns, no joins: the week switcher has to say "Week 3 · 22" for every
   * week while the feed itself loads only one, and re-reading every week's items
   * to find that out would cost the whole term on every page view.
   */
  const scopedKeys =
    scopedCycleIds.length > 0 && sectionIds.length > 0
      ? await db
          .select({
            id: formResponses.id,
            cycleId: formResponses.cycleId,
          })
          .from(formResponses)
          .where(
            and(
              inArray(formResponses.cycleId, scopedCycleIds),
              inArray(formResponses.sectionId, sectionIds),
              inArray(formResponses.lifecycle, ["submitted", "locked"]),
            ),
          )
      : [];
  const countByCycle = new Map<string, number>();
  for (const key of scopedKeys) {
    countByCycle.set(key.cycleId, (countByCycle.get(key.cycleId) ?? 0) + 1);
  }

  // The rows themselves are the requested occurrence only, when one was asked
  // for. Everything below — items, threads, answers — is joined off these.
  const readCycleIds = opts.instanceId
    ? scopedCycleIds.filter((id) => id === opts.instanceId)
    : scopedCycleIds;

  const responses =
    readCycleIds.length > 0 && sectionIds.length > 0
      ? await db.query.formResponses.findMany({
          where: and(
            inArray(formResponses.cycleId, readCycleIds),
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

  /**
   * The form answers, in bulk.
   *
   * The feed shows every response in one column, so fetching a response's
   * answers when it is opened would be one query per row. Two queries for the
   * whole week instead, joined in memory below.
   */
  const formAnswers = responses.length
    ? await db.query.questionAnswers.findMany({
        where: inArray(
          questionAnswers.responseId,
          responses.map((r) => r.id),
        ),
      })
    : [];
  const cycleQuestions = readCycleIds.length
    ? await db.query.formQuestions.findMany({
        where: inArray(formQuestions.cycleId, readCycleIds),
        orderBy: asc(formQuestions.displayOrder),
      })
    : [];

  /**
   * Who wrote each reply and each public answer.
   *
   * A thread is a conversation, not a broadcast: `privateMessageRole` allows a
   * student follow-up in the same list, and staff colleagues answer each
   * other's students. Rendering it without names would let a reader mistake a
   * classmate's follow-up for a colleague's answer, and leaves "who already
   * dealt with this" unanswerable in a shared course.
   *
   * A student's own history still attributes a PRIVATE reply to "your teaching
   * team" rather than to a person — see the history page. The one place a staff
   * name reaches a student is the byline of a PUBLISHED public answer, which
   * the owner asked for in issue #14: a public statement to the whole class is
   * signed. Nothing else here is student-facing.
   */
  const authorIds = [
    ...new Set([
      ...privates.map((p) => p.authorUserId),
      ...answers.map((a) => a.createdByUserId),
    ]),
  ].filter((id): id is string => !!id);
  const authorById = new Map(
    (authorIds.length
      ? await db.query.users.findMany({ where: inArray(users.id, authorIds) })
      : []
    ).map((u) => [u.id, u.displayName]),
  );

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
        const itemPrivates = privates
          .filter((p) => p.itemId === item.id)
          .map((message) => ({
            ...message,
            /**
             * The student's follow-up is attributed to the student, and only
             * when this reader may see identities — the same masking the row
             * itself gets. Never their account name: the roster name is the one
             * staff already know them by.
             */
            authorName:
              message.authorRole === "student"
                ? (record?.fullName ?? null)
                : (authorById.get(message.authorUserId) ?? null),
          }));
        const itemAnswers = itemLinks
          .map((l) => answerById.get(l.publicAnswerId))
          .filter((a): a is NonNullable<typeof a> => !!a)
          .map((answer) => ({
            ...answer,
            authorName: answer.createdByUserId
              ? (authorById.get(answer.createdByUserId) ?? null)
              : null,
          }));
        return {
          item,
          privateResponses: itemPrivates,
          publicAnswers: itemAnswers,
          /**
           * Nothing more is owed on this item: it was replied to, published,
           * or staff decided not to answer it. A general comment is settled the
           * moment it arrives — it is never triaged.
           */
          settled:
            item.kind === "general_comment" ||
            itemPrivates.length > 0 ||
            itemAnswers.some((a) => a.state === "published") ||
            item.disposition === "no_response" ||
            item.reviewState === "resolved",
        };
      });
    const answered = responseItems.some(
      (i) =>
        i.privateResponses.length > 0 ||
        i.publicAnswers.some((a) => a.state === "published"),
    );
    /** Still owed something: a real question nobody has settled. */
    const outstanding = responseItems.some(
      (i) => i.item.kind !== "general_comment" && !i.settled,
    );
    const instance = cycleById.get(response.cycleId) ?? null;
    /**
     * The occurrence's OWN question snapshot, in its authored order.
     *
     * `cycleQuestions` was read `orderBy displayOrder` and is filtered to this
     * response's own occurrence, so a per-occurrence customization shows the
     * questions that occurrence actually asked — never the base form's, and
     * never another week's.
     */
    const asked = cycleQuestions.filter((q) => q.cycleId === response.cycleId);
    const given = formAnswers.filter((a) => a.responseId === response.id);
    /**
     * One row per question ASKED, answered or not.
     *
     * Unanswered rows used to be dropped here, which made a question the
     * student skipped indistinguishable from one the form never asked. Only
     * optional questions can be in that state — the server refuses a
     * submission missing a required answer — but "they left it blank" is a
     * fact a reader is entitled to, and a count alone could not say which one.
     */
    const answerRows = asked.map((question) => {
      const answer = given.find((a) => a.questionId === question.id);
      return {
        questionId: question.id,
        prompt: question.prompt,
        /** staff-authored help text, rich like the prompt */
        description: question.description,
        type: question.type,
        required: question.required,
        displayOrder: question.displayOrder,
        scale: question.scale,
        answered: !!answer,
        value: answer?.value ?? null,
        freeText: answer?.freeText ?? null,
      };
    });
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
      outstanding,
      /**
       * The teacher's own form questions and this student's answers to them,
       * in the order the form asks them. Every asked question is present.
       */
      answers: answerRows,
      /** asked and left blank — necessarily an optional question */
      unansweredCount: answerRows.filter((a) => !a.answered).length,
      answered,
    };
  });

  const counts = {
    total: rows.length,
    // Only work somebody can actually clear. A general comment is never
    // triaged, and a question staff have declined to answer is settled — both
    // would otherwise put a number on the queue that no action ever removes.
    needsReview: rows.filter(
      (r) => r.response.validity === "valid" && r.outstanding,
    ).length,
    answered: rows.filter((r) => r.answered).length,
    invalid: rows.filter((r) => r.response.validity === "invalid").length,
    withoutItems: rows.filter((r) => r.items.length === 0).length,
  };

  const filter = filterOpt ?? "all";
  const filtered = rows.filter((row) => {
    switch (filter) {
      case "needs_review":
        return row.response.validity === "valid" && row.outstanding;
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
      /** submissions in this occurrence, across the actor's sections */
      responseCount: countByCycle.get(instance.id) ?? 0,
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
      sectionId: response.sectionId,
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
      sectionId,
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
      sectionId,
      entityType: "student_submission_item",
      entityId: itemId,
      before: { reviewState: item.reviewState },
      after: { reviewState: state },
    });
  });
}

/**
 * Staff decide this item will not be answered (domain-model.md §3.5).
 *
 * This is a REVIEW decision, not a message. The student is never told that a
 * decision was made: §3.5 is explicit that `No response` and `Undecided` never
 * surface, so their view stays "Submitted". Nothing is deleted, the original
 * wording is untouched, and the decision is audited and reversible — which is
 * why it is offered without a confirmation step.
 *
 * A general comment is refused: it is never triaged, so there is no answer to
 * decline. Deciding requires `reviewResponses`, the same standing as reading
 * the queue, because choosing not to answer is part of working through it.
 */
export async function declineToAnswer(
  actorUserId: string,
  itemId: string,
  opts: { undo?: boolean } = {},
) {
  const { item, sectionId } = await getItemWithSection(itemId);
  await requireSectionStaff(db, actorUserId, sectionId, "reviewResponses");
  if (item.kind === "general_comment") {
    throw new Error("A general comment is never triaged");
  }
  // Never overwrite a real outcome: an item that already carries a reply or a
  // published answer is answered, and "no response" would misdescribe it.
  if (
    item.disposition !== "undecided" &&
    item.disposition !== "no_response"
  ) {
    throw new Error("This question has already been answered");
  }

  const disposition = opts.undo ? "undecided" : "no_response";
  const reviewState = opts.undo ? "new" : "resolved";
  return db.transaction(async (tx) => {
    await tx
      .update(studentSubmissionItems)
      .set({ disposition, reviewState, updatedAt: new Date() })
      .where(eq(studentSubmissionItems.id, itemId));
    await writeAudit(tx, {
      actorUserId,
      action: opts.undo ? "item.answer_declined_undone" : "item.answer_declined",
      sectionId,
      entityType: "student_submission_item",
      entityId: itemId,
      before: { disposition: item.disposition, reviewState: item.reviewState },
      after: { disposition, reviewState },
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
      sectionId,
    });
    return created!;
  });
}
