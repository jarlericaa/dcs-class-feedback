import Link from "next/link";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionNav, studentSectionNav } from "@/components/layout/nav";
import { AccessDenied, Badge, EmptyState } from "@/components/ui";
import { listSectionQa } from "@/modules/publishing";
import { authz, AuthzError } from "@/modules/authz";
import { getSectionWithCourse } from "@/modules/catalog";

/**
 * Section Q&A archive — a list/detail knowledge archive, not a social feed.
 *
 * Access is enforced by listSectionQa (enrolled students and section staff
 * only). The projection it returns has no source links, no identities and no
 * drafts, so nothing on this page can leak who asked.
 */
export default async function QaArchivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; category?: string; selected?: string }>;
}) {
  const user = await requireUser();
  const { id: sectionId } = await params;
  const { q, category, selected } = await searchParams;

  let entries;
  try {
    entries = await listSectionQa(user.id, sectionId, {
      search: q,
      category: category as "content" | "logistics" | "misc" | undefined,
    });
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell user={user} workspace="student" navGroups={[]} title="Class Q&A">
          <AccessDenied what="this section's Q&A archive" />
        </AppShell>
      );
    }
    throw err;
  }

  const { section, course } = await getSectionWithCourse(sectionId);
  const access = await authz.getSectionAccess(user.id, sectionId);
  const isStaff = !!access?.staff;
  const currentPath = `/sections/${sectionId}/qa`;

  const active =
    entries.find((entry) => entry.id === selected) ?? entries[0] ?? null;
  const isFiltered = !!(q?.trim() || category);

  return (
    <AppShell
      user={user}
      workspace={isStaff ? "staff" : "student"}
      navGroups={
        isStaff && access
          ? staffSectionNav(access, currentPath)
          : studentSectionNav(sectionId, currentPath)
      }
      contextLabel={section.title}
      eyebrow={`${course.code} · ${section.term}`}
      title="Class Q&A archive"
      description="Questions asked by this class, answered by the teaching team. Askers are always anonymous."
      actions={<Badge tone="green">Visible to this section only</Badge>}
    >
      <div className="stack-gap">
        <form className="filter-bar" method="get" role="search">
          <label className="visually-hidden" htmlFor="qa-search">
            Search questions and answers
          </label>
          <input
            id="qa-search"
            className="field"
            name="q"
            type="search"
            placeholder="Search questions and answers"
            defaultValue={q ?? ""}
          />
          <label className="visually-hidden" htmlFor="qa-category">
            Filter by category
          </label>
          <select
            id="qa-category"
            className="select-field"
            name="category"
            defaultValue={category ?? ""}
            style={{ flex: "0 1 200px" }}
          >
            <option value="">All categories</option>
            <option value="content">Course content</option>
            <option value="logistics">Logistics</option>
            <option value="misc">Something else</option>
          </select>
          <button className="button button--secondary" type="submit">
            Search
          </button>
          {isFiltered && (
            <Link className="button button--quiet" href={currentPath}>
              Clear
            </Link>
          )}
        </form>

        {entries.length === 0 ? (
          <EmptyState
            title={
              isFiltered ? "No answers match your search" : "No published answers yet"
            }
          >
            {isFiltered
              ? "Try a different word, or clear the filters to see everything published to this class."
              : "When your teaching team publishes an answer to the class, it appears here. Answers are always anonymous."}
          </EmptyState>
        ) : (
          <div className="archive-layout">
            <section className="card qa-list" aria-label="Published answers">
              {entries.map((entry) => (
                <Link
                  key={entry.id}
                  className={`qa-row ${active?.id === entry.id ? "qa-row--active" : ""}`}
                  href={`${currentPath}?${new URLSearchParams({
                    ...(q ? { q } : {}),
                    ...(category ? { category } : {}),
                    selected: entry.id,
                  })}`}
                  aria-current={active?.id === entry.id ? "true" : undefined}
                >
                  <span className="qa-row__meta">
                    <span>{categoryLabel(entry.category)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDate(entry.publishedAt, section.timezone)}</span>
                    {entry.sourceOrigin === "legacy" && (
                      <Badge tone="neutral">Earlier semester</Badge>
                    )}
                  </span>
                  <h2>{entry.question}</h2>
                  {entry.answer && <p>{truncate(entry.answer, 120)}</p>}
                </Link>
              ))}
            </section>

            {active && (
              <article className="card answer-panel" aria-label="Selected answer">
                <p className="section-kicker">
                  {categoryLabel(active.category)} ·{" "}
                  {formatDate(active.publishedAt, section.timezone)}
                </p>
                <h2>{active.question}</h2>
                <p className="muted small">
                  Asked by a student in this section. Their identity and original
                  wording are never shown.
                </p>
                <div className="answer-panel__answer">
                  <strong>Answer from the teaching team</strong>
                  <p>{active.answer ?? "No answer text was recorded."}</p>
                </div>
              </article>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function categoryLabel(category: string | null): string {
  switch (category) {
    case "content":
      return "Course content";
    case "logistics":
      return "Logistics";
    case "misc":
      return "Something else";
    default:
      return "Uncategorized";
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}
