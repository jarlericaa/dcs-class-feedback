import Link from "next/link";
import { requireUser, toShellUser } from "@/lib/session";
import { formatDateTime } from "@/lib/datetime";
import {
  avatarColour,
  categoryClass,
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
  staffSectionNav,
  studentSectionNav,
} from "@/components/layout/nav";
import { AccessDenied } from "@/components/ui";
import { listSectionQa } from "@/modules/publishing";
import { authz, AuthzError } from "@/modules/authz";
import { getSectionWithCourse, listSectionsForUser } from "@/modules/catalog";

/**
 * Section Q&A archive — the class-facing knowledge archive, as a three-pane
 * workspace: course/category rail, dense searchable list, selected answer.
 *
 * Access is enforced by listSectionQa (enrolled students and section staff
 * only). Its projection has no source links, identities or drafts, so nothing
 * rendered here can reveal who asked.
 */

const TIME_FILTERS = [
  { key: "all", label: "All" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "legacy", label: "Earlier semesters" },
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

  let entries;
  try {
    entries = await listSectionQa(user.id, sectionId, {
      search: sp.q,
      category: sp.category as "content" | "logistics" | "misc" | undefined,
    });
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

  const { section, course } = await getSectionWithCourse(sectionId);
  const access = await authz.getSectionAccess(user.id, sectionId);
  const { staffSections, studentSections, courseById } =
    await listSectionsForUser(user.id);

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
  const visible = entries.filter((entry) => {
    const at = entry.publishedAt?.getTime() ?? 0;
    switch (filter) {
      case "week":
        return now - at < 7 * 86_400_000;
      case "month":
        return now - at < 30 * 86_400_000;
      case "legacy":
        return entry.sourceOrigin === "legacy";
      default:
        return true;
    }
  });

  const active =
    visible.find((entry) => entry.id === sp.selected) ?? visible[0] ?? null;
  const groups = groupByDay(
    visible,
    (entry) => entry.publishedAt ?? new Date(0),
    new Date(),
    section.timezone,
  );
  const isFiltered = !!(sp.q?.trim() || sp.category || filter !== "all");

  // Courses in the rail are the user's real sections, in whichever capacity.
  const railSections = [
    ...studentSections,
    ...staffSections.filter((s) => !studentSections.some((x) => x.id === s.id)),
  ];

  return (
    <WorkspaceShell
      user={toShellUser(user)}
      contextTitle={`${course.code} ${section.term} — Q&A`}
      primaryAction={
        access?.staff
          ? undefined
          : { href: `/sections/${sectionId}`, label: "Weekly form" }
      }
      courses={railSections.map((s) => ({
        href: `/sections/${s.id}/qa`,
        label: `${courseById.get(s.courseId)?.code ?? ""} ${s.title}`.trim(),
        active: s.id === sectionId,
      }))}
      navGroups={navGroups}
      categories={QUESTION_CATEGORIES.map((c) => ({
        slug: c.slug,
        label: c.label,
        href: link({ category: c.slug, selected: undefined }),
        clearHref: link({ category: undefined, selected: undefined }),
        active: sp.category === c.slug,
      }))}
      railFooter={
        <span>Visible to this section only. Askers are always anonymous.</span>
      }
      selection={{
        active: !!sp.selected,
        backHref: link({ selected: undefined }),
      }}
      listPane={
        <ListPane
          hiddenOnMobile={!!sp.selected}
          searchAction={base}
          searchValue={sp.q}
          searchPlaceholder="Search questions and answers"
          hiddenFields={{ category: sp.category, filter: sp.filter }}
          filter={{
            current: filter,
            options: TIME_FILTERS.map((f) => ({
              key: f.key,
              label: f.label,
              href: link({ filter: f.key, selected: undefined }),
            })),
          }}
        >
          {visible.length === 0 ? (
            <p style={{ padding: "22px 16px", color: "#6b7280" }}>
              {isFiltered
                ? "No published answers match. Try a different word, or clear the filters."
                : "No answers have been published to this class yet."}
            </p>
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
                      <span className="ws-row__kind" aria-hidden="true">
                        ?
                      </span>
                      <span className="ws-row__title">{entry.question}</span>
                    </span>
                    <span className="ws-row__meta">
                      <span className={categoryClass(entry.category, "label")}>
                        {categoryShortLabel(entry.category)}
                      </span>
                      <span>Anonymous</span>
                      <span>{shortAgo(entry.publishedAt)}</span>
                      {entry.sourceOrigin === "legacy" && (
                        <span title="Carried over from an earlier semester">
                          earlier semester
                        </span>
                      )}
                      <span className="ws-row__count">
                        <span aria-hidden="true">✓</span> answered
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ))
          )}
        </ListPane>
      }
    >
      {!active ? (
        <div className="ws-empty-detail">
          <div>
            <p style={{ fontSize: 17, marginBottom: 6 }}>
              {isFiltered
                ? "Nothing matches your search"
                : "No published answers yet"}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="ws-thread-head">
            <h1 className="ws-thread-title">{active.question}</h1>
          </div>

          <div className="ws-post">
            <span className="ws-avatar ws-avatar--anon" aria-hidden="true">
              ?
            </span>
            <div style={{ minWidth: 0 }}>
              <p className="ws-post__who" style={{ margin: 0 }}>
                Anonymous
              </p>
              <p className="ws-post__when" style={{ margin: 0 }}>
                Published{" "}
                {formatDateTime(active.publishedAt, section.timezone)}
              </p>
            </div>
          </div>

          <h2 className="ws-answers-heading">1 Answer</h2>

          <div className="ws-answer">
            <div className="ws-post">
              <span
                className="ws-avatar"
                style={{ background: avatarColour(course.code) }}
                aria-hidden="true"
              >
                {course.code.slice(0, 1).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                >
                  <div>
                    <p className="ws-post__who" style={{ margin: 0 }}>
                      Teaching team
                    </p>
                    <p className="ws-post__when" style={{ margin: 0 }}>
                      {formatDateTime(active.publishedAt, section.timezone)}
                    </p>
                  </div>
                  <span className="ws-endorsed">
                    <span aria-hidden="true">✔</span> STAFF ANSWER
                  </span>
                </div>
                <div className="ws-post__body">
                  {active.answer ?? "No answer text was recorded."}
                </div>
              </div>
            </div>
          </div>

          <p style={{ marginTop: 28, color: "#6b7280", fontSize: 13.5 }}>
            Answers are published to this class section only, never to the
            public internet.
          </p>
        </>
      )}
    </WorkspaceShell>
  );
}
