import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";

import { AppShell } from "@/components/layout/app-shell";
import { homeNav } from "@/components/layout/nav";
import { AccessDenied, Alert, Badge, EmptyState } from "@/components/ui";
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
 */
export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await requireUser();
  const { error, ok } = await searchParams;

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
        <p
          className="muted small"
          style={{ marginTop: 12, textAlign: "center" }}
        >
          A platform administrator grants the teacher role.
        </p>
      </AppShell>
    );
  }

  const courses = await listCoursesForUser(user.id);

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
      eyebrow="Teaching"
      title="My courses"
      description="Courses own templates and the question backlog. Sections own students, schedules, cycles and the class Q&A archive."
    >
      <div className="stack-gap">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        {courses.length === 0 ? (
          <EmptyState title="You do not have any courses yet">
            Create your first course below, then add the class sections you
            teach this term.
          </EmptyState>
        ) : (
          courses.map(({ course, isOwner, sections }) => (
            <section className="card" key={course.id}>
              <div className="card__header">
                <div>
                  <p className="section-kicker">{course.code}</p>
                  <h2>{course.title}</h2>
                  <p>
                    {sections.length} section{sections.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="row-gap">
                  {isOwner ? (
                    <Badge tone="green">Owner</Badge>
                  ) : (
                    <Badge tone="neutral">Course staff</Badge>
                  )}
                  <Link
                    className="button button--secondary button--small"
                    href={`/teach/courses/${course.id}/templates`}
                  >
                    Templates
                  </Link>
                </div>
              </div>

              {sections.length > 0 && (
                <ul className="data-list">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <span className="data-list__main">
                        <strong>{section.title}</strong>
                        <small>
                          {section.term} · {section.timezone}
                          {!section.active && " · inactive"}
                        </small>
                      </span>
                      <span className="row-gap">
                        <Link
                          className="button button--secondary button--small"
                          href={`/teach/sections/${section.id}/review`}
                        >
                          Review inbox
                        </Link>
                        <Link
                          className="button button--quiet button--small"
                          href={`/teach/sections/${section.id}/setup`}
                        >
                          Setup
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="card__footer">
                <form action={addSection} className="form-grid">
                  <input type="hidden" name="courseId" value={course.id} />
                  <div className="field-row">
                    <label htmlFor={`term-${course.id}`}>Term</label>
                    <input
                      id={`term-${course.id}`}
                      className="field"
                      name="term"
                      placeholder="AY2026-1"
                      required
                    />
                  </div>
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
                  <div className="field-row" style={{ alignSelf: "end" }}>
                    <button className="button button--primary" type="submit">
                      Add section
                    </button>
                  </div>
                </form>
              </div>
            </section>
          ))
        )}

        <section className="card card--padded">
          <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>Create a course</h2>
          <p className="muted small" style={{ margin: "0 0 14px" }}>
            You become the course owner, which is the only role that can assign
            teaching staff and set their permissions.
          </p>
          <form action={addCourse} className="form-grid">
            <div className="field-row">
              <label htmlFor="course-code">Course code</label>
              <input
                id="course-code"
                className="field"
                name="code"
                placeholder="DCS-101"
                required
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
            <div className="field-row" style={{ alignSelf: "end" }}>
              <button className="button button--primary" type="submit">
                Create course
              </button>
            </div>
          </form>
        </section>
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
