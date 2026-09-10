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
import { fallbackTerm, termParts } from "@/lib/term";
import { AuthzError, requireCourseStaff } from "@/modules/authz";
import { CatalogError, createSection } from "@/modules/catalog";
import {
  commitRosterImport,
  parseRosterCsv,
  looksLikeXlsx,
} from "@/modules/roster-import";
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
  /**
   * Pulled out as a plain string because a "use server" closure serializes
   * everything it captures — the section rows themselves must not be dragged
   * into the action.
   */
  const inheritedTerm = fallbackTerm(sections.map((section) => section.term));

  /**
   * Create the class list, and fill it in the same submit when a file came
   * with the form.
   *
   * The two writes are deliberately NOT one transaction. `commitRosterImport`
   * runs its own, and wrapping the pair would mean a single refused row threw
   * away a section the teacher had correctly named — so the section is kept and
   * the import reports itself. That makes the order matter: create first, then
   * import into the section that now exists, and say plainly which of the two
   * happened if the second fails.
   *
   * CSV only. The registrar's `.xlsx` is detected purely so it can be refused
   * by name instead of being decoded as CSV and reported as a page of
   * unrelated malformed rows.
   */
  async function addSection(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const done = (params: Record<string, string>) =>
      redirect(
        `/teach/courses/${courseId}/sections?${new URLSearchParams(params).toString()}`,
      );

    let sectionId: string;
    try {
      const created = await createSection(uid, {
        courseId,
        term: inheritedTerm,
        title: String(formData.get("title") ?? ""),
      });
      sectionId = created.id;
    } catch (err) {
      done({ error: describe(err) });
      return;
    }

    const upload = formData.get("file");
    if (!(upload instanceof File) || upload.size === 0) {
      revalidatePath(`/teach/courses/${courseId}/sections`);
      done({ ok: "Section added." });
      return;
    }

    try {
      const bytes = Buffer.from(await upload.arrayBuffer());
      if (upload.name.toLowerCase().endsWith(".xlsx") || looksLikeXlsx(bytes)) {
        done({
          error:
            "Section added, but its class list was not imported: choose a .csv file.",
        });
        return;
      }
      const parsed = parseRosterCsv(new TextDecoder().decode(bytes));
      if (parsed.fileError) {
        done({ error: `Section added, but ${parsed.fileError}` });
        return;
      }
      const summary = await commitRosterImport(
        uid,
        sectionId,
        parsed,
        upload.name || "class list",
      );
      revalidatePath(`/teach/courses/${courseId}/sections`);
      /* `blocked` is named rather than folded into the total: a row refused
         for an unusable UP email is the one outcome a teacher has to act on,
         and a bare enrolled count would hide it. */
      done({
        ok:
          summary.blocked > 0
            ? `Section added with ${summary.enrolled} on its class list. ${summary.blocked} row(s) were refused — open the class list to see which.`
            : `Section added with ${summary.enrolled} on its class list.`,
      });
    } catch (err) {
      /* A `done()` above throws Next's redirect signal, which must not be
         reported here as an import failure. */
      if (
        err &&
        typeof err === "object" &&
        "digest" in err &&
        String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
      ) {
        throw err;
      }
      done({
        error: `Section added, but its class list was not imported: ${describe(err)}`,
      });
    }
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
            {/* Two fields, because two is what creating a class list needs:
                what it is called, and who is in it. The academic term is gone
                — it describes the course's offering, not one class list inside
                it, and it was being retyped per section. New sections inherit
                the term the course is already using. */}
            <form
              action={addSection}
              className="stack-4"
              encType="multipart/form-data"
            >
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
              <div className="field-row">
                <label htmlFor="section-roster">Class list</label>
                <input
                  id="section-roster"
                  className="field"
                  type="file"
                  name="file"
                  accept=".csv,text/csv"
                />
              </div>
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
                      {/* No timezone. There is one institution timezone for
                          the whole platform (INSTITUTION_TIMEZONE, decision
                          D7), so printing "Asia/Manila" on every card repeated
                          a constant — it looked like a per-section fact the
                          reader might need to check, and it is not one. It
                          still governs every open and close time; it is just
                          not news. */}
                      <MetaList
                        items={[
                          ...termParts(section.term),
                          enrolled === 0
                            ? "No class list imported"
                            : `${enrolled} enrolled`,
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
