import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { classSections } from "@/db/schema";
import { AppShell } from "@/components/layout/app-shell";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  Alert,
  ArchivedNotice,
  EmptyState,
  MetaList,
  Pagination,
} from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import {
  AddStaffDialog,
  type AddStaffState,
} from "@/components/staff/add-staff-dialog";
import { requireUser, toShellUser } from "@/lib/session";
import {
  AuthzError,
  SECTION_PERMISSION_LABELS,
  SECTION_PERMISSIONS,
} from "@/modules/authz";
import {
  assignCourseStaff,
  assignSectionStaff,
  assignSectionStaffBatch,
  CatalogError,
  listCourseAccess,
  removeCourseStaff,
  removeSectionStaff,
  type CourseAccessRow,
} from "@/modules/catalog";
import { EditStaffPermissions } from "@/components/staff/staff-permissions";

/**
 * Two roles, and two names for them: Course handler and SA.
 *
 * `teacher` and `co_teacher` both read as Course handler because they have
 * never meant two sets of capabilities — roles-and-permissions.md is explicit
 * that every instructor assigned to a course holds equal permissions, so the
 * separate names described a distinction that did not exist. Owner is not a
 * third role either: it is a course handler whose standing happens to be
 * unrevokable, which the absent Remove button already says.
 *
 * The stored enum still carries the older values; only what the reader is told
 * collapses.
 */
const COURSE_HANDLER = "Course handler";

const SECTION_ROLE_LABELS: Record<string, string> = {
  teacher: COURSE_HANDLER,
  co_teacher: COURSE_HANDLER,
  ta: "SA",
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
 * The writes it offers are the owner's alone (ADR-0004): ADDING staff at either
 * scope, and revoking a course-wide row. Both live here because this is the only
 * view where the two tiers are visible together — granting course-wide standing
 * from inside one section's setup page reads as granting that section, which is
 * the misreading the whole tier already suffered from, and a grant that can be
 * made in a view that cannot show it is a grant nobody can find again.
 *
 * A section grant's PERMISSIONS are still edited on that section's own setup
 * page, beside the rest of what belongs to a section. Every service re-checks
 * the owner regardless of what this page renders.
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
  // The controls below are rendered for the owner only, and every service
  // refuses everyone else anyway: this decides what is OFFERED, never what is
  // allowed. An archived course is read-only, so it is offered nothing.
  const canManage = isOwner && !course.archivedAt;

  /**
   * The course's class lists, for the Add staff dialog's narrower scope.
   *
   * Read directly, as the course's own Class lists page does, because
   * `listCourseAccess` above has already authorized this reader on this course
   * and a section's title is strictly less than the table below it discloses.
   * The service re-resolves every id against the course before writing, so a
   * stale or tampered choice is refused there rather than trusted from here.
   *
   * DELIBERATELY UNPAGED, and it is not an exception to the "every list is
   * paginated" rule — it is not a list of results. It is the complete option set
   * of a multi-select control, and the completeness is the point: paging it
   * would hide sections the owner is trying to grant, so a grant made from page
   * 1 would silently mean something narrower than it looked. Every option must
   * therefore be present and selectable at once. It is bounded by the sections
   * of ONE course (a handful in practice, tens at the extreme), and the table
   * below it — which IS a result list — is paged normally.
   *
   * If a course ever grows enough sections that the checkbox list is unusable,
   * the fix is a search/filter INSIDE the control that still submits the full
   * selection, never a page cut that drops options from the form.
   */
  const sections = canManage
    ? await db.query.classSections.findMany({
        where: eq(classSections.courseId, courseId),
        orderBy: asc(classSections.title),
        columns: { id: true, title: true },
      })
    : [];

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

  /**
   * Add staff, at whichever scope was chosen.
   *
   * Two services, one form: they are genuinely different writes — a
   * `course_staff` row versus one `section_staff` row per class list — and the
   * dialog exists because the reader should not have to know which. Nothing is
   * decided here beyond which one to call; both re-check the owner, re-validate
   * every address, refuse the whole request atomically, and audit their own
   * writes.
   *
   * Returns state rather than redirecting, so a refusal can name the addresses
   * it refused with the paste still on screen.
   */
  async function addStaff(
    _previous: AddStaffState,
    formData: FormData,
  ): Promise<AddStaffState> {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const emails = String(formData.get("emails") ?? "");
    const role = String(formData.get("role") ?? "");
    const courseWide = String(formData.get("scope") ?? "course") === "course";
    try {
      if (courseWide) {
        const result = await assignCourseStaff(uid, courseId, {
          emails,
          // Re-checked inside the service against the roles course scope
          // allows; a student assistant is refused there, not here.
          role: role as "teacher" | "co_teacher",
        });
        if (!result.ok) return { status: "error", problems: result.problems };
        revalidatePath(`/teach/courses/${courseId}/staff`);
        return { status: "done", result: { ...result, sectionTitles: [] } };
      }
      const result = await assignSectionStaffBatch(uid, courseId, {
        emails,
        sectionIds: formData.getAll("sectionIds").map(String),
        role: role as "teacher" | "ta" | "co_teacher",
        // Only a ticked box grants anything, and only for a key in the
        // catalogue: the service ignores everything else regardless.
        permissions: Object.fromEntries(
          SECTION_PERMISSIONS.filter(
            (permission) => formData.get(`perm_${permission}`) === "on",
          ).map((permission) => [permission, true]),
        ),
      });
      if (!result.ok) return { status: "error", problems: result.problems };
      revalidatePath(`/teach/courses/${courseId}/staff`);
      return {
        status: "done",
        result: {
          added: result.added,
          updated: result.updated,
          unchanged: result.unchanged,
          sectionTitles: result.sections.map((section) => section.title),
        },
      };
    } catch (err) {
      return { status: "error", message: describe(err) };
    }
  }

  /**
   * Change one section grant — its role, its permission set, or both.
   *
   * This used to live on the section's own setup page, which is gone: it was a
   * second teaching-team table over the same `section_staff` rows, reachable
   * only by first choosing a section, and the count it printed said less than
   * the list here does.
   *
   * The section id comes from the form rather than from a route, so it is the
   * one input worth being explicit about: `assignSectionStaff` resolves the
   * section and then calls `requireCourseOwner` against THAT section's course,
   * so a tampered id is refused rather than redirected at someone else's class
   * list. The permission map is written in full — every catalogue key, ticked
   * or not — because this is an edit, and an absent key must clear a
   * permission rather than silently keep it.
   */
  async function saveSectionStaff(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const role = String(formData.get("role") ?? "ta") as
      | "teacher"
      | "ta"
      | "co_teacher";
    try {
      await assignSectionStaff(uid, String(formData.get("sectionId") ?? ""), {
        email: String(formData.get("email") ?? ""),
        role,
        permissions: Object.fromEntries(
          SECTION_PERMISSIONS.map((permission) => [
            permission,
            formData.get(`perm_${permission}`) === "on",
          ]),
        ),
      });
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/staff`);
    redirect(backTo(courseId, "Teaching staff updated."));
  }

  /** Remove one section grant. Course-wide standing is revoked separately. */
  async function dropSectionStanding(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await removeSectionStaff(
        uid,
        String(formData.get("sectionId") ?? ""),
        String(formData.get("staffId") ?? ""),
      );
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/staff`);
    redirect(backTo(courseId, "Staff member removed from that class list."));
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
      actions={
        canManage ? (
          <AddStaffDialog
            action={addStaff}
            sections={sections}
            permissions={SECTION_PERMISSIONS}
            permissionLabels={SECTION_PERMISSION_LABELS}
          />
        ) : undefined
      }
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
            {canManage
              ? "Add staff to every section of this course, or to the class lists you choose."
              : "Only the person who owns this course can add staff to it."}
          </EmptyState>
        ) : (
          <>
            <section className="notice">
              <div className="table-scroll table-scroll--flush">
                <table className="data-table">
                  <thead>
                    {/* Person, role, and what you can do about it. "Can reach"
                        and "Permissions" are both gone: the scope column
                        repeated what the Remove dialog already names, and the
                        permission list restated what the editor one click away
                        shows in full. */}
                    <tr>
                      <th scope="col">Person</th>
                      <th scope="col">Role</th>
                      {canManage && (
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
                        canRevoke={canManage}
                        onRevoke={dropCourseStanding}
                        onSaveSection={saveSectionStaff}
                        onRemoveSection={dropSectionStanding}
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
  onSaveSection,
  onRemoveSection,
}: {
  row: CourseAccessRow;
  canRevoke: boolean;
  onRevoke: (formData: FormData) => Promise<void>;
  onSaveSection: (formData: FormData) => Promise<void>;
  onRemoveSection: (formData: FormData) => Promise<void>;
}) {
  return (
    <tr>
      <th scope="row">
        {row.user.displayName}
        <MetaList items={[row.user.email]} />
      </th>
      <td>
        {row.scope === "course"
          ? COURSE_HANDLER
          : (SECTION_ROLE_LABELS[row.staff.role] ??
            row.staff.role.replace("_", " "))}
      </td>
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
          ) : row.scope === "section" ? (
            /* A section grant is edited and revoked HERE, next to the row that
               states it. It used to be changed only on that section's own
               setup page, which meant the one table listing everybody was the
               one place you could not act on them. */
            <div className="row">
              <EditStaffPermissions
                action={onSaveSection}
                displayName={row.user.displayName}
                email={row.user.email}
                role={row.staff.role}
                sectionId={row.section.id}
                permissions={SECTION_PERMISSIONS.map((permission) => ({
                  key: permission,
                  granted: Boolean(row.staff[permission]),
                }))}
                permissionLabels={SECTION_PERMISSION_LABELS}
              />
              <Dialog
                variant="danger"
                className="button--small"
                label="Remove"
                title={`Remove ${row.user.displayName} from ${row.section.title}?`}
                description="They lose access to this class list only. Nothing they already did is deleted."
              >
                <form action={onRemoveSection}>
                  <input type="hidden" name="staffId" value={row.staff.id} />
                  <input
                    type="hidden"
                    name="sectionId"
                    value={row.section.id}
                  />
                  <div className="row">
                    <button className="button button--danger" type="submit">
                      Remove from this class list
                    </button>
                  </div>
                </form>
              </Dialog>
            </div>
          ) : null}
        </td>
      )}
    </tr>
  );
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
