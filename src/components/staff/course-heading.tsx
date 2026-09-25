import { MetaList } from "@/components/ui";
import { termParts } from "@/lib/term";

/**
 * The course header's subtitle, in ONE place.
 *
 * Every view of a course — Forms, Responses, Class Q&A, Participation — leads
 * with the same heading, because they are all views *of the course*: the code is
 * the subject, the tab says which view, and the breadcrumb says how you got
 * there. Nothing repeats.
 *
 * That is a change from how this used to work, and it is the fix for two owner
 * reports at once:
 *
 *   - *"selected tab from the cs33 like responses replaces the cs33 with
 *     Responses, but the forms doesnt do that?"* — Responses was setting its own
 *     heading, so navigating a tab swapped the course's name for the tab's. It
 *     repeated the tab (already marked maroon and underlined a few pixels
 *     below) and discarded the only thing naming the course.
 *   - *"the cs145 and cs33 courses doesnt have the same layout… make it
 *     consistent"* — with the subtitle built here rather than per page, two
 *     courses cannot drift apart, and neither can two tabs of one course.
 *
 * ONE line now: the term. The course's descriptive title used to sit above it
 * (`sidebar.md` §5 asked for two lines) and the owner has since dropped it —
 * "course titles are unnecessary here", 2026-09-11, which is the same
 * direction §10.3 was already travelling when it made the field optional. The
 * code in the heading above is what names the course; a sentence describing it
 * was explanation nobody was reading.
 *
 * A course with several terms says how many rather than listing them. One with
 * no terms at all renders no subtitle — the heading stands alone rather than
 * leaving an empty line under it.
 */
export function courseSubtitle({
  terms,
}: {
  /** the distinct terms of this course's class lists */
  terms?: string[];
}) {
  const list = terms ?? [];
  const termLine =
    list.length === 1
      ? termParts(list[0]!)
      : list.length > 1
        ? [`${list.length} terms`]
        : [];
  if (termLine.length === 0) return undefined;
  return <MetaList items={termLine} />;
}
