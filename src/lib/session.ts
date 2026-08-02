import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Page-level session helper. Every authenticated page starts here.
 *
 * A signed-in session whose user row is missing or deactivated is signed out
 * rather than treated as anonymous, so a disabled account cannot keep browsing
 * on a stale JWT.
 */
export async function requireUser() {
  const userId = await currentUserId();
  if (!userId) redirect("/signin");
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !user.active) redirect("/signin");
  return user;
}

export type SessionUser = Awaited<ReturnType<typeof requireUser>>;
