import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { bonusPeriods, classSections } from "./catalog";
import { weeklyCycles } from "./forms";
import { users } from "./identity";

/**
 * A staff-authored summary/theme note on one teacher-created prompt
 * (project-specs.md §6.4). Human-written only — there is no AI summarization in
 * this product.
 *
 * Keyed by `form_questions.stable_key` rather than a question row id, because a
 * prompt is re-snapshotted into every cycle: the stable key is the only identity
 * that survives across snapshots, which is exactly the grouping the Response
 * Analysis view needs. It is deliberately NOT a foreign key for the same reason.
 */
export const promptAnalysisNotes = pgTable(
  "prompt_analysis_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => classSections.id),
    questionStableKey: uuid("question_stable_key").notNull(),
    /** null = the note applies across every cycle in scope */
    cycleId: uuid("cycle_id").references(() => weeklyCycles.id),
    bonusPeriodId: uuid("bonus_period_id").references(() => bonusPeriods.id),
    body: text("body").notNull(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("analysis_note_body_present", sql`length(btrim(${t.body})) > 0`),
    index("prompt_analysis_notes_prompt_idx").on(
      t.sectionId,
      t.questionStableKey,
    ),
    index("prompt_analysis_notes_cycle_idx").on(t.cycleId),
  ],
);
