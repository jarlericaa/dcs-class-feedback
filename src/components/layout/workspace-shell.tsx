import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/session";
import { initials } from "@/lib/datetime";
import type { NavGroup } from "./nav";

/**
 * The workspace chrome: a fixed brand bar, a left rail carrying the course
 * list and the category list, and a body that is either a two-pane
 * list/detail view or a single scrolling page.
 *
 * This follows the information architecture in docs/CLAUDE_UI_SCREEN_SPEC.md
 * (course rail → category list → dense list → selected detail). The identity
 * is Class Feedback's own: no third-party logo, product name, or brand asset
 * is reproduced.
 *
 * Everything the rail offers is derived from the same effective permissions
 * the server enforces. Hiding a link is still never authorization.
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
  active?: boolean;
  /** href that clears the filter, shown as an × on the active row */
  clearHref?: string;
}

function Rail({
  user,
  primaryAction,
  courses,
  categories,
  navGroups,
  footer,
}: {
  user: ShellUser;
  primaryAction?: { href: string; label: string };
  courses?: RailCourse[];
  categories?: RailCategory[];
  navGroups?: NavGroup[];
  footer?: ReactNode;
}) {
  return (
    <>
      {primaryAction && (
        <Link className="ws-new-thread" href={primaryAction.href}>
          <span aria-hidden="true">✎</span>
          {primaryAction.label}
        </Link>
      )}

      {courses && courses.length > 0 && (
        <>
          <p className="ws-rail__heading">Courses</p>
          {courses.map((course) => (
            <Link
              key={course.href}
              className={`ws-rail__item ${course.active ? "ws-rail__item--active" : ""}`}
              href={course.href}
              aria-current={course.active ? "page" : undefined}
            >
              <span />
              <span>{course.label}</span>
              {course.count ? (
                <span className="ws-rail__count">{course.count}</span>
              ) : null}
            </Link>
          ))}
        </>
      )}

      {categories && categories.length > 0 && (
        <>
          <p className="ws-rail__heading">Categories</p>
          {categories.map((category) => (
            <Link
              key={category.slug}
              className={`ws-rail__item ${category.active ? "ws-rail__item--active" : ""}`}
              href={category.active ? (category.clearHref ?? category.href) : category.href}
              aria-current={category.active ? "true" : undefined}
            >
              <span className={`cat-dot cat--${category.slug}`} aria-hidden="true" />
              <span>{category.label}</span>
              {category.active && (
                <span className="ws-rail__clear" aria-hidden="true">
                  ×
                </span>
              )}
            </Link>
          ))}
        </>
      )}

      {navGroups?.map((group) => (
        <div key={group.label}>
          <p className="ws-rail__heading">{group.label}</p>
          {group.items.map((item) => (
            <Link
              key={item.href}
              className={`ws-rail__item ${item.active ? "ws-rail__item--active" : ""}`}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
            >
              <span aria-hidden="true" style={{ width: 10, textAlign: "center" }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      ))}

      <div className="ws-rail__footer">
        {footer}
        <div style={{ marginTop: 8 }}>{user.email}</div>
        <form action={signOutAction}>
          <button
            type="submit"
            style={{
              marginTop: 6,
              padding: 0,
              border: 0,
              background: "none",
              color: "var(--link)",
              fontSize: "11.5px",
              fontWeight: 600,
            }}
          >
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
  primaryAction,
  courses,
  categories,
  navGroups,
  railFooter,
  notificationCount,
  listPane,
  children,
}: {
  user: ShellUser;
  /** e.g. "DCS-101 Section A — Feedback" */
  contextTitle: string;
  primaryAction?: { href: string; label: string };
  courses?: RailCourse[];
  categories?: RailCategory[];
  navGroups?: NavGroup[];
  railFooter?: ReactNode;
  notificationCount?: number;
  /** when present the body is a two-pane list/detail view */
  listPane?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ws">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="ws-topbar">
        <Link className="ws-brand" href="/" aria-label="Class Feedback home">
          <span className="ws-brand__mark" aria-hidden="true">
            cf
          </span>
          <span className="ws-topbar__title">{contextTitle}</span>
        </Link>
        <span className="ws-topbar__spacer" />
        <div className="ws-topbar__actions">
          <Link className="ws-iconbtn" href="/" aria-label="Overview">
            <span aria-hidden="true">⌂</span>
          </Link>
          <Link
            className="ws-iconbtn"
            href="/"
            aria-label={
              notificationCount
                ? `${notificationCount} items need attention`
                : "Nothing needs attention"
            }
          >
            <span aria-hidden="true">🔔</span>
            {notificationCount ? (
              <span className="ws-iconbtn__badge" aria-hidden="true">
                {notificationCount}
              </span>
            ) : null}
          </Link>
          <span
            className="ws-iconbtn"
            title={user.displayName}
            aria-label={`Signed in as ${user.email}`}
          >
            <span aria-hidden="true">{initials(user.displayName)}</span>
          </span>
        </div>
      </header>

      <div className="ws-body">
        <nav className="ws-rail" aria-label="Workspace">
          <Rail
            user={user}
            primaryAction={primaryAction}
            courses={courses}
            categories={categories}
            navGroups={navGroups}
            footer={railFooter}
          />
        </nav>

        {listPane}

        {listPane ? (
          <main className="ws-detail" id="main-content">
            <div className="ws-detail__inner">{children}</div>
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

/** Search + filter + scrolling rows: the middle pane of the workspace. */
export function ListPane({
  searchAction,
  searchName = "q",
  searchValue,
  searchPlaceholder = "Search",
  hiddenFields,
  filter,
  children,
}: {
  searchAction?: string;
  searchName?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  hiddenFields?: Record<string, string | undefined>;
  filter?: { current: string; options: { key: string; label: string; href: string }[] };
  children: ReactNode;
}) {
  return (
    <section className="ws-list" aria-label="Threads">
      <form className="ws-search" method="get" action={searchAction} role="search">
        {Object.entries(hiddenFields ?? {}).map(([key, value]) =>
          value ? <input key={key} type="hidden" name={key} value={value} /> : null,
        )}
        <span className="ws-search__icon" aria-hidden="true">
          ⌕
        </span>
        <label className="visually-hidden" htmlFor="ws-search-input">
          Search
        </label>
        <input
          id="ws-search-input"
          name={searchName}
          type="search"
          placeholder={searchPlaceholder}
          defaultValue={searchValue ?? ""}
        />
      </form>

      {filter && (
        <div className="ws-filterbar">
          <details className="ws-filter">
            <summary>
              Filter <span aria-hidden="true">⌄</span>
            </summary>
            <div className="ws-filter__menu" role="menu">
              {filter.options.map((option) => (
                <Link
                  key={option.key}
                  className="ws-filter__item"
                  href={option.href}
                  role="menuitem"
                >
                  <span className="ws-filter__check" aria-hidden="true">
                    {filter.current === option.key ? "✓" : ""}
                  </span>
                  {option.label}
                  {filter.current === option.key && (
                    <span className="visually-hidden">(selected)</span>
                  )}
                </Link>
              ))}
            </div>
          </details>
        </div>
      )}

      <div className="ws-list__scroll">{children}</div>
    </section>
  );
}

export function DayGroupHeading({ children }: { children: ReactNode }) {
  return <p className="ws-daygroup">{children}</p>;
}
