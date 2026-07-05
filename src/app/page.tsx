import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { currentUserId, signOut } from "@/auth";
import { db } from "@/db";
import { accountMatches, users } from "@/db/schema";
import { listSectionsForUser } from "@/modules/catalog";
import { generateMatchCandidates } from "@/modules/identity/matching";

export default async function DashboardPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/signin");
  const user = (await db.query.users.findFirst({
    where: eq(users.id, userId),
  }))!;

  // First visit by a non-staff account with no match rows yet: run the
  // candidate pipeline so the teacher sees them as pending (never confirms).
  if (!user.isTeacher && !user.isPlatformAdmin) {
    const existing = await db.query.accountMatches.findFirst({
      where: eq(accountMatches.userId, userId),
    });
    if (!existing) await generateMatchCandidates(userId);
  }

  const { staffSections, studentSections, matchStatus } =
    await listSectionsForUser(userId);

  return (
    <main>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>Class Feedback</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <span>{user.displayName} · </span>
          <button type="submit">Sign out</button>
        </form>
      </header>

      {staffSections.length > 0 && (
        <section>
          <h2>Sections you teach</h2>
          <ul>
            {staffSections.map((s) => (
              <li key={s.id}>
                {s.title} ({s.term}) —{" "}
                <Link href={`/teach/sections/${s.id}/review`}>review</Link> ·{" "}
                <Link href={`/teach/sections/${s.id}/matches`}>matches</Link> ·{" "}
                <Link href={`/teach/sections/${s.id}/import`}>import roster</Link> ·{" "}
                <Link href={`/sections/${s.id}/qa`}>Q&amp;A archive</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {studentSections.length > 0 && (
        <section>
          <h2>Your sections</h2>
          <ul>
            {studentSections.map((s) => (
              <li key={s.id}>
                {s.title} ({s.term}) —{" "}
                <Link href={`/sections/${s.id}`}>weekly form</Link> ·{" "}
                <Link href={`/sections/${s.id}/history`}>my submissions</Link> ·{" "}
                <Link href={`/sections/${s.id}/qa`}>Q&amp;A archive</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {staffSections.length === 0 && studentSections.length === 0 && (
        <section>
          {matchStatus === "pending" ? (
            <p>
              Your account is <strong>pending verification</strong>. Your
              teacher must confirm your identity before you can access your
              sections.
            </p>
          ) : (
            <p>No sections yet.</p>
          )}
        </section>
      )}
    </main>
  );
}
