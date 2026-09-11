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
 * Two lines, per `sidebar.md` §5: the course's name, then its term. A course
 * with no name renders one line; one with several terms says how many rather
 * than listing them.
 */
export function courseSubtitle({
  title,
  terms,
}: {
  title?: string | null;
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
  if (!title && termLine.length === 0) return undefined;
  return (
    <div className="grid gap-px">
      {title && <span>{title}</span>}
      {termLine.length > 0 && <MetaList items={termLine} />}
    </div>
  );
}
