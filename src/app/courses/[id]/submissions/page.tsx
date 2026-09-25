import Link from "next/link";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { classSections, courses } from "@/db/schema";
import { AppShell } from "@/components/layout/app-shell";
import { studentCourseTabs } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import { requireUser, toShellUser } from "@/lib/session";
import { courseTermParts } from "@/lib/term";
import { formatDateTime } from "@/lib/datetime";
import { IconForm, IconForward } from "@/components/ui/icons";
import { AccessDenied, EmptyState, MetaList, Stamp } from "@/components/ui";
import { buttonClass } from "@/components/ui/button";
import { getStudentCourseHistory } from "@/modules/publishing";
import { activeStudentSectionsForCourse, AuthzError } from "@/modules/authz";

/** Course-scoped list of this student's submitted occurrences only. */
export default async function StudentSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const path = `/courses/${courseId}/submissions`;

  let history;
  try {
    history = await getStudentCourseHistory(user.id, courseId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="student"
          navGroups={await primaryNavFor(user, path)}
          title="Course"
        >
          <AccessDenied what="this course" />
        </AppShell>
      );
    }
    throw err;
  }

  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!course) {
    return (
      <AppShell
        user={toShellUser(user)}
        workspace="student"
        navGroups={await primaryNavFor(user, path)}
        title="Course"
      >
        <AccessDenied what="this course" />
      </AppShell>
    );
  }
  const sectionIds = await activeStudentSectionsForCourse(db, user.id, courseId);
  const sections = sectionIds.length
    ? await db.query.classSections.findMany({
        where: inArray(classSections.id, sectionIds),
        columns: { term: true },
      })
    : [];
  const termFacts = courseTermParts(
    course.term,
    sections.map((section) => section.term),
  );

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="student"
      navGroups={await primaryNavFor(user, path)}
      tabs={studentCourseTabs(courseId, path)}
      tabsLabel={course.code}
      contextLabel={course.code}
      title={course.code}
      description={<MetaList items={termFacts} />}
      crumbs={[{ href: "/courses", label: "My courses" }, { href: `/courses/${courseId}`, label: course.code }]}
      roomy
    >
      {history.length === 0 ? (
        <EmptyState title="No submissions yet">
          Submitted forms appear here after you send them.
        </EmptyState>
      ) : (
        <section className="overflow-hidden rounded-panel border border-rule bg-paper">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Form</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.responseId}>
                    <th className="whitespace-normal" scope="row">
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="grid size-9 shrink-0 place-items-center rounded-control bg-accent-wash text-accent-deep"
                        >
                          <IconForm size={18} />
                        </span>
                        <span className="grid min-w-0 gap-0.5">
                          <Link
                            className="font-semibold text-accent-deep underline decoration-1 underline-offset-2 hover:decoration-2"
                            href={`/courses/${courseId}/submissions/${entry.instanceId}`}
                          >
                            {entry.formLabel ?? "Form"}
                          </Link>
                          <MetaList items={[entry.sequenceLabel]} />
                        </span>
                      </div>
                    </th>
                    <td>
                      {entry.submittedAt
                        ? formatDateTime(entry.submittedAt, entry.timezone)
                        : "Submitted"}
                    </td>
                    <td className="align-top">
                      <Stamp tone="green">Submitted</Stamp>
                    </td>
                    <td className="actions align-top">
                      <Link
                        className={buttonClass({ variant: "secondary", size: "small" })}
                        href={`/courses/${courseId}/submissions/${entry.instanceId}`}
                      >
                        View submission
                        <IconForward size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AppShell>
  );
}
