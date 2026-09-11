import { describe, expect, it } from "vitest";

import {
  FORMS_GROUP,
  courseSetupTabs,
  courseTabGroups,
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
      "/teach/sections/sec-1/participation",
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
  it("is the course's two work objects, regardless of path", () => {
    for (const route of [
      "/teach/courses/c1",
      "/teach/courses/c1/responses",
      "/teach/courses/c1/sections",
      "/teach/courses/c1/staff",
    ]) {
      expect(courseTabs("c1", route).map((t) => t.label)).toEqual([
        "Forms",
        "Responses",
      ]);
    }
  });

  /**
   * Configuration is NOT in the work strip. Class lists and Teaching team are
   * set once a term, and while they sat here the column showed two different
   * "class list" destinations at once — the course's index of sections, and
   * one section's roster — with nothing in either label to separate them.
   */
  it("leaves configuration to courseSetupTabs", () => {
    const hrefs = courseTabs("c1", "/x").map((t) => t.href);
    expect(hrefs).not.toContain("/teach/courses/c1/sections");
    expect(hrefs).not.toContain("/teach/courses/c1/staff");
  });

  it("keeps who-can-reach and who-can-act as separate destinations", () => {
    const hrefs = courseSetupTabs("c1", "/x").map((t) => t.href);
    expect(hrefs).toEqual([
      "/teach/courses/c1/sections",
      "/teach/courses/c1/staff",
    ]);
  });

  it("prefers the longest match, so Forms does not swallow its siblings", () => {
    const active = (path: string) =>
      courseTabs("c1", path).find((t) => t.active)?.href;
    expect(active("/teach/courses/c1")).toBe("/teach/courses/c1");
    expect(active("/teach/courses/c1/responses")).toBe(
      "/teach/courses/c1/responses",
    );
    const setupActive = (path: string) =>
      courseSetupTabs("c1", path).find((t) => t.active)?.href;
    expect(setupActive("/teach/courses/c1/sections")).toBe(
      "/teach/courses/c1/sections",
    );
    expect(setupActive("/teach/courses/c1/staff")).toBe(
      "/teach/courses/c1/staff",
    );
  });

  it("marks exactly one tab on the teaching team page", () => {
    const marked = courseSetupTabs("c1", "/teach/courses/c1/staff").filter(
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
      "Forms",
      // Weekly review leads: it is what a teacher opens a section to do.
      "Publication queue",
      "Question backlog",
      "Class Q&A",
      "Participation",
      // Setup last, and the class list now sits inside it — configuration the
      // reader touches once a semester, not a peer of the week's work. There
      // is no "Section setup" beside it: that page was a duplicate teaching
      // team, and the course's own table replaced it.
      "Class list",
    ]);
  });

  /**
   * Importing is an OPERATION on the class list, not a peer view of it, and
   * this column lists peer views. It moved onto the class-list page as a modal
   * (GitHub issue #12), so the column offers Class list and nothing beside it.
   */
  it("offers Class list on its flag, and no Import row beside it", () => {
    const withFlag = staffSectionTabs(
      // No course standing: the section roster is this reader's only class
      // list. A reader who holds the course clicks through the course index
      // instead, and has no section row here at all.
      access({
        hasCourseStanding: false,
        permissions: { viewStudentIdentities: true },
      }),
      "/x",
    ).map((t) => t.label);
    expect(withFlag).toContain("Class list");
    expect(withFlag).not.toContain("Import");
    expect(
      staffSectionTabs(
        access({ permissions: { viewStudentIdentities: false } }),
        "/x",
      ).map((t) => t.label),
    ).not.toContain("Class list");
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

  /**
   * The section-scoped audit browser moved to the admin area (owner,
   * 2026-09-11), so the row is gone for EVERY role — it is no longer a
   * question of delegation. Asserted rather than deleted: the old test said a
   * teacher gets this row, and something has to say that they no longer do.
   */
  it("offers Audit history to nobody, whatever their role", () => {
    for (const role of ["ta", "teacher"] as const) {
      expect(
        staffSectionTabs(access({ role }), "/x").map((t) => t.label),
        role,
      ).not.toContain("Audit history");
    }
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
      on("/teach/sections/sec-1/participation"),
    );
  });
});

describe("staffSectionTabs — active state", () => {
  const a = access({
    hasCourseStanding: false,
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
    expect(active("/teach/sections/sec-1/participation")).toEqual([
      "/teach/sections/sec-1/participation",
    ]);
    expect(active("/sections/sec-1/qa")).toEqual(["/sections/sec-1/qa"]);
  });

  /**
   * `/import` now forwards to the class list, so nothing in this column claims
   * it. Marking Class list would be a lie about where the reader is standing —
   * and the redirect means they are never standing there for long.
   */
  it("claims no destination for the forwarding import URL", () => {
    expect(active("/teach/sections/sec-1/import")).toEqual([]);
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
      ["Forms", ["Forms"]],
      ["Weekly review", ["Publication queue", "Question backlog", "Class Q&A"]],
      ["Reports", ["Participation"]],
      // The class list is configuration, so it sits in Setup — not in a
      // heading of its own between the week's work and the reports.
      ["Setup", ["Class list"]],
    ]);
  });

  it("omits a group's heading entirely when every item in it is hidden", () => {
    // A TA: no roster access (drops Class list), no participation export
    // (drops Reports, now that audit has left it), no template/cycle
    // management (drops Setup).
    // An empty "Reports" strip label naming nothing would be worse than no
    // label — the group must not render at all.
    const groups = staffSectionTabGroups(
      access({ role: "ta", hasCourseStanding: false }),
      "/x",
    );
    expect(labels(groups)).toEqual([
      ["Weekly review", ["Class Q&A"]],
    ]);
  });

  it("flattens to the same list staffSectionTabs returns", () => {
    // For a reader with no course standing the two forms are the same set:
    // there is no course strip to leave behind.
    const a = access({
      hasCourseStanding: false,
      permissions: { viewStudentIdentities: true, exportParticipation: true },
    });
    const flat = staffSectionTabGroups(a, "/x").flatMap((g) => g.items);
    expect(flat).toEqual(staffSectionTabs(a, "/x"));
  });

  /**
   * The course strip, kept while the reader is inside one of that course's
   * sections (issue #11). Entering a section used to replace the contextual
   * column outright, so Forms and Responses vanished and the course's work
   * objects were reachable only back through the left rail.
   */
  it("leads with the course's own destinations for a reader who holds the course", () => {
    const groups = staffSectionTabGroups(
      access({
        hasCourseStanding: true,
        permissions: { viewStudentIdentities: true },
      }),
      "/teach/sections/sec-1/roster",
    );
    expect(groups[0]!.label).toBe(FORMS_GROUP);
    // The work objects only — the course's configuration lands in Setup.
    expect(groups[0]!.items.map((i) => i.href)).toEqual([
      "/teach/courses/course-1",
      "/teach/courses/course-1/responses",
    ]);
    // And the section's own groups still follow it.
    /* No "Reports": this reader holds `viewStudentIdentities` and nothing
       else, and Reports is now exactly `exportParticipation` — audit history,
       which used to keep the group alive for any non-TA, has moved to the
       admin area. */
    expect(groups.slice(1).map((g) => g.label)).toEqual([
      "Weekly review",
      "Setup",
    ]);
    /**
     * A reader who holds the course gets the course's INDEX of class lists,
     * not a single section roster row: the course has many sections and none
     * of them is "the" class list.
     */
    const setup = groups.find((g) => g.label === "Setup")!;
    expect(setup.items.map((i) => i.href)).toEqual([
      "/teach/courses/course-1/sections",
      "/teach/courses/course-1/staff",
    ]);
  });

  it("withholds the course strip from a reader with no course standing", () => {
    // Every destination in it would reject them: an assistant delegated one
    // section has no course workspace at all.
    const groups = staffSectionTabGroups(
      access({
        hasCourseStanding: false,
        permissions: { viewStudentIdentities: true },
      }),
      "/teach/sections/sec-1/roster",
    );
    expect(groups.map((g) => g.label)).not.toContain("Course");
    expect(
      groups.flatMap((g) => g.items.map((i) => i.href)),
    ).not.toContain("/teach/courses/course-1");
  });

  it("still marks exactly one destination with the strip present", () => {
    const a = access({
      hasCourseStanding: true,
      permissions: { viewStudentIdentities: true },
    });
    for (const path of [
      "/teach/sections/sec-1/roster",
      "/teach/courses/course-1/responses",
      "/sections/sec-1/qa",
    ]) {
      expect(activeHrefs(staffSectionTabGroups(a, path)).length, path).toBe(1);
    }
  });

  /**
   * The strip must appear once. `courseTabGroups` already opens with the
   * course's destinations and folds a single section's groups in beneath them,
   * so the section groups must not re-add it.
   */
  it("does not print the course strip twice in a single-section course", () => {
    const groups = courseTabGroups(
      "course-1",
      "/teach/courses/course-1",
      {},
      access({
        hasCourseStanding: true,
        permissions: { viewStudentIdentities: true },
      }),
    );
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(
      hrefs.filter((h) => h === "/teach/courses/course-1/responses"),
    ).toHaveLength(1);
    expect(groups.map((g) => g.label)).toEqual([
      FORMS_GROUP,
      "Weekly review",
      "Setup",
    ]);
    // And ONE Setup heading, with course scope leading section scope inside
    // it — not two Setup groups stacked on each other.
    expect(groups.filter((g) => g.label === "Setup")).toHaveLength(1);
    expect(
      groups.find((g) => g.label === "Setup")!.items.map((i) => i.href),
    ).toEqual([
      "/teach/courses/course-1/sections",
      "/teach/courses/course-1/staff",
    ]);
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
        access({
          role: "ta",
          hasCourseStanding: false,
          permissions: { viewStudentIdentities: true },
        }),
      ),
    ).toBe("/teach/sections/sec-1/roster");
  });

  it("falls through to the archive when nothing else is granted", () => {
    expect(firstStaffSectionHref(access({ role: "ta" }))).toBe(
      "/sections/sec-1/qa",
    );
  });

  /**
   * The Q&A archive is offered to every section member, so it is the only row
   * that is always present. Reordering the groups (issue #11) put it first for
   * several readers; landing a class-list-only assistant on a read-only archive
   * instead of their class list is not what that reorder was for.
   */
  it("never prefers the always-present archive over a real destination", () => {
    expect(
      firstStaffSectionHref(
        access({
          role: "ta",
          hasCourseStanding: false,
          permissions: { viewStudentIdentities: true },
        }),
      ),
    ).toBe("/teach/sections/sec-1/roster");
    expect(
      firstStaffSectionHref(
        access({ role: "ta", permissions: { exportParticipation: true } }),
      ),
    ).toBe("/teach/sections/sec-1/participation");
    expect(
      firstStaffSectionHref(
        access({ role: "ta", permissions: { draftPublicAnswers: true } }),
      ),
    ).toBe("/teach/sections/sec-1/publications");
  });

  /**
   * And it resolves a SECTION, never the course it belongs to — the flat list
   * it reads excludes the course strip for exactly this reason.
   */
  it("resolves a section, not the course a reader also holds", () => {
    const href = firstStaffSectionHref(
      access({
        hasCourseStanding: true,
        permissions: { viewStudentIdentities: true },
      }),
    );
    /**
     * Asserted as a property rather than as one page. The reader holds the
     * course, so their class list is the course's index and is deliberately
     * absent from the section's own list — but whatever this resolves to must
     * still be a destination INSIDE the section, never a course href, because
     * the caller uses it to answer "/teach/sections/[id]".
     */
    expect(href).not.toBeNull();
    expect(href).not.toContain("/teach/courses/");
    expect(href).toContain("sec-1");
  });

  it("is null without staff standing, so the caller must refuse", () => {
    expect(firstStaffSectionHref(access({ staff: null }))).toBeNull();
  });
});
