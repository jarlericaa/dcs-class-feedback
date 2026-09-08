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
import {
  staffSectionTabGroups,
  studentSectionTabs,
} from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import { AccessDenied, Category, MetaList } from "@/components/ui";
import { CategoryMark, IconBack } from "@/components/ui/icons";
import { listSectionQa } from "@/modules/publishing";
import { authz, AuthzError } from "@/modules/authz";
import { getSectionWithCourse } from "@/modules/catalog";

/**
 * Section Q&A archive — the class-facing knowledge archive, as a three-pane
 * workspace: section/topic rail, dense searchable list, selected answer.
 *
 * Access is enforced by listSectionQa (enrolled students and section staff
 * only). Its projection carries no source links, identities or drafts, so
 * nothing rendered here can reveal who asked.
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
  const { id: sectionId } = await params;
  const sp = await searchParams;

  let allEntries;
  try {
    allEntries = await listSectionQa(user.id, sectionId, { search: sp.q });
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <WorkspaceShell
          user={toShellUser(user)}
          contextTitle="Class Feedback"
          navGroups={await primaryNavFor(user, `/sections/${sectionId}/qa`)}
        >
          <AccessDenied what="this section's Q&A archive" />
        </WorkspaceShell>
      );
    }
    throw err;
  }

  const entries = allEntries.filter(
    (entry) => !sp.category || entry.category === sp.category,
  );

  const { section } = await getSectionWithCourse(sectionId);
  const access = await authz.getSectionAccess(user.id, sectionId);

  const base = `/sections/${sectionId}/qa`;
  // ONE route, two audiences. The rail is the same shape for both — it depends
  // on the account, not the page — and only the peer views differ, because a
  // staff member and a student genuinely have different ones.
  const navGroups = await primaryNavFor(user, base, {
    /* An assistant with no course standing reaches this archive through the
       section row in their own rail; a student through their class row, which
       this path already matches; a teacher through their courses, which is the
       default. Naming it here keeps the rail from going quiet for the one
       reader whose entrance the URL cannot show. */
    fallbackHref: access?.staff
      ? access.staff.hasCourseStanding
        ? `/teach/courses/${section.courseId}`
        : `/teach/sections/${sectionId}`
      : undefined,
  });
  const tabGroups = access?.staff
    ? staffSectionTabGroups(access, base)
    : undefined;
  const tabs = access?.staff ? undefined : studentSectionTabs(sectionId, base);
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
    section.timezone,
  );
  const isFiltered = !!(sp.q?.trim() || sp.category || filter !== "all");

  return (
    <WorkspaceShell
      user={toShellUser(user)}
      contextTitle={section.title}
      workspaceLabel={access?.staff ? "Staff workspace" : "Student workspace"}
      navGroups={navGroups}
      tabs={tabs}
      tabGroups={tabGroups}
      tabsMode={access?.staff ? "menu" : undefined}
      tabsLabel={section.title}
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
              <p className="pane-head__context">{section.title}</p>
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
                      <span>No asker shown</span>
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
              : access?.staff
                ? "Nothing has been published to this class yet. An answer you publish from the review inbox appears here."
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
          <div className="row" style={{ marginTop: "var(--s3)" }}>
            <Category value={active.category} />
          </div>

          <div className="stack-5" style={{ marginTop: "var(--s6)" }}>
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
                    {formatDateTime(answer.publishedAt, section.timezone)}
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
