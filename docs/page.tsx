import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { currentUserId, signOut } from "@/auth";
import { db } from "@/db";
import { accountMatches, users } from "@/db/schema";
import { listSectionsForUser } from "@/modules/catalog";
import { generateMatchCandidates } from "@/modules/identity/matching";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/signin");
  const user = (await db.query.users.findFirst({
    where: eq(users.id, userId),
  }))!;

  if (!user.isTeacher && !user.isPlatformAdmin) {
    const existing = await db.query.accountMatches.findFirst({
      where: eq(accountMatches.userId, userId),
    });
    if (!existing) await generateMatchCandidates(userId);
  }

  const { staffSections, studentSections, matchStatus } =
    await listSectionsForUser(userId);

  return (
    <AppShell
      eyebrow="Good to see you"
      title={"Hello, " + (user.displayName?.split(" ")[0] ?? "there")}
      description="Your class spaces, weekly check-ins, and the questions waiting for your attention."
    >
      <div className="dashboard-grid">
        <div className="dashboard-stack">
          {studentSections.length > 0 && (
            <section className="card">
              <div className="card__header">
                <div>
                  <h2>Your classes</h2>
                  <p>Keep up with this week’s pulse.</p>
                </div>
                <span className="badge badge--green">{studentSections.length} active</span>
              </div>
              <div className="card-stack" style={{ padding: "0 14px 14px" }}>
                {studentSections.map((section) => (
                  <Link className="section-card card" key={section.id} href={"/sections/" + section.id}>
                    <div className="section-card__top">
                      <div>
                        <p className="section-kicker">{section.term}</p>
                        <h3 className="section-card__title">{section.title}</h3>
                      </div>
                      <span className="badge badge--amber">Open this week</span>
                    </div>
                    <div className="section-card__bottom">
                      <span className="section-card__meta">Weekly feedback cycle</span>
                      <span className="section-card__action">Open workspace →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {staffSections.length > 0 && (
            <section className="card">
              <div className="card__header">
                <div>
                  <h2>Teaching spaces</h2>
                  <p>Review responses and keep the class loop moving.</p>
                </div>
                <span className="badge badge--neutral">{staffSections.length} sections</span>
              </div>
              <div className="card-stack" style={{ padding: "0 14px 14px" }}>
                {staffSections.map((section) => (
                  <Link className="section-card card" key={section.id} href={"/teach/sections/" + section.id + "/review"}>
                    <div className="section-card__top">
                      <div>
                        <p className="section-kicker">{section.term}</p>
                        <h3 className="section-card__title">{section.title}</h3>
                      </div>
                      <span className="badge badge--green">Staff</span>
                    </div>
                    <div className="section-card__bottom">
                      <span className="section-card__meta">Review inbox · roster · archive</span>
                      <span className="section-card__action">Open tools →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="dashboard-stack">
          <section className="card card--padded">
            <p className="section-kicker">Your activity</p>
            <div className="stat-row" style={{ marginTop: "16px" }}>
              <div className="stat"><strong>{studentSections.length}</strong><span>classes</span></div>
              <div className="stat"><strong>1</strong><span>next action</span></div>
              <div className="stat"><strong>0</strong><span>unread replies</span></div>
            </div>
          </section>
          {staffSections.length === 0 && studentSections.length === 0 && (
            <section className="empty-state">
              <h2>{matchStatus === "pending" ? "Your account is being matched" : "No sections yet"}</h2>
              <p>
                {matchStatus === "pending"
                  ? "A teacher needs to confirm your roster identity before your class spaces appear."
                  : "Once you are enrolled in a section, it will appear here."}
              </p>
            </section>
          )}
          <form action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}>
            <button className="button button--quiet" type="submit">Sign out</button>
          </form>
        </aside>
      </div>
    </AppShell>
  );
}
