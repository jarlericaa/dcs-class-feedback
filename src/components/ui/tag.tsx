import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A tag is a COUNT or a discrete fact. It is deliberately not a `Stamp`.
 *
 * `Stamp` means *status*: it carries a tone and a shape precisely so a state
 * reads without colour (DESIGN.md §9, "a word AND a shape AND a tone"). A tag
 * carries no state, so it gets neither — quiet paper fill, one hairline, ink at
 * the soft step. If tags borrowed the stamp's washes, status would stop being
 * legible AS status, which is the one thing the palette protects hardest.
 *
 * It replaces the dot-separated `MetaList` sentence at the sites where every
 * item is a countable fact ("3 forms · 1 open now · 2 sections"). It does NOT
 * replace `MetaList` everywhere: that component also carries eyebrow labels
 * above a title and full sentences of prose, and neither belongs in a chip.
 * Which one a site wants is a judgement about the CONTENT, not a style choice.
 */
export function Tag({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5",
        "border border-rule rounded-stamp bg-paper-quiet",
        "font-sans text-meta text-ink-soft",
        // Counts line up when they sit in a column of cards.
        "tabular-nums whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A row of tags, with the same input contract as `MetaList` so a site can be
 * converted by swapping the element: falsy entries drop out rather than
 * rendering an empty chip, and nothing renders at all when every item is
 * absent — an empty bordered box is worse than no box.
 */
export function TagList({
  items,
  className,
}: {
  items: (string | null | undefined | false)[];
  className?: string;
}) {
  const facts = items.filter(
    (item): item is string => !!item && item.trim() !== "",
  );
  if (facts.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-tight", className)}>
      {facts.map((fact, index) => (
        <Tag key={`${fact}-${index}`}>{fact}</Tag>
      ))}
    </span>
  );
}
