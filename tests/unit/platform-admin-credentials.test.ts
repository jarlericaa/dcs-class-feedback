import { describe, expect, it } from "vitest";
import {
  hashPlatformAdminPassword,
  isValidPlatformAdminUsername,
  normalizePlatformAdminUsername,
  verifyPlatformAdminPassword,
} from "@/modules/platform-admin/credentials";

describe("Platform Admin credentials", () => {
  it("normalizes and validates usernames without accepting email-shaped identities", () => {
    expect(normalizePlatformAdminUsername("  Admin.User  ")).toBe("admin.user");
    expect(isValidPlatformAdminUsername("admin.user")).toBe(true);
    expect(isValidPlatformAdminUsername("ab")).toBe(false);
    expect(isValidPlatformAdminUsername("admin@example.edu")).toBe(false);
  });

  it("hashes passwords with a per-password salt and verifies only the original", async () => {
    const first = await hashPlatformAdminPassword("correct horse battery staple");
    const second = await hashPlatformAdminPassword("correct horse battery staple");
    expect(first).not.toBe(second);
    expect(await verifyPlatformAdminPassword("correct horse battery staple", first)).toBe(true);
    expect(await verifyPlatformAdminPassword("wrong password", first)).toBe(false);
    expect(first).not.toContain("correct horse");
  });

  it("requires a strong enough password", async () => {
    await expect(hashPlatformAdminPassword("short")).rejects.toThrow(/at least 12/);
  });
});
