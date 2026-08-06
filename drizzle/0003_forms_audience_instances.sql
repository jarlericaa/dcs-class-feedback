-- Course-level forms, shared audiences, and generalized form instances.
-- Model and rationale: docs/FORMS-AUDIENCE-DYNAMIC-INSTANCES.md
--
-- HAND-ORDERED. drizzle-kit emits `ADD COLUMN … NOT NULL` for the three total
-- columns this migration introduces, which fails against populated tables. Each
-- one is therefore added nullable, backfilled from the data it is derived from,
-- and only then constrained. Every existing row ends up as the single-section,
-- weekly-delivery form it already was; nothing is deleted or rewritten.

CREATE TYPE "public"."form_audience_mode" AS ENUM('all_sections', 'selected_sections');--> statement-breakpoint
CREATE TYPE "public"."form_delivery_mode" AS ENUM('one_time', 'weekly', 'custom_recurring', 'manual');--> statement-breakpoint
CREATE TYPE "public"."instance_question_origin" AS ENUM('inherited', 'modified', 'instance_only');--> statement-breakpoint
CREATE TABLE "form_instance_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_schedule_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- 1. Every new column, nullable.
ALTER TABLE "form_questions" ADD COLUMN "origin" "instance_question_origin";--> statement-breakpoint
ALTER TABLE "form_templates" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ADD COLUMN "course_id" uuid;--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ADD COLUMN "delivery_mode" "form_delivery_mode" DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ADD COLUMN "audience_mode" "form_audience_mode" DEFAULT 'selected_sections' NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ADD COLUMN "interval_weeks" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ADD COLUMN "first_open_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ADD COLUMN "first_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD COLUMN "course_id" uuid;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD COLUMN "delivery_mode" "form_delivery_mode" DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD COLUMN "focus_label" text;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD COLUMN "customized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD COLUMN "customized_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "form_responses" ADD COLUMN "section_id" uuid;--> statement-breakpoint

-- 2. Backfill. A pre-existing schedule/instance was per-section and weekly, so
--    its course comes from its section and its audience is that one section.
UPDATE "recurrence_schedules" AS s
   SET "course_id" = c."course_id"
  FROM "class_sections" AS c
 WHERE c."id" = s."section_id" AND s."course_id" IS NULL;--> statement-breakpoint
UPDATE "weekly_cycles" AS w
   SET "course_id" = c."course_id"
  FROM "class_sections" AS c
 WHERE c."id" = w."section_id" AND w."course_id" IS NULL;--> statement-breakpoint
INSERT INTO "form_schedule_sections" ("schedule_id", "section_id")
SELECT s."id", s."section_id"
  FROM "recurrence_schedules" AS s
 WHERE s."section_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "form_instance_sections" ("instance_id", "section_id")
SELECT w."id", w."section_id"
  FROM "weekly_cycles" AS w
 WHERE w."section_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- A response's attribution section is the section its instance belonged to.
UPDATE "form_responses" AS r
   SET "section_id" = w."section_id"
  FROM "weekly_cycles" AS w
 WHERE w."id" = r."cycle_id" AND r."section_id" IS NULL;--> statement-breakpoint
-- Every question already snapshotted into an instance was inherited from its
-- definition version; none of them was customized per occurrence.
UPDATE "form_questions"
   SET "origin" = 'inherited'
 WHERE "cycle_id" IS NOT NULL AND "origin" IS NULL;--> statement-breakpoint

-- 3. Now the three columns can be made total.
ALTER TABLE "recurrence_schedules" ALTER COLUMN "course_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ALTER COLUMN "course_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "form_responses" ALTER COLUMN "section_id" SET NOT NULL;--> statement-breakpoint

-- 4. The columns a non-weekly, non-section-scoped form does not have.
ALTER TABLE "recurrence_schedules" ALTER COLUMN "section_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ALTER COLUMN "open_day_of_week" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ALTER COLUMN "open_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ALTER COLUMN "deadline_day_of_week" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ALTER COLUMN "deadline_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ALTER COLUMN "start_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ALTER COLUMN "section_id" DROP NOT NULL;--> statement-breakpoint

-- 5. Keys, indexes, and checks.
ALTER TABLE "form_instance_sections" ADD CONSTRAINT "form_instance_sections_instance_id_weekly_cycles_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."weekly_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_instance_sections" ADD CONSTRAINT "form_instance_sections_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_schedule_sections" ADD CONSTRAINT "form_schedule_sections_schedule_id_recurrence_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."recurrence_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_schedule_sections" ADD CONSTRAINT "form_schedule_sections_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_schedule_sections" ADD CONSTRAINT "form_schedule_sections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "form_instance_section_unique" ON "form_instance_sections" USING btree ("instance_id","section_id");--> statement-breakpoint
CREATE INDEX "form_instance_sections_section_idx" ON "form_instance_sections" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_schedule_section_unique" ON "form_schedule_sections" USING btree ("schedule_id","section_id");--> statement-breakpoint
CREATE INDEX "form_schedule_sections_section_idx" ON "form_schedule_sections" USING btree ("section_id");--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ADD CONSTRAINT "recurrence_schedules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD CONSTRAINT "weekly_cycles_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD CONSTRAINT "weekly_cycles_topic_id_lessons_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."lessons_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD CONSTRAINT "weekly_cycles_customized_by_user_id_users_id_fk" FOREIGN KEY ("customized_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_questions_stable_key_idx" ON "form_questions" USING btree ("stable_key");--> statement-breakpoint
CREATE INDEX "recurrence_schedules_course_idx" ON "recurrence_schedules" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "recurrence_schedules_template_idx" ON "recurrence_schedules" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "weekly_cycles_course_idx" ON "weekly_cycles" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "weekly_cycles_template_version_idx" ON "weekly_cycles" USING btree ("template_version_id");--> statement-breakpoint
CREATE INDEX "form_responses_section_idx" ON "form_responses" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "form_responses_section_cycle_idx" ON "form_responses" USING btree ("section_id","cycle_id");--> statement-breakpoint
-- Now partial: a course-level instance has no anchor section, and Postgres would
-- otherwise treat the NULLs as distinct anyway. The equivalent guard for
-- course-level instances is the audience-overlap check in the generator.
DROP INDEX "weekly_cycle_section_open_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_cycle_section_open_unique" ON "weekly_cycles" USING btree ("section_id","open_at") WHERE "weekly_cycles"."section_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "form_questions" ADD CONSTRAINT "question_origin_instance_only" CHECK ("form_questions"."origin" IS NULL OR "form_questions"."cycle_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ADD CONSTRAINT "recurrence_interval_weeks" CHECK ("recurrence_schedules"."interval_weeks" BETWEEN 1 AND 12);--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ADD CONSTRAINT "recurrence_mode_fields" CHECK ((
        "recurrence_schedules"."delivery_mode" = 'manual'
      ) OR (
        "recurrence_schedules"."delivery_mode" = 'one_time'
        AND "recurrence_schedules"."first_open_at" IS NOT NULL
        AND "recurrence_schedules"."first_deadline_at" IS NOT NULL
        AND "recurrence_schedules"."first_open_at" < "recurrence_schedules"."first_deadline_at"
      ) OR (
        "recurrence_schedules"."delivery_mode" IN ('weekly', 'custom_recurring')
        AND "recurrence_schedules"."open_day_of_week" IS NOT NULL
        AND "recurrence_schedules"."open_time" IS NOT NULL
        AND "recurrence_schedules"."deadline_day_of_week" IS NOT NULL
        AND "recurrence_schedules"."deadline_time" IS NOT NULL
        AND "recurrence_schedules"."start_date" IS NOT NULL
      ));
