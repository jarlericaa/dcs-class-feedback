import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/session";
import { initials } from "@/lib/datetime";
import type { NavGroup } from "./nav";

/**
 * The single application shell. Every authenticated route renders inside it so
 * a user can always answer "where am I, in what role, and what can I do here".
 *
 * Workspace separation is deliberate and visible: a teacher who is also an
 * enrolled student sees a different sidebar label, privacy note and navigation
 * depending on which workspace they are in.
 *
 * On phones the sidebar is replaced by a <details> disclosure in the top bar
 * rather than being hidden, so navigation stays reachable by keyboard and
 * screen reader without any client-side JavaScript.
 */

export type Workspace = "student" | "staff" | "home" | "admin";

export interface ShellUser {
  displayName: string;
  email: string;
}

function NavList({ groups }: { groups: NavGroup[] }) {
  return (
    <>
      {groups.map((group) => (
        <nav className="sidebar-nav" key={group.label} aria-label={group.label}>
          <span className="nav-label">{group.label}</span>
          {group.items.map((item) => (
            <Link
              key={item.href}
              className={`nav-item ${item.active ? "nav-item--active" : ""}`}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
      ))}
    </>
  );
}

function PrivacyNote({ workspace }: { workspace: Workspace }) {
  const copy =
    workspace === "staff"
      ? {
          title: "Staff-only tools",
          body: "Identities, validity decisions, drafts and audit records are visible to authorized staff only.",
        }
      : workspace === "student"
        ? {
            title: "Class-only space",
            body: "Published answers are visible to this section only, and your classmates never see who asked.",
          }
        : {
            title: "University accounts only",
            body: "Nothing in this workspace is visible on the public internet.",
          };
  return (
    <div className="privacy-note">
      <span className="privacy-note__dot" aria-hidden="true" />
      <span>
        <strong>{copy.title}</strong>
        <small>{copy.body}</small>
      </span>
    </div>
  );
}

function AccountBox({ user }: { user: ShellUser }) {
  return (
    <div className="account-box">
      <div className="account-box__identity">
        <span className="avatar" aria-hidden="true">
          {initials(user.displayName)}
        </span>
        <div>
          <strong>{user.displayName}</strong>
          <small>{user.email}</small>
        </div>
      </div>
      <form action={signOutAction}>
        <button
          className="button button--quiet button--small"
          type="submit"
          style={{ width: "100%" }}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

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
  /** e.g. "DCS-101 Section A" — the resource the sidebar is scoped to */
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
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside className="app-sidebar">
        <Link href="/" className="brand-lockup" aria-label="Class Feedback home">
          <span className="brand-mark" aria-hidden="true">
            cf
          </span>
          <span>
            <strong>Class Feedback</strong>
            <small>{workspaceLabel}</small>
          </span>
        </Link>
        {contextLabel && (
          <p
            className="nav-label"
            style={{ padding: "0 10px 10px", margin: 0 }}
          >
            {contextLabel}
          </p>
        )}
        <NavList groups={navGroups} />
        <div className="sidebar-bottom">
          <PrivacyNote workspace={workspace} />
          <AccountBox user={user} />
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar__mobile-brand">
            <span className="brand-mark" aria-hidden="true">
              cf
            </span>
            <strong>Class Feedback</strong>
          </div>
          <div className="topbar__context">
            <span
              className={`status-dot status-dot--${workspace === "staff" ? "amber" : "green"}`}
              aria-hidden="true"
            />
            {contextLabel ? `${contextLabel} · ${workspaceLabel}` : workspaceLabel}
          </div>
          <div className="topbar__actions">
            <details className="mobile-nav">
              <summary aria-label="Open navigation menu">
                <span aria-hidden="true">☰</span> Menu
              </summary>
              <div className="mobile-nav__panel">
                <p className="nav-label" style={{ padding: "0 0 8px", margin: 0 }}>
                  {contextLabel ?? workspaceLabel}
                </p>
                <NavList groups={navGroups} />
                <div style={{ marginTop: 14 }}>
                  <AccountBox user={user} />
                </div>
              </div>
            </details>
            <span className="avatar" title={user.displayName} aria-hidden="true">
              {initials(user.displayName)}
            </span>
            <span className="visually-hidden">Signed in as {user.email}</span>
          </div>
        </header>

        <main className="page-shell" id="main-content">
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
        </main>
      </div>
    </div>
  );
}
