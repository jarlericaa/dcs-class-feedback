import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { WorkspaceShell, type ShellUser } from "./workspace-shell";
import { SubNav } from "./sub-nav";
import { Breadcrumbs } from "@/components/ui";
import type { NavGroup, NavItem } from "./nav";

/**
 * Single-column pages (the weekly form, history, setup, participation, admin,
 * courses and the rest) render inside the same workspace chrome as the
 * list/detail views, with a standard page head.
 *
 * There is no eyebrow or kicker above the title — DESIGN.md §11 bans it. Where
 * a page needs to say where it is, it uses breadcrumbs; where it needs to
 * divide its body, it uses a StripLabel.
 */

export type Workspace = "student" | "staff" | "home" | "admin";
export type { ShellUser };

const WORKSPACE_LABEL: Record<Workspace, string> = {
  staff: "Staff workspace",
  student: "Student workspace",
  admin: "Platform admin",
  home: "Your workspace",
};

export function AppShell({
  children,
  user,
  workspace,
  navGroups,
  tabs,
  tabGroups,
  tabsLabel,
  tabsMode,
  contextLabel,
  title,
  description,
  actions,
  status,
  breadcrumbs,
  crumbs,
  nested,
  /** student surfaces get the roomier page rhythm */
  roomy,
}: {
  children: ReactNode;
  user: ShellUser;
  workspace: Workspace;
  navGroups: NavGroup[];
  /** peer views of the resource this page belongs to; never global destinations.
   *  A flat strip. Pass `tabGroups` instead for a longer, categorized set. */
  tabs?: NavItem[];
  /** the same peer views, pre-grouped by category */
  tabGroups?: NavGroup[];
  /** names the resource the tabs belong to, e.g. "CS 33" */
  tabsLabel?: string;
  /** section destinations are a menu rather than a second tab strip */
  tabsMode?: "tabs" | "menu";
  contextLabel?: string;
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** a stamp or two shown beside the title */
  status?: ReactNode;
  /**
   * This page sits BELOW a course tab rather than being one — a form, an
   * occurrence, a new-form editor. Hides the tab row, which would otherwise
   * repeat a level the reader has already passed through.
   */
  nested?: boolean;
  /**
   * Pre-rendered trail, for the pages that build an unusual one.
   * Prefer `crumbs` — it appends the active tab for you.
   */
  breadcrumbs?: ReactNode;
  /**
   * The ANCESTOR trail, without the current page.
   *
   * The last crumb is derived from the active course tab, so no page has to
   * remember to add it and no two pages can word it differently — which is how
   * "My courses / CS 33" on one tab and nothing at all on the next happened
   * (`changes.md`: *"participation section and other sections still doesnt
   * follow the breadcrumbs method"*).
   */
  crumbs?: { href?: string; label: string }[];
  roomy?: boolean;
}) {
  /**
   * The course tab bar renders on the course's own tab pages and NOT on pages
   * nested below one — the owner's note: *"the forms thingy is kinda
   * redundant… clicking the one forms show also the same navbar duplicated."*
   *
   * They are right, and it is a hierarchy error rather than a styling one. A
   * form's detail page is a CHILD of Forms, not a sibling of it, so showing a
   * tab row with "Forms" still marked active claims you are choosing between
   * peers when you have already drilled past them. The breadcrumb is what
   * carries a drill-down; the tab bar is what carries a choice between peers.
   *
   * A page says so by passing `nested`. It keeps its own object name as the
   * heading and its breadcrumb; it just does not repeat the tab row.
   */

  /**
   * The active tab, which becomes the trail's last crumb.
   *
   * Read off the same `active` flags the tab bar renders, so the crumb and the
   * underline can never disagree. A tab folded into `More` still counts — being
   * secondary changes where it is drawn, not where you are.
   */
  const activeTab = (
    tabGroups?.flatMap((group) => group.items) ??
    tabs ??
    []
  ).find((item) => item.active);
  const trail =
    crumbs && crumbs.length > 0
      ? [
          ...crumbs,
          ...(activeTab && !nested ? [{ label: activeTab.label }] : []),
        ]
      : null;
  const workspaceLabel = WORKSPACE_LABEL[workspace];

  return (
    <WorkspaceShell
      user={user}
      contextTitle={contextLabel ?? workspaceLabel}
      workspaceLabel={workspaceLabel}
      navGroups={navGroups}
      /*
        Deliberately NOT forwarded. `sidebar.md` §7/§8 put the course tab bar
        "directly below the course header", and the header is rendered here, in
        the page body — so the shell cannot place the bar correctly on its own.
        It is rendered below instead, after the head.

        `WorkspaceShell` keeps the props for the one caller that passes them
        directly (`sections/[id]/qa`), a two-pane route with no page head, where
        the top of the content column is the right place for them.
      */
    >
      {(title || description || actions || breadcrumbs) && (
        <div className={cn("page-head", roomy && "mb-12")}>
          <div className="page-head__text">
            {trail ? <Breadcrumbs items={trail} /> : breadcrumbs}
            {title && (
              <div className="row">
                <h1 className="page-title">{title}</h1>
                {status}
              </div>
            )}
            {description && (
              <div className="page-head__description">{description}</div>
            )}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}

      {/*
        THE COURSE TAB BAR, below the course header (`sidebar.md` §7, §8).
        Forms · Responses · Class lists · Teaching team — horizontal, in the
        main content, replacing the nested vertical sidebar §17 forbids.
      */}
      {!nested && tabGroups && tabGroups.length > 0 && (
        <SubNav
          groups={tabGroups}
          label={tabsLabel ?? contextLabel ?? workspaceLabel}
        />
      )}
      {!nested && !tabGroups && tabs && tabs.length > 0 && (
        <SubNav
          items={tabs}
          label={tabsLabel ?? contextLabel ?? workspaceLabel}
          mode={tabsMode}
        />
      )}

      {children}
    </WorkspaceShell>
  );
}
