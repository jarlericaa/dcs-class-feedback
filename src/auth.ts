import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { env } from "@/env";

/**
 * Auth foundation (account-matching.md §1):
 * - Google SSO restricted to authorized university domains (ALLOWED_EMAIL_DOMAINS).
 * - Signing in creates/updates a User row. A User is NOT a student until an
 *   AccountMatch is confirmed by a teacher.
 * - JWT sessions (no adapter tables); the JWT carries our users.id.
 *
 * Dev login: a local-development-only credentials provider for when Google
 * OAuth credentials are unavailable. It is NOT registered unless
 * env.devAuthEnabled — which is hard-false in production (see src/env.ts).
 * It signs in an EXISTING user by email only; it never creates users.
 */

function emailDomainAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return env.allowedEmailDomains.includes(domain);
}

async function upsertGoogleUser(profile: {
  sub: string;
  email: string;
  name: string;
}): Promise<string> {
  const existing = await db.query.users.findFirst({
    where: eq(users.googleSub, profile.sub),
  });
  if (existing) {
    await db
      .update(users)
      .set({
        displayName: profile.name,
        email: profile.email,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    return existing.id;
  }
  // Same email may exist from a pre-provisioned account (e.g. seed/admin
  // grant before first login) — attach the Google subject to it.
  const byEmail = await db.query.users.findFirst({
    where: eq(users.email, profile.email),
  });
  if (byEmail) {
    await db
      .update(users)
      .set({
        googleSub: profile.sub,
        displayName: profile.name,
        updatedAt: new Date(),
      })
      .where(eq(users.id, byEmail.id));
    return byEmail.id;
  }
  const [created] = await db
    .insert(users)
    .values({
      googleSub: profile.sub,
      email: profile.email,
      displayName: profile.name,
    })
    .returning();
  return created!.id;
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
        const email = String(credentials?.email ?? "").toLowerCase();
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
        if (!emailDomainAllowed(profile?.email)) return false;
        return true;
      }
      if (account?.provider === "dev-login") {
        return env.devAuthEnabled && !!user;
      }
      return false;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "google" && profile?.sub && profile.email) {
        token.userId = await upsertGoogleUser({
          sub: profile.sub,
          email: profile.email,
          name: profile.name ?? profile.email,
        });
      } else if (account?.provider === "dev-login" && user?.id) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.userId === "string") {
        session.userId = token.userId;
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    /** users.id of the signed-in account */
    userId?: string;
  }
}

/** Server-side helper: current users.id or null. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.userId ?? null;
}
