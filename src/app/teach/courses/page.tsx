import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";

import { AppShell } from "@/components/layout/app-shell";
import { homeNav } from "@/components/layout/nav";
import {
  AccessDenied,
  Alert,
  Stamp,
  EmptyState,
  MetaList,
} from "@/components/ui";
import { TermFields } from "@/components/ui/term-fields";
import { IconPlus } from "@/components/ui/icons";
import { termParts } from "@/lib/term";
import {
  CatalogError,
  createCourse,
  createSection,
  listCoursesForUser,
} from "@/modules/catalog";
import { AuthzError } from "@/modules/authz";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * Course and section setup. Creating a course requires the teacher capability
 * (Open D3); creating a section requires staff on that course. Both checks are
 * enforced in modules/catalog, not here.
 *
 * Both create forms are disclosures rather than standing panels. "New course"
 * lives in the page header and opens the top one through the URL (`?new=1`), so
 * the page's own reason to exist is never below a list of courses; "Add a
 * section" is one collapsed row of the course it belongs to.
 */
export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; new?: string }>;
}) {
  const user = await requireUser();
  const { error, ok, new: newCourse } = await searchParams;

  if (!user.isTeacher) {
    return (
      <AppShell
        user={toShellUser(user)}
        workspace="home"
        navGroups={homeNav("/teach/courses", {
          isTeacher: false,
          isPlatformAdmin: user.isPlatformAdmin,
        })}
        title="My courses"
      >
        <AccessDenied what="course management" />
      </AppShell>
    );
  }

  const courses = await listCoursesForUser(user.id);
  // Opened by the header action, or by the reader clicking the summary. Kept in
  // the URL so the state survives the redirect a failed create performs.
  const createOpen = newCourse === "1" || !!error;

  async function addCourse(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await createCourse(uid, {
        code: String(formData.get("code") ?? ""),
        title: String(formData.get("title") ?? ""),
      });
    } catch (err) {
      redirect(`/teach/courses?error=${encodeURIComponent(describe(err))}`);
    }
    revalidatePath("/teach/courses");
    redirect(`/teach/courses?ok=${encodeURIComponent("Course created.")}`);
  }

  async function addSection(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await createSection(uid, {
        courseId: String(formData.get("courseId") ?? ""),
        term: String(formData.get("term") ?? ""),
        title: String(formData.get("title") ?? ""),
      });
    } catch (err) {
      redirect(`/teach/courses?error=${encodeURIComponent(describe(err))}`);
    }
    revalidatePath("/teach/courses");
    redirect(
      `/teach/courses?ok=${encodeURIComponent("Section created. Set its schedule next.")}`,
    );
  }

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={homeNav("/teach/courses", {
        isTeacher: true,
        isPlatformAdmin: user.isPlatformAdmin,
      })}
      title="My courses"
      actions={
        <Link className="button button--primary" href="/teach/courses?new=1">
          <IconPlus size={15} />
          New course
        </Link>
      }
    >
      <div className="stack-4">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        {/* Opened by the header action, which is this form's only entry point —
            a standing "New course" summary directly under a "New course" button
            says the same thing twice. It is a URL, so it works without
            JavaScript. */}
        {createOpen && (
          <section className="notice notice--pad" id="new-course">
            <h2 className="panel-title">New course</h2>
            <form action={addCourse} className="form-grid">
              <div className="field-row">
                <label htmlFor="course-code">Course code</label>
                <input
                  id="course-code"
                  className="field"
                  name="code"
                  placeholder="DCS-101"
                  required
                  autoFocus
                />
              </div>
              <div className="field-row">
                <label htmlFor="course-title">Course title</label>
                <input
                  id="course-title"
                  className="field"
                  name="title"
                  placeholder="Introduction to Computing"
                  required
                />
              </div>
              <div className="row">
                <button className="button button--primary" type="submit">
                  Create course
                </button>
                <Link className="button button--quiet" href="/teach/courses">
                  Cancel
                </Link>
              </div>
            </form>
          </section>
        )}

        {courses.length === 0 ? (
          <EmptyState
            title="No courses yet"
            action={{ href: "/teach/courses?new=1", label: "New course" }}
            primary
          >
            A course owns its templates, its question backlog and its class
            sections.
          </EmptyState>
        ) : (
          courses.map(({ course, isOwner, sections }) => (
            <section className="notice" key={course.id}>
              <div className="notice__head">
                <div>
                  <h2>{course.title}</h2>
                  <p>{course.code}</p>
                </div>
                <div className="row">
                  {/* Only the exceptional standing is stamped: a stamp on every
                      row of a list you mostly own signals nothing. */}
                  {!isOwner && <Stamp tone="neutral">Course staff</Stamp>}
                  <Link
                    className="button button--secondary button--small"
                    href={`/teach/courses/${course.id}/templates`}
                  >
                    Form templates
                  </Link>
                </div>
              </div>

              {sections.length > 0 ? (
                <ul className="data-list">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <span className="data-list__main">
                        <strong>{section.title}</strong>
                        {/* The term reads as words, and the timezone is gone —
                            nobody scans a course list for it, and glued to the
                            term with a dot it made the row's only metadata
                            line unreadable. It lives in section setup. */}
                        <MetaList
                          items={[
                            ...termParts(section.term),
                            !section.active && "Inactive",
                          ]}
                        />
                      </span>
                      <span className="row">
                        <Link
                          className="button button--secondary button--small"
                          href={`/teach/sections/${section.id}/review`}
                        >
                          Review inbox
                        </Link>
                        {/* A real destination, so it looks like one. It was a
                            quiet text link beside a bordered sibling. */}
                        <Link
                          className="button button--secondary button--small"
                          href={`/teach/sections/${section.id}/setup`}
                        >
                          Section setup
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="notice__body">
                  <p className="muted small">
                    No class sections yet. A section is what students join and
                    what the weekly form belongs to.
                  </p>
                </div>
              )}

              <details className="disclose disclose--inset">
                <summary>
                  <IconPlus size={15} />
                  Add a section
                </summary>
                <div className="disclose__body">
                  <form action={addSection} className="stack-4">
                    <input type="hidden" name="courseId" value={course.id} />
                    <div className="field-row">
                      <label htmlFor={`sectitle-${course.id}`}>
                        Section name
                      </label>
                      <input
                        id={`sectitle-${course.id}`}
                        className="field"
                        name="title"
                        placeholder={`${course.code} Section A`}
                        required
                      />
                    </div>
                    <TermFields />
                    <div>
                      <button className="button button--primary" type="submit">
                        Add section
                      </button>
                    </div>
                  </form>
                </div>
              </details>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}

function describe(err: unknown): string {
  if (err instanceof CatalogError || err instanceof AuthzError)
    return err.message;
  if (err instanceof Error && err.name === "ZodError") {
    return "Check the values you entered and try again.";
  }
  throw err;
}
