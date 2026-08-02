import { z } from "zod";

/**
 * Zod-validated environment access. Server-only.
 *
 * DEV_AUTH_ENABLED is intentionally NOT honored when NODE_ENV === "production":
 * the dev login provider must be impossible to enable in production builds.
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
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
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
};
