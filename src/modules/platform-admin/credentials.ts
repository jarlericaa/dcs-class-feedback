import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, platformAdminAccounts } from "@/db/schema";

const KEY_LENGTH = 64;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const DUMMY_SALT = Buffer.from("forms-platform-admin-dummy-salt");

export const ADMIN_AUTH_ERROR = "Incorrect username or password.";

export function normalizePlatformAdminUsername(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function isValidPlatformAdminUsername(username: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(username);
}

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: 32 * 1024 * 1024,
    }, (error, derived) => error ? reject(error) : resolve(Buffer.from(derived)));
  });
}

/** Versioned, non-reversible password format: scrypt:v1:salt:derived-key. */
export async function hashPlatformAdminPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error("Platform Admin passwords must be at least 12 characters.");
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt:v1:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

export async function verifyPlatformAdminPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split(":");
  if (parts.length !== 4 || parts[0] !== "scrypt" || parts[1] !== "v1") return false;
  try {
    const salt = Buffer.from(parts[2]!, "base64url");
    const expected = Buffer.from(parts[3]!, "base64url");
    const actual = await derive(password, salt);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function burnPasswordTiming(password: string) {
  const key = await derive(password, DUMMY_SALT);
  return timingSafeEqual(key, key);
}

export interface PlatformAdminPrincipal {
  id: string;
  username: string;
  displayName: string;
}

/**
 * Authenticate a Platform Admin without disclosing account existence,
 * disabled state, or lockout state. Failed attempts are persisted in the
 * database so the policy survives multiple app instances.
 */
export async function authenticatePlatformAdmin(
  rawUsername: unknown,
  rawPassword: unknown,
): Promise<PlatformAdminPrincipal | null> {
  const username = normalizePlatformAdminUsername(rawUsername);
  const password = String(rawPassword ?? "");
  const account = isValidPlatformAdminUsername(username)
    ? await db.query.platformAdminAccounts.findFirst({ where: eq(platformAdminAccounts.username, username) })
    : null;

  if (!account) {
    await burnPasswordTiming(password);
    return null;
  }

  const now = new Date();
  if (!account.active || (account.lockedUntil && account.lockedUntil > now)) {
    await burnPasswordTiming(password);
    return null;
  }

  const valid = await verifyPlatformAdminPassword(password, account.passwordHash);
  if (!valid) {
    const attempts = account.failedLoginAttempts + 1;
    const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS
      ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000)
      : null;
    await db
      .update(platformAdminAccounts)
      .set({ failedLoginAttempts: lockedUntil ? 0 : attempts, lockedUntil, updatedAt: now })
      .where(eq(platformAdminAccounts.id, account.id));
    if (lockedUntil) {
      await db.insert(auditEvents).values({
        actorPlatformAdminId: account.id,
        action: "admin.login_locked",
        entityType: "platform_admin_account",
        entityId: account.id,
        metadata: { reason: "repeated_failed_attempts" },
      });
    }
    return null;
  }

  await db
    .update(platformAdminAccounts)
    .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: now })
    .where(eq(platformAdminAccounts.id, account.id));
  await db.insert(auditEvents).values({
    actorPlatformAdminId: account.id,
    action: "admin.login_succeeded",
    entityType: "platform_admin_account",
    entityId: account.id,
  });
  return { id: account.id, username: account.username, displayName: account.displayName };
}

export async function createPlatformAdminAccount(input: {
  username: string;
  displayName?: string;
  password: string;
}) {
  const username = normalizePlatformAdminUsername(input.username);
  if (!isValidPlatformAdminUsername(username)) {
    throw new Error("Username must be 3–64 characters and use only letters, numbers, periods, underscores, or hyphens.");
  }
  const passwordHash = await hashPlatformAdminPassword(input.password);
  const [account] = await db
    .insert(platformAdminAccounts)
    .values({ username, displayName: input.displayName?.trim() || username, passwordHash, passwordChangedAt: new Date() })
    .returning();
  return account!;
}

export async function changePlatformAdminPassword(adminId: string, password: string) {
  const passwordHash = await hashPlatformAdminPassword(password);
  await db
    .update(platformAdminAccounts)
    .set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null })
    .where(and(eq(platformAdminAccounts.id, adminId), eq(platformAdminAccounts.active, true)));
  await db.insert(auditEvents).values({
    actorPlatformAdminId: adminId,
    action: "admin.password_changed",
    entityType: "platform_admin_account",
    entityId: adminId,
  });
}
