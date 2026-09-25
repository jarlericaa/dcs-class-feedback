ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_single_human_actor" CHECK (NOT ("actor_user_id" IS NOT NULL AND "actor_platform_admin_id" IS NOT NULL));
