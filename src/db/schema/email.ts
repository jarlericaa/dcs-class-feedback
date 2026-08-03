import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { emailDeliveryState, emailEventType } from "./enums";
import { classSections, courses } from "./catalog";
import { users } from "./identity";

/**
 * Transactional outbox for notifications (project-specs.md §6.9).
 *
 * Rows are enqueued INSIDE the transaction that made the domain change, so a
 * rolled-back publish can never leave a queued email, and a committed one can
 * never fail to queue.
 *
 * Idempotency is the unique `idempotencyKey`: enqueueing the same event for the
 * same recipient twice is a no-op rather than a second message. Delivery uses a
 * claim-and-lease so several workers (the polling scheduler and an external cron
 * hitting the tick route) never send the same row twice.
 *
 * Privacy: the recipient is stored as a user id, never an address, and the
 * subject is built from static per-event text plus non-sensitive context only —
 * never question, answer, feedback, or private-message content.
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: emailEventType("event_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id),
    sectionId: uuid("section_id").references(() => classSections.id),
    courseId: uuid("course_id").references(() => courses.id),
    /** content-free by construction; see src/modules/email/templates.ts */
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html"),
    /** relative path to an AUTHENTICATED page; combined with APP_BASE_URL */
    linkPath: text("link_path").notNull(),
    state: emailDeliveryState("state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("email_outbox_idempotency_unique").on(t.idempotencyKey),
    index("email_outbox_claim_idx").on(t.state, t.availableAt),
    index("email_outbox_recipient_idx").on(t.recipientUserId),
    index("email_outbox_section_idx").on(t.sectionId, t.createdAt),
    check(
      "email_sent_requires_time",
      sql`${t.state} <> 'sent' OR ${t.sentAt} IS NOT NULL`,
    ),
  ],
);
