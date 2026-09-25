import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconStar } from "@/components/ui/icons";

/**
 * Form primitives, transcribed from `.field`, `.choice`, `.question` and their
 * relatives in globals.css. DESIGN.md §6 governs; nothing here is redesigned.
 *
 * The one piece of behaviour worth naming, because it is easy to "tidy away":
 * pointer focus shifts the border and adds a soft 3px wash ring, while KEYBOARD
 * focus keeps the global 3px outline and the ring steps aside, so the two never
 * stack. That is deliberate — a student mid-sentence on something uncomfortable
 * should get a warm edge, not a shouted one — and it is why `focus:` and
 * `focus-visible:` disagree on purpose below.
 */

/** Border, fill and focus behaviour shared by every text-entry control. */
const control = [
  "w-full bg-paper border border-control-edge rounded-control",
  "transition-[border-color,box-shadow] duration-120",
  "focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-wash)]",
  "focus-visible:shadow-none",

  /*
    A field that is WRONG reads as wrong, in the app's own colour.

    Two sources of "wrong", and until 2026-09-11 only one of them was drawn:

    - `aria-invalid` — the SERVER refused the value. Already handled.
    - `:user-invalid` — the BROWSER refused to submit the form, because a
      required field is empty or a value does not match its type. **This was
      drawn as nothing**, and the owner is right to ask: press *Create course*
      with the code blank and the only feedback was the browser's own bubble.

    `:user-invalid` and not `:invalid`, and the difference is the whole reason
    this is safe to add: `:invalid` matches an empty required field from the
    moment the page loads, so styling it would paint a pristine form red before
    the reader has typed anything. `:user-invalid` matches only after they have
    interacted with the field or tried to submit — the browser tracks that for
    us, which is why this needs no JavaScript and no "touched" state.
  */
  "aria-invalid:border-red aria-invalid:bg-red-tint",
  "user-invalid:border-red user-invalid:bg-red-tint",

  /*
    And these have to OUTRANK the focus treatment above, because the browser
    **focuses the field it refused to submit**. Measured before the fix: after
    pressing submit with the code empty, the border was `rgb(11, 90, 51)` —
    `--color-accent`. The field that blocked the submission was painted in the
    colour that means *action* everywhere else in the app, which is worse than
    no feedback at all.
    
    Stacked variants rather than source order: `&:focus:user-invalid` is two
    pseudo-classes against `&:focus`'s one, so it wins on **specificity** and
    not on where Tailwind happens to sort the utility.
  */
  "focus:aria-invalid:border-red",
  "focus:aria-invalid:shadow-[0_0_0_3px_var(--color-red-wash)]",
  "focus:user-invalid:border-red",
  "focus:user-invalid:shadow-[0_0_0_3px_var(--color-red-wash)]",
].join(" ");

/**
 * A date, time or number input focuses with the plain outline instead of the
 * wash ring. Their native pickers draw their own chrome, and the ring plus that
 * chrome read as two overlapping focus states.
 */
const nativePickerFocus =
  "focus:outline focus:outline-3 focus:outline-focus focus:outline-offset-2 focus:shadow-none";

export function Field({ className, type, ...props }: ComponentProps<"input">) {
  const usesNativePicker =
    type === "date" || type === "time" || type === "number";
  return (
    <input
      type={type}
      className={cn(
        control,
        /*
          `py-1.5` so the control is the 38px `--spacing-control` declares.

          With `py-2` it drew 39 — 8 + 8 around a 14px/1.5 line box plus 2px of
          border — one pixel over its own floor, and a `<select>` beside it drew
          exactly 38 because a select's line box is `normal` rather than 1.5. An
          input and a select sitting side by side in the same row, a pixel
          apart: visible, and the reason `modal.md` asks for "same input
          height" in writing. Measured in the browser, not reasoned about.
        */
        "min-h-control px-2.5 py-1.5",
        usesNativePicker && nativePickerFocus,
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      // `py-1.5` to match `Field` exactly. A select already drew 38 (its line
      // box is `normal`), so this changes nothing it renders and everything
      // about whether the two recipes can drift apart again.
      className={cn(control, "min-h-control px-2.5 py-1.5", className)}
      {...props}
    />
  );
}

/**
 * What a student types into a textarea is authored text, so it is set in the
 * document register while they write it (DESIGN.md §6). `resize-y` only: a
 * horizontally resizable field can be dragged wider than its column.
 */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        control,
        "p-2.5 resize-y font-document text-doc-staff",
        className,
      )}
      {...props}
    />
  );
}

/** A label above its field. Always visible — never a placeholder-as-label. */
/**
 * The field label's recipe, in one place.
 *
 * `.field-row > label` and `.field-label` were a single rule in the stylesheet,
 * used for two elements: the label above a control, and the `<legend>` naming a
 * group of them. `FieldRow` inlines it below; `FieldLabel` is the same recipe
 * for the cases that are not a field row — which is why this is a constant and
 * not a second copy of the utilities (§3.2).
 */
const labelRecipe =
  "flex flex-wrap items-center gap-2 text-ui-sm font-semibold";

/**
 * A label for a GROUP of controls rather than one — a `<legend>` over a set of
 * checkboxes, or a `<span>` where a legend is not allowed. Same look as the
 * label `FieldRow` renders, because in the stylesheet it was the same rule.
 */
export function FieldLabel({
  as: Tag = "legend",
  children,
  className,
}: {
  as?: "legend" | "span" | "p";
  children: ReactNode;
  className?: string;
}) {
  return <Tag className={cn(labelRecipe, className)}>{children}</Tag>;
}

export function FieldRow({
  label,
  optional,
  help,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  optional?: boolean;
  help?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-tight", className)}>
      <label className={labelRecipe} htmlFor={htmlFor}>
        {label}
        {optional && (
          <span className="text-meta font-normal text-ink-muted">optional</span>
        )}
      </label>
      {/* `max-w-measure` is not decoration: `.helper-text` carried a 68ch cap
          and this component had dropped it, so helper text under a full-width
          field would have run the whole column. Unbounded body text is a defect
          (DESIGN.md §2), and a rollout that loses the cap at 28 call sites is a
          regression disguised as a refactor. */}
      {help && (
        <p className="max-w-measure text-ui-sm text-ink-muted">{help}</p>
      )}
      {children}
    </div>
  );
}

/**
 * One radio or checkbox as a full-width 38px target.
 *
 * `has-[input:checked]` is the `:has()` selector the stylesheet already used, so
 * the native input stays the source of truth for checkedness and no JavaScript
 * is involved in the appearance of a checked choice.
 */
export function Choice({
  className,
  children,
  ...props
}: ComponentProps<"input">) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 min-h-control px-2.5 py-2",
        "bg-paper border border-control-edge rounded-control",
        "transition-[background-color,border-color] duration-120",
        "has-[input:checked]:border-accent has-[input:checked]:bg-accent-wash",
        className,
      )}
    >
      <input
        className="size-check shrink-0 accent-accent"
        type={props.type ?? "radio"}
        {...props}
      />
      {children}
    </label>
  );
}

/**
 * A group of choices, which can be wrong as a GROUP.
 *
 * `aria-invalid` lands here rather than on any one radio, because the fault is
 * "this question is unanswered", not "that option is wrong" — and `weekly-form`
 * puts it here for exactly that reason. So the red has to travel from the group
 * to its options, or a rejected question shows red error TEXT above a set of
 * controls that still look perfectly fine (which is what it did until
 * 2026-09-11: a rejected text field turned red and a rejected radio group did
 * not).
 *
 * It deliberately outranks a chosen option's accent edge — `[aria-invalid] >
 * label` is one element more specific than the child's own `:has()` rule. That
 * is the wanted reading: when a group is refused, the ANSWER is wrong, so the
 * option that was picked should not still look approved.
 */
export function ChoiceList({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid gap-tight",
        "aria-invalid:[&>label]:border-red aria-invalid:[&>label]:bg-red-tint",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * A linear scale, answered.
 *
 * Stars when the scale is star-shaped, a slider when it is not — one component
 * either way, because "how a linear scale is answered" is one pattern and §13's
 * rule is that a second component for an existing pattern is the defect.
 *
 * The owner asked for stars (2026-09-11), and a `linear_scale` question is
 * configurable: the teacher sets its own min, max and step. Stars only work
 * while there are few enough of them to count at a glance and each one means a
 * whole unit — so {@link starScale} decides, and anything outside that falls
 * back to the slider rather than drawing forty stars or half of one.
 *
 * Stars are the better control where they apply, and not only because they were
 * asked for: they are **radio inputs**, so they are arrow-key operable, they
 * post without JavaScript, and "not answered" is simply nothing checked. The
 * slider had to fake that last part with a hidden input, because a native range
 * always reports a value.
 */
export function ScaleInput({
  name,
  scale,
  value,
  onValueChange,
  labelledBy,
  className,
  ...props
}: {
  name: string;
  scale: { min: number; max: number; step: number };
  /** "" means not answered */
  value: string;
  onValueChange: (next: string) => void;
  labelledBy?: string;
} & Omit<ComponentProps<"input">, "value" | "onChange" | "name" | "type">) {
  return starScale(scale) ? (
    <ScaleStars
      className={className}
      labelledBy={labelledBy}
      name={name}
      onValueChange={onValueChange}
      scale={scale}
      value={value}
      {...props}
    />
  ) : (
    <ScaleSlider
      className={className}
      labelledBy={labelledBy}
      name={name}
      onValueChange={onValueChange}
      scale={scale}
      value={value}
      {...props}
    />
  );
}

/**
 * Whether a scale can be drawn as stars.
 *
 * Whole steps, and few enough to count without counting. Ten is the upper
 * bound because a 0–10 satisfaction scale is a real thing a teacher may ask
 * for and eleven stars is still scannable; 1–100 is not, and neither is a
 * half-step scale, where a star would have to mean half a unit.
 */
function starScale(scale: { min: number; max: number; step: number }): boolean {
  const step = scale.step > 0 ? scale.step : 1;
  if (!Number.isInteger(step)) return false;
  const count = Math.floor((scale.max - scale.min) / step) + 1;
  return count >= 2 && count <= 11;
}

function scaleValues(scale: {
  min: number;
  max: number;
  step: number;
}): number[] {
  const step = scale.step > 0 ? scale.step : 1;
  const values: number[] = [];
  for (let v = scale.min; v <= scale.max; v += step) values.push(v);
  return values;
}

/**
 * The star rating.
 *
 * A `radiogroup` of real radios with the input visually hidden and a star drawn
 * in its place, so every platform behaviour comes for free: arrow keys move
 * within the group, Tab skips past it, the label is clickable, and the value
 * posts with the form whether or not JavaScript ran.
 *
 * Stars fill CUMULATIVELY — choosing 4 fills one through four — which is what
 * makes a rating readable as a quantity rather than as a position. That is
 * purely visual: the accessible name of each radio is its number and its
 * unit ("4 of 5"), because "four stars" is a picture, not a value.
 *
 * `Clear` appears once something is chosen, and it is the only part of this
 * that needs JavaScript. A radio group cannot be un-checked by clicking, and
 * an optional question a student answered by mistake had no way back.
 */
function ScaleStars({
  name,
  scale,
  value,
  onValueChange,
  labelledBy,
  className,
  ...props
}: {
  name: string;
  scale: { min: number; max: number; step: number };
  value: string;
  onValueChange: (next: string) => void;
  labelledBy?: string;
} & Omit<ComponentProps<"input">, "value" | "onChange" | "name" | "type">) {
  const values = scaleValues(scale);
  const chosen = value === "" ? null : Number(value);

  return (
    <div className={cn("grid justify-items-start gap-tight", className)}>
      <div
        aria-labelledby={labelledBy}
        className="flex flex-wrap items-center gap-1"
        role="radiogroup"
      >
        {values.map((v) => {
          const filled = chosen !== null && v <= chosen;
          return (
            <label
              className="group cursor-pointer p-1 leading-none"
              key={v}
              title={`${v} of ${scale.max}`}
            >
              <input
                checked={chosen === v}
                className="peer sr-only"
                name={name}
                onChange={() => onValueChange(String(v))}
                type="radio"
                value={v}
                {...props}
              />
              <span className="sr-only">
                {v} of {scale.max}
              </span>
              <IconStar
                className={cn(
                  "transition-colors",
                  filled ? "text-accent" : "text-rule-ink",
                  // Focus has to be visible on the STAR, because the input it
                  // belongs to is `sr-only` and has no box of its own.
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                  "group-hover:text-accent-deep",
                )}
                fill={filled ? "currentColor" : "none"}
                size={28}
              />
            </label>
          );
        })}

        <span
          className={cn(
            "ml-2 tabular-nums",
            chosen === null
              ? "text-meta text-ink-muted"
              : "text-ui font-semibold text-ink",
          )}
        >
          {chosen === null ? "Not answered" : `${chosen} of ${scale.max}`}
        </span>
      </div>

      {chosen !== null && (
        <button
          className="text-meta text-ink-muted underline decoration-1 underline-offset-2 hover:text-ink"
          onClick={() => onValueChange("")}
          type="button"
        >
          Clear
        </button>
      )}
    </div>
  );
}

/**
 * The fallback for a scale too wide, or too finely stepped, to be stars.
 *
 * Unnamed range plus a hidden input, because a native range always reports a
 * value — an untouched one sits at its midpoint, so naming it directly would
 * post an answer the student never gave, and on an optional question that is
 * inventing data. The readout says "Not answered" until there is an answer, so
 * "nothing yet" and "the middle" cannot look alike.
 *
 * Unlike the stars, this needs JavaScript: the hidden input is what carries the
 * value, and nothing writes it before hydration. The form already depends on JS
 * for the student's own question blocks, and the usual `<noscript>` fallback
 * would need a second `dangerouslySetInnerHTML`, which AGENTS.md forbids
 * outside `rich-text.tsx`.
 */
function ScaleSlider({
  name,
  scale,
  value,
  onValueChange,
  labelledBy,
  className,
  ...props
}: {
  name: string;
  scale: { min: number; max: number; step: number };
  value: string;
  onValueChange: (next: string) => void;
  labelledBy?: string;
} & Omit<ComponentProps<"input">, "value" | "onChange" | "name" | "type">) {
  const step = scale.step > 0 ? scale.step : 1;
  const answered = value !== "";
  const midpoint =
    scale.min + Math.floor((scale.max - scale.min) / 2 / step) * step;

  return (
    <div className={cn("grid gap-tight", className)}>
      {answered && <input name={name} type="hidden" value={value} />}
      <div className="flex items-center gap-4">
        <input
          aria-labelledby={labelledBy}
          aria-valuetext={answered ? undefined : "Not answered"}
          className={cn(
            "h-touch min-w-0 flex-1 cursor-pointer appearance-none bg-transparent",
            "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-control [&::-webkit-slider-runnable-track]:bg-rule",
            "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-control [&::-moz-range-track]:bg-rule",
            "[&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-paper [&::-webkit-slider-thumb]:bg-accent",
            "[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-paper [&::-moz-range-thumb]:bg-accent",
            !answered &&
              "[&::-webkit-slider-thumb]:border-control-edge [&::-webkit-slider-thumb]:bg-paper [&::-moz-range-thumb]:border-control-edge [&::-moz-range-thumb]:bg-paper",
            "aria-invalid:[&::-webkit-slider-runnable-track]:bg-red-edge aria-invalid:[&::-moz-range-track]:bg-red-edge",
          )}
          max={scale.max}
          min={scale.min}
          onChange={(e) => onValueChange(e.target.value)}
          step={step}
          type="range"
          value={answered ? value : String(midpoint)}
          {...props}
        />
        <output
          className={cn(
            "w-14 shrink-0 text-right tabular-nums",
            answered
              ? "text-ui font-semibold text-ink"
              : "text-meta text-ink-muted",
          )}
        >
          {answered ? value : "Not answered"}
        </output>
      </div>
      <div className="flex justify-between text-meta text-ink-muted tabular-nums">
        <span>{scale.min}</span>
        <span>{scale.max}</span>
      </div>
    </div>
  );
}

/**
 * A row of equal-width choice cells.
 *
 * No longer used for a linear scale — that is `ScaleSlider` now — but still the
 * layout for Yes/No, which is two labelled choices rather than a range and
 * would be nonsense as a slider.
 */
export function ScaleList({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-tight [&>label]:min-w-scale-cell [&>label]:justify-center",
        // Same as `ChoiceList`: a scale is refused as a whole.
        "aria-invalid:[&>label]:border-red aria-invalid:[&>label]:bg-red-tint",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * One question on the sheet: a hairline above it, never a nested card.
 *
 * The `float-left w-full` on the legend is not a hack to be cleaned up — a
 * `<legend>` does not honour `display` consistently across browsers, and
 * floating it is what lets it take the full column width and carry the document
 * register. The sibling then has to `clear` it.
 */
export function Question({
  legend,
  /**
   * Stays on the `<legend>` itself, because the controls inside point at it
   * with `aria-labelledby`. Moving it to a wrapper would still resolve, but the
   * element carrying a question's accessible name should be the element the
   * platform already treats as its label.
   */
  legendId,
  children,
  className,
}: {
  legend: ReactNode;
  legendId?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset
      className={cn(
        "m-0 border-0 border-t border-t-rule py-6",
        "first-of-type:border-t-0 first-of-type:pt-2",
        className,
      )}
    >
      <legend
        className="float-left w-full p-0 font-document text-prompt font-bold"
        id={legendId}
      >
        {legend}
      </legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  );
}

/**
 * The student's own question / general-comment section.
 *
 * Same rhythm as a `Question` — a hairline above, the legend in the document
 * register — but deliberately NOT the same component: `.own-item` has no
 * `:first-of-type` exemption, so a form with no teacher questions still shows
 * the rule and the full 24px above it. Sharing `Question` here would silently
 * change that one case, which is exactly the kind of drift a migration is
 * supposed to avoid.
 *
 * It used to be a green-washed bordered box with tinted inputs. It is now the
 * same hairline as every other question on the sheet, so the form reads as one
 * continuous document rather than a form with two boxes glued to the end.
 */
export function OwnItem({
  legend,
  children,
  className,
}: {
  legend: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset
      className={cn(
        // `max-md:py-4` is the legacy `@media (max-width: 720px)` override, not
        // a new idea: on a phone this section is most of the page, so it takes
        // the tighter rhythm.
        "m-0 border-0 border-t border-t-rule py-6 max-md:py-4",
        className,
      )}
    >
      <legend className="float-left w-full p-0 font-document text-prompt font-bold">
        {legend}
      </legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  );
}

/** The privacy line under the own-item legend. One line, never two paragraphs. */
export function OwnItemNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 mb-3 max-w-measure text-ui-sm/normal text-ink-muted">
      {children}
    </p>
  );
}

/** One repeated block inside the own-item section: a hairline, never a card. */
export function OwnItemBlock({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 border-t border-t-rule pt-4 first-of-type:mt-0 first-of-type:border-t-0 first-of-type:pt-0">
      {children}
    </div>
  );
}

/** A strip label: a printed label for a region, not a word about content. */
export function Label({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn("text-strip font-bold uppercase text-ink-muted", className)}
    >
      {children}
    </p>
  );
}

/** The REQUIRED / optional line under a prompt, plus any help text. */
export function QuestionNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 mb-3 flex max-w-measure flex-wrap items-center gap-2 text-ui-sm/normal text-ink-muted">
      {children}
    </p>
  );
}

export function QuestionDesc({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 max-w-measure text-ui-sm/normal text-ink-muted">
      {children}
    </div>
  );
}

/**
 * A numbered step in a long form.
 *
 * Why numbers: the new-form editor asks for four different things — what the
 * form is, who gets it, when it goes out, what it asks — and before this they
 * were four headings in TWO registers (two 20px serif panel titles, two 11px
 * uppercase chips buried inside `DeliveryFields`), which read as unrelated
 * blocks rather than as one form with four parts. A number says "there are
 * four of these and this is the second", which a heading alone cannot.
 *
 * Why declarative titles: they were phrased as questions the form asks the
 * reader ("What this form is", "Who gets this form"). A section heading is a
 * label on a container, not a question — "Form details", "Audience". The
 * owner's call, 2026-09-11.
 *
 * `step` is passed rather than derived from a CSS counter so the numbering
 * survives the one branch that changes it: a template-only form has no
 * audience or schedule step, and a counter would silently renumber while a
 * wrong explicit number is a visible bug.
 */
export function FormSection({
  step,
  title,
  children,
  className,
}: {
  step: number;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    /*
      `grid gap-5` is load-bearing, not tidiness: the SECTION owns the distance
      between its heading and its content, so every step has the same one.
      It used to come from `.notice--pad > .panel-title`, a descendant rule
      keyed on a class this heading no longer carries — so the gap silently
      became zero here while the one caller that happened to put `mt-4` on its
      own inner div kept it. Two steps with a gap, two without.
    */
    <section className={cn("notice notice--pad grid gap-5", className)}>
      <h2 className="flex items-baseline gap-2 font-document text-panel-title font-bold">
        {/*
          The number is quieter than the title and tabular, so a column of them
          aligns. It is not a stamp: a step in a sequence is not a status, and
          borrowing the stamp's chrome here would make four headings look like
          four states (DESIGN.md §9).
        */}
        <span className="text-ink-faint tabular-nums">{step}.</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
