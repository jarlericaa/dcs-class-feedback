import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  questionCategory,
  questionType,
  recurrenceFrequency,
  templateVisibility,
  weeklyCycleState,
} from "./enums";
import { classSections, courses, lessonsTopics } from "./catalog";
import { users } from "./identity";

export const formTemplates = pgTable(
  "form_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    visibility: templateVisibility("visibility").notNull().default("private"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("form_templates_course_idx").on(t.courseId)],
);

/**
 * Immutable snapshot of a template's questions/settings. Editing a template
 * creates a NEW version; existing versions (and cycles generated from them)
 * are never mutated. Questions live in formQuestions with templateVersionId.
 */
export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => formTemplates.id),
    versionNumber: integer("version_number").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("template_version_unique").on(t.templateId, t.versionNumber),
  ],
);

export const recurrenceSchedules = pgTable(
  "recurrence_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => classSections.id),
    frequency: recurrenceFrequency("frequency").notNull().default("weekly"),
    /** 0=Sunday..6=Saturday, in the schedule's timezone */
    openDayOfWeek: smallint("open_day_of_week").notNull(),
    openTime: time("open_time").notNull(),
    deadlineDayOfWeek: smallint("deadline_day_of_week").notNull(),
    deadlineTime: time("deadline_time").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    occurrenceCount: integer("occurrence_count"),
    templateId: uuid("template_id")
      .notNull()
      .references(() => formTemplates.id),
    timezone: text("timezone").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // End condition: an end date or an occurrence count (or open-ended: neither).
    check(
      "recurrence_end_condition",
      sql`NOT (${t.endDate} IS NOT NULL AND ${t.occurrenceCount} IS NOT NULL)`,
    ),
    check(
      "recurrence_days_valid",
      sql`${t.openDayOfWeek} BETWEEN 0 AND 6 AND ${t.deadlineDayOfWeek} BETWEEN 0 AND 6`,
    ),
    index("recurrence_schedules_section_idx").on(t.sectionId),
  ],
);

export const weeklyCycles = pgTable(
  "weekly_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => classSections.id),
    scheduleId: uuid("schedule_id").references(() => recurrenceSchedules.id),
    /** 1-based occurrence index within its schedule */
    cycleIndex: integer("cycle_index").notNull(),
    openAt: timestamp("open_at", { withTimezone: true }).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    templateVersionId: uuid("template_version_id").references(
      () => templateVersions.id,
    ),
    state: weeklyCycleState("state").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Idempotent generation: re-running generation can never duplicate a cycle.
    uniqueIndex("weekly_cycle_schedule_index_unique")
      .on(t.scheduleId, t.cycleIndex)
      .where(sql`${t.scheduleId} IS NOT NULL`),
    check("cycle_window_valid", sql`${t.openAt} < ${t.deadlineAt}`),
    index("weekly_cycles_section_idx").on(t.sectionId),
    index("weekly_cycles_state_idx").on(t.state),
  ],
);

/**
 * A question either belongs to a template version (template-side) or is a
 * snapshot inside a weekly cycle (cycle-side) — exactly one of the two.
 */
export const formQuestions = pgTable(
  "form_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id").references(() => weeklyCycles.id),
    templateVersionId: uuid("template_version_id").references(
      () => templateVersions.id,
    ),
    prompt: text("prompt").notNull(),
    description: text("description"),
    type: questionType("type").notNull(),
    /** [{ stableId, label, order }] for choice/checkbox/dropdown types */
    options: jsonb("options"),
    /** { min, max, minLabel?, maxLabel?, step } for linear_scale */
    scale: jsonb("scale"),
    /** { minLen?, maxLen?, minSelections?, maxSelections?, pattern? } */
    validation: jsonb("validation"),
    required: boolean("required").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    category: questionCategory("category"),
    topicId: uuid("topic_id").references(() => lessonsTopics.id),
    /**
     * Stable identity across snapshot copies (template question → cycle
     * question), so exports/analytics can track a question across cycles.
     */
    stableKey: uuid("stable_key").notNull().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "question_owner_one_of",
      sql`(${t.cycleId} IS NULL) <> (${t.templateVersionId} IS NULL)`,
    ),
    index("form_questions_cycle_idx").on(t.cycleId),
    index("form_questions_template_version_idx").on(t.templateVersionId),
  ],
);
