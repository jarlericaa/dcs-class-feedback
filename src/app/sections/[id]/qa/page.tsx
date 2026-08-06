import Link from "next/link";
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
import { staffSectionNav, studentSectionNav } from "@/components/layout/nav";
import { AccessDenied, Category, MetaList } from "@/components/ui";
import { CategoryMark, IconBack } from "@/components/ui/icons";
import { listSectionQa } from "@/modules/publishing";
import { authz, AuthzError } from "@/modules/authz";
import { getSectionWithCourse, listSectionsForUser } from "@/modules/catalog";

/**
 * Section Q&A archive — the class-facing knowledge archive, as a three-pane
 * workspace: section/topic rail, dense searchable list, selected answer.
 *
 * Access is enforced by listSectionQa (enrolled students and section staff
 * only). Its projection carries no source links, identities or drafts, so
 * nothing rendered here can reveal who asked.
 */

const TIME_FILTERS = [
  { key: "all", label: "Everything" },
  { key: "week", label: "Published this week" },
  { key: "month", label: "Published this month" },
  { key: "legacy", label: "Carried over from earlier semesters" },
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
        <WorkspaceShell user={toShellUser(user)} contextTitle="Class Feedback">
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
  const { staffSections, studentSections } = await listSectionsForUser(user.id);

  const base = `/sections/${sectionId}/qa`;
  const navGroups = access?.staff
    ? staffSectionNav(access, base)
    : studentSectionNav(sectionId, base);
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
  const withinFilter = (publishedAt: Date | null, origin: string | null) => {
    const at = publishedAt?.getTime() ?? 0;
    switch (filter) {
      case "week":
        return now - at < 7 * 86_400_000;
      case "month":
        return now - at < 30 * 86_400_000;
      case "legacy":
        return origin === "legacy";
      default:
        return true;
    }
  };

  const visible = entries.filter((entry) =>
    withinFilter(entry.publishedAt, entry.sourceOrigin),
  );
  const categoryCounts = new Map(
    QUESTION_CATEGORIES.map((category) => [category.slug as string, 0]),
  );
  let allCount = 0;
  for (const entry of allEntries) {
    if (!withinFilter(entry.publishedAt, entry.sourceOrigin)) continue;
    allCount += 1;
    if (entry.category && categoryCounts.has(entry.category)) {
      categoryCounts.set(
        entry.category,
        categoryCounts.get(entry.category)! + 1,
      );
    }
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

  // Sections in the rail are the user's real sections, in whichever capacity.
  const railSections = [
    ...studentSections,
    ...staffSections.filter((s) => !studentSections.some((x) => x.id === s.id)),
  ];

  return (
    <WorkspaceShell
      user={toShellUser(user)}
      contextTitle={section.title}
      workspaceLabel={access?.staff ? "Staff workspace" : "Student workspace"}
      primaryAction={
        access?.staff
          ? undefined
          : { href: `/sections/${sectionId}`, label: "This week's form" }
      }
      /* A one-item group whose only entry links to the page you are already on
         is chrome pretending to be structure, so the section switcher appears
         only when there is somewhere else to switch to. */
      courses={
        railSections.length > 1
          ? railSections.map((s) => ({
              href: `/sections/${s.id}/qa`,
              label: s.title,
              active: s.id === sectionId,
            }))
          : undefined
      }
      navGroups={navGroups}
      categories={[
        {
          slug: "all",
          label: "All topics",
          shape: "circle",
          count: allCount,
          href: link({ category: undefined, selected: undefined }),
          active: !sp.category,
        },
        ...QUESTION_CATEGORIES.map((c) => ({
          slug: c.slug,
          label: c.label,
          shape: c.shape,
          count: categoryCounts.get(c.slug) ?? 0,
          href: link({ category: c.slug, selected: undefined }),
          clearHref: link({ category: undefined, selected: undefined }),
          active: sp.category === c.slug,
        })),
      ]}
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
                    className={`ws-row ${active?.id === entry.id ? "ws-row--active" : ""}`}
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
          <h1 className="object-title">{active.question}</h1>
          {/* "Anonymous" is never used unqualified in this product
              (CONTENT-VOICE P3): it would imply a guarantee the system does not
              make. What is true is that classmates cannot see who asked. */}
          <MetaList
            className="qa-detail__meta"
            items={[
              "Asked by a classmate, name not shown",
              `Published ${formatDateTime(active.publishedAt, section.timezone)}`,
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
                  <p className="answer__by">
                    Answered by the teaching team,{" "}
                    {formatDateTime(answer.publishedAt, section.timezone)}
                  </p>
                  <div className="doc">
                    {answer.answer ?? "No answer text was recorded."}
                  </div>
                </section>
              ))
            )}
          </div>

          {/* Anonymity, so it stays — but as one sentence, not three. */}
          <p className="meta" style={{ marginTop: "var(--s7)" }}>
            Staff wrote this wording for the whole class. The original message,
            and who sent it, are never shown here.
          </p>
        </article>
      )}
    </WorkspaceShell>
  );
}
