import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/session";
import { initials } from "@/lib/datetime";
import {
  IconBack,
  IconChevron,
  IconMenu,
  IconSearch,
} from "@/components/ui/icons";
import { FilterMenu, type FilterGroup } from "@/components/ui/filter-menu";
import { SubNav } from "./sub-nav";
import { NAV_ICONS, type NavGroup, type NavItem } from "./nav";

/**
 * The workspace chrome: a white top bar with a hairline under it, a left rail
 * carrying the account's destinations, a contextual tab strip for the resource
 * on screen, and a body that is either a two-pane list/detail view or a single
 * scrolling page.
 *
 * The rail takes ONE input — `navGroups`, built by `primaryNav` from the
 * account — so it renders identically on every page that account can open. It
 * has no slot for route-specific content on purpose: the previous version let
 * a page inject its own topic list, section switcher and primary button, and
 * the result was a rail that changed shape as the reader moved. Anything that
 * belongs to the current page goes in `tabs`, the page header, or the list
 * pane's filters.
 *
 * The visual world is Class Feedback's own (DESIGN.md). No third-party logo,
 * product name, brand colour or asset is reproduced.
 *
 * Everything the rail offers is derived from the SAME effective permissions the
 * server enforces. Hiding a link is presentation, never authorization.
 */

export interface ShellUser {
  displayName: string;
  email: string;
}

function Rail({
  user,
  workspaceLabel,
  navGroups,
  footer,
}: {
  user: ShellUser;
  workspaceLabel?: string;
  navGroups?: NavGroup[];
  footer?: ReactNode;
}) {
  return (
    <>
      {navGroups?.map((group) => {
        const rows = group.items.map((item) => {
          const Glyph = item.icon ? NAV_ICONS[item.icon] : null;
          return (
            <Link
              key={item.href}
              className={`ws-rail__item ${item.active ? "ws-rail__item--active" : ""}`}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
            >
              <span className="ws-rail__icon">
                {Glyph && <Glyph size={16} />}
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
        });

        /* Always `open`. The disclosure lets a reader fold a long course list
           away for the session; it does not remember, because a rail whose
           height depended on where you had been is the instability this model
           exists to remove. */
        return group.collapsible ? (
          <details className="ws-rail__group" key={group.label} open>
            <summary className="ws-rail__heading ws-rail__heading--toggle">
              {group.label}
              <IconChevron className="ws-rail__chevron" size={13} />
            </summary>
            {rows}
          </details>
        ) : (
          <div key={group.label}>
            <p className="ws-rail__heading">{group.label}</p>
            {rows}
          </div>
        );
      })}

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
  navGroups,
  tabs,
  tabGroups,
  tabsLabel,
  tabsMode,
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
  navGroups?: NavGroup[];
  /** peer views of the resource this page belongs to; never global destinations.
   *  A flat strip. Pass `tabGroups` instead for a longer, categorized set. */
  tabs?: NavItem[];
  /** the same peer views, pre-grouped by category. Takes precedence over `tabs`
   *  when both are passed (they never are). */
  tabGroups?: NavGroup[];
  /** names the resource those views belong to, e.g. "CS 33" */
  tabsLabel?: string;
  /** retained for flat callers that use the compact disclosure */
  tabsMode?: "tabs" | "menu";
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
  /**
   * The rail is present whenever there is anything to put in it, which for a
   * signed-in account is always. It is deliberately NOT conditional on the
   * route: a page that dropped the rail also dropped the mobile menu button
   * with it, so an unauthorized page left the reader with no way out at all.
   */
  const hasRail = !!navGroups?.length;

  const rail = () => (
    <Rail
      user={user}
      workspaceLabel={workspaceLabel}
      navGroups={navGroups}
      footer={railFooter}
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
              <nav className="ws-drawer__panel" aria-label="Primary menu">
                {rail()}
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
          <nav className="ws-rail" aria-label="Primary">
            {rail()}
          </nav>
        )}

        {/* The resource's own views, between the workspace and the page. */}
        {tabGroups && tabGroups.length > 0 && (
          <SubNav groups={tabGroups} label={tabsLabel ?? contextTitle} />
        )}
        {!tabGroups && tabs && tabs.length > 0 && (
          <SubNav
            items={tabs}
            label={tabsLabel ?? contextTitle}
            mode={tabsMode}
          />
        )}

        {listPane}

        {listPane ? (
          <main
            className={`ws-detail ${
              selection && !selection.active ? "ws-detail--hidden" : ""
            }`}
            id="main-content"
            tabIndex={-1}
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
          <main className="ws-page" id="main-content" tabIndex={-1}>
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
  primaryFilter,
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
  /**
   * The one dimension a reader changes constantly, promoted out of the popover
   * to a control that states its current value without being opened. Everything
   * else stays in `filterGroups`, because a second always-visible control turns
   * the top of the list into a settings panel.
   */
  primaryFilter?: ReactNode;
  /** every remaining narrowing dimension, in ONE popover */
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
      {primaryFilter && <div className="ws-list__primary">{primaryFilter}</div>}
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
