import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { publicAnswerState, questionCategory, sourceOrigin } from "./enums";
import { classSections, lessonsTopics } from "./catalog";
import { studentSubmissionItems } from "./responses";
import { backlogQuestions } from "./backlog";
import { users } from "./identity";

/**
 * An anonymous public Q&A entry, section-scoped. "Public" means visible to
 * that section's enrolled students and staff ONLY — never the open internet.
 * Carries the reworded question text; the original student wording stays
 * immutable on the source StudentSubmissionItem. No identity fields exist here.
 * State `unpublished` is reserved (Open D6) — no code path sets it.
 */
export const publicAnswers = pgTable(
  "public_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => classSections.id),
    publicQuestionText: text("public_question_text").notNull(),
    answerBody: text("answer_body"),
    state: publicAnswerState("state").notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishFailed: boolean("publish_failed").notNull().default(false),
    publishFailureReason: text("publish_failure_reason"),
    /** flagged late when reconciliation published after scheduledAt passed */
    publishedLate: boolean("published_late").notNull().default(false),
    category: questionCategory("category"),
    topicId: uuid("topic_id").references(() => lessonsTopics.id),
    sourceOrigin: sourceOrigin("source_origin").notNull().default("current"),
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
    check(
      "scheduled_requires_time",
      sql`${t.state} <> 'scheduled' OR ${t.scheduledAt} IS NOT NULL`,
    ),
    index("public_answers_section_idx").on(t.sectionId),
    index("public_answers_state_idx").on(t.state),
  ],
);

/**
 * Internal-only link from a PublicAnswer to its source submission item(s)
 * and/or backlog question(s). Many links per answer = merge. Drives the
 * asker's "your question was answered" view and staff traceability.
 * NEVER exposed in any student-visible public field.
 */
export const sourceLinks = pgTable(
  "source_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicAnswerId: uuid("public_answer_id")
      .notNull()
      .references(() => publicAnswers.id),
    itemId: uuid("item_id").references(() => studentSubmissionItems.id),
    backlogQuestionId: uuid("backlog_question_id").references(
      () => backlogQuestions.id,
    ),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "source_link_one_of",
      sql`(${t.itemId} IS NULL) <> (${t.backlogQuestionId} IS NULL)`,
    ),
    uniqueIndex("source_link_item_unique")
      .on(t.publicAnswerId, t.itemId)
      .where(sql`${t.itemId} IS NOT NULL`),
    uniqueIndex("source_link_backlog_unique")
      .on(t.publicAnswerId, t.backlogQuestionId)
      .where(sql`${t.backlogQuestionId} IS NOT NULL`),
    index("source_links_item_idx").on(t.itemId),
    index("source_links_answer_idx").on(t.publicAnswerId),
  ],
);
