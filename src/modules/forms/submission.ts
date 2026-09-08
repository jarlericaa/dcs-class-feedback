import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/db";
import {
  classSections,
  formInstanceSections,
  formInstances,
  formQuestions,
  formResponseRevisions,
  formResponses,
  lessonsTopics,
  formTemplates,
  privateResponses,
  questionAnswers,
  sourceLinks,
  studentSubmissionItems,
  templateVersions,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { requireEnrolledStudent, requireSectionStaff } from "@/modules/authz";
import { requireAudienceStudent } from "./audience";
import { hasSequence, instanceLabel } from "./instances";
import { DEFAULT_STUDENT_SECTION } from "./templates";
import { answerInputSchema, validateAnswers } from "./questions";

/**
 * Submission lifecycle (docs/product/specification.md §6.3, docs/domain/domain-model.md §3.1a):
 *
 *   draft → submitted → (edited any number of times) → locked at the deadline
 *
 * Design decisions worth knowing before changing anything here:
 *
 * - **One row, three phases.** An `(instance, student)` pair has at most one
 *   `form_responses` row, enforced by a unique index. The draft, the submission
 *   and the locked version are the same row in different states, which is what
 *   makes "one response per form instance" and "editing cannot mint a second
 *   credit" structural rather than something this service has to remember.
 * - **A shared form cannot be answered twice.** The uniqueness key is
 *   (instance, studentRecord) and deliberately does NOT include the section, so a
 *   student enrolled in two targeted sections still has exactly one response. The
 *   section they are attributed to is resolved once, on the first save, and
 *   recorded on the row.
 * - **`submittedAt` is written once.** Participation is anchored to it, so an
 *   edit bumps `revision`/`lastEditedAt` and never looks like a new submission.
 * - **Original wording is immutable.** Editing an item withdraws the old row and
 *   inserts a new one; an item staff have already acted on cannot be replaced at
 *   all, and the student is told which one.
 * - **Two locks, on purpose.** `FOR SHARE` on the cycle row interlocks with
 *   `closeDueCycles` (which locks responses inside the same transaction as
 *   open→closed), and `FOR UPDATE` on the response row serializes two tabs.
 *   `expectedRevision` catches a stale form posted from a third.
 */

export class SubmissionError extends Error {
  constructor(
    message: string,
    readonly details: { questionId: string | null; message: string }[] = [],
  ) {
    super(message);
    this.name = "SubmissionError";
  }
}

/** A newer revision exists — the client's form was stale. */
export class ResponseConflictError extends SubmissionError {
  constructor(
    message = "This form was changed in another tab. Reload to see the latest version before editing again.",
  ) {
    super(message);
    this.name = "ResponseConflictError";
  }
}

/** The deadline passed, or the cycle is not open. */
export class ResponseLockedError extends SubmissionError {
  constructor(message: string) {
    super(message);
    this.name = "ResponseLockedError";
  }
}

export const studentItemInputSchema = z.object({
  /** Stable per rendered block, so an edit can target an existing item. */
  clientKey: z.string().min(1).max(80),
  itemId: z.string().uuid().optional(),
  kind: z.enum(["question", "general_comment"]).default("question"),
  submissionType: z
    .enum(["question", "feedback", "concern", "clarification", "suggestion"])
    .default("question"),
  category: z.enum(["content", "logistics", "misc"]).default("misc"),
  topicId: z.string().uuid().optional(),
  text: z.string().max(10_000),
});
export type StudentItemInput = z.infer<typeof studentItemInputSchema>;

/**
 * The pre-repeatable-questions shape: exactly one student item per response.
 *
 * Still accepted and normalized into `items`, so existing callers (and any
 * bookmarked form post) keep working after the form gained multiple question
 * blocks. New callers should send `items`.
 */
const legacySingleItemSchema = z.object({
  submissionType: z
    .enum(["question", "feedback", "concern", "clarification", "suggestion"])
    .default("question"),
  category: z.enum(["content", "logistics", "misc"]).default("misc"),
  topicId: z.string().uuid().optional(),
  text: z.string().min(1).max(10_000),
});

export const submissionInputSchema = z
  .object({
    answers: z.array(answerInputSchema),
    items: z.array(studentItemInputSchema).max(20).default([]),
    studentItem: legacySingleItemSchema.optional(),
    expectedRevision: z.number().int().min(0).optional(),
  })
  .transform((input) => {
    if (!input.studentItem) return input;
    return {
      ...input,
      items: [
        ...input.items,
        {
          clientKey: "legacy-single-item",
          kind: "question" as const,
          submissionType: input.studentItem.submissionType,
          category: input.studentItem.category,
          topicId: input.studentItem.topicId,
          text: input.studentItem.text,
        },
      ],
    };
  });
export type SubmissionInput = z.infer<typeof submissionInputSchema>;

type Phase = "draft" | "submit" | "edit";

function parseInput(rawInput: unknown): SubmissionInput {
  // Shape errors must reach the student as a recoverable field error, not as a
  // raw ZodError escaping to the error boundary — over-long text or a tampered
  // enum would otherwise crash the page and lose everything they typed.
  const parsed = submissionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new SubmissionError(
      "Some of your answers could not be accepted",
      parsed.error.issues.map((issue) => ({
        questionId: issue.path.includes("items") ? "item" : null,
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

const FALLBACK_CONFIG = {
  ...DEFAULT_STUDENT_SECTION,
  studentQuestionPrompt: null as string | null,
  generalCommentPrompt: null as string | null,
};

/**
 * The student-section configuration in force for a cycle.
 *
 * Read from the instance's snapshotted definition version, so changing a form
 * later cannot alter an occurrence that already collected answers. An instance
 * with no version predates the configuration and falls back to the documented
 * defaults rather than hiding the student block entirely.
 */
export async function getStudentSectionConfig(dbx: DbOrTx, cycleId: string) {
  const cycle = await dbx.query.formInstances.findFirst({
    where: eq(formInstances.id, cycleId),
  });
  if (!cycle?.templateVersionId) return FALLBACK_CONFIG;
  const version = await dbx.query.templateVersions.findFirst({
    where: eq(templateVersions.id, cycle.templateVersionId),
  });
  if (!version) return FALLBACK_CONFIG;
  return {
    maxStudentQuestions: version.maxStudentQuestions,
    studentQuestionPrompt: version.studentQuestionPrompt,
    generalCommentEnabled: version.generalCommentEnabled,
    generalCommentPrompt: version.generalCommentPrompt,
    generalCommentRequired: version.generalCommentRequired,
  };
}

function validateItems(
  items: StudentItemInput[],
  config: {
    maxStudentQuestions: number;
    generalCommentEnabled: boolean;
    generalCommentRequired: boolean;
  },
  phase: Phase,
) {
  const nonEmpty = items.filter((item) => item.text.trim().length > 0);
  const questions = nonEmpty.filter((item) => item.kind === "question");
  const comments = nonEmpty.filter((item) => item.kind === "general_comment");

  // Enforced server-side regardless of what the client rendered or posted.
  if (questions.length > config.maxStudentQuestions) {
    throw new SubmissionError(
      `This form accepts at most ${config.maxStudentQuestions} question${
        config.maxStudentQuestions === 1 ? "" : "s"
      }.`,
      [{ questionId: "item", message: "Too many questions." }],
    );
  }
  if (comments.length > 1) {
    throw new SubmissionError("Only one general comment is allowed.", [
      { questionId: "item", message: "Only one general comment is allowed." },
    ]);
  }
  if (!config.generalCommentEnabled && comments.length > 0) {
    throw new SubmissionError("This form does not have a general comment.", [
      { questionId: "item", message: "Not accepted on this form." },
    ]);
  }
  // A draft is work in progress: required fields are only enforced on submit.
  if (
    phase !== "draft" &&
    config.generalCommentEnabled &&
    config.generalCommentRequired &&
    comments.length === 0
  ) {
    throw new SubmissionError("The general comment is required on this form.", [
      { questionId: "generalComment", message: "Please fill this in." },
    ]);
  }
  return { questions, comments };
}

async function snapshot(dbx: DbOrTx, responseId: string) {
  const answers = await dbx.query.questionAnswers.findMany({
    where: eq(questionAnswers.responseId, responseId),
  });
  const items = await dbx.query.studentSubmissionItems.findMany({
    where: and(
      eq(studentSubmissionItems.responseId, responseId),
      isNull(studentSubmissionItems.withdrawnAt),
    ),
    orderBy: asc(studentSubmissionItems.ordinal),
  });
  return {
    answers: answers.map((a) => ({
      questionId: a.questionId,
      value: a.value,
      freeText: a.freeText,
    })),
    items: items.map((i) => ({
      id: i.id,
      kind: i.kind,
      ordinal: i.ordinal,
      submissionType: i.submissionType,
      category: i.category,
      text: i.originalText,
    })),
  };
}

/**
 * True when staff have already acted on an item, which makes it un-replaceable:
 * a private reply, a source link, or any review progress means the original
 * wording is now part of a record someone else is working from.
 */
async function itemIsTouched(
  dbx: DbOrTx,
  item: typeof studentSubmissionItems.$inferSelect,
) {
  if (item.reviewState !== "new" || item.disposition !== "undecided") return true;
  const reply = await dbx.query.privateResponses.findFirst({
    where: eq(privateResponses.itemId, item.id),
  });
  if (reply) return true;
  const link = await dbx.query.sourceLinks.findFirst({
    where: eq(sourceLinks.itemId, item.id),
  });
  return !!link;
}

async function writeItems(
  dbx: DbOrTx,
  responseId: string,
  input: { questions: StudentItemInput[]; comments: StudentItemInput[] },
  actorUserId: string,
  scope: { sectionId: string; courseId: string },
): Promise<{
  rejectedItemIds: string[];
  itemIdMappings: { clientKey: string; itemId: string }[];
}> {
  const existing = await dbx.query.studentSubmissionItems.findMany({
    where: and(
      eq(studentSubmissionItems.responseId, responseId),
      isNull(studentSubmissionItems.withdrawnAt),
    ),
    orderBy: asc(studentSubmissionItems.ordinal),
  });
  const byId = new Map(existing.map((row) => [row.id, row]));
  const rejectedItemIds: string[] = [];
  const itemIdMappings: { clientKey: string; itemId: string }[] = [];
  const keep = new Set<string>();
  const now = new Date();

  const desired = [
    ...input.questions.map((item, index) => ({
      ...item,
      kind: "question" as const,
      ordinal: index,
    })),
    ...input.comments.map((item) => ({
      ...item,
      kind: "general_comment" as const,
      ordinal: 0,
    })),
  ];

  for (const item of desired) {
    const text = item.text.trim();
    const current = item.itemId ? byId.get(item.itemId) : undefined;
    if (current) {
      if (current.originalText === text) {
        // Unchanged text: only reposition. `originalText` is never updated.
        if (current.ordinal !== item.ordinal) {
          await dbx
            .update(studentSubmissionItems)
            .set({ ordinal: item.ordinal, updatedAt: now })
            .where(eq(studentSubmissionItems.id, current.id));
        }
        itemIdMappings.push({ clientKey: item.clientKey, itemId: current.id });
        keep.add(current.id);
        continue;
      }
      if (await itemIsTouched(dbx, current)) {
        // Refuse this one change and keep the original, rather than failing the
        // whole save. The caller tells the student which item was refused.
        rejectedItemIds.push(current.id);
        itemIdMappings.push({ clientKey: item.clientKey, itemId: current.id });
        keep.add(current.id);
        continue;
      }
      // Withdraw + supersede: the original row and its wording survive.
      const [replacement] = await dbx
        .insert(studentSubmissionItems)
        .values({
          responseId,
          kind: item.kind,
          ordinal: item.ordinal,
          submissionType: item.submissionType,
          category: item.category,
          topicId: item.topicId,
          originalText: text,
        })
        .returning();
      await dbx
        .update(studentSubmissionItems)
        .set({
          withdrawnAt: now,
          supersededByItemId: replacement!.id,
          updatedAt: now,
        })
        .where(eq(studentSubmissionItems.id, current.id));
      itemIdMappings.push({
        clientKey: item.clientKey,
        itemId: replacement!.id,
      });
      await writeAudit(dbx, {
        actorUserId,
        action: "response.item_withdrawn",
        entityType: "student_submission_item",
        entityId: current.id,
        // Lengths only: the wording is the student's, and staff have properly
        // scoped ways to read it. An audit row is not one of them.
        metadata: {
          replacedByItemId: replacement!.id,
          priorLength: current.originalText.length,
          newLength: text.length,
        },
        sectionId: scope.sectionId,
        courseId: scope.courseId,
      });
      keep.add(replacement!.id);
      continue;
    }
    const [inserted] = await dbx
      .insert(studentSubmissionItems)
      .values({
        responseId,
        kind: item.kind,
        ordinal: item.ordinal,
        submissionType: item.submissionType,
        category: item.category,
        topicId: item.topicId,
        originalText: text,
      })
      .returning();
    itemIdMappings.push({ clientKey: item.clientKey, itemId: inserted!.id });
    keep.add(inserted!.id);
  }

  // Anything the student removed is withdrawn, unless staff already acted on it.
  for (const row of existing) {
    if (keep.has(row.id)) continue;
    if (await itemIsTouched(dbx, row)) {
      rejectedItemIds.push(row.id);
      continue;
    }
    await dbx
      .update(studentSubmissionItems)
      .set({ withdrawnAt: now, updatedAt: now })
      .where(eq(studentSubmissionItems.id, row.id));
    await writeAudit(dbx, {
      actorUserId,
      action: "response.item_withdrawn",
      entityType: "student_submission_item",
      entityId: row.id,
      metadata: {
        priorLength: row.originalText.length,
        removed: true,
      },
      sectionId: scope.sectionId,
      courseId: scope.courseId,
    });
  }

  return { rejectedItemIds, itemIdMappings };
}

function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  while (e instanceof Error) {
    if ((e as { code?: string }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

async function saveResponse(
  userId: string,
  cycleId: string,
  rawInput: unknown,
  requestedPhase: Phase,
  now: Date,
) {
  if (!z.string().uuid().safeParse(cycleId).success) {
    throw new SubmissionError("Form not found");
  }
  const input = parseInput(rawInput);

  const cyclePeek = await db.query.formInstances.findFirst({
    where: eq(formInstances.id, cycleId),
  });
  if (!cyclePeek) throw new SubmissionError("Form not found");

  /**
   * Authorization: a confirmed match plus an active enrolment in at least one of
   * this instance's AUDIENCE sections — never the instance's legacy anchor
   * column. `attributedSectionId` is the section this response belongs to for
   * review, participation, publication, and history.
   */
  const { studentRecordId, sectionId: attributedSectionId } =
    await requireAudienceStudent(db, userId, cycleId);

  const config = await getStudentSectionConfig(db, cycleId);
  const questions = await db.query.formQuestions.findMany({
    where: eq(formQuestions.cycleId, cycleId),
    orderBy: asc(formQuestions.displayOrder),
  });

  // A draft is not validated against required questions — that is the point of a
  // draft. Submitting and editing are.
  const fullValidation = validateAnswers(questions, input.answers);
  if (requestedPhase !== "draft" && !fullValidation.ok) {
    throw new SubmissionError("Validation failed", fullValidation.errors);
  }
  const normalized = fullValidation.normalized;

  const items = validateItems(input.items, config, requestedPhase);

  return db.transaction(async (tx) => {
    // Interlock with closeDueCycles: it takes a row lock on this cycle inside the
    // same transaction that locks responses, so a submit either commits before
    // the close or observes the closed state here.
    const [cycle] = await tx
      .select()
      .from(formInstances)
      .where(eq(formInstances.id, cycleId))
      .for("share")
      .limit(1);
    if (!cycle) throw new SubmissionError("Form not found");
    if (cycle.state !== "open") {
      throw new ResponseLockedError("This form is not open.");
    }
    if (now.getTime() < cycle.openAt.getTime()) {
      throw new ResponseLockedError("This form is not open yet.");
    }
    if (now.getTime() >= cycle.deadlineAt.getTime()) {
      throw new ResponseLockedError(
        "The deadline for this form has passed. No late submissions or edits are accepted.",
      );
    }

    // Serialize two tabs writing the same response.
    const [existing] = await tx
      .select()
      .from(formResponses)
      .where(
        and(
          eq(formResponses.cycleId, cycleId),
          eq(formResponses.studentRecordId, studentRecordId),
        ),
      )
      .for("update")
      .limit(1);

    if (existing?.lifecycle === "locked") {
      throw new ResponseLockedError(
        "This response is locked because the deadline has passed.",
      );
    }
    if (
      existing &&
      input.expectedRevision !== undefined &&
      input.expectedRevision !== existing.revision
    ) {
      throw new ResponseConflictError();
    }

    let phase = requestedPhase;
    if (phase === "submit" && existing?.submittedAt) {
      // A second submit is an edit, not a duplicate — so a double-clicked submit
      // button is harmless rather than an error.
      phase = "edit";
    }
    if (phase === "edit" && !existing) {
      throw new SubmissionError("There is nothing submitted to edit yet.");
    }

    const before = existing ? await snapshot(tx, existing.id) : null;
    const wasSubmitted = !!existing?.submittedAt;

    let responseId: string;
    if (!existing) {
      try {
        const [created] = await tx
          .insert(formResponses)
          .values({
            cycleId,
            studentRecordId,
            sectionId: attributedSectionId,
            lifecycle: phase === "draft" ? "draft" : "submitted",
            submittedAt: phase === "draft" ? null : now,
            revision: 1,
            state: "submitted",
            validity: "valid",
          })
          .returning();
        responseId = created!.id;
      } catch (err) {
        // unique (cycleId, studentRecordId) violation → another request won the
        // race between the SELECT above and this INSERT. The section is NOT in
        // that key, so a student in two targeted sections lands here too — which
        // is exactly the duplicate this guard is meant to refuse.
        if (isUniqueViolation(err)) throw new ResponseConflictError();
        throw err;
      }
    } else {
      responseId = existing.id;
      const becomesSubmitted = phase !== "draft" && !wasSubmitted;
      await tx
        .update(formResponses)
        .set({
          lifecycle: phase === "draft" ? "draft" : "submitted",
          // Written once, on the FIRST submit, and never rewritten.
          submittedAt: becomesSubmitted ? now : existing.submittedAt,
          lastEditedAt: phase === "draft" ? existing.lastEditedAt : now,
          revision: sql`${formResponses.revision} + 1`,
          updatedAt: now,
        })
        .where(eq(formResponses.id, existing.id));
    }

    // Answers upsert per question, so an edit replaces rather than accumulating
    // a second answer to the same prompt.
    for (const answer of normalized) {
      await tx
        .insert(questionAnswers)
        .values({
          responseId,
          questionId: answer.questionId,
          value: answer.value,
          freeText: answer.freeText,
        })
        .onConflictDoUpdate({
          target: [questionAnswers.responseId, questionAnswers.questionId],
          set: {
            value: answer.value,
            freeText: answer.freeText,
            updatedAt: now,
          },
        });
    }
    // An answer the student cleared is removed, not left stale.
    const answeredIds = normalized.map((a) => a.questionId);
    await tx
      .delete(questionAnswers)
      .where(
        answeredIds.length > 0
          ? and(
              eq(questionAnswers.responseId, responseId),
              notInArray(questionAnswers.questionId, answeredIds),
            )
          : eq(questionAnswers.responseId, responseId),
      );

    // The first save fixes the response's section attribution. A later roster
    // move must not make edits appear in a different section's audit history.
    const responseSectionId = existing?.sectionId ?? attributedSectionId;
    const { rejectedItemIds, itemIdMappings } = await writeItems(
      tx,
      responseId,
      items,
      userId,
      { sectionId: responseSectionId, courseId: cycle.courseId },
    );

    const [updated] = await tx
      .select()
      .from(formResponses)
      .where(eq(formResponses.id, responseId))
      .limit(1);
    const after = await snapshot(tx, responseId);

    const action =
      phase === "draft" ? "draft_saved" : wasSubmitted ? "edited" : "submitted";

    await tx.insert(formResponseRevisions).values({
      responseId,
      revision: updated!.revision,
      action,
      actorUserId: userId,
      before,
      after,
    });

    await writeAudit(tx, {
      actorUserId: userId,
      action:
        action === "draft_saved"
          ? "response.draft_saved"
          : action === "edited"
            ? "response.edited"
            : "response.submitted",
      entityType: "form_response",
      entityId: responseId,
      after: {
        cycleId,
        revision: updated!.revision,
        answerCount: normalized.length,
        questionItems: items.questions.length,
        hasGeneralComment: items.comments.length > 0,
      },
      sectionId: responseSectionId,
      courseId: cycle.courseId,
    });

    const liveItems = await tx.query.studentSubmissionItems.findMany({
      where: and(
        eq(studentSubmissionItems.responseId, responseId),
        isNull(studentSubmissionItems.withdrawnAt),
      ),
      orderBy: asc(studentSubmissionItems.ordinal),
    });
    const questionItemIds = liveItems
      .filter((item) => item.kind === "question")
      .map((item) => item.id);

    return {
      responseId,
      revision: updated!.revision,
      firstSubmission: phase !== "draft" && !wasSubmitted,
      rejectedItemIds,
      /** Canonical live-row ids for the client blocks that were written. */
      itemIdMappings,
      /** Every live question item, in form order. */
      studentItemIds: questionItemIds,
      /** The first question item, for callers that only ever create one. */
      studentItemId: questionItemIds[0] ?? null,
      generalCommentId:
        liveItems.find((item) => item.kind === "general_comment")?.id ?? null,
    };
  });
}

/** Save work in progress. Required questions are not enforced yet. */
export function saveDraft(
  userId: string,
  cycleId: string,
  rawInput: unknown,
  now: Date = new Date(),
) {
  return saveResponse(userId, cycleId, rawInput, "draft", now);
}

/** Submit for the first time (or promote a draft). Fully validated. */
export function submitResponse(
  userId: string,
  cycleId: string,
  rawInput: unknown,
  now: Date = new Date(),
) {
  return saveResponse(userId, cycleId, rawInput, "submit", now);
}

/** Edit an already-submitted response, allowed until the deadline. */
export function editSubmittedResponse(
  userId: string,
  cycleId: string,
  rawInput: unknown,
  now: Date = new Date(),
) {
  return saveResponse(userId, cycleId, rawInput, "edit", now);
}

export interface StudentFormState {
  instance: typeof formInstances.$inferSelect;
  /** @deprecated same row as `instance`; kept for callers not yet renamed */
  cycle: typeof formInstances.$inferSelect;
  /** what the student is told this form is called */
  formTitle: string;
  /** shown only when the occurrence actually has a number */
  sequenceLabel: string | null;
  /** the teacher's focus for this occurrence, if they set one */
  focusLabel: string | null;
  topicTitle: string | null;
  /** the section this response is attributed to — internal, never displayed */
  attributedSectionId: string;
  /**
   * True only when the student is in more than one of this form's sections, which
   * is the one case where naming a section tells them something.
   */
  showSectionLabel: boolean;
  sectionTitle: string | null;
  timezone: string;
  questions: (typeof formQuestions.$inferSelect)[];
  config: Awaited<ReturnType<typeof getStudentSectionConfig>>;
  response: {
    id: string;
    lifecycle: "draft" | "submitted" | "locked";
    revision: number;
    submittedAt: Date | null;
    lastEditedAt: Date | null;
    answers: { questionId: string; value: unknown; freeText: string | null }[];
    items: {
      id: string;
      kind: "question" | "general_comment";
      ordinal: number;
      submissionType: string;
      category: string;
      text: string;
      /** false once staff have acted on it — the student is told why */
      editable: boolean;
    }[];
  } | null;
  canEdit: boolean;
}

/**
 * Everything the student form needs for ONE form instance: its questions, the
 * student's own draft or submission, and whether editing is still allowed.
 *
 * Access is via the instance's audience, so a form shared by several sections is
 * one form to the student — not one per section. The projection deliberately
 * carries no audience list, no counts, and nothing about any other section.
 */
export async function getStudentFormStateForInstance(
  userId: string,
  instanceId: string,
  /**
   * Injectable so the deadline comparison is testable. Every other service here
   * already takes one; this read model needs it for the same reason.
   */
  at: Date = new Date(),
): Promise<StudentFormState | null> {
  const { studentRecordId, sectionId, enrolledSectionCount } =
    await requireAudienceStudent(db, userId, instanceId, {
      allowArchived: true,
    });
  const instance = await db.query.formInstances.findFirst({
    where: eq(formInstances.id, instanceId),
  });
  if (!instance) return null;

  const questions = await db.query.formQuestions.findMany({
    where: eq(formQuestions.cycleId, instance.id),
    orderBy: asc(formQuestions.displayOrder),
  });
  const config = await getStudentSectionConfig(db, instance.id);
  const version = instance.templateVersionId
    ? await db.query.templateVersions.findFirst({
        where: eq(templateVersions.id, instance.templateVersionId),
      })
    : null;
  const template = version
    ? await db.query.formTemplates.findFirst({
        where: eq(formTemplates.id, version.templateId),
      })
    : null;
  const topic = instance.topicId
    ? await db.query.lessonsTopics.findFirst({
        where: eq(lessonsTopics.id, instance.topicId),
      })
    : null;
  const section = await db.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });

  const existing = await db.query.formResponses.findFirst({
    where: and(
      eq(formResponses.cycleId, instance.id),
      eq(formResponses.studentRecordId, studentRecordId),
    ),
  });
  let response: StudentFormState["response"] = null;
  if (existing) {
    const answers = await db.query.questionAnswers.findMany({
      where: eq(questionAnswers.responseId, existing.id),
    });
    const items = await db.query.studentSubmissionItems.findMany({
      where: and(
        eq(studentSubmissionItems.responseId, existing.id),
        isNull(studentSubmissionItems.withdrawnAt),
      ),
      orderBy: asc(studentSubmissionItems.ordinal),
    });
    const editable = new Map<string, boolean>();
    for (const item of items) {
      editable.set(item.id, !(await itemIsTouched(db, item)));
    }
    response = {
      id: existing.id,
      lifecycle: existing.lifecycle as "draft" | "submitted" | "locked",
      revision: existing.revision,
      submittedAt: existing.submittedAt,
      lastEditedAt: existing.lastEditedAt,
      answers: answers.map((a) => ({
        questionId: a.questionId,
        value: a.value,
        freeText: a.freeText,
      })),
      items: items.map((item) => ({
        id: item.id,
        kind: item.kind as "question" | "general_comment",
        ordinal: item.ordinal,
        submissionType: item.submissionType,
        category: item.category,
        text: item.originalText,
        editable: editable.get(item.id) ?? true,
      })),
    };
  }
  /**
   * Editable only while the write path would actually accept it: the form open,
   * inside its window, and the response not locked. Kept in step with
   * `saveResponse` on purpose — offering an edit the server will refuse is worse
   * than not offering one.
   */
  const now = at.getTime();
  const withinWindow =
    instance.state === "open" &&
    now >= instance.openAt.getTime() &&
    now < instance.deadlineAt.getTime();

  return {
    instance,
    cycle: instance,
    formTitle:
      instance.title ?? version?.title ?? template?.title ?? "Class feedback",
    sequenceLabel: hasSequence(instance) ? instanceLabel(instance) : null,
    focusLabel: instance.focusLabel,
    topicTitle: topic?.title ?? null,
    attributedSectionId: sectionId,
    showSectionLabel: enrolledSectionCount > 1,
    sectionTitle: section?.title ?? null,
    timezone: section?.timezone ?? "Asia/Manila",
    questions,
    config,
    response,
    canEdit: response?.lifecycle !== "locked" && withinWindow,
  };
}

/**
 * The form instances a student can act on through one section right now.
 *
 * "Through one section" means the instance's audience includes it — so a
 * course-wide form appears once, not once per membership. Ordered by deadline,
 * because the one closing soonest is the one that matters.
 */
export async function listOpenInstancesForStudent(
  userId: string,
  sectionId: string,
  /** Injectable so the deadline comparison is testable, like every other read here. */
  at: Date = new Date(),
) {
  const studentRecord = await requireEnrolledStudent(db, userId, sectionId, {
    allowArchived: true,
  });
  const audienceRows = await db.query.formInstanceSections.findMany({
    where: eq(formInstanceSections.sectionId, sectionId),
  });
  const ids = audienceRows.map((r) => r.instanceId);
  if (ids.length === 0) return [];
  const open = await db.query.formInstances.findMany({
    where: and(inArray(formInstances.id, ids), eq(formInstances.state, "open")),
    orderBy: asc(formInstances.deadlineAt),
  });
  const now = at.getTime();
  const live = open.filter(
    (i) => now < i.deadlineAt.getTime() && now >= i.openAt.getTime(),
  );
  if (live.length === 0) return [];

  const responses = await db.query.formResponses.findMany({
    where: and(
      inArray(
        formResponses.cycleId,
        live.map((i) => i.id),
      ),
      eq(formResponses.studentRecordId, studentRecord.id),
    ),
  });
  const byInstance = new Map(responses.map((r) => [r.cycleId, r]));
  const versionIds = [
    ...new Set(
      live.map((i) => i.templateVersionId).filter((v): v is string => !!v),
    ),
  ];
  const versions = versionIds.length
    ? await db.query.templateVersions.findMany({
        where: inArray(templateVersions.id, versionIds),
      })
    : [];
  const versionById = new Map(versions.map((v) => [v.id, v]));
  const templates = versions.length
    ? await db.query.formTemplates.findMany({
        where: inArray(
          formTemplates.id,
          versions.map((v) => v.templateId),
        ),
      })
    : [];
  const templateById = new Map(templates.map((t) => [t.id, t]));

  return live.map((instance) => {
    const version = instance.templateVersionId
      ? versionById.get(instance.templateVersionId)
      : undefined;
    const template = version ? templateById.get(version.templateId) : undefined;
    const existing = byInstance.get(instance.id);
    return {
      instance,
      formTitle:
        instance.title ?? version?.title ?? template?.title ?? "Class feedback",
      sequenceLabel: hasSequence(instance) ? instanceLabel(instance) : null,
      focusLabel: instance.focusLabel,
      alreadySubmitted:
        existing?.lifecycle === "submitted" || existing?.lifecycle === "locked",
      hasDraft: existing?.lifecycle === "draft",
    };
  });
}

/**
 * @deprecated Section-keyed entry point kept for existing callers. Resolves the
 * section's soonest live instance and delegates, so there is one implementation.
 */
export async function getStudentFormState(
  userId: string,
  sectionId: string,
  at: Date = new Date(),
): Promise<StudentFormState | null> {
  const open = await listOpenInstancesForStudent(userId, sectionId, at);
  const first = open[0];
  if (!first) return null;
  return getStudentFormStateForInstance(userId, first.instance.id, at);
}

/**
 * Kept for callers that only need "is there a form to fill in?" (the dashboard).
 * Derived from the same state so the two can never disagree.
 */
export async function getOpenCycleForStudent(
  userId: string,
  sectionId: string,
  at: Date = new Date(),
) {
  const state = await getStudentFormState(userId, sectionId, at);
  if (!state) return null;
  return {
    cycle: state.cycle,
    questions: state.questions,
    alreadySubmitted:
      state.response?.lifecycle === "submitted" ||
      state.response?.lifecycle === "locked",
    hasDraft: state.response?.lifecycle === "draft",
  };
}

/** STAFF-ONLY revision trail for one response. */
export async function listResponseRevisions(
  actorUserId: string,
  responseId: string,
) {
  const response = await db.query.formResponses.findFirst({
    where: eq(formResponses.id, responseId),
  });
  if (!response) throw new SubmissionError("Response not found");
  // The response's own section, not the instance's: with a shared form the
  // instance has several, and only the asker's own one may authorize this read.
  await requireSectionStaff(
    db,
    actorUserId,
    response.sectionId,
    "reviewResponses",
    { allowArchived: true },
  );
  return db.query.formResponseRevisions.findMany({
    where: eq(formResponseRevisions.responseId, responseId),
    orderBy: asc(formResponseRevisions.revision),
  });
}

/** Live (non-withdrawn) items for a set of responses. Shared by staff readers. */
export async function liveItemsForResponses(
  dbx: DbOrTx,
  responseIds: string[],
) {
  if (responseIds.length === 0) return [];
  return dbx.query.studentSubmissionItems.findMany({
    where: and(
      inArray(studentSubmissionItems.responseId, responseIds),
      isNull(studentSubmissionItems.withdrawnAt),
    ),
    orderBy: asc(studentSubmissionItems.ordinal),
  });
}
