/**
 * The red asterisk that marks a required field (§10.4.4).
 *
 * Optional is the default and is NOT marked: annotating both meant every label
 * carried a qualifier, which is noise on a form where most fields are required.
 *
 * Three independent channels carry "required", so none of them is load-bearing
 * alone — this is what lets the asterisk replace the word without breaking
 * DESIGN.md §9's "never colour alone":
 *
 *   1. the glyph's PRESENCE against fields that have none — survives grayscale
 *      and colour blindness, because the signal is not the red;
 *   2. a visually-hidden "required", so a screen reader hears the word the
 *      asterisk replaced;
 *   3. the control's own `required` attribute, which the browser enforces and
 *      exposes to the accessibility tree independently of this markup.
 *
 * `aria-hidden` on the glyph is deliberate: without it a screen reader reads
 * "star required" for every field.
 */
export function RequiredMark() {
  return (
    <>
      <span className="required-mark" aria-hidden="true">
        *
      </span>
      <span className="visually-hidden">required</span>
    </>
  );
}
