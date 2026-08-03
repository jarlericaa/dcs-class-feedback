import { loadStaffSection } from "@/lib/staff-section";
import { formatDateTime } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionNav } from "@/components/layout/nav";
import {
  AccessDenied,
  Alert,
  Badge,
  Breadcrumbs,
  EmptyState,
  Pagination,
} from "@/components/ui";
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
  const { action, page } = await searchParams;
  const ctx = await loadStaffSection(sectionId);
  if (!ctx.ok || ctx.access.staff?.role === "ta") {
    return (
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={[]}
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
      navGroups={staffSectionNav(access, `/teach/sections/${sectionId}/audit`)}
      contextLabel={section.title}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/", label: "Overview" },
            { label: `${course.code} · ${section.term}` },
            { label: "Audit history" },
          ]}
        />
      }
      eyebrow="Staff only"
      title="Audit history"
      description="Every important change to this section, with who did it and what changed. Records are never edited or deleted."
    >
      <div className="stack-gap">
        <Alert variant="info" title="Scope">
          This shows changes to this section only — its cycles, responses,
          answers, staff, schedule, roster imports and account matches.
        </Alert>

        {events.total === 0 ? (
          <EmptyState title="No audit records yet">
            Activity appears here as soon as something changes in this section.
          </EmptyState>
        ) : (
          <>
            <form className="filter-bar" method="get">
              <label className="visually-hidden" htmlFor="audit-action">
                Filter by action
              </label>
              <select
                id="audit-action"
                className="select-field"
                name="action"
                defaultValue={action ?? ""}
              >
                <option value="">All actions</option>
                {actions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <button className="button button--secondary" type="submit">
                Filter
              </button>
            </form>

            <section className="card">
              <ul className="data-list">
                {events.rows.map(({ event, actor }) => (
                  <li key={event.id}>
                    <span className="data-list__main">
                      <strong>{event.action.replace(/[._]/g, " ")}</strong>
                      <small>
                        {actor
                          ? `${actor.displayName} (${actor.email})`
                          : "System"}{" "}
                        · {formatDateTime(event.createdAt, section.timezone)} ·{" "}
                        {event.entityType.replace(/_/g, " ")}
                      </small>
                      {(event.before !== null || event.after !== null) && (
                        <details style={{ marginTop: 6 }}>
                          <summary className="muted small">
                            What changed
                          </summary>
                          <pre
                            className="small"
                            style={{
                              margin: "6px 0 0",
                              padding: 10,
                              overflowX: "auto",
                              background: "var(--surface-muted)",
                              borderRadius: 8,
                            }}
                          >
                            {JSON.stringify(
                              { before: event.before, after: event.after },
                              null,
                              2,
                            ) ?? ""}
                          </pre>
                        </details>
                      )}
                    </span>
                    {!actor && <Badge tone="neutral">Automatic</Badge>}
                  </li>
                ))}
              </ul>
            </section>
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
