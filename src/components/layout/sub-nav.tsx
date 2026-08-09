import Link from "next/link";
import type { NavItem } from "./nav";

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
 */
export function SubNav({
  items,
  label,
}: {
  items: NavItem[];
  /** the resource these views belong to, e.g. "DCS-101" */
  label: string;
}) {
  // A column with one destination is chrome pretending to be structure: there
  // is nowhere to go, and the page heading already says where you are.
  if (items.length < 2) return null;

  return (
    <nav className="ws-subnav" aria-label={`${label} pages`}>
      <p className="ws-subnav__heading">{label}</p>
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
    </nav>
  );
}
