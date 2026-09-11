import { cn } from "@/lib/cn";

/**
 * A wait with no shape to predict.
 *
 * **This overturns a rule, and the amendment is the point rather than an
 * exception.** [DESIGN.md](../../../DESIGN.md) §9 said a loading state is
 * "never a shimmer, never a spinner", and DESIGN-TODO §11.5 listed a spinner as
 * *forbidden*. The owner asked for one (2026-09-11, twice), which outranks a
 * [Recommended] verdict of mine — so DESIGN.md §9 is **amended** to draw the
 * line where it actually falls, rather than the component quietly contradicting
 * the document. The objection that produced the "no" was real, and it survives
 * as the division of labour:
 *
 * | Wait | What it gets | Why |
 * |---|---|---|
 * | content whose SHAPE is known — a route, a list, a table | **`Skeleton`** | it can describe what is arriving and hold its space, so nothing jumps when it lands |
 * | a wait with NO predictable shape — a submit in flight, an export being generated, a poll | **`Spinner`** | there is nothing to draw a placeholder of; a bar pretending to be a row would be a lie |
 *
 * Three rules come with it, and they are what keep the original objection
 * answered:
 *
 * 1. **Never where a skeleton fits.** A spinner filling a region a skeleton
 *    could describe is the thing §9 was right to refuse — it says "something is
 *    happening" and nothing else, and it collapses the layout to a centred dot.
 * 2. **Never alone.** A spinner always sits beside a word, or carries one in
 *    `label`. Motion is not a message: a reader who cannot see it, or who has
 *    animation switched off, has to get the same information.
 * 3. **Never two indicators competing.** One wait, one place to look. Pairing
 *    this with a relabel is not competition and is the wanted case — the
 *    spinner marks the place instantly, the new label says what is happening —
 *    which is exactly how `SubmitButton` uses it. What is forbidden is a
 *    spinner next to a progress bar next to a skeleton for one operation.
 *
 * It draws in `currentColor` at `1em`, so it inherits the size and colour of
 * whatever it sits in and needs no variant per context — the same reason the
 * icon set draws that way.
 */
export function Spinner({
  /**
   * What is being waited for. Rendered for assistive technology only, because
   * the visible copy is almost always the word this sits beside — and hearing
   * "Loading" twice is worse than hearing it once.
   */
  label = "Loading",
  /** Set when the visible text already says it, to avoid announcing twice. */
  labelled = false,
  className,
  size,
}: {
  label?: string;
  labelled?: boolean;
  className?: string;
  /** Overrides the inherited `1em`. Use a token step, not a literal. */
  size?: number;
}) {
  return (
    <>
      <svg
        aria-hidden="true"
        className={cn(
          // `1em` and `currentColor`: it is a glyph in the text it sits in.
          "size-[1em] shrink-0",
          /*
            `motion-safe:` rather than an unguarded `animate-spin`. The one
            thing a spinner must not do is be the only channel: with animation
            off it becomes a static ring, which still marks the place, while
            the label below carries the meaning. DESIGN.md §10's reduced-motion
            rule is not optional for the one component whose entire appearance
            is motion.
          */
          "motion-safe:animate-spin",
          className,
        )}
        fill="none"
        height={size ?? undefined}
        viewBox="0 0 24 24"
        width={size ?? undefined}
      >
        {/*
          A track plus an arc, not a bare arc. The full circle at low opacity is
          what makes the thing read as a ring at rest — which is exactly the
          state a reduced-motion reader sees, and a lone 90° stroke sitting
          still looks like a rendering fault rather than a control.
        */}
        <circle
          cx="12"
          cy="12"
          opacity="0.25"
          r="9"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.5"
        />
      </svg>
      {!labelled && (
        /*
          `role="status"` and not `role="alert"`: a wait is polite. It is also
          not `aria-live` on the SVG — a live region wrapping an animation can
          re-announce on every frame in some screen readers, so the text is a
          separate, stable node.
        */
        <span className="visually-hidden" role="status">
          {label}
        </span>
      )}
    </>
  );
}

/**
 * A whole region waiting, for the case where there is genuinely no shape.
 *
 * The visible word is the component, not decoration on it: this is the one
 * place a spinner is allowed to occupy space, and it earns that only by saying
 * what it is waiting for. If you can name the shape of what is coming, this is
 * the wrong component — use `Skeleton`.
 */
export function SpinnerBlock({
  children = "Working…",
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center justify-center gap-2 py-8",
        "text-ui-sm text-ink-muted",
        className,
      )}
    >
      <Spinner labelled />
      {children}
    </p>
  );
}
