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
   */
  if (input.isTeacher) {
    groups.push({
      label: "My courses",
      collapsible: true,
      items: [
        { href: "/teach/courses", label: "All courses", icon: "course" },
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
 * Peer views of ONE course.
 *
 * Forms comes first because it is the work object. Responses is the queue over
 * those forms. Class lists is who can reach them — the audience, not a thing a
 * teacher comes here to work on, so it sits last.
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
      { href: `/teach/courses/${courseId}/sections`, label: "Class lists" },
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
  opts: { needsReview?: number; activeHref?: string } = {},
): NavGroup[] {
  const id = access.section.id;
  const staff = access.staff;
  if (!staff) return [];
  const perms = staff.permissions;
  const groups: NavGroup[] = [];

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

  // Who can reach this section's forms, and how they got there.
  const classList: NavItem[] = [];
  if (perms.viewStudentIdentities) {
    classList.push({ href: `/teach/sections/${id}/roster`, label: "Class list" });
    classList.push({ href: `/teach/sections/${id}/import`, label: "Import" });
  }
  if (classList.length > 0) groups.push({ label: "Class list", items: classList });

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

  if (perms.manageWeeklyCycles || perms.manageTemplates) {
    groups.push({
      label: "Setup",
      items: [
        { href: `/teach/sections/${id}/setup`, label: "Section setup" },
      ],
    });
  }

  // Marked across every group at once, so the longest-match rule (and an
  // activeHref override) stays global rather than resetting per group.
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

/** Flattened form of {@link staffSectionTabGroups}, for the few callers that
 *  still want one plain list (a page whose own layout has no room for group
 *  headings). Prefer the grouped form wherever the reader can see it. */
export function staffSectionTabs(
  access: SectionAccess,
  currentPath: string,
  opts: { needsReview?: number; activeHref?: string } = {},
): NavItem[] {
  return staffSectionTabGroups(access, currentPath, opts).flatMap(
    (g) => g.items,
  );
}

/**
 * Where `/teach/sections/[id]` should send a reader who has no page of their
 * own in mind — the first peer view their permissions allow. Null when the
 * account holds section standing but no readable view, which the caller must
 * treat as no access rather than as an empty page.
 */
export function firstStaffSectionHref(access: SectionAccess): string | null {
  return staffSectionTabs(access, "")[0]?.href ?? null;
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
