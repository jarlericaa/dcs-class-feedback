import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * The button recipe, in one place.
 *
 * Why a component rather than utilities at each call site: there are over a
 * hundred buttons in this app, and the base recipe is fifteen utilities long.
 * Inlining it would put the same fifteen at every one of them, so a change to
 * the control height would become a hundred-file edit — the maintenance
 * property the single stylesheet was providing, thrown away in the name of
 * having moved to Tailwind.
 *
 * The variants are a transcription of `.button--*` in globals.css, kept
 * deliberately literal: same 38px min height, same `9px 16px` padding, same
 * hover targets, same disabled treatment. Nothing is redesigned here — DESIGN.md
 * §6 still governs, and one primary action per view is still the rule the pages
 * enforce.
 *
 * `variant` is required rather than defaulted to primary. An accidental primary
 * is the specific mistake DESIGN.md §7a guards against ("one primary per
 * view"), so the safe choice should not be the one you get by forgetting.
 */
const base = [
  "inline-flex items-center justify-center gap-2",
  /*
    `py-1.5`, not the `py-2.25` this was transcribed as — and the 3px matters
    because it was the difference between what the app DECLARED and what it
    drew.

    `--spacing-control` is 38px, DESIGN.md §6 says a button is 38px tall, and
    every button in this app rendered **41**: `min-height` is a floor, so
    9px + 9px of padding around a 14px/1.5 line box (21px) plus 2px of border
    came to 41 and the floor never applied. The legacy `.button` rule had the
    identical arithmetic, so this was faithful to the stylesheet and wrong
    about the token — which is why it survived the migration unnoticed.

    With 6px the natural height is 35, so `min-h-control` governs and the
    button is exactly 38. `items-center` keeps the label centred, and a label
    long enough to wrap still grows the control, which is the reason this stays
    a minimum rather than becoming a fixed `h-control`.
  */
  "min-h-control px-4 py-1.5",
  "border border-transparent rounded-control",
  "font-sans text-ui font-semibold text-center",
  "transition-colors duration-120",
  // A press must feel immediate; only the release eases. Overriding the
  // duration (not the transition) makes entering `:active` instant while
  // leaving it still runs the 120ms above. See DESIGN-TODO §12.1.
  "active:not-disabled:duration-0",
  // A disabled control keeps its shape and stops looking clickable. Both the
  // real attribute and the ARIA form, because a link-shaped action cannot carry
  // `disabled` but still has to read as unavailable.
  "disabled:text-ink-faint disabled:border-rule disabled:bg-paper-quiet",
  "disabled:cursor-not-allowed",
  "aria-disabled:text-ink-faint aria-disabled:border-rule",
  "aria-disabled:bg-paper-quiet aria-disabled:cursor-not-allowed",
].join(" ");

const variants = {
  primary: [
    // `text-on-accent`, not `text-white`: this is the one pairing that inverts
    // in dark mode (dark text on a light green fill), so the colour belongs to
    // a token rather than to this line. See §6A.2.
    "text-on-accent bg-accent border-accent",
    "hover:bg-accent-deep hover:border-accent-deep",
    "active:bg-accent-press active:border-accent-press",
    "disabled:bg-paper-quiet aria-disabled:bg-paper-quiet",
  ].join(" "),
  secondary: [
    "text-ink bg-paper border-control-edge",
    "hover:bg-paper-quiet active:bg-board-deep",
  ].join(" "),
  quiet: [
    "text-ink-muted bg-transparent",
    "hover:text-ink hover:bg-paper-quiet",
    "active:text-ink active:bg-board-deep",
  ].join(" "),
  // Destruction is a bordered button, never a red slab: it should look serious,
  // not eager to be clicked (DESIGN.md §6).
  danger: [
    "text-red-deep bg-paper border-red",
    "hover:bg-red-wash active:bg-red-press",
  ].join(" "),
} as const;

const sizes = {
  default: "",
  // Same correction as `base`: 6px of padding around a 13px/1.45 line box came
  // to 33px against a declared 30px step. `py-1` lands it on the 30 exactly.
  small: "min-h-control-sm px-2.5 py-1 text-ui-sm",
} as const;

export type ButtonVariant = keyof typeof variants;

export function buttonClass({
  variant,
  size = "default",
  className,
}: {
  variant: ButtonVariant;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & {
  variant: ButtonVariant;
  size?: keyof typeof sizes;
}) {
  return (
    <button
      // Never a bare `<button>`: without a type it submits the nearest form,
      // which is how a "show more" control ends up posting a half-filled form.
      type={props.type ?? "button"}
      className={buttonClass({ variant, size, className })}
      {...props}
    />
  );
}
