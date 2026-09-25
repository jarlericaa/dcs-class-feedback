import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { currentPlatformAdminId, currentPrincipal, currentUserId } from "@/auth";
import { db } from "@/db";
import { platformAdminAccounts, users } from "@/db/schema";

/**
 * Page-level session helper. Every authenticated page starts here.
 *
 * A signed-in session whose user row is missing or deactivated is signed out
 * rather than treated as anonymous, so a disabled account cannot keep browsing
 * on a stale JWT.
 */
export async function requireUser() {
  const principal = await currentPrincipal();
  const userId = await currentUserId();
  if (!userId) redirect(principal?.type === "platform-admin" ? "/admin" : "/signin");
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !user.active) redirect("/signin");
  return user;
}

export type SessionUser = Awaited<ReturnType<typeof requireUser>>;

/** Page-level Platform Admin session. Normal Google users never pass this. */
export async function requirePlatformAdminSession() {
  const adminId = await currentPlatformAdminId();
  if (!adminId) redirect("/signin?method=admin");
  const admin = await db.query.platformAdminAccounts.findFirst({
    where: eq(platformAdminAccounts.id, adminId),
  });
  if (!admin || !admin.active) redirect("/signin?method=admin");
  return admin;
}

export type SessionPlatformAdmin = Awaited<ReturnType<typeof requirePlatformAdminSession>>;

/**
 * Narrow the user row down to what the shell renders.
 *
 * Passing the whole row to a component serializes every column into the RSC
 * payload sent to the browser — including google_sub and the admin flags. The
 * shell only needs a name and an email, so only those cross the wire.
 */
export function toShellUser(user: SessionUser): {
  displayName: string;
  email: string;
} {
  return { displayName: user.displayName, email: user.email };
}

export function toShellPlatformAdmin(admin: SessionPlatformAdmin): {
  displayName: string;
  username: string;
} {
  return { displayName: admin.displayName, username: admin.username };
}
