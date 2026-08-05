import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/session";
import { initials } from "@/lib/datetime";
import { IconBack, IconCheck, IconMenu, IconSearch } from "@/components/ui/icons";
import { FilterMenu, type FilterGroup } from "@/components/ui/filter-menu";
import { CategoryMark } from "@/components/ui/icons";
import { NAV_ICONS, type NavGroup } from "./nav";

/**
 * The workspace chrome: a white top bar with a hairline under it, a left rail
 * carrying the section's destinations, and a body that is either a two-pane
 * list/detail view or a single scrolling page.
 *
 * The information architecture follows docs/CLAUDE_UI_SCREEN_SPEC.md (course
 * rail → category list → dense list → selected detail); the visual world is
 * Class Feedback's own (DESIGN.md). No third-party logo, product name, brand
 * colour or asset is reproduced.
 *
 * Everything the rail offers is derived from the SAME effective permissions the
 * server enforces. Hiding a link is presentation, never authorization.
 */

export interface ShellUser {
  displayName: string;
  email: string;
}

export interface RailCourse {
  href: string;
  label: string;
  active?: boolean;
  /** real count only — never a decorative number */
  count?: number;
}

export interface RailCategory {
  href: string;
  label: string;
  slug: string;
  /** drawn silhouette; categories never carry a colour */
  shape: "square" | "triangle" | "circle";
  active?: boolean;
  /** real count for the current view */
  count?: number;
  /** href that clears the filter when the active row is clicked */
  clearHref?: string;
}

function Rail({
  user,
  workspaceLabel,
  primaryAction,
  courses,
  categories,
  navGroups,
  footer,
  idPrefix,
}: {
  user: ShellUser;
  workspaceLabel?: string;
  primaryAction?: { href: string; label: string };
  courses?: RailCourse[];
  categories?: RailCategory[];
  navGroups?: NavGroup[];
  footer?: ReactNode;
  /** the rail is rendered twice (persistent + drawer); ids must stay unique */
  idPrefix: string;
}) {
  return (
    <>
      {primaryAction && (
        <Link className="ws-rail__action" href={primaryAction.href}>
          {primaryAction.label}
        </Link>
      )}

      {navGroups?.map((group) => (
        <div key={group.label}>
          <p className="ws-rail__heading">{group.label}</p>
          {group.items.map((item) => {
            const Glyph = NAV_ICONS[item.icon];
            return (
              <Link
                key={item.href}
                className={`ws-rail__item ${item.active ? "ws-rail__item--active" : ""}`}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
              >
                <span className="ws-rail__icon">
                  <Glyph size={16} />
                </span>
                <span className="ws-rail__text">{item.label}</span>
                {item.count ? (
                  <span className="ws-rail__count">
                    {item.count}
                    <span className="visually-hidden"> needing review</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}

      {categories && categories.length > 0 && (
        <>
          <p className="ws-rail__heading">Topic</p>
          {categories.map((category) => (
            <Link
              key={category.slug}
              className={`ws-rail__item ${category.active ? "ws-rail__item--active" : ""}`}
              href={
                category.active
                  ? (category.clearHref ?? category.href)
                  : category.href
              }
              aria-current={category.active ? "true" : undefined}
            >
              <span className="ws-rail__icon">
                <CategoryMark shape={category.shape} size={9} />
              </span>
              <span className="ws-rail__text">{category.label}</span>
              {category.count !== undefined && (
                <span className="meta">{category.count}</span>
              )}
              {category.active && (
                <>
                  <IconCheck size={13} />
                  <span className="visually-hidden">(filtering by this)</span>
                </>
              )}
            </Link>
          ))}
        </>
      )}

      {courses && courses.length > 0 && (
        <>
          <p className="ws-rail__heading" id={`${idPrefix}-courses`}>
            {courses.length === 1 ? "Class section" : "Class sections"}
          </p>
          {courses.map((course) => (
            <Link
              key={course.href}
              className={`ws-rail__item ${course.active ? "ws-rail__item--active" : ""}`}
              href={course.href}
              aria-current={course.active ? "page" : undefined}
            >
              <span className="ws-rail__text">{course.label}</span>
              {course.count ? (
                <span className="ws-rail__count">
                  {course.count}
                  <span className="visually-hidden"> needing review</span>
                </span>
              ) : null}
            </Link>
          ))}
        </>
      )}

      <div className="ws-rail__footer">
        {workspaceLabel && <p>{workspaceLabel}</p>}
        {footer}
        <p style={{ marginTop: 4, overflowWrap: "anywhere" }}>{user.email}</p>
        <form action={signOutAction}>
          <button className="ws-signout" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

export function WorkspaceShell({
  user,
  contextTitle,
  workspaceLabel,
  primaryAction,
  courses,
  categories,
  navGroups,
  railFooter,
  listPane,
  selection,
  children,
}: {
  user: ShellUser;
  /** e.g. "DCS-101 Section A — Review" */
  contextTitle: string;
  /** "Student workspace", "Staff workspace" — stated, never inferred */
  workspaceLabel?: string;
  primaryAction?: { href: string; label: string };
  courses?: RailCourse[];
  categories?: RailCategory[];
  navGroups?: NavGroup[];
  railFooter?: ReactNode;
  /** when present the body is a two-pane list/detail view */
  listPane?: ReactNode;
  /**
   * Which of the two panes is the current view once they stack on a phone.
   * `active` means a row was explicitly chosen, so the detail replaces the
   * list and `backHref` returns to it. Ignored above 860px, where both panes
   * are visible together.
   */
  selection?: { active: boolean; backHref: string };
  children: ReactNode;
}) {
  const hasRail = !!(
    primaryAction ||
    courses?.length ||
    categories?.length ||
    navGroups?.length
  );

  const rail = (idPrefix: string) => (
    <Rail
      user={user}
      workspaceLabel={workspaceLabel}
      primaryAction={primaryAction}
      courses={courses}
      categories={categories}
      navGroups={navGroups}
      footer={railFooter}
      idPrefix={idPrefix}
    />
  );

  return (
    /* Two shell modes (globals.css): a single-column route is an ordinary
       scrolling document; a multi-pane route owns one viewport box whose panes
       scroll independently. `listPane` is what decides which. */
    <div className={`ws${listPane ? " ws--panes" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="ws-topbar">
        <Link className="ws-brand" href="/">
          <span className="ws-brand__mark" aria-hidden="true">
            cf
          </span>
          <span className="ws-brand__name">Class Feedback</span>
        </Link>
        {contextTitle && (
          <>
            <span className="ws-topbar__divider" aria-hidden="true" />
            <span className="ws-topbar__title">{contextTitle}</span>
          </>
        )}
        <span className="ws-topbar__spacer" />
        <div className="ws-topbar__actions">
          {hasRail && (
            <details className="ws-drawer">
              <summary>
                <IconMenu size={16} />
                Menu
              </summary>
              <nav className="ws-drawer__panel" aria-label="Workspace">
                {rail("drawer")}
              </nav>
            </details>
          )}
          <span className="ws-account">
            <span className="ws-account__mark" aria-hidden="true">
              {initials(user.displayName)}
            </span>
            <span className="ws-account__email">{user.email}</span>
          </span>
        </div>
      </header>

      <div className="ws-body">
        {hasRail && (
          <nav className="ws-rail" aria-label="Workspace">
            {rail("rail")}
          </nav>
        )}

        {listPane}

        {listPane ? (
          <main
            className={`ws-detail ${
              selection && !selection.active ? "ws-detail--hidden" : ""
            }`}
            id="main-content"
          >
            <div className="ws-detail__inner">
              {selection?.active && (
                <Link className="ws-backlink" href={selection.backHref}>
                  <IconBack size={15} /> Back to the list
                </Link>
              )}
              {children}
            </div>
          </main>
        ) : (
          <main className="ws-page" id="main-content">
            <div className="ws-page__inner">{children}</div>
          </main>
        )}
      </div>
    </div>
  );
}

/** Search + filters + scrolling rows: the middle pane of the workspace. */
export function ListPane({
  label = "Results",
  header,
  searchAction,
  searchName = "q",
  searchValue,
  searchPlaceholder = "Search",
  hiddenFields,
  filterGroups,
  /** true once a row is selected: the detail takes over on a stacked layout */
  hiddenOnMobile,
  children,
}: {
  label?: string;
  /** the pane's own title block — what this list is, and where it sits */
  header?: ReactNode;
  searchAction?: string;
  searchName?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  hiddenFields?: Record<string, string | undefined>;
  /** every narrowing dimension, in ONE popover */
  filterGroups?: (FilterGroup | undefined)[];
  hiddenOnMobile?: boolean;
  children: ReactNode;
}) {
  const groups = (filterGroups ?? []).filter(
    (group): group is FilterGroup => !!group,
  );
  return (
    <section
      className={`ws-list ${hiddenOnMobile ? "ws-list--hidden" : ""}`}
      aria-label={label}
    >
      {header}
      <form
        className="ws-search"
        method="get"
        action={searchAction}
        role="search"
      >
        {Object.entries(hiddenFields ?? {}).map(([key, value]) =>
          value ? (
            <input key={key} type="hidden" name={key} value={value} />
          ) : null,
        )}
        <IconSearch className="ws-search__icon" size={16} />
        <label className="visually-hidden" htmlFor="ws-search-input">
          {searchPlaceholder}
        </label>
        <input
          id="ws-search-input"
          name={searchName}
          type="search"
          placeholder={searchPlaceholder}
          defaultValue={searchValue ?? ""}
        />
        <button className="visually-hidden" type="submit">
          Search
        </button>
      </form>

      {groups.length > 0 && <FilterMenu groups={groups} />}

      <div className="ws-list__scroll">{children}</div>
    </section>
  );
}

export function DayGroupHeading({ children }: { children: ReactNode }) {
  return <p className="ws-daygroup">{children}</p>;
}
