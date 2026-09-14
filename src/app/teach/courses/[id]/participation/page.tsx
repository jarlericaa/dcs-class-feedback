import { AppShell } from "@/components/layout/app-shell";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  ArchivedNotice,
  EmptyState,
  MetaList,
  Stamp,
} from "@/components/ui";
import { buttonClass } from "@/components/ui/button";
import { IconDownload } from "@/components/ui/icons";
import { db } from "@/db";
import { formatDate } from "@/lib/datetime";
import { requireUser, toShellUser } from "@/lib/session";
import { courseTermParts } from "@/lib/term";
import { AuthzError } from "@/modules/authz";
import { resolveCourseTimezone } from "@/modules/catalog";
import { getCourseParticipationOverview } from "@/modules/participation";

/**
 * Course-level form participation.
 *
 * Participation is derived from submitted form responses. This page combines
 * the accessible class lists into one course-wide matrix, so a teacher can see
 * who participated in each form occurrence without starting from a question
 * answer or a particular section.
 */
export default async function CourseParticipationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const path = `/teach/courses/${courseId}/participation`;

  let overview: Awaited<ReturnType<typeof getCourseParticipationOverview>>;
  try {
    overview = await getCourseParticipationOverview(user.id, courseId);
  } catch (err) {
    if (!(err instanceof AuthzError)) throw err;
    return (
      <AppShell
        user={toShellUser(user)}
        workspace="staff"
        navGroups={await primaryNavFor(user, path)}
        title="Participation"
      >
        <AccessDenied what="participation records for this course" />
      </AppShell>
    );
  }

  const course = await db.query.courses.findFirst({
    where: (table, { eq }) => eq(table.id, courseId),
  });
  if (!course) throw new Error("Course not found");
  const terms = overview.sections.map((section) => section.term);
  const timezone = await resolveCourseTimezone(courseId);

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, path, {
        fallbackHref: `/teach/courses/${course.id}`,
      })}
      tabGroups={await courseTabGroupsFor(user.id, courseId, path)}
      tabsLabel={course.code}
      contextLabel={course.code}
      actions={
        overview.cycles.length > 0 ? (
          <a
            className={buttonClass({ variant: "secondary" })}
            href={`/teach/courses/${courseId}/participation/export`}
            title="Download the course-wide form participation matrix as a CSV"
          >
            <IconDownload size={15} />
            Download CSV
          </a>
        ) : undefined
      }
      crumbs={[
        { href: "/teach/courses", label: "My courses" },
        { href: `/teach/courses/${course.id}`, label: course.code },
      ]}
      title={course.code}
      description={<MetaList items={courseTermParts(course.term, terms)} />}
    >
      <div className="stack-4">
        {overview.archived && <ArchivedNotice courseCode={course.code} />}

        {overview.sections.length === 0 ? (
          <EmptyState
            title="No class lists yet"
            action={{
              href: `/teach/courses/${courseId}/sections?new=1`,
              label: "Add a class list",
            }}
            primary
          >
            Add a class list before collecting form participation.
          </EmptyState>
        ) : overview.cycles.length === 0 ? (
          <EmptyState title="No form participation yet">
            Participation will appear here after a form occurrence collects
            submissions.
          </EmptyState>
        ) : overview.students.length === 0 ? (
          <EmptyState title="No students on these class lists">
            Import a class list before reviewing course-wide participation.
          </EmptyState>
        ) : (
          <section className="notice" aria-labelledby="participation-heading">
            <div className="notice__head">
              <div>
                <h2 className="panel-title" id="participation-heading">
                  Form participation
                </h2>
              </div>
            </div>
            <div className="table-scroll table-scroll--flush">
              <table className="data-table">
                <caption className="visually-hidden">
                  Course-wide form participation by student
                </caption>
                <thead>
                  <tr>
                    <th
                      className="sticky left-0 z-20 border-r border-rule bg-paper-quiet"
                      scope="col"
                    >
                      Student
                    </th>
                    {overview.cycles.map((cycle) => (
                      <th className="num" key={cycle.id} scope="col">
                        <span>{cycle.label}</span>
                        <span className="visually-hidden">
                          {" "}opened {formatDate(cycle.openAt, timezone)}
                        </span>
                      </th>
                    ))}
                    <th className="num matrix__total" scope="col">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overview.students.map((student) => (
                    <tr key={student.studentRecordId}>
                      <th
                        className="wrap sticky left-0 z-10 border-r border-rule bg-paper"
                        scope="row"
                      >
                        {student.fullName}
                        {!student.active && (
                          <>
                            {" "}
                            <Stamp tone="neutral">Dropped</Stamp>
                          </>
                        )}
                      </th>
                      {overview.cycles.map((cycle) => {
                        const eligible = student.eligibleCycleIds.has(cycle.id);
                        const participated =
                          eligible && student.participatedCycleIds.has(cycle.id);
                        return (
                          <td className="num" key={cycle.id}>
                            <span
                              className={
                                participated ? "yesno yesno--yes" : "muted"
                              }
                              aria-label={
                                !eligible
                                  ? "not assigned to this form"
                                  : participated
                                    ? "participated"
                                    : "did not participate"
                              }
                            >
                              {participated ? "Yes" : "No"}
                            </span>
                          </td>
                        );
                      })}
                      <td className="num matrix__total">
                        <strong>{student.totalWeeks}</strong> /{" "}
                        {student.eligibleCycleIds.size}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
