import type { ReactNode } from "react";
import { CategoryMark } from "./icons";
import { categoryShape, categoryShortLabel } from "@/lib/threads";

/**
 * Status vocabulary: a state is always written out as a word and reinforced by
 * a tone, never conveyed by colour alone (DESIGN.md §9). Status stamps are
 * deliberately text-only: decorative state shapes were removed owner-wide on
 * 2026-09-15.
 *
 * Every badge here delegates to `Stamp` rather than styling itself, which is
 * what keeps one state from drifting away from the others. A neutral COUNT is
 * not a status and belongs in `Tag` (./tag), which deliberately has no tone.
 */

/**
 * The four tones, named by appearance — **decision D-C, closed by the owner on
 * 2026-09-11 in favour of these names.**
 *
 * They had been renamed to `positive | attention | problem | quiet` in an
 * earlier pass, and that was reverted here: the owner's call is the colour
 * vocabulary. What that costs is worth writing down rather than discovering
 * later, because nothing in the code will say it:
 *
 *   - It is the one place in the system named by appearance. Every token is
 *     named by role (`--color-accent`, never `--color-teal-700`), so a reader
 *     moving between the token layer and this API changes conventions.
 *   - The names no longer describe their colours. After D-D repainted the
 *     palette, `green` is UP Forest Green (#0b5a33) and `red` is UP Maroon
 *     (#8f2226) — so `tone="red"` means the maroon problem signal, and
 *     `tone="green"` means both "action" and "good state", since the accent
 *     carries both and there is no separate green.
 *
 * The naming choice is a readability question for developers rather than an
 * accessibility one for students: the visible word carries the meaning and
 * the tone only reinforces it.
 *
 * Note `tone="neutral"` and `buttonClass({ variant: "quiet" })` are different
 * vocabularies on purpose — a stamp has no `quiet` and a button has no
 * `neutral`.
 */
export type Tone = "green" | "amber" | "red" | "neutral";

/** Status as a text-only stamp: bordered, compact, and readable in grayscale. */
export function Stamp({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return <span className={`stamp stamp--${tone}`}>{children}</span>;
}

/** A question category: a word and a drawn silhouette. Never a colour. */
export function Category({ value }: { value: string | null | undefined }) {
  return (
    <span className="category">
      <CategoryMark shape={categoryShape(value)} />
      {categoryShortLabel(value)}
    </span>
  );
}

export type ValidityName = "valid" | "flagged" | "invalid";

/**
 * STAFF-FACING validity badge. Never render this for a student: `flagged` is an
 * internal state a student must not learn about (decision D15).
 */
export function ValidityBadge({ validity }: { validity: ValidityName }) {
  const map: Record<ValidityName, { tone: Tone; label: string }> = {
    valid: { tone: "green", label: "Valid" },
    flagged: { tone: "amber", label: "Flagged — awaiting instructor" },
    invalid: { tone: "red", label: "Invalid" },
  };
  const { tone, label } = map[validity];
  return <Stamp tone={tone}>{label}</Stamp>;
}

/** What a STUDENT sees about their own submission: counted or not. Never "flagged". */
export function CreditBadge({ counted }: { counted: boolean }) {
  return (
    <Stamp tone={counted ? "green" : "red"}>
      {counted ? "Counted" : "Not counted"}
    </Stamp>
  );
}

export type PriorityName = "low" | "normal" | "high" | "urgent";

export function PriorityBadge({ priority }: { priority: PriorityName }) {
  const map: Record<PriorityName, { tone: Tone; label: string }> = {
    low: { tone: "neutral", label: "Low" },
    normal: { tone: "neutral", label: "Normal" },
    high: { tone: "amber", label: "High" },
    urgent: { tone: "red", label: "Urgent" },
  };
  const { tone, label } = map[priority];
  return <Stamp tone={tone}>{label}</Stamp>;
}

export type CycleStateName =
  "draft" | "scheduled" | "open" | "closed" | "archived" | "skipped";

/** Cycle state as a written label reinforced by tone. */
export function CycleStateBadge({ state }: { state: CycleStateName }) {
  const map: Record<CycleStateName, { tone: Tone; label: string }> = {
    draft: { tone: "neutral", label: "Draft" },
    scheduled: { tone: "amber", label: "Scheduled" },
    open: { tone: "green", label: "Open" },
    /*
      NEUTRAL, not maroon — `form-table.md` §5 ("Closed → muted gray"), owner
      2026-09-11, reversing the comment that used to sit here.
      
      That comment argued open-vs-closed is the binary a teacher scans for, so
      closed "earns a signal". The counter-argument, which is the owner's: a
      form closing is the NORMAL end of its life, not a problem, and maroon is
      this palette's problem signal. A table of finished forms rendered as a
      column of maroon badges reads as a list of failures. `Open` carrying the
      only colour makes the same distinction by contrast, and leaves maroon
      meaning what it means everywhere else.
    */
    closed: { tone: "neutral", label: "Closed" },
    archived: { tone: "neutral", label: "Archived" },
    skipped: { tone: "neutral", label: "Skipped" },
  };
  const { tone, label } = map[state];
  return <Stamp tone={tone}>{label}</Stamp>;
}
