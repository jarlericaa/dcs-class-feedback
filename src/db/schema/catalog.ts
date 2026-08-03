import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  crsEnrollmentStatus,
  enrollmentStatus,
  lessonTopicKind,
  sectionStaffRole,
} from "./enums";
import { studentRecords, users } from "./identity";

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    active: boolean("active").notNull().default(true),
    /**
     * `archivedAt IS NOT NULL` is the authoritative read-only marker
     * (project-specs.md §11). Enforced inside the authorization helpers, not by
     * hiding controls: every require* helper refuses a write on an archived
     * course unless the caller explicitly opts in with `allowArchived`.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id").references(() => users.id),
    clonedFromCourseId: uuid("cloned_from_course_id"),
    /** Makes cloning idempotent under a double-submit or a retry. */
    cloneRequestToken: text("clone_request_token"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("courses_clone_token_unique")
      .on(t.cloneRequestToken)
      .where(sql`${t.cloneRequestToken} IS NOT NULL`),
    index("courses_archived_idx").on(t.archivedAt),
  ],
);

/**
 * A course-scoped long-exam bonus bucket (project-specs.md §6.5, decision D14).
 * Course-scoped rather than section-scoped so one "Long Exam 1" covers every
 * section of the course, survives a course clone, and gives an Instructor a
 * single cross-section export.
 */
export const bonusPeriods = pgTable(
  "bonus_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    name: text("name").notNull(),
    requiredCount: integer("required_count").notNull().default(0),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    /** Fallback for a cycle whose open date falls outside every window. */
    isDefault: boolean("is_default").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
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
    uniqueIndex("bonus_period_course_name_unique").on(t.courseId, t.name),
    uniqueIndex("bonus_period_one_default")
      .on(t.courseId)
      .where(sql`${t.isDefault} AND NOT ${t.archived}`),
    index("bonus_periods_course_idx").on(t.courseId),
    check("bonus_period_window_valid", sql`${t.startDate} <= ${t.endDate}`),
    check("bonus_period_required_nonneg", sql`${t.requiredCount} >= 0`),
  ],
);

export const courseStaff = pgTable(
  "course_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** course-level role label; authorization is resource-scoped membership */
    role: text("role").notNull().default("teacher"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("course_staff_unique").on(t.courseId, t.userId)],
);

export const classSections = pgTable(
  "class_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    term: text("term").notNull(),
    title: text("title").notNull(),
    /** Institution timezone by default (Open D7: Asia/Manila, owner-confirmed). */
    timezone: text("timezone").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("class_sections_course_idx").on(t.courseId)],
);

/**
 * Staff membership on a section with the per-section TA permission catalog
 * (roles-and-permissions.md §2.3). Flags are independent, deny-by-default.
 * `manage_course_materials` is deliberately OMITTED — course-material
 * management is post-MVP; the flag is reserved and will be added by migration
 * if/when approved.
 */
export const sectionStaff = pgTable(
  "section_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => classSections.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: sectionStaffRole("role").notNull(),
    viewStudentIdentities: boolean("view_student_identities")
      .notNull()
      .default(false),
    reviewResponses: boolean("review_responses").notNull().default(false),
    sendPrivateResponses: boolean("send_private_responses")
      .notNull()
      .default(false),
    draftPublicAnswers: boolean("draft_public_answers")
      .notNull()
      .default(false),
    rewordPublicQuestions: boolean("reword_public_questions")
      .notNull()
      .default(false),
    publishPublicAnswers: boolean("publish_public_answers")
      .notNull()
      .default(false),
    schedulePublication: boolean("schedule_publication")
      .notNull()
      .default(false),
    /**
     * A Student Assistant may FLAG a submission (reason required) but can never
     * finalize invalidation — finalizing additionally requires a non-TA section
     * role, so holding `markValidity` is not enough (project-specs.md §4.2).
     */
    flagValidity: boolean("flag_validity").notNull().default(false),
    markValidity: boolean("mark_validity").notNull().default(false),
    exportParticipation: boolean("export_participation")
      .notNull()
      .default(false),
    /** Approve/reject/remove comments and lock a discussion (P2). */
    moderateDiscussion: boolean("moderate_discussion").notNull().default(false),
    manageWeeklyCycles: boolean("manage_weekly_cycles")
      .notNull()
      .default(false),
    manageTemplates: boolean("manage_templates").notNull().default(false),
    manageBacklogImports: boolean("manage_backlog_imports")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("section_staff_unique").on(t.sectionId, t.userId),
    index("section_staff_user_idx").on(t.userId),
  ],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => classSections.id),
    studentRecordId: uuid("student_record_id")
      .notNull()
      .references(() => studentRecords.id),
    status: enrollmentStatus("status").notNull().default("active"),
    /**
     * Name exactly as it appeared in this section's roster import.
     * Keeps per-section snapshots so re-imports never silently overwrite
     * the canonical studentRecords.fullName.
     */
    rosterName: text("roster_name").notNull(),
    sourceImportBatchId: uuid("source_import_batch_id"),
    lastImportBatchId: uuid("last_import_batch_id"),
    // --- CRS snapshot for this section (project-specs.md §6.1 step 5) ---
    /** The spreadsheet cell verbatim, so a mapping change can be re-derived. */
    crsStatusRaw: text("crs_status_raw"),
    crsStatus: crsEnrollmentStatus("crs_status").notNull().default("unknown"),
    enlistmentDate: timestamp("enlistment_date", { withTimezone: true }),
    program: text("program"),
    livedNameSnapshot: text("lived_name_snapshot"),
    pronounSnapshot: text("pronoun_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("enrollment_unique").on(t.sectionId, t.studentRecordId),
    index("enrollments_student_idx").on(t.studentRecordId),
    index("enrollments_crs_status_idx").on(t.sectionId, t.crsStatus),
  ],
);

export const lessonsTopics = pgTable(
  "lessons_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    title: text("title").notNull(),
    kind: lessonTopicKind("kind").notNull().default("topic"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("lessons_topics_course_idx").on(t.courseId)],
);
