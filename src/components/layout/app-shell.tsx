import type { ReactNode } from "react";
import { WorkspaceShell, type ShellUser } from "./workspace-shell";
import type { NavGroup } from "./nav";

/**
 * Adapter kept so the single-column pages (setup, participation, admin,
 * courses, and the rest) render inside the same workspace chrome as the
 * list/detail views without each one being rewritten.
 *
 * New list/detail surfaces should use WorkspaceShell directly.
 */

export type Workspace = "student" | "staff" | "home" | "admin";
export type { ShellUser };

export function AppShell({
  children,
  user,
  workspace,
  navGroups,
  contextLabel,
  eyebrow,
  title,
  description,
  actions,
  breadcrumbs,
}: {
  children: ReactNode;
  user: ShellUser;
  workspace: Workspace;
  navGroups: NavGroup[];
  contextLabel?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}) {
  const workspaceLabel =
    workspace === "staff"
      ? "Staff workspace"
      : workspace === "student"
        ? "Student workspace"
        : workspace === "admin"
          ? "Platform administration"
          : "Your workspace";

  return (
    <WorkspaceShell
      user={user}
      contextTitle={contextLabel ?? workspaceLabel}
      navGroups={navGroups}
      railFooter={<span>{workspaceLabel}</span>}
    >
      {(eyebrow || title || description || actions || breadcrumbs) && (
        <div className="page-heading">
          <div>
            {breadcrumbs}
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h1>{title}</h1>}
            {description && <p className="page-description">{description}</p>}
          </div>
          {actions && <div className="row-gap">{actions}</div>}
        </div>
      )}
      {children}
    </WorkspaceShell>
  );
}
