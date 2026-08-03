import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  itemReviewState,
  mergeGroupState,
  responseDisposition,
} from "./enums";
import { classSections, courses } from "./catalog";
import { studentSubmissionItems } from "./responses";
import { publicAnswers } from "./publishing";
import { backlogQuestions } from "./backlog";
import { users } from "./identity";

/**
 * Duplicate-question merging (project-specs.md §6.6, §7 D4).
 *
 * Why this exists alongside `source_links`, which already maps many items to one
 * public answer:
 *
 * - a merge can target the BACKLOG, where no public answer exists yet, so there
 *   is nothing for a source link to hang off;
 * - a source link records no merger, no primary, and no reason;
 * - unmerging by deleting source links would destroy the provenance that makes
 *   the operation reversible.
 *
 * So the group is the durable, reversible object and `source_links` remains the
 * publication projection that the student read path already consumes.
 */
export const questionMergeGroups = pgTable(
  "question_merge_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    /** null = a course-level (backlog-only) merge */
    sectionId: uuid("section_id").references(() => classSections.id),
    mergedQuestionText: text("merged_question_text").notNull(),
    primaryItemId: uuid("primary_item_id").references(
      () => studentSubmissionItems.id,
    ),
    primaryBacklogQuestionId: uuid("primary_backlog_question_id").references(
      () => backlogQuestions.id,
    ),
    /** the ONE merged backlog item, when the merge targets the backlog */
    backlogQuestionId: uuid("backlog_question_id").references(
      () => backlogQuestions.id,
    ),
    /** the ONE merged public answer, when the merge targets publication */
    publicAnswerId: uuid("public_answer_id").references(() => publicAnswers.id),
    state: mergeGroupState("state").notNull().default("active"),
    /**
     * sha256 over the sorted member ids plus the target. With the partial unique
     * below, submitting the same merge twice returns the existing group instead
     * of creating a second answer and a second set of source links.
     */
    mergeKey: text("merge_key").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    unmergedByUserId: uuid("unmerged_by_user_id").references(() => users.id),
    unmergedAt: timestamp("unmerged_at", { withTimezone: true }),
    unmergeReason: text("unmerge_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "merge_primary_one_of",
      sql`(${t.primaryItemId} IS NULL) <> (${t.primaryBacklogQuestionId} IS NULL)`,
    ),
    check(
      "merge_unmerged_stamp",
      sql`${t.state} <> 'unmerged' OR (${t.unmergedByUserId} IS NOT NULL AND ${t.unmergedAt} IS NOT NULL)`,
    ),
    check(
      "merge_public_needs_section",
      sql`${t.publicAnswerId} IS NULL OR ${t.sectionId} IS NOT NULL`,
    ),
    uniqueIndex("merge_group_key_active")
      .on(t.mergeKey)
      .where(sql`${t.state} = 'active'`),
    index("merge_groups_course_idx").on(t.courseId),
    index("merge_groups_section_idx").on(t.sectionId),
    index("merge_groups_answer_idx").on(t.publicAnswerId),
  ],
);

/**
 * One original question inside a merge.
 *
 * Members are NEVER deleted. `removedAt` plus the captured `prior*` columns are
 * exactly what "unmerging does not lose original question data" means: the
 * unmerge restores each member's pre-merge disposition and review state from
 * here rather than guessing at them.
 */
export const questionMergeMembers = pgTable(
  "question_merge_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => questionMergeGroups.id),
    itemId: uuid("item_id").references(() => studentSubmissionItems.id),
    backlogQuestionId: uuid("backlog_question_id").references(
      () => backlogQuestions.id,
    ),
    priorDisposition: responseDisposition("prior_disposition"),
    priorReviewState: itemReviewState("prior_review_state"),
    addedByUserId: uuid("added_by_user_id")
      .notNull()
      .references(() => users.id),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    removedByUserId: uuid("removed_by_user_id").references(() => users.id),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "merge_member_one_of",
      sql`(${t.itemId} IS NULL) <> (${t.backlogQuestionId} IS NULL)`,
    ),
    // An item cannot sit in two conflicting active merges.
    uniqueIndex("merge_member_item_active")
      .on(t.itemId)
      .where(sql`${t.itemId} IS NOT NULL AND ${t.removedAt} IS NULL`),
    uniqueIndex("merge_member_backlog_active")
      .on(t.backlogQuestionId)
      .where(sql`${t.backlogQuestionId} IS NOT NULL AND ${t.removedAt} IS NULL`),
    index("merge_members_group_idx").on(t.groupId),
  ],
);
