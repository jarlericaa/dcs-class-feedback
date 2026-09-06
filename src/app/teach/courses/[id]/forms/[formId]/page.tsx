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
  ArchivedNotice,
  Breadcrumbs,
  CycleStateBadge,
  EmptyState,
  MetaList,
  Stamp,
} from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { IconChevron } from "@/components/ui/icons";
import { DeliveryFields } from "@/components/staff/delivery-fields";
import { TemplateEditor } from "@/components/staff/template-editor";
import { formatDateTime } from "@/lib/datetime";
import { DAY_NAMES } from "@/lib/days";
import { AuthzError } from "@/modules/authz";
import { AudienceError } from "@/modules/forms/audience";
import {
  createManualInstance,
  InstanceError,
  listInstancesForTemplate,
  openInstanceNow,
  closeInstanceNow,
} from "@/modules/forms/instances";
import {
  configureDelivery,
  deactivateSchedule,
  DELIVERY_LABELS,
  getDeliveryForTemplate,
  listAudienceOptions,
  ScheduleError,
} from "@/modules/forms/schedules";
import {
  createTemplateVersion,
  getTemplateDetail,
} from "@/modules/forms/templates";
import { restoreSkippedCycle, skipCycle } from "@/modules/forms/cycles";
import type { QuestionDefinition } from "@/modules/forms/questions";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * One form: its audience, its delivery, its occurrences, and its base questions.
 *
 * The three things a teacher can change here are deliberately separate sections,
 * because they have different scopes:
 * - the BASE questions — editing them creates a new version and affects only
 *   occurrences generated after the save;
 * - the DELIVERY and audience — who gets it from now on;
 * - one OCCURRENCE — its own page, its own questions, this week only.
 */
export default async function FormDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; formId: string }>;
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requireUser();
  const { id: courseId, formId } = await params;
  const { ok, error, edit } = await searchParams;
  const path = `/teach/courses/${courseId}/forms/${formId}`;

  let detail;
  try {
    detail = await getTemplateDetail(user.id, formId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={await primaryNavFor(user, path)}
          title="Form"
        >
          <AccessDenied what="this form" />
        </AppShell>
      );
    }
    throw err;
  }
  if (detail.template.courseId !== courseId) {
    redirect(`/teach/courses/${detail.template.courseId}/forms/${formId}`);
  }

  const course = (await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  }))!;
  const delivery = await getDeliveryForTemplate(formId);
  const sections = await listAudienceOptions(user.id, courseId);
  const instances = await listInstancesForTemplate(user.id, formId);
  const audienceIds = delivery?.sections.map((s) => s.id) ?? [];
  const editingQuestions = edit === "questions";

  // --- server actions ------------------------------------------------------

  async function saveDelivery(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await configureDelivery(uid, courseId, {
        templateId: formId,
        deliveryMode: String(formData.get("deliveryMode") ?? "weekly"),
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
      redirect(back(courseId, formId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/forms/${formId}`);
    redirect(
      back(
        courseId,
        formId,
        "Schedule saved. Occurrences already sent are unchanged.",
      ),
    );
  }

  async function stopDelivery(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await deactivateSchedule(uid, String(formData.get("scheduleId")));
    } catch (err) {
      redirect(back(courseId, formId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/forms/${formId}`);
    redirect(
      back(
        courseId,
        formId,
        "Stopped. Nothing new is generated; the ones already out are unchanged.",
      ),
    );
  }

  async function saveVersion(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await createTemplateVersion(
        uid,
        formId,
        parseQuestions(formData.get("questions")),
        undefined,
        parseStudentSection(formData),
      );
    } catch (err) {
      redirect(back(courseId, formId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/forms/${formId}`);
    redirect(
      back(
        courseId,
        formId,
        "Saved as a new version. Occurrences already generated keep their own questions.",
      ),
    );
  }

  async function addManual(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await createManualInstance(uid, courseId, {
        templateId: formId,
        audienceMode: String(formData.get("audienceMode") ?? "all_sections"),
        sectionIds: formData.getAll("sectionIds").map(String),
        title: String(formData.get("title") ?? "") || undefined,
        openDate: String(formData.get("openDate") ?? ""),
        openTime: String(formData.get("openTime") ?? ""),
        deadlineDate: String(formData.get("deadlineDate") ?? ""),
        deadlineTime: String(formData.get("deadlineTime") ?? ""),
      });
    } catch (err) {
      redirect(back(courseId, formId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/forms/${formId}`);
    redirect(
      back(courseId, formId, "Created as a draft. Open it when it should go out."),
    );
  }

  async function instanceAction(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const instanceId = String(formData.get("instanceId"));
    const intent = String(formData.get("intent"));
    let done = "Updated.";
    try {
      if (intent === "open") {
        await openInstanceNow(uid, instanceId);
        done = "Open. Students in its sections can fill it in now.";
      } else if (intent === "close") {
        await closeInstanceNow(uid, instanceId);
        done = "Closed. The answers already in are locked.";
      } else if (intent === "restore") {
        await restoreSkippedCycle(uid, instanceId);
        done = "Restored. It is scheduled again.";
      } else {
        await skipCycle(uid, instanceId);
        done = "Skipped. Nothing opens; you can restore it.";
      }
    } catch (err) {
      redirect(back(courseId, formId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/forms/${formId}`);
    redirect(back(courseId, formId, done));
  }

  // --- render --------------------------------------------------------------

  const scheduleSummary = delivery
    ? summarizeDelivery(delivery.schedule)
    : "Not scheduled yet";

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
            { label: detail.template.title },
          ]}
        />
      }
      title={detail.template.title}
      description={
        <MetaList
          items={[detail.template.description, detail.template.purpose]}
        />
      }
      status={
        detail.template.archived ? <Stamp tone="neutral">Archived</Stamp> : null
      }
    >
      <div className="stack-4">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        {course.archivedAt && <ArchivedNotice courseCode={course.code} />}

        <section className="notice">
          <div className="notice__head">
            <div>
              <h2>Occurrences</h2>
            </div>
            {delivery && <Stamp tone="green">{scheduleSummary}</Stamp>}
          </div>
          {instances.length === 0 ? (
            <div className="notice__body">
              <EmptyState title="Nothing sent yet">
                {delivery
                  ? "The first one appears here as soon as its opening date is within two weeks."
                  : "Set a schedule below, or create one to open by hand."}
              </EmptyState>
            </div>
          ) : (
            <div className="table-scroll table-scroll--flush">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Occurrence</th>
                    <th scope="col">Goes to</th>
                    <th scope="col">Status</th>
                    <th scope="col">Opens</th>
                    <th scope="col">Closes</th>
                    <th scope="col">Responses</th>
                    <th scope="col">Questions</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {instances.map((row) => {
                    const timezone =
                      row.audienceSections[0]?.timezone ?? "Asia/Manila";
                    return (
                      <tr key={row.instance.id}>
                        <th scope="row">
                          {row.label}
                          <MetaList
                            items={[
                              row.instance.focusLabel,
                              row.customized ? "Custom questions" : null,
                            ]}
                          />
                        </th>
                        <td>
                          {row.audienceSections.length === 0
                            ? "—"
                            : row.audienceSections.length === 1
                              ? row.audienceSections[0]!.title
                              : `${row.audienceSections.length} sections`}
                          {row.audienceHasHiddenSections && " and others"}
                        </td>
                        <td>
                          <CycleStateBadge state={row.instance.state} />
                        </td>
                        <td>{formatDateTime(row.instance.openAt, timezone)}</td>
                        <td>
                          {formatDateTime(row.instance.deadlineAt, timezone)}
                        </td>
                        <td>{row.responseCount}</td>
                        <td>
                          {row.questionCount}
                          {row.editLocked ? " · locked" : ""}
                        </td>
                        <td>
                          <span className="row">
                            {/* The requested action, named after the thing it
                                edits: "Customize Week 4", not "Edit cycle". */}
                            <Link
                              className="button button--secondary button--small"
                              href={`/teach/courses/${courseId}/forms/${formId}/instances/${row.instance.id}`}
                            >
                              {row.editLocked
                                ? "View"
                                : row.customized
                                  ? `Edit ${row.label}`
                                  : `Customize ${row.label}`}
                            </Link>
                            {(row.instance.state === "draft" ||
                              row.instance.state === "scheduled") && (
                              <form
                                action={instanceAction}
                                className="inline-form"
                              >
                                <input
                                  type="hidden"
                                  name="instanceId"
                                  value={row.instance.id}
                                />
                                <input
                                  type="hidden"
                                  name="intent"
                                  value="open"
                                />
                                <button
                                  className="button button--secondary button--small"
                                  type="submit"
                                >
                                  Open now
                                </button>
                              </form>
                            )}
                            {row.instance.state === "open" && (
                              <Dialog
                                variant="danger"
                                className="button--small"
                                label="Close now"
                                title={`Close ${row.label}?`}
                                description="Answers already in are locked. Students cannot submit or edit after this."
                              >
                                <form action={instanceAction}>
                                  <input
                                    type="hidden"
                                    name="instanceId"
                                    value={row.instance.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="intent"
                                    value="close"
                                  />
                                  <div className="row">
                                    <button
                                      className="button button--danger"
                                      type="submit"
                                    >
                                      Close {row.label}
                                    </button>
                                  </div>
                                </form>
                              </Dialog>
                            )}
                            {row.instance.state === "scheduled" && (
                              <Dialog
                                className="button--small"
                                label="Skip"
                                title={`Skip ${row.label}?`}
                                description="Nothing opens. You can restore it later; the other occurrences are not affected."
                              >
                                <form action={instanceAction}>
                                  <input
                                    type="hidden"
                                    name="instanceId"
                                    value={row.instance.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="intent"
                                    value="skip"
                                  />
                                  <div className="row">
                                    <button
                                      className="button button--danger"
                                      type="submit"
                                    >
                                      Skip {row.label}
                                    </button>
                                  </div>
                                </form>
                              </Dialog>
                            )}
                            {row.instance.state === "skipped" && (
                              <form
                                action={instanceAction}
                                className="inline-form"
                              >
                                <input
                                  type="hidden"
                                  name="instanceId"
                                  value={row.instance.id}
                                />
                                <input
                                  type="hidden"
                                  name="intent"
                                  value="restore"
                                />
                                <button
                                  className="button button--secondary button--small"
                                  type="submit"
                                >
                                  Restore
                                </button>
                              </form>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* A manually-opened form needs a way to make the next one. Closed by
              default: a scheduled form never needs it. */}
          <details className="disclose disclose--inset">
            <summary>
              <IconChevron className="disclose__mark" size={15} />
              Create one to open by hand
            </summary>
            <div className="disclose__body">
              <form action={addManual} className="stack-4">
                <div className="form-grid">
                  <div className="field-row">
                    <label htmlFor="manual-title">
                      Name it <span className="optional-mark">optional</span>
                    </label>
                    <input
                      id="manual-title"
                      className="field"
                      name="title"
                      placeholder="LE 1 feedback"
                    />
                  </div>
                  <div className="field-row">
                    <label htmlFor="manual-audience">Goes to</label>
                    <select
                      id="manual-audience"
                      className="select-field"
                      name="audienceMode"
                      defaultValue="all_sections"
                    >
                      <option value="all_sections">
                        All sections in {course.code}
                      </option>
                      <option value="selected_sections">
                        Only the sections ticked below
                      </option>
                    </select>
                  </div>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="field-label">Sections</legend>
                  <div className="form-grid">
                    {sections.map((section) => (
                      <label className="choice" key={section.id}>
                        <input
                          type="checkbox"
                          name="sectionIds"
                          value={section.id}
                        />
                        <span>{section.title}</span>
                      </label>
                    ))}
                  </div>
                  <span className="helper-text">
                    Ignored unless you chose &ldquo;only the sections ticked
                    below&rdquo;.
                  </span>
                </fieldset>
                <div className="form-grid">
                  <div className="field-row">
                    <label htmlFor="manual-open-date">
                      Opens <span className="optional-mark">optional</span>
                    </label>
                    <input
                      id="manual-open-date"
                      className="field"
                      type="date"
                      name="openDate"
                    />
                    <span className="helper-text">
                      Leave blank to open it the moment you press Open.
                    </span>
                  </div>
                  <div className="field-row">
                    <label htmlFor="manual-open-time">at</label>
                    <input
                      id="manual-open-time"
                      className="field"
                      type="time"
                      name="openTime"
                      defaultValue="08:00"
                    />
                  </div>
                  <div className="field-row">
                    <label htmlFor="manual-deadline-date">Closes</label>
                    <input
                      id="manual-deadline-date"
                      className="field"
                      type="date"
                      name="deadlineDate"
                      required
                    />
                  </div>
                  <div className="field-row">
                    <label htmlFor="manual-deadline-time">at</label>
                    <input
                      id="manual-deadline-time"
                      className="field"
                      type="time"
                      name="deadlineTime"
                      defaultValue="23:59"
                      required
                    />
                  </div>
                </div>
                <div>
                  <button className="button button--primary" type="submit">
                    Create as a draft
                  </button>
                </div>
              </form>
            </div>
          </details>
        </section>

        <section className="notice">
          <div className="notice__head">
            <div>
              <h2>Who gets it, and when</h2>
            </div>
          </div>
          <div className="notice__body">
            <form action={saveDelivery} className="stack-4">
              <DeliveryFields
                sections={sections.map((s) => ({
                  id: s.id,
                  title: s.title,
                  term: s.term,
                }))}
                courseCode={course.code}
                defaultMode={delivery?.schedule.deliveryMode ?? "weekly"}
                defaultAudienceMode={
                  delivery?.schedule.audienceMode ?? "all_sections"
                }
                defaultSectionIds={audienceIds}
                defaultOpenDayOfWeek={delivery?.schedule.openDayOfWeek ?? 1}
                defaultOpenTime={(
                  delivery?.schedule.openTime ?? "08:00:00"
                ).slice(0, 5)}
                defaultDeadlineDayOfWeek={
                  delivery?.schedule.deadlineDayOfWeek ?? 0
                }
                defaultDeadlineTime={(
                  delivery?.schedule.deadlineTime ?? "23:59:00"
                ).slice(0, 5)}
                defaultStartDate={delivery?.schedule.startDate ?? ""}
                defaultEndDate={delivery?.schedule.endDate ?? ""}
                defaultOccurrenceCount={
                  delivery?.schedule.occurrenceCount
                    ? String(delivery.schedule.occurrenceCount)
                    : ""
                }
                defaultIntervalWeeks={delivery?.schedule.intervalWeeks ?? 2}
              />
              <div className="row">
                <button className="button button--primary" type="submit">
                  {delivery ? "Replace schedule" : "Save schedule"}
                </button>
              </div>
            </form>
          </div>
          {delivery?.schedule.active && (
            <div className="notice__foot">
              <form action={stopDelivery} className="inline-form">
                <input
                  type="hidden"
                  name="scheduleId"
                  value={delivery.schedule.id}
                />
                <button
                  className="button button--danger button--small"
                  type="submit"
                >
                  Stop sending new ones
                </button>
              </form>
            </div>
          )}
        </section>

        <section className="notice">
          <div className="notice__head">
            <div>
              <h2>Questions</h2>
            </div>
            {!editingQuestions && (
              <Link
                className="button button--secondary button--small"
                href={`/teach/courses/${courseId}/forms/${formId}?edit=questions`}
              >
                Edit questions
              </Link>
            )}
          </div>
          {editingQuestions ? (
            <div className="notice__body">
              <form action={saveVersion}>
                <TemplateEditor
                  showTitleFields={false}
                  submitLabel="Save as a new version"
                  versionNote="This changes the form from here on. Occurrences already generated keep the questions their students answered — to change one of those, open it and edit that one."
                  defaultMaxStudentQuestions={
                    detail.versions[0]?.maxStudentQuestions ?? 1
                  }
                  defaultStudentQuestionPrompt={
                    detail.versions[0]?.studentQuestionPrompt ?? ""
                  }
                  defaultGeneralCommentEnabled={
                    detail.versions[0]?.generalCommentEnabled ?? true
                  }
                  defaultGeneralCommentPrompt={
                    detail.versions[0]?.generalCommentPrompt ?? ""
                  }
                  defaultGeneralCommentRequired={
                    detail.versions[0]?.generalCommentRequired ?? false
                  }
                  initialQuestions={detail.questions.map((q) => ({
                    key: q.id,
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
          ) : detail.questions.length === 0 ? (
            <div className="notice__body">
              <EmptyState title="No questions yet">
                Students would see only the block where they add their own
                question.
              </EmptyState>
            </div>
          ) : (
            <ol className="data-list">
              {detail.questions.map((q, index) => (
                <li key={q.id}>
                  <span className="data-list__main">
                    <strong>
                      {index + 1}. {q.prompt}
                    </strong>
                    <MetaList
                      items={[
                        TYPE_LABELS[q.type] ?? q.type,
                        q.required ? "Required" : "Optional",
                      ]}
                    />
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div className="notice__foot">
            <MetaList
              items={[
                `Version ${detail.versions[0]?.versionNumber ?? 1}`,
                detail.versions.length > 1
                  ? `${detail.versions.length} versions`
                  : null,
              ]}
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

const TYPE_LABELS: Record<string, string> = {
  short_answer: "Short answer",
  paragraph: "Paragraph",
  multiple_choice: "Multiple choice",
  checkboxes: "Checkboxes",
  dropdown: "Dropdown",
  linear_scale: "Linear scale",
  yes_no: "Yes / No",
  date: "Date",
  time: "Time",
};

/** The schedule as one short phrase, for the panel's status stamp. */
function summarizeDelivery(schedule: {
  deliveryMode: "one_time" | "weekly" | "custom_recurring" | "manual";
  openDayOfWeek: number | null;
  openTime: string | null;
  intervalWeeks: number;
  active: boolean;
}): string {
  if (!schedule.active) return "Stopped";
  const label = DELIVERY_LABELS[schedule.deliveryMode];
  if (schedule.deliveryMode === "manual" || schedule.deliveryMode === "one_time") {
    return label;
  }
  const day =
    schedule.openDayOfWeek !== null ? DAY_NAMES[schedule.openDayOfWeek] : null;
  const every =
    schedule.deliveryMode === "custom_recurring"
      ? `Every ${schedule.intervalWeeks} weeks`
      : "Every week";
  return day ? `${every}, ${day}` : every;
}

/**
 * Module scope on purpose: a server action serializes everything it closes over,
 * so it may not capture a helper defined inside the page component.
 */
function back(
  courseId: string,
  formId: string,
  message: string,
  kind: "ok" | "error" = "ok",
): string {
  return `/teach/courses/${courseId}/forms/${formId}?${kind}=${encodeURIComponent(message)}`;
}

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
