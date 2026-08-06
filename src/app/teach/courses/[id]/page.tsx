import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classSections, courses } from "@/db/schema";

import { AppShell } from "@/components/layout/app-shell";
import { courseNav } from "@/components/layout/nav";
import {
  AccessDenied,
  Alert,
  ArchivedNotice,
  CycleStateBadge,
  EmptyState,
  MetaList,
  Stamp,
} from "@/components/ui";
import { IconPlus } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/datetime";
import { termParts } from "@/lib/term";
import { AuthzError } from "@/modules/authz";
import { listCourseForms, type CourseFormRow } from "@/modules/forms/instances";
import { DELIVERY_LABELS } from "@/modules/forms/schedules";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * The teacher's course workspace.
 *
 * The course code is the identity; the title and the term are quiet context. The
 * page's subject is the course's FORMS — what exists, who gets it, when it opens,
 * and what to do next. Class lists and access have their own destination, because
 * a section is who can reach a form, not a thing a teacher works on.
 */
export default async function CourseWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const { ok, error } = await searchParams;

  let forms: CourseFormRow[];
  try {
    forms = await listCourseForms(user.id, courseId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={[]}
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
        workspace="staff"
        navGroups={[]}
        title="Course"
      >
        <AccessDenied what="this course" />
      </AppShell>
    );
  }
  const sections = await db.query.classSections.findMany({
    where: eq(classSections.courseId, courseId),
  });
  const terms = [...new Set(sections.map((s) => s.term))];
  const needsReview = forms.reduce((sum, f) => sum + f.needsReviewCount, 0);

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={courseNav(courseId, `/teach/courses/${courseId}`, {
        needsReview,
      })}
      contextLabel={course.code}
      /* The code is the title. The academic year and semester sit under it as
         quiet context so two offerings of CS 33 are never confused; the course
         title is metadata, not the heading. */
      title={course.code}
      description={
        <MetaList
          items={[
            course.title,
            ...(terms.length === 1 ? termParts(terms[0]!) : []),
            terms.length > 1 ? `${terms.length} terms` : null,
          ]}
        />
      }
      actions={
        <Link
          className="button button--primary"
          href={`/teach/courses/${courseId}/forms/new`}
        >
          <IconPlus size={15} />
          New form
        </Link>
      }
    >
      <div className="stack-4">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        {course.archivedAt && <ArchivedNotice courseCode={course.code} />}

        {sections.length === 0 && (
          <Alert variant="info" title="No class lists yet">
            A form needs at least one class list to go to.{" "}
            <Link className="link" href={`/teach/courses/${courseId}/sections`}>
              Add a section
            </Link>{" "}
            first.
          </Alert>
        )}

        {forms.length === 0 ? (
          <EmptyState
            title="No forms yet"
            action={{
              href: `/teach/courses/${courseId}/forms/new`,
              label: "New form",
            }}
            primary
          >
            A form can go out once, every week, on your own schedule, or only
            when you open it.
          </EmptyState>
        ) : (
          <section className="notice">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Form</th>
                    <th scope="col">Goes to</th>
                    <th scope="col">Delivery</th>
                    <th scope="col">Status</th>
                    <th scope="col">Responses</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {forms.map((row) => (
                    <FormRow key={row.template.id} row={row} courseId={courseId} />
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

/**
 * One form. Audience, delivery, status and actions are separate fields on
 * purpose: they answer four different questions, and welding them into one
 * sentence makes none of them scannable.
 */
function FormRow({ row, courseId }: { row: CourseFormRow; courseId: string }) {
  const audience = describeAudience(row);
  const delivery = row.schedule
    ? DELIVERY_LABELS[row.schedule.deliveryMode]
    : "Not scheduled";
  return (
    <tr>
      <th scope="row">
        <Link
          className="link"
          href={`/teach/courses/${courseId}/forms/${row.template.id}`}
        >
          {row.template.title}
        </Link>
        <MetaList
          items={[
            row.template.purpose,
            `${row.questionCount} question${row.questionCount === 1 ? "" : "s"}`,
            row.template.archived ? "Archived" : null,
          ]}
        />
      </th>
      <td>{audience}</td>
      <td>{delivery}</td>
      <td>
        {row.openInstance ? (
          <CycleStateBadge state="open" />
        ) : row.nextInstance ? (
          <CycleStateBadge state={row.nextInstance.state} />
        ) : row.instanceCount > 0 ? (
          <CycleStateBadge state="closed" />
        ) : (
          <Stamp tone="neutral">Not sent yet</Stamp>
        )}
        {row.openInstance && (
          <MetaList
            items={[
              `Closes ${formatDateTime(
                row.openInstance.deadlineAt,
                row.audienceSections[0]?.timezone ?? "Asia/Manila",
              )}`,
            ]}
          />
        )}
      </td>
      <td>
        {/* Aggregated across the whole form when it targets several sections —
            that is the point of sharing one form — and only over the sections
            this account may see. */}
        {row.responseCount}
        {row.needsReviewCount > 0 && ` (${row.needsReviewCount} to answer)`}
      </td>
      <td>
        <span className="row">
          {row.responseCount > 0 && (
            <Link
              className="button button--secondary button--small"
              href={`/teach/courses/${courseId}/responses?form=${row.template.id}`}
            >
              Review responses
            </Link>
          )}
          <Link
            className="button button--secondary button--small"
            href={`/teach/courses/${courseId}/forms/${row.template.id}`}
          >
            {row.responseCount > 0 ? "View form" : "Set up"}
          </Link>
        </span>
      </td>
    </tr>
  );
}

/**
 * The audience in words a teacher can check at a glance.
 *
 * "All sections" is only claimed when the schedule actually says so; a fixed list
 * is named, because "3 sections" hides which three. A section this account cannot
 * see is counted but never named.
 */
function describeAudience(row: CourseFormRow): string {
  if (!row.schedule) return "—";
  if (row.schedule.audienceMode === "all_sections") return "All sections";
  const named = row.audienceSections.map((s) => s.title);
  if (named.length === 0) {
    return row.audienceHasHiddenSections ? "Other sections" : "—";
  }
  const suffix = row.audienceHasHiddenSections ? " and others" : "";
  if (named.length <= 2) return named.join(" and ") + suffix;
  return `${named.slice(0, 2).join(", ")} and ${named.length - 2} more${suffix}`;
}
