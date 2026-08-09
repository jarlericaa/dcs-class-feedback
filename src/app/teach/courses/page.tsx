import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";

import { AppShell } from "@/components/layout/app-shell";
import { primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  Alert,
  EmptyState,
  MetaList,
  Stamp,
} from "@/components/ui";
import { IconForward, IconPlus } from "@/components/ui/icons";
import { termParts } from "@/lib/term";
import {
  CatalogError,
  createCourse,
  listCoursesForUser,
} from "@/modules/catalog";
import { listCourseForms } from "@/modules/forms/instances";
import { AuthzError } from "@/modules/authz";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * The list of courses a teacher works in.
 *
 * The COURSE CODE is the identity: `CS 33` is what a teacher and a student both
 * call this thing, so it is the heading. The title is secondary metadata, and the
 * academic year/semester is quiet context that keeps two offerings of the same
 * code apart.
 *
 * Sections are deliberately absent from this list. They decide who can reach a
 * form, not what a teacher comes here to do, so they live one destination inside
 * the course. What each row shows instead is the course's forms and whether any
 * of them needs attention.
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
        navGroups={await primaryNavFor(user, "/teach/courses")}
        title="My courses"
      >
        <AccessDenied what="course management" />
      </AppShell>
    );
  }

  const courses = await listCoursesForUser(user.id);
  const withForms = await Promise.all(
    courses.map(async (entry) => ({
      ...entry,
      forms: await listCourseForms(user.id, entry.course.id).catch(() => []),
    })),
  );
  // Opened by the header action, or by a failed create. Kept in the URL so the
  // state survives the redirect.
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

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, "/teach/courses")}
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
                  placeholder="CS 33"
                  required
                  autoFocus
                  aria-describedby="course-code-help"
                />
                <span className="helper-text" id="course-code-help">
                  How you and your students refer to it. This is the name shown
                  everywhere.
                </span>
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

        {withForms.length === 0 ? (
          <EmptyState
            title="No courses yet"
            action={{ href: "/teach/courses?new=1", label: "New course" }}
            primary
          >
            A course owns its forms, its class lists and its question backlog.
          </EmptyState>
        ) : (
          withForms.map(({ course, isOwner, sections, forms }) => {
            const openForms = forms.filter((f) => f.openInstance);
            const needsReview = forms.reduce(
              (sum, f) => sum + f.needsReviewCount,
              0,
            );
            const terms = [...new Set(sections.map((s) => s.term))];
            return (
              <Link
                className="notice section-notice"
                key={course.id}
                href={`/teach/courses/${course.id}`}
              >
                <div className="notice__body">
                  <div className="spread">
                    <div style={{ minWidth: 0 }}>
                      {/* The code IS the heading. The title reads underneath it
                          as what the code stands for, which is the order a
                          teacher actually needs. */}
                      <h2 className="panel-title">{course.code}</h2>
                      <MetaList
                        items={[
                          course.title,
                          ...(terms.length === 1
                            ? termParts(terms[0]!)
                            : terms.length > 1
                              ? [`${terms.length} terms`]
                              : []),
                        ]}
                      />
                    </div>
                    <div className="row">
                      {course.archivedAt && (
                        <Stamp tone="neutral">Archived</Stamp>
                      )}
                      {!isOwner && <Stamp tone="neutral">Course staff</Stamp>}
                    </div>
                  </div>
                  <div className="section-notice__foot">
                    {/* Forms and attention first — the two facts that decide
                        whether this course needs the teacher today. */}
                    <MetaList
                      items={[
                        forms.length === 0
                          ? "No forms yet"
                          : `${forms.length} form${forms.length === 1 ? "" : "s"}`,
                        openForms.length > 0
                          ? `${openForms.length} open now`
                          : null,
                        needsReview > 0
                          ? `${needsReview} response${needsReview === 1 ? "" : "s"} to answer`
                          : null,
                        sections.length === 0
                          ? "No class lists yet"
                          : `${sections.length} section${sections.length === 1 ? "" : "s"}`,
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
          })
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
