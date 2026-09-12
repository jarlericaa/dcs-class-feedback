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
import { shortAgo } from "@/lib/threads";
import { requireUser, toShellUser } from "@/lib/session";
import { FilterMenu, type FilterGroup } from "@/components/ui/filter-menu";
import { Button, buttonClass } from "@/components/ui/button";
import { Choice, Field } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  AccessDenied,
  Alert,
  ArchivedNotice,
  CategoryFlair,
  Disclose,
  EmptyState,
  Stamp,
} from "@/components/ui";
import {
  IconChevron,
  IconHistory,
  IconNote,
  IconRoster,
  IconSearch,
  IconWeek,
} from "@/components/ui/icons";
import {
  AnonymityCheckRequired,
  cancelScheduledPublication,
  getPublicAnswerForEditing,
  listCoursePublicationQueue,
  publishNow,
  rewordPublicQuestion,
  schedulePublication,
  updateAnswerBody,
} from "@/modules/publishing";
import { AuthzError, getCourseCapabilities } from "@/modules/authz";
import { resolveCourseTimezone } from "@/modules/catalog";
import { zonedTimeToUtc } from "@/modules/forms/timezone";
import {
  PublicationQueueEditor,
  type PublicationEditState,
} from "@/components/staff/publication-queue-editor";

type StatusFilter =
  | "all"
  | "needs-review"
  | "ready"
  | "scheduled"
  | "rejected";
type CategoryFilter = "all" | "content" | "logistics" | "misc";
type SortOrder = "newest" | "oldest";
type QueueItem = Awaited<
  ReturnType<typeof listCoursePublicationQueue>
>["items"][number];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs-review", label: "Needs review" },
  { key: "ready", label: "Ready to publish" },
  { key: "scheduled", label: "Scheduled" },
  { key: "rejected", label: "Rejected" },
];

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "All categories" },
  { key: "content", label: "Content" },
  { key: "logistics", label: "Logistics" },
  { key: "misc", label: "Other" },
];

/**
 * The Publication Queue is a course-owned editorial list. The page keeps the
 * service's persisted states intact and only projects them into the five
 * scanning groups requested by the review workflow.
 */
export default async function PublicationsPage({
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
  const path = `/teach/courses/${courseId}/publications`;
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

  let queue;
  try {
    queue = await listCoursePublicationQueue(user.id, courseId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={await primaryNavFor(user, path)}
          title="Publication queue"
        >
          <AccessDenied what="this course's public answers" />
        </AppShell>
      );
    }
    throw err;
  }

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
      | "schedulePublication",
  ) =>
    Boolean(capabilities?.permissions[permission] && !capabilities.archived);

  async function saveDraft(
    _previousState: PublicationEditState,
    formData: FormData,
  ): Promise<PublicationEditState> {
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

  const counts = countStatuses(queue.items);
  const filtered = queue.items
    .filter((item) => status === "all" || statusFor(item).key === status)
    .filter((item) => category === "all" || item.answer.category === category)
    .filter((item) => matchesSearch(item, search));
  const visibleItems = sort === "oldest" ? [...filtered].reverse() : filtered;
  const selectedId = visibleItems.some(
    (item) => item.answer.id === query.selected,
  )
    ? query.selected
    : visibleItems[0]?.answer.id;
  const selected = visibleItems.find(
    (item) => item.answer.id === selectedId,
  );
  const edit =
    query.selected && query.selected === selectedId ? requestedEdit : null;
  const selectedDetail = selected
    ? await getPublicAnswerForEditing(user.id, selected.answer.id)
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
      title="Publication queue"
      description={
        <span className="publication-queue__term">
          {course.term ?? "Academic term not set"}
        </span>
      }
    >
      <div className="publication-queue">
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
        {queue.failed.length > 0 && (
          <Alert variant="error" title="A scheduled publication needs attention">
            It was not published and remains in the queue. Open it to review the
            failure and retry or reschedule it.
          </Alert>
        )}

        <div className="publication-toolbar">
          <form className="publication-search" method="get" action={path}>
            <IconSearch className="publication-search__icon" size={16} />
            <label className="visually-hidden" htmlFor="publication-search">
              Search publication queue
            </label>
            <input
              id="publication-search"
              name="q"
              type="search"
              defaultValue={search}
              placeholder="Search questions, keywords, or authors…"
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
        </div>

        <div className="publication-controls" aria-label="Queue status filters">
          <div className="publication-statuses">
            {STATUS_FILTERS.map((item) => {
              const selectedFilter = item.key === status;
              return (
                <Link
                  className={`publication-status${selectedFilter ? " publication-status--active" : ""}`}
                  href={href({
                    status: item.key,
                    clearSelection: true,
                  })}
                  aria-current={selectedFilter ? "page" : undefined}
                  key={item.key}
                >
                  {item.label}
                  <span className="publication-status__count">
                    {counts[item.key]}
                  </span>
                </Link>
              );
            })}
          </div>
          <details className="publication-sort">
            <summary>
              {sort === "newest" ? "Newest first" : "Oldest first"}
              <IconChevron size={13} aria-hidden="true" />
            </summary>
            <div className="publication-sort__menu">
              {(["newest", "oldest"] as SortOrder[]).map((option) => (
                <Link
                  className={sort === option ? "publication-sort__active" : ""}
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
          queue.items.length === 0 && !hasFilters ? (
            <EmptyState
              title="No answers waiting for publication."
              action={{
                href: `/teach/courses/${courseId}/responses`,
                label: "View responses",
              }}
              primary
            >
              Draft an answer from a response or the question backlog to start
              the publication workflow.
            </EmptyState>
          ) : (
            <EmptyState
              title="Nothing matches these filters."
              action={{ href: path, label: "Clear filters" }}
            />
          )
        ) : (
          <div className="publication-list">
            {selected && selectedDetail && (
              <PublicationCard
                item={selected}
                detail={selectedDetail}
                timezone={timezone}
                courseId={courseId}
                edit={edit}
                canDraft={can("draftPublicAnswers")}
                canReword={can("rewordPublicQuestions")}
                canPublish={can("publishPublicAnswers")}
                canSchedule={can("schedulePublication")}
                saveDraft={saveDraft}
                publish={publish}
                schedule={schedule}
                cancel={cancel}
              />
            )}
            {visibleItems
              .filter((item) => item.answer.id !== selected?.answer.id)
              .map((item) => (
                <PublicationRow
                  key={item.answer.id}
                  item={item}
                  href={href({ selected: item.answer.id })}
                  timezone={timezone}
                />
              ))}
          </div>
        )}

        {queue.published.length > 0 && status === "all" && !hasFilters && (
          <section className="publication-recent">
            <div className="publication-recent__head">
              <h2>Recently published</h2>
              <Link className="link" href={`/courses/${courseId}/qa`}>
                View Class Q&amp;A
              </Link>
            </div>
            {queue.published.slice(0, 4).map(({ answer, sourceCount }) => (
              <Link
                className="publication-recent__row"
                href={`/courses/${courseId}/qa?selected=${answer.id}`}
                key={answer.id}
              >
                <span>{answer.publicQuestionText}</span>
                <small>
                  Published {formatDateTime(answer.publishedAt, timezone)} · {sourceCount} linked source{sourceCount === 1 ? "" : "s"}
                </small>
              </Link>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}

function PublicationCard({
  item,
  detail,
  timezone,
  courseId,
  edit,
  canDraft,
  canReword,
  canPublish,
  canSchedule,
  saveDraft,
  publish,
  schedule,
  cancel,
}: {
  item: QueueItem;
  detail: Awaited<ReturnType<typeof getPublicAnswerForEditing>>;
  timezone: string;
  courseId: string;
  edit: "question" | "answer" | null;
  canDraft: boolean;
  canReword: boolean;
  canPublish: boolean;
  canSchedule: boolean;
  saveDraft: (
    previousState: PublicationEditState,
    formData: FormData,
  ) => Promise<PublicationEditState>;
  publish: (formData: FormData) => void | Promise<void>;
  schedule: (formData: FormData) => void | Promise<void>;
  cancel: (formData: FormData) => void | Promise<void>;
}) {
  const status = statusFor(item);
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
      className="publication-card"
      aria-labelledby={`publication-title-${answer.id}`}
    >
      <header className="publication-card__header">
        <div className="publication-card__stamps">
          <Stamp tone={status.tone}>{status.label}</Stamp>
          <CategoryFlair value={answer.category} />
        </div>
        <h2 id={`publication-title-${answer.id}`}>
          {answer.publicQuestionText}
        </h2>
        <QueueMeta item={item} timezone={timezone} expanded />
      </header>

      {answer.publishFailed && answer.publishFailureReason && (
        <Alert variant="error" title="Publication failed">
          {answer.publishFailureReason}
        </Alert>
      )}

      <div className="publication-card__divider" />

      {inEditMode ? (
        <PublicationQueueEditor
          action={saveDraft}
          answerId={answer.id}
          mode={edit!}
          question={answer.publicQuestionText}
          answer={answer.answerBody ?? ""}
          cancelHref={queueHref(courseId, { selected: answer.id })}
        />
      ) : (
        <div className="publication-card__content">
          <section>
            <h3>Public question</h3>
            <SafeRichText
              source={answer.publicQuestionText}
              className="publication-authored-text publication-authored-text--question"
            />
          </section>
          <section>
            <h3>Draft answer</h3>
            {answer.answerBody ? (
              <SafeRichText
                source={answer.answerBody}
                className="publication-authored-text"
              />
            ) : (
              <p className="publication-card__missing">No answer drafted yet.</p>
            )}
          </section>
        </div>
      )}

      <Disclose
        inset
        label={linkedSourceLabel(item.sourceCount, item.linkedSubmissionCount)}
      >
        <div className="publication-sources">
          <p className="publication-sources__heading">
            Linked {linkedSourceNoun(item.sourceCount, item.linkedSubmissionCount)} ({item.sourceCount})
          </p>
          {detail.sources.length > 0 && (
            <ol>
              {detail.sources.map((source) => (
                <li key={source.id}>“{source.originalText}”</li>
              ))}
            </ol>
          )}
          {detail.backlogSourceCount > 0 && (
            <p>
              {detail.backlogSourceCount} linked source
              {detail.backlogSourceCount === 1 ? "" : "s"} came from the
              course question backlog.
            </p>
          )}
          {detail.hiddenSourceCount > 0 && (
            <p className="publication-sources__note">
              Some source wording is hidden because this account cannot review
              that source section.
            </p>
          )}
          {detail.sources.length === 0 && detail.backlogSourceCount === 0 && (
            <p className="publication-sources__note">
              Source wording is not available in this view.
            </p>
          )}
        </div>
      </Disclose>

      {!inEditMode && (
        <footer className="publication-card__footer">
          <div className="publication-card__edit-actions">
            {canEditQuestion && (
              <Link
                className={buttonClass({ variant: "secondary" })}
                href={queueHref(courseId, {
                  selected: answer.id,
                  edit: "question",
                })}
              >
                Edit question
              </Link>
            )}
            {canEditAnswer && (
              <Link
                className={buttonClass({ variant: "secondary" })}
                href={queueHref(courseId, {
                  selected: answer.id,
                  edit: "answer",
                })}
              >
                Edit answer
              </Link>
            )}
          </div>
          <div className="publication-card__publish-actions">
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
              <span className="publication-card__approval-note">
                Awaiting instructor approval
              </span>
            )}
          </div>
        </footer>
      )}
    </article>
  );
}

function PublicationRow({
  item,
  href,
  timezone,
}: {
  item: QueueItem;
  href: string;
  timezone: string;
}) {
  const status = statusFor(item);
  return (
    <Link className="publication-row" href={href}>
      <span className="publication-row__stamps">
        <Stamp tone={status.tone}>{status.label}</Stamp>
        <CategoryFlair value={item.answer.category} />
      </span>
      <strong className="publication-row__title">
        {item.answer.publicQuestionText}
      </strong>
      <QueueMeta item={item} timezone={timezone} />
      <span className="publication-row__chevron" aria-hidden="true">
        <IconChevron size={16} />
      </span>
    </Link>
  );
}

function QueueMeta({
  item,
  timezone,
  expanded = false,
}: {
  item: QueueItem;
  timezone: string;
  expanded?: boolean;
}) {
  const answer = item.answer;
  const sourceLabel = linkedSourceLabel(
    item.sourceCount,
    item.linkedSubmissionCount,
  );
  const timingLabel =
    answer.state === "scheduled" && answer.scheduledAt
      ? `Scheduled ${formatDateTime(answer.scheduledAt, timezone)}`
      : answer.publishFailed
        ? `Failed ${shortAgo(answer.updatedAt) || "recently"} ago`
        : item.latestApproval?.decision === "rejected" &&
            answer.state === "draft"
          ? `Rejected ${shortAgo(item.latestApproval.createdAt) || "recently"} ago`
          : answer.state === "awaiting_approval" &&
              answer.submittedForApprovalAt
            ? `Submitted for approval ${shortAgo(answer.submittedForApprovalAt) || "recently"} ago`
            : `Edited ${shortAgo(answer.updatedAt) || "recently"} ago`;
  return (
    <div
      className={`publication-meta${expanded ? " publication-meta--expanded" : ""}`}
    >
      <span>
        <IconNote size={15} />
        {sourceLabel}
      </span>
      {item.creatorName && (
        <span>
          <IconRoster size={15} />
          {item.creatorName}
        </span>
      )}
      <span>
        <IconHistory size={15} />
        {timingLabel}
      </span>
      {item.sourceOccurrence && (
        <span>
          <IconWeek size={15} />
          From {item.sourceOccurrence}
        </span>
      )}
    </div>
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
      {(close) => (
        <form action={action}>
          <input type="hidden" name="answerId" value={answerId} />
          <p className="publication-confirm__note">
            Check that the public wording does not identify the asker. The
            original submission stays private and linked internally.
          </p>
          <Choice type="checkbox" name="acknowledged" value="yes">
            I have checked the public wording
          </Choice>
          <div className="publication-confirm__actions">
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
            <SubmitButton variant="primary" pendingLabel="Publishing…">
              Publish answer
            </SubmitButton>
          </div>
        </form>
      )}
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
      {(close) => (
        <form action={action}>
          <input type="hidden" name="answerId" value={answer.id} />
          <p className="publication-confirm__note">Times use {timezone}.</p>
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
          <div className="publication-confirm__actions">
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
            <SubmitButton variant="secondary" pendingLabel="Scheduling…">
              {rescheduling ? "Reschedule" : "Schedule"}
            </SubmitButton>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function statusFor(item: QueueItem): {
  key: Exclude<StatusFilter, "all">;
  label: string;
  tone: "green" | "amber" | "red" | "neutral";
} {
  if (
    item.latestApproval?.decision === "rejected" &&
    item.answer.state === "draft"
  ) {
    return { key: "rejected", label: "Rejected", tone: "red" };
  }
  if (item.answer.state === "scheduled") {
    return item.answer.publishFailed
      ? { key: "scheduled", label: "Publication failed", tone: "red" }
      : { key: "scheduled", label: "Scheduled", tone: "amber" };
  }
  if (item.answer.state === "awaiting_approval") {
    return { key: "needs-review", label: "Needs review", tone: "amber" };
  }
  if (item.answer.answerBody?.trim()) {
    return { key: "ready", label: "Ready to publish", tone: "green" };
  }
  return { key: "needs-review", label: "Needs review", tone: "amber" };
}

function countStatuses(items: QueueItem[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    all: items.length,
    "needs-review": 0,
    ready: 0,
    scheduled: 0,
    rejected: 0,
  };
  for (const item of items) counts[statusFor(item).key] += 1;
  return counts;
}

function matchesSearch(item: QueueItem, search: string) {
  if (!search) return true;
  const haystack = [
    item.answer.publicQuestionText,
    item.answer.answerBody,
    item.creatorName,
    item.sourceOccurrence,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(search.toLocaleLowerCase());
}

function linkedSourceLabel(total: number, linkedSubmissionCount: number) {
  const kind =
    linkedSubmissionCount === total ? "submission" : "source";
  return `${total} linked ${kind}${total === 1 ? "" : "s"}`;
}

function linkedSourceNoun(total: number, linkedSubmissionCount: number) {
  return linkedSubmissionCount === total ? "submissions" : "sources";
}

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
  return `/teach/courses/${courseId}/publications${query ? `?${query}` : ""}`;
}

function describe(err: unknown): string {
  if (err instanceof AuthzError) return err.message;
  if (err instanceof Error) {
    console.error("[publications] unmapped module error", err);
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
