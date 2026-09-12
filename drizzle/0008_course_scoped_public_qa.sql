-- Public Q&A becomes COURSE-owned (owner decision 2026-09-12, ADR-0005).
--
-- WHY. CS 33 runs three laboratory sections. Under the old model each section
-- owned its own Q&A archive, its own publication queue, and its own copy of a
-- published answer — so one useful answer had to be published three times, and
-- a Lab B student could not read an answer that happened to originate in Lab A.
-- The course is the collaborative teaching-work boundary; a section is an
-- enrolment, delegation, attribution and analysis context. ADR-0002, which
-- decided the section-scoped model, is superseded rather than deleted.
--
-- WHAT MOVES. `public_answers.section_id` stops being the authoritative
-- visibility key and becomes `origin_section_id`, nullable PROVENANCE. The new
-- `course_id` is the owner: every read model, authorization check and scheduler
-- lookup keys on it. `public_answer_comments` follows its subject.
--
-- WHAT DOES NOT MOVE. A FormResponse still records its attribution section, and
-- `SourceLink → StudentSubmissionItem → FormResponse.section_id` remains the
-- live, internal answer to "which class did this come from". Nothing about
-- source links, revisions, approvals, reactions, comments, audit rows or
-- publication state is touched here.
--
-- NO DEDUPLICATION. Historical data may hold the same answer published
-- separately to two sections. Text equality is not identity, so every existing
-- row is preserved as its own course-level entry and keeps its provenance.
-- Merging duplicates is a later, explicit domain operation, not a migration.
--
-- SAFETY. Each column is added nullable, backfilled, and only then constrained,
-- so no row is dropped and no NOT NULL is asserted before the data supports it.
-- Rollback is the mirror image: rename back, drop the added columns.
--
-- Model: src/db/schema/publishing.ts, src/db/schema/discussion.ts,
--        src/db/schema/backlog.ts.

-- 1. public_answers: add the owning course, backfill it from the section the
--    row was published through, then make it required.
ALTER TABLE "public_answers" ADD COLUMN "course_id" uuid;--> statement-breakpoint
UPDATE "public_answers" AS pa
   SET "course_id" = cs."course_id"
  FROM "class_sections" AS cs
 WHERE cs."id" = pa."section_id"
   AND pa."course_id" IS NULL;--> statement-breakpoint
ALTER TABLE "public_answers" ALTER COLUMN "course_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "public_answers" ADD CONSTRAINT "public_answers_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 2. The former owner is demoted to provenance: renamed so no query can keep
--    treating it as authority by accident, and made nullable because new rows
--    do not record one.
ALTER TABLE "public_answers" RENAME COLUMN "section_id" TO "origin_section_id";--> statement-breakpoint
ALTER TABLE "public_answers" ALTER COLUMN "origin_section_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "public_answers" RENAME CONSTRAINT "public_answers_section_id_class_sections_id_fk" TO "public_answers_origin_section_id_class_sections_id_fk";--> statement-breakpoint

-- 3. Indexes follow the new access key. The archive index in particular is what
--    every Class Q&A read uses, so it has to lead with the course.
DROP INDEX IF EXISTS "public_answers_section_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "public_answers_archive_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "public_answers_request_token_unique";--> statement-breakpoint
CREATE INDEX "public_answers_course_idx" ON "public_answers" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "public_answers_archive_idx" ON "public_answers" USING btree ("course_id","state","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "public_answers_request_token_unique" ON "public_answers" USING btree ("course_id","request_token") WHERE "public_answers"."request_token" IS NOT NULL;--> statement-breakpoint

-- 4. Comments live on a course-wide archive, so their moderation queue is
--    course-scoped too. Same add/backfill/constrain shape.
ALTER TABLE "public_answer_comments" ADD COLUMN "course_id" uuid;--> statement-breakpoint
UPDATE "public_answer_comments" AS c
   SET "course_id" = cs."course_id"
  FROM "class_sections" AS cs
 WHERE cs."id" = c."section_id"
   AND c."course_id" IS NULL;--> statement-breakpoint
ALTER TABLE "public_answer_comments" ALTER COLUMN "course_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "public_answer_comments" ADD CONSTRAINT "public_answer_comments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_answer_comments" RENAME COLUMN "section_id" TO "origin_section_id";--> statement-breakpoint
ALTER TABLE "public_answer_comments" ALTER COLUMN "origin_section_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "public_answer_comments" RENAME CONSTRAINT "public_answer_comments_section_id_class_sections_id_fk" TO "public_answer_comments_origin_section_id_class_sections_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "public_answer_comments_moderation_idx";--> statement-breakpoint
CREATE INDEX "public_answer_comments_moderation_idx" ON "public_answer_comments" USING btree ("course_id","state","created_at");--> statement-breakpoint

-- 5. Per-section backlog exposure is gone as a mechanism: a backlog item now
--    publishes to one course archive, so there is no section to choose. The
--    ROWS are kept — they record which sections were exposed to what, and that
--    is real history — under a name that says they are history. No data is
--    deleted and nothing reads this table any more.
ALTER TABLE "section_backlog_visibility" RENAME TO "backlog_section_exposure_history";--> statement-breakpoint
ALTER INDEX "section_backlog_visibility_unique" RENAME TO "backlog_section_exposure_history_unique";
--> statement-breakpoint
-- Constraint names follow the table so the schema snapshot and the database
-- keep agreeing; a RENAME TO leaves them pointing at the old name otherwise.
ALTER TABLE "backlog_section_exposure_history" RENAME CONSTRAINT "section_backlog_visibility_backlog_question_id_backlog_questions_id_fk" TO "backlog_section_exposure_history_backlog_question_id_backlog_questions_id_fk";--> statement-breakpoint
ALTER TABLE "backlog_section_exposure_history" RENAME CONSTRAINT "section_backlog_visibility_section_id_class_sections_id_fk" TO "backlog_section_exposure_history_section_id_class_sections_id_fk";--> statement-breakpoint
ALTER TABLE "backlog_section_exposure_history" RENAME CONSTRAINT "section_backlog_visibility_made_visible_by_user_id_users_id_fk" TO "backlog_section_exposure_history_made_visible_by_user_id_users_id_fk";
