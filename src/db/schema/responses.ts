import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  formResponseState,
  invalidationReason,
  itemReviewState,
  participationValidity,
  questionCategory,
  responseDisposition,
  submissionItemType,
} from "./enums";
import { formQuestions, weeklyCycles } from "./forms";
import { studentRecords, users } from "./identity";
import { lessonsTopics } from "./catalog";

/**
 * One student's completed weekly form. Two INDEPENDENT state dimensions:
 * review state and participation validity (domain-model.md §3.2/§3.3).
 * Participation is DERIVED from these rows — there is no participation table.
 * No update path exists for answers after submit.
 */
export const formResponses = pgTable(
  "form_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => weeklyCycles.id),
    studentRecordId: uuid("student_record_id")
      .notNull()
      .references(() => studentRecords.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    state: formResponseState("state").notNull().default("submitted"),
    validity: participationValidity("validity").notNull().default("valid"),
    /** staff-only; required when validity = invalid (enforced in service) */
    invalidationReason: invalidationReason("invalidation_reason"),
    invalidationNote: text("invalidation_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // THE one-submission-per-student-per-cycle rule (weekly-form-workflow.md §4).
    uniqueIndex("one_response_per_cycle_student").on(
      t.cycleId,
      t.studentRecordId,
    ),
    index("form_responses_student_idx").on(t.studentRecordId),
    index("form_responses_cycle_idx").on(t.cycleId),
  ],
);

export const questionAnswers = pgTable(
  "question_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => formResponses.id),
    questionId: uuid("question_id")
      .notNull()
      .references(() => formQuestions.id),
    /**
     * { optionIds?: string[], optionLabels?: string[], scaleValue?: number,
     *   boolValue?: boolean, dateValue?: string, timeValue?: string }
     * Stores stable option ids AND labels at submission time so exports stay
     * stable if labels are later edited (participation-rules.md §4.3).
     */
    value: jsonb("value"),
    freeText: text("free_text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("one_answer_per_question").on(t.responseId, t.questionId),
    index("question_answers_response_idx").on(t.responseId),
  ],
);

/**
 * The student-originated question/feedback item inside a response.
 * originalText is IMMUTABLE — no service exposes an update for it; public
 * rewording lives on publicAnswers.publicQuestionText only.
 * Review state and disposition are independent dimensions.
 */
export const studentSubmissionItems = pgTable(
  "student_submission_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => formResponses.id),
    submissionType: submissionItemType("submission_type").notNull(),
    category: questionCategory("category").notNull(),
    topicId: uuid("topic_id").references(() => lessonsTopics.id),
    originalText: text("original_text").notNull(),
    reviewState: itemReviewState("review_state").notNull().default("new"),
    disposition: responseDisposition("disposition")
      .notNull()
      .default("undecided"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("submission_items_response_idx").on(t.responseId)],
);

/** Private reply — visible only to the asking student and authorized staff. */
export const privateResponses = pgTable(
  "private_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => studentSubmissionItems.id),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("private_responses_item_idx").on(t.itemId)],
);
