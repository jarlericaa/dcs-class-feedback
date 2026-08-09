import { loadStaffSection, sectionLabel } from "@/lib/staff-section";
import { formatDate } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionTabs } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  Stamp,
  EmptyState,
  Figure,
} from "@/components/ui";
import { IconDownload } from "@/components/ui/icons";
import { getParticipationOverview } from "@/modules/participation";
import { toShellUser } from "@/lib/session";

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
  const path = `/teach/sections/${sectionId}/participation`;
  const ctx = await loadStaffSection(sectionId, "exportParticipation");
  if (!ctx.ok) {
    return (
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={await primaryNavFor(ctx.user, path)}
        title="Participation"
      >
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
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, path, {
        /* A section is reached through its course, and the course now has its
           own rail row — so mark that one rather than the courses index. */
        fallbackHref: `/teach/courses/${course.id}`,
      })}
      tabs={staffSectionTabs(access, path)}
      tabsLabel={sectionLabel(course.code, section.title)}
      contextLabel={sectionLabel(course.code, section.title)}
      title="Participation"
      /* The three exports were a titled card whose whole body was these three
         buttons. They are what this page is for, so they sit in its header. */
      actions={
        <>
          <a
            className="button button--secondary"
            href={exportHref("weekly_matrix")}
          >
            <IconDownload size={15} />
            Weekly matrix
          </a>
          <a
            className="button button--secondary"
            href={exportHref("participants")}
          >
            <IconDownload size={15} />
            Participating students
          </a>
          <a className="button button--secondary" href={exportHref("detailed")}>
            <IconDownload size={15} />
            Detailed responses
          </a>
        </>
      }
    >
      <div className="stack-4">
        <div className="figure-row">
          <Figure value={summary.cycleCount} label="weeks run" />
          <Figure value={summary.activeStudentCount} label="active students" />
          <Figure
            value={summary.averageWeeks.toFixed(1)}
            label="average weeks participated"
          />
          <Figure value={summary.neverParticipated} label="never participated" />
        </div>

        {summary.cycleCount === 0 || students.length === 0 ? (
          <EmptyState title="No participation to report yet">
            Participation is derived from valid weekly submissions. Once the
            first week closes with submissions in it, the matrix and the exports
            appear here.
          </EmptyState>
        ) : (
          <section className="notice">
            <div className="notice__head">
              <div>
                <h2>Weekly matrix</h2>
                <p>
                  {students.length} student{students.length === 1 ? "" : "s"}
                  {summary.deactivatedStudentCount > 0 &&
                    `, including ${summary.deactivatedStudentCount} dropped and kept for the record`}
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
                    {/* The student number left the matrix: an identity column
                        between the name and the weeks split the grid in two, and
                        the identity-bearing use is the exports, which still
                        carry the full number under the same authorization. */}
                    {cycles.map((cycle) => (
                      <th scope="col" className="num" key={cycle.id}>
                        Week {cycle.cycleIndex}
                        <span className="visually-hidden">
                          {" "}
                          starting {formatDate(cycle.openAt, section.timezone)}
                        </span>
                      </th>
                    ))}
                    <th scope="col" className="num matrix__total">
                      Total
                    </th>
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
                            <Stamp tone="neutral">Dropped</Stamp>
                          </>
                        )}
                      </th>
                      {cycles.map((cycle) => {
                        const participated = student.participatedCycleIds.has(
                          cycle.id,
                        );
                        return (
                          <td className="num" key={cycle.id}>
                            <span
                              aria-label={
                                participated
                                  ? "participated"
                                  : "did not participate"
                              }
                            >
                              {participated ? "Yes" : "—"}
                            </span>
                          </td>
                        );
                      })}
                      <td className="num matrix__total">
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
