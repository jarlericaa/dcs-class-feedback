import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared presentational vocabulary. These components receive
 * already-authorized data and emit markup only — no data access, no
 * authorization, no domain rules.
 *
 * Status is always text + shape + colour, never colour alone
 * (docs/CLAUDE_UI_SCREEN_SPEC.md visual QA checklist).
 */

export type Tone = "green" | "amber" | "red" | "neutral";

const TONE_DOT: Record<Tone, string> = {
  green: "●",
  amber: "◆",
  red: "■",
  neutral: "○",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      <span className="badge__dot" aria-hidden="true">
        {TONE_DOT[tone]}
      </span>
      {children}
    </span>
  );
}

export function Alert({
  variant,
  title,
  children,
}: {
  variant: "error" | "success" | "warning" | "info";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`alert alert--${variant}`}
      role={variant === "error" ? "alert" : "status"}
    >
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && (
        <Link className="button button--secondary" href={action.href}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Standard "you cannot see this" page body. Server already denied access. */
export function AccessDenied({ what = "this page" }: { what?: string }) {
  return (
    <EmptyState title="You do not have access">
      Your account is not authorized to view {what}. If you think this is a
      mistake, ask the teacher who manages this class section.
    </EmptyState>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: { href?: string; label: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="breadcrumbs">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
            {index < items.length - 1 && <span aria-hidden="true"> ›</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Inline validation message wired to an input through aria-describedby. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="field-error" id={id}>
      <span aria-hidden="true">⚠</span>
      <span>{message}</span>
    </p>
  );
}

export type CycleStateName =
  | "draft"
  | "scheduled"
  | "open"
  | "closed"
  | "archived"
  | "skipped";

/** Cycle state as words + tone. Text carries the meaning on its own. */
export function CycleStateBadge({ state }: { state: CycleStateName }) {
  const map: Record<CycleStateName, { tone: Tone; label: string }> = {
    draft: { tone: "neutral", label: "Draft" },
    scheduled: { tone: "amber", label: "Scheduled" },
    open: { tone: "green", label: "Open" },
    closed: { tone: "neutral", label: "Closed" },
    archived: { tone: "neutral", label: "Archived" },
    skipped: { tone: "neutral", label: "Skipped" },
  };
  const { tone, label } = map[state];
  return <Badge tone={tone}>{label}</Badge>;
}
