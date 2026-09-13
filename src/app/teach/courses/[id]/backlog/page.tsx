import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SafeRichText } from "@/components/rich-text";
import { AppShell } from "@/components/layout/app-shell";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import { formatDateTime } from "@/lib/datetime";
import { requireUser, toShellUser } from "@/lib/session";
import { FilterMenu, type FilterGroup } from "@/components/ui/filter-menu";
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
import { IconBack, IconChevron, IconPlus, IconSearch } from "@/components/ui/icons";
import {
  AnonymityCheckRequired,
  archivePublicAnswer,
  cancelScheduledPublication,
  publishNow,
  rewordPublicQuestion,
  schedulePublication,
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
  setBacklogState,
  type QuestionBacklogReadItem,
} from "@/modules/backlog";
import {
  QuestionBacklogEditor,
  type QuestionBacklogEditState,
} from "@/components/staff/question-backlog-editor";

type StatusFilter =
  | "all"
  | "needs-review"
  | "drafting"
  | "ready"
  | "scheduled"
  | "archived";
type CategoryFilter = "all" | "content" | "logistics" | "misc";
type SortOrder = "newest" | "oldest";
type BacklogItem = QuestionBacklogReadItem;
type QueueItem = Extract<BacklogItem, { kind: "answer" }>["publication"];
type BacklogQuestion = Extract<BacklogItem, { kind: "question" }>["question"];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs-review", label: "Needs review" },
  { key: "drafting", label: "Drafting" },
  { key: "ready", label: "Ready to publish" },
  { key: "scheduled", label: "Scheduled" },
  { key: "archived", label: "Archived" },
];

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "All categories" },
  { key: "content", label: "Content" },
  { key: "logistics", label: "Logistics" },
  { key: "misc", label: "Other" },
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
  const href = (values: {
    status?: StatusFilter;
    category?: CategoryFilter;
    sort?: SortOrder;
    selected?: string;
    edit?: "question" | "answer";
    clearSelection?: boolean;
  } = {}) =>
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

  const timezone = await resolveCourseTimezone(courseId);
  const capabilities = await getCourseCapabilities(db, user.id, courseId);
  const can = (
    permission:
      | "draftPublicAnswers"
      | "rewordPublicQuestions"
      | "publishPublicAnswers"
      | "schedulePublication"
      | "manageBacklogImports",
  ) =>
    Boolean(capabilities?.permissions[permission] && !capabilities.archived);

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
      redirect(backTo(courseId, "Add at least one question to import.", "error"));
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
      await schedulePublication(uid, answerId, parseLocalToUtc(when, timezone), {
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

  async function archive(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const target = String(formData.get("target") ?? "");
    try {
      if (target === "answer") {
        await archivePublicAnswer(uid, String(formData.get("answerId") ?? ""));
      } else {
        await setBacklogState(
          uid,
          String(formData.get("questionId") ?? ""),
          "archived",
        );
      }
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(path);
    redirect(
      backTo(courseId, "Archived. The original question and history remain."),
    );
  }

  async function restore(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await setBacklogState(
        uid,
        String(formData.get("questionId") ?? ""),
        "needs_review",
      );
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(path);
    redirect(backTo(courseId, "Restored to the Question Backlog."));
  }

  const filtered = backlog.items
    .filter((item) => status === "all" || item.status === status)
    .filter((item) => category === "all" || itemCategory(item) === category)
    .filter((item) => matchesBacklogItem(item, search));
  const visibleItems = sort === "oldest" ? [...filtered].reverse() : filtered;
  const selected = visibleItems.find((item) =>
    matchesBacklogSelection(item, query.selected),
  );
  const detailItem = selected ?? (!query.selected ? visibleItems[0] : undefined);
  const hasValidSelection = Boolean(detailItem && query.selected);
  const edit =
    query.selected && detailItem && matchesBacklogSelection(detailItem, query.selected)
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
      title="Question Backlog"
      description={
        <span className="backlog-workspace__term">
          {course.term ?? "Academic term not set"}
        </span>
      }
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
          <Alert variant="error" title="A scheduled publication needs attention">
            It was not published and remains in Question Backlog. Open it to
            review the failure and retry or reschedule it.
          </Alert>
        )}

        <div className={`backlog-layout${hasValidSelection ? " backlog-layout--selected" : ""}`}>
          <aside className="backlog-list-pane" aria-label="Question backlog list">
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

            {visibleItems.length === 0 ? (
              backlog.total === 0 && !hasFilters ? (
                <EmptyState
                  title="No questions in the backlog yet."
                  action={{ href: `/teach/courses/${courseId}/responses`, label: "View responses" }}
                  primary
                >
                  Add a question, import historical questions, or promote one
                  from Responses.
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
                    selected={selected?.key === item.key}
                  />
                ))}
              </div>
            )}
          </aside>

          <section className="backlog-detail-pane" aria-label="Selected question">
            <Link className="backlog-detail__back" href={href({ selected: undefined })}>
              <IconBack size={15} />
              Back to Question Backlog
            </Link>
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
                saveDraft={saveDraft}
                publish={publish}
                schedule={schedule}
                cancel={cancel}
                archive={archive}
              />
            ) : detailItem?.kind === "question" ? (
              <BacklogQuestionCard
                question={detailItem.question}
                workflowStatus={detailItem.status}
                canManage={canManageBacklog}
                canDraft={can("draftPublicAnswers")}
                draftAnswer={draftBacklogAnswer}
                archive={archive}
                restore={restore}
              />
            ) : (
              <EmptyState title="Select a question to review." />
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
  saveDraft,
  publish,
  schedule,
  cancel,
  archive,
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
  saveDraft: (
    previousState: QuestionBacklogEditState,
    formData: FormData,
  ) => Promise<QuestionBacklogEditState>;
  publish: (formData: FormData) => void | Promise<void>;
  schedule: (formData: FormData) => void | Promise<void>;
  cancel: (formData: FormData) => void | Promise<void>;
  archive: (formData: FormData) => void | Promise<void>;
}) {
  const status = statusPresentation(workflowStatus);
  const answer = item.answer;
  const canEditQuestion = canReword && answer.state === "draft";
  const canEditAnswer = canDraft && answer.state === "draft";
  const inEditMode = Boolean(
    edit &&
      ((edit === "question" && canEditQuestion) ||
        (edit === "answer" && canEditAnswer)),
  );
  const readyToPublish =
    answer.state === "draft" && Boolean(answer.answerBody?.trim());
  const canPublishNow =
    canPublish &&
    (readyToPublish || item.answer.publishFailed) &&
    (answer.state === "draft" || item.answer.publishFailed);
  const canScheduleNow =
    canSchedule &&
    Boolean(answer.answerBody?.trim()) &&
    (readyToPublish || answer.state === "scheduled");

  return (
    <article
      className="backlog-card"
      aria-labelledby={`backlog-title-${answer.id}`}
    >
      <header className="backlog-card__header">
        <div className="backlog-card__stamps">
          <Stamp tone={status.tone}>{status.label}</Stamp>
          <CategoryFlair value={answer.category} />
        </div>
        <h2 id={`backlog-title-${answer.id}`}>
          {answer.publicQuestionText}
        </h2>
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
                    className={buttonClass({ variant: "secondary" })}
                    href={queueHref(courseId, {
                      selected: answer.id,
                      edit: "question",
                    })}
                  >
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
                    className={buttonClass({ variant: "secondary" })}
                    href={queueHref(courseId, {
                      selected: answer.id,
                      edit: "answer",
                    })}
                  >
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

      {!inEditMode && (
        <footer className="backlog-card__footer">
          <div className="backlog-card__edit-actions">
            {canManageBacklog && <ArchiveDialog target="answer" answerId={answer.id} action={archive} />}
          </div>
          <div className="backlog-card__publish-actions">
            {canScheduleNow && (
              <ScheduleDialog
                answer={answer}
                timezone={timezone}
                action={schedule}
              />
            )}
            {canPublishNow && (
              <PublishDialog answerId={answer.id} action={publish} />
            )}
            {answer.state === "scheduled" && canSchedule && (
              <form action={cancel}>
                <input type="hidden" name="answerId" value={answer.id} />
                <SubmitButton variant="quiet" pendingLabel="Cancelling…">
                  Cancel schedule
                </SubmitButton>
              </form>
            )}
            {answer.state === "awaiting_approval" && (
              <span className="backlog-card__approval-note">
                Awaiting instructor approval
              </span>
            )}
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
  item: BacklogItem;
  href: string;
  selected: boolean;
}) {
  const status = statusPresentation(item.status);
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
      <span className="backlog-row__stamps">
        <Stamp tone={status.tone}>{status.label}</Stamp>
        <CategoryFlair value={category} />
      </span>
      <strong className="backlog-row__title">{title}</strong>
      <span className="backlog-row__chevron" aria-hidden="true">
        <IconChevron size={16} />
      </span>
    </Link>
  );
}

function BacklogQuestionCard({
  question,
  workflowStatus,
  canManage,
  canDraft,
  draftAnswer,
  archive,
  restore,
}: {
  question: BacklogQuestion;
  workflowStatus: Exclude<StatusFilter, "all">;
  canManage: boolean;
  canDraft: boolean;
  draftAnswer: (formData: FormData) => void | Promise<void>;
  archive: (formData: FormData) => void | Promise<void>;
  restore: (formData: FormData) => void | Promise<void>;
}) {
  const status = statusPresentation(workflowStatus);

  return (
    <article
      className="backlog-card"
      aria-labelledby={`backlog-question-${question.id}`}
    >
      <header className="backlog-card__header">
        <div className="backlog-card__stamps">
          <Stamp tone={status.tone}>{status.label}</Stamp>
          <CategoryFlair value={question.category ?? "misc"} />
        </div>
        <h2 id={`backlog-question-${question.id}`}>{question.text}</h2>
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
          <p className="backlog-card__missing">
            No answer drafted yet. Start drafting when this question is ready
            for a public response.
          </p>
        </section>
        {question.internalNote && (
          <section className="backlog-editorial-region backlog-editorial-region--original">
            <h3>Internal note</h3>
            <p className="backlog-card__missing">{question.internalNote}</p>
          </section>
        )}
      </div>
      <footer className="backlog-card__footer">
        <div className="backlog-card__edit-actions">
          {canManage && ["archived", "not_suitable"].includes(question.state) ? (
            <form action={restore}>
              <input type="hidden" name="questionId" value={question.id} />
              <SubmitButton variant="secondary" pendingLabel="Restoring…">
                Restore to backlog
              </SubmitButton>
            </form>
          ) : (
            canManage && <ArchiveDialog target="question" questionId={question.id} action={archive} />
          )}
        </div>
        <div className="backlog-card__publish-actions">
          {canDraft &&
            ["needs_review", "answerable", "drafting"].includes(
              question.state,
            ) && (
            <form action={draftAnswer}>
              <input type="hidden" name="questionId" value={question.id} />
              <SubmitButton variant="primary" pendingLabel="Drafting…">
                Start drafting
              </SubmitButton>
            </form>
          )}
        </div>
      </footer>
    </article>
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
          <Select id="manual-backlog-category" name="category" defaultValue="misc">
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

function ArchiveDialog({
  target,
  questionId,
  answerId,
  action,
}: {
  target: "question" | "answer";
  questionId?: string;
  answerId?: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Dialog
      label="Archive…"
      title="Archive this question?"
      description="It will leave the active Question Backlog. The original student response and publication history are not deleted."
      variant="secondary"
    >
      <form action={action}>
          <input type="hidden" name="target" value={target} />
          {questionId && <input type="hidden" name="questionId" value={questionId} />}
          {answerId && <input type="hidden" name="answerId" value={answerId} />}
          <div className="backlog-confirm__actions">
            <Button variant="quiet" data-dialog-close>
              Cancel
            </Button>
            <SubmitButton variant="secondary" pendingLabel="Archiving…">
              Archive question
            </SubmitButton>
          </div>
        </form>
    </Dialog>
  );
}

function PublishDialog({
  answerId,
  action,
}: {
  answerId: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Dialog
      label="Publish answer"
      title="Publish this answer?"
      description="It will appear in the course's Class Q&A for every eligible student."
      variant="primary"
    >
      <form action={action}>
          <input type="hidden" name="answerId" value={answerId} />
          <p className="backlog-confirm__note">
            Check that the public wording does not identify the asker. The
            original submission stays private and linked internally.
          </p>
          <Choice type="checkbox" name="acknowledged" value="yes">
            I have checked the public wording
          </Choice>
          <div className="backlog-confirm__actions">
            <Button variant="quiet" data-dialog-close>
              Cancel
            </Button>
            <SubmitButton variant="primary" pendingLabel="Publishing…">
              Publish answer
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
}: {
  answer: QueueItem["answer"];
  timezone: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const rescheduling = answer.state === "scheduled";
  return (
    <Dialog
      label={rescheduling ? "Reschedule" : "Schedule"}
      title={rescheduling ? "Reschedule this answer" : "Schedule this answer"}
      description="The answer will publish automatically to the course's Class Q&A."
      variant="secondary"
    >
      <form action={action}>
          <input type="hidden" name="answerId" value={answer.id} />
          <p className="backlog-confirm__note">Times use {timezone}.</p>
          <label htmlFor={`schedule-${answer.id}`}>Publish at</label>
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
              {rescheduling ? "Reschedule" : "Schedule"}
            </SubmitButton>
          </div>
        </form>
    </Dialog>
  );
}

const STATUS_PRESENTATION: Record<
  Exclude<StatusFilter, "all">,
  {
    label: string;
    tone: "green" | "amber" | "red" | "neutral";
  }
> = {
  "needs-review": { label: "Needs review", tone: "amber" },
  drafting: { label: "Drafting", tone: "amber" },
  ready: { label: "Ready to publish", tone: "green" },
  scheduled: { label: "Scheduled", tone: "amber" },
  archived: { label: "Archived", tone: "neutral" },
};

function statusPresentation(status: Exclude<StatusFilter, "all">) {
  return STATUS_PRESENTATION[status];
}

function itemCategory(item: BacklogItem): Exclude<CategoryFilter, "all"> {
  return (item.kind === "answer"
    ? item.publication.answer.category
    : item.question.category) ?? "misc";
}

function matchesBacklogItem(item: BacklogItem, search: string) {
  if (!search) return true;
  const haystack =
    item.kind === "answer"
      ? [
          item.publication.answer.publicQuestionText,
          item.publication.answer.answerBody,
          item.publication.creatorName,
          item.publication.sourceOccurrence,
        ]
      : [item.question.text];
  return haystack
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(search.toLocaleLowerCase());
}

function matchesBacklogSelection(item: BacklogItem, selectedId: string | undefined) {
  if (!selectedId) return false;
  return (
    item.key === selectedId ||
    (item.kind === "answer" && item.publication.answer.id === selectedId) ||
    (item.kind === "question" && item.question.id === selectedId)
  );
}

/*
 * The page deliberately consumes the read model's status rather than deriving
 * a second state machine here. The mapping is documented in
 * `listQuestionBacklog`: imported/needs-review → Needs review, answerable or
 * drafting → Drafting, answer text → Ready to publish, scheduled → Scheduled,
 * and archived/not-suitable → Archived.
 */
function parseStatus(value: string | undefined): StatusFilter {
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
