import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CoursesLoading from "@/app/teach/courses/loading";
import CourseLoading from "@/app/teach/courses/[id]/loading";
import ResponsesLoading from "@/app/teach/courses/[id]/responses/loading";
import NewFormLoading from "@/app/teach/courses/[id]/forms/new/loading";
import ParticipationLoading from "@/app/teach/sections/[id]/participation/loading";
import RootLoading from "@/app/loading";

/**
 * The skeletons follow the layout of the pages they precede (owner ask,
 * 2026-09-11), and this is what holds them to it.
 *
 * The reason a test is worth having here rather than a screenshot: a skeleton's
 * whole job is that **the content does not jump when it lands**, and it fails
 * that silently. A placeholder with four columns before a five-column table
 * looks perfectly fine on its own — the fault only exists in the transition,
 * which nobody re-checks after editing a page. So the shape is asserted against
 * the page it stands in for, and the assertion is the specification.
 *
 * A route-level `loading.tsx` is a Suspense fallback: it renders synchronously,
 * takes no props and reads no data, which is exactly why it can be rendered to
 * a string here. Anything in one of these that needs `await` is a bug this test
 * will refuse to compile.
 */

/** Count elements carrying a class, without a DOM. */
function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

const FRAME = {
  /** the 52px top bar, drawn for real rather than pulsed */
  topbar: "h-topbar",
  /** the rail, on its own fenced ground */
  rail: "ws-rail",
  /** the pulse — placeholder content only */
  pulse: "animate-pulse",
};

describe("route skeletons keep the app's chrome", () => {
  const every = {
    "/": RootLoading,
    "/teach/courses": CoursesLoading,
    "/teach/courses/[id]": CourseLoading,
    "/teach/courses/[id]/responses": ResponsesLoading,
    "/teach/courses/[id]/forms/new": NewFormLoading,
    "/teach/sections/[id]/participation": ParticipationLoading,
  };

  for (const [route, Loading] of Object.entries(every)) {
    it(`${route} draws the shell, not a blank page`, () => {
      const markup = renderToStaticMarkup(<Loading />);
      // Without this the whole window would flash on every slow navigation:
      // `AppShell` is rendered by the page, so `loading.tsx` replaces it too.
      expect(markup).toContain(FRAME.topbar);
      expect(markup).toContain(FRAME.rail);
      // The chrome must NOT pulse — it is not waiting for anything.
      const railIndex = markup.indexOf(FRAME.rail);
      const railTag = markup.slice(markup.lastIndexOf("<", railIndex), railIndex + 200);
      expect(railTag).not.toContain(FRAME.pulse);
    });

    it(`${route} announces itself once, politely`, () => {
      const markup = renderToStaticMarkup(<Loading />);
      expect(occurrences(markup, 'role="status"')).toBe(1);
      expect(markup).toContain("Loading");
      // Never assertive: a navigation in progress must not interrupt.
      expect(markup).not.toContain('role="alert"');
    });
  }
});

describe("each skeleton matches its own page", () => {
  it("the courses list is cards with a four-tag row and no tab bar", () => {
    const markup = renderToStaticMarkup(<CoursesLoading />);
    // The tag row is the tallest thing in a course card; under-drawing it lets
    // the list shift upward when the real cards arrive.
    expect(occurrences(markup, "h-6")).toBeGreaterThanOrEqual(12); // 3 cards x 4 tags
    // This route is the top of the staff workspace and has no tabs.
    expect(markup).not.toContain("h-bar");
  });

  it("a course's Forms tab is a five-column table under five tabs", () => {
    const markup = renderToStaticMarkup(<CourseLoading />);
    expect(markup).toContain("h-bar");
    // 5 header cells + 3 rows x 5 cells
    expect(occurrences(markup, 'class="flex-1"')).toBe(5 + 3 * 5);
  });

  it("the participation matrix is drawn wide, not narrow", () => {
    const markup = renderToStaticMarkup(<ParticipationLoading />);
    // Deliberately an over-estimate: the real table scrolls horizontally, so
    // extra columns are clipped by the same scroller, while too few would let
    // the sheet visibly jump wider.
    expect(occurrences(markup, 'class="flex-1"')).toBe(8 + 6 * 8);
  });

  it("the form editor has NO tab bar, because its page is nested", () => {
    const markup = renderToStaticMarkup(<NewFormLoading />);
    // §12d.6: a form's editor is a child of Forms, not a sibling, so the real
    // page suppresses the tabs. Drawing them here would show a row of tabs
    // that then vanishes.
    expect(markup).not.toContain("h-bar");
    // Four numbered steps, four sheets (10.4.3a).
    expect(occurrences(markup, "rounded-panel border border-rule bg-paper p-6")).toBe(4);
  });

  it("responses leads with its selectors at the real control height", () => {
    const markup = renderToStaticMarkup(<ResponsesLoading />);
    // 38px — if this were the 41px the buttons used to be, the whole list
    // below it would sit three pixels low and then jump (§12h.2c).
    // Three controls, each carrying `min-h-control` AND `h-control`; counted on
    // the `min-` form because `h-control` is a substring of it.
    expect(occurrences(markup, "min-h-control")).toBe(3);
    expect(occurrences(markup, "h-control")).toBe(6);
  });

  it("the root fallback predicts nothing it cannot know", () => {
    const markup = renderToStaticMarkup(<RootLoading />);
    // No tab bar and one crumb: guessing either would move the page when the
    // real one arrives, which is the failure this exists to avoid.
    expect(markup).not.toContain("h-bar");
  });
});
