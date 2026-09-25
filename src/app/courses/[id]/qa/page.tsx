import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { currentUserId } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { QaAnswerPreview } from "@/components/qa-answer-preview";
import { studentCourseTabs } from "@/components/layout/nav";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import { requireUser, toShellUser } from "@/lib/session";
import { courseTermParts } from "@/lib/term";
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  initials,
} from "@/lib/datetime";
import { richTextToPlain } from "@/modules/richtext/plain";
import { SafeRichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FilterMenu } from "@/components/ui/filter-menu";
import { Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { AccessDenied, Alert, CategoryFlair, MetaList } from "@/components/ui";
import {
  IconBack,
  IconChevron,
  IconEdit,
  IconSearch,
} from "@/components/ui/icons";
import { listCourseQa, updatePublishedAnswer } from "@/modules/publishing";
import { authz, AuthzError } from "@/modules/authz";
import { resolveCourseTimezone } from "@/modules/catalog";
import { db } from "@/db";
import { classSections, courses } from "@/db/schema";
import { QUESTION_CATEGORIES } from "@/lib/threads";

const TIME_FILTERS = [
  { key: "all", label: "Everything" },
  { key: "week", label: "Published this week" },
  { key: "month", label: "Published this month" },
] as const;

type TimeFilter = (typeof TIME_FILTERS)[number]["key"];
type SortOrder = "newest" | "oldest";
type QaEntry = Awaited<ReturnType<typeof listCourseQa>>[number];
type QaAnswer = QaEntry["answers"][number];
type EditPublishedAnswerAction = (formData: FormData) => Promise<void>;

/**
 * Class Q&A is one published archive per course (ADR-0005).
 *
 * The archive is intentionally a normal course tab: the old split-pane reader
 * made a public knowledge archive feel like a staff inbox. Feed posts are
 * consumed in place; the existing selected URL remains available for direct
 * detail links without making the archive itself a navigation list.
 */
export default async function QaArchivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    category?: string;
    filter?: string;
    sort?: string;
    selected?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const sp = await searchParams;
  const base = `/courses/${courseId}/qa`;
  const search = sp.q?.trim() || undefined;
  const filter = (TIME_FILTERS.find((item) => item.key === sp.filter)?.key ??
    "all") as TimeFilter;
  const sort: SortOrder = sp.sort === "oldest" ? "oldest" : "newest";

  let allEntries: QaEntry[];
  let entries: QaEntry[];
  let searchedEntries: QaEntry[] | null;
  try {
    /* Keep the counts independent of search while reusing the default read. */
    [allEntries, searchedEntries] = await Promise.all([
      listCourseQa(user.id, courseId, { sort }),
      search
        ? listCourseQa(user.id, courseId, { search, sort })
        : Promise.resolve(null),
    ]);
    entries = searchedEntries ?? allEntries;
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace={user.isTeacher ? "staff" : "student"}
          navGroups={await primaryNavFor(user, base)}
          contextLabel="Forms"
          title="Class Q&A"
        >
          <AccessDenied what="this course's Class Q&A" />
        </AppShell>
      );
    }
    throw err;
  }

  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!course) {
    return (
      <AppShell
        user={toShellUser(user)}
        workspace={user.isTeacher ? "staff" : "student"}
        navGroups={await primaryNavFor(user, base)}
        contextLabel="Forms"
        title="Class Q&A"
      >
        <AccessDenied what="this course's Class Q&A" />
      </AppShell>
    );
  }

  const timezone = await resolveCourseTimezone(courseId);
  const now = new Date();
  const withinFilter = (publishedAt: Date | null) => {
    const at = publishedAt?.getTime() ?? 0;
    if (filter === "week") return now.getTime() - at < 7 * 86_400_000;
    if (filter === "month") return now.getTime() - at < 30 * 86_400_000;
    return true;
  };

  const timeEntries = allEntries.filter((entry) =>
    withinFilter(entry.publishedAt),
  );
  const visible = entries
    .filter((entry) => withinFilter(entry.publishedAt))
    .filter((entry) => !sp.category || entry.category === sp.category);

  const categoryCounts = new Map(
    QUESTION_CATEGORIES.map((category) => [category.slug as string, 0]),
  );
  for (const entry of timeEntries) {
    if (categoryCounts.has(entry.category)) {
      categoryCounts.set(
        entry.category,
        categoryCounts.get(entry.category)! + 1,
      );
    }
  }

  const allCount = timeEntries.length;
  const isFiltered = !!(search || sp.category || filter !== "all");
  const selected = sp.selected
    ? visible.find((entry) => entry.id === sp.selected)
    : null;

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      q: sp.q,
      category: sp.category,
      filter: sp.filter,
      sort: sp.sort,
      selected: sp.selected,
      ...patch,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `${base}?${query}` : base;
  };

  const returnTo = link({});

  async function editPublishedAnswer(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");

    const answerId = String(formData.get("answerId") ?? "");
    const requestedReturnTo = String(formData.get("returnTo") ?? base);
    const safeReturnTo =
      requestedReturnTo === base || requestedReturnTo.startsWith(`${base}?`)
        ? requestedReturnTo
        : base;

    try {
      await updatePublishedAnswer(
        uid,
        answerId,
        String(formData.get("answerBody") ?? ""),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save the answer.";
      const separator = safeReturnTo.includes("?") ? "&" : "?";
      redirect(
        `${safeReturnTo}${separator}error=${encodeURIComponent(message)}`,
      );
    }

    revalidatePath(base);
    revalidatePath(`/teach/courses/${courseId}/backlog`);
    revalidatePath(`/teach/courses/${courseId}/responses`);
    redirect(safeReturnTo);
  }

  /* A copied detail URL must never silently show the wrong result. */
  if (sp.selected && !selected) {
    redirect(link({ selected: undefined }));
  }

  const sections = await db.query.classSections.findMany({
    where: eq(classSections.courseId, courseId),
    columns: { term: true },
  });
  const termFacts = courseTermParts(
    course.term,
    sections.map((section) => section.term),
  );
  const capabilities = await authz.getCourseCapabilities(user.id, courseId);
  const canEditPublishedAnswers = Boolean(
    capabilities?.permissions.draftPublicAnswers && !capabilities.archived,
  );
  const navGroups = await primaryNavFor(user, base, {
    fallbackHref: capabilities
      ? `/teach/courses/${courseId}`
      : undefined,
  });
  const tabGroups = capabilities
    ? await courseTabGroupsFor(user.id, courseId, base)
    : undefined;
  const tabs = !capabilities ? studentCourseTabs(courseId, base) : undefined;

  const crumbs = capabilities
    ? [
        { href: "/teach/courses", label: "My courses" },
        { href: `/teach/courses/${courseId}`, label: course.code },
      ]
    : [
        { href: "/courses", label: "My courses" },
        { href: `/courses/${courseId}`, label: course.code },
      ];
  const detailCrumbs = selected
    ? [...crumbs, { href: base, label: "Class Q&A" }]
    : crumbs;

  return (
    <AppShell
      user={toShellUser(user)}
      workspace={capabilities ? "staff" : "student"}
      navGroups={navGroups}
      tabs={tabs}
      tabGroups={tabGroups}
      tabsMode={capabilities ? "menu" : undefined}
      tabsLabel={course.code}
      contextLabel={course.code}
      title={course.code}
      description={
        termFacts.length > 0 ? <MetaList items={termFacts} /> : undefined
      }
      crumbs={detailCrumbs}
      nested={!!selected}
      roomy
    >
      {sp.error && <Alert variant="error">{sp.error}</Alert>}
      {selected ? (
        <QaDetail
          backHref={link({ selected: undefined })}
          canEdit={canEditPublishedAnswers}
          editAction={editPublishedAnswer}
          entry={selected}
          now={now}
          returnTo={returnTo}
          timezone={timezone}
        />
      ) : (
        <section className="qa-archive" aria-labelledby="qa-archive-heading">
          <div className="qa-toolbar">
            <form
              className="qa-search"
              method="get"
              action={base}
              role="search"
            >
              <IconSearch
                aria-hidden="true"
                className="qa-search__icon"
                size={18}
              />
              <label className="visually-hidden" htmlFor="qa-search">
                Search questions
              </label>
              <input
                defaultValue={sp.q ?? ""}
                id="qa-search"
                name="q"
                placeholder="Search questions..."
                type="search"
              />
              {sp.category && (
                <input name="category" type="hidden" value={sp.category} />
              )}
              {sp.filter && (
                <input name="filter" type="hidden" value={sp.filter} />
              )}
              {sp.sort && (
                <input name="sort" type="hidden" value={sp.sort} />
              )}
              <button className="visually-hidden" type="submit">
                Search
              </button>
            </form>

            <div className="qa-filter">
              <FilterMenu
                groups={[
                  {
                    name: "Date published",
                    current: filter,
                    options: TIME_FILTERS.map((item) => ({
                      key: item.key,
                      label: item.label,
                      href: link({ filter: item.key, selected: undefined }),
                    })),
                  },
                ]}
              />
            </div>
          </div>

          <div className="qa-filter-row">
            <nav aria-label="Filter by category" className="qa-categories">
              <Link
                aria-current={!sp.category ? "page" : undefined}
                className={`qa-category-filter${!sp.category ? " qa-category-filter--active" : ""}`}
                href={link({ category: undefined, selected: undefined })}
              >
                <span>All</span>
                <span className="qa-category-filter__count">{allCount}</span>
              </Link>
              {QUESTION_CATEGORIES.map((category) => {
                const active = sp.category === category.slug;
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`qa-category-filter${active ? " qa-category-filter--active" : ""} qa-category-filter--${category.slug}`}
                    href={link({
                      category: active ? undefined : category.slug,
                      selected: undefined,
                    })}
                    key={category.slug}
                  >
                    <span className="qa-category-filter__label">
                      {category.short}
                    </span>
                    <span className="qa-category-filter__count">
                      {categoryCounts.get(category.slug) ?? 0}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <SortMenu
              current={sort}
              hrefFor={(value) =>
                link({ sort: value, selected: undefined })
              }
            />
          </div>

          <h2 className="visually-hidden" id="qa-archive-heading">
            Published questions and answers
          </h2>

          {visible.length === 0 ? (
            <div className="qa-empty">
              <p>
                {isFiltered
                  ? "Nothing matches your search."
                  : "No Q&A has been published yet."}
              </p>
              {isFiltered && (
                <Link className="link" href={base}>
                  Clear filters
                </Link>
              )}
            </div>
          ) : (
            <div className="qa-groups">
              {[
                {
                  label: "This week",
                  rows: visible.filter(
                    (entry) =>
                      now.getTime() - (entry.publishedAt?.getTime() ?? 0) <
                      7 * 86_400_000,
                  ),
                },
                {
                  label: "Earlier",
                  rows: visible.filter(
                    (entry) =>
                      now.getTime() - (entry.publishedAt?.getTime() ?? 0) >=
                      7 * 86_400_000,
                  ),
                },
              ]
                .filter((group) => group.rows.length > 0)
                .map((group) => (
                  <section className="qa-group" key={group.label}>
                    <h2 className="strip">{group.label}</h2>
                    <div className="qa-card-list">
                      {group.rows.map((entry) => (
                        <QaCard
                          canEdit={canEditPublishedAnswers}
                          editAction={editPublishedAnswer}
                          entry={entry}
                          key={entry.id}
                          now={now}
                          returnTo={returnTo}
                          timezone={timezone}
                        />
                      ))}
                    </div>
                  </section>
                ))}
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}

function SortMenu({
  current,
  hrefFor,
}: {
  current: SortOrder;
  hrefFor: (sort: SortOrder) => string;
}) {
  return (
    <details className="qa-sort">
      <summary aria-label="Sort Class Q&A" className="qa-sort__summary">
        {current === "oldest" ? "Oldest first" : "Newest first"}
        <IconChevron aria-hidden="true" className="qa-sort__icon" size={14} />
      </summary>
      <div className="qa-sort__menu">
        {(["newest", "oldest"] as const).map((value) => (
          <Link
            aria-current={current === value ? "page" : undefined}
            className={
              current === value
                ? "qa-sort__option qa-sort__option--active"
                : "qa-sort__option"
            }
            href={hrefFor(value)}
            key={value}
          >
            {value === "newest" ? "Newest first" : "Oldest first"}
          </Link>
        ))}
      </div>
    </details>
  );
}

function QaCard({
  canEdit,
  editAction,
  entry,
  now,
  returnTo,
  timezone,
}: {
  canEdit: boolean;
  editAction: EditPublishedAnswerAction;
  entry: QaEntry;
  now: Date;
  returnTo: string;
  timezone: string;
}) {
  const firstAnswer = entry.answers[0];
  const answer = richTextToPlain(firstAnswer?.answer);
  const edited = firstAnswer ? editedMarker(firstAnswer, now) : null;

  return (
    <article className="qa-card">
      <span className="qa-card__topline">
        <CategoryFlair value={entry.category} />
        <time dateTime={entry.publishedAt?.toISOString()}>
          {formatDate(entry.publishedAt, timezone)}
        </time>
      </span>
      <h3 className="qa-card__question">{entry.question}</h3>
      <div aria-hidden="true" className="qa-card__divider" />
      <QaAnswerPreview
        answer={answer}
        editedAt={edited?.dateTime}
        editedLabel={edited?.label}
        editControl={
          canEdit && firstAnswer ? (
            <QaAnswerEditDialog
              action={editAction}
              answerBody={firstAnswer.answer ?? ""}
              answerId={firstAnswer.id}
              returnTo={returnTo}
            />
          ) : undefined
        }
      />
    </article>
  );
}

function QaDetail({
  canEdit,
  editAction,
  entry,
  now,
  returnTo,
  timezone,
  backHref,
}: {
  canEdit: boolean;
  editAction: EditPublishedAnswerAction;
  entry: QaEntry;
  now: Date;
  returnTo: string;
  timezone: string;
  backHref: string;
}) {
  return (
    <article className="qa-detail">
      <Link className="qa-detail__back" href={backHref}>
        <IconBack aria-hidden="true" size={15} />
        Back to Class Q&amp;A
      </Link>

      <section
        aria-labelledby="qa-question-title"
        className="qa-detail__question"
      >
        <div className="qa-detail__topline">
          <CategoryFlair value={entry.category} />
          <time dateTime={entry.publishedAt?.toISOString()}>
            {formatDateTime(entry.publishedAt, timezone)}
          </time>
        </div>
        <h2 id="qa-question-title">{entry.question}</h2>
      </section>

      <section
        aria-labelledby="qa-answer-title"
        className="qa-detail__answers"
      >
        <h2 id="qa-answer-title">Instructor answer</h2>
        {entry.answers.map((answer) => {
          const edited = editedMarker(answer, now);
          return (
            <div className="qa-answer" key={answer.id}>
              <div className="qa-answer__heading">
                <h3 className="qa-answer__label">
                  Answer
                  {edited && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <time dateTime={edited.dateTime}>
                        Edited {edited.label}
                      </time>
                    </>
                  )}
                </h3>
                {canEdit && (
                  <QaAnswerEditDialog
                    action={editAction}
                    answerBody={answer.answer ?? ""}
                    answerId={answer.id}
                    returnTo={returnTo}
                  />
                )}
              </div>
            <div className="qa-answer__author">
              <span aria-hidden="true" className="qa-answer__mark">
                {initials(answer.answeredByName ?? "Instructor")}
              </span>
              <span className="qa-answer__byline">
                <strong>{answer.answeredByName ?? "Instructor"}</strong>
                <time dateTime={answer.publishedAt?.toISOString()}>
                  {formatDateTime(answer.publishedAt, timezone)}
                </time>
              </span>
            </div>
            <SafeRichText
              className="qa-answer__body"
              fallback={<p>No answer text was recorded.</p>}
              source={answer.answer}
            />
            </div>
          );
        })}
      </section>
    </article>
  );
}

function editedMarker(answer: QaAnswer, now: Date) {
  if (
    !answer.lastEditedAt ||
    !answer.publishedAt ||
    answer.lastEditedAt.getTime() <= answer.publishedAt.getTime()
  ) {
    return null;
  }
  return {
    dateTime: answer.lastEditedAt.toISOString(),
    label: formatRelativeTime(answer.lastEditedAt, now),
  };
}

function QaAnswerEditDialog({
  action,
  answerBody,
  answerId,
  returnTo,
}: {
  action: EditPublishedAnswerAction;
  answerBody: string;
  answerId: string;
  returnTo: string;
}) {
  const fieldId = `qa-answer-${answerId}`;
  return (
    <Dialog
      label={
        <>
          <IconEdit aria-hidden="true" size={15} />
          Edit
        </>
      }
      title="Edit answer"
      variant="secondary"
    >
      <form action={action}>
        <input name="answerId" type="hidden" value={answerId} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <label className="qa-answer-edit__label" htmlFor={fieldId}>
          Answer
        </label>
        <Textarea
          data-autofocus
          defaultValue={answerBody}
          id={fieldId}
          name="answerBody"
          required
          rows={7}
        />
        <div className="qa-answer-edit__actions">
          <Button data-dialog-close variant="secondary">
            Cancel
          </Button>
          <SubmitButton pendingLabel="Saving…" variant="primary">
            Save changes
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
