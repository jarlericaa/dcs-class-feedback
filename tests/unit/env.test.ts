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

  it("NEVER enables in production, even with DEV_AUTH_ENABLED=true", async () => {
    vi.stubEnv("DEV_AUTH_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect((await loadEnv()).devAuthEnabled).toBe(false);
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
