import Link from "next/link";
import type { ReactNode } from "react";
import {
  CategoryMark,
  IconCheck,
  IconError,
  IconInfo,
  IconWarning,
  StampMark,
} from "./icons";
import { categoryShape, categoryShortLabel } from "@/lib/threads";

/**
 * Shared presentational vocabulary. These components receive already-authorized
 * data and emit markup only — no data access, no authorization, no domain rules.
 *
 * Status is always a word AND a shape AND a tone, never a tone alone
 * (DESIGN.md §9). The shape is drawn, not a Unicode glyph.
 */

export type Tone = "green" | "amber" | "red" | "neutral";

const TONE_SHAPE = {
  green: "square",
  amber: "triangle",
  red: "diamond",
  neutral: "hollow",
} as const;

/** Status as a stamp: bordered, squared off, and readable in grayscale. */
export function Stamp({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span className={`stamp stamp--${tone}`}>
      <StampMark shape={TONE_SHAPE[tone]} />
      {children}
    </span>
  );
}

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
 * A notice: one flat sheet on the board. `title` is optional so a notice can
 * be a plain bounded region; when present it is rendered in the document
 * register with a hairline under it.
 */
export function Notice({
  title,
  titleId,
  description,
  aside,
  footer,
  roomy,
  flush,
  as: Tag = "section",
  children,
}: {
  title?: ReactNode;
  titleId?: string;
  description?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  /** student surfaces breathe more than staff surfaces */
  roomy?: boolean;
  /** the body owns its own padding (lists, tables) */
  flush?: boolean;
  as?: "section" | "article" | "div";
  children?: ReactNode;
}) {
  return (
    <Tag
      className={`notice${roomy ? " notice--roomy" : ""}`}
      aria-labelledby={titleId}
    >
      {(title || aside) && (
        <div className="notice__head">
          <div style={{ minWidth: 0 }}>
            {title && (
              <h2 className="panel-title" id={titleId}>
                {title}
              </h2>
            )}
            {description && <p>{description}</p>}
          </div>
          {aside && <div className="row">{aside}</div>}
        </div>
      )}
      {children !== undefined && (
        <div className={`notice__body${flush ? " notice__body--flush" : ""}`}>
          {children}
        </div>
      )}
      {footer && <div className="notice__foot">{footer}</div>}
    </Tag>
  );
}

/**
 * A batten: the printed strip label that divides one region of the board from
 * the next. This replaces the eyebrow/kicker pattern, which is banned.
 */
export function StripLabel({
  children,
  count,
  id,
}: {
  children: ReactNode;
  count?: ReactNode;
  id?: string;
}) {
  return (
    <h2 className="strip" id={id}>
      <span>{children}</span>
      {count !== undefined && <span className="strip__count">{count}</span>}
    </h2>
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
    <div className="empty">
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

/** A real count and what it counts. Never a decorative number. */
export function Figure({
  value,
  label,
  attention,
}: {
  value: ReactNode;
  label: string;
  attention?: boolean;
}) {
  return (
    <div className={`figure${attention ? " figure--attention" : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function FigureRow({ children }: { children: ReactNode }) {
  return <div className="figure-row">{children}</div>;
}

/** A question category: a word and a drawn silhouette. Never a colour. */
export function Category({ value }: { value: string | null | undefined }) {
  return (
    <span className="category">
      <CategoryMark shape={categoryShape(value)} />
      {categoryShortLabel(value)}
    </span>
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
            {index < items.length - 1 && <span aria-hidden="true"> /</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Quoted or attributed text — the student's original wording, a private reply,
 * a published answer. Always in the document register, always labelled, never
 * overwritten by a reworded version.
 */
export function Quote({
  label,
  tone,
  children,
  staff,
}: {
  label: ReactNode;
  tone?: "private" | "public";
  staff?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`quote${tone ? ` quote--${tone}` : ""}`}>
      <p className="quote__label">{label}</p>
      <div className={`doc${staff ? " doc--staff" : ""}`}>{children}</div>
    </div>
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

export type CycleStateName =
  | "draft"
  | "scheduled"
  | "open"
  | "closed"
  | "archived"
  | "skipped";

/** Cycle state as words + shape + tone. Text carries the meaning on its own. */
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
  return <Stamp tone={tone}>{label}</Stamp>;
}
