import type { ReactNode } from "react";
import { WorkspaceShell, type ShellUser } from "./workspace-shell";
import type { NavGroup } from "./nav";

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
  admin: "Platform administration",
  home: "Your workspace",
};

export function AppShell({
  children,
  user,
  workspace,
  navGroups,
  contextLabel,
  title,
  description,
  actions,
  status,
  breadcrumbs,
  /** student surfaces get the roomier page rhythm */
  roomy,
}: {
  children: ReactNode;
  user: ShellUser;
  workspace: Workspace;
  navGroups: NavGroup[];
  contextLabel?: string;
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** a stamp or two shown beside the title */
  status?: ReactNode;
  breadcrumbs?: ReactNode;
  roomy?: boolean;
}) {
  const workspaceLabel = WORKSPACE_LABEL[workspace];

  return (
    <WorkspaceShell
      user={user}
      contextTitle={contextLabel ?? workspaceLabel}
      workspaceLabel={workspaceLabel}
      navGroups={navGroups}
    >
      {(title || description || actions || breadcrumbs) && (
        <div
          className="page-head"
          style={roomy ? { marginBottom: "var(--s7)" } : undefined}
        >
          <div className="page-head__text">
            {breadcrumbs}
            {title && (
              <div className="row">
                <h1 className="page-title">{title}</h1>
                {status}
              </div>
            )}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </WorkspaceShell>
  );
}
