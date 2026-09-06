import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  Alert,
  ArchivedNotice,
  EmptyState,
  MetaList,
  Pagination,
  Stamp,
} from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { requireUser, toShellUser } from "@/lib/session";
import { AuthzError, SECTION_PERMISSIONS } from "@/modules/authz";
import {
  CatalogError,
  listCourseAccess,
  removeCourseStaff,
  type CourseAccessRow,
  type SectionGrantRow,
} from "@/modules/catalog";

/** The domain's role names, in the product's sentence case. */
const SECTION_ROLE_LABELS: Record<string, string> = {
  teacher: "Teacher",
  co_teacher: "Co-teacher",
  ta: "Student assistant",
};

/**
 * Who has access to this course, and to which sections — the single view.
 *
 * The model underneath has two tiers and only one of them was ever visible.
 * Course standing (the owner, or a `course_staff` row) is full instructor
 * capability on EVERY section of the course, including sections created later;
 * a `section_staff` row is standing on exactly one section. A lab instructor
 * who staffs three of eight sections is three rows here, and until this page
 * existed the only way to see that was to open eight section-setup pages.
 *
 * The one write it offers is revoking course-wide standing, and only to the
 * course owner (ADR-0004) — because this is the only view where such a row is
 * visible at all, so it is the only place the mistake of granting one can be
 * undone. Section grants are still changed on their own section's setup page,
 * and adding people is not here yet. Every service re-checks the owner
 * regardless of what this page renders.
 */
export default async function CourseTeachingTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const { page, pageSize, ok, error } = await searchParams;
  const path = `/teach/courses/${courseId}/staff`;

  let access: Awaited<ReturnType<typeof listCourseAccess>>;
  try {
    access = await listCourseAccess(user.id, courseId, { page, pageSize });
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={await primaryNavFor(user, path)}
          title="Teaching team"
        >
          <AccessDenied what="this course's teaching team" />
        </AppShell>
      );
    }
    throw err;
  }
  const { course, team, isOwner } = access;
  // The control below is rendered for the owner only, and `removeCourseStaff`
  // refuses everyone else anyway: this decides what is OFFERED, never what is
  // allowed. An archived course is read-only, so it is offered nothing.
  const canRevoke = isOwner && !course.archivedAt;

  // NB: a "use server" closure serializes everything it captures, so this may
  // only close over plain values such as courseId.
  async function dropCourseStanding(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await removeCourseStaff(
        uid,
        courseId,
        String(formData.get("courseStaffId") ?? ""),
      );
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/staff`);
    redirect(
      backTo(
        courseId,
        "Course-wide access removed. Any section they were added to individually is unchanged.",
      ),
    );
  }

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, path)}
      tabGroups={await courseTabGroupsFor(user.id, courseId, path)}
      tabsLabel={course.code}
      contextLabel={course.code}
      title="Teaching team"
      description={
        <MetaList
          items={[
            course.title,
            team.total === 1 ? "1 person" : `${team.total} people`,
          ]}
        />
      }
    >
      <div className="stack-4">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        {course.archivedAt && <ArchivedNotice courseCode={course.code} />}

        {team.total === 0 ? (
          <EmptyState title="Nobody staffs this course yet">
            Staff are added to a class list on its own setup page, by the person
            who owns the course.
          </EmptyState>
        ) : (
          <>
            <section className="notice">
              <div className="table-scroll table-scroll--flush">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Person</th>
                      <th scope="col">Can reach</th>
                      <th scope="col">Role</th>
                      <th scope="col">Permissions</th>
                      {canRevoke && (
                        <th scope="col">
                          <span className="visually-hidden">Actions</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {team.rows.map((row) => (
                      <AccessRow
                        key={rowKey(row)}
                        row={row}
                        canRevoke={canRevoke}
                        onRevoke={dropCourseStanding}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <Pagination
              page={team.page}
              totalPages={team.totalPages}
              total={team.total}
              basePath={path}
              params={{ pageSize }}
              label="people"
            />
          </>
        )}
      </div>
    </AppShell>
  );
}

/**
 * One person's standing.
 *
 * Every row states its own scope rather than sitting under a group heading,
 * because a heading printed once cannot survive a page boundary — page 2 of a
 * grouped table would open on rows whose scope had been explained on page 1.
 */
function AccessRow({
  row,
  canRevoke,
  onRevoke,
}: {
  row: CourseAccessRow;
  canRevoke: boolean;
  onRevoke: (formData: FormData) => Promise<void>;
}) {
  return (
    <tr>
      <th scope="row">
        {row.user.displayName}
        <MetaList items={[row.user.email]} />
      </th>
      <td>
        {row.scope === "course" ? (
          <>
            <Stamp tone="neutral">Every section</Stamp>
            <MetaList items={["Including sections added later"]} />
          </>
        ) : (
          row.section.title
        )}
      </td>
      <td>
        {row.scope === "course"
          ? row.isOwner
            ? "Course owner"
            : "Course instructor"
          : (SECTION_ROLE_LABELS[row.staff.role] ??
            row.staff.role.replace("_", " "))}
      </td>
      <td>{describePermissions(row)}</td>
      {canRevoke && (
        <td>
          {/* Only a course-standing row that IS a row can be revoked. The
              owner's standing comes from `courses.owner_user_id` and carries no
              `courseStaffId`, so there is nothing here to remove — and a
              section grant is changed on its own section's setup page, where its
              permissions are. */}
          {row.scope === "course" && row.courseStaffId ? (
            <Dialog
              variant="danger"
              className="button--small"
              label="Remove"
              title={`Remove ${row.user.displayName} from this course?`}
              description="They lose access to every section of this course. Sections they were added to individually keep them, and nothing they already did is deleted."
            >
              <form action={onRevoke}>
                <input
                  type="hidden"
                  name="courseStaffId"
                  value={row.courseStaffId}
                />
                <div className="row">
                  <button className="button button--danger" type="submit">
                    Remove course-wide access
                  </button>
                </div>
              </form>
            </Dialog>
          ) : null}
        </td>
      )}
    </tr>
  );
}

/**
 * A teacher, co-teacher or course instructor holds every capability by role, so
 * counting flags for them would print a number that decides nothing. Only a
 * student assistant has a permission set worth counting.
 */
function describePermissions(row: CourseAccessRow): string {
  if (row.scope === "course" || row.staff.role !== "ta") {
    return "Every permission";
  }
  return `${countGranted(row)} of ${SECTION_PERMISSIONS.length}`;
}

function countGranted(row: SectionGrantRow): number {
  return SECTION_PERMISSIONS.filter((permission) => row.staff[permission])
    .length;
}

/** Stable across pages: a person can hold several rows, so the row identifies itself. */
function rowKey(row: CourseAccessRow): string {
  return row.scope === "course"
    ? `course-${row.user.id}`
    : `section-${row.staff.id}`;
}

/**
 * Module scope on purpose: a server action serializes everything it closes
 * over, so it may not capture a helper defined inside the page component.
 */
function backTo(
  courseId: string,
  message: string,
  kind: "ok" | "error" = "ok",
): string {
  return `/teach/courses/${courseId}/staff?${kind}=${encodeURIComponent(message)}`;
}

function describe(err: unknown): string {
  if (err instanceof CatalogError || err instanceof AuthzError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  throw err;
}
