import { describe, expect, it } from "vitest";

import {
  courseTabs,
  firstStaffSectionHref,
  primaryNav,
  staffSectionTabGroups,
  staffSectionTabs,
  studentSectionTabs,
  type NavGroup,
} from "@/components/layout/nav";
import {
  SECTION_PERMISSIONS,
  type EffectivePermissions,
  type SectionAccess,
} from "@/modules/authz";

/**
 * Navigation contract tests.
 *
 * Two properties matter and neither is cosmetic:
 *
 * 1. The primary rail depends on the ACCOUNT, never the route. A route change
 *    may move the active mark; it may not add or remove a row. Every "same rows
 *    on a different path" assertion below is that rule.
 * 2. Exactly one destination is ever marked active, and it is the one the reader
 *    is actually standing on — including on child pages that are not themselves
 *    a destination.
 *
 * Hiding a link is presentation, not authorization: the permission cases here
 * assert what a reader is OFFERED. What they may reach is enforced separately,
 * by the require* helpers, and covered in tests/integration/authz.test.ts.
 */

function perms(granted: Partial<EffectivePermissions> = {}) {
  return Object.fromEntries(
    SECTION_PERMISSIONS.map((p) => [p, granted[p] ?? false]),
  ) as EffectivePermissions;
}

function access(
  overrides: {
    sectionId?: string;
    role?: NonNullable<SectionAccess["staff"]>["role"];
    hasCourseStanding?: boolean;
    permissions?: Partial<EffectivePermissions>;
    staff?: null;
  } = {},
): SectionAccess {
  const sectionId = overrides.sectionId ?? "sec-1";
  return {
    section: { id: sectionId, courseId: "course-1" } as SectionAccess["section"],
    staff:
      overrides.staff === null
        ? null
        : {
            role: overrides.role ?? "teacher",
            isCourseOwner: false,
            isInstructor: (overrides.role ?? "teacher") !== "ta",
            hasCourseStanding: overrides.hasCourseStanding ?? true,
            permissions: perms(overrides.permissions),
          },
    studentRecordId: null,
    archived: false,
  };
}

const labels = (groups: NavGroup[]) =>
  groups.map((group) => [group.label, group.items.map((i) => i.label)]);
const activeHrefs = (groups: NavGroup[]) =>
  groups.flatMap((g) => g.items.filter((i) => i.active).map((i) => i.href));

const COURSES = [{ id: "c1", label: "CS 33" }];
const STUDENT = [{ id: "sec-1", label: "CS 33 · Section A" }];
const ASSISTED = [{ id: "sec-9", label: "CS 12 · Section B" }];

describe("primaryNav — stability", () => {
  const teacher = {
    isTeacher: true,
    isPlatformAdmin: false,
    courses: COURSES,
    studentSections: [],
    assistedSections: [],
  };

  it("offers the same rows on every route a teacher can open", () => {
    const routes = [
      "/",
      "/teach/courses",
      "/teach/courses/c1",
      "/teach/courses/c1/responses",
      "/teach/courses/c1/sections",
      "/teach/courses/c1/staff",
      "/teach/courses/c1/forms/new",
      "/teach/sections/sec-1/roster",
      "/teach/sections/sec-1/audit",
      "/sections/sec-1/qa",
    ];
    const expected = labels(primaryNav("/", teacher));
    for (const route of routes) {
      expect(labels(primaryNav(route, teacher)), route).toEqual(expected);
    }
  });

  it("keeps Platform admin on course and section routes", () => {
    const admin = { ...teacher, isPlatformAdmin: true };
    for (const route of [
      "/",
      "/teach/courses/c1",
      "/teach/sections/sec-1/roster",
      "/sections/sec-1/qa",
    ]) {
      const hrefs = primaryNav(route, admin).flatMap((g) =>
        g.items.map((i) => i.href),
      );
      expect(hrefs, route).toContain("/admin");
    }
  });

  it("changes only with permissions, not with the route", () => {
    const base = primaryNav("/", teacher);
    const notATeacher = primaryNav("/", {
      ...teacher,
      isTeacher: false,
      courses: [],
    });
    expect(labels(base)).not.toEqual(labels(notATeacher));
    expect(
      notATeacher.flatMap((g) => g.items.map((i) => i.href)),
    ).not.toContain("/teach/courses");
  });

  it("lists the teacher's own courses under My courses", () => {
    const groups = primaryNav("/", teacher);
    expect(labels(groups)).toEqual([
      ["Workspace", ["Overview"]],
      ["My courses", ["All courses", "CS 33"]],
    ]);
    expect(groups[1]!.items[1]!.href).toBe("/teach/courses/c1");
  });

  /**
   * Course-wide standing is grantable to an account that never held the teacher
   * capability (ADR-0004). Gating the group on the flag alone left such a
   * grantee with a course they could open and no row anywhere leading to it.
   */
  it("gives a course to a grantee who is not a teacher", () => {
    const grantee = primaryNav("/", {
      isTeacher: false,
      isPlatformAdmin: false,
      courses: COURSES,
      studentSections: [],
      assistedSections: [],
    });
    expect(labels(grantee)).toEqual([
      ["Workspace", ["Overview"]],
      ["My courses", ["CS 33"]],
    ]);
    expect(grantee[1]!.items[0]!.href).toBe("/teach/courses/c1");
    // NOT the course index: that is where a course is created and it refuses an
    // account without the teacher capability. A rail row that rejects the
    // reader who clicks it is the one thing this rail must not produce.
    expect(grantee.flatMap((g) => g.items.map((i) => i.href))).not.toContain(
      "/teach/courses",
    );
  });

  it("marks the grantee's course row on its own routes", () => {
    const grantee = {
      isTeacher: false,
      isPlatformAdmin: false,
      courses: COURSES,
      studentSections: [],
      assistedSections: [],
    };
    for (const route of ["/teach/courses/c1", "/teach/courses/c1/staff"]) {
      expect(activeHrefs(primaryNav(route, grantee)), route).toEqual([
        "/teach/courses/c1",
      ]);
    }
    // And the rail still depends on the account, not the route.
    expect(labels(primaryNav("/teach/courses/c1/staff", grantee))).toEqual(
      labels(primaryNav("/", grantee)),
    );
  });

  it("still omits My courses for an account with neither the flag nor a course", () => {
    const nobody = primaryNav("/", {
      isTeacher: false,
      isPlatformAdmin: false,
      courses: [],
      studentSections: [],
      assistedSections: [],
    });
    expect(nobody.map((g) => g.label)).toEqual(["Workspace"]);
  });

  it("gives a student their classes and a delegated assistant their sections", () => {
    const student = primaryNav("/", {
      isTeacher: false,
      isPlatformAdmin: false,
      courses: [],
      studentSections: STUDENT,
      assistedSections: [],
    });
    expect(labels(student)).toEqual([
      ["Workspace", ["Overview"]],
      ["My classes", ["CS 33 · Section A"]],
    ]);

    const assistant = primaryNav("/", {
      isTeacher: false,
      isPlatformAdmin: false,
      courses: [],
      studentSections: [],
      assistedSections: ASSISTED,
    });
    expect(labels(assistant)).toEqual([
      ["Workspace", ["Overview"]],
      ["Sections you assist", ["CS 12 · Section B"]],
    ]);
    // The section root, not one of its views: which view a reader lands on is
    // their permissions' business, resolved server-side.
    expect(assistant[1]!.items[0]!.href).toBe("/teach/sections/sec-9");
  });

  it("omits a group only when the account has no rows for it", () => {
    const both = primaryNav("/", {
      isTeacher: true,
      isPlatformAdmin: true,
      courses: COURSES,
      studentSections: STUDENT,
      assistedSections: ASSISTED,
    });
    expect(both.map((g) => g.label)).toEqual([
      "Workspace",
      "My courses",
      "My classes",
      "Sections you assist",
    ]);
    // The fixed group is always open; the ones that grow with the account fold.
    expect(both.map((g) => !!g.collapsible)).toEqual([false, true, true, true]);
  });
});

describe("primaryNav — active state", () => {
  const input = {
    isTeacher: true,
    isPlatformAdmin: true,
    courses: COURSES,
    studentSections: STUDENT,
    assistedSections: ASSISTED,
  };

  it("marks exactly one row, everywhere", () => {
    for (const route of [
      "/",
      "/teach/courses",
      "/teach/courses/c1",
      "/teach/courses/c1/responses",
      "/admin",
      "/sections/sec-1",
      "/sections/sec-1/history",
      "/teach/sections/sec-9/roster",
    ]) {
      expect(activeHrefs(primaryNav(route, input)).length, route).toBe(1);
    }
  });

  it("does not light up Overview on every path", () => {
    expect(activeHrefs(primaryNav("/", input))).toEqual(["/"]);
    expect(activeHrefs(primaryNav("/admin", input))).toEqual(["/admin"]);
  });

  it("marks the containing destination on a child route", () => {
    expect(activeHrefs(primaryNav("/teach/courses/c1/forms/new", input))).toEqual(
      ["/teach/courses/c1"],
    );
    expect(activeHrefs(primaryNav("/sections/sec-1/history", input))).toEqual([
      "/sections/sec-1",
    ]);
  });

  it("marks nothing rather than guessing on an unrelated route", () => {
    expect(activeHrefs(primaryNav("/signin", input))).toEqual([]);
  });

  it("falls back to the branch a section was reached through", () => {
    // A teacher's own sections sit outside every rail href, so without this the
    // rail goes quiet exactly where the reader is deepest in.
    const teacherOnly = {
      isTeacher: true,
      isPlatformAdmin: false,
      courses: COURSES,
      studentSections: [],
      assistedSections: [],
    };
    expect(
      activeHrefs(
        primaryNav("/teach/sections/sec-1/roster", teacherOnly, {
          fallbackHref: "/teach/courses/c1",
        }),
      ),
    ).toEqual(["/teach/courses/c1"]);
  });

  it("does not let the fallback steal a row that genuinely matched", () => {
    const assistant = {
      isTeacher: false,
      isPlatformAdmin: false,
      courses: [],
      studentSections: STUDENT,
      assistedSections: ASSISTED,
    };
    expect(
      activeHrefs(
        primaryNav("/teach/sections/sec-9/roster", assistant, {
          fallbackHref: "/teach/courses",
        }),
      ),
    ).toEqual(["/teach/sections/sec-9"]);
    expect(
      activeHrefs(
        primaryNav("/sections/sec-1/qa", assistant, {
          fallbackHref: "/teach/courses",
        }),
      ),
    ).toEqual(["/sections/sec-1"]);
  });

  it("never marks a row the fallback names but the account lacks", () => {
    const student = {
      isTeacher: false,
      isPlatformAdmin: false,
      courses: [],
      studentSections: [],
      assistedSections: [],
    };
    expect(
      activeHrefs(
        primaryNav("/teach/sections/sec-1/roster", student, {
          fallbackHref: "/teach/courses",
        }),
      ),
    ).toEqual([]);
  });
});

describe("courseTabs", () => {
  it("is the same four peer views regardless of path", () => {
    for (const route of [
      "/teach/courses/c1",
      "/teach/courses/c1/responses",
      "/teach/courses/c1/sections",
      "/teach/courses/c1/staff",
    ]) {
      expect(courseTabs("c1", route).map((t) => t.label)).toEqual([
        "Forms",
        "Responses",
        "Class lists",
        "Teaching team",
      ]);
    }
  });

  it("keeps who-can-reach and who-can-act as separate destinations", () => {
    const hrefs = courseTabs("c1", "/x").map((t) => t.href);
    expect(hrefs).toContain("/teach/courses/c1/sections");
    expect(hrefs).toContain("/teach/courses/c1/staff");
  });

  it("prefers the longest match, so Forms does not swallow its siblings", () => {
    const active = (path: string) =>
      courseTabs("c1", path).find((t) => t.active)?.href;
    expect(active("/teach/courses/c1")).toBe("/teach/courses/c1");
    expect(active("/teach/courses/c1/sections")).toBe(
      "/teach/courses/c1/sections",
    );
    expect(active("/teach/courses/c1/responses")).toBe(
      "/teach/courses/c1/responses",
    );
    expect(active("/teach/courses/c1/staff")).toBe("/teach/courses/c1/staff");
  });

  it("marks exactly one tab on the teaching team page", () => {
    const marked = courseTabs("c1", "/teach/courses/c1/staff").filter(
      (t) => t.active,
    );
    expect(marked.map((t) => t.href)).toEqual(["/teach/courses/c1/staff"]);
  });


  it("marks Forms for a form, a new form and an occurrence", () => {
    for (const path of [
      "/teach/courses/c1/forms/new",
      "/teach/courses/c1/forms/f1",
      "/teach/courses/c1/forms/f1/instances/i1",
    ]) {
      const tabs = courseTabs("c1", path, {
        activeHref: "/teach/courses/c1",
      });
      expect(tabs.filter((t) => t.active).map((t) => t.href), path).toEqual([
        "/teach/courses/c1",
      ]);
    }
  });

  it("shows a review count only when there is one", () => {
    expect(courseTabs("c1", "/x", { needsReview: 3 })[1]!.count).toBe(3);
    expect(courseTabs("c1", "/x", { needsReview: 0 })[1]!.count).toBeUndefined();
    expect(courseTabs("c1", "/x")[1]!.count).toBeUndefined();
  });
});

describe("staffSectionTabs — permission visibility", () => {
  it("offers only the archive to a section member with no flags", () => {
    const tabs = staffSectionTabs(
      access({ role: "ta", hasCourseStanding: false }),
      "/x",
    );
    expect(tabs.map((t) => t.label)).toEqual(["Class Q&A"]);
  });

  it("adds a view per granted flag, and keeps the order fixed", () => {
    const tabs = staffSectionTabs(
      access({
        role: "ta",
        hasCourseStanding: false,
        permissions: {
          reviewResponses: true,
          viewStudentIdentities: true,
          exportParticipation: true,
          draftPublicAnswers: true,
          manageBacklogImports: true,
          manageTemplates: true,
        },
      }),
      "/x",
    );
    expect(tabs.map((t) => t.label)).toEqual([
      "Review inbox",
      "Class list",
      "Import",
      "Publication queue",
      "Question backlog",
      "Class Q&A",
      "Participation",
      "Section setup",
      // Audit is not delegable to a TA in the MVP permission catalog.
    ]);
  });

  it("offers Import only alongside Class list, on the same flag", () => {
    expect(
      staffSectionTabs(
        access({ permissions: { viewStudentIdentities: true } }),
        "/x",
      ).map((t) => t.label),
    ).toContain("Import");
    expect(
      staffSectionTabs(
        access({ permissions: { viewStudentIdentities: false } }),
        "/x",
      ).map((t) => t.label),
    ).not.toContain("Import");
  });

  it("opens the publication queue to any one publication capability", () => {
    for (const flag of [
      "draftPublicAnswers",
      "rewordPublicQuestions",
      "publishPublicAnswers",
      "schedulePublication",
    ] as const) {
      const tabs = staffSectionTabs(
        access({ role: "ta", permissions: { [flag]: true } }),
        "/x",
      );
      expect(tabs.map((t) => t.label), flag).toContain("Publication queue");
    }
  });

  it("withholds Audit from a TA and offers it to a teacher", () => {
    expect(
      staffSectionTabs(access({ role: "ta" }), "/x").map((t) => t.label),
    ).not.toContain("Audit history");
    expect(
      staffSectionTabs(access({ role: "teacher" }), "/x").map((t) => t.label),
    ).toContain("Audit history");
  });

  it("puts the review queue in the section only for a reader with no course", () => {
    const withCourse = staffSectionTabs(
      access({ hasCourseStanding: true, permissions: { reviewResponses: true } }),
      "/x",
    );
    // Course staff reach the one course-wide queue from the course strip;
    // repeating it here would offer the same destination in two contexts.
    expect(withCourse.map((t) => t.label)).not.toContain("Review responses");
    expect(withCourse.map((t) => t.label)).toContain("Class Q&A");

    const withoutCourse = staffSectionTabs(
      access({
        hasCourseStanding: false,
        permissions: { reviewResponses: true },
      }),
      "/x",
    );
    expect(withoutCourse.map((t) => t.label)).toContain("Review inbox");
  });

  it("offers nothing at all without staff standing", () => {
    expect(staffSectionTabs(access({ staff: null }), "/x")).toEqual([]);
  });

  it("does not change with the route", () => {
    const a = access({ permissions: { viewStudentIdentities: true } });
    const on = (path: string) => staffSectionTabs(a, path).map((t) => t.label);
    expect(on("/teach/sections/sec-1/roster")).toEqual(
      on("/teach/sections/sec-1/audit"),
    );
  });
});

describe("staffSectionTabs — active state", () => {
  const a = access({
    permissions: { viewStudentIdentities: true, exportParticipation: true },
  });
  const active = (path: string, activeHref?: string) =>
    staffSectionTabs(a, path, { activeHref })
      .filter((t) => t.active)
      .map((t) => t.href);

  it("marks the view being read", () => {
    expect(active("/teach/sections/sec-1/roster")).toEqual([
      "/teach/sections/sec-1/roster",
    ]);
    expect(active("/teach/sections/sec-1/audit")).toEqual([
      "/teach/sections/sec-1/audit",
    ]);
    expect(active("/sections/sec-1/qa")).toEqual(["/sections/sec-1/qa"]);
  });

  it("marks Import while its own page is open, not Class list", () => {
    // Import is a peer of Class list (same group, same permission), not an
    // operation floating outside the strip, so it carries its own active state.
    expect(active("/teach/sections/sec-1/import")).toEqual([
      "/teach/sections/sec-1/import",
    ]);
  });

  it("does not let the participation export unmark participation", () => {
    expect(active("/teach/sections/sec-1/participation/export")).toEqual([
      "/teach/sections/sec-1/participation",
    ]);
  });
});

describe("staffSectionTabGroups", () => {
  it("groups a full permission set into named, ordered categories", () => {
    const groups = staffSectionTabGroups(
      access({
        role: "teacher",
        hasCourseStanding: false,
        permissions: {
          reviewResponses: true,
          viewStudentIdentities: true,
          exportParticipation: true,
          draftPublicAnswers: true,
          manageBacklogImports: true,
          manageTemplates: true,
        },
      }),
      "/x",
    );
    expect(labels(groups)).toEqual([
      ["Review", ["Review inbox"]],
      ["Class list", ["Class list", "Import"]],
      ["Weekly review", ["Publication queue", "Question backlog", "Class Q&A"]],
      ["Reports", ["Participation", "Audit history"]],
      ["Setup", ["Section setup"]],
    ]);
  });

  it("omits a group's heading entirely when every item in it is hidden", () => {
    // A TA: no roster access (drops Class list), no participation export and
    // no audit (drops Reports), no template/cycle management (drops Setup).
    // An empty "Reports" strip label naming nothing would be worse than no
    // label — the group must not render at all.
    const groups = staffSectionTabGroups(
      access({ role: "ta", hasCourseStanding: true }),
      "/x",
    );
    expect(labels(groups)).toEqual([
      ["Weekly review", ["Class Q&A"]],
    ]);
  });

  it("flattens to the same list staffSectionTabs returns", () => {
    const a = access({
      permissions: { viewStudentIdentities: true, exportParticipation: true },
    });
    const flat = staffSectionTabGroups(a, "/x").flatMap((g) => g.items);
    expect(flat).toEqual(staffSectionTabs(a, "/x"));
  });

  it("marks active across every group at once, not per group", () => {
    const a = access({
      permissions: { viewStudentIdentities: true, exportParticipation: true },
    });
    const groups = staffSectionTabGroups(a, "/teach/sections/sec-1/participation");
    expect(activeHrefs(groups)).toEqual([
      "/teach/sections/sec-1/participation",
    ]);
  });
});

describe("studentSectionTabs", () => {
  it("is the same three peer views on each of them", () => {
    for (const path of [
      "/sections/sec-1",
      "/sections/sec-1/history",
      "/sections/sec-1/qa",
    ]) {
      expect(studentSectionTabs("sec-1", path).map((t) => t.label)).toEqual([
        "This week's form",
        "My submissions",
        "Class Q&A",
      ]);
    }
  });

  it("marks exactly one, and the right one", () => {
    const active = (path: string) =>
      studentSectionTabs("sec-1", path)
        .filter((t) => t.active)
        .map((t) => t.href);
    expect(active("/sections/sec-1")).toEqual(["/sections/sec-1"]);
    expect(active("/sections/sec-1/history")).toEqual([
      "/sections/sec-1/history",
    ]);
    expect(active("/sections/sec-1/qa")).toEqual(["/sections/sec-1/qa"]);
  });

  it("marks Forms while a form instance is open", () => {
    expect(
      studentSectionTabs("sec-1", "/forms/i1", {
        activeHref: "/sections/sec-1",
      })
        .filter((t) => t.active)
        .map((t) => t.href),
    ).toEqual(["/sections/sec-1"]);
  });
});

describe("firstStaffSectionHref", () => {
  it("resolves the section root to the reader's first permitted view", () => {
    expect(
      firstStaffSectionHref(
        access({ role: "ta", permissions: { viewStudentIdentities: true } }),
      ),
    ).toBe("/teach/sections/sec-1/roster");
  });

  it("falls through to the archive when nothing else is granted", () => {
    expect(firstStaffSectionHref(access({ role: "ta" }))).toBe(
      "/sections/sec-1/qa",
    );
  });

  it("is null without staff standing, so the caller must refuse", () => {
    expect(firstStaffSectionHref(access({ staff: null }))).toBeNull();
  });
});
