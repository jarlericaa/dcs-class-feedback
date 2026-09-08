-- Per-reader read state for staff review (GitHub issue #6).
--
-- One row per (response, reader): "this person has read this submission". It is
-- bookkeeping about a staff member's own reading, not a fact about the student
-- — no validity, no participation credit and no publication depends on it, and
-- it is never projected into a student-facing read model.
--
-- PER READER on purpose. A shared marker would let one assistant's skim hide a
-- submission from the instructor who still has to decide on it, so the queue
-- would empty without anyone having answered anything. The unique index is what
-- makes marking idempotent; the service upserts onto it.
--
-- Additive and reversible: one new table, no column added to an existing one
-- and no data touched, so an older build runs unchanged against this schema and
-- `DROP TABLE "response_reads"` is a complete rollback.
--
-- Model: src/db/schema/responses.ts (`responseReads`).

CREATE TABLE "response_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"reader_user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "response_reads" ADD CONSTRAINT "response_reads_response_id_form_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."form_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_reads" ADD CONSTRAINT "response_reads_reader_user_id_users_id_fk" FOREIGN KEY ("reader_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "response_reads_reader_unique" ON "response_reads" USING btree ("response_id","reader_user_id");--> statement-breakpoint
CREATE INDEX "response_reads_reader_idx" ON "response_reads" USING btree ("reader_user_id","response_id");