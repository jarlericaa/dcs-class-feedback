DROP TABLE "account_matches" CASCADE;--> statement-breakpoint
DROP TABLE "roster_claims" CASCADE;--> statement-breakpoint
ALTER TABLE "student_records" DROP COLUMN "normalized_full_name";--> statement-breakpoint
ALTER TABLE "student_records" DROP COLUMN "normalized_tokens";--> statement-breakpoint
DROP TYPE "public"."account_match_method";--> statement-breakpoint
DROP TYPE "public"."account_match_state";--> statement-breakpoint
DROP TYPE "public"."roster_claim_reason";--> statement-breakpoint
DROP TYPE "public"."roster_claim_state";