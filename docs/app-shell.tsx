import Link from "next/link";
import type { ReactNode } from "react";

type Workspace = "student" | "staff" | "dashboard";

export function AppShell({
  children,
  workspace = "dashboard",
  sectionId,
  sectionLabel = "Class section",
  eyebrow,
  title,
  description,
}: {
  children: ReactNode;
  workspace?: Workspace;
  sectionId?: string;
  sectionLabel?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  const isStaff = workspace === "staff";
  const isSection = Boolean(sectionId);
  const prefix = isStaff ? "/teach/sections/" + sectionId : "/sections/" + sectionId;

  return (
    <div className={"app-frame " + (isSection ? "app-frame--section" : "")}>
      <aside className="app-sidebar">
        <Link href="/" className="brand-lockup" aria-label="Class Feedback home">
          <span className="brand-mark">cf</span>
          <span>
            <strong>Class Feedback</strong>
            <small>{isStaff ? "Staff workspace" : "Student workspace"}</small>
          </span>
        </Link>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <span className="nav-label">{isSection ? sectionLabel : "Workspace"}</span>
          {isSection ? (
            <>
              <Link className="nav-item nav-item--active" href={isStaff ? prefix + "/review" : prefix}>
                <span className="nav-icon">⌂</span>
                {isStaff ? "Review inbox" : "Current week"}
              </Link>
              <Link className="nav-item" href={isStaff ? "/sections/" + sectionId + "/qa" : prefix + "/history"}>
                <span className="nav-icon">{isStaff ? "◎" : "↺"}</span>
                {isStaff ? "Class Q&A" : "My history"}
              </Link>
              <Link className="nav-item" href={isStaff ? prefix + "/matches" : prefix + "/qa"}>
                <span className="nav-icon">{isStaff ? "◇" : "?"}</span>
                {isStaff ? "Account matches" : "Q&A archive"}
              </Link>
              {isStaff && (
                <Link className="nav-item" href={prefix + "/import"}>
                  <span className="nav-icon">↥</span>
                  Import roster
                </Link>
              )}
            </>
          ) : (
            <Link className="nav-item nav-item--active" href="/">
              <span className="nav-icon">⌂</span>
              Overview
            </Link>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="privacy-note">
            <span className="privacy-note__dot" />
            <span>
              <strong>{isStaff ? "Staff-only tools" : "Class-only space"}</strong>
              <small>
                {isStaff
                  ? "Identity and review controls are restricted."
                  : "Your questions are anonymous to classmates."}
              </small>
            </span>
          </div>
          <Link className="sidebar-account" href="/signin">
            <span className="avatar avatar--small">TJ</span>
            <span>Account &amp; sign out</span>
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar__mobile-brand">
            <span className="brand-mark">cf</span>
            <strong>Class Feedback</strong>
          </div>
          <div className="topbar__context">
            <span className="status-dot status-dot--green" />
            {isStaff ? "Teaching team workspace" : "Your class workspace"}
          </div>
          <div className="topbar__actions">
            <button className="icon-button" type="button" aria-label="Help">?</button>
            <span className="avatar">TJ</span>
          </div>
        </header>

        <main className="page-shell">
          {(eyebrow || title || description) && (
            <div className="page-heading">
              {eyebrow && <p className="eyebrow">{eyebrow}</p>}
              {title && <h1>{title}</h1>}
              {description && <p className="page-description">{description}</p>}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
