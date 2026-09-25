import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { platformAdminAccounts, users } from "./identity";
import { classSections, courses } from "./catalog";

/**
 * Append-only audit log (docs/domain/domain-model.md §4). The application performs only
 * INSERTs on this table — no update or delete path exists anywhere.
 * Written in the same transaction as the audited change.
 * Staff/admin-visible only; never student-visible (Risk R6).
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null for system/scheduler actions */
    actorUserId: uuid("actor_user_id").references(() => users.id),
    /** Set for human actions performed by a credential-backed Platform Admin. */
    actorPlatformAdminId: uuid("actor_platform_admin_id").references(
      () => platformAdminAccounts.id,
    ),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    /** extra context, e.g. { late: true } for reconciliation actions */
    metadata: jsonb("metadata"),
    /**
     * Denormalized scope. Without these, listing a section's history means
     * collecting every entity id reachable from the section and doing one giant
     * `IN (...)` — which cannot be paginated correctly and grows without bound.
     * Nullable because rows written before this column existed have no scope;
     * the reader unions those in through the old id-based path.
     */
    sectionId: uuid("section_id").references(() => classSections.id),
    courseId: uuid("course_id").references(() => courses.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "audit_events_single_human_actor",
      sql`NOT (${t.actorUserId} IS NOT NULL AND ${t.actorPlatformAdminId} IS NOT NULL)`,
    ),
    index("audit_events_entity_idx").on(t.entityType, t.entityId),
    index("audit_events_actor_idx").on(t.actorUserId),
    index("audit_events_admin_actor_idx").on(t.actorPlatformAdminId),
    index("audit_events_created_idx").on(t.createdAt),
    index("audit_events_section_created_idx").on(t.sectionId, t.createdAt),
    index("audit_events_course_created_idx").on(t.courseId, t.createdAt),
  ],
);
