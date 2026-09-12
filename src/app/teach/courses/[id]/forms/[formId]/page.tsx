import { SubmitButton } from "@/components/ui/submit-button";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { courses } from "@/db/schema";

import { AppShell } from "@/components/layout/app-shell";
import { staffSectionTabGroups } from "@/components/layout/nav";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import { loadStaffSection, sectionLabel } from "@/lib/staff-section";
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
import { DeliveryFields } from "@/components/staff/delivery-fields";
import { OccurrenceActions } from "@/components/staff/occurrence-actions";
import { TemplateEditor } from "@/components/staff/template-editor";
import { formatDate } from "@/lib/datetime";
import { DAY_NAMES } from "@/lib/days";
import { addDays, dayOfWeek, parseDate } from "@/modules/forms/timezone";
import { AuthzError } from "@/modules/authz";
import { AudienceError } from "@/modules/forms/audience";
import {
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
import { Button, buttonClass } from "@/components/ui/button";

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
  searchParams: Promise<{
    ok?: string;
    error?: string;
    edit?: string;
    /** section context used by a templates-only assistant */
    sectionId?: string;
  }>;
}) {
  const user = await requireUser();
  const { id: courseId, formId } = await params;
  const { ok, error, edit, sectionId } = await searchParams;
  const path = `/teach/courses/${courseId}/forms/${formId}`;

  /**
   * The definition and delivery are different permissions. A section assistant
   * with `manage_templates` may read and revise the definition, but cannot read
   * or change occurrences and delivery unless they also hold course standing.
   */
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

  let instances: Awaited<ReturnType<typeof listInstancesForTemplate>> = [];
  let canManageDelivery = false;
  try {
    instances = await listInstancesForTemplate(user.id, formId);
    canManageDelivery = true;
  } catch (err) {
    // A templates-only assistant is allowed to stay on this page for the
    // definition. The delivery/occurrence panels are omitted below; their
    // mutations remain independently guarded by their services.
    if (!(err instanceof AuthzError)) throw err;
  }

  const course = (await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  }))!;
  const delivery = canManageDelivery
    ? await getDeliveryForTemplate(formId)
    : null;
  const sections = canManageDelivery
    ? await listAudienceOptions(user.id, courseId)
    : [];
  const audienceIds = delivery?.sections.map((s) => s.id) ?? [];
  const editingQuestions = edit === "questions";

  // A section-scoped template manager gets a contextual strip and breadcrumbs
  // when the link carries the section it came from. The definition permission
  // itself was already checked above; this is only navigation context. Validate
  // the query-string id before the section loader compares it with a UUID.
  const safeSectionId =
    sectionId && z.string().uuid().safeParse(sectionId).success
      ? sectionId
      : undefined;
  const sectionContext = safeSectionId
    ? await loadStaffSection(safeSectionId, "manageTemplates")
    : null;
  const hasSectionContext =
    !canManageDelivery &&
    sectionContext?.ok === true &&
    sectionContext.course.id === courseId;
  const sectionFormsPath = hasSectionContext
    ? `/teach/sections/${safeSectionId}/forms`
    : null;

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
      redirect(
        withSectionContext(
          back(courseId, formId, describe(err), "error"),
          safeSectionId,
        ),
      );
    }
    revalidatePath(`/teach/courses/${courseId}/forms/${formId}`);
    redirect(
      withSectionContext(
        back(
          courseId,
          formId,
          "Saved as a new version. Occurrences already generated keep their own questions.",
        ),
        safeSectionId,
      ),
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
  const effectiveEndDate = delivery
    ? migratedEndDate(delivery.schedule)
    : "";

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, path, {
        fallbackHref: sectionFormsPath
          ? `/teach/sections/${safeSectionId}`
          : undefined,
      })}
      /* Course staff see the course strip. A section-scoped template manager
         stays in the section context, where the Forms doorway is real and the
         delivery controls are not implied. */
      tabGroups={
        sectionFormsPath && sectionContext?.ok
          ? staffSectionTabGroups(sectionContext.access, sectionFormsPath)
          : canManageDelivery
            ? await courseTabGroupsFor(user.id, courseId, path, {
                activeHref: `/teach/courses/${courseId}`,
              })
            : undefined
      }
      tabsLabel={
        sectionFormsPath && sectionContext?.ok
          ? sectionLabel(course.code, sectionContext.section.title)
          : canManageDelivery
            ? course.code
            : undefined
      }
      tabsMode={sectionFormsPath ? "menu" : undefined}
      contextLabel={
        sectionFormsPath && sectionContext?.ok
          ? sectionLabel(course.code, sectionContext.section.title)
          : canManageDelivery
            ? course.code
            : undefined
      }
      breadcrumbs={
        sectionFormsPath && sectionContext?.ok ? (
          <Breadcrumbs
            items={[
              {
                href: sectionFormsPath,
                label: sectionLabel(course.code, sectionContext.section.title),
              },
              { label: detail.template.title },
            ]}
          />
        ) : canManageDelivery ? (
          <Breadcrumbs
            items={[
              { href: "/teach/courses", label: "My courses" },
              { href: `/teach/courses/${courseId}`, label: course.code },
              { label: detail.template.title },
            ]}
          />
        ) : undefined
      }
      nested
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
        {!canManageDelivery && (
          <Alert variant="info" title="Definition access only">
            You can edit this form&apos;s questions. Delivery settings and
            occurrences are managed by a course instructor.
          </Alert>
        )}

        {canManageDelivery && (
          <>
            <section className="notice">
              <div className="notice__head">
                <div>
                  <h2 className="panel-title">Occurrences</h2>
                </div>
                {delivery && <Stamp tone="green">{scheduleSummary}</Stamp>}
              </div>
              {instances.length === 0 ? (
                <div className="notice__body">
                  <EmptyState title="Nothing sent yet">
                    {delivery
                      ? "The first one appears here as soon as its opening date is within two weeks."
                      : "Set a schedule below to send this form."}
                  </EmptyState>
                </div>
              ) : (
                <div className="table-scroll table-scroll--flush">
                  <table className="data-table">
                    <colgroup>
                      <col className="w-[18%]" />
                      <col className="w-[16%]" />
                      <col className="w-[34%]" />
                      <col className="w-[16%]" />
                      <col className="w-[10%]" />
                      <col className="w-11" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">Occurrence</th>
                        <th scope="col">Audience</th>
                        <th scope="col">Window</th>
                        <th scope="col">Status</th>
                        <th scope="col" className="num">
                          Responses
                        </th>
                        <th scope="col">
                          <span className="visually-hidden">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {instances.map((row, index) => {
                        const timezone =
                          row.audienceSections[0]?.timezone ?? "Asia/Manila";
                        return (
                          <tr key={row.instance.id}>
                            <th scope="row">
                              {row.label}
                            </th>
                            <td>
                              {audienceSummary(row)}
                            </td>
                            <td>
                              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                                {formatDate(row.instance.openAt, timezone)}
                                <span aria-hidden="true">–</span>
                                <span className="visually-hidden">to</span>
                                {formatDate(row.instance.deadlineAt, timezone)}
                              </span>
                            </td>
                            <td>
                              <CycleStateBadge state={row.instance.state} />
                            </td>
                            <td className="num">
                              {row.responseCount}
                            </td>
                            <td className="actions">
                              <OccurrenceActions
                                label={row.label}
                                instanceId={row.instance.id}
                                dropUp={index >= instances.length - 2}
                                actions={occurrenceActions({
                                  row,
                                  courseId,
                                  formId,
                                  instanceAction,
                                })}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

            </section>

            <section className="notice">
              <div className="notice__head">
                <div>
                  {/* Declarative, like the numbered steps on the new-form page. This page
                  is NOT numbered, deliberately: its panels are independent, each
                  with its own save action, so they are not steps in a sequence
                  and numbering them would promise an order that does not
                  exist. */}
                  <h2 className="panel-title">Audience and schedule</h2>
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
                    defaultEndDate={effectiveEndDate}
                    defaultIntervalWeeks={delivery?.schedule.intervalWeeks ?? 2}
                  />
                  <div className="row justify-end">
                    <Button variant="secondary" type="reset">
                      Cancel
                    </Button>
                    <SubmitButton variant="primary" pendingLabel="Saving…">
                      Save changes
                    </SubmitButton>
                  </div>
                </form>
              </div>
              {delivery?.schedule.active && (
                <div className="notice__foot">
                  <Dialog
                    variant="danger"
                    size="small"
                    label="Stop sending new ones"
                    title="Stop sending new occurrences?"
                    description="Nothing new will be generated. Occurrences already sent are unchanged."
                  >
                    <form action={stopDelivery}>
                      <input
                        type="hidden"
                        name="scheduleId"
                        value={delivery.schedule.id}
                      />
                      <div className="row">
                        <SubmitButton
                          variant="danger"
                          pendingLabel="Stopping…"
                        >
                          Stop sending new ones
                        </SubmitButton>
                      </div>
                    </form>
                  </Dialog>
                </div>
              )}
            </section>
          </>
        )}

        <section className="notice">
          <div className="notice__head">
            <div>
              <h2 className="panel-title">Questions</h2>
            </div>
            {!editingQuestions && (
              <Link
                className={buttonClass({ variant: "secondary", size: "small" })}
                href={`/teach/courses/${courseId}/forms/${formId}?edit=questions${
                  safeSectionId ? `&sectionId=${safeSectionId}` : ""
                }`}
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

type OccurrenceRow = Awaited<
  ReturnType<typeof listInstancesForTemplate>
>[number];

function audienceSummary(row: OccurrenceRow): string {
  if (row.audienceSections.length === 0) {
    return row.audienceHasHiddenSections ? "Other sections" : "—";
  }
  if (row.audienceSections.length === 1) {
    return `${row.audienceSections[0]!.title}${
      row.audienceHasHiddenSections ? " and others" : ""
    }`;
  }
  return `${row.audienceSections.length} sections${
    row.audienceHasHiddenSections ? " and others" : ""
  }`;
}

function occurrenceActions({
  row,
  courseId,
  formId,
  instanceAction,
}: {
  row: OccurrenceRow;
  courseId: string;
  formId: string;
  instanceAction: (formData: FormData) => void | Promise<void>;
}): import("@/components/staff/occurrence-actions").OccurrenceAction[] {
  const actions: import("@/components/staff/occurrence-actions").OccurrenceAction[] = [
    {
      kind: "link",
      label: "View occurrence",
      href: `/teach/courses/${courseId}/forms/${formId}/instances/${row.instance.id}`,
    },
  ];

  if (!row.editLocked) {
    actions.push({
      kind: "link",
      label: "Customize",
      href: `/teach/courses/${courseId}/forms/${formId}/instances/${row.instance.id}`,
    });
  }

  if (row.instance.state === "draft" || row.instance.state === "scheduled") {
    actions.push({
      kind: "submit",
      label: "Open now",
      intent: "open",
      pendingLabel: "Opening…",
      action: instanceAction,
    });
  }

  if (row.instance.state === "open") {
    actions.push({
      kind: "confirm",
      label: "Close now",
      intent: "close",
      action: instanceAction,
      title: `Close ${row.label}?`,
      description:
        "Answers already in are locked. Students cannot submit or edit after this.",
      submitLabel: `Close ${row.label}`,
      pendingLabel: "Closing…",
      variant: "danger",
    });
  }

  if (row.instance.state === "scheduled") {
    actions.push({
      kind: "confirm",
      label: "Skip",
      intent: "skip",
      action: instanceAction,
      title: `Skip ${row.label}?`,
      description:
        "Nothing opens. You can restore it later; the other occurrences are not affected.",
      submitLabel: `Skip ${row.label}`,
      pendingLabel: "Skipping…",
      variant: "danger",
    });
  }

  if (row.instance.state === "skipped") {
    actions.push({
      kind: "submit",
      label: "Restore",
      intent: "restore",
      pendingLabel: "Restoring…",
      action: instanceAction,
    });
  }

  return actions;
}

/**
 * Existing count-bounded schedules predate the end-date editor. Show and submit
 * the equivalent final opening date so saving the polished form does not turn a
 * finite schedule into an indefinite one by accident.
 */
function migratedEndDate(schedule: {
  endDate: string | null;
  occurrenceCount: number | null;
  startDate: string | null;
  openDayOfWeek: number | null;
  intervalWeeks: number;
}): string {
  if (schedule.endDate || !schedule.occurrenceCount || !schedule.startDate) {
    return schedule.endDate ?? "";
  }
  if (schedule.openDayOfWeek === null) return "";

  const start = parseDate(schedule.startDate);
  const firstOffset =
    (schedule.openDayOfWeek - dayOfWeek(start.y, start.mo, start.d) + 7) % 7;
  const first = addDays(start.y, start.mo, start.d, firstOffset);
  const last = addDays(
    first.y,
    first.mo,
    first.d,
    (schedule.occurrenceCount - 1) * schedule.intervalWeeks * 7,
  );
  return [last.y, String(last.mo).padStart(2, "0"), String(last.d).padStart(2, "0")].join(
    "-",
  );
}

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
  if (
    schedule.deliveryMode === "manual" ||
    schedule.deliveryMode === "one_time"
  ) {
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

function withSectionContext(url: string, sectionId?: string): string {
  return sectionId ? `${url}&sectionId=${encodeURIComponent(sectionId)}` : url;
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
