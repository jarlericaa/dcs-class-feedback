import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { primaryNavFor } from "@/lib/nav-context";
import { requireUser, toShellUser } from "@/lib/session";
import { courseTermParts } from "@/lib/term";
import { IconForward } from "@/components/ui/icons";
import { EmptyState, MetaList, Stamp } from "@/components/ui";
import { TagList } from "@/components/ui/tag";
import { listCourseQa } from "@/modules/publishing";
import { listStudentCourseForms } from "@/modules/forms/submission";
import { getStudentCourseHistory } from "@/modules/publishing";
import { listSectionsForUser } from "@/modules/catalog";

/** The student course index: one card per active enrolled course. */
export default async function StudentCoursesPage() {
  const user = await requireUser();
  const path = "/courses";
  const { studentSections, courseById } = await listSectionsForUser(user.id);
  const courseIds = [...new Set(studentSections.map((section) => section.courseId))];
  const enrolledCourses = [...courseById.values()]
    .filter((course) => courseIds.includes(course.id))
    .sort((a, b) => a.code.localeCompare(b.code));

  const cards = await Promise.all(
    enrolledCourses.map(async (course) => {
      const [forms, history, qa] = await Promise.all([
        listStudentCourseForms(user.id, course.id),
        getStudentCourseHistory(user.id, course.id),
        listCourseQa(user.id, course.id),
      ]);
      const sections = studentSections.filter(
        (section) => section.courseId === course.id,
      );
      return {
        course,
        sections,
        forms,
        qaCount: qa.length,
        submissionCount: history.length,
      };
    }),
  );

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="student"
      navGroups={await primaryNavFor(user, path)}
      title="My courses"
    >
      {cards.length === 0 ? (
        <EmptyState title="No courses yet">
          Your courses appear here once you are enrolled in a class list.
        </EmptyState>
      ) : (
        <div className="stack-4">
          {cards.map(({ course, sections, forms, qaCount, submissionCount }) => {
            const openForms = forms.filter((form) => form.state === "open");
            const termFacts = courseTermParts(
              course.term,
              sections.map((section) => section.term),
            );
            return (
              <Link
                className="notice section-notice"
                href={`/courses/${course.id}`}
                key={course.id}
              >
                <div className="notice__body">
                  <div className="spread">
                    <div className="min-w-0">
                      <h2 className="panel-title">{course.code}</h2>
                      <MetaList items={termFacts} />
                    </div>
                    {course.archivedAt && (
                      <Stamp tone="neutral">Archived</Stamp>
                    )}
                  </div>
                  <div className="section-notice__foot">
                    <TagList
                      items={[
                        openForms.length > 0
                          ? `${openForms.length} active form${openForms.length === 1 ? "" : "s"}`
                          : "No active forms",
                        submissionCount > 0
                          ? `${submissionCount} submission${submissionCount === 1 ? "" : "s"}`
                          : "No submissions yet",
                        qaCount > 0
                          ? `${qaCount} class Q&A`
                          : "No class Q&A yet",
                      ]}
                    />
                    <span className="section-notice__action">
                      Open {course.code}
                      <IconForward size={15} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
