import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { smallint } from "drizzle-orm/pg-core";

/** An authenticated Google identity, keyed by its normalized university email. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleSub: text("google_sub").unique(),
  /** Always stored normalized (trimmed + lowercased) — see modules/identity/email. */
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
 * Credential-backed Platform Admin identity. This is deliberately separate
 * from `users`: admins do not have an email address, a Google subject, or a
 * normal user row. The legacy `users.is_platform_admin` flag is retained only
 * for historical data and is not an authentication grant.
 */
export const platformAdminAccounts = pgTable(
  "platform_admin_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    active: boolean("active").notNull().default(true),
    failedLoginAttempts: smallint("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("platform_admin_accounts_username_unique").on(t.username),
    check(
      "platform_admin_accounts_username_normalized",
      sql`${t.username} = lower(btrim(${t.username})) AND ${t.username} ~ '^[a-z0-9][a-z0-9._-]{2,63}$'`,
    ),
    check("platform_admin_accounts_failed_attempts_nonnegative", sql`${t.failedLoginAttempts} >= 0`),
  ],
);

/**
 * Email-first teacher capability grants. A row may exist before the person has
 * signed in; the Google provisioning transaction applies the active grant to
 * `users.is_teacher` on first sign-in. Revocation is retained for auditability
 * and never deletes a user or their course history.
 */
export const teacherAccessGrants = pgTable(
  "teacher_access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    /** Historical normal-user actor; new grants use the admin actor below. */
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id),
    grantedByPlatformAdminId: uuid("granted_by_platform_admin_id").references(
      () => platformAdminAccounts.id,
    ),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("teacher_access_grants_email_unique").on(t.email),
    index("teacher_access_grants_active_idx")
      .on(t.email)
      .where(sql`${t.revokedAt} IS NULL`),
    check("teacher_access_grants_email_normalized", sql`${t.email} = lower(btrim(${t.email}))`),
  ],
);

/**
 * One roster person, keyed by student number — the permanent internal identity
 * (Assumption A2) — and reached by the teacher-supplied UP email.
 *
 * `rosterEmail` is the ACCESS key: a signed-in user is this student iff their
 * normalized email equals it exactly. The full name is a label only and is never
 * used to resolve identity. One record is reused across every section and course
 * whose class list carries the same email.
 */
export const studentRecords = pgTable(
  "student_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * DEPRECATED plaintext column, kept nullable only so the encryption
     * backfill has a source to read. `scripts/backfill-student-numbers.ts`
     * populates the three columns below and then verifies; the column is
     * dropped by the following migration. See docs/engineering/deployment.md.
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
    /**
     * Normalized (trimmed + lowercased) UP email from the class list. Unique
     * across all records, so two students can never resolve to one another.
     * Nullable only for rows imported before the email column existed.
     */
    rosterEmail: text("roster_email"),
    // --- CRS roster fields (docs/product/specification.md §6.1 step 5) ---
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
    // The identity constraint: one student record per normalized email, ever.
    uniqueIndex("student_records_roster_email_unique")
      .on(t.rosterEmail)
      .where(sql`${t.rosterEmail} IS NOT NULL`),
    index("student_records_last4_idx").on(t.studentNumberLast4),
    check(
      "student_number_last4_len",
      sql`${t.studentNumberLast4} IS NULL OR length(${t.studentNumberLast4}) BETWEEN 1 AND 4`,
    ),
    // Normalization is enforced in the database, not only in application code:
    // a stray uppercase value would silently break exact-equality matching.
    check(
      "roster_email_normalized",
      sql`${t.rosterEmail} IS NULL OR ${t.rosterEmail} = lower(btrim(${t.rosterEmail}))`,
    ),
  ],
);
