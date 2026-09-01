import Link from "next/link";
import { IconChevron } from "@/components/ui/icons";
import type { NavItem } from "./nav";

/**
 * The contextual navigation band. Course views use the compact link row; the
 * larger set of section-only destinations uses the same band as a menu so a
 * section page does not replace the course navigation with a second tab strip.
 *
 * Every destination remains a real link. There is no client state, and the
 * menu uses native details/summary behaviour so it works without JavaScript.
 */
export function SubNav({
  items,
  label,
  mode = "tabs",
}: {
  items: NavItem[];
  /** the resource these views belong to, e.g. "CS 33" */
  label: string;
  mode?: "tabs" | "menu";
}) {
  // A band with one destination is chrome pretending to be structure: there is
  // nowhere to go, and the page heading already says where you are.
  if (items.length < 2) return null;

  const labelId = "ws-subnav-label";
  if (mode === "menu") {
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
            {items.map((item) => (
              <li key={item.href}>
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
      <div className="ws-subnav__scroll">
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
      </div>
    </nav>
  );
}
