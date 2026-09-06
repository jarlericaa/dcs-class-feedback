import Link from "next/link";
import { IconChevron } from "@/components/ui/icons";
import type { NavGroup, NavItem } from "./nav";

/**
 * The contextual navigation column. Course views can carry the course's own
 * destinations plus the groups for a single section; section views use the
 * same grouped structure on its own. Every destination remains a real link.
 * The optional menu mode is retained for flat callers that need a compact
 * disclosure on narrow or section-only surfaces.
 */
export function SubNav({
  items,
  groups,
  label,
  mode = "tabs",
}: {
  items?: NavItem[];
  groups?: NavGroup[];
  /** the resource these views belong to, e.g. "DCS-101" */
  label: string;
  mode?: "tabs" | "menu";
}) {
  const resolvedGroups = groups ?? (items ? [{ label: "", items }] : []);
  const flatCount = resolvedGroups.reduce(
    (count, group) => count + group.items.length,
    0,
  );
  // A column with one destination is chrome pretending to be structure: there
  // is nowhere to go, and the page heading already says where you are.
  if (flatCount < 2) return null;

  const labelId = "ws-subnav-label";
  if (mode === "menu" && !groups) {
    return (
      <nav
        className="ws-subnav ws-subnav--menu"
        aria-labelledby={labelId}
      >
        <p className="ws-subnav__heading" id={labelId}>
          {label}
        </p>
        <details className="ws-subnav__menu">
          <summary>
            Section menu
            <IconChevron className="ws-subnav__menu-chevron" size={13} />
          </summary>
          <ul className="ws-subnav__menu-list">
            {resolvedGroups[0]!.items.map((item) => (
              <li key={item.href}>
                <MenuItem item={item} />
              </li>
            ))}
          </ul>
        </details>
      </nav>
    );
  }

  return (
    <nav className="ws-subnav" aria-labelledby={labelId}>
      <p className="ws-subnav__heading" id={labelId}>
        {label}
      </p>
      {resolvedGroups.map((group, index) => (
        <div className="ws-subnav__group" key={group.label || `group-${index}`}>
          {group.label && (
            <p className="ws-subnav__group-heading">{group.label}</p>
          )}
          <SubNavList items={group.items} />
        </div>
      ))}
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

function MenuItem({ item }: { item: NavItem }) {
  return (
    <Link
      className={`ws-subnav__menu-item ${
        item.active ? "ws-subnav__menu-item--active" : ""
      }`}
      href={item.href}
      aria-current={item.active ? "page" : undefined}
    >
      <span>{item.label}</span>
      {item.count ? (
        <span className="ws-subnav__count">
          {item.count}
          <span className="visually-hidden"> needing review</span>
        </span>
      ) : null}
    </Link>
  );
}
