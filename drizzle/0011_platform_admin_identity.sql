CREATE TABLE IF NOT EXISTS "platform_admin_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" text NOT NULL,
  "display_name" text NOT NULL,
  "password_hash" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "failed_login_attempts" smallint DEFAULT 0 NOT NULL,
  "locked_until" timestamptz,
  "password_changed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "platform_admin_accounts_username_normalized" CHECK ("username" = lower(btrim("username")) AND "username" ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  CONSTRAINT "platform_admin_accounts_failed_attempts_nonnegative" CHECK ("failed_login_attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_admin_accounts_username_unique" ON "platform_admin_accounts" USING btree ("username");
--> statement-breakpoint
ALTER TABLE "teacher_access_grants" ALTER COLUMN "granted_by_user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "teacher_access_grants" ADD COLUMN IF NOT EXISTS "granted_by_platform_admin_id" uuid REFERENCES "platform_admin_accounts"("id");
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "actor_platform_admin_id" uuid REFERENCES "platform_admin_accounts"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_admin_actor_idx" ON "audit_events" USING btree ("actor_platform_admin_id");
