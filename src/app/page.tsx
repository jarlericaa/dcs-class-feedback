import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accountMatches } from "@/db/schema";

import { formatDeadline, timeRemaining } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { homeNav } from "@/components/layout/nav";
import {
  Alert,
  EmptyState,
  MetaList,
  ReviewStatusLine,
  Stamp,
  StripLabel,
} from "@/components/ui";
import { IconForward } from "@/components/ui/icons";
import { listCoursesForUser, listSectionsForUser } from "@/modules/catalog";
import { generateMatchCandidates } from "@/modules/identity/matching";
import { listOpenInstancesForStudent } from "@/modules/forms/submission";
import { listCourseForms } from "@/modules/forms/instances";
import { requireUser, toShellUser } from "@/lib/session";
import { currentUserId } from "@/auth";
import { EntryScreen } from "@/components/marketing/entry-screen";

/**
 * Role-aware home: the board a person sees when they walk up to it.
 *
 * For a student, one notice per FORM they can act on — the course code, what the
 * form is, and when it closes. A form shared by two of their sections appears
 * ONCE, because it is one thing they fill in once; the section is not named at all
 * unless it changes what they must do.
 *
 * For staff, one notice per COURSE, carrying its open forms and what needs
 * answering. Every number is real; there are no decorative counters, and a student
 * card never carries staff metrics.
 */

interface StudentFormCard {
  instanceId: string;
  courseCode: string;
  formTitle: string;
  sequenceLabel: string | null;
  focusLabel: string | null;
  deadlineAt: Date;
  timezone: string;
  submitted: boolean;
}

/**
 * Every form this student can act on, across every section they are in, with each
 * form appearing exactly once.
 *
 * The dedup key is the instance: two memberships in the same course's sections
 * cannot produce two cards, for the same reason they cannot produce two responses.
 */
async function studentFormCards(
  userId: string,
  sections: { id: string; courseId: string; timezone: string }[],
  courseById: Map<string, { code: string }>,
): Promise<StudentFormCard[]> {
  const byInstance = new Map<string, StudentFormCard>();
  for (const section of sections) {
    let open: Awaited<ReturnType<typeof listOpenInstancesForStudent>>;
    try {
      open = await listOpenInstancesForStudent(userId, section.id);
    } catch {
      // Not authorized for this section any more — show nothing for it rather
      // than leaking why.
      continue;
    }
    for (const entry of open) {
      if (byInstance.has(entry.instance.id)) continue;
      byInstance.set(entry.instance.id, {
        instanceId: entry.instance.id,
        courseCode: courseById.get(section.courseId)?.code ?? "Course",
        formTitle: entry.formTitle,
        sequenceLabel: entry.sequenceLabel,
        focusLabel: entry.focusLabel,
        deadlineAt: entry.instance.deadlineAt,
        timezone: section.timezone,
        submitted: entry.alreadySubmitted,
      });
    }
  }
  return [...byInstance.values()].sort(
    (a, b) => a.deadlineAt.getTime() - b.deadlineAt.getTime(),
  );
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

  const studentCards = await studentFormCards(
    user.id,
    studentSections,
    courseById,
  );
  // Staff work per COURSE. A section is who can reach a form, so it is not what
  // the board is made of.
  const teaching = await listCoursesForUser(user.id);
  const staffCards = await Promise.all(
    teaching.map(async (entry) => {
      const forms = await listCourseForms(user.id, entry.course.id).catch(
        () => [],
      );
      return {
        course: entry.course,
        sectionCount: entry.sections.length,
        formCount: forms.length,
        openCount: forms.filter((f) => f.openInstance).length,
        needsReview: forms.reduce((sum, f) => sum + f.needsReviewCount, 0),
        responseCount: forms.reduce((sum, f) => sum + f.responseCount, 0),
      };
    }),
  );

  const open = studentCards.filter((c) => !c.submitted);
  const hasNothing =
    staffCards.length === 0 &&
    studentCards.length === 0 &&
    studentSections.length === 0 &&
    staffSections.length === 0;
  const isStaffView = staffCards.length > 0;
  // A batten divides one region from the next, so it earns its place only when
  // there IS a next one. With a single region the page title already names it.
  const showStrips = studentCards.length > 0 && staffCards.length > 0;
  // A count belongs on a label when it tells the reader something the cards do
  // not — that is, when there are more than a screenful.
  const countIf = (n: number) => (n > 4 ? `${n}` : undefined);

  return (
    <AppShell
      user={toShellUser(user)}
      workspace={isStaffView ? "staff" : "student"}
      navGroups={homeNav("/", {
        isTeacher: user.isTeacher,
        isPlatformAdmin: user.isPlatformAdmin,
      })}
      title="Overview"
      description={
        open.length > 0
          ? `${open.length} form${open.length === 1 ? "" : "s"} waiting for you.`
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
          <section aria-labelledby={showStrips ? "your-classes" : undefined}>
            {showStrips && (
              <StripLabel
                id="your-classes"
                count={countIf(studentCards.length)}
              >
                Your forms
              </StripLabel>
            )}
            <div className="stack-4">
              {studentCards.map((card) => (
                <Link
                  className="notice section-notice"
                  key={card.instanceId}
                  href={`/forms/${card.instanceId}`}
                >
                  <div className="notice__body">
                    <div className="spread">
                      <div style={{ minWidth: 0 }}>
                        {/* The course code is the identity, and the form is what
                            this card is about. The section is absent: the action
                            and the form are the same in every section it went
                            to, so naming one would imply a choice to make. */}
                        <MetaList items={[card.courseCode]} />
                        <h3 className="panel-title" style={{ marginTop: 4 }}>
                          {card.formTitle}
                        </h3>
                      </div>
                      {card.submitted ? (
                        <Stamp tone="green">Submitted</Stamp>
                      ) : (
                        <Stamp tone="amber">Not submitted</Stamp>
                      )}
                    </div>
                    <div className="section-notice__foot">
                      {/* Separate facts, and the remaining time only while it is
                          short enough to act on. */}
                      <MetaList
                        items={[
                          card.sequenceLabel,
                          card.focusLabel,
                          `Closes ${formatDeadline(
                            card.deadlineAt,
                            card.timezone,
                          )}`,
                          card.submitted ? null : timeRemaining(card.deadlineAt),
                        ]}
                      />
                      <span className="section-notice__action">
                        {card.submitted ? "Review my answers" : "Fill in form"}
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
          <section aria-labelledby={showStrips ? "teaching" : undefined}>
            {showStrips && (
              <StripLabel id="teaching" count={countIf(staffCards.length)}>
                Courses you teach
              </StripLabel>
            )}
            <div className="stack-4">
              {staffCards.map((card) => (
                <Link
                  className="notice section-notice"
                  key={card.course.id}
                  href={`/teach/courses/${card.course.id}`}
                >
                  <div className="notice__body">
                    <div className="spread">
                      <div style={{ minWidth: 0 }}>
                        {/* The code IS the heading. The title reads underneath
                            it as what the code stands for. */}
                        <h3 className="panel-title">{card.course.code}</h3>
                        <MetaList items={[card.course.title]} />
                      </div>
                      {card.course.archivedAt && (
                        <Stamp tone="neutral">Archived</Stamp>
                      )}
                    </div>
                    <div className="section-notice__foot">
                      {card.formCount === 0 ? (
                        <span className="meta">No forms yet</span>
                      ) : (
                        <ReviewStatusLine
                          total={card.responseCount}
                          needsReview={card.needsReview}
                        />
                      )}
                      <span className="section-notice__action">
                        {card.needsReview > 0 ? "Review responses" : "Open forms"}
                        <IconForward size={15} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Enrolled, but nothing open. Not an empty page — the archive and
            their own history are still there, and saying so beats a blank. */}
        {studentCards.length === 0 && studentSections.length > 0 && (
          <section>
            {showStrips && <StripLabel>Your classes</StripLabel>}
            <div className="stack-4">
              {studentSections.map((section) => (
                <Link
                  className="notice section-notice"
                  key={section.id}
                  href={`/sections/${section.id}`}
                >
                  <div className="notice__body">
                    <div className="spread">
                      <div style={{ minWidth: 0 }}>
                        <MetaList
                          items={[courseById.get(section.courseId)?.code]}
                        />
                        <h3 className="panel-title" style={{ marginTop: 4 }}>
                          {courseById.get(section.courseId)?.title ??
                            section.title}
                        </h3>
                      </div>
                      <Stamp tone="neutral">Nothing open</Stamp>
                    </div>
                    <div className="section-notice__foot">
                      <span className="meta">
                        No form is open for this class right now
                      </span>
                      <span className="section-notice__action">
                        Open this class
                        <IconForward size={15} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* "Elsewhere" used to sit here: a page region whose whole body was a
            button already permanently in the rail. Removed — the rail is the
            navigation, and repeating it costs a region for nothing. */}

        {/* Nothing here yet. One empty state, carrying the one action that
            actually moves this person forward — which differs by why the page
            is empty. A teacher with no courses creates one; an unconfirmed
            student claims their place; a confirmed student can only wait. */}
        {hasNothing &&
          (user.isTeacher ? (
            <EmptyState
              title="No courses yet"
              action={{ href: "/teach/courses?new=1", label: "New course" }}
              primary
            >
              A course owns its forms. A form goes to one class list, several, or
              all of them.
            </EmptyState>
          ) : matchStatus === "confirmed" ? (
            <EmptyState title="You are not in any class sections yet">
              Once a teacher adds you to a section, its weekly form appears
              here.
            </EmptyState>
          ) : (
            <EmptyState
              title={
                matchStatus === "pending"
                  ? "Your account is waiting to be confirmed"
                  : "We could not match you to a class list"
              }
              action={{ href: "/claim", label: "Enter my student number" }}
              primary
            >
              {/* Privacy, not onboarding: a student needs to know the link is
                  confirmed by a person, because that is what stops someone
                  else being matched to their name. */}
              Class lists carry no email address, so your teacher confirms every
              link by hand. Nothing is confirmed automatically.
            </EmptyState>
          ))}
      </div>
    </AppShell>
  );
}
