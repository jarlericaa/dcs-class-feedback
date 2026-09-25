import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import type { ReactNode } from "react";
import { IconCheck, IconError, IconInfo, IconWarning } from "./icons";

/**
 * Telling the reader what happened, or what to do when there is nothing to see:
 * banners, empty states, denials and field-level errors.
 *
 * Nothing here explains WHY access was denied or names what is inside a
 * resource the reader may not know about — see `AccessDenied`.
 */

const ALERT_ICON = {
  error: IconError,
  success: IconCheck,
  warning: IconWarning,
  info: IconInfo,
} as const;

export function Alert({
  variant,
  title,
  children,
}: {
  variant: "error" | "success" | "warning" | "info";
  title?: string;
  children: ReactNode;
}) {
  const Glyph = ALERT_ICON[variant];
  return (
    <div
      className={`alert alert--${variant}`}
      role={variant === "error" ? "alert" : "status"}
    >
      <Glyph className="alert__icon" size={16} />
      <div className="alert__body">
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

/**
 * Nothing is here yet. An empty state states what is missing and carries the
 * action that fills it — an empty state that only describes the next step makes
 * the reader go and find it.
 */
export function EmptyState({
  title,
  children,
  action,
  primary,
}: {
  title: string;
  children?: ReactNode;
  action?: { href: string; label: string };
  /** the action IS this page's main action, so it looks like it */
  primary?: boolean;
}) {
  return (
    <div className="empty">
      <h2 className="panel-title">{title}</h2>
      {children && <div className="empty__description">{children}</div>}
      {action && (
        /*
          `buttonClass`, not the legacy `button button--*` string this used to
          build by interpolation — which made it the LAST consumer of
          `legacy.css`'s `.button` block and the reason that block still had to
          exist after §3.1 reported the rollout finished.

          Two things it was getting wrong as a result. It rendered **41px**
          where every other button in the app now renders the 38px
          `--spacing-control` declares; and it was invisible to §7's guardrail,
          which greps `<button` and so cannot see a button-shaped `<a>` built
          from a template literal. Both are recorded in DESIGN-TODO §7a.

          `mt-4` is carried explicitly because the gap used to come from
          `.empty .button { margin-top: var(--s4) }` — a descendant rule keyed
          on the class that just changed. Exactly the trap §10.4.3b hit: a
          layout rule living in someone else's selector breaks the moment the
          class moves.
        */
        <Link
          className={buttonClass({
            variant: primary ? "primary" : "secondary",
            className: "mt-4",
          })}
          href={action.href}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/**
 * The standard "you cannot see this" body. The server has already denied
 * access; this never explains why, never names what is inside, and never
 * distinguishes "does not exist" from "not yours".
 */
export function AccessDenied({ what = "this page" }: { what?: string }) {
  return (
    <EmptyState title="You do not have access">
      Your account is not authorized to view {what}. If you think that is a
      mistake, ask the teacher who manages this class section.
    </EmptyState>
  );
}

/** Banner shown on every staff page of an archived, read-only course. */
export function ArchivedNotice({ courseCode }: { courseCode?: string }) {
  return (
    <Alert variant="info" title="This course is archived">
      {courseCode ? `${courseCode} is ` : "This course is "}read-only. Exports
      and history still work; everything else is refused by the server until an
      instructor restores it.
    </Alert>
  );
}

/** Inline validation message, wired to its input through aria-describedby. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="field-error" id={id}>
      <IconWarning size={15} />
      <span>{message}</span>
    </p>
  );
}

/**
 * What this section needs from the teacher, in words.
 *
 * This replaces `1 submission · 1 answered`, which restated the status stamp in
 * metadata and told the teacher nothing to do. A count only appears when it is
 * the subject of the sentence, and the sentence only claims what the counts
 * prove — `0 submissions · 0 answered` beside "Nothing waiting" used to imply
 * the week was handled when nothing had arrived.
 */
export function ReviewStatusLine({
  total,
  needsReview,
}: {
  total: number;
  needsReview: number;
}) {
  if (total === 0) {
    return <p className="status-line">No submissions yet</p>;
  }
  if (needsReview > 0) {
    return (
      <p className="status-line status-line--attention">
        {needsReview === 1
          ? "1 submission needs a reply"
          : `${needsReview} submissions need replies`}
      </p>
    );
  }
  return <p className="status-line">All submissions answered</p>;
}
