import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionTabGroups } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import { loadStaffSection, sectionLabel } from "@/lib/staff-section";
import { toShellUser } from "@/lib/session";
import { AccessDenied, EmptyState, MetaList } from "@/components/ui";
import { IconPlus } from "@/components/ui/icons";
import { AuthzError } from "@/modules/authz";
import { listTemplatesForCourse } from "@/modules/forms/templates";
import { buttonClass } from "@/components/ui/button";

/**
 * The definition view for a section-scoped template manager.
 *
 * Forms belong to the course, but `manage_templates` is a per-section grant.
 * This page is the section's doorway into those course-level definitions. It
 * deliberately does not show delivery, audience, or occurrence data: those
 * remain behind course standing and their own server-side gates.
 */
export default async function SectionFormsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sectionId } = await params;
  const path = `/teach/sections/${sectionId}/forms`;
  const ctx = await loadStaffSection(sectionId, "manageTemplates");
  if (!ctx.ok) {
    return (
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={await primaryNavFor(ctx.user, path)}
        title="Forms"
      >
        <AccessDenied what="this section's forms" />
      </AppShell>
    );
  }

  const { user, access, section, course } = ctx;
  let forms;
  try {
    forms = await listTemplatesForCourse(user.id, course.id);
  } catch (error) {
    if (!(error instanceof AuthzError)) throw error;
    return (
      <AppShell
        user={toShellUser(user)}
        workspace="staff"
        navGroups={await primaryNavFor(user, path, {
          fallbackHref: `/teach/sections/${sectionId}`,
        })}
        tabGroups={staffSectionTabGroups(access, path)}
        tabsLabel={sectionLabel(course.code, section.title)}
        tabsMode="menu"
        contextLabel={sectionLabel(course.code, section.title)}
        title="Forms"
      >
        <AccessDenied what="this section's forms" />
      </AppShell>
    );
  }

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, path, {
        fallbackHref: `/teach/sections/${sectionId}`,
      })}
      tabGroups={staffSectionTabGroups(access, path)}
      tabsLabel={sectionLabel(course.code, section.title)}
      tabsMode="menu"
      contextLabel={sectionLabel(course.code, section.title)}
      title="Forms"
      actions={
        <Link
          className={buttonClass({ variant: "primary" })}
          href={`/teach/courses/${course.id}/forms/new?sectionId=${sectionId}`}
        >
          <IconPlus size={15} />
          New form
        </Link>
      }
    >
      <div className="stack-4">
        <p className="muted">
          Edit the reusable questions for {course.code}. Delivery settings and
          occurrences are managed by course staff.
        </p>
        {forms.length === 0 ? (
          <EmptyState
            title="No forms yet"
            action={{
              href: `/teach/courses/${course.id}/forms/new?sectionId=${sectionId}`,
              label: "New form",
            }}
            primary
          >
            Create the questions first. A course instructor can decide when and
            where the form goes out.
          </EmptyState>
        ) : (
          <section className="notice">
            <div className="table-scroll table-scroll--flush">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Form</th>
                    <th scope="col">Questions</th>
                    <th scope="col">Version</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {forms.map(({ template, latestVersion, questionCount }) => (
                    <tr key={template.id}>
                      <th scope="row">
                        <Link
                          className="link"
                          href={`/teach/courses/${course.id}/forms/${template.id}?sectionId=${sectionId}`}
                        >
                          {template.title}
                        </Link>
                        <MetaList
                          items={[
                            template.purpose,
                            template.archived ? "Archived" : null,
                          ]}
                        />
                      </th>
                      <td>{questionCount}</td>
                      <td>{latestVersion?.versionNumber ?? "—"}</td>
                      <td>
                        <Link
                          className={buttonClass({
                            variant: "secondary",
                            size: "small",
                          })}
                          href={`/teach/courses/${course.id}/forms/${template.id}?sectionId=${sectionId}`}
                        >
                          Edit questions
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
