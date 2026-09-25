import { useId, type ReactNode } from "react";
import { IconInfo } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * An (i) beside a label that reveals a short explanation on hover.
 *
 * **This overturns a recorded verdict, deliberately.** DESIGN-TODO §11.5 ruled
 * `Tooltip: no` — "hover-only text is invisible on touch and unreliable for
 * keyboards. The app's answers are `help` text, `QuestionNote` and `Disclose`."
 * The owner asked for it anyway (§10.4.8.1, 2026-09-11), for a real reason: a
 * `Disclose` row for *Formatting* and another for *Versions* put two collapsed
 * dropdowns in the middle of a form, and a dropdown reads as something you must
 * decide about rather than something you may look up.
 *
 * **Hover is the primary gesture**, by the owner's follow-up call — and the
 * accessibility objection is still answered rather than ignored:
 *
 *   - the panel opens on `:hover` **and** on `:focus-within`, so tabbing to the
 *     icon shows it without a click;
 *   - the icon is a real `<summary>` button, so click and Enter/Space work too
 *     — that is the touch path, where hover does not exist;
 *   - `<details name>` makes the group **exclusive**: opening one closes the
 *     others, so a click can never leave two panels stuck open. This is the
 *     browser's own accordion behaviour, not a `useState`;
 *   - it needs no JavaScript at all, which matters in an app that is
 *     server-rendered per navigation (§11.6d);
 *   - the text is in the DOM either way, so a screen reader reaches it in
 *     reading order without activating anything.
 *
 * What it must NOT be used for: anything a reader needs in order to fill the
 * field in. Hidden text is for reference a person looks up once — what Markdown
 * is accepted, what versioning does — never for a requirement or a consequence.
 * Those stay as visible `help` text under the label (DESIGN.md §6).
 */
export function InfoTip({
  label,
  group = "info-tip",
  children,
  className,
}: {
  /** what the icon explains, e.g. "Formatting" — also its accessible name */
  label: string;
  /**
   * Tips sharing a `group` are mutually exclusive: opening one closes the rest.
   * The default puts every tip on a page in one group, which is almost always
   * what you want — two explanations open at once is two things to read.
   */
  group?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = `tip-${useId()}`;
  return (
    <details
      className={cn("group/tip relative inline-block align-middle", className)}
      id={id}
      name={group}
    >
      <summary
        className={cn(
          // `list-none` plus the webkit rule kills the native triangle; the (i)
          // is the affordance.
          "list-none [&::-webkit-details-marker]:hidden",
          "inline-flex cursor-help items-center rounded-control",
          "text-ink-faint transition-colors duration-120",
          "hover:text-accent-deep group-open/tip:text-accent-deep",
        )}
        // The label is the accessible name; the glyph itself is decorative.
        aria-label={`About ${label.toLowerCase()}`}
      >
        <IconInfo size={15} aria-hidden="true" />
      </summary>
      {/*
        Hover and keyboard focus both show the panel, and `group-open` keeps it
        shown after a click. Driving VISIBILITY rather than the element's `open`
        state is what lets hover and click coexist: a hover that toggled `open`
        would fight the click that set it.

        `--shadow-overlay` is legal here — this genuinely covers content, which
        is the one thing DESIGN.md §5 allows an elevation for.
      */}
      <div
        className={cn(
          "absolute left-0 top-full z-30 mt-2 hidden w-max max-w-[min(34ch,calc(100vw-2rem))]",
          "group-open/tip:block group-hover/tip:block group-focus-within/tip:block",
          // Rounded like every other panel in the system. It had no radius at
          // all, which made it the one square box on a screen of 12px corners.
          "rounded-panel border border-rule-strong bg-paper shadow-overlay",
          "p-3 text-left text-ui-sm font-normal text-ink-soft",
          // The icon sits at the END of a line of text, so a panel anchored to
          // its left edge hangs off the right of a narrow column. Past the
          // midpoint of the viewport, anchor the panel's right edge instead.
          "max-md:left-auto max-md:right-0",
        )}
        role="note"
      >
        <p className="font-semibold text-ink">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </details>
  );
}
