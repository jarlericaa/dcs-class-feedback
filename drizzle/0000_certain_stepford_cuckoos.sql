CREATE TYPE "public"."account_match_method" AS ENUM('auto_pipeline', 'teacher', 'manual_correction');--> statement-breakpoint
CREATE TYPE "public"."account_match_state" AS ENUM('unmatched', 'candidate', 'ambiguous', 'confirmed', 'rejected', 'correction_pending');--> statement-breakpoint
CREATE TYPE "public"."backlog_provenance" AS ENUM('current_copied', 'current_moved', 'legacy_import', 'manual_entry');--> statement-breakpoint
CREATE TYPE "public"."backlog_question_state" AS ENUM('imported', 'needs_review', 'answerable', 'drafting', 'scheduled', 'published', 'archived', 'not_suitable');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."form_response_state" AS ENUM('submitted', 'under_review', 'reviewed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."import_batch_kind" AS ENUM('roster', 'legacy');--> statement-breakpoint
CREATE TYPE "public"."invalidation_reason" AS ENUM('spam', 'abusive_content', 'empty_or_meaningless', 'irrelevant', 'bad_faith_credit_attempt');--> statement-breakpoint
CREATE TYPE "public"."item_review_state" AS ENUM('new', 'under_review', 'resolved', 'archived', 'moved_to_backlog');--> statement-breakpoint
CREATE TYPE "public"."lesson_topic_kind" AS ENUM('lesson', 'lecture', 'module', 'topic');--> statement-breakpoint
CREATE TYPE "public"."participation_validity" AS ENUM('valid', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."public_answer_state" AS ENUM('draft', 'scheduled', 'published', 'unpublished');--> statement-breakpoint
CREATE TYPE "public"."question_category" AS ENUM('content', 'logistics', 'misc');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('short_answer', 'paragraph', 'multiple_choice', 'checkboxes', 'dropdown', 'linear_scale', 'yes_no', 'date', 'time');--> statement-breakpoint
CREATE TYPE "public"."recurrence_frequency" AS ENUM('weekly');--> statement-breakpoint
CREATE TYPE "public"."response_disposition" AS ENUM('undecided', 'private', 'public', 'private_and_public', 'no_response', 'merged');--> statement-breakpoint
CREATE TYPE "public"."section_staff_role" AS ENUM('teacher', 'ta', 'co_teacher');--> statement-breakpoint
CREATE TYPE "public"."source_origin" AS ENUM('current', 'legacy', 'staff_curated');--> statement-breakpoint
CREATE TYPE "public"."submission_item_type" AS ENUM('question', 'feedback', 'concern', 'clarification', 'suggestion');--> statement-breakpoint
CREATE TYPE "public"."template_visibility" AS ENUM('private', 'course_shared');--> statement-breakpoint
CREATE TYPE "public"."weekly_cycle_state" AS ENUM('draft', 'scheduled', 'open', 'closed', 'archived', 'skipped');--> statement-breakpoint
CREATE TABLE "account_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"student_record_id" uuid,
	"state" "account_match_state" NOT NULL,
	"method" "account_match_method" DEFAULT 'auto_pipeline' NOT NULL,
	"confidence" jsonb,
	"confirmed_by_user_id" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_match_record_presence" CHECK (("account_matches"."state" = 'unmatched') = ("account_matches"."student_record_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "student_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_number" text NOT NULL,
	"full_name" text NOT NULL,
	"normalized_full_name" text NOT NULL,
	"normalized_tokens" text NOT NULL,
	"created_by_import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_records_student_number_unique" UNIQUE("student_number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"is_teacher" boolean DEFAULT false NOT NULL,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "class_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"term" text NOT NULL,
	"title" text NOT NULL,
	"timezone" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'teacher' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"student_record_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"roster_name" text NOT NULL,
	"source_import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "lesson_topic_kind" DEFAULT 'topic' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "section_staff_role" NOT NULL,
	"view_student_identities" boolean DEFAULT false NOT NULL,
	"review_responses" boolean DEFAULT false NOT NULL,
	"send_private_responses" boolean DEFAULT false NOT NULL,
	"draft_public_answers" boolean DEFAULT false NOT NULL,
	"reword_public_questions" boolean DEFAULT false NOT NULL,
	"publish_public_answers" boolean DEFAULT false NOT NULL,
	"schedule_publication" boolean DEFAULT false NOT NULL,
	"mark_validity" boolean DEFAULT false NOT NULL,
	"export_participation" boolean DEFAULT false NOT NULL,
	"manage_weekly_cycles" boolean DEFAULT false NOT NULL,
	"manage_templates" boolean DEFAULT false NOT NULL,
	"manage_backlog_imports" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid,
	"template_version_id" uuid,
	"prompt" text NOT NULL,
	"description" text,
	"type" "question_type" NOT NULL,
	"options" jsonb,
	"scale" jsonb,
	"validation" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"category" "question_category",
	"topic_id" uuid,
	"stable_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_owner_one_of" CHECK (("form_questions"."cycle_id" IS NULL) <> ("form_questions"."template_version_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "form_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"visibility" "template_visibility" DEFAULT 'private' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurrence_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"frequency" "recurrence_frequency" DEFAULT 'weekly' NOT NULL,
	"open_day_of_week" smallint NOT NULL,
	"open_time" time NOT NULL,
	"deadline_day_of_week" smallint NOT NULL,
	"deadline_time" time NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"occurrence_count" integer,
	"template_id" uuid NOT NULL,
	"timezone" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurrence_end_condition" CHECK (NOT ("recurrence_schedules"."end_date" IS NOT NULL AND "recurrence_schedules"."occurrence_count" IS NOT NULL)),
	CONSTRAINT "recurrence_days_valid" CHECK ("recurrence_schedules"."open_day_of_week" BETWEEN 0 AND 6 AND "recurrence_schedules"."deadline_day_of_week" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"schedule_id" uuid,
	"cycle_index" integer NOT NULL,
	"open_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"template_version_id" uuid,
	"state" "weekly_cycle_state" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycle_window_valid" CHECK ("weekly_cycles"."open_at" < "weekly_cycles"."deadline_at")
);
--> statement-breakpoint
CREATE TABLE "form_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"student_record_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" "form_response_state" DEFAULT 'submitted' NOT NULL,
	"validity" "participation_validity" DEFAULT 'valid' NOT NULL,
	"invalidation_reason" "invalidation_reason",
	"invalidation_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"value" jsonb,
	"free_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_submission_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"submission_type" "submission_item_type" NOT NULL,
	"category" "question_category" NOT NULL,
	"topic_id" uuid,
	"original_text" text NOT NULL,
	"review_state" "item_review_state" DEFAULT 'new' NOT NULL,
	"disposition" "response_disposition" DEFAULT 'undecided' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"public_question_text" text NOT NULL,
	"answer_body" text,
	"state" "public_answer_state" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"publish_failed" boolean DEFAULT false NOT NULL,
	"publish_failure_reason" text,
	"published_late" boolean DEFAULT false NOT NULL,
	"category" "question_category",
	"topic_id" uuid,
	"source_origin" "source_origin" DEFAULT 'current' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_requires_time" CHECK ("public_answers"."state" <> 'scheduled' OR "public_answers"."scheduled_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_answer_id" uuid NOT NULL,
	"item_id" uuid,
	"backlog_question_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_link_one_of" CHECK (("source_links"."item_id" IS NULL) <> ("source_links"."backlog_question_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "backlog_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"text" text NOT NULL,
	"category" "question_category",
	"topic_id" uuid,
	"state" "backlog_question_state" DEFAULT 'imported' NOT NULL,
	"provenance" "backlog_provenance" NOT NULL,
	"identity_preserved" boolean DEFAULT false NOT NULL,
	"source_item_id" uuid,
	"previously_answered" boolean DEFAULT false NOT NULL,
	"prior_answer_text" text,
	"import_batch_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "import_batch_kind" NOT NULL,
	"source_description" text NOT NULL,
	"course_id" uuid,
	"section_id" uuid,
	"importer_user_id" uuid NOT NULL,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_backlog_visibility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_question_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"made_visible_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_matches" ADD CONSTRAINT "account_matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_matches" ADD CONSTRAINT "account_matches_student_record_id_student_records_id_fk" FOREIGN KEY ("student_record_id") REFERENCES "public"."student_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_matches" ADD CONSTRAINT "account_matches_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_staff" ADD CONSTRAINT "course_staff_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_staff" ADD CONSTRAINT "course_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_record_id_student_records_id_fk" FOREIGN KEY ("student_record_id") REFERENCES "public"."student_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons_topics" ADD CONSTRAINT "lessons_topics_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_staff" ADD CONSTRAINT "section_staff_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_staff" ADD CONSTRAINT "section_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_cycle_id_weekly_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."weekly_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_topic_id_lessons_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."lessons_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ADD CONSTRAINT "recurrence_schedules_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_schedules" ADD CONSTRAINT "recurrence_schedules_template_id_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."form_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."form_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD CONSTRAINT "weekly_cycles_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD CONSTRAINT "weekly_cycles_schedule_id_recurrence_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."recurrence_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD CONSTRAINT "weekly_cycles_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_cycle_id_weekly_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."weekly_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_student_record_id_student_records_id_fk" FOREIGN KEY ("student_record_id") REFERENCES "public"."student_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_responses" ADD CONSTRAINT "private_responses_item_id_student_submission_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."student_submission_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_responses" ADD CONSTRAINT "private_responses_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_answers" ADD CONSTRAINT "question_answers_response_id_form_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."form_responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_answers" ADD CONSTRAINT "question_answers_question_id_form_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."form_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_submission_items" ADD CONSTRAINT "student_submission_items_response_id_form_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."form_responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_submission_items" ADD CONSTRAINT "student_submission_items_topic_id_lessons_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."lessons_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answers" ADD CONSTRAINT "public_answers_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answers" ADD CONSTRAINT "public_answers_topic_id_lessons_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."lessons_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answers" ADD CONSTRAINT "public_answers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_links" ADD CONSTRAINT "source_links_public_answer_id_public_answers_id_fk" FOREIGN KEY ("public_answer_id") REFERENCES "public"."public_answers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_links" ADD CONSTRAINT "source_links_item_id_student_submission_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."student_submission_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_links" ADD CONSTRAINT "source_links_backlog_question_id_backlog_questions_id_fk" FOREIGN KEY ("backlog_question_id") REFERENCES "public"."backlog_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_links" ADD CONSTRAINT "source_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD CONSTRAINT "backlog_questions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD CONSTRAINT "backlog_questions_topic_id_lessons_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."lessons_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD CONSTRAINT "backlog_questions_source_item_id_student_submission_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."student_submission_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD CONSTRAINT "backlog_questions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD CONSTRAINT "backlog_questions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_importer_user_id_users_id_fk" FOREIGN KEY ("importer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_backlog_visibility" ADD CONSTRAINT "section_backlog_visibility_backlog_question_id_backlog_questions_id_fk" FOREIGN KEY ("backlog_question_id") REFERENCES "public"."backlog_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_backlog_visibility" ADD CONSTRAINT "section_backlog_visibility_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_backlog_visibility" ADD CONSTRAINT "section_backlog_visibility_made_visible_by_user_id_users_id_fk" FOREIGN KEY ("made_visible_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_confirmed_match_per_user" ON "account_matches" USING btree ("user_id") WHERE "account_matches"."state" = 'confirmed';--> statement-breakpoint
CREATE UNIQUE INDEX "one_confirmed_match_per_student_record" ON "account_matches" USING btree ("student_record_id") WHERE "account_matches"."state" = 'confirmed';--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_student_record_pair" ON "account_matches" USING btree ("user_id","student_record_id") WHERE "account_matches"."student_record_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "account_matches_user_idx" ON "account_matches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_matches_state_idx" ON "account_matches" USING btree ("state");--> statement-breakpoint
CREATE INDEX "class_sections_course_idx" ON "class_sections" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_staff_unique" ON "course_staff" USING btree ("course_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_unique" ON "enrollments" USING btree ("section_id","student_record_id");--> statement-breakpoint
CREATE INDEX "enrollments_student_idx" ON "enrollments" USING btree ("student_record_id");--> statement-breakpoint
CREATE INDEX "lessons_topics_course_idx" ON "lessons_topics" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "section_staff_unique" ON "section_staff" USING btree ("section_id","user_id");--> statement-breakpoint
CREATE INDEX "section_staff_user_idx" ON "section_staff" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "form_questions_cycle_idx" ON "form_questions" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "form_questions_template_version_idx" ON "form_questions" USING btree ("template_version_id");--> statement-breakpoint
CREATE INDEX "form_templates_course_idx" ON "form_templates" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "recurrence_schedules_section_idx" ON "recurrence_schedules" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_version_unique" ON "template_versions" USING btree ("template_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_cycle_schedule_index_unique" ON "weekly_cycles" USING btree ("schedule_id","cycle_index") WHERE "weekly_cycles"."schedule_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "weekly_cycles_section_idx" ON "weekly_cycles" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "weekly_cycles_state_idx" ON "weekly_cycles" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "one_response_per_cycle_student" ON "form_responses" USING btree ("cycle_id","student_record_id");--> statement-breakpoint
CREATE INDEX "form_responses_student_idx" ON "form_responses" USING btree ("student_record_id");--> statement-breakpoint
CREATE INDEX "form_responses_cycle_idx" ON "form_responses" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "private_responses_item_idx" ON "private_responses" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_answer_per_question" ON "question_answers" USING btree ("response_id","question_id");--> statement-breakpoint
CREATE INDEX "question_answers_response_idx" ON "question_answers" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "submission_items_response_idx" ON "student_submission_items" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "public_answers_section_idx" ON "public_answers" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "public_answers_state_idx" ON "public_answers" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "source_link_item_unique" ON "source_links" USING btree ("public_answer_id","item_id") WHERE "source_links"."item_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "source_link_backlog_unique" ON "source_links" USING btree ("public_answer_id","backlog_question_id") WHERE "source_links"."backlog_question_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "source_links_item_idx" ON "source_links" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "source_links_answer_idx" ON "source_links" USING btree ("public_answer_id");--> statement-breakpoint
CREATE INDEX "backlog_questions_course_idx" ON "backlog_questions" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "backlog_questions_state_idx" ON "backlog_questions" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "section_backlog_visibility_unique" ON "section_backlog_visibility" USING btree ("backlog_question_id","section_id");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");