import Link from "next/link";
import type { NavGroup, NavItem } from "./nav";

/**
 * The contextual column: the peer views of the resource this page belongs to.
 *
 * It sits between the primary rail and the page, so its position states its
 * ownership — the rail is the way OUT of this resource, this column is the way
 * around INSIDE it. Its heading names the resource, so the reader never has to
 * infer whose "Class list" they are looking at.
 *
 * A list of links, not a widget. Every row is a real destination, so a direct
 * link, a refresh, the back button and "open in new tab" all behave the way the
 * reader already expects. No JavaScript, no client state.
 *
 * On a phone the same markup lays out as a horizontal scroller above the page
 * (globals.css), because a second fixed column would leave nothing for the page.
 *
 * `items` is a flat strip (courses, a student's classes — short enough that a
 * heading per group would be more chrome than signal). `groups` is for a
 * longer set with real categories (a section's peer views): each renders its
 * own small strip label, so "which of these am I looking for" is answered
 * before a single row is read. Pass exactly one.
 */
export function SubNav({
  items,
  groups,
  label,
}: {
  items?: NavItem[];
  groups?: NavGroup[];
  /** the resource these views belong to, e.g. "DCS-101" */
  label: string;
}) {
  const flatCount =
    items?.length ?? groups?.reduce((n, g) => n + g.items.length, 0) ?? 0;
  // A column with one destination is chrome pretending to be structure: there
  // is nowhere to go, and the page heading already says where you are.
  if (flatCount < 2) return null;

  return (
    <nav className="ws-subnav" aria-label={`${label} pages`}>
      <p className="ws-subnav__heading">{label}</p>
      {groups
        ? groups.map((group, index) => (
            <div className="ws-subnav__group" key={group.label || index}>
              {/* An empty label is the course's own strip: it renders exactly
                  as it always has (no heading), and the labeled groups below
                  it are the addition. */}
              {group.label && (
                <p className="ws-subnav__group-heading">{group.label}</p>
              )}
              <SubNavList items={group.items} />
            </div>
          ))
        : items && <SubNavList items={items} />}
    </nav>
  );
}

function SubNavList({ items }: { items: NavItem[] }) {
  return (
    <ul className="ws-subnav__list">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            className={`ws-subnav__item ${
              item.active ? "ws-subnav__item--active" : ""
            }`}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
          >
            <span className="ws-subnav__text">{item.label}</span>
            {item.count ? (
              <span className="ws-subnav__count">
                {item.count}
                <span className="visually-hidden"> needing review</span>
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
