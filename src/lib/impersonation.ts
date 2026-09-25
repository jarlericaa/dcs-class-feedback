import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/env";

const COOKIE_NAME = "cf_impersonation";
const MAX_AGE = 60 * 60;

export interface ImpersonationContext {
  /** The credential-authenticated Platform Admin behind the support session. */
  realPlatformAdminId: string;
  targetUserId: string;
  reason: string;
  correlationId: string;
  startedAt: string;
}

function secret() {
  return env.AUTH_SECRET || "development-impersonation-secret";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function seal(context: ImpersonationContext) {
  const payload = Buffer.from(JSON.stringify(context)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function unseal(value: string | undefined): ImpersonationContext | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  try {
    if (
      expected.length !== signature.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    ) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof parsed?.realPlatformAdminId !== "string" ||
      typeof parsed?.targetUserId !== "string" ||
      typeof parsed?.reason !== "string" ||
      typeof parsed?.correlationId !== "string" ||
      typeof parsed?.startedAt !== "string"
    ) return null;
    return parsed as ImpersonationContext;
  } catch {
    return null;
  }
}

export async function getImpersonationContext(): Promise<ImpersonationContext | null> {
  try {
    const store = await cookies();
    return unseal(store.get(COOKIE_NAME)?.value);
  } catch {
    // Background jobs and integration tests have no request cookie store.
    return null;
  }
}

export async function beginImpersonation(input: {
  realPlatformAdminId: string;
  targetUserId: string;
  reason: string;
  correlationId?: string;
}) {
  const context: ImpersonationContext = {
    ...input,
    reason: input.reason.trim().slice(0, 500),
    correlationId: input.correlationId ?? randomUUID(),
    startedAt: new Date().toISOString(),
  };
  const store = await cookies();
  store.set(COOKIE_NAME, seal(context), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
  return context;
}

export async function endImpersonation() {
  const context = await getImpersonationContext();
  const store = await cookies();
  store.delete(COOKIE_NAME);
  return context;
}

/** Every state-changing server action should call this before doing work. */
export async function assertMutationAllowed() {
  const context = await getImpersonationContext();
  if (context) {
    throw new Error("This support session is read-only. Stop impersonating to make changes.");
  }
}

export { COOKIE_NAME as IMPERSONATION_COOKIE_NAME };
