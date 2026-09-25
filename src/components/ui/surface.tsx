import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { IconChevron } from "./icons";

/**
 * The containers: sheets squared onto the board, their strip labels, the
 * disclosure that hides reference material, and the quote block that carries a
 * student's own words.
 *
 * Borders carry the structure here; nothing has a resting shadow (DESIGN.md §5).
 */

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
          <div className="min-w-0">
            {title && (
              <h2 className="panel-title" id={titleId}>
                {title}
              </h2>
            )}
            {description && (
              <div className="notice__description">{description}</div>
            )}
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

/**
 * An occasional form, closed by default.
 *
 * A create-or-configure form that is always expanded pushes the page's actual
 * content out of reach, so every one of them lives behind this instead. The
 * summary carries the action's name, which is also how the reader finds it —
 * `<details>`, so it works with JavaScript off and its open state is real.
 */
export function Disclose({
  label,
  inset,
  id,
  children,
}: {
  label: string;
  /** sits inside a notice as one of its rows rather than as its own box */
  inset?: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <details className={`disclose${inset ? " disclose--inset" : ""}`} id={id}>
      <summary>
        <IconChevron className="disclose__mark" size={15} />
        {label}
      </summary>
      <div className="disclose__body">{children}</div>
    </details>
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

/**
 * The trail to the current page.
 *
 * Rebuilt 2026-09-11 from a reference the owner supplied. What changed, and why
 * each part is the way it is:
 *
 * **A drawn chevron between crumbs, not a typed `/`.** The separator used to be
 * the character `" /"` inside the `<li>`, which put punctuation into the
 * accessible name — a screen reader read "My courses slash CS 33 slash". It is
 * now an `IconChevron`, `aria-hidden`, outside the link. DESIGN.md forbids a
 * Unicode glyph standing in for an icon, so it comes from the icon set.
 *
 * **The last crumb is not a link and says so.** It carries `aria-current="page"`
 * and renders in ink rather than the accent, because a link to the page you are
 * already on is a dead control. Only the ancestors are links.
 *
 * **The accent is spent on the links only.** DESIGN.md §3 reserves it for
 * action; a trail where every crumb was accent-coloured would claim four
 * actions where there are two.
 *
 * It stays deliberately quiet — `--text-meta`, 12px (`sidebar.md` §9: "keep it
 * extremely subtle… do NOT use large or visually dominant breadcrumbs"). It
 * answers *how you got here*, while the heading answers *what this is* and the
 * course tabs answer *which view*; none of the three repeats another.
 */
export function Breadcrumbs({
  items,
}: {
  items: { href?: string; label: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="m-0 mb-3 flex list-none flex-wrap items-center gap-1 p-0 text-meta">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li
              className="flex items-center gap-1"
              key={`${item.label}-${index}`}
            >
              {item.href && !last ? (
                <Link
                  className={cn(
                    "rounded-control font-semibold text-accent-deep",
                    "underline decoration-1 underline-offset-2",
                    "transition-colors duration-120",
                    "hover:decoration-2 active:not-disabled:duration-0",
                  )}
                  href={item.href}
                >
                  {item.label}
                </Link>
              ) : (
                /* The page you are on: stated, never linked. */
                <span
                  aria-current={last ? "page" : undefined}
                  className="text-ink-soft"
                >
                  {item.label}
                </span>
              )}
              {!last && (
                <IconChevron
                  size={12}
                  aria-hidden="true"
                  className="shrink-0 text-ink-faint"
                />
              )}
            </li>
          );
        })}
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
