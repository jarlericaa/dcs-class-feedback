import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { enrollmentStatus, lessonTopicKind, sectionStaffRole } from "./enums";
import { studentRecords, users } from "./identity";

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    markValidity: boolean("mark_validity").notNull().default(false),
    exportParticipation: boolean("export_participation")
      .notNull()
      .default(false),
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
