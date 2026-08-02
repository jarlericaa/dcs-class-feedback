import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { accountMatchMethod, accountMatchState } from "./enums";

/** An authenticated Google identity. NOT a student until an AccountMatch is confirmed. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleSub: text("google_sub").unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  isTeacher: boolean("is_teacher").notNull().default(false),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One roster person, keyed by student number — the permanent internal identity
 * (Assumption A2). Sections attach via enrollments; fullName is the canonical
 * name (see roster re-import rules: never silently overwritten once a
 * confirmed AccountMatch exists — enrollments.rosterName keeps per-section
 * imported names).
 */
export const studentRecords = pgTable("student_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentNumber: text("student_number").notNull().unique(),
  fullName: text("full_name").notNull(),
  normalizedFullName: text("normalized_full_name").notNull(),
  /** space-joined sorted normalized tokens, for token-set comparison */
  normalizedTokens: text("normalized_tokens").notNull(),
  createdByImportBatchId: uuid("created_by_import_batch_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Match rows link a User to candidate StudentRecords.
 * Shape: one row per (user, candidate record); a user with no plausible
 * candidates gets a single `unmatched` row with studentRecordId NULL.
 * Confirming one candidate marks sibling candidates rejected.
 * Teacher-confirm-all policy (D2): nothing auto-confirms.
 */
export const accountMatches = pgTable(
  "account_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    studentRecordId: uuid("student_record_id").references(
      () => studentRecords.id,
    ),
    state: accountMatchState("state").notNull(),
    method: accountMatchMethod("method").notNull().default("auto_pipeline"),
    /** pipeline signals: score, matched orderings, etc. Staff-only diagnostic. */
    confidence: jsonb("confidence"),
    confirmedByUserId: uuid("confirmed_by_user_id").references(() => users.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Every state except `unmatched` must point at a student record.
    check(
      "account_match_record_presence",
      sql`(${t.state} = 'unmatched') = (${t.studentRecordId} IS NULL)`,
    ),
    // At most one confirmed identity per user, and per student record.
    uniqueIndex("one_confirmed_match_per_user")
      .on(t.userId)
      .where(sql`${t.state} = 'confirmed'`),
    uniqueIndex("one_confirmed_match_per_student_record")
      .on(t.studentRecordId)
      .where(sql`${t.state} = 'confirmed'`),
    // No duplicate candidate rows for the same pairing.
    uniqueIndex("unique_user_student_record_pair")
      .on(t.userId, t.studentRecordId)
      .where(sql`${t.studentRecordId} IS NOT NULL`),
    index("account_matches_user_idx").on(t.userId),
    index("account_matches_state_idx").on(t.state),
  ],
);
