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
import { TagList } from "@/components/ui/tag";
import { IconForward } from "@/components/ui/icons";
import {
  academicYearOptions,
  courseTermParts,
  currentTerm,
  encodeTerm,
  parseTerm,
  type Semester,
} from "@/lib/term";
import {
  CatalogError,
  createCourse,
  listCoursesForUser,
} from "@/modules/catalog";
import { listCourseForms } from "@/modules/forms/instances";
import { AuthzError } from "@/modules/authz";
import { requireUser, toShellUser } from "@/lib/session";
import { CreateCourseDialog } from "@/components/staff/create-course-dialog";

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
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await requireUser();
  const { error, ok } = await searchParams;

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
  /*
    The term the dialog opens on. Computed here rather than in the dialog
    because a client component reading `new Date()` renders one term on the
    server and possibly another in the browser — a hydration mismatch that
    would show up only at a semester boundary, which is the worst possible time
    to discover it.
  */
  const openingTerm = parseTerm(currentTerm())!;

  async function addCourse(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    /*
      The FORM requires a term; the service accepts a course without one
      (courses predating `courses.term` have none). So the encoding — and the
      refusal of a term this page composed wrongly — belongs here, where the
      form contract lives.
    */
    const startYear = Number(formData.get("startYear"));
    const semester = String(formData.get("semester") ?? "") as Semester;
    const term = encodeTerm(startYear, semester);
    if (!parseTerm(term)) {
      redirect(
        `/teach/courses?error=${encodeURIComponent("Choose an academic year and semester.")}`,
      );
    }
    try {
      await createCourse(uid, {
        code: String(formData.get("code") ?? ""),
        // Optional, per `modal.md`: an empty title still creates the course.
        title: String(formData.get("title") ?? ""),
        term,
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
        <CreateCourseDialog
          action={addCourse}
          defaultSemester={openingTerm.semester}
          defaultStartYear={openingTerm.startYear}
          yearOptions={academicYearOptions()}
        />
      }
    >
      <div className="stack-4">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        {withForms.length === 0 ? (
          /*
            No action on the empty state any more, deliberately. It used to link
            to `?new=1`, and with the form now in a dialog there is no URL to
            link to — the only way to open it is the header button, which is on
            screen and three inches above this text. A second control that
            scrolls you to the first is worse than naming it.
          */
          <EmptyState title="No courses yet">
            A course owns its forms, its class lists and its question backlog.
            Use <strong>New course</strong>, above, to add your first one.
          </EmptyState>
        ) : (
          withForms.map(({ course, isOwner, sections, forms }) => {
            const openForms = forms.filter((f) => f.openInstance);
            const needsReview = forms.reduce(
              (sum, f) => sum + f.needsReviewCount,
              0,
            );
            /*
              The course's own term first, its sections' only as a fallback
              (`courseTermParts`). A course created before `courses.term` still
              reads exactly as it did; one created since reads its term even
              with no class lists yet, which is the state it spends its first
              five minutes in.
            */
            const termFacts = courseTermParts(
              course.term,
              sections.map((s) => s.term),
            );
            return (
              <Link
                className="notice section-notice"
                key={course.id}
                href={`/teach/courses/${course.id}`}
              >
                <div className="notice__body">
                  <div className="spread">
                    <div className="min-w-0">
                      {/* The code IS the heading. The title reads underneath it
                          as what the code stands for, which is the order a
                          teacher actually needs. */}
                      <h2 className="panel-title">{course.code}</h2>
                      <MetaList items={termFacts} />
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
                        whether this course needs the teacher today. Tags, not a
                        dot-separated sentence: every item here is a count, and
                        a reader scanning a column of courses is comparing them
                        rather than reading them. */}
                    <TagList
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
