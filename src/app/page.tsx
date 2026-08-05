import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accountMatches } from "@/db/schema";

import { formatDeadline, timeRemaining } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { homeNav } from "@/components/layout/nav";
import { Alert, EmptyState, Notice, Stamp, StripLabel } from "@/components/ui";
import { IconForward } from "@/components/ui/icons";
import { listSectionsForUser } from "@/modules/catalog";
import { generateMatchCandidates } from "@/modules/identity/matching";
import { getOpenCycleForStudent } from "@/modules/forms/submission";
import { getReviewQueue } from "@/modules/review";
import { requireUser, toShellUser } from "@/lib/session";
import { currentUserId } from "@/auth";
import { EntryScreen } from "@/components/marketing/entry-screen";

/**
 * Role-aware home: the board a person sees when they walk up to it.
 *
 * Each class is one posted notice carrying the only three things that decide
 * what happens next — which class, what state this week is in, and when it
 * closes. Every number is real; there are no decorative counters, and a
 * student card never carries staff metrics.
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

export default async function HomePage() {
  // Signed out: render the entry screen here instead of bouncing to /signin,
  // so the root is a finished screen rather than a redirect.
  if (!(await currentUserId())) return <EntryScreen />;

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
  const open = studentCards.filter((c) => c.state.kind === "open");
  const hasNothing = staffCards.length === 0 && studentCards.length === 0;
  const isStaffView = staffCards.length > 0;

  return (
    <AppShell
      user={toShellUser(user)}
      workspace={isStaffView ? "staff" : "student"}
      navGroups={homeNav("/", {
        isTeacher: user.isTeacher,
        isPlatformAdmin: user.isPlatformAdmin,
      })}
      title={`Hello, ${firstName}`}
      description={
        open.length > 0
          ? `${open.length} weekly form${open.length === 1 ? " is" : "s are"} open right now. Everything else can wait.`
          : studentCards.length > 0
            ? "Nothing is waiting on you right now."
            : undefined
      }
      roomy={!isStaffView}
    >
      <div className="stack-6">
        {matchStatus === "pending" && studentCards.length > 0 && (
          <Alert variant="info" title="Your account is still being confirmed">
            A teacher has to match your sign-in to the class list before your
            submissions count towards participation. You can still fill in the
            form.
          </Alert>
        )}

        {studentCards.length > 0 && (
          <section aria-labelledby="your-classes">
            <StripLabel id="your-classes" count={`${studentCards.length}`}>
              Your classes
            </StripLabel>
            <div className="stack-4">
              {studentCards.map(({ section, course, state }) => (
                <Link
                  className="notice section-notice"
                  key={section.id}
                  href={`/sections/${section.id}`}
                >
                  <div className="notice__body">
                    <div className="spread">
                      <div style={{ minWidth: 0 }}>
                        <p className="meta">
                          {course?.code ?? ""} · {section.term}
                        </p>
                        <h3 className="panel-title" style={{ marginTop: 4 }}>
                          {section.title}
                        </h3>
                      </div>
                      {state.kind === "open" && (
                        <Stamp tone="amber">Open · not submitted</Stamp>
                      )}
                      {state.kind === "submitted" && (
                        <Stamp tone="green">Submitted</Stamp>
                      )}
                      {state.kind === "none" && (
                        <Stamp tone="neutral">No form open</Stamp>
                      )}
                    </div>
                    <div className="section-notice__foot">
                      <span className="meta">
                        {state.kind === "none"
                          ? "Nothing to complete right now"
                          : `Week ${state.cycleIndex} · closes ${formatDeadline(
                              state.deadlineAt,
                              section.timezone,
                            )} · ${timeRemaining(state.deadlineAt)}`}
                      </span>
                      <span className="section-notice__action">
                        {state.kind === "open"
                          ? "Fill in the form"
                          : state.kind === "submitted"
                            ? "See my submissions"
                            : "Open this class"}
                        <IconForward size={15} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {staffCards.length > 0 && (
          <section aria-labelledby="teaching">
            <StripLabel id="teaching" count={`${staffCards.length}`}>
              Sections you teach
            </StripLabel>
            <div className="stack-4">
              {staffCards.map(({ section, course, counts }) => (
                <Link
                  className="notice section-notice"
                  key={section.id}
                  href={`/teach/sections/${section.id}/review`}
                >
                  <div className="notice__body">
                    <div className="spread">
                      <div style={{ minWidth: 0 }}>
                        <p className="meta">
                          {course?.code ?? ""} · {section.term}
                        </p>
                        <h3 className="panel-title" style={{ marginTop: 4 }}>
                          {section.title}
                        </h3>
                      </div>
                      {counts && counts.needsReview > 0 ? (
                        <Stamp tone="amber">
                          {counts.needsReview} need review
                        </Stamp>
                      ) : counts ? (
                        <Stamp tone="green">Nothing waiting</Stamp>
                      ) : (
                        <Stamp tone="neutral">Staff access</Stamp>
                      )}
                    </div>
                    <div className="section-notice__foot">
                      <span className="meta">
                        {counts
                          ? `${counts.total} submission${counts.total === 1 ? "" : "s"} · ${counts.answered} answered${
                              counts.invalid > 0
                                ? ` · ${counts.invalid} invalid`
                                : ""
                            }`
                          : "Open the section workspace"}
                      </span>
                      <span className="section-notice__action">
                        Open the review inbox
                        <IconForward size={15} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {(user.isTeacher || user.isPlatformAdmin) && (
          <section aria-labelledby="elsewhere">
            <StripLabel id="elsewhere">Elsewhere</StripLabel>
            <div className="row">
              {user.isTeacher && (
                <Link
                  className="button button--secondary"
                  href="/teach/courses"
                >
                  Courses and sections
                </Link>
              )}
              {user.isPlatformAdmin && (
                <Link className="button button--secondary" href="/admin">
                  Platform administration
                </Link>
              )}
            </div>
          </section>
        )}

        {hasNothing && (
          <div className="stack-4">
            <EmptyState
              title={
                matchStatus === "pending"
                  ? "Your account is waiting to be confirmed"
                  : matchStatus === "unmatched"
                    ? "We could not match you to a class list"
                    : "You are not in any class sections yet"
              }
            >
              {matchStatus === "pending"
                ? "A teacher has to confirm that this sign-in belongs to you before your classes appear. Nothing is confirmed automatically."
                : matchStatus === "unmatched"
                  ? "Your sign-in name did not match anyone on a class list. Tell us your student number and your teacher will confirm it."
                  : "Once a teacher adds you to a section, its weekly form appears here."}
            </EmptyState>

            {matchStatus !== "confirmed" && (
              <Notice title="Claim your place on the class list">
                <p className="doc">
                  Class lists carry no email address, so tell us your student
                  number instead. Your teacher confirms every link by hand —
                  that is deliberate: it stops someone else being matched to
                  your name.
                </p>
                <div className="row" style={{ marginTop: "var(--s5)" }}>
                  <Link className="button button--primary" href="/claim">
                    Enter my student number
                  </Link>
                </div>
              </Notice>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
