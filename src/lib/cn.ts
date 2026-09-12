import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The app's twelve type steps, by name (`--text-*` in `globals.css`).
 *
 * `tailwind-merge` has to be told these, and the reason is a real bug it
 * silently caused: `text-*` is ambiguous — it can be a font SIZE or a text
 * COLOUR — and the library decides which by recognising the value. It knows
 * `text-sm` is a size and `text-red-500` is a colour, but every one of this
 * app's steps and colours is a custom theme key it has never heard of, so it
 * put `text-ui-sm` and `text-on-accent` in the SAME group and kept only the
 * last.
 *
 * What that produced: `buttonClass({ variant: "primary", size: "small" })`
 * composes `text-on-accent …` then `… text-ui-sm`, so the colour was **dropped
 * from the class list entirely** and every small primary button in the app
 * rendered dark ink on a dark green fill. The default size has no `text-*` in
 * its size recipe, which is why only the small one broke and why it looked like
 * a one-off rather than a systemic fault.
 *
 * Listing the sizes here is enough to separate them: a `text-*` on this list is
 * a size, anything else is a colour.
 */
const FONT_SIZES = [
  "stamp",
  "strip",
  "meta",
  "ui-sm",
  "ui",
  "doc-dense",
  "doc-staff",
  "doc",
  "prompt",
  "panel-title",
  "object-title",
  "title",
  "headline",
];

/** `--radius-*`. Told to it so a caller's `rounded-*` replaces the recipe's. */
const RADII = ["control", "stamp", "panel"];

/**
 * `--spacing-*`, the named (non-numeric) steps.
 *
 * Without these, `min-h-control` and `min-h-nav-item` are treated as unrelated
 * and both survive a merge — which leaves the winner to stylesheet order rather
 * than to the caller, the one thing `cn` exists to prevent.
 */
const SPACING = [
  "bar",
  "check",
  "control",
  "control-compact",
  "control-pad",
  "control-sm",
  "nav-icon",
  "nav-item",
  "rail",
  "rail-min",
  "scale-cell",
  "tight",
  "topbar",
  "touch",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: FONT_SIZES }],
      rounded: [{ rounded: RADII }],
      "min-h": [{ "min-h": SPACING }],
      h: [{ h: SPACING }],
      w: [{ w: SPACING }],
      "max-w": [{ "max-w": SPACING }],
      size: [{ size: SPACING }],
    },
  },
});

/**
 * Join class names, letting a caller's utility win over the component's own.
 *
 * `twMerge` is what makes a `className` prop honest: `<Button className="w-full">`
 * has to be able to override the recipe's own width, and a plain string join
 * leaves both in the attribute with the winner decided by stylesheet order —
 * which is not something a caller can see or reason about.
 *
 * It is extended above rather than used bare, because a merge that guesses
 * wrong is worse than no merge: it deletes a class the author wrote. See
 * `FONT_SIZES`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
