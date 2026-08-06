import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { courses } from "@/db/schema";

import { AppShell } from "@/components/layout/app-shell";
import { courseNav } from "@/components/layout/nav";
import {
  AccessDenied,
  Alert,
  Breadcrumbs,
  EmptyState,
} from "@/components/ui";
import { DeliveryFields } from "@/components/staff/delivery-fields";
import { TemplateEditor } from "@/components/staff/template-editor";
import { AuthzError, requireCourseStaff } from "@/modules/authz";
import { AudienceError } from "@/modules/forms/audience";
import { createTemplate } from "@/modules/forms/templates";
import {
  configureDelivery,
  listAudienceOptions,
  ScheduleError,
} from "@/modules/forms/schedules";
import { InstanceError } from "@/modules/forms/instances";
import type { QuestionDefinition } from "@/modules/forms/questions";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * Create one form: what it is, who gets it, when it goes out, what it asks.
 *
 * One page rather than a wizard, because the four decisions are small and a
 * teacher wants to see them together before committing. The order still matters,
 * and the headings say so.
 *
 * Two things are created here, and the distinction is real: a reusable form
 * DEFINITION (title, purpose, questions, versioned) and a DELIVERY configuration
 * (audience + schedule) that generates the instances students answer. Editing one
 * future instance is a third thing, and lives on that instance's own page.
 */
export default async function NewFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const { error } = await searchParams;

  try {
    await requireCourseStaff(db, user.id, courseId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={[]}
          title="New form"
        >
          <AccessDenied what="this course's forms" />
        </AppShell>
      );
    }
    throw err;
  }

  const course = (await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  }))!;
  const sections = await listAudienceOptions(user.id, courseId);

  async function createForm(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");

    const fail = (message: string) =>
      redirect(
        `/teach/courses/${courseId}/forms/new?error=${encodeURIComponent(message)}`,
      );

    let templateId: string;
    try {
      const created = await createTemplate(uid, {
        courseId,
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? "") || undefined,
        purpose: String(formData.get("purpose") ?? "") || undefined,
        visibility: "course_shared",
        questions: parseQuestions(formData.get("questions")),
        studentSection: parseStudentSection(formData),
      });
      templateId = created.template.id;
    } catch (err) {
      fail(describe(err));
      return;
    }

    // The definition is saved. If the delivery configuration is rejected the
    // form still exists as an unscheduled draft rather than vanishing with
    // everything the teacher typed — they finish it from the form's own page.
    const mode = String(formData.get("deliveryMode") ?? "weekly");
    try {
      await configureDelivery(uid, courseId, {
        templateId,
        deliveryMode: mode,
        audienceMode: String(formData.get("audienceMode") ?? "all_sections"),
        sectionIds: formData.getAll("sectionIds").map(String),
        openDayOfWeek: String(formData.get("openDayOfWeek") ?? "") || undefined,
        openTime: String(formData.get("openTime") ?? ""),
        deadlineDayOfWeek:
          String(formData.get("deadlineDayOfWeek") ?? "") || undefined,
        deadlineTime: String(formData.get("deadlineTime") ?? ""),
        startDate: String(formData.get("startDate") ?? ""),
        endDate: String(formData.get("endDate") ?? ""),
        occurrenceCount:
          String(formData.get("occurrenceCount") ?? "") || undefined,
        intervalWeeks: String(formData.get("intervalWeeks") ?? "") || undefined,
        openDate: String(formData.get("openDate") ?? ""),
        openAtTime: String(formData.get("openAtTime") ?? ""),
        deadlineDate: String(formData.get("deadlineDate") ?? ""),
        deadlineAtTime: String(formData.get("deadlineAtTime") ?? ""),
      });
    } catch (err) {
      revalidatePath(`/teach/courses/${courseId}`);
      redirect(
        `/teach/courses/${courseId}/forms/${templateId}?error=${encodeURIComponent(
          `The form was saved, but its schedule was not: ${describe(err)}`,
        )}`,
      );
    }

    revalidatePath(`/teach/courses/${courseId}`);
    redirect(
      `/teach/courses/${courseId}/forms/${templateId}?ok=${encodeURIComponent(
        mode === "manual"
          ? "Form saved. Create the first one when you are ready to open it."
          : "Form saved and scheduled.",
      )}`,
    );
  }

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={courseNav(courseId, `/teach/courses/${courseId}`)}
      contextLabel={course.code}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/teach/courses", label: "My courses" },
            { href: `/teach/courses/${courseId}`, label: course.code },
            { label: "New form" },
          ]}
        />
      }
      title="New form"
    >
      <div className="stack-4">
        {error && <Alert variant="error">{error}</Alert>}

        {sections.length === 0 ? (
          <EmptyState
            title="No class lists yet"
            action={{
              href: `/teach/courses/${courseId}/sections?new=1`,
              label: "Add a section",
            }}
            primary
          >
            A form needs at least one section to go to.
          </EmptyState>
        ) : (
          <form action={createForm}>
            <section className="notice notice--pad">
              <h2 className="panel-title">What this form is</h2>
              <div className="form-grid" style={{ marginTop: "var(--s4)" }}>
                <div className="field-row">
                  <label htmlFor="form-title">Form name</label>
                  <input
                    id="form-title"
                    className="field"
                    name="title"
                    placeholder="Weekly feedback"
                    required
                    aria-describedby="form-title-help"
                  />
                  <span className="helper-text" id="form-title-help">
                    What students see at the top of it. &ldquo;LE 1
                    feedback&rdquo;, &ldquo;Course evaluation&rdquo;.
                  </span>
                </div>
                <div className="field-row">
                  <label htmlFor="form-purpose">
                    Label <span className="optional-mark">optional</span>
                  </label>
                  <input
                    id="form-purpose"
                    className="field"
                    name="purpose"
                    placeholder="Long exam"
                    aria-describedby="form-purpose-help"
                  />
                  <span className="helper-text" id="form-purpose-help">
                    Only to help you find it later in a long list.
                  </span>
                </div>
                <div className="field-row">
                  <label htmlFor="form-description">
                    Short description{" "}
                    <span className="optional-mark">optional</span>
                  </label>
                  <input
                    id="form-description"
                    className="field"
                    name="description"
                  />
                </div>
              </div>
            </section>

            <section
              className="notice notice--pad"
              style={{ marginTop: "var(--s4)" }}
            >
              <DeliveryFields
                sections={sections.map((s) => ({
                  id: s.id,
                  title: s.title,
                  term: s.term,
                }))}
                courseCode={course.code}
              />
            </section>

            <section
              className="notice notice--pad"
              style={{ marginTop: "var(--s4)" }}
            >
              <h2 className="panel-title">What it asks</h2>
              <div style={{ marginTop: "var(--s4)" }}>
                {/* The same editor and the same student preview the rest of the
                    product uses. A shared audience does not mean a copy of the
                    form per section: there is one question list. */}
                <TemplateEditor
                  showTitleFields={false}
                  initialQuestions={[]}
                  submitLabel="Save form"
                  versionNote="Later edits create a new version. Forms already sent keep the questions their students answered."
                />
              </div>
            </section>

            <p className="helper-text" style={{ marginTop: "var(--s4)" }}>
              <Link className="link" href={`/teach/courses/${courseId}`}>
                Cancel and go back to {course.code}
              </Link>
            </p>
          </form>
        )}
      </div>
    </AppShell>
  );
}

/** Read the student-additions configuration out of the editor's fields. */
function parseStudentSection(formData: FormData) {
  const generalComment = String(formData.get("generalComment") ?? "optional");
  return {
    maxStudentQuestions: Number.parseInt(
      String(formData.get("maxStudentQuestions") ?? "1"),
      10,
    ),
    studentQuestionPrompt:
      String(formData.get("studentQuestionPrompt") ?? "") || null,
    generalCommentEnabled: generalComment !== "off",
    generalCommentPrompt:
      String(formData.get("generalCommentPrompt") ?? "") || null,
    generalCommentRequired: generalComment === "required",
  };
}

function parseQuestions(raw: FormDataEntryValue | null): QuestionDefinition[] {
  const text = String(raw ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The question list could not be read. Try again.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Add at least one question.");
  }
  return parsed as QuestionDefinition[];
}

function describe(err: unknown): string {
  if (
    err instanceof AuthzError ||
    err instanceof ScheduleError ||
    err instanceof AudienceError ||
    err instanceof InstanceError
  ) {
    return err.message;
  }
  if (err instanceof Error && err.name === "ZodError") {
    try {
      const issues = JSON.parse(err.message) as { message: string }[];
      return issues.map((i) => i.message).join(" ");
    } catch {
      return "Check the values you entered and try again.";
    }
  }
  if (err instanceof Error) return err.message;
  throw err;
}
