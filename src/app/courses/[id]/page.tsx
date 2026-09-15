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
import {
  AccessDenied,
  CycleStateBadge,
  EmptyState,
  MetaList,
} from "@/components/ui";
import { buttonClass } from "@/components/ui/button";
import { DELIVERY_LABELS } from "@/modules/forms/schedules";
import { listStudentCourseForms } from "@/modules/forms/submission";
import { activeStudentSectionsForCourse, AuthzError } from "@/modules/authz";
import { resolveCourseTimezone } from "@/modules/catalog";

function formAction(
  form: Awaited<ReturnType<typeof listStudentCourseForms>>[number],
  courseId: string,
) {
  if (form.state !== "open") return null;
  return {
    href: `/forms/${form.instanceId}`,
    label: form.response?.lifecycle === "draft" ? "Continue" : "Answer form",
  };
}

/** Student course Forms tab. */
export default async function StudentFormsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const path = `/courses/${courseId}`;

  let forms;
  try {
    forms = await listStudentCourseForms(user.id, courseId);
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
  const timezone = await resolveCourseTimezone(courseId);
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
      crumbs={[{ href: "/courses", label: "My courses" }, { href: path, label: course.code }]}
      roomy
    >
      {forms.length === 0 ? (
        <EmptyState title="No upcoming forms">
          Open and upcoming forms for this course appear here.
        </EmptyState>
      ) : (
        <section className="overflow-hidden rounded-panel border border-rule bg-paper">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Form</th>
                  <th scope="col">Deadline / delivery</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => {
                  const action = formAction(form, courseId);
                  return (
                    <tr key={form.instanceId}>
                      <th className="whitespace-normal" scope="row">
                        <div className="flex items-start gap-3">
                          <span
                            aria-hidden="true"
                            className="grid size-9 shrink-0 place-items-center rounded-control bg-accent-wash text-accent-deep"
                          >
                            <IconForm size={18} />
                          </span>
                          <span className="grid min-w-0 gap-0.5">
                            {action ? (
                              <Link
                                className="font-semibold text-accent-deep underline decoration-1 underline-offset-2 hover:decoration-2"
                                href={action.href}
                              >
                                {form.formTitle}
                              </Link>
                            ) : (
                              <span className="font-semibold text-ink">
                                {form.formTitle}
                              </span>
                            )}
                            <MetaList
                              items={[
                                form.sequenceLabel,
                                form.focusLabel,
                              ]}
                            />
                          </span>
                        </div>
                      </th>
                      <td>
                        <span className="grid gap-0.5">
                          <span>{DELIVERY_LABELS[form.deliveryMode]}</span>
                          <span className="meta">
                            {form.state === "scheduled" ? "Opens" : "Closes"}{" "}
                            {formatDateTime(form.state === "scheduled" ? form.openAt : form.deadlineAt, timezone)}
                          </span>
                        </span>
                      </td>
                      <td className="align-top">
                        <CycleStateBadge state={form.state} />
                      </td>
                      <td className="actions align-top">
                        {action ? (
                          <Link
                            className={buttonClass({ variant: "primary", size: "small" })}
                            href={action.href}
                          >
                            {action.label}
                            <IconForward size={15} />
                          </Link>
                        ) : (
                          <span className="meta">Not open yet</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AppShell>
  );
}
