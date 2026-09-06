import { loadStaffSection, sectionLabel } from "@/lib/staff-section";
import { formatDateTime } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionTabGroups } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  EmptyState,
  MetaList,
  Pagination,
} from "@/components/ui";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { auditActionLabel } from "@/lib/audit-labels";
import { listSectionAuditEvents } from "@/modules/audit";
import { toShellUser } from "@/lib/session";

/**
 * Audit history for one section.
 *
 * The log is append-only and scoped to entities belonging to this section, so
 * a teacher sees their own resources and nothing else. Never student-visible.
 * Not delegable to a TA: the MVP permission catalog has no audit flag, so this
 * page requires teacher/co-teacher/course-staff standing.
 */
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  const { id: sectionId } = await params;
  const path = `/teach/sections/${sectionId}/audit`;
  const { action, page } = await searchParams;
  const ctx = await loadStaffSection(sectionId);
  if (!ctx.ok || ctx.access.staff?.role === "ta") {
    return (
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={await primaryNavFor(ctx.user, path)}
        title="Audit history"
      >
        <AccessDenied what="this section's audit history" />
      </AppShell>
    );
  }
  const { user, access, section, course } = ctx;

  const events = await listSectionAuditEvents(user.id, sectionId, {
    action,
    page,
  });
  // Action options come from the visible page. Offering only what is on screen
  // is honest: a global action list would need a separate scan of the whole log.
  const actions = [
    ...new Set(events.rows.map((e) => e.event.action)),
  ].sort() as string[];

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, path, {
        /* A section is reached through its course, and the course now has its
           own rail row — so mark that one rather than the courses index. */
        fallbackHref: `/teach/courses/${course.id}`,
      })}
      tabGroups={staffSectionTabGroups(access, path)}
      tabsLabel={sectionLabel(course.code, section.title)}
      tabsMode="menu"
      contextLabel={sectionLabel(course.code, section.title)}
      title="Audit history"
    >
      <div className="stack-4">
        {events.total === 0 ? (
          <EmptyState title="No audit records yet">
            Every important action in this section — a confirmed identity, a
            published answer, a participation decision, an export — is recorded
            here with who did it and when.
          </EmptyState>
        ) : (
          <>
            {/* Choosing applies. The separate generic "Filter" button is
                gone; it made one decision take two clicks. */}
            <form className="toolbar" method="get">
              <AutoSubmitSelect
                id="audit-action"
                name="action"
                label="Show which action"
                defaultValue={action ?? ""}
              >
                <option value="">All actions</option>
                {actions.map((value) => (
                  <option key={value} value={value}>
                    {auditActionLabel(value)}
                  </option>
                ))}
              </AutoSubmitSelect>
            </form>

            {events.rows.length === 0 ? (
              <EmptyState title="No records for that action">
                Choose a different action, or clear the filter to see everything.
              </EmptyState>
            ) : (
            <section className="notice">
              <ul className="data-list">
                {events.rows.map(({ event, actor }) => (
                  <li key={event.id}>
                    <span className="data-list__main">
                      <strong>{auditActionLabel(event.action)}</strong>
                      <MetaList
                        items={[
                          actor ? actor.displayName : "System",
                          formatDateTime(event.createdAt, section.timezone),
                          event.entityType.replace(/_/g, " "),
                        ]}
                      />
                      {(event.before !== null || event.after !== null) && (
                        <details style={{ marginTop: 6 }}>
                          <summary className="muted small">
                            What changed
                          </summary>
                          <pre className="code-block">
                            {JSON.stringify(
                              { before: event.before, after: event.after },
                              null,
                              2,
                            ) ?? ""}
                          </pre>
                        </details>
                      )}
                    </span>
                    {/* No stamp: the line above already reads "System · …",
                        and an AUTOMATIC badge on twenty of twenty-five rows
                        carried no signal while competing with the stamps that
                        do. */}
                  </li>
                ))}
              </ul>
            </section>
            )}
            <Pagination
              page={events.page}
              totalPages={events.totalPages}
              total={events.total}
              basePath={`/teach/sections/${sectionId}/audit`}
              params={{ action }}
              label="audit records"
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
