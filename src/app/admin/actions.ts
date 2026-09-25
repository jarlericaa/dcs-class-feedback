"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { currentPlatformAdminId } from "@/auth";
import { beginImpersonation, endImpersonation, getImpersonationContext } from "@/lib/impersonation";
import { requirePlatformAdmin } from "@/modules/authz";
import { writeAudit } from "@/modules/audit";
import { CatalogError, setAccountActive, grantTeacherAccess, revokeTeacherAccess } from "@/modules/catalog";

function message(error: unknown) {
  return error instanceof Error ? error.message : "The action could not be completed.";
}

export async function grantTeacherAction(formData: FormData) {
  const adminId = await currentPlatformAdminId();
  if (!adminId) redirect("/signin");
  let success = "";
  try {
    const raw = String(formData.get("emails") ?? "");
    const emails = [...new Set(raw.split(/[;,\n]+/).map((email) => email.trim()).filter(Boolean))];
    if (!emails.length) throw new CatalogError("Add at least one email address.");
    const results = [];
    for (const email of emails) results.push(await grantTeacherAccess(adminId, email));
    const pending = results.filter((result) => result.pending).length;
    success = `${results.length} teacher access grant${results.length === 1 ? "" : "s"} saved${pending ? `; ${pending} will apply on first sign-in` : ""}.`;
  } catch (error) {
    redirect(`/admin?error=${encodeURIComponent(message(error))}`);
  }
  redirect(`/admin?ok=${encodeURIComponent(success)}`);
}

export async function revokeTeacherAction(formData: FormData) {
  const adminId = await currentPlatformAdminId();
  if (!adminId) redirect("/signin");
  try {
    await revokeTeacherAccess(adminId, String(formData.get("email") ?? ""));
  } catch (error) {
    redirect(`/admin?error=${encodeURIComponent(message(error))}`);
  }
  redirect("/admin?ok=Teacher%20access%20revoked.");
}

export async function accountStatusAction(formData: FormData) {
  const adminId = await currentPlatformAdminId();
  if (!adminId) redirect("/signin");
  try {
    await setAccountActive(adminId, String(formData.get("userId") ?? ""), String(formData.get("active")) === "true");
  } catch (error) {
    redirect(`/admin?error=${encodeURIComponent(message(error))}`);
  }
  redirect("/admin?ok=Account%20status%20updated.");
}

export async function startImpersonationAction(formData: FormData) {
  const adminId = await currentPlatformAdminId();
  if (!adminId) redirect("/signin");
  let targetId = "";
  let correlationId = "";
  try {
    await requirePlatformAdmin(db, adminId);
    if (await getImpersonationContext()) throw new CatalogError("Stop the current support session before starting another one.");
    targetId = String(formData.get("userId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) throw new CatalogError("Enter a reason for this support session.");
    if (!z.string().uuid().safeParse(targetId).success) throw new CatalogError("Account not found.");
    if (targetId === adminId) throw new CatalogError("You cannot impersonate your own account.");
    const target = await db.query.users.findFirst({ where: eq(users.id, targetId) });
    if (!target || !target.active) throw new CatalogError("Only an active account can be impersonated.");
    const context = await db.transaction(async (tx) => {
      const nextCorrelationId = randomUUID();
      await writeAudit(tx, {
        actorUserId: null,
        actorPlatformAdminId: adminId,
        action: "admin.impersonation_started",
        entityType: "user",
        entityId: target.id,
        metadata: { targetUserId: target.id, reason, correlationId: nextCorrelationId },
      });
      return { correlationId: nextCorrelationId };
    });
    correlationId = context.correlationId;
    await beginImpersonation({ realPlatformAdminId: adminId, targetUserId: target.id, reason, correlationId });
  } catch (error) {
    redirect(`/admin?account=${encodeURIComponent(targetId)}&error=${encodeURIComponent(message(error))}`);
  }
  redirect(`/admin?as=${encodeURIComponent(targetId)}&correlation=${encodeURIComponent(correlationId)}`);
}

export async function stopImpersonationAction() {
  const context = await endImpersonation();
  if (!context) redirect("/admin");
  const admin = await requirePlatformAdmin(db, context.realPlatformAdminId);
  await writeAudit(db, {
    actorUserId: null,
    actorPlatformAdminId: admin.id,
    action: "admin.impersonation_ended",
    entityType: "user",
    entityId: context.targetUserId,
    metadata: { targetUserId: context.targetUserId, reason: context.reason, correlationId: context.correlationId },
  });
  redirect(`/admin?account=${encodeURIComponent(context.targetUserId)}`);
}
