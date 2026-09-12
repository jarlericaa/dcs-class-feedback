import type { ReactNode } from "react";
import { formatDateTime } from "@/lib/datetime";
import { shortAgo } from "@/lib/threads";
import { IconPrivate, IconPublic } from "@/components/ui/icons";

/**
 * A private thread, on either side of it.
 *
 * Staff and students read the same conversation and must read it the same way,
 * so the shape lives here once rather than being drawn twice and drifting. What
 * differs is only what each side may be told: staff see which colleague
 * replied, a student sees "your teaching team" — that decision belongs to the
 * caller, and this component takes whatever name it is handed.
 *
 * Laid out like the comment threads people already read every day: a mark, the
 * author and the time on one line, the words directly under them. Two things
 * that pattern usually carries are deliberately absent —
 *
 * - **No reactions or share.** These were written under an anonymity promise,
 *   often to report a problem with the teaching. A score on a student's words
 *   would break the frame that makes them willing to write honestly.
 * - **No nesting.** The schema has no parent message; every reply hangs off the
 *   question. Indenting one under another would draw a structure that does not
 *   exist and imply somebody replied to a colleague rather than to the student.
 *
 * Where the audience is stated, it is stated once for the whole thread — never
 * on every message. That is how an anonymity promise turns into wallpaper: the
 * one sentence that matters most becomes the one the reader stops seeing.
 */
export function Thread({
  audience,
  children,
}: {
  /**
   * Who can read this conversation, in the reader's own terms — where that
   * needs saying. A student is deciding what is safe to write and has no
   * colleague's context for it, so their view states it. Staff already read
   * "replied privately" on every message and the audience again in the composer
   * they are about to type into, so theirs does not.
   */
  audience?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="thread">
      {audience && <p className="thread__audience">{audience}</p>}
      <div className="thread__messages">{children}</div>
    </div>
  );
}

export function ThreadAudience({
  scope,
  children,
}: {
  scope: "private" | "public";
  children: ReactNode;
}) {
  return (
    <>
      {scope === "public" ? (
        <IconPublic size={12} />
      ) : (
        <IconPrivate size={12} />
      )}
      {children}
    </>
  );
}

/**
 * One message.
 *
 * `from` tints the mark, because a reader needs to tell at a glance whether the
 * person who wrote this was asking or answering. It is reinforcement, not the
 * signal: the author's name is right beside it in words.
 */
export function ThreadMessage({
  author,
  mark,
  action,
  at,
  timezone,
  from = "staff",
  children,
}: {
  author: string;
  /**
   * The mark: initials for a person, a drawn glyph for an author that is not
   * one. "The teaching team" has no initials, and inventing some would imply a
   * single individual behind a reply the product deliberately attributes to a
   * group.
   */
  mark?: ReactNode;
  /** what they did, as a verb: "replied privately", "followed up" */
  action: string;
  at: Date | null;
  timezone: string;
  from?: "staff" | "student" | "public";
  children: ReactNode;
}) {
  return (
    <article className={`thread__msg thread__msg--${from}`}>
      <span className="thread__mark" aria-hidden="true">
        {mark ?? "—"}
      </span>
      <div className="thread__main">
        <p className="thread__head">
          <span className="thread__author">{author}</span>
          <span className="thread__action">{action}</span>
          <ThreadWhen at={at} timezone={timezone} />
        </p>
        {children}
      </div>
    </article>
  );
}

/**
 * "2h", with the full date underneath it.
 *
 * A thread is read as a sequence — how long this student has been waiting, how
 * quickly somebody answered — and "9 Aug 2026, 12:18 am" makes that arithmetic
 * the reader's job. The exact time still matters near a deadline, so it stays
 * one hover or one screen-reader stop away rather than being thrown out.
 */
function ThreadWhen({ at, timezone }: { at: Date | null; timezone: string }) {
  if (!at) return null;
  const exact = formatDateTime(at, timezone);
  return (
    <time className="thread__when" dateTime={at.toISOString()} title={exact}>
      {shortAgo(at)}
      <span className="visually-hidden"> ago, {exact}</span>
    </time>
  );
}
