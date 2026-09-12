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
import { commentState, reactionKind } from "./enums";
import { classSections, courses } from "./catalog";
import { publicAnswers } from "./publishing";
import { users } from "./identity";

/**
 * Course-only reactions on a published entry (docs/product/specification.md §8 P2).
 *
 * The subject is a course-owned PublicAnswer (ADR-0005), so any eligible
 * student of the course may react — a Lab B student reacting to an answer that
 * originated in Lab A is normal, not a leak: nothing here names a section.
 *
 * The user id is stored because a reaction must be toggleable by its owner and
 * because staff moderation needs attribution. It is never included in a
 * student-facing payload — students receive counts plus their own reactions.
 */
export const publicAnswerReactions = pgTable(
  "public_answer_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicAnswerId: uuid("public_answer_id")
      .notNull()
      .references(() => publicAnswers.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: reactionKind("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Makes adding a reaction idempotent and toggling unambiguous.
    uniqueIndex("public_answer_reaction_unique").on(
      t.publicAnswerId,
      t.userId,
      t.kind,
    ),
    index("public_answer_reactions_answer_idx").on(t.publicAnswerId),
  ],
);

/**
 * A moderated comment on a published entry.
 *
 * Every comment starts `pending` and is invisible to classmates until staff
 * approve it. No pseudonym is stored: the student-facing label is derived in the
 * service as `Student N`, ranked per ANSWER, so the label cannot be correlated
 * across the archive to profile a commenter. Staff always see the real author.
 */
export const publicAnswerComments = pgTable(
  "public_answer_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicAnswerId: uuid("public_answer_id")
      .notNull()
      .references(() => publicAnswers.id),
    /**
     * Denormalized so moderation queues and authorization scope by COURSE — the
     * archive the comment lives in is course-wide (ADR-0005), so its moderation
     * queue is too.
     */
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    /**
     * PROVENANCE ONLY — the section this comment was filed under while the
     * archive was still section-scoped. Never a visibility or moderation key.
     */
    originSectionId: uuid("origin_section_id").references(() => classSections.id),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    state: commentState("state").notNull().default("pending"),
    moderatedByUserId: uuid("moderated_by_user_id").references(() => users.id),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    moderationReason: text("moderation_reason"),
    clientToken: text("client_token"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("public_answer_comment_token_unique")
      .on(t.publicAnswerId, t.authorUserId, t.clientToken)
      .where(sql`${t.clientToken} IS NOT NULL`),
    index("public_answer_comments_answer_idx").on(
      t.publicAnswerId,
      t.state,
      t.createdAt,
    ),
    index("public_answer_comments_moderation_idx").on(
      t.courseId,
      t.state,
      t.createdAt,
    ),
    check(
      "comment_moderation_consistency",
      sql`(${t.moderatedAt} IS NULL) = (${t.moderatedByUserId} IS NULL)`,
    ),
  ],
);
