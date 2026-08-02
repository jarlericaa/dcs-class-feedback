import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accountMatches } from "@/db/schema";

import { formatDeadline, timeRemaining } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { homeNav } from "@/components/layout/nav";
import { Alert, Badge, EmptyState, Stat } from "@/components/ui";
import { listSectionsForUser } from "@/modules/catalog";
import { generateMatchCandidates } from "@/modules/identity/matching";
import { getOpenCycleForStudent } from "@/modules/forms/submission";
import { getReviewQueue } from "@/modules/review";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * Role-aware home. Shows the next useful action per section using REAL data
 * only — no decorative counters. Student cards never carry staff metrics and
 * staff cards never carry another section's data.
 */

type StudentCardState =
  | { kind: "open"; deadlineAt: Date; cycleIndex: number }
  | { kind: "submitted"; deadlineAt: Date; cycleIndex: number }
  | { kind: "none" };

async function studentSectionState(
  userId: string,
  sectionId: string,
): Promise<StudentCardState> {
  try {
    const current = await getOpenCycleForStudent(userId, sectionId);
    if (!current) return { kind: "none" };
    return {
      kind: current.alreadySubmitted ? "submitted" : "open",
      deadlineAt: current.cycle.deadlineAt,
      cycleIndex: current.cycle.cycleIndex,
    };
  } catch {
    // Not authorized for this section any more — show the neutral state
    // rather than leaking why.
    return { kind: "none" };
  }
}

async function staffSectionAttention(userId: string, sectionId: string) {
  try {
    const { counts } = await getReviewQueue(userId, sectionId);
    return counts;
  } catch {
    // No review permission on this section: show no counters at all.
    return null;
  }
}

export default async function DashboardPage() {
  const user = await requireUser();

  // First visit by a non-staff account with no match rows yet: run the
  // candidate pipeline so the teacher sees them as pending. Never confirms.
  if (!user.isTeacher && !user.isPlatformAdmin) {
    const existing = await db.query.accountMatches.findFirst({
      where: eq(accountMatches.userId, user.id),
    });
    if (!existing) await generateMatchCandidates(user.id);
  }

  const { staffSections, studentSections, matchStatus, courseById } =
    await listSectionsForUser(user.id);

  const studentCards = await Promise.all(
    studentSections.map(async (section) => ({
      section,
      course: courseById.get(section.courseId) ?? null,
      state: await studentSectionState(user.id, section.id),
    })),
  );
  const staffCards = await Promise.all(
    staffSections.map(async (section) => ({
      section,
      course: courseById.get(section.courseId) ?? null,
      counts: await staffSectionAttention(user.id, section.id),
    })),
  );

  const firstName = user.displayName.split(" ")[0] ?? "there";
  const actionable = studentCards.filter((c) => c.state.kind === "open").length;
  const hasNothing = staffCards.length === 0 && studentCards.length === 0;

  return (
    <AppShell
      user={toShellUser(user)}
      workspace={staffCards.length > 0 ? "staff" : "student"}
      navGroups={homeNav("/", {
        isTeacher: user.isTeacher,
        isPlatformAdmin: user.isPlatformAdmin,
      })}
      eyebrow="Overview"
      title={`Hello, ${firstName}`}
      description={
        actionable > 0
          ? `You have ${actionable} weekly form${actionable === 1 ? "" : "s"} open right now.`
          : "Your class spaces and what needs your attention."
      }
    >
      <div className="dashboard-grid">
        <div className="dashboard-stack">
          {studentCards.length > 0 && (
            <section className="card" aria-labelledby="your-classes">
              <div className="card__header">
                <div>
                  <h2 id="your-classes">Your classes</h2>
                  <p>Weekly feedback for the sections you are enrolled in.</p>
                </div>
              </div>
              <div className="card__body card-stack">
                {studentCards.map(({ section, course, state }) => (
                  <Link
                    className="section-card card"
                    key={section.id}
                    href={`/sections/${section.id}`}
                  >
                    <div className="section-card__top">
                      <div>
                        <p className="section-kicker">
                          {course?.code ?? ""} · {section.term}
                        </p>
                        <h3 className="section-card__title">{section.title}</h3>
                      </div>
                      {state.kind === "open" && (
                        <Badge tone="amber">Open — action needed</Badge>
                      )}
                      {state.kind === "submitted" && (
                        <Badge tone="green">Submitted</Badge>
                      )}
                      {state.kind === "none" && (
                        <Badge tone="neutral">No open form</Badge>
                      )}
                    </div>
                    <div className="section-card__bottom">
                      <span className="section-card__meta">
                        {state.kind === "none"
                          ? "Nothing to complete right now"
                          : `Week ${state.cycleIndex} · closes ${formatDeadline(
                              state.deadlineAt,
                              section.timezone,
                            )} · ${timeRemaining(state.deadlineAt)}`}
                      </span>
                      <span className="section-card__action">
                        {state.kind === "open"
                          ? "Complete the form →"
                          : "Open class →"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {staffCards.length > 0 && (
            <section className="card" aria-labelledby="teaching-spaces">
              <div className="card__header">
                <div>
                  <h2 id="teaching-spaces">Teaching spaces</h2>
                  <p>Sections where you are on the teaching team.</p>
                </div>
              </div>
              <div className="card__body card-stack">
                {staffCards.map(({ section, course, counts }) => (
                  <Link
                    className="section-card card"
                    key={section.id}
                    href={`/teach/sections/${section.id}/review`}
                  >
                    <div className="section-card__top">
                      <div>
                        <p className="section-kicker">
                          {course?.code ?? ""} · {section.term}
                        </p>
                        <h3 className="section-card__title">{section.title}</h3>
                      </div>
                      {counts && counts.needsReview > 0 ? (
                        <Badge tone="amber">
                          {counts.needsReview} needs review
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Staff</Badge>
                      )}
                    </div>
                    <div className="section-card__bottom">
                      <span className="section-card__meta">
                        {counts
                          ? `${counts.total} submission${counts.total === 1 ? "" : "s"} · ${counts.answered} answered${
                              counts.invalid > 0
                                ? ` · ${counts.invalid} invalid`
                                : ""
                            }`
                          : "Open the section workspace"}
                      </span>
                      <span className="section-card__action">
                        Open workspace →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {hasNothing && (
            <EmptyState
              title={
                matchStatus === "pending"
                  ? "Your account is waiting to be confirmed"
                  : matchStatus === "unmatched"
                    ? "We could not match you to a class list"
                    : "No sections yet"
              }
            >
              {matchStatus === "pending"
                ? "A teacher needs to confirm that this account belongs to you before your class spaces appear. Nothing is confirmed automatically."
                : matchStatus === "unmatched"
                  ? "Your name did not match anyone on the imported class lists. Ask your teacher to check the roster and confirm your account manually."
                  : "Once you are enrolled in a section, or added to a teaching team, it will appear here."}
            </EmptyState>
          )}
        </div>

        <aside className="dashboard-stack">
          {matchStatus === "pending" && studentCards.length === 0 && (
            <Alert variant="info" title="Pending identity confirmation">
              Your teacher confirms every account against the class list by
              hand. This is deliberate: it stops someone else being matched to
              your name.
            </Alert>
          )}

          {studentCards.length > 0 && (
            <section className="card card--padded">
              <p className="section-kicker">Your week</p>
              <div className="stat-row" style={{ marginTop: 14 }}>
                <Stat value={studentCards.length} label="classes" />
                <Stat value={actionable} label="forms open" />
              </div>
            </section>
          )}

          {user.isTeacher && (
            <section className="card card--padded">
              <p className="section-kicker">Teaching</p>
              <p className="muted" style={{ margin: "10px 0 14px" }}>
                Create a course, add sections, and set the weekly schedule.
              </p>
              <Link className="button button--secondary" href="/teach/courses">
                Manage courses
              </Link>
            </section>
          )}

          {user.isPlatformAdmin && (
            <section className="card card--padded">
              <p className="section-kicker">Platform</p>
              <p className="muted" style={{ margin: "10px 0 14px" }}>
                Grant the teacher role and troubleshoot accounts. This gives no
                access to any course content.
              </p>
              <Link className="button button--secondary" href="/admin">
                Platform administration
              </Link>
            </section>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
