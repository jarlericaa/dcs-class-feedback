import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The dev-login gate must be impossible to enable in production:
 * env.devAuthEnabled = NODE_ENV !== "production" && DEV_AUTH_ENABLED === "true".
 */
describe("env dev-auth gating", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadEnv() {
    vi.resetModules();
    const mod = await import("@/env");
    return mod.env;
  }

  it("is disabled by default", async () => {
    vi.stubEnv("DEV_AUTH_ENABLED", "");
    vi.stubEnv("NODE_ENV", "development");
    expect((await loadEnv()).devAuthEnabled).toBe(false);
  });

  it("enables only with explicit opt-in outside production", async () => {
    vi.stubEnv("DEV_AUTH_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "development");
    expect((await loadEnv()).devAuthEnabled).toBe(true);
  });

  /** A production env must satisfy the other production-only requirements first. */
  function stubProductionRequirements() {
    vi.stubEnv("STUDENT_NUMBER_ENC_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    vi.stubEnv("STUDENT_NUMBER_HASH_KEY", "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=");
    vi.stubEnv("EMAIL_TRANSPORT", "smtp");
    vi.stubEnv("SMTP_HOST", "smtp.example.edu");
    vi.stubEnv("APP_BASE_URL", "https://feedback.example.edu");
  }

  it("NEVER enables in production, even with DEV_AUTH_ENABLED=true", async () => {
    stubProductionRequirements();
    vi.stubEnv("DEV_AUTH_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect((await loadEnv()).devAuthEnabled).toBe(false);
  });

  it("refuses to start in production without a student-number encryption key", async () => {
    stubProductionRequirements();
    vi.stubEnv("STUDENT_NUMBER_ENC_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(loadEnv()).rejects.toThrow(/STUDENT_NUMBER_ENC_KEY/);
  });

  it("refuses to start in production unless email really sends", async () => {
    stubProductionRequirements();
    vi.stubEnv("EMAIL_TRANSPORT", "log");
    vi.stubEnv("NODE_ENV", "production");
    await expect(loadEnv()).rejects.toThrow(/EMAIL_TRANSPORT/);
  });

  it("flags the non-secret development crypto keys as such", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STUDENT_NUMBER_ENC_KEY", "");
    vi.stubEnv("STUDENT_NUMBER_HASH_KEY", "");
    expect((await loadEnv()).usingDevCryptoKeys).toBe(true);
  });

  it("parses deadline reminder offsets, descending and deduplicated", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("EMAIL_REMINDER_OFFSETS", "2h,24h,2h,30m,nonsense");
    expect((await loadEnv()).emailReminderOffsets).toEqual([
      { label: "T-24h", minutes: 1440 },
      { label: "T-2h", minutes: 120 },
      { label: "T-30m", minutes: 30 },
    ]);
  });

  it("parses allowed email domains case-insensitively", async () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "UP.edu.ph, example.edu ,");
    vi.stubEnv("NODE_ENV", "development");
    expect((await loadEnv()).allowedEmailDomains).toEqual([
      "up.edu.ph",
      "example.edu",
    ]);
  });
});
