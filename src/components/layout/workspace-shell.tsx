import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { initials } from "@/lib/datetime";
import { IconBack, IconMenu, IconSearch } from "@/components/ui/icons";
import { FilterMenu, type FilterGroup } from "@/components/ui/filter-menu";
import { SubNav } from "./sub-nav";
import type { NavGroup, NavItem } from "./nav";
import { Rail } from "./rail";
import { RailToggle } from "./rail-toggle";
import { readRailCollapsed } from "@/lib/rail-state";
import { cn } from "@/lib/cn";
import { Announcer } from "@/components/ui/announcer";

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

export async function WorkspaceShell({
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

  /**
   * Read on the server so the rail paints in the shape the reader chose, first
   * time, on every navigation (decision N-2). A preference held only in the
   * browser would show the expanded rail and snap it narrow after hydration.
   */
  const railCollapsed = await readRailCollapsed();

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
    <div className={cn("ws", listPane && "ws--panes")}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      {/*
        Announces `?ok=` / `?error=` once, politely (§5.4). Here rather than in
        `AppShell` so the two-pane routes that render this shell directly are
        covered too, and here rather than at thirty call sites because the
        message is already in the URL — see `announcer.tsx`.
      */}
      <Suspense fallback={null}>
        <Announcer />
      </Suspense>

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
                {/* The same rail, and deliberately never collapsed: this panel
                    is a full-width sheet on a phone, where 60px of icons would
                    be a worse answer than the sheet the reader just opened. It
                    stays expanded because `data-rail` lives on the rail `<nav>`
                    below, which this is not inside. */}
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

      {/*
        `data-rail` lives on the BODY, not on the rail, because the collapse
        handle is now a sibling of the rail rather than a child of it
        (`sidebar.md` §4) and has to read the same state. The mobile drawer is
        in the header, outside this element, so it still never inherits the
        collapsed shape — which was the reason the attribute was moved off the
        shell root in the first place.
      */}
      <div
        className="ws-body relative"
        data-rail={railCollapsed ? "min" : "full"}
        id="ws-body"
      >
        {hasRail && (
          <nav
            className={cn(
              /*
                `ws-rail` is KEPT as a hook, with no geometry attached to it any
                more — three rules elsewhere still select it and all three are
                still wanted: the rail's focus ring and text selection (scoped
                to `.ws-rail` AND `.ws-drawer__panel`, since `--focus` is
                invisible on this ground), `display: none` below 860px, and the
                print block. Dropping the class silently un-hid the rail on a
                phone, so it rendered behind the drawer — caught by measuring,
                not by looking.

                The rail's geometry, in utilities (`sidebar.md`). 35 `.ws-rail*`
                rules were deleted from `legacy.css` in the same change.
              */
              "ws-rail",
              "flex shrink-0 flex-col overflow-y-auto overflow-x-hidden",
              /*
                §15: below 860px the rail goes and the drawer takes over. This
                HAS to be a utility: `legacy.css` already said
                `@media (max-width: 860px) { .ws-rail { display: none } }`, but
                that file is imported into `@layer components` and `flex` above
                is a utility — a later layer — so the utility won and the rail
                rendered on a phone behind the open drawer. Layer order beats
                media queries, and a rule in the wrong layer is a rule that does
                nothing.
              */
              "max-lg:hidden",
              /*
                Single-column routes scroll the page, so the rail sticks under
                the top bar and keeps its own full height — the rule that used
                to do this went with the block, and without it the rail scrolls
                away on a long page.
              */
              "sticky top-topbar h-[calc(100dvh-var(--spacing-topbar))] self-start",
              "bg-rail px-4 pt-5 pb-5",
              "border-r border-r-rail-deep",
              /*
                §5: 248 → 72 on a 200ms transition, and the LAYOUT resizes with
                it. `width` and `flex-basis` move together because a flex item's
                main size comes from the basis; animating one without the other
                would have transitioned nothing.

                It does not overlay the page. An earlier version expanded over
                the content on hover, which §5 rules out ("pushing/resizing the
                application layout rather than sitting over the content") — and
                removing it is what lets the toggle live inside the rail at all,
                since nothing re-expands the rail while the button holds focus.
              */
              "w-rail flex-[0_0_var(--spacing-rail)]",
              "in-data-[rail=min]:w-rail-min",
              "in-data-[rail=min]:flex-[0_0_var(--spacing-rail-min)]",
              "in-data-[rail=min]:px-4",
              "transition-[width,flex-basis] duration-200 ease-out",
              /*
                §15: a tablet gets the icon rail and a phone gets the drawer.
                Below 1024px the rail is forced narrow and the toggle is hidden
                with it — offering a control that cannot change anything is the
                defect this whole pass started with.
              */
              "max-xl:w-rail-min max-xl:flex-[0_0_var(--spacing-rail-min)]",
            )}
            aria-label="Primary"
            id="ws-rail"
          >
            {rail()}
          </nav>
        )}

        {/*
          THE COLLAPSE HANDLE (`sidebar.md` §4).

          A sibling of the rail, not a child, and `fixed` rather than absolute.
          Both of those are forced:

          - **Not a child.** The rail is its own scroll container
            (`overflow-y: auto`), so a handle inside it that straddles the right
            edge would be clipped by it. The same constraint killed the per-row
            flyout twice; this time the element simply lives outside.
          - **`fixed`, not `absolute`.** §4 wants it vertically centred on the
            sidebar. `.ws-body` can be far taller than the viewport on a long
            page, so `absolute top-1/2` would centre it on the DOCUMENT and
            scroll away. The rail is a sticky, viewport-tall column, so the
            viewport's middle IS the sidebar's middle.

          `-translate-x-1/2` is what makes it straddle the boundary rather than
          sit beside it, and `left` transitions with the rail so the handle stays
          attached to the edge for the whole 200ms (§5).
        */}
        {hasRail && (
          <div
            className={cn(
              "fixed top-1/2 z-30 -translate-x-1/2 -translate-y-1/2",
              "left-rail in-data-[rail=min]:left-rail-min",
              "transition-[left] duration-200 ease-out",
              // Below 1024px the width is forced, so the control cannot change
              // anything; below 860px there is no rail to collapse at all.
              "max-xl:hidden",
            )}
          >
            <RailToggle collapsed={railCollapsed} />
          </div>
        )}

        {/*
          ONE sidebar, then the content column (`sidebar.md` §1, §17).

          The course's own views used to be a second 200px vertical column
          sitting between the rail and the page — a nested sidebar, which §17
          forbids outright. They are now a horizontal tab bar at the top of this
          column, above the panes, so the hierarchy reads
          rail → course tabs → content instead of rail → rail → content.
        */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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

          <div className="flex min-h-0 min-w-0 flex-1">
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
