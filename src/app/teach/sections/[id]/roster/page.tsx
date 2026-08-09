import Link from "next/link";
import { loadStaffSection, sectionLabel } from "@/lib/staff-section";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionTabs } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  Alert,
  EmptyState,
  MetaList,
  Stamp,
} from "@/components/ui";
import { listSectionRoster } from "@/modules/catalog";
import { paginateArray, parsePageParams } from "@/lib/pagination";
import { toShellUser } from "@/lib/session";

/**
 * The class list for one section.
 *
 * There is nothing to approve here, and that is the point. A student's access
 * follows from their UP email appearing on this list — importing the row IS the
 * grant — so this page reports state rather than deciding it. The only controls
 * that change anything live on the import screen, where the whole list is
 * replaced and absent students are deactivated.
 *
 * "Signed in" says whether an account exists for the imported address yet. It is
 * not a link decision and not a prerequisite: a student who has never signed in
 * already has their classes waiting the moment they do.
 */
export default async function SectionRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    state?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const { id: sectionId } = await params;
  const path = `/teach/sections/${sectionId}/roster`;
  const { q, state, page, pageSize } = await searchParams;
  const rosterState =
    state === "signed_in" || state === "not_signed_in" || state === "dropped"
      ? state
      : "all";
  const ctx = await loadStaffSection(sectionId, "viewStudentIdentities");
  if (!ctx.ok) {
    return (
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={await primaryNavFor(ctx.user, path)}
        title="Class list"
      >
        <AccessDenied what="student identities in this section" />
      </AppShell>
    );
  }
  const { user, access, section, course } = ctx;

  const roster = await listSectionRoster(user.id, sectionId);
  const signedInCount = roster.filter((r) => r.signedIn).length;
  const missingEmail = roster.filter((r) => !r.record.rosterEmail).length;

  /**
   * Search and state narrowing happen over an already-authorized read model —
   * the same pattern the review inbox uses. `q` matches the class-list name, the
   * visible last four digits, or the UP email; it never searches the full
   * student number, which is not on screen anyway.
   */
  const needle = q?.trim().toLowerCase();
  const filtered = roster.filter((entry) => {
    if (rosterState === "signed_in" && !entry.signedIn) return false;
    if (rosterState === "not_signed_in" && entry.signedIn) return false;
    if (rosterState === "dropped" && entry.enrollment.status !== "deactivated") {
      return false;
    }
    if (!needle) return true;
    return (
      entry.record.fullName.toLowerCase().includes(needle) ||
      (entry.record.rosterEmail ?? "").includes(needle) ||
      (entry.record.studentNumberLast4 ?? "").includes(needle) ||
      entry.enrollment.rosterName.toLowerCase().includes(needle)
    );
  });
  const paged = paginateArray(filtered, parsePageParams({ page, pageSize }));
  const pageHref = (n: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (rosterState !== "all") query.set("state", rosterState);
    if (n > 1) query.set("page", String(n));
    const suffix = query.toString();
    return `/teach/sections/${sectionId}/roster${suffix ? `?${suffix}` : ""}`;
  };

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
      title="Class list"
      description="Students get access from the UP email on this list. Import the list again to add, correct, or remove someone."
      actions={
        <Link
          className="button button--primary"
          href={`/teach/sections/${sectionId}/import`}
        >
          Import the class list
        </Link>
      }
    >
      <div className="stack-4">
        {missingEmail > 0 && (
          <Alert variant="warning" title="Some rows have no UP email">
            {missingEmail} student
            {missingEmail === 1 ? " has" : "s have"} no UP email on this list, so
            they cannot reach this class. Re-import the list with their UP Mail
            column filled in.
          </Alert>
        )}

        <section className="notice">
          <div className="notice__head">
            <div>
              <h2>Imported students</h2>
            </div>
            {/* Labelled figures, not a lone sentence, and never colour alone. */}
            {roster.length > 0 && (
              <div className="row">
                <span className="tally">
                  <strong>{roster.length}</strong> on the list
                </span>
                <span className="tally">
                  <strong>{signedInCount}</strong> signed in
                </span>
              </div>
            )}
          </div>

          {roster.length === 0 ? (
            <div className="notice__body">
              <EmptyState
                title="No students imported yet"
                action={{
                  href: `/teach/sections/${sectionId}/import`,
                  label: "Import the class list",
                }}
                primary
              >
                The list needs a student number, a name, and a UP email for each
                student.
              </EmptyState>
            </div>
          ) : (
            <>
              {/* Search is a GET form, so a filtered class list stays shareable
                  and works before hydration. */}
              <form
                className="roster-search"
                method="get"
                role="search"
                action={`/teach/sections/${sectionId}/roster`}
              >
                <label className="visually-hidden" htmlFor="roster-q">
                  Search the class list
                </label>
                <input
                  id="roster-q"
                  className="field"
                  name="q"
                  type="search"
                  placeholder="Name, UP email, or student number"
                  defaultValue={q ?? ""}
                />
                <label className="visually-hidden" htmlFor="roster-state">
                  Show
                </label>
                <select
                  id="roster-state"
                  className="select-field"
                  name="state"
                  defaultValue={rosterState}
                >
                  <option value="all">All students</option>
                  <option value="signed_in">Signed in</option>
                  <option value="not_signed_in">Not signed in yet</option>
                  <option value="dropped">Dropped</option>
                </select>
                <button className="button button--secondary" type="submit">
                  Search
                </button>
              </form>

              {paged.rows.length === 0 ? (
                <div className="notice__body">
                  <p className="muted">
                    No students match. Try a different name, email, or number.
                  </p>
                </div>
              ) : (
                <ul className="match-list">
                  {paged.rows.map(({ record, enrollment, signedIn }) => (
                    <li className="roster-row" key={record.id}>
                      <div className="roster-row__main">
                        <p className="match__name">{record.fullName}</p>
                        <MetaList
                          items={[
                            record.rosterEmail ?? "No UP email on this list",
                            record.studentNumberLast4
                              ? `Student number ending ${record.studentNumberLast4}`
                              : "Student number not shown",
                            enrollment.rosterName !== record.fullName
                              ? `Class list name: ${enrollment.rosterName}`
                              : null,
                          ]}
                        />
                      </div>
                      <div className="roster-row__actions">
                        {enrollment.status === "deactivated" && (
                          <Stamp tone="neutral">Dropped</Stamp>
                        )}
                        {!record.rosterEmail ? (
                          <Stamp tone="red">No UP email</Stamp>
                        ) : (
                          <Stamp tone={signedIn ? "green" : "neutral"}>
                            {signedIn ? "Signed in" : "Not signed in yet"}
                          </Stamp>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {paged.totalPages > 1 && (
                <div className="notice__foot row">
                  <span className="meta">
                    Page {paged.page} of {paged.totalPages} · {paged.total}{" "}
                    students
                  </span>
                  <span className="row">
                    {paged.hasPrevious && (
                      <Link
                        className="button button--quiet button--small"
                        href={pageHref(paged.page - 1)}
                      >
                        Previous
                      </Link>
                    )}
                    {paged.hasNext && (
                      <Link
                        className="button button--quiet button--small"
                        href={pageHref(paged.page + 1)}
                      >
                        Next
                      </Link>
                    )}
                  </span>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
