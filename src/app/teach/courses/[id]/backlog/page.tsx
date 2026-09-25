import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { classSections, courses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SafeRichText } from "@/components/rich-text";
import { AppShell } from "@/components/layout/app-shell";
import { courseSubtitle } from "@/components/staff/course-heading";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import { formatDateTime } from "@/lib/datetime";
import { requireUser, toShellUser } from "@/lib/session";
import { FilterMenu, type FilterGroup } from "@/components/ui/filter-menu";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { Button, buttonClass } from "@/components/ui/button";
import { Choice, Field, Select, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  AccessDenied,
  Alert,
  ArchivedNotice,
  CategoryFlair,
  EmptyState,
  Stamp,
} from "@/components/ui";
import {
  IconBack,
  IconChevron,
  IconEdit,
  IconPlus,
  IconSearch,
} from "@/components/ui/icons";
import {
  AnonymityCheckRequired,
  archivePublicAnswer,
  cancelScheduledPublication,
  publishNow,
  rewordPublicQuestion,
  schedulePublication,
  submitPublicAnswerForApproval,
  updateAnswerBody,
} from "@/modules/publishing";
import { AuthzError, getCourseCapabilities } from "@/modules/authz";
import { resolveCourseTimezone } from "@/modules/catalog";
import { zonedTimeToUtc } from "@/modules/forms/timezone";
import {
  createManualBacklogQuestion,
  draftFromBacklog,
  importLegacyEntries,
  listQuestionBacklog,
  setBacklogCategory,
  setBacklogState,
  type QuestionBacklogCategory,
  type QuestionBacklogReadItem,
} from "@/modules/backlog";
import {
  QuestionBacklogEditor,
  type QuestionBacklogEditState,
} from "@/components/staff/question-backlog-editor";

type StatusFilter = "all" | "imported" | "drafting" | "scheduled";
type CategoryFilter = "all" | "content" | "logistics" | "misc";
type SortOrder = "newest" | "oldest";
type BacklogItem = QuestionBacklogReadItem;
type ActiveStatus = Exclude<BacklogItem["status"], "archived">;
type ActiveBacklogItem = BacklogItem & { status: ActiveStatus };
type QueueItem = Extract<BacklogItem, { kind: "answer" }>["publication"];
type BacklogQuestion = Extract<BacklogItem, { kind: "question" }>["question"];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "imported", label: "Imported" },
  { key: "drafting", label: "Drafting" },
  { key: "scheduled", label: "Scheduled" },
];

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "All categories" },
  { key: "content", label: "Content" },
  { key: "logistics", label: "Logistics" },
  { key: "misc", label: "Other" },
];

const CATEGORY_OPTIONS: {
  value: QuestionBacklogCategory;
  label: string;
}[] = [
  { value: "content", label: "Content" },
  { value: "logistics", label: "Logistics" },
  { value: "misc", label: "Other" },
];

/**
 * Question Backlog is the course-owned editorial workspace. PublicAnswer and
 * BacklogQuestion remain separate domain records, but staff experience one
 * list: questions enter here, become drafts, and leave for Class Q&A only when
 * published.
 */
export default async function QuestionBacklogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    ok?: string;
    error?: string;
    warn?: string;
    q?: string;
    status?: string;
    category?: string;
    sort?: string;
    selected?: string;
    edit?: string;
  }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const path = `/teach/courses/${courseId}/backlog`;
  const query = await searchParams;
  const status = parseStatus(query.status);
  const category = parseCategory(query.category);
  const sort = parseSort(query.sort);
  const search = query.q?.trim() ?? "";
  const requestedEdit =
    query.edit === "question" || query.edit === "answer" ? query.edit : null;
  const href = (
    values: {
      status?: StatusFilter;
      category?: CategoryFilter;
      sort?: SortOrder;
      selected?: string;
      edit?: "question" | "answer";
      clearSelection?: boolean;
    } = {},
  ) =>
    queueHref(courseId, {
      q: search || undefined,
      status,
      category,
      sort,
      selected: query.selected,
      ...values,
    });

  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!course) throw new Error("Course not found");

  const terms = [
    ...new Set(
      (
        await db
          .select({ term: classSections.term })
          .from(classSections)
          .where(eq(classSections.courseId, courseId))
      ).map((row) => row.term),
    ),
  ];

  const timezone = await resolveCourseTimezone(courseId);
  const capabilities = await getCourseCapabilities(db, user.id, courseId);
  const can = (
    permission:
      | "draftPublicAnswers"
      | "rewordPublicQuestions"
      | "publishPublicAnswers"
      | "schedulePublication"
      | "manageBacklogImports",
  ) => Boolean(capabilities?.permissions[permission] && !capabilities.archived);

  const canManageBacklog = can("manageBacklogImports");

  let backlog: Awaited<ReturnType<typeof listQuestionBacklog>>;
  try {
    backlog = await listQuestionBacklog(user.id, courseId);
  } catch (err) {
    if (!(err instanceof AuthzError)) throw err;
    return (
      <AppShell
        user={toShellUser(user)}
        workspace="staff"
        navGroups={await primaryNavFor(user, path)}
        title="Question Backlog"
      >
        <AccessDenied what="this course's question backlog" />
      </AppShell>
    );
  }

  async function addQuestion(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const rawCategory = String(formData.get("category") ?? "");
    const category = ["content", "logistics", "misc"].includes(rawCategory)
      ? (rawCategory as "content" | "logistics" | "misc")
      : undefined;
    try {
      await createManualBacklogQuestion(uid, courseId, {
        text: String(formData.get("question") ?? ""),
        internalNote: String(formData.get("internalNote") ?? ""),
        category,
      });
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(path);
    redirect(backTo(courseId, "Question added to the backlog."));
  }

  async function importLegacy(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const lines = String(formData.get("entries") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      redirect(
        backTo(courseId, "Add at least one question to import.", "error"),
      );
    }
    let summary: string;
    try {
      const result = await importLegacyEntries(
        uid,
        courseId,
        lines.map((text) => ({ text })),
        String(formData.get("source") || "pasted legacy questions"),
      );
      summary = `${result.created.length} question(s) imported anonymously${
        result.errors.length > 0 ? `, ${result.errors.length} skipped` : ""
      }.`;
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(path);
    redirect(backTo(courseId, summary));
  }

  async function setCategory(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const kind = String(formData.get("targetKind") ?? "");
    const id = String(formData.get("targetId") ?? "");
    const rawCategory = String(formData.get("category") ?? "");
    if (
      (kind !== "question" && kind !== "answer") ||
      !id ||
      !CATEGORY_OPTIONS.some((option) => option.value === rawCategory)
    ) {
      redirect(backTo(courseId, "Choose a valid category.", "error"));
    }
    try {
      await setBacklogCategory(
        uid,
        { kind, id } as { kind: "question" | "answer"; id: string },
        rawCategory as QuestionBacklogCategory,
      );
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(path);
    revalidatePath(`/courses/${courseId}/qa`);
    redirect(
      queueHref(courseId, {
        q: search || undefined,
        status,
        category,
        sort,
        selected: id,
        ok: "Category updated.",
      }),
    );
  }

  async function draftBacklogAnswer(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const questionId = String(formData.get("questionId") ?? "");
    let answer;
    try {
      answer = await draftFromBacklog(uid, questionId);
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(path);
    redirect(queueHref(courseId, { selected: answer.id }));
  }

  async function saveDraft(
    _previousState: QuestionBacklogEditState,
    formData: FormData,
  ): Promise<QuestionBacklogEditState> {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const answerId = String(formData.get("answerId") ?? "");
    const mode = String(formData.get("editMode") ?? "");
    const question = String(formData.get("publicQuestion") ?? "").trim();
    const body = String(formData.get("answerBody") ?? "").trim();
    if (mode === "question" && !question) {
      return { error: "Enter a public question." };
    }
    if (mode !== "question" && mode !== "answer") {
      return { error: "Choose one field to edit." };
    }
    try {
      if (mode === "question") {
        await rewordPublicQuestion(uid, answerId, question);
      } else {
        await updateAnswerBody(uid, answerId, body);
      }
    } catch (err) {
      return { error: describe(err) };
    }
    revalidatePath(path);
    revalidatePath(`/courses/${courseId}/qa`);
    redirect(queueHref(courseId, { selected: answerId }));
  }

  async function publish(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const answerId = String(formData.get("answerId") ?? "");
    try {
      await publishNow(uid, answerId, {
        anonymityAcknowledged: formData.get("acknowledged") === "yes",
      });
    } catch (err) {
      if (err instanceof AnonymityCheckRequired) {
        redirect(
          queueHref(courseId, {
            selected: answerId,
            warn: err.warnings.join(" | "),
          }),
        );
      }
      redirect(
        queueHref(courseId, { selected: answerId, error: describe(err) }),
      );
    }
    revalidatePath(path);
    revalidatePath(`/courses/${courseId}/qa`);
    redirect(
      queueHref(courseId, {
        selected: answerId,
        ok: "Published to Class Q&A without the asker's name.",
      }),
    );
  }

  async function submitForApproval(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const answerId = String(formData.get("answerId") ?? "");
    try {
      await submitPublicAnswerForApproval(uid, answerId);
    } catch (err) {
      redirect(
        queueHref(courseId, { selected: answerId, error: describe(err) }),
      );
    }
    revalidatePath(path);
    redirect(
      queueHref(courseId, {
        selected: answerId,
        ok: "Submitted for Instructor approval.",
      }),
    );
  }

  async function schedule(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const answerId = String(formData.get("answerId") ?? "");
    const when = String(formData.get("scheduledAt") ?? "");
    if (!when) {
      redirect(
        queueHref(courseId, {
          selected: answerId,
          error: "Pick a date and time to schedule.",
        }),
      );
    }
    try {
      await schedulePublication(
        uid,
        answerId,
        parseLocalToUtc(when, timezone),
        {
          anonymityAcknowledged: formData.get("acknowledged") === "yes",
        },
      );
    } catch (err) {
      if (err instanceof AnonymityCheckRequired) {
        redirect(
          queueHref(courseId, {
            selected: answerId,
            warn: err.warnings.join(" | "),
          }),
        );
      }
      redirect(
        queueHref(courseId, { selected: answerId, error: describe(err) }),
      );
    }
    revalidatePath(path);
    revalidatePath(`/courses/${courseId}/qa`);
    redirect(
      queueHref(courseId, {
        selected: answerId,
        ok: `Scheduled for ${formatDateTime(parseLocalToUtc(when, timezone), timezone)}. It will publish automatically.`,
      }),
    );
  }

  async function cancel(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const answerId = String(formData.get("answerId") ?? "");
    try {
      await cancelScheduledPublication(uid, answerId);
    } catch (err) {
      redirect(
        queueHref(courseId, { selected: answerId, error: describe(err) }),
      );
    }
    revalidatePath(path);
    revalidatePath(`/courses/${courseId}/qa`);
    redirect(
      queueHref(courseId, {
        selected: answerId,
        ok: "Schedule cancelled. This answer is a draft again.",
      }),
    );
  }

  async function removeBacklogItem(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const kind = String(formData.get("targetKind") ?? "");
    const id = String(formData.get("targetId") ?? "");
    if ((kind !== "question" && kind !== "answer") || !id) {
      redirect(
        backTo(courseId, "That backlog item could not be removed.", "error"),
      );
    }
    try {
      if (kind === "answer") {
        await archivePublicAnswer(uid, id);
      } else {
        await setBacklogState(uid, id, "archived");
      }
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(path);
    redirect(backTo(courseId, "Removed from the Question Backlog."));
  }

  const filtered = backlog.items
    .filter(
      (item): item is ActiveBacklogItem =>
        item.status !== "archived" &&
        (status === "all" || item.status === status),
    )
    .filter((item) => category === "all" || itemCategory(item) === category)
    .filter((item) => matchesBacklogItem(item, search));
  const visibleItems = sort === "oldest" ? [...filtered].reverse() : filtered;
  const selected = visibleItems.find((item) =>
    matchesBacklogSelection(item, query.selected),
  );
  const detailItem = selected ?? visibleItems[0];
  const hasExplicitSelection = Boolean(query.selected && selected);
  const edit =
    query.selected &&
    detailItem &&
    matchesBacklogSelection(detailItem, query.selected)
      ? requestedEdit
      : null;
  const hasFilters = Boolean(search || status !== "all" || category !== "all");

  const filterGroups: FilterGroup[] = [
    {
      name: "Category",
      current: category,
      defaultKey: "all",
      options: CATEGORY_FILTERS.map((item) => ({
        key: item.key,
        label: item.label,
        href: href({
          category: item.key,
          clearSelection: true,
        }),
      })),
    },
  ];

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, path, {
        fallbackHref: `/teach/courses/${course.id}`,
      })}
      tabGroups={await courseTabGroupsFor(user.id, courseId, path)}
      tabsLabel={course.code}
      tabsMode="menu"
      contextLabel={course.code}
      crumbs={[
        { href: "/teach/courses", label: "My courses" },
        { href: `/teach/courses/${course.id}`, label: course.code },
      ]}
      title={course.code}
      description={courseSubtitle({ terms })}
    >
      <div className="backlog-workspace">
        {capabilities?.archived && <ArchivedNotice courseCode={course.code} />}
        {query.ok && <Alert variant="success">{query.ok}</Alert>}
        {query.error && <Alert variant="error">{query.error}</Alert>}
        {query.warn && (
          <Alert variant="warning" title="Check the wording before publishing">
            <ul>
              {query.warn.split(" | ").map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
            Tick the acknowledgment to publish anyway.
          </Alert>
        )}
        {backlog.failed.length > 0 && (
          <Alert
            variant="error"
            title="A scheduled publication needs attention"
          >
            It was not published and remains in Question Backlog. Open it to
            review the failure and retry or reschedule it.
          </Alert>
        )}

        <div className="backlog-toolbar">
          <form className="backlog-search" method="get" action={path}>
            <IconSearch className="backlog-search__icon" size={16} />
            <label className="visually-hidden" htmlFor="backlog-search">
              Search questions
            </label>
            <input
              id="backlog-search"
              name="q"
              type="search"
              defaultValue={search}
              placeholder="Search questions…"
            />
            {status !== "all" && (
              <input type="hidden" name="status" value={status} />
            )}
            {category !== "all" && (
              <input type="hidden" name="category" value={category} />
            )}
            {sort !== "newest" && (
              <input type="hidden" name="sort" value={sort} />
            )}
          </form>
          <FilterMenu groups={filterGroups} />
          {canManageBacklog && <AddQuestionDialog action={addQuestion} />}
          {canManageBacklog && <ImportQuestionsDialog action={importLegacy} />}
        </div>

        <div className="backlog-controls" aria-label="Backlog status filters">
          <div className="backlog-statuses">
            {STATUS_FILTERS.map((item) => {
              const selectedFilter = item.key === status;
              return (
                <Link
                  className={`backlog-status${selectedFilter ? " backlog-status--active" : ""}`}
                  href={href({ status: item.key, clearSelection: true })}
                  aria-current={selectedFilter ? "page" : undefined}
                  key={item.key}
                >
                  {item.label}
                  <span className="backlog-status__count">
                    {backlog.counts[item.key]}
                  </span>
                </Link>
              );
            })}
          </div>
          <details className="backlog-sort">
            <summary>
              {sort === "newest" ? "Newest first" : "Oldest first"}
              <IconChevron size={13} aria-hidden="true" />
            </summary>
            <div className="backlog-sort__menu">
              {(["newest", "oldest"] as SortOrder[]).map((option) => (
                <Link
                  className={sort === option ? "backlog-sort__active" : ""}
                  href={href({ sort: option })}
                  key={option}
                >
                  {option === "newest" ? "Newest first" : "Oldest first"}
                </Link>
              ))}
            </div>
          </details>
        </div>

        <div
          className={`backlog-layout${hasExplicitSelection ? " backlog-layout--selected" : ""}`}
        >
          <aside
            className="backlog-list-pane"
            aria-label="Question backlog list"
          >
            {visibleItems.length === 0 ? (
              backlog.total === 0 && !hasFilters ? (
                <EmptyState title="No questions in the backlog yet.">
                  {canManageBacklog
                    ? "Add a question or import historical questions to start the course backlog."
                    : "There are no questions ready for your permitted backlog work."}
                  {canManageBacklog && (
                    <div className="backlog-empty-actions">
                      <AddQuestionDialog action={addQuestion} />
                      <ImportQuestionsDialog action={importLegacy} />
                    </div>
                  )}
                </EmptyState>
              ) : (
                <EmptyState
                  title="Nothing matches these filters."
                  action={{ href: path, label: "Clear filters" }}
                />
              )
            ) : (
              <div className="backlog-list">
                {visibleItems.map((item) => (
                  <BacklogRow
                    key={item.key}
                    item={item}
                    href={href({ selected: item.key })}
                    selected={detailItem?.key === item.key}
                  />
                ))}
              </div>
            )}
          </aside>

          <section
            className="backlog-detail-pane"
            aria-label="Selected question"
          >
            {detailItem && (
              <Link
                className="backlog-detail__mobile-back"
                href={href({ clearSelection: true })}
              >
                <IconBack size={15} />
                Back to Question Backlog
              </Link>
            )}
            {detailItem?.kind === "answer" ? (
              <EditorialAnswerCard
                item={detailItem.publication}
                workflowStatus={detailItem.status}
                timezone={timezone}
                courseId={courseId}
                edit={edit}
                canDraft={can("draftPublicAnswers")}
                canReword={can("rewordPublicQuestions")}
                canPublish={can("publishPublicAnswers")}
                canSchedule={can("schedulePublication")}
                canManageBacklog={canManageBacklog}
                viewerIsInstructor={capabilities?.isInstructor ?? false}
                setCategory={setCategory}
                saveDraft={saveDraft}
                submitForApproval={submitForApproval}
                publish={publish}
                schedule={schedule}
                cancel={cancel}
                remove={removeBacklogItem}
              />
            ) : detailItem?.kind === "question" ? (
              <BacklogQuestionCard
                question={detailItem.question}
                workflowStatus={detailItem.status}
                canManage={canManageBacklog}
                canDraft={can("draftPublicAnswers")}
                setCategory={setCategory}
                draftAnswer={draftBacklogAnswer}
                remove={removeBacklogItem}
              />
            ) : backlog.total === 0 && !hasFilters ? (
              <EmptyState title="Nothing in the backlog.">
                Select a question or add a new one to begin drafting a public
                answer.
              </EmptyState>
            ) : (
              <EmptyState title="Nothing selected." />
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function EditorialAnswerCard({
  item,
  workflowStatus,
  timezone,
  courseId,
  edit,
  canDraft,
  canReword,
  canPublish,
  canSchedule,
  canManageBacklog,
  viewerIsInstructor,
  setCategory,
  saveDraft,
  submitForApproval,
  publish,
  schedule,
  cancel,
  remove,
}: {
  item: QueueItem;
  workflowStatus: Exclude<StatusFilter, "all">;
  timezone: string;
  courseId: string;
  edit: "question" | "answer" | null;
  canDraft: boolean;
  canReword: boolean;
  canPublish: boolean;
  canSchedule: boolean;
  canManageBacklog: boolean;
  viewerIsInstructor: boolean;
  setCategory: (formData: FormData) => void | Promise<void>;
  saveDraft: (
    previousState: QuestionBacklogEditState,
    formData: FormData,
  ) => Promise<QuestionBacklogEditState>;
  submitForApproval: (formData: FormData) => void | Promise<void>;
  publish: (formData: FormData) => void | Promise<void>;
  schedule: (formData: FormData) => void | Promise<void>;
  cancel: (formData: FormData) => void | Promise<void>;
  remove: (formData: FormData) => void | Promise<void>;
}) {
  const answer = item.answer;
  const canEditQuestion = canReword && answer.state === "draft";
  const canEditAnswer = canDraft && answer.state === "draft";
  const inEditMode = Boolean(
    edit &&
    ((edit === "question" && canEditQuestion) ||
      (edit === "answer" && canEditAnswer)),
  );
  const hasAnswerBody = Boolean(answer.answerBody?.trim());
  const readyToPublish = answer.state === "draft" && hasAnswerBody;
  const requiresInstructorApproval =
    !item.creatorIsInstructor && !answer.approvedAt;
  const canApprove = viewerIsInstructor && requiresInstructorApproval;
  const approvalAllowsAction =
    !requiresInstructorApproval || canApprove;
  const canSubmitForApproval =
    !viewerIsInstructor &&
    requiresInstructorApproval &&
    canDraft &&
    readyToPublish;
  const publishableState =
    answer.state === "draft" ||
    answer.state === "awaiting_approval" ||
    (answer.state === "scheduled" && answer.publishFailed);
  const schedulableState =
    answer.state === "draft" ||
    answer.state === "awaiting_approval" ||
    answer.state === "scheduled";
  const canPublishNow =
    canPublish &&
    approvalAllowsAction &&
    hasAnswerBody &&
    publishableState;
  const canScheduleNow =
    canSchedule &&
    approvalAllowsAction &&
    hasAnswerBody &&
    schedulableState;
  const canRemove = canManageBacklog;
  const canCancelSchedule = answer.state === "scheduled" && canSchedule;
  const showScheduleAction = canScheduleNow || canCancelSchedule;
  const showFooter =
    canRemove ||
    showScheduleAction ||
    canPublishNow ||
    canSubmitForApproval;

  return (
    <article
      className="backlog-card"
      aria-labelledby={`backlog-title-${answer.id}`}
    >
      <header className="backlog-card__header">
        <h2 id={`backlog-title-${answer.id}`}>{answer.publicQuestionText}</h2>
        <div className="backlog-card__stamps">
          <BacklogStatusStamp status={workflowStatus} />
          {canManageBacklog ? (
            <BacklogCategoryControl
              action={setCategory}
              itemId={answer.id}
              itemKind="answer"
              value={answer.category}
            />
          ) : (
            <CategoryFlair value={answer.category} />
          )}
        </div>
      </header>

      {answer.publishFailed && answer.publishFailureReason && (
        <Alert variant="error" title="Publication failed">
          {answer.publishFailureReason}
        </Alert>
      )}

      <div className="backlog-card__content">
        <section className="backlog-editorial-region backlog-editorial-region--public">
          {edit === "question" && canEditQuestion ? (
            <QuestionBacklogEditor
              action={saveDraft}
              answerId={answer.id}
              mode="question"
              question={answer.publicQuestionText}
              answer={answer.answerBody ?? ""}
              cancelHref={queueHref(courseId, { selected: answer.id })}
            />
          ) : (
            <>
              <div className="backlog-editorial-region__header">
                <h3>Public question</h3>
                {canEditQuestion && (
                  <Link
                    className={buttonClass({
                      variant: "secondary",
                      size: "small",
                      className: "whitespace-nowrap",
                    })}
                    href={queueHref(courseId, {
                      selected: answer.id,
                      edit: "question",
                    })}
                  >
                    <IconEdit aria-hidden="true" size={14} />
                    Edit
                  </Link>
                )}
              </div>
              <SafeRichText
                source={answer.publicQuestionText}
                className="backlog-authored-text backlog-authored-text--question"
              />
            </>
          )}
        </section>

        <section className="backlog-editorial-region backlog-editorial-region--answer">
          {edit === "answer" && canEditAnswer ? (
            <QuestionBacklogEditor
              action={saveDraft}
              answerId={answer.id}
              mode="answer"
              question={answer.publicQuestionText}
              answer={answer.answerBody ?? ""}
              cancelHref={queueHref(courseId, { selected: answer.id })}
            />
          ) : (
            <>
              <div className="backlog-editorial-region__header">
                <h3>Draft answer</h3>
                {canEditAnswer && (
                  <Link
                    className={buttonClass({
                      variant: "secondary",
                      size: "small",
                      className: "whitespace-nowrap",
                    })}
                    href={queueHref(courseId, {
                      selected: answer.id,
                      edit: "answer",
                    })}
                  >
                    <IconEdit aria-hidden="true" size={14} />
                    Edit
                  </Link>
                )}
              </div>
              {answer.answerBody ? (
                <SafeRichText
                  source={answer.answerBody}
                  className="backlog-authored-text"
                />
              ) : (
                <p className="backlog-card__missing">No answer drafted yet.</p>
              )}
            </>
          )}
        </section>
      </div>

      {!inEditMode && showFooter && (
        <footer className="backlog-card__footer">
          <div className="backlog-card__actions">
          {showScheduleAction && (
            <div className="backlog-card__actions-left">
              {canScheduleNow && (
                <ScheduleDialog
                    answer={answer}
                    timezone={timezone}
                    action={schedule}
                    approving={canApprove}
                  />
                )}
              {canCancelSchedule && (
                <form action={cancel}>
                    <input type="hidden" name="answerId" value={answer.id} />
                    <SubmitButton variant="quiet" pendingLabel="Cancelling…">
                      Cancel schedule
                    </SubmitButton>
                  </form>
                )}
              </div>
            )}
            <div className="backlog-card__actions-right">
              {canRemove && (
                <RemoveBacklogItemDialog
                  action={remove}
                  targetKind="answer"
                  targetId={answer.id}
                />
              )}
              {canSubmitForApproval && (
                <form action={submitForApproval}>
                  <input type="hidden" name="answerId" value={answer.id} />
                  <SubmitButton variant="secondary" pendingLabel="Submitting…">
                    Submit for approval
                  </SubmitButton>
                </form>
              )}
              {canPublishNow && (
                <PublishDialog
                  answerId={answer.id}
                  action={publish}
                  approving={canApprove}
                />
              )}
            </div>
          </div>
        </footer>
      )}
    </article>
  );
}

function BacklogRow({
  item,
  href,
  selected,
}: {
  item: ActiveBacklogItem;
  href: string;
  selected: boolean;
}) {
  const category =
    item.kind === "answer"
      ? item.publication.answer.category
      : item.question.category;
  const title =
    item.kind === "answer"
      ? item.publication.answer.publicQuestionText
      : item.question.text;
  return (
    <Link
      className={`backlog-row${selected ? " backlog-row--selected" : ""}`}
      href={href}
      aria-current={selected ? "page" : undefined}
    >
      <strong className="backlog-row__title">{title}</strong>
      <span className="backlog-row__stamps">
        <BacklogStatusStamp status={item.status} />
        <CategoryFlair value={category} />
      </span>
      <span className="backlog-row__chevron" aria-hidden="true">
        <IconChevron size={16} />
      </span>
    </Link>
  );
}

function BacklogCategoryControl({
  action,
  itemId,
  itemKind,
  value,
}: {
  action: (formData: FormData) => void | Promise<void>;
  itemId: string;
  itemKind: "question" | "answer";
  value: string | null | undefined;
}) {
  return (
    <form className="backlog-category-form" action={action}>
      <input type="hidden" name="targetKind" value={itemKind} />
      <input type="hidden" name="targetId" value={itemId} />
      <AutoSubmitSelect
        id={`backlog-category-${itemKind}-${itemId}`}
        name="category"
        defaultValue={value ?? ""}
        label="Category"
        className="backlog-category-select"
      >
        {!value && (
          <option value="" disabled>
            Set category
          </option>
        )}
        {CATEGORY_OPTIONS.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </AutoSubmitSelect>
    </form>
  );
}

function BacklogQuestionCard({
  question,
  workflowStatus,
  canManage,
  canDraft,
  setCategory,
  draftAnswer,
  remove,
}: {
  question: BacklogQuestion;
  workflowStatus: ActiveStatus;
  canManage: boolean;
  canDraft: boolean;
  setCategory: (formData: FormData) => void | Promise<void>;
  draftAnswer: (formData: FormData) => void | Promise<void>;
  remove: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <article
      className="backlog-card"
      aria-labelledby={`backlog-question-${question.id}`}
    >
      <header className="backlog-card__header">
        <h2 id={`backlog-question-${question.id}`}>{question.text}</h2>
        <div className="backlog-card__stamps">
          <BacklogStatusStamp status={workflowStatus} />
          {canManage ? (
            <BacklogCategoryControl
              action={setCategory}
              itemId={question.id}
              itemKind="question"
              value={question.category}
            />
          ) : (
            <CategoryFlair value={question.category} />
          )}
        </div>
      </header>
      <div className="backlog-card__content">
        <section className="backlog-editorial-region backlog-editorial-region--public">
          <div className="backlog-editorial-region__header">
            <h3>Public question</h3>
          </div>
          <p className="backlog-authored-text backlog-authored-text--question">
            {question.text}
          </p>
        </section>
        <section className="backlog-editorial-region backlog-editorial-region--answer">
          <h3>Draft answer</h3>
          <p className="backlog-card__missing">No answer drafted yet.</p>
        </section>
      </div>
      {(canManage ||
        (canDraft &&
          ["needs_review", "answerable", "drafting"].includes(
            question.state,
          ))) && (
          <footer className="backlog-card__footer">
            <div className="backlog-card__actions">
              <div className="backlog-card__actions-right">
                {canManage && (
                  <RemoveBacklogItemDialog
                    action={remove}
                    targetKind="question"
                    targetId={question.id}
                  />
                )}
                {canDraft &&
                  ["needs_review", "answerable", "drafting"].includes(
                    question.state,
                  ) && (
                    <form action={draftAnswer}>
                      <input
                        type="hidden"
                        name="questionId"
                        value={question.id}
                      />
                      <SubmitButton variant="primary" pendingLabel="Drafting…">
                        Start drafting
                      </SubmitButton>
                    </form>
                  )}
              </div>
            </div>
          </footer>
        )}
    </article>
  );
}

function RemoveBacklogItemDialog({
  action,
  targetKind,
  targetId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  targetKind: "question" | "answer";
  targetId: string;
}) {
  return (
    <Dialog
      label="Remove"
      title="Remove this question from the backlog?"
      variant="danger"
    >
      <form action={action}>
        <input type="hidden" name="targetKind" value={targetKind} />
        <input type="hidden" name="targetId" value={targetId} />
        <div className="backlog-confirm__actions">
          <Button variant="quiet" data-dialog-close>
            Cancel
          </Button>
          <SubmitButton variant="danger" pendingLabel="Removing…">
            Remove
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

function AddQuestionDialog({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Dialog
      label={
        <>
          <IconPlus size={15} aria-hidden="true" />
          Add question
        </>
      }
      title="Add a question"
      description="Add a staff-curated question to the course backlog."
      variant="primary"
    >
      <form action={action}>
        <label htmlFor="manual-backlog-question">Question</label>
        <Textarea
          id="manual-backlog-question"
          name="question"
          rows={4}
          placeholder="What should the teaching team answer?"
          required
          data-autofocus
        />
        <label htmlFor="manual-backlog-category">Category</label>
        <Select
          id="manual-backlog-category"
          name="category"
          defaultValue="misc"
        >
          <option value="content">Content</option>
          <option value="logistics">Logistics</option>
          <option value="misc">Other</option>
        </Select>
        <label htmlFor="manual-backlog-note">Internal note (optional)</label>
        <Textarea
          id="manual-backlog-note"
          name="internalNote"
          rows={3}
          placeholder="Context for the teaching team"
        />
        <div className="backlog-confirm__actions">
          <Button variant="quiet" data-dialog-close>
            Cancel
          </Button>
          <SubmitButton variant="primary" pendingLabel="Adding…">
            Add question
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

function ImportQuestionsDialog({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Dialog
      label="Import"
      title="Import questions"
      description="Paste one question per line. Imported questions stay anonymous by default."
      variant="secondary"
    >
      <form action={action}>
        <label htmlFor="legacy-entries">Questions</label>
        <Textarea
          id="legacy-entries"
          name="entries"
          rows={6}
          placeholder={
            "Why do we normalise database tables?\nWill the finals be cumulative?"
          }
          required
          data-autofocus
        />
        <label htmlFor="legacy-source">Source</label>
        <Field
          id="legacy-source"
          name="source"
          placeholder="AY2025-2 Q&A document"
        />
        <div className="backlog-confirm__actions">
          <Button variant="quiet" data-dialog-close>
            Cancel
          </Button>
          <SubmitButton variant="secondary" pendingLabel="Importing…">
            Import anonymously
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

function PublishDialog({
  answerId,
  action,
  approving = false,
}: {
  answerId: string;
  action: (formData: FormData) => void | Promise<void>;
  approving?: boolean;
}) {
  return (
    <Dialog
      label={approving ? "Approve and publish" : "Publish answer"}
      title={
        approving ? "Approve and publish this answer?" : "Publish this answer?"
      }
      variant="primary"
    >
      <form action={action}>
        <input type="hidden" name="answerId" value={answerId} />
        <Choice type="checkbox" name="acknowledged" value="yes">
          I have checked the public wording
        </Choice>
        <div className="backlog-confirm__actions">
          <Button variant="quiet" data-dialog-close>
            Cancel
          </Button>
          <SubmitButton variant="primary" pendingLabel="Publishing…">
            {approving ? "Approve and publish" : "Publish answer"}
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

function ScheduleDialog({
  answer,
  timezone,
  action,
  approving = false,
}: {
  answer: QueueItem["answer"];
  timezone: string;
  action: (formData: FormData) => void | Promise<void>;
  approving?: boolean;
}) {
  const rescheduling = answer.state === "scheduled";
  const label = rescheduling
    ? "Reschedule…"
    : approving
      ? "Approve and schedule…"
      : "Schedule…";
  return (
    <Dialog
      label={label}
      title={
        rescheduling
          ? "Reschedule this answer"
          : approving
            ? "Approve and schedule this answer"
            : "Schedule this answer"
      }
      variant="secondary"
    >
      <form action={action}>
        <input type="hidden" name="answerId" value={answer.id} />
        <label htmlFor={`schedule-${answer.id}`}>
          Publish at ({timezone})
        </label>
        <Field
          id={`schedule-${answer.id}`}
          type="datetime-local"
          name="scheduledAt"
          defaultValue={toDatetimeLocal(answer.scheduledAt, timezone)}
          required
          data-autofocus
        />
        <Choice type="checkbox" name="acknowledged" value="yes">
          I have checked the public wording
        </Choice>
        <div className="backlog-confirm__actions">
          <Button variant="quiet" data-dialog-close>
            Cancel
          </Button>
          <SubmitButton variant="secondary" pendingLabel="Scheduling…">
            {rescheduling
              ? "Reschedule"
              : approving
                ? "Approve and schedule"
                : "Schedule"}
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

const STATUS_PRESENTATION: Record<
  ActiveStatus,
  {
    label: string;
    tone: "green" | "amber" | "red" | "neutral";
  }
> = {
  imported: { label: "Imported", tone: "neutral" },
  drafting: { label: "Drafting", tone: "amber" },
  scheduled: { label: "Scheduled", tone: "green" },
};

function statusPresentation(status: ActiveStatus) {
  return STATUS_PRESENTATION[status];
}

function BacklogStatusStamp({ status }: { status: ActiveStatus }) {
  const presentation = statusPresentation(status);
  return (
    <Stamp tone={presentation.tone}>
      {presentation.label}
    </Stamp>
  );
}

function itemCategory(item: BacklogItem): Exclude<CategoryFilter, "all"> {
  return (
    (item.kind === "answer"
      ? item.publication.answer.category
      : item.question.category) ?? "misc"
  );
}

function matchesBacklogItem(item: BacklogItem, search: string) {
  if (!search) return true;
  const haystack =
    item.kind === "answer"
      ? [
          item.publication.answer.publicQuestionText,
          item.publication.answer.answerBody,
        ]
      : [item.question.text];
  return haystack
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(search.toLocaleLowerCase());
}

function matchesBacklogSelection(
  item: BacklogItem,
  selectedId: string | undefined,
) {
  if (!selectedId) return false;
  return (
    item.key === selectedId ||
    (item.kind === "answer" && item.publication.answer.id === selectedId) ||
    (item.kind === "question" && item.question.id === selectedId)
  );
}

/*
 * The page deliberately consumes the read model's status rather than deriving
 * a second state machine here. `listQuestionBacklog` maps imported → Imported,
 * all active preparation states (including approval outcomes) → Drafting,
 * scheduled → Scheduled. Archived and not-suitable records remain domain
 * history, but are not exposed as normal backlog UI states.
 */
function parseStatus(value: string | undefined): StatusFilter {
  // Keep old shared/bookmarked URLs useful without bringing retired vocabulary
  // back into the page.
  if (value === "needs-review" || value === "ready") return "drafting";
  return STATUS_FILTERS.some((item) => item.key === value)
    ? (value as StatusFilter)
    : "all";
}

function parseCategory(value: string | undefined): CategoryFilter {
  return CATEGORY_FILTERS.some((item) => item.key === value)
    ? (value as CategoryFilter)
    : "all";
}

function parseSort(value: string | undefined): SortOrder {
  return value === "oldest" ? "oldest" : "newest";
}

function queueHref(
  courseId: string,
  values: {
    status?: StatusFilter;
    category?: CategoryFilter;
    sort?: SortOrder;
    selected?: string;
    edit?: "question" | "answer";
    q?: string;
    ok?: string;
    error?: string;
    warn?: string;
    clearSelection?: boolean;
  } = {},
) {
  const params = new URLSearchParams();
  if (values.q) params.set("q", values.q);
  if (values.status && values.status !== "all") {
    params.set("status", values.status);
  }
  if (values.category && values.category !== "all") {
    params.set("category", values.category);
  }
  if (values.sort && values.sort !== "newest") {
    params.set("sort", values.sort);
  }
  if (values.selected && !values.clearSelection) {
    params.set("selected", values.selected);
  }
  if (values.edit) params.set("edit", values.edit);
  if (values.ok) params.set("ok", values.ok);
  if (values.error) params.set("error", values.error);
  if (values.warn) params.set("warn", values.warn);
  const query = params.toString();
  return `/teach/courses/${courseId}/backlog${query ? `?${query}` : ""}`;
}

function backTo(
  courseId: string,
  message: string,
  kind: "ok" | "error" = "ok",
): string {
  return `/teach/courses/${courseId}/backlog?${kind}=${encodeURIComponent(message)}`;
}

function describe(err: unknown): string {
  if (err instanceof AuthzError) return err.message;
  if (err instanceof Error) {
    console.error("[backlog] unmapped module error", err);
    return "That did not work. Nothing was changed.";
  }
  throw err;
}

function parseLocalToUtc(value: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value,
  );
  if (!match) return new Date(value);
  const [, year, month, day, hour, minute, second] = match;
  return zonedTimeToUtc(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? "0"),
    timeZone,
  );
}

function toDatetimeLocal(value: Date | null, timeZone: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
