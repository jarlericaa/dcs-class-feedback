import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { courses } from "@/db/schema";

import { formatDate } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { homeNav } from "@/components/layout/nav";
import {
  AccessDenied,
  Alert,
  Badge,
  Breadcrumbs,
  EmptyState,
} from "@/components/ui";
import { TemplateEditor } from "@/components/staff/template-editor";
import {
  createTemplate,
  createTemplateVersion,
  getTemplateDetail,
  listTemplatesForCourse,
} from "@/modules/forms/templates";
import { AuthzError } from "@/modules/authz";
import type { QuestionDefinition } from "@/modules/forms/questions";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * Course-level template authoring.
 *
 * Editing never mutates a version: saving creates the next immutable
 * TemplateVersion, so cycles already generated keep exactly the questions
 * their students answered.
 */
export default async function TemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; error?: string; ok?: string }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const { edit, error, ok } = await searchParams;

  let templates;
  try {
    templates = await listTemplatesForCourse(user.id, courseId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={[]}
          title="Templates"
        >
          <AccessDenied what="this course's templates" />
        </AppShell>
      );
    }
    throw err;
  }

  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  const editing = edit ? await getTemplateDetail(user.id, edit) : null;

  async function addTemplate(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await createTemplate(uid, {
        courseId,
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? "") || undefined,
        visibility: "course_shared",
        questions: parseQuestions(formData.get("questions")),
      });
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/templates`);
    redirect(backTo(courseId, "Template created."));
  }

  async function addVersion(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const templateId = String(formData.get("templateId"));
    try {
      await createTemplateVersion(
        uid,
        templateId,
        parseQuestions(formData.get("questions")),
      );
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/templates`);
    redirect(
      backTo(
        courseId,
        "New template version saved. Weeks already generated keep their original questions.",
      ),
    );
  }

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={homeNav("/teach/courses", {
        isTeacher: user.isTeacher,
        isPlatformAdmin: user.isPlatformAdmin,
      })}
      contextLabel={course?.code}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/teach/courses", label: "My courses" },
            { label: course?.code ?? "Course" },
            { label: "Templates" },
          ]}
        />
      }
      eyebrow="Staff only"
      title="Form templates"
      description="Templates are snapshotted into each weekly cycle. Editing creates a new version and never changes a week that already collected answers."
    >
      <div className="stack-gap">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        {templates.length === 0 ? (
          <EmptyState title="No templates yet">
            Create the weekly form your sections will use. You can change it
            later; each change becomes a new version.
          </EmptyState>
        ) : (
          <section className="card">
            <div className="card__header">
              <div>
                <h2>Templates in this course</h2>
                <p>Any section of this course can use them for its schedule.</p>
              </div>
            </div>
            <ul className="data-list">
              {templates.map(({ template, latestVersion, questionCount }) => (
                <li key={template.id}>
                  <span className="data-list__main">
                    <strong>{template.title}</strong>
                    <small>
                      {questionCount} question{questionCount === 1 ? "" : "s"} ·
                      version {latestVersion?.versionNumber ?? 0} ·{" "}
                      {formatDate(
                        latestVersion?.createdAt ?? template.createdAt,
                      )}
                    </small>
                  </span>
                  <span className="row-gap">
                    {template.archived && (
                      <Badge tone="neutral">Archived</Badge>
                    )}
                    <Link
                      className="button button--secondary button--small"
                      href={`/teach/courses/${courseId}/templates?edit=${template.id}`}
                    >
                      {edit === template.id ? "Editing" : "Edit"}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {editing && (
          <section className="card card--padded" id="editor">
            <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>
              Edit “{editing.template.title}”
            </h2>
            <p className="muted small" style={{ margin: "0 0 6px" }}>
              Saving creates version{" "}
              {(editing.versions[0]?.versionNumber ?? 0) + 1}.
            </p>
            <form action={addVersion}>
              <input
                type="hidden"
                name="templateId"
                value={editing.template.id}
              />
              <TemplateEditor
                showTitleFields={false}
                submitLabel="Save as a new version"
                note="Cycles that have already been generated keep the questions they were created with. Only future cycles use this version."
                initialQuestions={editing.questions.map((q) => ({
                  key: q.id,
                  prompt: q.prompt,
                  description: q.description ?? "",
                  type: q.type,
                  required: q.required,
                  optionsText: ((q.options ?? []) as { label: string }[])
                    .map((o) => o.label)
                    .join("\n"),
                  scaleMin: (q.scale as { min?: number } | null)?.min ?? 1,
                  scaleMax: (q.scale as { max?: number } | null)?.max ?? 5,
                }))}
              />
            </form>
          </section>
        )}

        {!editing && (
          <section className="card card--padded">
            <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>New template</h2>
            <p className="muted small" style={{ margin: "0 0 16px" }}>
              Students always get an optional free-text question/feedback box in
              addition to what you add here.
            </p>
            <form action={addTemplate}>
              <TemplateEditor
                initialQuestions={[]}
                submitLabel="Create template"
              />
            </form>
          </section>
        )}
      </div>
    </AppShell>
  );
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
  if (err instanceof AuthzError) return err.message;
  if (err instanceof Error && err.name === "ZodError") {
    try {
      const issues = JSON.parse(err.message) as { message: string }[];
      return issues.map((i) => i.message).join(" ");
    } catch {
      return "Check the questions and try again.";
    }
  }
  if (err instanceof Error) return err.message;
  throw err;
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
  return `/teach/courses/${courseId}/templates?${kind}=${encodeURIComponent(message)}`;
}
