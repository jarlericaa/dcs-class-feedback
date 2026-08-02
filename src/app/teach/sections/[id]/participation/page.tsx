import { loadStaffSection } from "@/lib/staff-section";
import { formatDate } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionNav } from "@/components/layout/nav";
import {
  AccessDenied,
  Alert,
  Badge,
  Breadcrumbs,
  EmptyState,
  Stat,
} from "@/components/ui";
import { getParticipationOverview } from "@/modules/participation";

/**
 * Participation dashboard. Derived entirely from valid responses — there is no
 * stored participation counter, so marking a response invalid removes its
 * credit here immediately.
 *
 * Identity-bearing, so it needs the same export_participation capability as
 * the CSVs. Students never see any of this (MVP rule).
 */
export default async function ParticipationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sectionId } = await params;
  const ctx = await loadStaffSection(sectionId, "exportParticipation");
  if (!ctx.ok) {
    return (
      <AppShell user={ctx.user} workspace="staff" navGroups={[]} title="Participation">
        <AccessDenied what="participation records for this section" />
      </AppShell>
    );
  }
  const { user, access, section, course } = ctx;
  const { cycles, students, summary } = await getParticipationOverview(
    user.id,
    sectionId,
  );

  const exportHref = (report: string) =>
    `/teach/sections/${sectionId}/participation/export?report=${report}`;

  return (
    <AppShell
      user={user}
      workspace="staff"
      navGroups={staffSectionNav(access, `/teach/sections/${sectionId}/participation`)}
      contextLabel={section.title}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/", label: "Overview" },
            { label: `${course.code} · ${section.term}` },
            { label: "Participation" },
          ]}
        />
      }
      eyebrow="Staff only"
      title="Participation"
      description="A student participated in a week if they have one valid submission for it. Nothing here is visible to students."
    >
      <div className="stack-gap">
        <Alert variant="warning" title="These files contain student names and numbers">
          Every download is recorded in the audit history with your name.
        </Alert>

        <div className="stat-row">
          <Stat value={summary.cycleCount} label="weeks run" />
          <Stat value={summary.activeStudentCount} label="active students" />
          <Stat
            value={summary.averageWeeks.toFixed(1)}
            label="average weeks participated"
          />
          <Stat value={summary.neverParticipated} label="never participated" />
        </div>

        <section className="card">
          <div className="card__header">
            <div>
              <h2>Export</h2>
              <p>The three reports defined in the participation rules.</p>
            </div>
          </div>
          <div className="card__body row-gap">
            <a className="button button--secondary" href={exportHref("weekly_matrix")}>
              Weekly matrix CSV
            </a>
            <a className="button button--secondary" href={exportHref("participants")}>
              Participating students CSV
            </a>
            <a className="button button--secondary" href={exportHref("detailed")}>
              Detailed responses CSV
            </a>
          </div>
        </section>

        {summary.cycleCount === 0 || students.length === 0 ? (
          <EmptyState title="Nothing to report yet">
            Once this section has run a week and students have submitted, the
            matrix appears here.
          </EmptyState>
        ) : (
          <section className="card">
            <div className="card__header">
              <div>
                <h2>Weekly matrix</h2>
                <p>
                  {students.length} student{students.length === 1 ? "" : "s"}
                  {summary.deactivatedStudentCount > 0 &&
                    ` · ${summary.deactivatedStudentCount} dropped, kept for the record`}
                </p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <caption className="visually-hidden">
                  Weekly participation by student
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Number</th>
                    {cycles.map((cycle) => (
                      <th scope="col" key={cycle.id}>
                        Wk {cycle.cycleIndex}
                        <span className="visually-hidden">
                          {" "}
                          starting {formatDate(cycle.openAt, section.timezone)}
                        </span>
                      </th>
                    ))}
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.studentRecordId}>
                      <th scope="row" className="wrap">
                        {student.fullName}
                        {!student.active && (
                          <>
                            {" "}
                            <Badge tone="neutral">Dropped</Badge>
                          </>
                        )}
                      </th>
                      <td>{student.studentNumber}</td>
                      {cycles.map((cycle) => {
                        const participated = student.participatedCycleIds.has(
                          cycle.id,
                        );
                        return (
                          <td key={cycle.id}>
                            <span
                              aria-label={
                                participated ? "participated" : "did not participate"
                              }
                            >
                              {participated ? "Yes" : "—"}
                            </span>
                          </td>
                        );
                      })}
                      <td>
                        <strong>{student.totalWeeks}</strong> / {cycles.length}
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
