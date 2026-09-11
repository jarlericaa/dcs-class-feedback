import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/session";
import { initials } from "@/lib/datetime";
import { IconChevron, IconSignOut } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { NAV_ICONS, type NavGroup, type NavItem } from "./nav";
import { NavCount } from "./nav-count";
import type { ShellUser } from "./workspace-shell";

/**
 * The workspace rail: navigation, and nothing else.
 *
 * Rebuilt to `sidebar.md` (owner spec, 2026-09-11). Two things it establishes
 * that the previous rail did not:
 *
 * **The sidebar owns navigation; the header owns identity.** The rail carries no
 * product mark, no "Class Feedback", no workspace name at the top — §1 and §16
 * are explicit, and the header already says all three. What the rail keeps at
 * the bottom is the *account*, because §10 puts the profile there.
 *
 * **Collapsed is a real state, not a squeeze.** 72px with the labels gone and
 * the icons centred, so it reads as intentional (§6). It does not overlay the
 * page: the layout resizes around it (§5).
 *
 * The rail carries no collapse control of its own. The handle is a SIBLING of
 * this component, pinned to the sidebar's centre-right edge by the shell
 * (`sidebar.md` §4) — it cannot live in here, because the rail is its own
 * scroll container and would clip an element straddling its edge.
 *
 * It also needs no "am I in the drawer?" flag any more. The collapsed state
 * lives on `#ws-body`, and the mobile drawer renders in the header, outside it —
 * so the drawer's copy of this rail is always the full-width sheet §15 asks for,
 * by structure rather than by a prop.
 *
 * Written in utilities rather than `legacy.css`: 35 `.ws-rail*` rules were
 * deleted in the same change, so the redesign made that file smaller rather
 * than larger (§11.6b).
 */
export function Rail({
  user,
  workspaceLabel,
  navGroups,
  footer,
}: {
  user: ShellUser;
  workspaceLabel?: string;
  navGroups?: NavGroup[];
  footer?: ReactNode;
}) {
  return (
    <>
      {navGroups?.map((group) => {
        const rows = (
          <ul className="grid list-none gap-1 p-0">
            {group.items.map((item) => (
              <li key={item.href}>
                <RailRow item={item} />
              </li>
            ))}
          </ul>
        );

        /*
          §14: sections are separated by more than their rows are — 24px between
          groups against 4px between items, so the hierarchy is carried by space
          rather than by boxing each group in a border (§6).
        */
        return (
          <div className="mt-6 first:mt-0" key={group.label}>
            {group.collapsible ? (
              /* Always `open`. The disclosure lets a reader fold a long course
                 list away for the session; it does not remember, because a rail
                 whose height depended on where you had been is the instability
                 this model exists to remove. */
              <details open>
                <summary
                  className={cn(
                    SECTION_LABEL,
                    "flex cursor-pointer list-none items-center justify-between",
                    "[&::-webkit-details-marker]:hidden",
                    "transition-colors duration-120 hover:text-rail-ink",
                    // §9: collapsed, the label and its chevron go and only the
                    // course icons remain.
                    "in-data-[rail=min]:sr-only",
                  )}
                >
                  {group.label}
                  <IconChevron
                    size={13}
                    aria-hidden="true"
                    className="text-rail-ink-muted transition-transform duration-120 in-open:rotate-90"
                  />
                </summary>
                {rows}
              </details>
            ) : (
              <>
                <p className={cn(SECTION_LABEL, "in-data-[rail=min]:sr-only")}>
                  {group.label}
                </p>
                {rows}
              </>
            )}
          </div>
        );
      })}

      {/*
        §10: the account, at the bottom, behind a divider and deliberately not
        shaped like a navigation row — `mt-auto` pins it there however short the
        nav is.
      */}
      <div
        className={cn(
          "mt-auto border-t border-rail-rule pt-5",
          "in-data-[rail=min]:px-0",
        )}
      >
        <div
          className={cn(
            "flex items-start gap-2",
            "in-data-[rail=min]:justify-center",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-control",
              "border border-rail-rule text-stamp font-bold text-rail-ink",
            )}
          >
            {initials(user.displayName)}
          </span>
          {/* Both lines go when the rail does; `sr-only` keeps them announced,
              because who you are signed in as should not depend on a width. */}
          <span
            className={cn(
              "grid min-w-0 gap-px text-meta text-rail-ink-muted",
              "in-data-[rail=min]:sr-only",
            )}
          >
            {workspaceLabel && <span>{workspaceLabel}</span>}
            <span className="wrap-anywhere">{user.email}</span>
          </span>
        </div>

        {footer}

        <form action={signOutAction} className="mt-2">
          <button
            type="submit"
            className={cn(
              "inline-flex items-center gap-2 rounded-control px-2 py-1",
              /*
                `bg-transparent`, stated — the SECOND time this bit. A `<button>`
                with no background falls back to the UA's `buttonface` grey, and
                near-white rail ink on top of that is unreadable. The
                stylesheet's reset neutralises font and colour on form controls
                but not their background, so every button on the rail has to say
                so itself.
              */
              "bg-transparent text-meta font-semibold text-rail-ink",
              "underline decoration-1 underline-offset-2",
              "transition-colors duration-120",
              "hover:bg-rail-hover active:bg-rail-deep",
              "active:not-disabled:duration-0",
              "pointer-coarse:min-h-touch",
              // Collapsed it is the icon alone, centred under the avatar.
              "in-data-[rail=min]:w-full in-data-[rail=min]:justify-center",
              "in-data-[rail=min]:no-underline",
            )}
          >
            <IconSignOut
              size={16}
              aria-hidden="true"
              className="hidden in-data-[rail=min]:block"
            />
            <span className="in-data-[rail=min]:sr-only">Sign out</span>
          </button>
        </form>
      </div>
    </>
  );
}

/**
 * §6: small, uppercase, muted, and spaced away from what it labels. This is the
 * strip register the rest of the app uses for a printed label over a region, so
 * the rail is not inventing a type step of its own.
 */
const SECTION_LABEL = [
  "mb-2 px-2 text-strip font-bold uppercase text-rail-ink-muted",
].join(" ");

/**
 * One destination.
 *
 * §13 is the important part and it is structural, not cosmetic: the icon sits in
 * a **fixed-width box**, so every label in the rail begins at the same
 * x-coordinate whatever glyph precedes it. No icon is positioned individually.
 *
 * The active state is §7's: a faint white overlay, brighter ink, a weight
 * change and a 2px accent batten down the left — four channels, none of which is
 * the fill alone. That matters because the fill is only ~1.3:1 against its
 * neighbours by design ("refined", not "a huge bright green block"), so it
 * could not carry the state by itself and is not asked to. `aria-current` says
 * it independently of all of them.
 */
function RailRow({ item }: { item: NavItem }) {
  const Glyph = item.icon ? NAV_ICONS[item.icon] : null;
  return (
    <Link
      className={cn(
        "relative flex items-center gap-3 rounded-control px-2",
        "min-h-nav-item text-ui-sm text-rail-ink",
        // A finger needs more than 42px. Stated beside the row rather than in a
        // distant `@media (pointer: coarse)` list, which is where it used to be.
        "pointer-coarse:min-h-touch",
        "transition-colors duration-120",
        // §8: subtle, and fast. The press lands instantly; only the release eases.
        "hover:bg-rail-hover active:bg-rail-deep active:not-disabled:duration-0",
        item.active && [
          "bg-rail-active font-semibold",
          // the batten: a second, non-colour channel for "you are here"
          "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5",
          "before:rounded-full before:bg-rail-focus",
        ],
        // Collapsed: a centred icon, and the label supplied by the browser's
        // own tooltip instead.
        "in-data-[rail=min]:justify-center in-data-[rail=min]:px-0",
      )}
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      /*
        §4 asks for tooltips on the collapsed rail, and `title` is the only way
        to get one here without JavaScript. A CSS panel cannot work: it would be
        a child of this row, so it must paint outside the rail's right edge while
        the rail keeps scrolling vertically for an account with many courses —
        and CSS forbids that pair (`overflow-x: visible` beside `overflow-y:
        auto` computes back to `auto`; `clip` computes to `hidden`). Measured in
        a browser before settling for this.

        The trade-off, stated: `title` is slow to appear and cannot be styled.
        What it is not is inaccessible — the label below is `sr-only`, never
        removed, so the row's accessible name is "CS 33" at every width and the
        tooltip is a convenience on top.
      */
      title={item.label}
    >
      <span
        aria-hidden="true"
        className="grid size-nav-icon shrink-0 place-items-center"
      >
        {Glyph && <Glyph size={18} />}
      </span>
      <span className="min-w-0 flex-1 truncate in-data-[rail=min]:sr-only">
        {item.label}
      </span>
      {item.count ? (
        <NavCount
          value={item.count}
          ground="rail"
          className="in-data-[rail=min]:sr-only"
        />
      ) : null}
    </Link>
  );
}
