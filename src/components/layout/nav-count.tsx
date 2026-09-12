import { cn } from "@/lib/cn";

/**
 * The count on a navigation row: "there is work waiting here".
 *
 * **One badge, two grounds (§12.6).** The audit found "the same fact, drawn two
 * ways" — `.ws-rail__count` was border-only while `.ws-subnav__count` carried a
 * full amber wash. Looked at closely they were already the *same* rule in
 * everything that can be shared — same 20px minimum, same inset, same
 * `--radius-stamp`, same `--text-stamp` at weight 700, same tabular figures —
 * and differed in exactly one property, the fill.
 *
 * That difference is real and is **not** a drift to be flattened: on the rail's
 * `#123a28` ground every wash in the amber family lands within 1.2 contrast, so
 * a filled badge there is a smudge. The rail's version therefore spends the
 * signal on its border and text instead, in `--rail-*` values measured against
 * that ground.
 *
 * So the reconciliation is not "make them identical" — it is to put the one
 * rule in one place with its one documented exception, rather than leaving two
 * rules that happen to agree today. Whichever ground it lands on, the meaning
 * is the same and so is the geometry.
 *
 * **Why it is not `Tag`.** A tag "carries no state — quiet paper fill, one
 * hairline" (`ui/tag.tsx`), and this is the opposite: a number here means
 * *attention*, which is what the amber family is for. **Why it is not `Stamp`**:
 * a stamp is a word AND a shape AND a tone, and this is a bare figure. It is
 * its own thing, which is why it is a third small component rather than a
 * borrowed one.
 *
 * The accessible name lives here too. It had been written out three times — in
 * the rail and twice in the sub-nav — and three copies of a string that says
 * what a number MEANS is three chances for one of them to say something else.
 */
export function NavCount({
  value,
  ground = "paper",
  /**
   * What the number counts, read after it by a screen reader: "3, needing
   * review". Defaulted because every current call site counts the same thing,
   * and named so the next one that does not has somewhere to say so.
   */
  describes = "needing review",
  className,
}: {
  value: number;
  ground?: "paper" | "rail";
  describes?: string;
  className?: string;
}) {
  // A count of nothing is not a zero badge — it is no badge. An empty or "0"
  // chip reads as a state rather than as an absence.
  if (!value) return null;
  return (
    <span
      className={cn(
        "flex-none min-w-5 px-tight py-px rounded-stamp border text-center",
        "text-stamp font-bold tabular-nums",
        ground === "rail"
          ? "border-rail-count-edge text-rail-count"
          : "border-amber-edge bg-amber-wash text-amber-deep",
        className,
      )}
    >
      {value}
      <span className="sr-only"> {describes}</span>
    </span>
  );
}
