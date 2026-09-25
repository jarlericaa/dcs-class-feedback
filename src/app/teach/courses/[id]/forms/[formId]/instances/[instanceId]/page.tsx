import { SubmitButton } from "@/components/ui/submit-button";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { courses } from "@/db/schema";

import { AppShell } from "@/components/layout/app-shell";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  Alert,
  Breadcrumbs,
  CycleStateBadge,
  MetaList,
  Stamp,
} from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { TemplateEditor } from "@/components/staff/template-editor";
import { formatDateTime } from "@/lib/datetime";
import { AuthzError } from "@/modules/authz";
import {
  customizeInstanceQuestions,
  getInstanceDetail,
  InstanceError,
  restoreInstanceToBase,
  setInstanceFocus,
  type InstanceDetail,
} from "@/modules/forms/instances";
import { requireUser, toShellUser } from "@/lib/session";
import { Field, FieldRow, Select } from "@/components/ui/form";

/**
 * One occurrence of a form — the "Customize Week 4" screen.
 *
 * The scope is stated once, in one line, and it is the whole point: changes here
 * apply to THIS occurrence only. The base form, the occurrences before it, the
 * ones after it, and every answer already submitted are separate rows and are
 * never touched.
 *
 * What the editor shows is this occurrence's own question snapshot, with each
 * question marked as inherited from the base form, changed here, or added here.
 */
export default async function InstanceEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; formId: string; instanceId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id: courseId, formId, instanceId } = await params;
  const { ok, error } = await searchParams;
  const path = `/teach/courses/${courseId}/forms/${formId}/instances/${instanceId}`;

  let detail: InstanceDetail;
  try {
    detail = await getInstanceDetail(user.id, instanceId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={await primaryNavFor(user, path)}
          title="Form occurrence"
        >
          <AccessDenied what="this form" />
        </AppShell>
      );
    }
    throw err;
  }

  const course = (await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  }))!;
  const { instance, label, questions, editLocked, customized } = detail;
  const baseKeys = new Set(detail.baseQuestions.map((q) => q.stableKey));

  async function saveQuestions(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await customizeInstanceQuestions(
        uid,
        instanceId,
        parseQuestions(formData.get("questions")),
      );
    } catch (err) {
      redirect(back(courseId, formId, instanceId, describe(err), "error"));
    }
    revalidatePath(
      `/teach/courses/${courseId}/forms/${formId}/instances/${instanceId}`,
    );
    redirect(
      back(
        courseId,
        formId,
        instanceId,
        "Saved. These questions apply to this one only.",
      ),
    );
  }

  async function saveFocus(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await setInstanceFocus(uid, instanceId, {
        title: String(formData.get("title") ?? ""),
        focusLabel: String(formData.get("focusLabel") ?? ""),
        topicId: String(formData.get("topicId") ?? ""),
      });
    } catch (err) {
      redirect(back(courseId, formId, instanceId, describe(err), "error"));
    }
    revalidatePath(
      `/teach/courses/${courseId}/forms/${formId}/instances/${instanceId}`,
    );
    redirect(back(courseId, formId, instanceId, "Saved."));
  }

  async function resetToBase() {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await restoreInstanceToBase(uid, instanceId);
    } catch (err) {
      redirect(back(courseId, formId, instanceId, describe(err), "error"));
    }
    revalidatePath(
      `/teach/courses/${courseId}/forms/${formId}/instances/${instanceId}`,
    );
    redirect(
      back(
        courseId,
        formId,
        instanceId,
        "Back to the base form's questions for this one.",
      ),
    );
  }

  const instanceOnly = questions.filter((q) => q.origin === "instance_only");
  const changedHere = questions.filter((q) => q.origin === "modified");

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, path)}
      /* A form, its new-form page and one of its occurrences are all children
         of Forms, not peers of it, so the strip marks Forms rather than going
         blank. `activeHref` states that instead of lying about the path. */
      tabGroups={await courseTabGroupsFor(user.id, courseId, path, {
        activeHref: `/teach/courses/${courseId}`,
      })}
      tabsLabel={course.code}
      contextLabel={course.code}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/teach/courses", label: "My courses" },
            { href: `/teach/courses/${courseId}`, label: course.code },
            {
              href: `/teach/courses/${courseId}/forms/${formId}`,
              label: detail.template?.title ?? "Form",
            },
            { label },
          ]}
        />
      }
      nested
      title={label}
      status={
        <>
          <CycleStateBadge state={instance.state} />
          {customized ? (
            <Stamp tone="amber">Custom questions</Stamp>
          ) : (
            <Stamp tone="neutral">Base form</Stamp>
          )}
        </>
      }
      description={
        <MetaList
          items={[
            detail.template?.title,
            `Opens ${formatDateTime(instance.openAt, detail.timezone)}`,
            `Closes ${formatDateTime(instance.deadlineAt, detail.timezone)}`,
            detail.audienceSections.length === 1
              ? detail.audienceSections[0]!.title
              : `${detail.audienceSections.length} sections${
                  detail.audienceHasHiddenSections ? " and others" : ""
                }`,
            detail.responseCount > 0
              ? `${detail.responseCount} response${detail.responseCount === 1 ? "" : "s"}`
              : null,
          ]}
        />
      }
    >
      <div className="stack-4">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        {/* The scope, in one line. No explanation of snapshots or versions. */}
        <Alert variant="info">Changes apply to {label} only.</Alert>

        <section className="notice">
          <div className="notice__head">
            <div>
              <h2 className="panel-title">This one&apos;s focus</h2>
            </div>
          </div>
          <div className="notice__body">
            <form action={saveFocus} className="stack-4">
              <div className="form-grid">
                <FieldRow label="Name it" htmlFor="instance-title">
                  <Field
                    id="instance-title"
                    name="title"
                    defaultValue={instance.title ?? ""}
                    placeholder={label}
                    aria-describedby="instance-title-help"
                  />
                  <span className="helper-text" id="instance-title-help">
                    Replaces &ldquo;{label}&rdquo; where students see it.
                  </span>
                </FieldRow>
                <FieldRow label="Focus" htmlFor="instance-focus">
                  <Field
                    id="instance-focus"
                    name="focusLabel"
                    defaultValue={instance.focusLabel ?? ""}
                    placeholder="Normalization"
                    aria-describedby="instance-focus-help"
                  />
                  <span className="helper-text" id="instance-focus-help">
                    Shown to students under the form name, so an extra question
                    makes sense.
                  </span>
                </FieldRow>
                {detail.topics.length > 0 && (
                  <FieldRow label="Topic" htmlFor="instance-topic">
                    <Select
                      id="instance-topic"
                      name="topicId"
                      defaultValue={instance.topicId ?? ""}
                    >
                      <option value="">No topic</option>
                      {detail.topics.map((topic) => (
                        <option key={topic.id} value={topic.id}>
                          {topic.title}
                        </option>
                      ))}
                    </Select>
                  </FieldRow>
                )}
              </div>
              <div>
                <SubmitButton variant="primary" pendingLabel="Saving…">
                  Save
                </SubmitButton>
              </div>
            </form>
          </div>
        </section>

        <section className="notice">
          <div className="notice__head">
            <div>
              <h2 className="panel-title">Questions on {label}</h2>
              <MetaList
                items={[
                  `${questions.length} question${questions.length === 1 ? "" : "s"}`,
                  changedHere.length > 0
                    ? `${changedHere.length} changed here`
                    : null,
                  instanceOnly.length > 0
                    ? `${instanceOnly.length} added here`
                    : null,
                  changedHere.length === 0 && instanceOnly.length === 0
                    ? "All from the base form"
                    : null,
                ]}
              />
            </div>
          </div>
          <div className="notice__body">
            <form action={saveQuestions}>
              <TemplateEditor
                showTitleFields={false}
                hideStudentSection
                submitLabel={`Save ${label}`}
                previewLabel="Preview as student"
                lockedStructure={editLocked}
                lockedNote={`Someone has already answered ${label}. You can still fix wording; adding, removing, reordering or retyping a question would invalidate what they sent.`}
                versionNote={`These questions belong to ${label}. The base form and every other occurrence are untouched.`}
                extraActions={
                  customized && !editLocked ? (
                    <Dialog
                      size="small"
                      label="Reset to the base form"
                      title={`Reset ${label} to the base form?`}
                      description="Everything added or changed here is discarded and the base form's questions are copied in again."
                    >
                      <form action={resetToBase}>
                        <div className="row">
                          <SubmitButton
                            variant="danger"
                            pendingLabel="Resetting…"
                          >
                            Reset {label}
                          </SubmitButton>
                        </div>
                      </form>
                    </Dialog>
                  ) : undefined
                }
                defaultMaxStudentQuestions={
                  detail.baseVersion?.maxStudentQuestions ?? 1
                }
                defaultStudentQuestionPrompt={
                  detail.baseVersion?.studentQuestionPrompt ?? ""
                }
                defaultGeneralCommentEnabled={
                  detail.baseVersion?.generalCommentEnabled ?? true
                }
                defaultGeneralCommentPrompt={
                  detail.baseVersion?.generalCommentPrompt ?? ""
                }
                defaultGeneralCommentRequired={
                  detail.baseVersion?.generalCommentRequired ?? false
                }
                initialQuestions={questions.map((q) => ({
                  key: q.id,
                  // Carried so a reworded question keeps its identity, and so the
                  // service can tell it from a genuinely new one.
                  stableKey: q.stableKey,
                  prompt: q.prompt,
                  description: q.description ?? "",
                  type: q.type,
                  required: q.required,
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
          </div>
          {questions.length > 0 && (
            <div className="notice__foot">
              {/* Which questions came from where, in words. The editor rows
                  themselves stay clean. */}
              <ul className="plain-list">
                {questions.map((q) => (
                  <li className="meta" key={q.id}>
                    {q.prompt.slice(0, 70)}
                    {q.prompt.length > 70 ? "…" : ""} —{" "}
                    {q.origin === "instance_only"
                      ? `only on ${label}`
                      : q.origin === "modified"
                        ? `changed for ${label}`
                        : baseKeys.has(q.stableKey)
                          ? "from the base form"
                          : "from the base form"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <p className="helper-text">
          <Link
            className="link"
            href={`/teach/courses/${courseId}/forms/${formId}`}
          >
            Back to {detail.template?.title ?? "the form"}
          </Link>
        </p>
      </div>
    </AppShell>
  );
}

/**
 * Module scope on purpose: a server action serializes everything it closes over,
 * so it may not capture a helper defined inside the page component.
 */
function back(
  courseId: string,
  formId: string,
  instanceId: string,
  message: string,
  kind: "ok" | "error" = "ok",
): string {
  return `/teach/courses/${courseId}/forms/${formId}/instances/${instanceId}?${kind}=${encodeURIComponent(message)}`;
}

function parseQuestions(raw: FormDataEntryValue | null): unknown[] {
  const text = String(raw ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InstanceError("The question list could not be read. Try again.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new InstanceError("A form needs at least one question.");
  }
  return parsed;
}

function describe(err: unknown): string {
  if (err instanceof AuthzError || err instanceof InstanceError) {
    return err.message;
  }
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
