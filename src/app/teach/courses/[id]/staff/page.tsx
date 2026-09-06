import { AppShell } from "@/components/layout/app-shell";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  ArchivedNotice,
  EmptyState,
  MetaList,
  Pagination,
  Stamp,
} from "@/components/ui";
import { requireUser, toShellUser } from "@/lib/session";
import { AuthzError, SECTION_PERMISSIONS } from "@/modules/authz";
import {
  listCourseAccess,
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
 * Read-only in this milestone: nothing on it grants, changes or revokes
 * anything. Assignment stays where ADR-0003 put it — the course owner, on the
 * section setup page — and the services refuse it for anyone else regardless of
 * what any page renders.
 */
export default async function CourseTeachingTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const { page, pageSize } = await searchParams;
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
  const { course, team } = access;

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
                    </tr>
                  </thead>
                  <tbody>
                    {team.rows.map((row) => (
                      <AccessRow key={rowKey(row)} row={row} />
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
function AccessRow({ row }: { row: CourseAccessRow }) {
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
