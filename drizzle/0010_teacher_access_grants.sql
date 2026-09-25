CREATE TABLE IF NOT EXISTS "teacher_access_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "granted_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "granted_at" timestamptz DEFAULT now() NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "teacher_access_grants_email_normalized" CHECK ("email" = lower(btrim("email")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teacher_access_grants_email_unique" ON "teacher_access_grants" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_access_grants_active_idx" ON "teacher_access_grants" USING btree ("email") WHERE "revoked_at" IS NULL;
--> statement-breakpoint
INSERT INTO "teacher_access_grants" ("email", "granted_by_user_id", "granted_at", "created_at", "updated_at")
SELECT "email", "id", COALESCE("created_at", now()), COALESCE("created_at", now()), now()
FROM "users"
WHERE "is_teacher" = true
  AND NOT EXISTS (
    SELECT 1 FROM "section_staff"
    WHERE "section_staff"."user_id" = "users"."id"
      AND "section_staff"."role" = 'ta'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "teacher_access_grants" AS "existing"
    WHERE "existing"."email" = "users"."email"
  );
