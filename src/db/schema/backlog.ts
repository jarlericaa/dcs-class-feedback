import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  backlogConfirmation,
  backlogPriority,
  backlogProvenance,
  backlogQuestionState,
  backlogRecommendationKind,
  importBatchKind,
  legacyRowState,
  legacySourceKind,
  questionCategory,
  recommendationState,
} from "./enums";
import { classSections, courses, lessonsTopics } from "./catalog";
import { studentSubmissionItems } from "./responses";
import { studentRecords, users } from "./identity";

/** A roster or legacy import event — audited provenance for imported rows. */
export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: importBatchKind("kind").notNull(),
    sourceDescription: text("source_description").notNull(),
    courseId: uuid("course_id").references(() => courses.id),
    sectionId: uuid("section_id").references(() => classSections.id),
    importerUserId: uuid("importer_user_id")
      .notNull()
      .references(() => users.id),
    /** { created, updated, deactivated, skipped, errored, errors: [...] } */
    summary: jsonb("summary"),
    // --- legacy import staging (P1) ---
    sourceKind: legacySourceKind("source_kind"),
    fileName: text("file_name"),
    /**
     * Anonymous by default (docs/domain/legacy-question-import.md §3). Flipping this is a
     * course-staff decision, not delegable to a TA permission flag.
     */
    preserveIdentity: boolean("preserve_identity").notNull().default(false),
    fieldMapping: jsonb("field_mapping"),
    requestToken: text("request_token"),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    committedByUserId: uuid("committed_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("import_batches_request_token_unique")
      .on(t.requestToken)
      .where(sql`${t.requestToken} IS NOT NULL`),
    index("import_batches_course_idx").on(t.courseId),
  ],
);

/**
 * One staged row from a legacy import, reviewed before anything is committed.
 *
 * `rawText` is ALWAYS retained, so an unparseable row degrades into something a
 * human can fix instead of being dropped — which is what makes "per-row errors
 * without discarding valid rows" true rather than aspirational.
 */
export const legacyImportRows = pgTable(
  "legacy_import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importBatchId: uuid("import_batch_id")
      .notNull()
      .references(() => importBatches.id),
    rowIndex: integer("row_index").notNull(),
    sourceKind: legacySourceKind("source_kind").notNull(),
    rawText: text("raw_text").notNull(),
    questionText: text("question_text"),
    answerText: text("answer_text"),
    detectedCategory: questionCategory("detected_category"),
    topicHint: text("topic_hint"),
    /**
     * Set only after an explicit staff choice, and only as a resolved roster
     * reference — never a free-text student number, so a legacy import cannot
     * reintroduce plaintext identifiers (docs/product/specification.md §11).
     */
    sourceStudentRecordId: uuid("source_student_record_id").references(
      () => studentRecords.id,
    ),
    state: legacyRowState("state").notNull().default("parsed"),
    errorMessage: text("error_message"),
    mappedBacklogQuestionId: uuid("mapped_backlog_question_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("legacy_import_row_unique").on(t.importBatchId, t.rowIndex),
    index("legacy_import_rows_batch_idx").on(t.importBatchId, t.state),
    check(
      "legacy_row_error_message",
      sql`${t.state} <> 'error' OR ${t.errorMessage} IS NOT NULL`,
    ),
  ],
);

/**
 * Course-level backlog question: only what the teaching team has CONFIRMED it
 * intends to answer (docs/product/specification.md §5.6), not every unanswered submission.
 *
 * Anonymous-by-default for legacy imports: identityPreserved=true and
 * sourceItemId only when a teacher explicitly chooses to preserve source
 * identity (docs/domain/legacy-question-import.md §3).
 * Legacy/backlog items NEVER count toward participation.
 */
export const backlogQuestions = pgTable(
  "backlog_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    text: text("text").notNull(),
    category: questionCategory("category"),
    topicId: uuid("topic_id").references(() => lessonsTopics.id),
    state: backlogQuestionState("state").notNull().default("imported"),
    /**
     * Instructor-confirmed membership — an INDEPENDENT dimension from `state`.
     * An item cannot leave imported/needs_review until this is 'confirmed'.
     */
    confirmation: backlogConfirmation("confirmation")
      .notNull()
      .default("recommended"),
    confirmedByUserId: uuid("confirmed_by_user_id").references(() => users.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    priority: backlogPriority("priority").notNull().default("normal"),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id),
    targetDate: date("target_date"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    draftAnswerText: text("draft_answer_text"),
    draftUpdatedByUserId: uuid("draft_updated_by_user_id").references(
      () => users.id,
    ),
    draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }),
    provenance: backlogProvenance("provenance").notNull(),
    identityPreserved: boolean("identity_preserved").notNull().default(false),
    sourceItemId: uuid("source_item_id").references(
      () => studentSubmissionItems.id,
    ),
    legacyRowId: uuid("legacy_row_id").references(() => legacyImportRows.id),
    /** legacy files may contain already-answered questions */
    previouslyAnswered: boolean("previously_answered").notNull().default(false),
    priorAnswerText: text("prior_answer_text"),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("backlog_questions_course_idx").on(t.courseId),
    index("backlog_questions_state_idx").on(t.state),
    index("backlog_questions_confirmation_idx").on(t.courseId, t.confirmation),
    index("backlog_questions_assignee_idx").on(t.assigneeUserId),
    index("backlog_questions_source_item_idx").on(t.sourceItemId),
    check(
      "backlog_confirmed_stamp",
      sql`${t.confirmation} <> 'confirmed' OR (${t.confirmedByUserId} IS NOT NULL AND ${t.confirmedAt} IS NOT NULL)`,
    ),
  ],
);

/**
 * A Student Assistant's recommendation to add or remove a backlog question,
 * plus the Instructor's decision (docs/product/specification.md §6.6).
 *
 * The two partial uniques below are what make a repeated `Will Answer` click
 * idempotent: only one pending recommendation can exist per target per kind.
 */
export const backlogRecommendations = pgTable(
  "backlog_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    kind: backlogRecommendationKind("kind").notNull(),
    state: recommendationState("state").notNull().default("pending"),
    sourceItemId: uuid("source_item_id").references(
      () => studentSubmissionItems.id,
    ),
    backlogQuestionId: uuid("backlog_question_id").references(
      () => backlogQuestions.id,
    ),
    /** set when an `add` recommendation is approved */
    createdBacklogQuestionId: uuid("created_backlog_question_id").references(
      () => backlogQuestions.id,
    ),
    preserveSource: boolean("preserve_source").notNull().default(false),
    reason: text("reason"),
    recommendedByUserId: uuid("recommended_by_user_id")
      .notNull()
      .references(() => users.id),
    recommendedAt: timestamp("recommended_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
  },
  (t) => [
    check(
      "rec_target_present",
      sql`${t.sourceItemId} IS NOT NULL OR ${t.backlogQuestionId} IS NOT NULL`,
    ),
    check(
      "rec_remove_target",
      sql`${t.kind} <> 'remove' OR ${t.backlogQuestionId} IS NOT NULL`,
    ),
    check(
      "rec_decided_stamp",
      sql`${t.state} = 'pending' OR (${t.decidedByUserId} IS NOT NULL AND ${t.decidedAt} IS NOT NULL)`,
    ),
    uniqueIndex("rec_pending_item_unique")
      .on(t.sourceItemId, t.kind)
      .where(sql`${t.state} = 'pending' AND ${t.sourceItemId} IS NOT NULL`),
    uniqueIndex("rec_pending_backlog_unique")
      .on(t.backlogQuestionId, t.kind)
      .where(sql`${t.state} = 'pending' AND ${t.backlogQuestionId} IS NOT NULL`),
    index("backlog_recommendations_course_idx").on(t.courseId, t.state),
  ],
);

/**
 * Explicit, per-section exposure of a backlog question. Nothing from the
 * backlog ever appears in a section automatically (docs/domain/question-backlog.md §5).
 */
export const sectionBacklogVisibility = pgTable(
  "section_backlog_visibility",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    backlogQuestionId: uuid("backlog_question_id")
      .notNull()
      .references(() => backlogQuestions.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => classSections.id),
    madeVisibleByUserId: uuid("made_visible_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("section_backlog_visibility_unique").on(
      t.backlogQuestionId,
      t.sectionId,
    ),
  ],
);
