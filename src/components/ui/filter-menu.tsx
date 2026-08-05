"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { IconCheck, IconFilter } from "@/components/ui/icons";

/**
 * One filter control per list. One popover. One way to close it.
 *
 * The review inbox previously had two `<details>` disclosures side by side, so
 * `State` and `Week` could both be open at once, and neither closed on an
 * outside click — a popover you cannot dismiss covers the list you are trying to
 * filter. A single button holding every group makes "two open at once"
 * unrepresentable rather than merely discouraged.
 *
 * Options stay `<Link>`s, so the URL remains the filter state: a filtered view
 * is shareable, survives reload, and the server does the filtering exactly as
 * before. Choosing one navigates and the popover unmounts with the page, which
 * is why there is no `Apply` step — nothing is buffered to apply.
 */

export interface FilterGroup {
  /** the dimension: "State", "Week", "Published" */
  name: string;
  current: string;
  /** the "everything" value; sitting on it is not worth reporting */
  defaultKey?: string;
  options: { key: string; label: string; href: string }[];
}

export function FilterMenu({ groups }: { groups: FilterGroup[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = `filters-${useId()}`;

  const active = groups.filter(
    (group) => group.current !== (group.defaultKey ?? "all"),
  );

  // Outside click and Escape both close. Bound only while open, so a closed
  // popover costs no listeners.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const summary =
    active.length === 0
      ? "Showing: everything"
      : `Showing: ${active
          .map(
            (group) =>
              group.options
                .find((option) => option.key === group.current)
                ?.label.toLowerCase() ?? group.name.toLowerCase(),
          )
          .join(", ")}`;

  return (
    <div className="filterbar">
      <p className="filterbar__summary">{summary}</p>
      <div className="filterbar__control" ref={wrapRef}>
        <button
          ref={buttonRef}
          className="button button--secondary button--small"
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          // Pressing it again closes it.
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          <IconFilter size={14} />
          Filter
          {active.length > 0 && (
            <span className="filterbar__count">{active.length}</span>
          )}
        </button>

        {open && (
          <div className="filterbar__menu" id={menuId}>
            {groups.map((group) => (
              <div className="filterbar__group" key={group.name}>
                <p className="filterbar__group-name">{group.name}</p>
                {group.options.map((option) => {
                  const chosen = option.key === group.current;
                  return (
                    <Link
                      key={option.key}
                      className={`filterbar__option${chosen ? " filterbar__option--on" : ""}`}
                      href={option.href}
                      aria-current={chosen ? "true" : undefined}
                      onClick={() => setOpen(false)}
                    >
                      <span className="filterbar__check">
                        {chosen && <IconCheck size={13} />}
                      </span>
                      {option.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
