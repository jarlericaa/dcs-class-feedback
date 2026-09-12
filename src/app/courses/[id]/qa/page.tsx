import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, toShellUser } from "@/lib/session";
import { formatDateTime } from "@/lib/datetime";
import {
  categoryShape,
  categoryShortLabel,
  groupByDay,
  QUESTION_CATEGORIES,
  shortAgo,
} from "@/lib/threads";
import {
  DayGroupHeading,
  ListPane,
  WorkspaceShell,
} from "@/components/layout/workspace-shell";
import { studentSectionTabs } from "@/components/layout/nav";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import { AccessDenied, Category, MetaList } from "@/components/ui";
import { CategoryMark, IconBack } from "@/components/ui/icons";
import { listCourseQa } from "@/modules/publishing";
import { authz, AuthzError } from "@/modules/authz";
import { resolveCourseTimezone } from "@/modules/catalog";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Class Q&A — the COURSE's one knowledge archive (ADR-0005), as a three-pane
 * workspace: topic rail, dense searchable list, selected answer.
 *
 * One archive per course. Every student of CS 33 reads the same entries
 * whichever lab section they are enrolled in, and an answer that originated in
 * Lab A is read by Lab B without anything saying so.
 *
 * There is deliberately NO section filter. Which class a question came from is
 * not part of navigating a shared archive, and offering it as a facet would
 * invite exactly the inference the anonymity rules exist to prevent. Search,
 * topic and date are the filters that remain.
 *
 * Access is enforced by listCourseQa (course staff, and students with an active
 * enrolment in any of the course's sections). Its projection carries no source
 * links, identities, provenance or drafts, so nothing rendered here can reveal
 * who asked or where they sit.
 */

/**
 * When something was published, and nothing else.
 *
 * "Carried over from earlier semesters" was here too. It filtered on
 * `sourceOrigin`, which is not a time at all, so it sat in a group called
 * Published answering a different question from its two neighbours — and it
 * duplicated the "Earlier semester" marker each affected row already carries.
 */
const TIME_FILTERS = [
  { key: "all", label: "Everything" },
  { key: "week", label: "Published this week" },
  { key: "month", label: "Published this month" },
] as const;

type TimeFilter = (typeof TIME_FILTERS)[number]["key"];

export default async function QaArchivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    category?: string;
    filter?: string;
    selected?: string;
  }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const sp = await searchParams;

  let allEntries;
  try {
    allEntries = await listCourseQa(user.id, courseId, { search: sp.q });
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <WorkspaceShell
          user={toShellUser(user)}
          contextTitle="Class Feedback"
          navGroups={await primaryNavFor(user, `/courses/${courseId}/qa`)}
        >
          <AccessDenied what="this course's Class Q&A" />
        </WorkspaceShell>
      );
    }
    throw err;
  }

  const entries = allEntries.filter(
    (entry) => !sp.category || entry.category === sp.category,
  );

  const course = (await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  }))!;
  /**
   * Staff and student read the same archive through the same route, so both
   * standings are resolved and only the PEER VIEWS differ.
   *
   * A student's own sections are needed for their tab strip — "this week's
   * form" and "my submissions" are genuinely section-shaped even though the
   * archive is not. The first is used: a student in two sections of one course
   * has one archive but two class lists, and the strip has to lead somewhere.
   */
  const capabilities = await authz.getCourseCapabilities(user.id, courseId);
  const studentSections = capabilities
    ? []
    : await authz.activeStudentSectionsForCourse(user.id, courseId);
  const homeSectionId = studentSections[0] ?? null;
  const timezone = await resolveCourseTimezone(courseId);

  const base = `/courses/${courseId}/qa`;
  // ONE route, two audiences. The rail is the same shape for both — it depends
  // on the account, not the page — and only the peer views differ, because a
  // staff member and a student genuinely have different ones.
  /**
   * The rail row this page sits under. A teacher or course-standing instructor
   * reached it through their course, which IS a rail row. A student reached it
   * through their class row, which this course path no longer matches — the
   * archive left section scope — so it is named explicitly, or the rail would
   * go quiet on the one page where the reader has no other cue.
   */
  const navGroups = await primaryNavFor(user, base, {
    fallbackHref: capabilities
      ? `/teach/courses/${courseId}`
      : homeSectionId
        ? `/sections/${homeSectionId}`
        : undefined,
  });
  const tabGroups = capabilities
    ? await courseTabGroupsFor(user.id, courseId, base)
    : undefined;
  const tabs =
    !capabilities && homeSectionId
      ? studentSectionTabs(homeSectionId, courseId, base)
      : undefined;
  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      q: sp.q,
      category: sp.category,
      filter: sp.filter,
      selected: sp.selected,
      ...patch,
    };
    for (const [key, value] of Object.entries(merged))
      if (value) next.set(key, value);
    const qs = next.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const filter = (TIME_FILTERS.find((f) => f.key === sp.filter)?.key ??
    "all") as TimeFilter;
  const now = Date.now();
  const withinFilter = (publishedAt: Date | null) => {
    const at = publishedAt?.getTime() ?? 0;
    switch (filter) {
      case "week":
        return now - at < 7 * 86_400_000;
      case "month":
        return now - at < 30 * 86_400_000;
      default:
        return true;
    }
  };

  const visible = entries.filter((entry) => withinFilter(entry.publishedAt));
  const categoryCounts = new Map(
    QUESTION_CATEGORIES.map((category) => [category.slug as string, 0]),
  );
  let allCount = 0;
  for (const entry of allEntries) {
    if (!withinFilter(entry.publishedAt)) continue;
    allCount += 1;
    if (entry.category && categoryCounts.has(entry.category)) {
      categoryCounts.set(
        entry.category,
        categoryCounts.get(entry.category)! + 1,
      );
    }
  }

  // A selected answer can disappear when the reader changes a search or
  // filter. Clear that stale URL selection instead of showing a different
  // answer under the old URL.
  if (sp.selected && !visible.some((entry) => entry.id === sp.selected)) {
    redirect(link({ selected: undefined }));
  }

  const active =
    visible.find((entry) => entry.id === sp.selected) ?? visible[0] ?? null;
  const groups = groupByDay(
    visible,
    (entry) => entry.publishedAt ?? new Date(0),
    new Date(),
    timezone,
  );
  const isFiltered = !!(sp.q?.trim() || sp.category || filter !== "all");

  return (
    <WorkspaceShell
      user={toShellUser(user)}
      contextTitle={course.code}
      workspaceLabel={capabilities ? "Staff workspace" : "Student workspace"}
      navGroups={navGroups}
      tabs={tabs}
      tabGroups={tabGroups}
      tabsMode={capabilities ? "menu" : undefined}
      tabsLabel={course.code}
      selection={{
        active: !!sp.selected,
        backHref: link({ selected: undefined }),
      }}
      listPane={
        <ListPane
          label="Published answers"
          hiddenOnMobile={!!sp.selected}
          searchAction={base}
          searchValue={sp.q}
          searchPlaceholder="Search published answers"
          hiddenFields={{ category: sp.category, filter: sp.filter }}
          header={
            <div className="pane-head">
              <Link className="pane-head__back" href="/">
                <IconBack size={14} />
                Overview
              </Link>
              <h1 className="pane-head__title">Class Q&amp;A</h1>
              <p className="pane-head__context">
                {course.code} · {course.title}
              </p>
            </div>
          }
          filterGroups={[
            {
              name: "Published",
              current: filter,
              options: TIME_FILTERS.map((f) => ({
                key: f.key,
                label: f.label,
                href: link({ filter: f.key, selected: undefined }),
              })),
            },
            /* Topic narrows this list; it is not a place to go. Keeping it in
               the rail made the rail a different shape on this one route. */
            {
              name: "Topic",
              current: sp.category ?? "all",
              options: [
                {
                  key: "all",
                  label: `All topics (${allCount})`,
                  href: link({ category: undefined, selected: undefined }),
                },
                ...QUESTION_CATEGORIES.map((c) => ({
                  key: c.slug,
                  label: `${c.label} (${categoryCounts.get(c.slug) ?? 0})`,
                  href: link({ category: c.slug, selected: undefined }),
                })),
              ],
            },
          ]}
        >
          {visible.length === 0 ? (
            isFiltered ? (
              <p className="ws-list__note">
                Nothing matches. Try a different word, or clear the filters.
              </p>
            ) : null
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <DayGroupHeading>{group.label}</DayGroupHeading>
                {group.rows.map((entry) => (
                  <Link
                    key={entry.id}
                    className={`ws-row ws-row--flush ${active?.id === entry.id ? "ws-row--active" : ""}`}
                    href={link({ selected: entry.id })}
                    aria-current={active?.id === entry.id ? "true" : undefined}
                  >
                    <span className="ws-row__top">
                      <span className="ws-row__title">{entry.question}</span>
                    </span>
                    <span className="ws-row__meta">
                      <span className="category">
                        <CategoryMark shape={categoryShape(entry.category)} />
                        {categoryShortLabel(entry.category)}
                      </span>
                      <span>{shortAgo(entry.publishedAt)}</span>
                      {entry.sourceOrigin === "legacy" && (
                        <span>Earlier semester</span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            ))
          )}
        </ListPane>
      }
    >
      {/* One empty message, not two. The list pane and this pane both used to
          print one, and this one addressed staff as though they were students:
          "when YOUR TEACHING TEAM answers a question". Staff are the teaching
          team, so the wording now follows the reader's role, and the list pane
          says nothing when it has nothing. */}
      {sp.selected && (
        <h1 className="ws-mobile-only-title">Class Q&amp;A</h1>
      )}
      {!active ? (
        <div className="ws-empty-detail">
          <p>
            {isFiltered
              ? "Nothing matches your search. Try a different word, or clear the filters."
              : capabilities
                ? "Nothing has been published to this class yet. An answer you publish from Responses or the question backlog appears here."
                : "Nothing has been published to this class yet. When your teaching team answers a question for everyone, it appears here."}
          </p>
        </div>
      ) : (
        <article>
          <h2 className="object-title">{active.question}</h2>
          {/*
            "Anonymous", at the owner's instruction (issue #14) — CONTENT-VOICE
            P3 previously forbade the bare word here on the grounds that it
            implies a guarantee the system does not make, and that document now
            records the decision instead of contradicting this page.

            The publication timestamp is NOT repeated here: every answer below
            carries its own, and a header stamp duplicated the one that belongs
            to the thing it dates.
          */}
          <MetaList
            className="qa-detail__meta"
            items={[
              "Anonymous",
              active.sourceOrigin === "legacy"
                ? "Carried over from an earlier semester"
                : null,
            ]}
          />
          {/* No "Answered" stamp: everything in this archive is answered by
              definition, so the badge distinguished nothing. */}
          <div className="row mt-3">
            <Category value={active.category} />
          </div>

          <div className="stack-5 mt-8">
            {active.answers.length === 0 ? (
              <p className="muted">No answer text was recorded.</p>
            ) : (
              active.answers.map((answer) => (
                <section className="answer" key={answer.id}>
                  {/* The person who answered, by name. "The teaching team" left
                      a class unable to tell which of several people had made a
                      public statement to them.

                      The "Anonymous" arm is defensive, not a normal case:
                      `public_answers.created_by_user_id` is NOT NULL with a
                      foreign key, so every published answer has an author.
                      Borrowing a name would be worse than admitting there is
                      none, so a missing one is stated. */}
                  <p className="answer__by">
                    Answered by {answer.answeredByName ?? "Anonymous"},{" "}
                    {formatDateTime(answer.publishedAt, timezone)}
                  </p>
                  <div className="doc">
                    {answer.answer ?? "No answer text was recorded."}
                  </div>
                </section>
              ))
            )}
          </div>
        </article>
      )}
    </WorkspaceShell>
  );
}
