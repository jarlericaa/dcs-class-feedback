import type { SectionAccess } from "@/modules/authz";

/**
 * Navigation is derived from the SAME effective permissions the server
 * enforces, so a user is never shown a destination that will reject them.
 *
 * This is presentation only. Hiding a link is not authorization — every page
 * and action re-checks with require* before touching data.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  active?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

function mark(items: NavItem[], currentPath: string): NavItem[] {
  // Longest matching href wins so /review does not light up for
  // /review/settings-style children of a different destination.
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

/** Staff destinations for one section, filtered by effective permissions. */
export function staffSectionNav(
  access: SectionAccess,
  currentPath: string,
): NavGroup[] {
  const id = access.section.id;
  const perms = access.staff?.permissions;
  if (!perms) return [];
  const items: NavItem[] = [];
  if (perms.reviewResponses) {
    items.push({
      href: `/teach/sections/${id}/review`,
      label: "Review inbox",
      icon: "⌂",
    });
  }
  // Any publication capability can READ the queue; each action inside is
  // gated by its own flag, so a publish-only assistant still sees their work.
  if (
    perms.draftPublicAnswers ||
    perms.rewordPublicQuestions ||
    perms.publishPublicAnswers ||
    perms.schedulePublication
  ) {
    items.push({
      href: `/teach/sections/${id}/publications`,
      label: "Publication queue",
      icon: "◈",
    });
  }
  items.push({
    href: `/sections/${id}/qa`,
    label: "Class Q&A",
    icon: "◎",
  });
  if (perms.viewStudentIdentities) {
    items.push(
      {
        href: `/teach/sections/${id}/matches`,
        label: "Account matches",
        icon: "◇",
      },
      {
        href: `/teach/sections/${id}/import`,
        label: "Roster import",
        icon: "↥",
      },
    );
  }
  if (perms.exportParticipation) {
    items.push({
      href: `/teach/sections/${id}/participation`,
      label: "Participation",
      icon: "▤",
    });
  }
  if (perms.manageBacklogImports) {
    items.push({
      href: `/teach/sections/${id}/backlog`,
      label: "Question backlog",
      icon: "≡",
    });
  }

  const manage: NavItem[] = [];
  if (perms.manageWeeklyCycles || perms.manageTemplates) {
    manage.push({
      href: `/teach/sections/${id}/setup`,
      label: "Section setup",
      icon: "⚙",
    });
  }
  // Audit browsing is not delegable to a TA in the MVP permission catalog.
  if (access.staff && access.staff.role !== "ta") {
    manage.push({
      href: `/teach/sections/${id}/audit`,
      label: "Audit history",
      icon: "◷",
    });
  }

  const groups: NavGroup[] = [
    { label: "Section", items: mark(items, currentPath) },
  ];
  if (manage.length > 0) {
    groups.push({ label: "Manage", items: mark(manage, currentPath) });
  }
  return groups;
}

/** Student destinations for one section. */
export function studentSectionNav(
  sectionId: string,
  currentPath: string,
): NavGroup[] {
  return [
    {
      label: "This class",
      items: mark(
        [
          {
            href: `/sections/${sectionId}`,
            label: "Current week",
            icon: "⌂",
          },
          {
            href: `/sections/${sectionId}/history`,
            label: "My submissions",
            icon: "↺",
          },
          {
            href: `/sections/${sectionId}/qa`,
            label: "Q&A archive",
            icon: "?",
          },
        ],
        currentPath,
      ),
    },
  ];
}

/** Top-level destinations shown when no section is selected. */
export function homeNav(
  currentPath: string,
  opts: { isTeacher: boolean; isPlatformAdmin: boolean },
): NavGroup[] {
  const items: NavItem[] = [{ href: "/", label: "Overview", icon: "⌂" }];
  if (opts.isTeacher) {
    items.push({ href: "/teach/courses", label: "My courses", icon: "▤" });
  }
  if (opts.isPlatformAdmin) {
    items.push({ href: "/admin", label: "Platform admin", icon: "⚙" });
  }
  return [{ label: "Workspace", items: mark(items, currentPath) }];
}
