import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  formQuestions,
  formResponses,
  questionAnswers,
  studentSubmissionItems,
  weeklyCycles,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { requireEnrolledStudent } from "@/modules/authz";
import { answerInputSchema, validateAnswers } from "./questions";

/**
 * Submission flow (weekly-form-workflow.md §8):
 * - only while the cycle is Open and before the deadline (server-checked)
 * - server-side validation of required questions is authoritative
 * - one FormResponse per (cycle, student) — DB unique constraint backstop
 * - validity defaults to Valid; NO edit path after submit
 * - the student-originated item is optional; its original text is immutable
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

export const submissionInputSchema = z.object({
  answers: z.array(answerInputSchema),
  studentItem: z
    .object({
      submissionType: z.enum([
        "question",
        "feedback",
        "concern",
        "clarification",
        "suggestion",
      ]),
      category: z.enum(["content", "logistics", "misc"]),
      topicId: z.string().uuid().optional(),
      text: z.string().min(1).max(10_000),
    })
    .optional(),
});
export type SubmissionInput = z.infer<typeof submissionInputSchema>;

export async function submitResponse(
  userId: string,
  cycleId: string,
  rawInput: unknown,
  now: Date = new Date(),
) {
  // Shape errors must reach the student as a recoverable field error, not as a
  // raw ZodError escaping to the error boundary — over-long text or a tampered
  // enum would otherwise crash the page and lose everything they typed.
  const parsed = submissionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new SubmissionError(
      "Some of your answers could not be accepted",
      parsed.error.issues.map((issue) => ({
        questionId: issue.path.includes("studentItem") ? "item" : null,
        message: issue.message,
      })),
    );
  }
  const input = parsed.data;

  const cycle = await db.query.weeklyCycles.findFirst({
    where: eq(weeklyCycles.id, cycleId),
  });
  if (!cycle) throw new SubmissionError("Form not found");

  // Authorization: confirmed match + active enrollment in the cycle's section.
  const studentRecord = await requireEnrolledStudent(db, userId, cycle.sectionId);

  // Deadline / state enforcement — no submission outside an open window.
  if (cycle.state !== "open") {
    throw new SubmissionError("This form is not open");
  }
  if (now.getTime() < cycle.openAt.getTime()) {
    throw new SubmissionError("This form is not open yet");
  }
  if (now.getTime() >= cycle.deadlineAt.getTime()) {
    throw new SubmissionError("The deadline for this form has passed");
  }

  const questions = await db.query.formQuestions.findMany({
    where: eq(formQuestions.cycleId, cycleId),
    orderBy: asc(formQuestions.displayOrder),
  });
  const validation = validateAnswers(questions, input.answers);
  if (!validation.ok) {
    throw new SubmissionError("Validation failed", validation.errors);
  }

  return db.transaction(async (tx) => {
    let response;
    try {
      [response] = await tx
        .insert(formResponses)
        .values({
          cycleId,
          studentRecordId: studentRecord.id,
          submittedAt: now,
          state: "submitted",
          validity: "valid",
        })
        .returning();
    } catch (err) {
      // unique (cycleId, studentRecordId) violation → already submitted.
      // Drizzle wraps the pg error, so check the error chain for code 23505.
      const isUniqueViolation = (e: unknown): boolean => {
        while (e instanceof Error) {
          if ((e as { code?: string }).code === "23505") return true;
          e = (e as { cause?: unknown }).cause;
        }
        return false;
      };
      if (isUniqueViolation(err)) {
        throw new SubmissionError(
          "You have already submitted this week's form for this section",
        );
      }
      throw err;
    }

    if (validation.normalized.length > 0) {
      await tx.insert(questionAnswers).values(
        validation.normalized.map((a) => ({
          responseId: response!.id,
          questionId: a.questionId,
          value: a.value,
          freeText: a.freeText,
        })),
      );
    }

    let itemId: string | null = null;
    if (input.studentItem) {
      const [item] = await tx
        .insert(studentSubmissionItems)
        .values({
          responseId: response!.id,
          submissionType: input.studentItem.submissionType,
          category: input.studentItem.category,
          topicId: input.studentItem.topicId,
          originalText: input.studentItem.text,
        })
        .returning();
      itemId = item!.id;
    }

    await writeAudit(tx, {
      actorUserId: userId,
      action: "response.submitted",
      entityType: "form_response",
      entityId: response!.id,
      after: {
        cycleId,
        studentRecordId: studentRecord.id,
        answerCount: validation.normalized.length,
        hasStudentItem: itemId !== null,
      },
    });

    return { responseId: response!.id, studentItemId: itemId };
  });
}

/** The open cycle a student may currently submit for in a section, if any. */
export async function getOpenCycleForStudent(userId: string, sectionId: string) {
  const studentRecord = await requireEnrolledStudent(db, userId, sectionId);
  const open = await db.query.weeklyCycles.findMany({
    where: and(
      eq(weeklyCycles.sectionId, sectionId),
      eq(weeklyCycles.state, "open"),
    ),
    orderBy: asc(weeklyCycles.openAt),
  });
  const now = Date.now();
  for (const cycle of open) {
    if (now >= cycle.deadlineAt.getTime()) continue;
    const existing = await db.query.formResponses.findFirst({
      where: and(
        eq(formResponses.cycleId, cycle.id),
        eq(formResponses.studentRecordId, studentRecord.id),
      ),
    });
    const questions = await db.query.formQuestions.findMany({
      where: eq(formQuestions.cycleId, cycle.id),
      orderBy: asc(formQuestions.displayOrder),
    });
    return { cycle, questions, alreadySubmitted: !!existing };
  }
  return null;
}
