import Link from "next/link";
import { IconChevron } from "@/components/ui/icons";
import { NavCount } from "./nav-count";
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
      <nav className="ws-subnav ws-subnav--menu" aria-labelledby={labelId}>
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

  /*
    `sidebar.md` §6/§20.15: the frequent sections stay visible as tabs and the
    rest fold into a `More` menu, so a section with nine destinations does not
    become a cramped nine-tab row.

    The split is read off `item.secondary`, which the nav builders set — the
    view does not decide which sections are frequent. Flattened across groups
    first: the group headings never render in a horizontal bar anyway (they
    exist for the vertical column this used to have), so grouping would only
    fragment the row.
  */
  const flat = resolvedGroups.flatMap((group) => group.items);
  const primary = flat.filter((item) => !item.secondary);
  const secondary = flat.filter((item) => item.secondary);
  // If the reader is ON a folded destination, `More` has to say so — otherwise
  // the bar shows no active tab at all and the page looks orphaned.
  const secondaryActive = secondary.some((item) => item.active);

  return (
    <nav className="ws-subnav" aria-labelledby={labelId}>
      <p className="ws-subnav__heading" id={labelId}>
        {label}
      </p>
      {/*
        The tabs scroll; the `More` menu does NOT live inside that scroller.
        Its popover is a child of the menu, so a scrolling ancestor would clip
        it — and did: the panel rendered 199px below a bar whose `overflow-y`
        is `hidden`, so five destinations were invisible behind the content.
        Keeping the scroller to the tab list is what lets the panel escape.
      */}
      <div className="ws-subnav__scroll">
        <div className="ws-subnav__group">
          <SubNavList items={primary} />
        </div>
      </div>
      {secondary.length > 0 && (
        <details className="ws-subnav__menu">
          <summary
            className={secondaryActive ? "ws-subnav__menu--current" : undefined}
          >
            More
            <IconChevron
              className="ws-subnav__menu-chevron"
              size={13}
              aria-hidden="true"
            />
          </summary>
          <ul className="ws-subnav__menu-list">
            {secondary.map((item) => (
              <li key={item.href}>
                <MenuItem item={item} />
              </li>
            ))}
          </ul>
        </details>
      )}
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
            {item.count ? <NavCount value={item.count} /> : null}
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
      {item.count ? <NavCount value={item.count} /> : null}
    </Link>
  );
}
