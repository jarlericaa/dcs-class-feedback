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
import { real, smallint } from "drizzle-orm/pg-core";
import {
  accountMatchMethod,
  accountMatchState,
  rosterClaimReason,
  rosterClaimState,
} from "./enums";

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
export const studentRecords = pgTable(
  "student_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * DEPRECATED plaintext column, kept nullable only so the encryption
     * backfill has a source to read. `scripts/backfill-student-numbers.ts`
     * populates the three columns below and then verifies; the column is
     * dropped by the following migration. See docs/DEPLOYMENT.md.
     */
    studentNumber: text("student_number"),
    /** AES-256-GCM, AAD-bound to this row's id (src/modules/crypto). */
    studentNumberCiphertext: text("student_number_ciphertext"),
    /** Keyed HMAC-SHA256 of the normalized number — carries uniqueness + lookups. */
    studentNumberHash: text("student_number_hash"),
    /** Last up-to-4 characters, in clear, for staff list views. */
    studentNumberLast4: text("student_number_last4"),
    encKeyVersion: smallint("enc_key_version").notNull().default(1),
    fullName: text("full_name").notNull(),
    normalizedFullName: text("normalized_full_name").notNull(),
    /** space-joined sorted normalized tokens, for token-set comparison */
    normalizedTokens: text("normalized_tokens").notNull(),
    // --- CRS roster fields (project-specs.md §6.1 step 5) ---
    familyName: text("family_name"),
    firstName: text("first_name"),
    /** lived / preferred name */
    livedName: text("lived_name"),
    preferredPronoun: text("preferred_pronoun"),
    program: text("program"),
    createdByImportBatchId: uuid("created_by_import_batch_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("student_records_number_hash_unique")
      .on(t.studentNumberHash)
      .where(sql`${t.studentNumberHash} IS NOT NULL`),
    index("student_records_last4_idx").on(t.studentNumberLast4),
    check(
      "student_number_last4_len",
      sql`${t.studentNumberLast4} IS NULL OR length(${t.studentNumberLast4}) BETWEEN 1 AND 4`,
    ),
  ],
);

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
    /**
     * Unlinking a confirmed identity sets state='rejected' (which releases both
     * partial uniques) and stamps these. Nothing is deleted: responses stay
     * attached to the student record, so a re-link restores the student's own
     * history intact.
     */
    unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
    unlinkedByUserId: uuid("unlinked_by_user_id").references(() => users.id),
    unlinkReason: text("unlink_reason"),
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

/**
 * A student's attempt to claim a roster entry by typing their student number
 * (project-specs.md §6.1).
 *
 * The typed number is stored sealed, never in plaintext, because a wrong guess
 * is still someone's identifier. The `reason` column is STAFF-ONLY: every
 * outcome that is not an immediate auto-confirm returns the same response to the
 * student, so the claim form cannot be used to enumerate student numbers or
 * learn another student's name.
 */
export const rosterClaims = pgTable(
  "roster_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    typedNumberCiphertext: text("typed_number_ciphertext").notNull(),
    typedNumberHash: text("typed_number_hash").notNull(),
    typedNumberLast4: text("typed_number_last4").notNull(),
    matchedStudentRecordId: uuid("matched_student_record_id").references(
      () => studentRecords.id,
    ),
    accountMatchId: uuid("account_match_id").references(() => accountMatches.id),
    /** Snapshot so staff compare against what the account was called at the time. */
    googleDisplayNameAtClaim: text("google_display_name_at_claim").notNull(),
    /** scoreNames() output; null when no roster record matched the number. */
    nameScore: real("name_score"),
    state: rosterClaimState("state").notNull().default("pending"),
    reason: rosterClaimReason("reason").notNull(),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // A new claim supersedes the previous pending one, so at most one is open.
    uniqueIndex("one_pending_claim_per_user")
      .on(t.userId)
      .where(sql`${t.state} = 'pending'`),
    index("roster_claims_state_idx").on(t.state),
    index("roster_claims_record_idx").on(t.matchedStudentRecordId),
    // Supports the per-account rate limit without scanning.
    index("roster_claims_user_created_idx").on(t.userId, t.createdAt),
  ],
);
