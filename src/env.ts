import { z } from "zod";

/**
 * Zod-validated environment access. Server-only.
 *
 * DEV_AUTH_ENABLED is intentionally NOT honored when NODE_ENV === "production":
 * the dev login provider must be impossible to enable in production builds.
 * The same shape is used for every other "safe by default outside production"
 * switch below.
 */
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://feedback:feedback@localhost:5432/feedback"),
  AUTH_SECRET: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  ALLOWED_EMAIL_DOMAINS: z.string().default(""),
  INSTITUTION_TIMEZONE: z.string().default("Asia/Manila"),
  SCHEDULER_SECRET: z.string().optional(),
  DEV_AUTH_ENABLED: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  /**
   * Student-number protection at rest (project-specs.md §11).
   * Two independent 32-byte base64 keys; see docs/SECURITY.md.
   * Dev/test fall back to fixed non-secret keys so the suite runs without setup;
   * production refuses to start without real ones (checked below).
   */
  STUDENT_NUMBER_ENC_KEY: z.string().optional(),
  STUDENT_NUMBER_ENC_KEY_PREVIOUS: z.string().optional(),
  STUDENT_NUMBER_HASH_KEY: z.string().optional(),

  /**
   * Roster-claim auto-confirm policy (open-decisions.md D2).
   * Default OFF = teacher-confirm-all. Turning it on is a configuration change.
   */
  ROSTER_CLAIM_AUTO_CONFIRM: z.string().optional(),
  ROSTER_CLAIM_AUTO_CONFIRM_MIN_SCORE: z.coerce.number().min(0).max(1).optional(),
  ROSTER_CLAIM_MAX_PER_HOUR: z.coerce.number().int().min(1).default(5),

  /** Absolute base URL used to build authenticated links inside emails. */
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  /** Email delivery. `log` prints, `fake` records in memory, `smtp` really sends. */
  EMAIL_TRANSPORT: z.enum(["log", "fake", "smtp"]).default("log"),
  EMAIL_FROM: z.string().default("Class Feedback <no-reply@localhost>"),
  APP_MAIL_DOMAIN: z.string().default("localhost"),
  EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  /** Comma-separated reminder offsets before a deadline, e.g. "24h,2h". */
  EMAIL_REMINDER_OFFSETS: z.string().default("24h,2h"),
  EMAIL_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z.string().optional(),

  TEST_DATABASE_URL: z.string().url().optional(),
  E2E_DATABASE_URL: z.string().url().optional(),
});

const parsed = envSchema.parse(process.env);

/**
 * `next build` runs with NODE_ENV=production and imports every module to collect
 * page data, so enforcing production secrets unconditionally would make the
 * build itself require production keys. The checks below therefore skip the
 * build phase and fire when the server actually boots — which is the moment that
 * matters, and is still before any request is served.
 */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isProduction = parsed.NODE_ENV === "production" && !isBuildPhase;

/**
 * Non-secret development keys. Deliberately constant so the test suite is
 * deterministic, and deliberately rejected in production below.
 */
/** base64 of "dev-only-student-number-enc-key!" — exactly 32 bytes. */
const DEV_ENC_KEY = "ZGV2LW9ubHktc3R1ZGVudC1udW1iZXItZW5jLWtleSE=";
/** base64 of "dev-only-student-number-hash-key" — exactly 32 bytes. */
const DEV_HASH_KEY = "ZGV2LW9ubHktc3R1ZGVudC1udW1iZXItaGFzaC1rZXk=";

function requiredInProduction(value: string | undefined, name: string): string | undefined {
  if (isProduction && !value) {
    throw new Error(`${name} must be set in production`);
  }
  return value;
}

requiredInProduction(parsed.STUDENT_NUMBER_ENC_KEY, "STUDENT_NUMBER_ENC_KEY");
requiredInProduction(parsed.STUDENT_NUMBER_HASH_KEY, "STUDENT_NUMBER_HASH_KEY");
if (isProduction) {
  if (parsed.EMAIL_TRANSPORT !== "smtp") {
    throw new Error(
      "EMAIL_TRANSPORT must be 'smtp' in production — 'log' and 'fake' never deliver mail",
    );
  }
  if (!parsed.SMTP_HOST) throw new Error("SMTP_HOST must be set in production");
  if (!process.env.APP_BASE_URL) {
    throw new Error("APP_BASE_URL must be set in production");
  }
}

export const env = {
  ...parsed,
  STUDENT_NUMBER_ENC_KEY: parsed.STUDENT_NUMBER_ENC_KEY ?? DEV_ENC_KEY,
  STUDENT_NUMBER_HASH_KEY: parsed.STUDENT_NUMBER_HASH_KEY ?? DEV_HASH_KEY,
  /** Allowed Google account domains, lowercased. Empty list = reject all sign-ins. */
  allowedEmailDomains: parsed.ALLOWED_EMAIL_DOMAINS.split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
  /**
   * Dev login is available ONLY outside production AND with explicit opt-in.
   * Never true in production regardless of environment variables.
   */
  devAuthEnabled:
    parsed.NODE_ENV !== "production" && parsed.DEV_AUTH_ENABLED === "true",
  /** Whether the shipped student-number keys are the non-secret dev defaults. */
  usingDevCryptoKeys:
    !parsed.STUDENT_NUMBER_ENC_KEY || !parsed.STUDENT_NUMBER_HASH_KEY,
  /** Roster-claim auto-confirm: OFF unless explicitly enabled (D2). */
  rosterClaimAutoConfirm: parsed.ROSTER_CLAIM_AUTO_CONFIRM === "true",
  rosterClaimAutoConfirmMinScore:
    parsed.ROSTER_CLAIM_AUTO_CONFIRM_MIN_SCORE ?? 0.85,
  smtpSecure: parsed.SMTP_SECURE === "true",
  /** Reminder offsets in minutes before the deadline, descending. */
  emailReminderOffsets: parseOffsets(parsed.EMAIL_REMINDER_OFFSETS),
};

/** "24h,2h,30m" → [{ label: "T-24h", minutes: 1440 }, ...] descending. */
function parseOffsets(raw: string): { label: string; minutes: number }[] {
  const parsedOffsets = raw
    .split(",")
    .map((piece) => piece.trim().toLowerCase())
    .filter(Boolean)
    .map((piece) => {
      const match = /^(\d+)\s*(m|h|d)$/.exec(piece);
      if (!match) return null;
      const value = Number.parseInt(match[1]!, 10);
      const unit = match[2]!;
      const minutes = unit === "m" ? value : unit === "h" ? value * 60 : value * 1440;
      return { label: `T-${value}${unit}`, minutes };
    })
    .filter((v): v is { label: string; minutes: number } => v !== null);
  // Deduplicate by minutes so a repeated offset cannot queue two reminders.
  const seen = new Set<number>();
  return parsedOffsets
    .filter((offset) => {
      if (seen.has(offset.minutes)) return false;
      seen.add(offset.minutes);
      return true;
    })
    .sort((a, b) => b.minutes - a.minutes);
}
