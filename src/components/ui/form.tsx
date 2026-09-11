import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

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

/** A linear scale: the same choices, laid out as a row of equal-width cells. */
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
