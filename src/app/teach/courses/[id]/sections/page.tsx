import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { classSections, courses, enrollments } from "@/db/schema";

import { AppShell } from "@/components/layout/app-shell";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  Alert,
  ArchivedNotice,
  EmptyState,
  MetaList,
  Stamp,
} from "@/components/ui";
import { IconPlus } from "@/components/ui/icons";
import { TermFields } from "@/components/ui/term-fields";
import { termParts } from "@/lib/term";
import { AuthzError, requireCourseStaff } from "@/modules/authz";
import { CatalogError, createSection } from "@/modules/catalog";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * Class lists and access for one course.
 *
 * This is where sections belong: they decide who can reach a form, who counts for
 * participation, and who may publish into which archive. None of that is the
 * form workflow, which is why it is one destination inside the course rather
 * than the shape of every screen.
 */
export default async function CourseSectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; new?: string }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const { ok, error, new: newSection } = await searchParams;
  const path = `/teach/courses/${courseId}/sections`;

  try {
    await requireCourseStaff(db, user.id, courseId, { allowArchived: true });
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={await primaryNavFor(user, path)}
          title="Class lists"
        >
          <AccessDenied what="this course's class lists" />
        </AppShell>
      );
    }
    throw err;
  }

  const course = (await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  }))!;
  const sections = await db.query.classSections.findMany({
    where: eq(classSections.courseId, courseId),
    orderBy: (t, { asc }) => [asc(t.title)],
  });
  const counts = new Map<string, number>();
  if (sections.length > 0) {
    const rows = await db.query.enrollments.findMany({
      where: and(
        inArray(
          enrollments.sectionId,
          sections.map((s) => s.id),
        ),
        eq(enrollments.status, "active"),
      ),
      columns: { sectionId: true },
    });
    for (const row of rows) {
      counts.set(row.sectionId, (counts.get(row.sectionId) ?? 0) + 1);
    }
  }
  const createOpen = newSection === "1" || !!error;

  async function addSection(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await createSection(uid, {
        courseId,
        term: String(formData.get("term") ?? ""),
        title: String(formData.get("title") ?? ""),
      });
    } catch (err) {
      redirect(
        `/teach/courses/${courseId}/sections?error=${encodeURIComponent(describe(err))}`,
      );
    }
    revalidatePath(`/teach/courses/${courseId}/sections`);
    redirect(
      `/teach/courses/${courseId}/sections?ok=${encodeURIComponent(
        "Section added. Import its class list next.",
      )}`,
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
      title="Class lists"
      actions={
        <Link
          className="button button--primary"
          href={`/teach/courses/${courseId}/sections?new=1`}
        >
          <IconPlus size={15} />
          Add a section
        </Link>
      }
    >
      <div className="stack-4">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        {course.archivedAt && <ArchivedNotice courseCode={course.code} />}

        {createOpen && (
          <section className="notice notice--pad" id="new-section">
            <h2 className="panel-title">Add a section</h2>
            <form action={addSection} className="stack-4">
              <div className="field-row">
                <label htmlFor="section-title">Section name</label>
                <input
                  id="section-title"
                  className="field"
                  name="title"
                  placeholder={`${course.code} Section A`}
                  required
                  autoFocus
                />
              </div>
              <TermFields />
              <div className="row">
                <button className="button button--primary" type="submit">
                  Add section
                </button>
                <Link
                  className="button button--quiet"
                  href={`/teach/courses/${courseId}/sections`}
                >
                  Cancel
                </Link>
              </div>
            </form>
          </section>
        )}

        {sections.length === 0 ? (
          <EmptyState
            title="No sections yet"
            action={{
              href: `/teach/courses/${courseId}/sections?new=1`,
              label: "Add a section",
            }}
            primary
          >
            A section is the class list a student&rsquo;s UP email is looked up in. A
            form goes to one section, several, or all of them.
          </EmptyState>
        ) : (
          <div className="stack-3">
            {sections.map((section) => {
              const enrolled = counts.get(section.id) ?? 0;
              return (
                /* The card IDENTIFIES the section and enters it — nothing more.
                   It used to also print every destination the section leads to,
                   as a four-column grid of the same links the contextual column
                   was already listing an inch to its left: two copies of one
                   navigation, side by side. The destinations belong to the
                   section's own column, which is where they are now kept while
                   a reader is inside it. */
                <section className="notice" key={section.id}>
                  <div className="notice__head">
                    <div>
                      <h2>
                        {/* Straight to this section's class list, because that is
                            what the reader asked for: this page is what "Class
                            lists" opens, and the only reason it exists is that a
                            course holds many sections and none of them is "the"
                            class list. Landing on the section's first permitted
                            view instead — the review inbox, usually — would
                            answer a question nobody asked here. Every other
                            destination is one click away in the section's own
                            column once they are inside. */}
                        <Link
                          className="link"
                          href={`/teach/sections/${section.id}/roster`}
                        >
                          {section.title}
                        </Link>
                      </h2>
                      <MetaList
                        items={[
                          ...termParts(section.term),
                          enrolled === 0
                            ? "No class list imported"
                            : `${enrolled} enrolled`,
                          section.timezone,
                        ]}
                      />
                    </div>
                    {!section.active && <Stamp tone="neutral">Inactive</Stamp>}
                  </div>
                </section>
              );
            })}
          </div>
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
  if (err instanceof Error) return err.message;
  throw err;
}
