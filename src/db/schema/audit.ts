import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

/**
 * Append-only audit log (domain-model.md §4). The application performs only
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
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    /** extra context, e.g. { late: true } for reconciliation actions */
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_events_entity_idx").on(t.entityType, t.entityId),
    index("audit_events_actor_idx").on(t.actorUserId),
    index("audit_events_created_idx").on(t.createdAt),
  ],
);
