CREATE TYPE "public"."approval_decision" AS ENUM('requested', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."backlog_confirmation" AS ENUM('recommended', 'confirmed', 'rejected', 'removal_recommended', 'removed');--> statement-breakpoint
CREATE TYPE "public"."backlog_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."backlog_recommendation_kind" AS ENUM('add', 'remove');--> statement-breakpoint
CREATE TYPE "public"."bonus_assignment_source" AS ENUM('auto', 'staff_override');--> statement-breakpoint
CREATE TYPE "public"."comment_state" AS ENUM('pending', 'approved', 'rejected', 'removed');--> statement-breakpoint
CREATE TYPE "public"."crs_enrollment_status" AS ENUM('enrolled', 'not_enrolled', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."email_delivery_state" AS ENUM('pending', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."email_event_type" AS ENUM('form_opened', 'deadline_reminder', 'private_answer_received', 'public_answer_linked', 'submission_invalidated', 'submission_restored', 'approval_requested', 'approval_decided', 'backlog_assigned');--> statement-breakpoint
CREATE TYPE "public"."legacy_row_state" AS ENUM('parsed', 'error', 'needs_attention', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."legacy_source_kind" AS ENUM('typst', 'csv', 'xlsx', 'paste');--> statement-breakpoint
CREATE TYPE "public"."merge_group_state" AS ENUM('active', 'unmerged');--> statement-breakpoint
CREATE TYPE "public"."private_message_role" AS ENUM('staff', 'student');--> statement-breakpoint
CREATE TYPE "public"."reaction_kind" AS ENUM('helpful', 'thanks', 'same_question');--> statement-breakpoint
CREATE TYPE "public"."recommendation_state" AS ENUM('pending', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."response_lifecycle" AS ENUM('draft', 'submitted', 'locked');--> statement-breakpoint
CREATE TYPE "public"."response_revision_action" AS ENUM('draft_saved', 'submitted', 'edited', 'locked', 'unlocked');--> statement-breakpoint
CREATE TYPE "public"."roster_claim_reason" AS ENUM('no_roster_match', 'name_mismatch', 'name_ambiguous', 'already_claimed', 'user_already_confirmed', 'policy_confirm_all', 'exact_name_match');--> statement-breakpoint
CREATE TYPE "public"."roster_claim_state" AS ENUM('pending', 'auto_confirmed', 'confirmed', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."submission_item_kind" AS ENUM('question', 'general_comment');--> statement-breakpoint
CREATE TYPE "public"."submission_validity" AS ENUM('valid', 'flagged', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."validity_action" AS ENUM('flag', 'confirm_flag', 'reject_flag', 'invalidate', 'restore');--> statement-breakpoint
CREATE TABLE "roster_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"typed_number_ciphertext" text NOT NULL,
	"typed_number_hash" text NOT NULL,
	"typed_number_last4" text NOT NULL,
	"matched_student_record_id" uuid,
	"account_match_id" uuid,
	"google_display_name_at_claim" text NOT NULL,
	"name_score" real,
	"state" "roster_claim_state" DEFAULT 'pending' NOT NULL,
	"reason" "roster_claim_reason" NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonus_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"required_count" integer DEFAULT 0 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bonus_period_window_valid" CHECK ("bonus_periods"."start_date" <= "bonus_periods"."end_date"),
	CONSTRAINT "bonus_period_required_nonneg" CHECK ("bonus_periods"."required_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "form_response_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" "response_revision_action" NOT NULL,
	"actor_user_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_validity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"action" "validity_action" NOT NULL,
	"prior_validity" "submission_validity" NOT NULL,
	"new_validity" "submission_validity" NOT NULL,
	"reason" "invalidation_reason",
	"staff_note" text,
	"student_visible_reason" text,
	"actor_user_id" uuid NOT NULL,
	"actor_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validity_event_transition" CHECK ("submission_validity_events"."prior_validity" <> "submission_validity_events"."new_validity"),
	CONSTRAINT "validity_event_reason" CHECK ("submission_validity_events"."action" IN ('reject_flag', 'restore') OR "submission_validity_events"."reason" IS NOT NULL),
	CONSTRAINT "validity_event_student_reason" CHECK ("submission_validity_events"."new_validity" <> 'invalid' OR "submission_validity_events"."student_visible_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "public_answer_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_answer_id" uuid NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_reason_on_reject" CHECK ("public_answer_approvals"."decision" <> 'rejected' OR "public_answer_approvals"."reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "public_answer_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_answer_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"prior_question_text" text NOT NULL,
	"prior_answer_text" text,
	"editor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backlog_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"kind" "backlog_recommendation_kind" NOT NULL,
	"state" "recommendation_state" DEFAULT 'pending' NOT NULL,
	"source_item_id" uuid,
	"backlog_question_id" uuid,
	"created_backlog_question_id" uuid,
	"preserve_source" boolean DEFAULT false NOT NULL,
	"reason" text,
	"recommended_by_user_id" uuid NOT NULL,
	"recommended_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	CONSTRAINT "rec_target_present" CHECK ("backlog_recommendations"."source_item_id" IS NOT NULL OR "backlog_recommendations"."backlog_question_id" IS NOT NULL),
	CONSTRAINT "rec_remove_target" CHECK ("backlog_recommendations"."kind" <> 'remove' OR "backlog_recommendations"."backlog_question_id" IS NOT NULL),
	CONSTRAINT "rec_decided_stamp" CHECK ("backlog_recommendations"."state" = 'pending' OR ("backlog_recommendations"."decided_by_user_id" IS NOT NULL AND "backlog_recommendations"."decided_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "legacy_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"source_kind" "legacy_source_kind" NOT NULL,
	"raw_text" text NOT NULL,
	"question_text" text,
	"answer_text" text,
	"detected_category" "question_category",
	"topic_hint" text,
	"source_student_record_id" uuid,
	"state" "legacy_row_state" DEFAULT 'parsed' NOT NULL,
	"error_message" text,
	"mapped_backlog_question_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_row_error_message" CHECK ("legacy_import_rows"."state" <> 'error' OR "legacy_import_rows"."error_message" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "question_merge_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"section_id" uuid,
	"merged_question_text" text NOT NULL,
	"primary_item_id" uuid,
	"primary_backlog_question_id" uuid,
	"backlog_question_id" uuid,
	"public_answer_id" uuid,
	"state" "merge_group_state" DEFAULT 'active' NOT NULL,
	"merge_key" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"unmerged_by_user_id" uuid,
	"unmerged_at" timestamp with time zone,
	"unmerge_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merge_primary_one_of" CHECK (("question_merge_groups"."primary_item_id" IS NULL) <> ("question_merge_groups"."primary_backlog_question_id" IS NULL)),
	CONSTRAINT "merge_unmerged_stamp" CHECK ("question_merge_groups"."state" <> 'unmerged' OR ("question_merge_groups"."unmerged_by_user_id" IS NOT NULL AND "question_merge_groups"."unmerged_at" IS NOT NULL)),
	CONSTRAINT "merge_public_needs_section" CHECK ("question_merge_groups"."public_answer_id" IS NULL OR "question_merge_groups"."section_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "question_merge_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"item_id" uuid,
	"backlog_question_id" uuid,
	"prior_disposition" "response_disposition",
	"prior_review_state" "item_review_state",
	"added_by_user_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_by_user_id" uuid,
	"removed_at" timestamp with time zone,
	CONSTRAINT "merge_member_one_of" CHECK (("question_merge_members"."item_id" IS NULL) <> ("question_merge_members"."backlog_question_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "prompt_analysis_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"question_stable_key" uuid NOT NULL,
	"cycle_id" uuid,
	"bonus_period_id" uuid,
	"body" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_note_body_present" CHECK (length(btrim("prompt_analysis_notes"."body")) > 0)
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" "email_event_type" NOT NULL,
	"idempotency_key" text NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"section_id" uuid,
	"course_id" uuid,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"body_html" text,
	"link_path" text NOT NULL,
	"state" "email_delivery_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"provider_message_id" text,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_sent_requires_time" CHECK ("email_outbox"."state" <> 'sent' OR "email_outbox"."sent_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "public_answer_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_answer_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"state" "comment_state" DEFAULT 'pending' NOT NULL,
	"moderated_by_user_id" uuid,
	"moderated_at" timestamp with time zone,
	"moderation_reason" text,
	"client_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_moderation_consistency" CHECK (("public_answer_comments"."moderated_at" IS NULL) = ("public_answer_comments"."moderated_by_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "public_answer_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_answer_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "reaction_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "student_records" DROP CONSTRAINT "student_records_student_number_unique";--> statement-breakpoint
ALTER TABLE "student_records" ALTER COLUMN "student_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "form_responses" ALTER COLUMN "submitted_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "form_responses" ALTER COLUMN "submitted_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "form_responses" ALTER COLUMN "validity" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "form_responses" ALTER COLUMN "validity" SET DATA TYPE "public"."submission_validity" USING "validity"::text::"public"."submission_validity";--> statement-breakpoint
ALTER TABLE "form_responses" ALTER COLUMN "validity" SET DEFAULT 'valid';--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "unlinked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "unlinked_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "account_matches" ADD COLUMN "unlink_reason" text;--> statement-breakpoint
ALTER TABLE "student_records" ADD COLUMN "student_number_ciphertext" text;--> statement-breakpoint
ALTER TABLE "student_records" ADD COLUMN "student_number_hash" text;--> statement-breakpoint
ALTER TABLE "student_records" ADD COLUMN "student_number_last4" text;--> statement-breakpoint
ALTER TABLE "student_records" ADD COLUMN "enc_key_version" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_records" ADD COLUMN "family_name" text;--> statement-breakpoint
ALTER TABLE "student_records" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "student_records" ADD COLUMN "lived_name" text;--> statement-breakpoint
ALTER TABLE "student_records" ADD COLUMN "preferred_pronoun" text;--> statement-breakpoint
ALTER TABLE "student_records" ADD COLUMN "program" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "archived_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "cloned_from_course_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "clone_request_token" text;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "last_import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "crs_status_raw" text;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "crs_status" "crs_enrollment_status" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "enlistment_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "program" text;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "lived_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "pronoun_snapshot" text;--> statement-breakpoint
ALTER TABLE "section_staff" ADD COLUMN "flag_validity" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "section_staff" ADD COLUMN "moderate_discussion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "template_versions" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "template_versions" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "template_versions" ADD COLUMN "max_student_questions" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "template_versions" ADD COLUMN "student_question_prompt" text;--> statement-breakpoint
ALTER TABLE "template_versions" ADD COLUMN "general_comment_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "template_versions" ADD COLUMN "general_comment_prompt" text;--> statement-breakpoint
ALTER TABLE "template_versions" ADD COLUMN "general_comment_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD COLUMN "bonus_period_id" uuid;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD COLUMN "bonus_assignment_source" "bonus_assignment_source" DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD COLUMN "window_overridden_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD COLUMN "window_overridden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "form_responses" ADD COLUMN "lifecycle" "response_lifecycle" DEFAULT 'submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "form_responses" ADD COLUMN "last_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "form_responses" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "form_responses" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "form_responses" ADD COLUMN "student_visible_reason" text;--> statement-breakpoint
ALTER TABLE "form_responses" ADD COLUMN "validity_updated_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "form_responses" ADD COLUMN "validity_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "private_responses" ADD COLUMN "author_role" "private_message_role" DEFAULT 'staff' NOT NULL;--> statement-breakpoint
ALTER TABLE "private_responses" ADD COLUMN "client_token" text;--> statement-breakpoint
ALTER TABLE "private_responses" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "private_responses" ADD COLUMN "removed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "private_responses" ADD COLUMN "removed_reason" text;--> statement-breakpoint
ALTER TABLE "question_answers" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "student_submission_items" ADD COLUMN "kind" "submission_item_kind" DEFAULT 'question' NOT NULL;--> statement-breakpoint
ALTER TABLE "student_submission_items" ADD COLUMN "ordinal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_submission_items" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_submission_items" ADD COLUMN "superseded_by_item_id" uuid;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "request_token" text;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "submitted_for_approval_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "submitted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "last_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "revision_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "unpublished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "unpublished_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "unpublish_reason" text;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "source_cycle_id" uuid;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "bonus_period_id" uuid;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "discussion_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "discussion_locked_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "comments_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "reactions_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "public_answers" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, coalesce(public_question_text, '') || ' ' || coalesce(answer_body, ''))) STORED;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD COLUMN "confirmation" "backlog_confirmation" DEFAULT 'recommended' NOT NULL;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD COLUMN "confirmed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD COLUMN "priority" "backlog_priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD COLUMN "assignee_user_id" uuid;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD COLUMN "target_date" date;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD COLUMN "draft_answer_text" text;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD COLUMN "draft_updated_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD COLUMN "draft_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD COLUMN "legacy_row_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "source_kind" "legacy_source_kind";--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "preserve_identity" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "field_mapping" jsonb;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "request_token" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "committed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "committed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "course_id" uuid;--> statement-breakpoint
ALTER TABLE "roster_claims" ADD CONSTRAINT "roster_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_claims" ADD CONSTRAINT "roster_claims_matched_student_record_id_student_records_id_fk" FOREIGN KEY ("matched_student_record_id") REFERENCES "public"."student_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_claims" ADD CONSTRAINT "roster_claims_account_match_id_account_matches_id_fk" FOREIGN KEY ("account_match_id") REFERENCES "public"."account_matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_claims" ADD CONSTRAINT "roster_claims_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_periods" ADD CONSTRAINT "bonus_periods_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_periods" ADD CONSTRAINT "bonus_periods_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_response_revisions" ADD CONSTRAINT "form_response_revisions_response_id_form_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."form_responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_response_revisions" ADD CONSTRAINT "form_response_revisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_validity_events" ADD CONSTRAINT "submission_validity_events_response_id_form_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."form_responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_validity_events" ADD CONSTRAINT "submission_validity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answer_approvals" ADD CONSTRAINT "public_answer_approvals_public_answer_id_public_answers_id_fk" FOREIGN KEY ("public_answer_id") REFERENCES "public"."public_answers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answer_approvals" ADD CONSTRAINT "public_answer_approvals_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answer_revisions" ADD CONSTRAINT "public_answer_revisions_public_answer_id_public_answers_id_fk" FOREIGN KEY ("public_answer_id") REFERENCES "public"."public_answers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answer_revisions" ADD CONSTRAINT "public_answer_revisions_editor_user_id_users_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_recommendations" ADD CONSTRAINT "backlog_recommendations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_recommendations" ADD CONSTRAINT "backlog_recommendations_source_item_id_student_submission_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."student_submission_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_recommendations" ADD CONSTRAINT "backlog_recommendations_backlog_question_id_backlog_questions_id_fk" FOREIGN KEY ("backlog_question_id") REFERENCES "public"."backlog_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_recommendations" ADD CONSTRAINT "backlog_recommendations_created_backlog_question_id_backlog_questions_id_fk" FOREIGN KEY ("created_backlog_question_id") REFERENCES "public"."backlog_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_recommendations" ADD CONSTRAINT "backlog_recommendations_recommended_by_user_id_users_id_fk" FOREIGN KEY ("recommended_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_recommendations" ADD CONSTRAINT "backlog_recommendations_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_import_rows" ADD CONSTRAINT "legacy_import_rows_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_import_rows" ADD CONSTRAINT "legacy_import_rows_source_student_record_id_student_records_id_fk" FOREIGN KEY ("source_student_record_id") REFERENCES "public"."student_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_merge_groups" ADD CONSTRAINT "question_merge_groups_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_merge_groups" ADD CONSTRAINT "question_merge_groups_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_merge_groups" ADD CONSTRAINT "question_merge_groups_primary_item_id_student_submission_items_id_fk" FOREIGN KEY ("primary_item_id") REFERENCES "public"."student_submission_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_merge_groups" ADD CONSTRAINT "question_merge_groups_primary_backlog_question_id_backlog_questions_id_fk" FOREIGN KEY ("primary_backlog_question_id") REFERENCES "public"."backlog_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_merge_groups" ADD CONSTRAINT "question_merge_groups_backlog_question_id_backlog_questions_id_fk" FOREIGN KEY ("backlog_question_id") REFERENCES "public"."backlog_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_merge_groups" ADD CONSTRAINT "question_merge_groups_public_answer_id_public_answers_id_fk" FOREIGN KEY ("public_answer_id") REFERENCES "public"."public_answers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_merge_groups" ADD CONSTRAINT "question_merge_groups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_merge_groups" ADD CONSTRAINT "question_merge_groups_unmerged_by_user_id_users_id_fk" FOREIGN KEY ("unmerged_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_merge_members" ADD CONSTRAINT "question_merge_members_group_id_question_merge_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."question_merge_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_merge_members" ADD CONSTRAINT "question_merge_members_item_id_student_submission_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."student_submission_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_merge_members" ADD CONSTRAINT "question_merge_members_backlog_question_id_backlog_questions_id_fk" FOREIGN KEY ("backlog_question_id") REFERENCES "public"."backlog_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_merge_members" ADD CONSTRAINT "question_merge_members_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_merge_members" ADD CONSTRAINT "question_merge_members_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_analysis_notes" ADD CONSTRAINT "prompt_analysis_notes_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_analysis_notes" ADD CONSTRAINT "prompt_analysis_notes_cycle_id_weekly_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."weekly_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_analysis_notes" ADD CONSTRAINT "prompt_analysis_notes_bonus_period_id_bonus_periods_id_fk" FOREIGN KEY ("bonus_period_id") REFERENCES "public"."bonus_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_analysis_notes" ADD CONSTRAINT "prompt_analysis_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_analysis_notes" ADD CONSTRAINT "prompt_analysis_notes_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answer_comments" ADD CONSTRAINT "public_answer_comments_public_answer_id_public_answers_id_fk" FOREIGN KEY ("public_answer_id") REFERENCES "public"."public_answers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answer_comments" ADD CONSTRAINT "public_answer_comments_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answer_comments" ADD CONSTRAINT "public_answer_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answer_comments" ADD CONSTRAINT "public_answer_comments_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answer_reactions" ADD CONSTRAINT "public_answer_reactions_public_answer_id_public_answers_id_fk" FOREIGN KEY ("public_answer_id") REFERENCES "public"."public_answers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answer_reactions" ADD CONSTRAINT "public_answer_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_claim_per_user" ON "roster_claims" USING btree ("user_id") WHERE "roster_claims"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "roster_claims_state_idx" ON "roster_claims" USING btree ("state");--> statement-breakpoint
CREATE INDEX "roster_claims_record_idx" ON "roster_claims" USING btree ("matched_student_record_id");--> statement-breakpoint
CREATE INDEX "roster_claims_user_created_idx" ON "roster_claims" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bonus_period_course_name_unique" ON "bonus_periods" USING btree ("course_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "bonus_period_one_default" ON "bonus_periods" USING btree ("course_id") WHERE "bonus_periods"."is_default" AND NOT "bonus_periods"."archived";--> statement-breakpoint
CREATE INDEX "bonus_periods_course_idx" ON "bonus_periods" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "response_revision_unique" ON "form_response_revisions" USING btree ("response_id","revision");--> statement-breakpoint
CREATE INDEX "response_revisions_response_idx" ON "form_response_revisions" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "validity_events_response_idx" ON "submission_validity_events" USING btree ("response_id","created_at");--> statement-breakpoint
CREATE INDEX "validity_events_actor_idx" ON "submission_validity_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "public_answer_approvals_answer_idx" ON "public_answer_approvals" USING btree ("public_answer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "public_answer_revision_unique" ON "public_answer_revisions" USING btree ("public_answer_id","revision_number");--> statement-breakpoint
CREATE INDEX "public_answer_revisions_answer_idx" ON "public_answer_revisions" USING btree ("public_answer_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "rec_pending_item_unique" ON "backlog_recommendations" USING btree ("source_item_id","kind") WHERE "backlog_recommendations"."state" = 'pending' AND "backlog_recommendations"."source_item_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rec_pending_backlog_unique" ON "backlog_recommendations" USING btree ("backlog_question_id","kind") WHERE "backlog_recommendations"."state" = 'pending' AND "backlog_recommendations"."backlog_question_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "backlog_recommendations_course_idx" ON "backlog_recommendations" USING btree ("course_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_import_row_unique" ON "legacy_import_rows" USING btree ("import_batch_id","row_index");--> statement-breakpoint
CREATE INDEX "legacy_import_rows_batch_idx" ON "legacy_import_rows" USING btree ("import_batch_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "merge_group_key_active" ON "question_merge_groups" USING btree ("merge_key") WHERE "question_merge_groups"."state" = 'active';--> statement-breakpoint
CREATE INDEX "merge_groups_course_idx" ON "question_merge_groups" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "merge_groups_section_idx" ON "question_merge_groups" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "merge_groups_answer_idx" ON "question_merge_groups" USING btree ("public_answer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merge_member_item_active" ON "question_merge_members" USING btree ("item_id") WHERE "question_merge_members"."item_id" IS NOT NULL AND "question_merge_members"."removed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "merge_member_backlog_active" ON "question_merge_members" USING btree ("backlog_question_id") WHERE "question_merge_members"."backlog_question_id" IS NOT NULL AND "question_merge_members"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "merge_members_group_idx" ON "question_merge_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "prompt_analysis_notes_prompt_idx" ON "prompt_analysis_notes" USING btree ("section_id","question_stable_key");--> statement-breakpoint
CREATE INDEX "prompt_analysis_notes_cycle_idx" ON "prompt_analysis_notes" USING btree ("cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_idempotency_unique" ON "email_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "email_outbox_claim_idx" ON "email_outbox" USING btree ("state","available_at");--> statement-breakpoint
CREATE INDEX "email_outbox_recipient_idx" ON "email_outbox" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "email_outbox_section_idx" ON "email_outbox" USING btree ("section_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "public_answer_comment_token_unique" ON "public_answer_comments" USING btree ("public_answer_id","author_user_id","client_token") WHERE "public_answer_comments"."client_token" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "public_answer_comments_answer_idx" ON "public_answer_comments" USING btree ("public_answer_id","state","created_at");--> statement-breakpoint
CREATE INDEX "public_answer_comments_moderation_idx" ON "public_answer_comments" USING btree ("section_id","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "public_answer_reaction_unique" ON "public_answer_reactions" USING btree ("public_answer_id","user_id","kind");--> statement-breakpoint
CREATE INDEX "public_answer_reactions_answer_idx" ON "public_answer_reactions" USING btree ("public_answer_id");--> statement-breakpoint
ALTER TABLE "account_matches" ADD CONSTRAINT "account_matches_unlinked_by_user_id_users_id_fk" FOREIGN KEY ("unlinked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD CONSTRAINT "weekly_cycles_bonus_period_id_bonus_periods_id_fk" FOREIGN KEY ("bonus_period_id") REFERENCES "public"."bonus_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_cycles" ADD CONSTRAINT "weekly_cycles_window_overridden_by_user_id_users_id_fk" FOREIGN KEY ("window_overridden_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_validity_updated_by_user_id_users_id_fk" FOREIGN KEY ("validity_updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_responses" ADD CONSTRAINT "private_responses_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answers" ADD CONSTRAINT "public_answers_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answers" ADD CONSTRAINT "public_answers_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answers" ADD CONSTRAINT "public_answers_unpublished_by_user_id_users_id_fk" FOREIGN KEY ("unpublished_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answers" ADD CONSTRAINT "public_answers_source_cycle_id_weekly_cycles_id_fk" FOREIGN KEY ("source_cycle_id") REFERENCES "public"."weekly_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answers" ADD CONSTRAINT "public_answers_bonus_period_id_bonus_periods_id_fk" FOREIGN KEY ("bonus_period_id") REFERENCES "public"."bonus_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answers" ADD CONSTRAINT "public_answers_discussion_locked_by_user_id_users_id_fk" FOREIGN KEY ("discussion_locked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD CONSTRAINT "backlog_questions_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD CONSTRAINT "backlog_questions_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD CONSTRAINT "backlog_questions_draft_updated_by_user_id_users_id_fk" FOREIGN KEY ("draft_updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD CONSTRAINT "backlog_questions_legacy_row_id_legacy_import_rows_id_fk" FOREIGN KEY ("legacy_row_id") REFERENCES "public"."legacy_import_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_committed_by_user_id_users_id_fk" FOREIGN KEY ("committed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "student_records_number_hash_unique" ON "student_records" USING btree ("student_number_hash") WHERE "student_records"."student_number_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "student_records_last4_idx" ON "student_records" USING btree ("student_number_last4");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_clone_token_unique" ON "courses" USING btree ("clone_request_token") WHERE "courses"."clone_request_token" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "courses_archived_idx" ON "courses" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "enrollments_crs_status_idx" ON "enrollments" USING btree ("section_id","crs_status");--> statement-breakpoint
--
-- HAND-WRITTEN PRE-CHECK. The unique index below is what finally makes duplicate
-- weeks impossible, but it cannot be created if the table already contains a
-- duplicate. Fail with an actionable message instead of a bare index error.
--
DO $$
DECLARE dupes text;
BEGIN
  SELECT string_agg(format('section %s at %s (%s rows)', section_id, open_at, n), '; ')
    INTO dupes
    FROM (
      SELECT section_id, open_at, count(*) AS n
        FROM weekly_cycles
        GROUP BY section_id, open_at
        HAVING count(*) > 1
    ) d;
  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add weekly_cycle_section_open_unique: duplicate cycles already exist. Resolve them first (skip or delete the redundant cycle): %', dupes;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_cycle_section_open_unique" ON "weekly_cycles" USING btree ("section_id","open_at");--> statement-breakpoint
CREATE INDEX "weekly_cycles_period_idx" ON "weekly_cycles" USING btree ("bonus_period_id");--> statement-breakpoint
CREATE INDEX "form_responses_cycle_lifecycle_idx" ON "form_responses" USING btree ("cycle_id","lifecycle");--> statement-breakpoint
CREATE INDEX "form_responses_validity_idx" ON "form_responses" USING btree ("validity");--> statement-breakpoint
CREATE INDEX "private_responses_thread_idx" ON "private_responses" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "private_responses_client_token_unique" ON "private_responses" USING btree ("item_id","client_token") WHERE "private_responses"."client_token" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "one_general_comment_per_response" ON "student_submission_items" USING btree ("response_id") WHERE "student_submission_items"."kind" = 'general_comment' AND "student_submission_items"."withdrawn_at" IS NULL;--> statement-breakpoint
CREATE INDEX "submission_items_live_idx" ON "student_submission_items" USING btree ("response_id","kind");--> statement-breakpoint
CREATE INDEX "submission_items_review_state_idx" ON "student_submission_items" USING btree ("review_state");--> statement-breakpoint
CREATE INDEX "submission_items_disposition_idx" ON "student_submission_items" USING btree ("disposition");--> statement-breakpoint
CREATE INDEX "submission_items_topic_idx" ON "student_submission_items" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "public_answers_request_token_unique" ON "public_answers" USING btree ("section_id","request_token") WHERE "public_answers"."request_token" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "public_answers_archive_idx" ON "public_answers" USING btree ("section_id","state","published_at");--> statement-breakpoint
CREATE INDEX "public_answers_cycle_idx" ON "public_answers" USING btree ("source_cycle_id");--> statement-breakpoint
CREATE INDEX "public_answers_period_idx" ON "public_answers" USING btree ("bonus_period_id");--> statement-breakpoint
CREATE INDEX "public_answers_search_idx" ON "public_answers" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "backlog_questions_confirmation_idx" ON "backlog_questions" USING btree ("course_id","confirmation");--> statement-breakpoint
CREATE INDEX "backlog_questions_assignee_idx" ON "backlog_questions" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE INDEX "backlog_questions_source_item_idx" ON "backlog_questions" USING btree ("source_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_request_token_unique" ON "import_batches" USING btree ("request_token") WHERE "import_batches"."request_token" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "import_batches_course_idx" ON "import_batches" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "audit_events_section_created_idx" ON "audit_events" USING btree ("section_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_course_created_idx" ON "audit_events" USING btree ("course_id","created_at");--> statement-breakpoint
--
-- HAND-WRITTEN DATA BACKFILL. drizzle-kit emits none, and the CHECK constraints
-- that follow would fail against pre-existing rows without it. Must stay ABOVE
-- the ADD CONSTRAINT statements below.
--
-- Every already-invalid response needs the new student-visible reason, since a
-- student is now told why their submission did not count.
UPDATE "form_responses" SET "student_visible_reason" = 'Marked invalid by the teaching team before student-visible reasons were recorded. Ask your instructor for details.' WHERE "validity" = 'invalid' AND ("student_visible_reason" IS NULL OR btrim("student_visible_reason") = '');--> statement-breakpoint
UPDATE "form_responses" SET "invalidation_reason" = 'empty_or_meaningless' WHERE "validity" <> 'valid' AND "invalidation_reason" IS NULL;--> statement-breakpoint
-- Existing responses are all real submissions, never drafts.
UPDATE "form_responses" SET "lifecycle" = 'submitted' WHERE "submitted_at" IS NOT NULL AND "lifecycle" <> 'locked';--> statement-breakpoint
-- A TA who could previously mark validity keeps the ability to FLAG. Finalizing
-- now additionally requires a non-TA role, so this grant cannot escalate anyone.
UPDATE "section_staff" SET "flag_validity" = true WHERE "mark_validity" = true;--> statement-breakpoint
-- Backlog rows predate the recommend/confirm workflow and were created directly
-- by course staff, so they are treated as already confirmed rather than reverting
-- to "merely recommended".
UPDATE "backlog_questions" SET "confirmation" = 'confirmed', "confirmed_by_user_id" = "created_by_user_id", "confirmed_at" = "created_at" WHERE "confirmation" = 'recommended';--> statement-breakpoint
ALTER TABLE "student_records" ADD CONSTRAINT "student_number_last4_len" CHECK ("student_records"."student_number_last4" IS NULL OR length("student_records"."student_number_last4") BETWEEN 1 AND 4);--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "max_student_questions_range" CHECK ("template_versions"."max_student_questions" BETWEEN 0 AND 10);--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "response_lifecycle_submitted_at" CHECK (("form_responses"."lifecycle" = 'draft') = ("form_responses"."submitted_at" IS NULL));--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "response_lifecycle_locked_at" CHECK (("form_responses"."lifecycle" = 'locked') = ("form_responses"."locked_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "invalid_requires_student_reason" CHECK ("form_responses"."validity" <> 'invalid' OR length(btrim(coalesce("form_responses"."student_visible_reason", ''))) > 0);--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "nonvalid_requires_reason" CHECK ("form_responses"."validity" = 'valid' OR "form_responses"."invalidation_reason" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "private_responses" ADD CONSTRAINT "removed_consistency" CHECK (("private_responses"."removed_at" IS NULL) = ("private_responses"."removed_by_user_id" IS NULL));--> statement-breakpoint
ALTER TABLE "public_answers" ADD CONSTRAINT "published_requires_time" CHECK ("public_answers"."state" <> 'published' OR "public_answers"."published_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "public_answers" ADD CONSTRAINT "unpublished_requires_time" CHECK ("public_answers"."state" <> 'unpublished' OR "public_answers"."unpublished_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "public_answers" ADD CONSTRAINT "approved_requires_approver" CHECK (("public_answers"."approved_at" IS NULL) = ("public_answers"."approved_by_user_id" IS NULL));--> statement-breakpoint
ALTER TABLE "backlog_questions" ADD CONSTRAINT "backlog_confirmed_stamp" CHECK ("backlog_questions"."confirmation" <> 'confirmed' OR ("backlog_questions"."confirmed_by_user_id" IS NOT NULL AND "backlog_questions"."confirmed_at" IS NOT NULL));