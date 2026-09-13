import { describe, expect, it } from "vitest";

import {
  carryQuery,
  courseBacklogHref,
} from "@/lib/legacy-section-redirect";

describe("legacy section editorial redirects", () => {
  it("uses the course Question Backlog as the publications destination", () => {
    expect(
      courseBacklogHref("course-1", {
        selected: "answer-1",
        q: "tree rotations",
      }),
    ).toBe(
      "/teach/courses/course-1/backlog?selected=answer-1&q=tree+rotations",
    );
  });

  it("carries safe backlog state without carrying section scope", () => {
    expect(
      carryQuery({
        selected: "answer:abc",
        search: "tree rotations",
        status: "drafting",
        category: "content",
        sort: "oldest",
        section: "section-a",
      }),
    ).toBe(
      "?selected=answer%3Aabc&q=tree+rotations&status=drafting&category=content&sort=oldest",
    );
  });

  it("normalizes aliases and keeps the first value of repeated parameters", () => {
    expect(
      carryQuery({
        q: ["canonical", "ignored"],
        search: "legacy",
        state: "archived",
        filter: "mine",
      }),
    ).toBe("?q=canonical&status=archived&filter=mine");
  });
});
