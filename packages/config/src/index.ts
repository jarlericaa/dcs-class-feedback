import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  API_PORT: z.coerce.number().default(3001),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;

export function getConfig(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  try {
    cachedEnv = EnvSchema.parse(process.env);
    return cachedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors
        .filter((e) => e.code === "invalid_type")
        .map((e) => e.path.join("."));
      console.error("Missing required environment variables:", missing);
    }
    throw new Error("Invalid environment configuration");
  }
}

export const config = getConfig();
