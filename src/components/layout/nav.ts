import type { SectionAccess } from "@/modules/authz";
import {
  IconAdmin,
  IconArchive,
  IconAudit,
  IconBacklog,
  IconCourse,
  IconForm,
  IconHistory,
  IconInbox,
  IconMatrix,
  IconOverview,
  IconPublish,
  IconRoster,
  IconSetup,
  IconWeek,
} from "@/components/ui/icons";

/**
 * Navigation has two layers, and the split is the whole point.
 *
 * PRIMARY (`primaryNav`) is the left rail. It answers "what can this ACCOUNT
 * reach?" and is built from the account alone — teacher flag, admin flag,
 * enrolments, delegated section standing. It is therefore identical on every
 * page a given person opens: a route change can move the active mark, never add
 * or remove a row. Only a permission change does that.
 *
 * CONTEXTUAL (`courseTabs`, `staffSectionTabs`, `studentSectionTabs`) is a
 * second, narrower column between the rail and the page. It answers "what are
 * the peer views of the resource I am looking at?" — the course, or one class
 * section. These are expected to change with the resource, because that is what
 * they describe. The functions are still named `*Tabs`: they return the same
 * peer set whether it is drawn as a strip or a column.
 *
 * One-off operations (create, import, export, publish, edit) belong in neither.
 * They are page-header actions on the page they act on.
 *
 * Both layers are derived from the SAME effective permissions the server
 * enforces, so a user is never shown a destination that will reject them. This
 * is presentation only. Hiding a link is not authorization — every page and
 * action re-checks with require* before touching data.
 */

/** The drawn icons the rail may use. DESIGN.md forbids glyph icons. */
export const NAV_ICONS = {
  overview: IconOverview,
  form: IconForm,
  archive: IconArchive,
  history: IconHistory,
  inbox: IconInbox,
  publish: IconPublish,
  roster: IconRoster,
  matrix: IconMatrix,
  backlog: IconBacklog,
  setup: IconSetup,
  audit: IconAudit,
  course: IconCourse,
  week: IconWeek,
  admin: IconAdmin,
} as const;

export type NavIcon = keyof typeof NAV_ICONS;

/**
 * The heading over the course's work objects — Forms and Responses.
 *
 * Named once and shared by both places that draw that strip (the course
 * workspace, and a section belonging to a course the reader holds) so the
 * category a reader learns on one page is the same category on the other.
 *
 * It reads as a heading over a set, not as a duplicate of the row beneath it:
 * "Forms" the category contains the form definitions AND the queue of
 * responses over them, which is why the strip is labelled rather than left
 * bare next to WEEKLY REVIEW, REPORTS and SETUP.
 */
export const FORMS_GROUP = "Forms";

export interface NavItem {
  href: string;
  label: string;
  /** rail rows carry one; tabs are text, so it is optional */
  icon?: NavIcon;
  active?: boolean;
  /** real count only — never a decorative number */
  count?: number;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /**
   * Renders the group as a disclosure the reader can fold away. Used for the
   * groups that list resources, which grow with the account; the fixed
   * workspace group is always open because there is nothing to fold.
   *
   * It opens on every load rather than remembering a choice, so the rail has
   * one resting shape. A collapse that persisted per route would put the rail
   * back to changing height as you move, which is what this model removes.
   */
  collapsible?: boolean;
}

/**
 * How a set of destinations decides which one the reader is standing on.
 *
 * Longest matching href wins, so `/teach/courses/1/sections` does not also
 * light up `/teach/courses/1`. `activeHref` overrides the match for pages that
 * are a CHILD of a destination rather than the destination itself — the roster
 * importer belongs to the class list, a form instance belongs to Forms — so
 * those pages still show the reader where they are instead of nothing at all.
 */
function mark(
  items: NavItem[],
  currentPath: string,
  activeHref?: string,
): NavItem[] {
  if (activeHref) {
    return items.map((item) => ({ ...item, active: item.href === activeHref }));
  }
  let bestLength = -1;
  for (const item of items) {
    if (currentPath === item.href || currentPath.startsWith(`${item.href}/`)) {
      bestLength = Math.max(bestLength, item.href.length);
    }
  }
  return items.map((item) => ({
    ...item,
    active:
      bestLength === item.href.length &&
      (currentPath === item.href || currentPath.startsWith(`${item.href}/`)),
  }));
}

/**
 * Marks across ALL groups at once so the longest-match rule is global.
 * Grouping is a visual device; it must not create two active rows.
 *
 * `fallbackHref` is used only when nothing matched: a teacher reading one of
 * their own sections is standing under "My courses", but the section routes
 * live outside that href so no prefix can say so. It is a fallback rather than
 * an override on purpose — a delegated assistant on the same page DOES match
 * their own section row, and must keep it.
 */
function markGroups(
  groups: NavGroup[],
  currentPath: string,
  fallbackHref?: string,
): NavGroup[] {
  const flat = groups.flatMap((group) => group.items);
  let marked = new Map(
    mark(flat, currentPath).map((item) => [item.href, item.active] as const),
  );
  if (![...marked.values()].some(Boolean) && fallbackHref) {
    marked = new Map(
      flat.map((item) => [item.href, item.href === fallbackHref] as const),
    );
  }
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      active: marked.get(item.href) ?? false,
    })),
  }));
}

export interface NavSection {
  id: string;
  label: string;
}

export interface PrimaryNavInput {
  isTeacher: boolean;
  isPlatformAdmin: boolean;
  /** courses this account owns or staffs */
  courses: NavSection[];
  /** sections this account is enrolled in as a student */
  studentSections: NavSection[];
  /**
   * Sections staffed WITHOUT course-level standing — a delegated assistant or a
   * section teacher on someone else's course. They have no course workspace to
   * enter through, so the section is their top-level destination. Course staff
   * are deliberately absent: "My courses" already reaches every section they
   * own, and listing all of them would make the rail grow with the course list.
   */
  assistedSections: NavSection[];
}

/**
 * THE sidebar. Every authenticated page renders this and nothing else.
 *
 * Group order is fixed, and a group is omitted only when the account has no
 * rows for it at all — which is a property of the account, not of the route.
 */
export function primaryNav(
  currentPath: string,
  input: PrimaryNavInput,
  opts: {
    /** which row to mark when the path is under no row's href */
    fallbackHref?: string;
  } = {},
): NavGroup[] {
  const workspace: NavItem[] = [
    { href: "/", label: "Overview", icon: "overview" },
  ];
  if (input.isPlatformAdmin) {
    workspace.push({ href: "/admin", label: "Platform admin", icon: "admin" });
  }

  const groups: NavGroup[] = [{ label: "Workspace", items: workspace }];

  /**
   * The teacher's courses, by name, in the rail.
   *
   * "All courses" leads the list because the index is where a course is
   * created, and because a reader who does not recognise any code below still
   * has somewhere to go. The named courses follow, so the common case — open
   * the course I am teaching this week — is one click from anywhere.
   *
   * Shown for the teacher capability OR for anyone holding a course, because
   * those are two different ways to have one. Course-wide standing is grantable
   * to an account that was never given the teacher role (ADR-0004), and gating
   * the group on the flag alone left such a grantee with a course they could
   * open and no row anywhere that led to it.
   *
   * "All courses" stays capability-gated inside the group: it is the course
   * INDEX, where a course is created, and it refuses an account without the
   * teacher role. Offering it to a grantee would put a row in the rail that
   * rejects the reader who clicks it, which is the one thing this rail must not
   * do. Their named courses are the destinations they actually hold.
   */
  if (input.isTeacher || input.courses.length > 0) {
    groups.push({
      label: "My courses",
      collapsible: true,
      items: [
        ...(input.isTeacher
          ? [
              {
                href: "/teach/courses",
                label: "All courses",
                icon: "course" as const,
              },
            ]
          : []),
        ...input.courses.map((course) => ({
          href: `/teach/courses/${course.id}`,
          label: course.label,
          icon: "course" as const,
        })),
      ],
    });
  }

  if (input.studentSections.length > 0) {
    groups.push({
      label: "My classes",
      collapsible: true,
      items: input.studentSections.map((section) => ({
        href: `/sections/${section.id}`,
        label: section.label,
        icon: "week",
      })),
    });
  }

  if (input.assistedSections.length > 0) {
    groups.push({
      label: "Sections you assist",
      collapsible: true,
      items: input.assistedSections.map((section) => ({
        href: `/teach/sections/${section.id}`,
        label: section.label,
        icon: "roster",
      })),
    });
  }

  return markGroups(groups, currentPath, opts.fallbackHref);
}

/**
 * The course's WORK objects, and only those.
 *
 * Forms is the work object; Responses is the queue over it. Nothing else
 * belongs here: who can reach a form (Class lists) and who may act on it
 * (Teaching team) are both configuration, set once a term, and they live in
 * {@link courseSetupTabs} under the Setup heading instead. Keeping them in this
 * strip is what put two different "class list" destinations side by side — the
 * course's index of sections, and one section's roster — with nothing in either
 * label to say which was which.
 */
export function courseTabs(
  courseId: string,
  currentPath: string,
  opts: { needsReview?: number; activeHref?: string } = {},
): NavItem[] {
  return mark(
    [
      { href: `/teach/courses/${courseId}`, label: "Forms" },
      {
        href: `/teach/courses/${courseId}/responses`,
        label: "Responses",
        count: opts.needsReview || undefined,
      },
    ],
    currentPath,
    opts.activeHref,
  );
}

/**
 * How the course is CONFIGURED, as opposed to worked on.
 *
 * "Class lists" is plural on purpose: it is the index of the course's sections,
 * and one section's roster is reached by clicking through it. A course can hold
 * many lecture and lab sections, so the index is the honest destination — there
 * is no single "the class list" at course scope to link to directly.
 *
 * Teaching team follows because it answers the neighbouring question: not who
 * receives the forms, but who may act on them.
 */
export function courseSetupTabs(
  courseId: string,
  currentPath: string,
  opts: { activeHref?: string } = {},
): NavItem[] {
  return mark(
    [
      { href: `/teach/courses/${courseId}/sections`, label: "Class lists" },
      { href: `/teach/courses/${courseId}/staff`, label: "Teaching team" },
    ],
    currentPath,
    opts.activeHref,
  );
}

/**
 * Peer views of ONE class section, filtered by effective permissions and
 * grouped by what they are FOR, not left as one flat strip. A teacher opening
 * this is usually thinking in one of four registers — who has access, this
 * week's work, what happened before, or how the section is configured — so
 * the groups answer that question before the reader has read a single label.
 *
 * A permission that hides every item in a group hides the group's heading
 * with it: an empty "Reports" strip label naming nothing is worse than no
 * label at all.
 */
export function staffSectionTabGroups(
  access: SectionAccess,
  currentPath: string,
  opts: {
    needsReview?: number;
    activeHref?: string;
    /**
     * Whether to lead with the course's own destinations. Default `true` for a
     * reader who has course standing; passed `false` by the two callers that
     * must not print the strip — `courseTabGroups`, which already carries it
     * (printing it twice is what a naive fold-in would do), and
     * `staffSectionTabs`, whose flattened list feeds `firstStaffSectionHref`
     * and must therefore contain section views only.
     */
    courseStrip?: boolean;
  } = {},
): NavGroup[] {
  const id = access.section.id;
  const staff = access.staff;
  if (!staff) return [];
  const perms = staff.permissions;
  const groups: NavGroup[] = [];

  /**
   * The course strip, kept while the reader is inside one of that course's
   * sections.
   *
   * Entering a section used to REPLACE the contextual column, so Forms and
   * Responses disappeared and the course's work objects were reachable only
   * back through the left rail. This is the same fold-in `courseTabGroups`
   * already performs in the other direction, and it reuses `courseTabs` for
   * the same reason: the course's destinations are listed in exactly one place.
   *
   * Gated on course standing, not on the route: a delegated assistant has no
   * course workspace, and every one of these destinations would reject them.
   * Labelled rather than left unlabelled, because the column heading here names
   * the SECTION — an unlabelled strip of course views under it would not say
   * what it belonged to.
   */
  /**
   * Whether this column may name the COURSE's destinations at all — the work
   * strip below, and the course-scoped rows in Setup further down.
   *
   * One flag for both, so the two can never disagree about whether the reader
   * is being shown course scope. A caller that suppresses the strip because it
   * prints its own (`courseTabGroups`) or because it must stay section-only
   * (`staffSectionTabs`) suppresses the Setup rows on the same grounds.
   */
  const showCourseDestinations =
    staff.hasCourseStanding && opts.courseStrip !== false;

  if (showCourseDestinations) {
    groups.push({
      label: FORMS_GROUP,
      items: courseTabs(access.section.courseId, currentPath, {
        needsReview: opts.needsReview,
      }),
    });
  }

  // The review queue is COURSE-scoped: a form shared by several sections has one
  // queue, which is the point of sharing it. Course staff therefore reach it
  // through the course tab strip and it is not repeated here. Someone with no
  // course standing has no such strip, so for them the section is the only frame
  // there is and the queue appears in it. That difference follows the reader's
  // permissions, not the page they happen to be on. Ungrouped: it is already
  // the one thing a delegated assistant opens this section to do.
  if (perms.reviewResponses && !staff.hasCourseStanding) {
    groups.push({
      label: "Review",
      items: [
        {
          href: `/teach/sections/${id}/review`,
          label: "Review inbox",
          count: opts.needsReview || undefined,
        },
      ],
    });
  }

  // A form definition is course-owned but `manage_templates` is deliberately
  // delegable at section scope. Give that permission a real doorway without
  // implying that it also grants delivery or occurrence controls.
  //
  // Gated on NOT having course standing, for the same reason as the review
  // queue above: a course teacher already reached Forms through the course
  // strip, and printing a second "Forms" row directly under it said nothing
  // the first one had not.
  if (perms.manageTemplates && !staff.hasCourseStanding) {
    groups.push({
      label: "Forms",
      items: [{ href: `/teach/sections/${id}/forms`, label: "Forms" }],
    });
  }

  // The recurring cycle: draft and publish this week's answers, then the
  // archive students actually read once they are out. Any publication
  // capability can READ the queue; each action inside is gated by its own
  // flag, so a publish-only assistant still sees their work.
  const weeklyReview: NavItem[] = [];
  if (
    perms.draftPublicAnswers ||
    perms.rewordPublicQuestions ||
    perms.publishPublicAnswers ||
    perms.schedulePublication
  ) {
    weeklyReview.push({
      href: `/teach/sections/${id}/publications`,
      label: "Publication queue",
    });
  }
  if (perms.manageBacklogImports) {
    weeklyReview.push({
      href: `/teach/sections/${id}/backlog`,
      label: "Question backlog",
    });
  }
  weeklyReview.push({ href: `/sections/${id}/qa`, label: "Class Q&A" });
  groups.push({ label: "Weekly review", items: weeklyReview });

  // Read-only history: how the section is doing, and what changed.
  const reports: NavItem[] = [];
  if (perms.exportParticipation) {
    reports.push({
      href: `/teach/sections/${id}/participation`,
      label: "Participation",
    });
  }
  // Audit browsing is not delegable to a TA in the MVP permission catalog.
  if (staff.role !== "ta") {
    reports.push({ href: `/teach/sections/${id}/audit`, label: "Audit history" });
  }
  if (reports.length > 0) groups.push({ label: "Reports", items: reports });

  /**
   * Configuration, in one group: who receives the forms, who may act on them,
   * and how this section is set up.
   *
   * Which class-list destination appears depends on what the reader can reach,
   * not on the page they are standing on. A reader with course standing gets
   * the course's INDEX ("Class lists") and clicks through to whichever of the
   * course's many sections they meant — a single "Class list" row would be
   * quietly lying to them about there being one. A delegated assistant holds
   * exactly one section and has no index to click through, so for them the
   * roster itself is the destination.
   *
   * There is no `Import` row in either case. Importing is an OPERATION on the
   * class list, not a peer view of it, and this column lists peer views —
   * "create, import, export, publish, edit belong in neither layer" (see the
   * note at the top of this file). It opens as a modal on the class list
   * itself, behind the button that was already there (GitHub issue #12), and
   * `/teach/sections/[id]/import` forwards to it so old links still land.
   */
  const setup: NavItem[] = [];
  if (showCourseDestinations) {
    setup.push(...courseSetupTabs(access.section.courseId, currentPath));
  } else if (!staff.hasCourseStanding && perms.viewStudentIdentities) {
    /**
     * Gated on course STANDING rather than on `showCourseDestinations`, and
     * the difference matters in exactly one place. `courseTabGroups` folds a
     * single section's groups in with the strip suppressed and then leads
     * Setup with the course's own rows; keying this off the suppressed strip
     * would let the section roster back in beside the course index, putting
     * two class-list destinations side by side inside one Setup group — the
     * very redundancy moving them here removed.
     *
     * So: a reader who holds the course always clicks through the index. A
     * reader who does not always gets the roster, because it is the only
     * class list they can reach.
     */
    setup.push({ href: `/teach/sections/${id}/roster`, label: "Class list" });
  }
  /**
   * No "Section setup" row. That page was a second teaching-team table over
   * the same `section_staff` rows the course's Teaching team already lists,
   * reachable only after choosing a section first — so the one view that
   * showed everybody was the one place you could not act on them. Editing and
   * revoking a section grant now happen on that table, beside the row.
   *
   * Its other half — renaming a section and changing its term — is gone with
   * it by decision, not by oversight: a section's name and term are set when
   * the section is created.
   */
  if (setup.length > 0) groups.push({ label: "Setup", items: setup });

  /**
   * A reader with course standing reaches this section's roster through the
   * course's INDEX, so while they are on it the row to light up is "Class
   * lists" — the destination they clicked — and not a section row, which no
   * longer exists for them. Without this the roster page marks nothing at all
   * and the column goes silent about where the reader is standing.
   *
   * This is the same child-marks-its-parent rule `mark` already documents for
   * the form-instance and importer pages, applied across a scope boundary
   * rather than within one. An explicit `opts.activeHref` from the caller
   * still wins.
   */
  const rosterHref = `/teach/sections/${id}/roster`;
  const onRoster =
    currentPath === rosterHref || currentPath.startsWith(`${rosterHref}/`);
  const activeHref =
    opts.activeHref ??
    (showCourseDestinations && onRoster
      ? `/teach/courses/${access.section.courseId}/sections`
      : undefined);

  // Marked across every group at once, so the longest-match rule (and an
  // activeHref override) stays global rather than resetting per group.
  const flatActive = mark(
    groups.flatMap((g) => g.items),
    currentPath,
    activeHref,
  );
  const activeByHref = new Map(flatActive.map((i) => [i.href, i.active]));
  return groups.map((g) => ({
    ...g,
    items: g.items.map((i) => ({ ...i, active: activeByHref.get(i.href) ?? false })),
  }));
}

/** Flattened form of {@link staffSectionTabGroups}, for the few callers that
 *  still want one plain list (a page whose own layout has no room for group
 *  headings). Prefer the grouped form wherever the reader can see it.
 *
 *  SECTION views only: the course strip is excluded, because a flat list of
 *  "this section's peer views" that opened with the course's own destinations
 *  would make `firstStaffSectionHref` resolve a section to the course. */
export function staffSectionTabs(
  access: SectionAccess,
  currentPath: string,
  opts: { needsReview?: number; activeHref?: string } = {},
): NavItem[] {
  return staffSectionTabGroups(access, currentPath, {
    ...opts,
    courseStrip: false,
  }).flatMap((g) => g.items);
}

/**
 * Where `/teach/sections/[id]` should send a reader who has no page of their
 * own in mind — the first peer view their permissions allow. Null when the
 * account holds section standing but no readable view, which the caller must
 * treat as no access rather than as an empty page.
 */
export function firstStaffSectionHref(access: SectionAccess): string | null {
  const tabs = staffSectionTabs(access, "");
  /**
   * Two rows are poor landing pages and are passed over when the reader holds
   * anything else.
   *
   * The Q&A archive is offered to every section member, so it is always
   * present — which makes it a bad default precisely when the reader has real
   * work here. The audit log is worse: it is granted to everyone who is not a
   * TA, so it is nearly always present too, and it opens on a wall of change
   * records rather than on anything the reader came to do.
   *
   * Both are written as "not this href" rather than as a position, so
   * reordering the groups cannot silently change where a reader lands — which
   * is exactly what happened when the class list moved into Setup, below
   * Reports, and quietly made the audit log the landing page for a course
   * teacher whose only other row it was.
   */
  const poorLanding = new Set([
    `/sections/${access.section.id}/qa`,
    `/teach/sections/${access.section.id}/audit`,
  ]);
  const preferred = tabs.find((tab) => !poorLanding.has(tab.href));
  return preferred?.href ?? tabs[0]?.href ?? null;
}

/**
 * Peer views of ONE course, folding in its one section's own groups when
 * there is exactly one — the common case, and the one where clicking
 * "Class lists" to find out what is inside gains nothing, because there is
 * only one answer.
 *
 * A course with several sections keeps the plain strip and the click-through
 * instead: which section a destination like "Publication queue" means is then
 * a real, necessary choice, not friction. Inlining every section's groups
 * there would not remove a click, it would stack N full group sets permanently
 * into the sidebar — trading "hidden" for "overwhelming," the same defect from
 * the other direction.
 *
 * The first group carries the course's work objects, unlabeled; its
 * configuration lands under Setup at the bottom, beside the folded section's
 * own setup rather than in a second heading of its own.
 */
export function courseTabGroups(
  courseId: string,
  currentPath: string,
  opts: { needsReview?: number; activeHref?: string } = {},
  singleSectionAccess?: SectionAccess | null,
): NavGroup[] {
  // Reuses courseTabs rather than repeating its items, so the two can never
  // list the course's own destinations two different ways. Its active flags
  // are provisional — overwritten below once the section's groups (if any) are
  // marked alongside them.
  const groups: NavGroup[] = [
    { label: FORMS_GROUP, items: courseTabs(courseId, currentPath, opts) },
  ];
  if (singleSectionAccess) {
    // `courseStrip: false`: this function already opened with the course's own
    // destinations, and staffSectionTabGroups would otherwise add them again.
    groups.push(
      ...staffSectionTabGroups(singleSectionAccess, currentPath, {
        courseStrip: false,
      }),
    );
  }

  /**
   * The course's configuration rows, led into the Setup group.
   *
   * Merged into the folded section's Setup when there is one, rather than
   * pushed as a second group: two "Setup" headings stacked on top of each
   * other would be the same redundancy this restructure removed from Forms.
   * Course scope leads, section scope follows — widest frame first, matching
   * the order the column already reads in.
   */
  const courseSetup = courseSetupTabs(courseId, currentPath, opts);
  const existingSetup = groups.find((group) => group.label === "Setup");
  if (existingSetup) {
    existingSetup.items = [...courseSetup, ...existingSetup.items];
  } else {
    groups.push({ label: "Setup", items: courseSetup });
  }

  // Marked across every group at once — see staffSectionTabGroups for why.
  const flatActive = mark(
    groups.flatMap((g) => g.items),
    currentPath,
    opts.activeHref,
  );
  const activeByHref = new Map(flatActive.map((i) => [i.href, i.active]));
  return groups.map((g) => ({
    ...g,
    items: g.items.map((i) => ({ ...i, active: activeByHref.get(i.href) ?? false })),
  }));
}

/** Peer views of ONE class, as a student sees them. */
export function studentSectionTabs(
  sectionId: string,
  currentPath: string,
  opts: { activeHref?: string } = {},
): NavItem[] {
  return mark(
    [
      { href: `/sections/${sectionId}`, label: "This week's form" },
      { href: `/sections/${sectionId}/history`, label: "My submissions" },
      { href: `/sections/${sectionId}/qa`, label: "Class Q&A" },
    ],
    currentPath,
    opts.activeHref,
  );
}
