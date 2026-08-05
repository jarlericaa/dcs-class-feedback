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
  Stamp,
  Breadcrumbs,
  EmptyState,
  MetaList,
} from "@/components/ui";
import { IconPlus } from "@/components/ui/icons";
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
  searchParams: Promise<{
    edit?: string;
    error?: string;
    ok?: string;
    new?: string;
  }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const { edit, error, ok, new: newTemplate } = await searchParams;

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
        studentSection: parseStudentSection(formData),
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
        undefined,
        parseStudentSection(formData),
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
      title="Form templates"
      actions={
        !editing && (
          <Link
            className="button button--primary"
            href={`/teach/courses/${courseId}/templates?new=1`}
          >
            <IconPlus size={15} />
            New template
          </Link>
        )
      }
    >
      <div className="stack-4">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        {templates.length === 0 ? (
          /* CONTENT-VOICE §5: title, one sentence, the action. The paragraph
             that used to define what a template is and explain immutable
             versioning is gone — an instructor does not need the definition, and
             the version rule belongs beside the save button, where it applies. */
          <EmptyState
            title="No templates yet"
            action={{
              href: `/teach/courses/${courseId}/templates?new=1`,
              label: "New template",
            }}
            primary
          >
            A weekly schedule needs a template to copy into each form.
          </EmptyState>
        ) : (
          <section className="notice">
            <ul className="data-list">
              {templates.map(({ template, latestVersion, questionCount }) => (
                <li key={template.id}>
                  <span className="data-list__main">
                    <strong>{template.title}</strong>
                    {/* Three separate facts. They were one run-on sentence:
                        "4 questions · version 2 · 5 Aug 2026". */}
                    <MetaList
                      items={[
                        `${questionCount} question${questionCount === 1 ? "" : "s"}`,
                        // The version number only earns a place once there is
                        // more than one; "Version 1" tells a teacher nothing.
                        (latestVersion?.versionNumber ?? 0) > 1
                          ? `Version ${latestVersion?.versionNumber}`
                          : null,
                        `Updated ${formatDate(
                          latestVersion?.createdAt ?? template.createdAt,
                        )}`,
                      ]}
                    />
                  </span>
                  <span className="row">
                    {template.archived && (
                      <Stamp tone="neutral">Archived</Stamp>
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
          <section className="notice notice--pad" id="editor">
            <h2 className="panel-title">{editing.template.title}</h2>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              Editing as version {(editing.versions[0]?.versionNumber ?? 0) + 1}
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
                versionNote="Saving creates a new version. Weeks already generated keep their current questions."
                defaultMaxStudentQuestions={
                  editing.versions[0]?.maxStudentQuestions ?? 1
                }
                defaultStudentQuestionPrompt={
                  editing.versions[0]?.studentQuestionPrompt ?? ""
                }
                defaultGeneralCommentEnabled={
                  editing.versions[0]?.generalCommentEnabled ?? true
                }
                defaultGeneralCommentPrompt={
                  editing.versions[0]?.generalCommentPrompt ?? ""
                }
                defaultGeneralCommentRequired={
                  editing.versions[0]?.generalCommentRequired ?? false
                }
                initialQuestions={editing.questions.map((q) => ({
                  key: q.id,
                  prompt: q.prompt,
                  description: q.description ?? "",
                  type: q.type,
                  required: q.required,
                  // Carry each option's existing stableId through the editor.
                  // Answers store optionIds and exports join on them, so an
                  // option must keep its identity when its label is corrected.
                  options: (
                    (q.options ?? []) as { stableId: string; label: string }[]
                  ).map((o, index) => ({
                    key: `${q.id}-${o.stableId ?? index}`,
                    stableId: o.stableId,
                    label: o.label,
                  })),
                  scaleMin: (q.scale as { min?: number } | null)?.min ?? 1,
                  scaleMax: (q.scale as { max?: number } | null)?.max ?? 5,
                }))}
              />
            </form>
          </section>
        )}

        {/* Closed unless asked for. It used to be a permanently-open editor
            below the list, which meant the page's create action — the last
            control inside it — was only reachable by scrolling past an editor
            the reader had not opened. */}
        {!editing && (newTemplate === "1" || !!error) && (
          <section className="notice notice--pad" id="new-template">
            <h2 className="panel-title">New template</h2>
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

/** Read the student-section configuration out of either template form. */
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
