import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  backlogProvenance,
  backlogQuestionState,
  importBatchKind,
  questionCategory,
} from "./enums";
import { classSections, courses, lessonsTopics } from "./catalog";
import { studentSubmissionItems } from "./responses";
import { users } from "./identity";

/** A roster or legacy import event — audited provenance for imported rows. */
export const importBatches = pgTable("import_batches", {
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Course-level backlog question. Anonymous-by-default for legacy imports:
 * identityPreserved=true and sourceItemId only when a teacher explicitly
 * chooses to preserve source identity (legacy-question-import.md §3).
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
    provenance: backlogProvenance("provenance").notNull(),
    identityPreserved: boolean("identity_preserved").notNull().default(false),
    sourceItemId: uuid("source_item_id").references(
      () => studentSubmissionItems.id,
    ),
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
  ],
);

/**
 * Explicit, per-section exposure of a backlog question. Nothing from the
 * backlog ever appears in a section automatically (question-backlog.md §5).
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
