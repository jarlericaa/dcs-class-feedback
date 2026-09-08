import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  approvalDecision,
  publicAnswerState,
  questionCategory,
  sourceOrigin,
} from "./enums";
import { bonusPeriods, classSections, lessonsTopics } from "./catalog";
import { studentSubmissionItems } from "./responses";
import { weeklyCycles } from "./forms";
import { backlogQuestions } from "./backlog";
import { users } from "./identity";

/**
 * Postgres full-text search vector. Drizzle has no first-class `tsvector`, and
 * this column is GENERATED, so the application never writes it — declaring it
 * keeps the generated migration and the query builder in agreement.
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * An anonymous public Q&A entry, section-scoped. "Public" means visible to
 * that section's enrolled students and staff ONLY — never the open internet.
 * Carries the reworded question text; the original student wording stays
 * immutable on the source StudentSubmissionItem. No identity fields exist here.
 *
 * Lifecycle (docs/domain/domain-model.md §3.6):
 *   draft → awaiting_approval → published → unpublished, with edits producing
 *   publicAnswerRevisions rather than overwriting history.
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
    /** Makes drafting idempotent under a double-submit or a retry. */
    requestToken: text("request_token"),
    // --- approval (docs/product/specification.md §6.8 step 4) ---
    submittedForApprovalAt: timestamp("submitted_for_approval_at", {
      withTimezone: true,
    }),
    submittedByUserId: uuid("submitted_by_user_id").references(() => users.id),
    /** the responsible Instructor */
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    // --- revisions + unpublishing ---
    /** student-visible "last updated"; distinct from the row's updatedAt */
    lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
    /** student payload exposes only `edited = revisionCount > 0`, never the count */
    revisionCount: integer("revision_count").notNull().default(0),
    unpublishedAt: timestamp("unpublished_at", { withTimezone: true }),
    unpublishedByUserId: uuid("unpublished_by_user_id").references(
      () => users.id,
    ),
    unpublishReason: text("unpublish_reason"),
    /**
     * Denormalized at draft time SO THAT the student archive can filter by
     * source form and bonus period without ever joining identity-bearing
     * form_responses.
     */
    sourceCycleId: uuid("source_cycle_id").references(() => weeklyCycles.id),
    bonusPeriodId: uuid("bonus_period_id").references(() => bonusPeriods.id),
    // --- discussion (P2) ---
    discussionLockedAt: timestamp("discussion_locked_at", {
      withTimezone: true,
    }),
    discussionLockedByUserId: uuid("discussion_locked_by_user_id").references(
      () => users.id,
    ),
    commentsEnabled: boolean("comments_enabled").notNull().default(true),
    reactionsEnabled: boolean("reactions_enabled").notNull().default(true),
    /**
     * Generated tsvector for archive search. `'english'::regconfig` is required:
     * the one-argument to_tsvector is STABLE, not IMMUTABLE, and Postgres
     * rejects it in a generated column.
     */
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('english'::regconfig, coalesce(public_question_text, '') || ' ' || coalesce(answer_body, ''))`,
    ),
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
    check(
      "published_requires_time",
      sql`${t.state} <> 'published' OR ${t.publishedAt} IS NOT NULL`,
    ),
    check(
      "unpublished_requires_time",
      sql`${t.state} <> 'unpublished' OR ${t.unpublishedAt} IS NOT NULL`,
    ),
    check(
      "approved_requires_approver",
      sql`(${t.approvedAt} IS NULL) = (${t.approvedByUserId} IS NULL)`,
    ),
    uniqueIndex("public_answers_request_token_unique")
      .on(t.sectionId, t.requestToken)
      .where(sql`${t.requestToken} IS NOT NULL`),
    index("public_answers_section_idx").on(t.sectionId),
    index("public_answers_state_idx").on(t.state),
    index("public_answers_archive_idx").on(t.sectionId, t.state, t.publishedAt),
    index("public_answers_cycle_idx").on(t.sourceCycleId),
    index("public_answers_period_idx").on(t.bonusPeriodId),
    index("public_answers_search_idx").using("gin", t.searchVector),
  ],
);

/**
 * Version history for a published entry (docs/product/specification.md §5.7, §6.8 step 8).
 * Holds the text as it was BEFORE the edit, so the current row is always the
 * live version and history reads backwards from it. Staff-only: the student
 * payload exposes only a last-updated timestamp.
 */
export const publicAnswerRevisions = pgTable(
  "public_answer_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicAnswerId: uuid("public_answer_id")
      .notNull()
      .references(() => publicAnswers.id),
    revisionNumber: integer("revision_number").notNull(),
    priorQuestionText: text("prior_question_text").notNull(),
    priorAnswerText: text("prior_answer_text"),
    editorUserId: uuid("editor_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("public_answer_revision_unique").on(
      t.publicAnswerId,
      t.revisionNumber,
    ),
    index("public_answer_revisions_answer_idx").on(
      t.publicAnswerId,
      t.revisionNumber,
    ),
  ],
);

/**
 * Approval decisions on a draft. A rejection returns the entry to `draft` and
 * records itself here, which is why `rejected` never needed to be a state.
 */
export const publicAnswerApprovals = pgTable(
  "public_answer_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicAnswerId: uuid("public_answer_id")
      .notNull()
      .references(() => publicAnswers.id),
    decision: approvalDecision("decision").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("public_answer_approvals_answer_idx").on(
      t.publicAnswerId,
      t.createdAt,
    ),
    check(
      "approval_reason_on_reject",
      sql`${t.decision} <> 'rejected' OR ${t.reason} IS NOT NULL`,
    ),
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
