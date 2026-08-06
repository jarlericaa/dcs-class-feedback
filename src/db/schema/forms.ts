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
  bonusAssignmentSource,
  formAudienceMode,
  formDeliveryMode,
  instanceQuestionOrigin,
  questionCategory,
  questionType,
  recurrenceFrequency,
  templateVisibility,
  weeklyCycleState,
} from "./enums";
import { bonusPeriods, classSections, courses, lessonsTopics } from "./catalog";
import { users } from "./identity";

/**
 * Forms: definitions, delivery configuration, audiences, and instances.
 * See docs/FORMS-AUDIENCE-DYNAMIC-INSTANCES.md — that document owns the model.
 *
 * Three distinct things, and the distinction is load-bearing:
 *
 * - a **form definition** (`formTemplates` + immutable `templateVersions`) is
 *   reusable and belongs to a COURSE;
 * - an **audience** (`formScheduleSections` / `formInstanceSections`) says which
 *   sections may receive a form — always explicit rows, never inferred;
 * - a **form instance** (`formInstances`) is the questionnaire students actually
 *   answer, with its own window, state, and question snapshot.
 *
 * `weekly` is a delivery mode, not part of a form's identity.
 */

/**
 * A reusable form definition. "Template" is the historical name; the product
 * calls this a form.
 */
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
    /**
     * Optional organizing label — "Weekly feedback", "Long exam", "Course
     * evaluation". Deliberately free text rather than an enum: a taxonomy of
     * form types would have to be guessed at, and the title plus the delivery
     * mode already carry the meaning.
     */
    purpose: text("purpose"),
    visibility: templateVisibility("visibility").notNull().default("private"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("form_templates_course_idx").on(t.courseId)],
);

/**
 * Immutable snapshot of a definition's questions/settings. Editing a form
 * creates a NEW version; existing versions (and the instances generated from
 * them) are never mutated. Questions live in formQuestions with
 * templateVersionId.
 */
export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => formTemplates.id),
    versionNumber: integer("version_number").notNull(),
    /** Snapshots of the form's own text at this version. Rich source: rendered by the safe renderer. */
    title: text("title"),
    description: text("description"),
    /**
     * How many repeatable "Ask a Question" entries the form offers
     * (project-specs.md §5.2). 0 disables the block entirely. Each non-empty
     * entry becomes its own immutable StudentSubmissionItem.
     */
    maxStudentQuestions: integer("max_student_questions").notNull().default(1),
    studentQuestionPrompt: text("student_question_prompt"),
    /** The distinct general-comment field, tracked separately from questions. */
    generalCommentEnabled: boolean("general_comment_enabled")
      .notNull()
      .default(true),
    generalCommentPrompt: text("general_comment_prompt"),
    generalCommentRequired: boolean("general_comment_required")
      .notNull()
      .default(false),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("template_version_unique").on(t.templateId, t.versionNumber),
    check(
      "max_student_questions_range",
      sql`${t.maxStudentQuestions} BETWEEN 0 AND 10`,
    ),
  ],
);

/**
 * Delivery configuration for one form: how often instances appear, in what
 * window, and for which sections.
 *
 * Physical name `recurrence_schedules` is historical — this is no longer a
 * weekly-only, per-section object. `courseId` is authoritative; `sectionId` is
 * retained ONLY as the legacy anchor of a schedule created before audiences
 * existed, and is nullable for everything created since.
 *
 * The weekly day/time columns and `startDate` are nullable because `one_time`
 * uses firstOpenAt/firstDeadlineAt and `manual` uses neither.
 */
export const recurrenceSchedules = pgTable(
  "recurrence_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    /** @deprecated legacy anchor; the audience is formScheduleSections */
    sectionId: uuid("section_id").references(() => classSections.id),
    /** @deprecated superseded by deliveryMode */
    frequency: recurrenceFrequency("frequency").notNull().default("weekly"),
    deliveryMode: formDeliveryMode("delivery_mode").notNull().default("weekly"),
    audienceMode: formAudienceMode("audience_mode")
      .notNull()
      .default("selected_sections"),
    /** `custom_recurring`: one instance every N weeks. 1 for plain weekly. */
    intervalWeeks: integer("interval_weeks").notNull().default(1),
    /** 0=Sunday..6=Saturday, in the schedule's timezone. Null for one_time/manual. */
    openDayOfWeek: smallint("open_day_of_week"),
    openTime: time("open_time"),
    deadlineDayOfWeek: smallint("deadline_day_of_week"),
    deadlineTime: time("deadline_time"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    occurrenceCount: integer("occurrence_count"),
    /** `one_time` only: the single window, stored absolutely. */
    firstOpenAt: timestamp("first_open_at", { withTimezone: true }),
    firstDeadlineAt: timestamp("first_deadline_at", { withTimezone: true }),
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
    check("recurrence_interval_weeks", sql`${t.intervalWeeks} BETWEEN 1 AND 12`),
    // A recurring schedule needs its weekly controls; a one-time one needs its
    // window. `manual` needs neither, which is why this is a disjunction rather
    // than four separate NOT NULLs.
    check(
      "recurrence_mode_fields",
      sql`(
        ${t.deliveryMode} = 'manual'
      ) OR (
        ${t.deliveryMode} = 'one_time'
        AND ${t.firstOpenAt} IS NOT NULL
        AND ${t.firstDeadlineAt} IS NOT NULL
        AND ${t.firstOpenAt} < ${t.firstDeadlineAt}
      ) OR (
        ${t.deliveryMode} IN ('weekly', 'custom_recurring')
        AND ${t.openDayOfWeek} IS NOT NULL
        AND ${t.openTime} IS NOT NULL
        AND ${t.deadlineDayOfWeek} IS NOT NULL
        AND ${t.deadlineTime} IS NOT NULL
        AND ${t.startDate} IS NOT NULL
      )`,
    ),
    index("recurrence_schedules_section_idx").on(t.sectionId),
    index("recurrence_schedules_course_idx").on(t.courseId),
    index("recurrence_schedules_template_idx").on(t.templateId),
  ],
);

/**
 * The audience of a delivery configuration: the sections whose students may
 * receive instances generated from it. Explicit rows so the audience is
 * auditable and can never be inferred from whichever page a teacher is on.
 */
export const formScheduleSections = pgTable(
  "form_schedule_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => recurrenceSchedules.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => classSections.id),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("form_schedule_section_unique").on(t.scheduleId, t.sectionId),
    index("form_schedule_sections_section_idx").on(t.sectionId),
  ],
);

/**
 * A **form instance**: the questionnaire students answer, with its own audience,
 * window, lifecycle state, and immutable question snapshot.
 *
 * Physical name `weekly_cycles` is historical (see
 * docs/FORMS-AUDIENCE-DYNAMIC-INSTANCES.md §6.1). Nothing user-facing says
 * "cycle", and `cycleIndex` is presented as a sequence number that only appears
 * when the delivery mode actually has one.
 *
 * `sectionId` is nullable and is NOT the audience: it is the legacy anchor of an
 * instance generated before audiences existed. Access decisions read
 * `formInstanceSections`. Making the column nullable was deliberate — it turns
 * every single-section assumption into a type error.
 */
export const formInstances = pgTable(
  "weekly_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    /** @deprecated legacy anchor; the audience is formInstanceSections */
    sectionId: uuid("section_id").references(() => classSections.id),
    scheduleId: uuid("schedule_id").references(() => recurrenceSchedules.id),
    deliveryMode: formDeliveryMode("delivery_mode").notNull().default("weekly"),
    /** 1-based occurrence index within its schedule */
    cycleIndex: integer("cycle_index").notNull(),
    openAt: timestamp("open_at", { withTimezone: true }).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    templateVersionId: uuid("template_version_id").references(
      () => templateVersions.id,
    ),
    /** Per-occurrence title override. Null = use the definition's title. */
    title: text("title"),
    /**
     * Optional focus for this occurrence ("Normalization"), shown to staff and —
     * when present — to students, because in that case it explains why this
     * week's form differs. Kept optional so ordinary forms stay plain.
     */
    focusLabel: text("focus_label"),
    topicId: uuid("topic_id").references(() => lessonsTopics.id),
    /** Set the first time this instance's own question snapshot is edited. */
    customizedAt: timestamp("customized_at", { withTimezone: true }),
    customizedByUserId: uuid("customized_by_user_id").references(
      () => users.id,
    ),
    state: weeklyCycleState("state").notNull().default("scheduled"),
    /**
     * Course-scoped bonus period this instance's credit rolls up into (D14).
     * A nullable FK is enough: one period per instance, so "at most one credit
     * per instance per period" needs no counter and no join table.
     */
    bonusPeriodId: uuid("bonus_period_id").references(() => bonusPeriods.id),
    bonusAssignmentSource: bonusAssignmentSource("bonus_assignment_source")
      .notNull()
      .default("auto"),
    /** Per-occurrence window override (project-specs.md §6.2 step 4). */
    windowOverriddenByUserId: uuid("window_overridden_by_user_id").references(
      () => users.id,
    ),
    windowOverriddenAt: timestamp("window_overridden_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Idempotent generation: re-running generation can never duplicate an
    // occurrence of the same schedule.
    uniqueIndex("weekly_cycle_schedule_index_unique")
      .on(t.scheduleId, t.cycleIndex)
      .where(sql`${t.scheduleId} IS NOT NULL`),
    /**
     * Closes the duplicate-occurrence hole for LEGACY per-section schedules: the
     * generator's overlap guard is a read-then-insert at READ COMMITTED, and the
     * (scheduleId, cycleIndex) index cannot see an instance belonging to a
     * DIFFERENT schedule. Now partial, because a course-level instance has no
     * anchor section; the equivalent guard for those is the audience-overlap
     * check in generateInstancesForSchedule.
     */
    uniqueIndex("weekly_cycle_section_open_unique")
      .on(t.sectionId, t.openAt)
      .where(sql`${t.sectionId} IS NOT NULL`),
    check("cycle_window_valid", sql`${t.openAt} < ${t.deadlineAt}`),
    index("weekly_cycles_section_idx").on(t.sectionId),
    index("weekly_cycles_course_idx").on(t.courseId),
    index("weekly_cycles_state_idx").on(t.state),
    index("weekly_cycles_period_idx").on(t.bonusPeriodId),
    index("weekly_cycles_template_version_idx").on(t.templateVersionId),
  ],
);

/**
 * Kept so existing imports of `weeklyCycles` keep compiling. New code should use
 * `formInstances`; the two are the same table.
 */
export const weeklyCycles = formInstances;

/**
 * The audience of one form instance: every section whose students may answer it.
 * THIS is what access decisions read.
 *
 * At least one row per instance is required. A CHECK cannot span tables, so the
 * rule is enforced by the three services that create instances and asserted by
 * integration tests (docs/FORMS-AUDIENCE-DYNAMIC-INSTANCES.md §6.3).
 */
export const formInstanceSections = pgTable(
  "form_instance_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => formInstances.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => classSections.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("form_instance_section_unique").on(t.instanceId, t.sectionId),
    index("form_instance_sections_section_idx").on(t.sectionId),
  ],
);

/**
 * A question either belongs to a definition version (definition-side) or is a
 * snapshot inside a form instance (instance-side) — exactly one of the two.
 *
 * `origin` is set on instance-side rows only, so the per-occurrence editor can
 * distinguish an inherited question from one edited or added for this occurrence
 * alone, and so exports can tell them apart.
 */
export const formQuestions = pgTable(
  "form_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id").references(() => formInstances.id),
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
    /** instance-side only: inherited / modified / instance_only */
    origin: instanceQuestionOrigin("origin"),
    /**
     * Stable identity across snapshot copies (definition question → instance
     * question), so exports/analytics can track a question across occurrences
     * even when one occurrence edited its wording.
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
    // An origin is meaningful only for an instance-side question.
    check(
      "question_origin_instance_only",
      sql`${t.origin} IS NULL OR ${t.cycleId} IS NOT NULL`,
    ),
    index("form_questions_cycle_idx").on(t.cycleId),
    index("form_questions_template_version_idx").on(t.templateVersionId),
    index("form_questions_stable_key_idx").on(t.stableKey),
  ],
);
