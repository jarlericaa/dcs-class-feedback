import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teacherAccessGrants, users } from "@/db/schema";
import { env } from "@/env";
import { isAllowedEmailDomain, normalizeEmail } from "@/modules/identity/email";
import { getImpersonationContext } from "@/lib/impersonation";
import { authenticatePlatformAdmin } from "@/modules/platform-admin/credentials";

/**
 * Auth foundation (docs/domain/student-identity.md §1):
 * - Google SSO restricted to authorized university domains (ALLOWED_EMAIL_DOMAINS).
 * - Signing in creates/updates a User row, keyed by the NORMALIZED email. Nothing
 *   else has to happen: whether that user is a student is answered later, by
 *   looking their email up against the teacher-uploaded class lists.
 * - JWT sessions (no adapter tables); the JWT carries an explicit principal
 *   type so a Platform Admin id can never be mistaken for users.id.
 *
 * The email is normalized here, at the only place an address enters the system,
 * so every later comparison is a plain equality against an already-normalized
 * value on both sides.
 *
 * Dev login: a local-development-only credentials provider for when Google
 * OAuth credentials are unavailable. It is NOT registered unless
 * env.devAuthEnabled — which is hard-false in production (see src/env.ts).
 * It signs in an EXISTING user by email only; it never creates users.
 */

async function upsertGoogleUser(profile: {
  sub: string;
  email: string;
  name: string;
}): Promise<string> {
  const email = normalizeEmail(profile.email);
  return db.transaction(async (tx) => {
    const grant = await tx.query.teacherAccessGrants.findFirst({
      where: eq(teacherAccessGrants.email, email),
    });
    const existing = await tx.query.users.findFirst({
      where: eq(users.googleSub, profile.sub),
    });
    if (existing) {
      await tx
        .update(users)
        .set({
          displayName: profile.name,
          email,
          isTeacher: existing.isTeacher || (!!grant && !grant.revokedAt),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
      return existing.id;
    }
    // Same email may exist from a pre-provisioned account (e.g. a pending
    // teacher grant before first login) — attach the Google subject to it.
    const byEmail = await tx.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (byEmail) {
      await tx
        .update(users)
        .set({
          googleSub: profile.sub,
          displayName: profile.name,
          isTeacher: byEmail.isTeacher || (!!grant && !grant.revokedAt),
          updatedAt: new Date(),
        })
        .where(eq(users.id, byEmail.id));
      return byEmail.id;
    }
    const [created] = await tx
      .insert(users)
      .values({
        googleSub: profile.sub,
        email,
        displayName: profile.name,
        isTeacher: !!grant && !grant.revokedAt,
      })
      .returning();
    return created!.id;
  });
}

const providers: NextAuthConfig["providers"] = [];

if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    }),
  );
}

providers.push(
  Credentials({
    id: "platform-admin",
    name: "Platform administrator sign-in",
    credentials: {
      username: { label: "Username", type: "text" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const admin = await authenticatePlatformAdmin(
        credentials?.username,
        credentials?.password,
      );
      if (!admin) return null;
      return { id: admin.id, name: admin.displayName };
    },
  }),
);

// SECURITY: this branch is unreachable in production — env.devAuthEnabled is
// computed as `NODE_ENV !== "production" && DEV_AUTH_ENABLED === "true"`.
if (env.devAuthEnabled) {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev login (local only)",
      credentials: {
        email: { label: "Email of an existing user", type: "email" },
      },
      async authorize(credentials) {
        // Belt-and-braces re-check at call time.
        if (process.env.NODE_ENV === "production" || !env.devAuthEnabled) {
          return null;
        }
        const email = normalizeEmail(String(credentials?.email ?? ""));
        if (!email) return null;
        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
        if (!user || !user.active) return null;
        return { id: user.id, email: user.email, name: user.displayName };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "google") {
        const email = normalizeEmail(profile?.email);
        if (!isAllowedEmailDomain(email)) return false;
        const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
        return existing?.active !== false;
      }
      if (account?.provider === "platform-admin") return !!user?.id;
      if (account?.provider === "dev-login") {
        return env.devAuthEnabled && !!user;
      }
      return false;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "google" && profile?.sub && profile.email) {
        token.principalType = "user";
        token.userId = await upsertGoogleUser({
          sub: profile.sub,
          email: profile.email,
          name: profile.name ?? profile.email,
        });
      } else if (account?.provider === "platform-admin" && user?.id) {
        token.principalType = "platform-admin";
        token.platformAdminId = user.id;
      } else if (account?.provider === "dev-login" && user?.id) {
        token.principalType = "user";
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.principalType === "platform-admin" && typeof token.platformAdminId === "string") {
        session.principal = { type: "platform-admin", platformAdminId: token.platformAdminId };
        session.platformAdminId = token.platformAdminId;
      } else if (typeof token.userId === "string") {
        session.principal = { type: "user", userId: token.userId };
        session.userId = token.userId;
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    principal?:
      | { type: "user"; userId: string }
      | { type: "platform-admin"; platformAdminId: string };
    /** users.id of a normal signed-in account (never an admin id). */
    userId?: string;
    platformAdminId?: string;
  }
}

export async function currentPrincipal(): Promise<
  | { type: "user"; userId: string }
  | { type: "platform-admin"; platformAdminId: string }
  | null
> {
  const session = await auth();
  if (session?.principal?.type === "platform-admin" && session.principal.platformAdminId) {
    return { type: "platform-admin", platformAdminId: session.principal.platformAdminId };
  }
  if (session?.principal?.type === "user" && session.principal.userId) {
    return { type: "user", userId: session.principal.userId };
  }
  // JWTs issued before the principal field was introduced remain normal users
  // only; there is intentionally no legacy admin fallback here.
  if (session?.userId) return { type: "user", userId: session.userId };
  return null;
}

/** Server-side helper: current users.id or null. */
export async function currentUserId(): Promise<string | null> {
  const principal = await currentPrincipal();
  const impersonation = await getImpersonationContext();
  if (principal?.type === "platform-admin") {
    if (impersonation?.realPlatformAdminId !== principal.platformAdminId) return null;
    const target = await db.query.users.findFirst({
      where: eq(users.id, impersonation.targetUserId),
      columns: { id: true, active: true },
    });
    return target?.active ? target.id : null;
  }
  if (!principal || principal.type !== "user") return null;
  return principal.userId;
}

/** The signed-in Platform Admin behind a support session, if one exists. */
export async function currentPlatformAdminId(): Promise<string | null> {
  const session = await auth();
  return session?.principal?.type === "platform-admin"
    ? session.principal.platformAdminId
    : null;
}

/** Backwards-compatible name; it now returns only the admin principal id. */
export async function realCurrentUserId(): Promise<string | null> {
  return currentPlatformAdminId();
}
