import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classSections, courses } from "@/db/schema";

import { AppShell } from "@/components/layout/app-shell";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  Alert,
  ArchivedNotice,
  CycleStateBadge,
  EmptyState,
  MetaList,
  Stamp,
} from "@/components/ui";
import { IconForm, IconForward, IconPlus } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/datetime";
import { courseSubtitle } from "@/components/staff/course-heading";
import { AuthzError } from "@/modules/authz";
import { listCourseForms, type CourseFormRow } from "@/modules/forms/instances";
import { DELIVERY_LABELS } from "@/modules/forms/schedules";
import { requireUser, toShellUser } from "@/lib/session";
import { buttonClass } from "@/components/ui/button";

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
  const path = `/teach/courses/${courseId}`;

  let forms: CourseFormRow[];
  try {
    forms = await listCourseForms(user.id, courseId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
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
        workspace="staff"
        navGroups={await primaryNavFor(user, path)}
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
      navGroups={await primaryNavFor(user, path)}
      tabGroups={await courseTabGroupsFor(user.id, courseId, path, {
        needsReview,
      })}
      tabsLabel={course.code}
      contextLabel={course.code}
      /* The code is the title. The academic year and semester sit under it as
         quiet context so two offerings of CS 33 are never confused; the course
         title is metadata, not the heading. */
      title={course.code}
      /* Built by `courseSubtitle` so every view of this course leads with the
         same header — see that file for why the tab pages stopped setting their
         own headings. */
      description={courseSubtitle({ title: course.title, terms })}
      crumbs={[
        { href: "/teach/courses", label: "My courses" },
        { href: `/teach/courses/${courseId}`, label: course.code },
      ]}
      actions={
        <Link
          className={buttonClass({ variant: "primary" })}
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
          /*
            The forms table, rebuilt to `form-table.md` — "more like a modern
            teacher dashboard and less like a dense database table".

            Written in utilities rather than on `.data-table`, because the spec
            scopes the redesign to THIS table and `.data-table` dresses seven
            others. Restyling the shared class would have redesigned all of
            them.
          */
          <section className="overflow-hidden rounded-panel border border-rule bg-paper">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule bg-paper-quiet">
                    {["Form", "Delivery", "Status", "Responses"].map((h) => (
                      <th
                        className="px-4 py-3 text-meta font-semibold text-ink-muted"
                        key={h}
                        scope="col"
                      >
                        {h}
                      </th>
                    ))}
                    <th className="px-4 py-3" scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {forms.map((row) => (
                    <FormRow
                      key={row.template.id}
                      row={row}
                      courseId={courseId}
                    />
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
 * One form, as a row a teacher can act on (`form-table.md`).
 *
 * The spec's §12 is the test: the row has to answer six questions at a glance —
 * what the form is, which class it goes to, how it is delivered, whether it is
 * open, whether anything needs attention, and what to do next. Each of those is
 * its own cell, because welding them into a sentence makes none of them
 * scannable.
 *
 * What changed from the previous version:
 *
 *   - **"Goes to" is gone as a column** (§1). The audience is a property of the
 *     form, not a peer of its status, so it sits under the name with the
 *     question count — and the name gets the width the column was using.
 *   - **The name is the anchor** (§2): a document mark, then the title in the
 *     accent at semibold. It was a plain link in a row of plain text.
 *   - **Responses say what they mean** (§4). `2 (2 to answer)` became
 *     "2 responses" over "2 need a reply" — the second line in muted gold when
 *     something is waiting, in green when nothing is, and quiet when there is
 *     nothing yet. A parenthetical is not an attention state.
 *   - **The action is the recommendation** (§6). Review is the primary button
 *     only when a reply is actually waiting; otherwise reading is the offer.
 *     A row where nothing needs doing should not push a green button at you.
 */
function FormRow({ row, courseId }: { row: CourseFormRow; courseId: string }) {
  const audience = describeAudience(row);
  const delivery = row.schedule
    ? DELIVERY_LABELS[row.schedule.deliveryMode]
    : "Not scheduled";
  const formHref = `/teach/courses/${courseId}/forms/${row.template.id}`;
  const responsesHref = `/teach/courses/${courseId}/responses?form=${row.template.id}`;
  const needsReply = row.needsReviewCount > 0;
  const timezone = row.audienceSections[0]?.timezone ?? "Asia/Manila";

  return (
    <tr className="border-b border-rule last:border-b-0 align-top">
      <th className="px-4 py-4 font-normal" scope="row">
        <div className="flex items-start gap-3">
          {/* A mark, not decoration: it gives the name a consistent left edge
              to start from, so a column of titles aligns whatever their
              length. */}
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-control bg-accent-wash text-accent-deep"
          >
            <IconForm size={18} />
          </span>
          <span className="grid min-w-0 gap-0.5">
            <Link
              className="font-semibold text-accent-deep underline decoration-1 underline-offset-2 hover:decoration-2"
              href={formHref}
            >
              {row.template.title}
            </Link>
            <MetaList
              items={[
                `${row.questionCount} question${row.questionCount === 1 ? "" : "s"}`,
                audience,
                row.template.purpose,
                row.template.archived ? "Archived" : null,
              ]}
            />
          </span>
        </div>
      </th>

      <td className="px-4 py-4 text-ui-sm whitespace-nowrap">{delivery}</td>

      <td className="px-4 py-4">
        {/* `justify-items-start` is load-bearing: a grid item stretches to its
            column by default, so the badge filled the whole cell and stopped
            reading as a compact status (§5 asks for "compact status badges"). */}
        <div className="grid justify-items-start gap-1">
          {row.openInstance ? (
            <CycleStateBadge state="open" />
          ) : row.nextInstance ? (
            <CycleStateBadge state={row.nextInstance.state} />
          ) : row.instanceCount > 0 ? (
            <CycleStateBadge state="closed" />
          ) : (
            <Stamp tone="neutral">Not sent yet</Stamp>
          )}
          {/* §5: the supporting fact under the badge, not inside it — a badge
              that grew a date would stop being scannable as a state. */}
          {row.openInstance ? (
            <span className="text-meta text-ink-muted">
              Closes {formatDateTime(row.openInstance.deadlineAt, timezone)}
            </span>
          ) : row.nextInstance?.openAt ? (
            <span className="text-meta text-ink-muted">
              Opens {formatDateTime(row.nextInstance.openAt, timezone)}
            </span>
          ) : null}
        </div>
      </td>

      <td className="px-4 py-4">
        {/* Aggregated across the whole form when it targets several sections —
            that is the point of sharing one form — and only over the sections
            this account may see. */}
        <div className="grid gap-0.5">
          <span className="text-ui-sm font-semibold tabular-nums">
            {row.responseCount} response{row.responseCount === 1 ? "" : "s"}
          </span>
          {needsReply ? (
            <span className="text-meta font-semibold text-amber-deep">
              {row.needsReviewCount} need{row.needsReviewCount === 1 ? "s" : ""}{" "}
              a reply
            </span>
          ) : row.responseCount > 0 ? (
            <span className="text-meta text-accent-deep">All reviewed</span>
          ) : (
            <span className="text-meta text-ink-muted">No responses yet</span>
          )}
        </div>
      </td>

      <td className="px-4 py-4">
        <div className="flex flex-col items-start gap-1">
          {needsReply ? (
            <Link
              className={buttonClass({ variant: "primary", size: "small" })}
              href={responsesHref}
            >
              Review responses
              <IconForward size={14} aria-hidden="true" />
            </Link>
          ) : row.responseCount > 0 ? (
            <Link
              className={buttonClass({ variant: "secondary", size: "small" })}
              href={responsesHref}
            >
              View responses
            </Link>
          ) : (
            <Link
              className={buttonClass({ variant: "secondary", size: "small" })}
              href={formHref}
            >
              View form
            </Link>
          )}
          {/* Reading the form is navigation, so it reads as a link. Only
              offered as a second line when the button above is not already
              pointing at it. */}
          {row.responseCount > 0 && (
            <Link
              className="text-meta text-ink-soft underline decoration-1 underline-offset-2 hover:text-ink"
              href={formHref}
            >
              View form
            </Link>
          )}
        </div>
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
