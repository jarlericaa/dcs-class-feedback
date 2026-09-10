import Link from "next/link";
import { loadStaffSection, sectionLabel } from "@/lib/staff-section";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionTabGroups } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  Alert,
  EmptyState,
  Pagination,
  Stamp,
} from "@/components/ui";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { IconDownload } from "@/components/ui/icons";
import {
  defaultCycleId,
  getParticipationOverview,
  listAnswerFilters,
  listCycleParticipation,
  listSectionCycles,
} from "@/modules/participation";
import { toShellUser } from "@/lib/session";

/**
 * Participation, around the two questions a teacher actually has.
 *
 * "Who answered THIS week" and "who said THAT" — GitHub issue #15. The page
 * used to open on a whole-term matrix and three aggregate figures, one of which
 * was a section average: a number that moves when anyone joins or drops and
 * names nobody to follow up. The matrix is still here, because "how is the term
 * going" is a real question, but it is now the second view rather than the
 * first.
 *
 * Default: the most recent occurrence anybody actually answered. Landing on
 * next week's empty form would be technically correct and useless, which is the
 * same reasoning the review column uses. A section that has collected nothing
 * has no "this week", so it opens on the whole term instead — and `All weeks`
 * is always one choice away, in the URL like every other filter here.
 *
 * Everything on this page is identity-bearing and needs `export_participation`.
 * Students never see any of it (MVP rule), and it is derived entirely from
 * valid responses — marking one invalid removes its credit here immediately,
 * with no stored counter to correct.
 */
export default async function ParticipationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    /** one occurrence, or `all` for the whole-term matrix */
    week?: string;
    /** a question on that occurrence, and one of its answers */
    question?: string;
    answer?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const { id: sectionId } = await params;
  const path = `/teach/sections/${sectionId}/participation`;
  const sp = await searchParams;
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

  const cycles = await listSectionCycles(user.id, sectionId);
  /**
   * Which week is being read. `all` is explicit — a reader who chose the whole
   * term keeps it on a reload — and an unknown id falls back to the default
   * rather than to an empty page.
   */
  const fallbackCycleId = defaultCycleId(cycles);
  const weekParam = sp.week;
  const showAllWeeks =
    weekParam === "all" || (!weekParam && fallbackCycleId === null);
  const currentCycleId = showAllWeeks
    ? null
    : ((weekParam && cycles.some((c) => c.id === weekParam)
        ? weekParam
        : fallbackCycleId) ?? null);
  const currentCycle = cycles.find((c) => c.id === currentCycleId) ?? null;

  // A complete, finite selector per week — not a list, so not paginated.
  const answerFilters = currentCycleId
    ? await listAnswerFilters(user.id, sectionId, currentCycleId)
    : [];
  // Preserve nonblank query values even when they are unknown. The service
  // refuses those filters; dropping them here would turn a hand-edited URL
  // into an unfiltered class list before the shared scope check can run.
  const requestedQuestionId = sp.question?.trim() || undefined;
  const requestedAnswerKey = sp.answer?.trim() || undefined;
  const question = answerFilters.find(
    (q) => q.questionId === requestedQuestionId,
  );
  const answer = question?.options.find((o) => o.key === requestedAnswerKey);
  const hasRequestedAnswerFilter =
    !!requestedQuestionId || !!requestedAnswerKey;
  const hasAppliedAnswerFilter = !!question && !!answer;

  const week = currentCycleId
    ? await listCycleParticipation(user.id, sectionId, {
        cycleId: currentCycleId,
        // Both or neither: half a filter is refused by the shared scope builder,
        // never silently widened to everyone.
        questionId: requestedQuestionId,
        answerKey: requestedAnswerKey,
        page: sp.page,
        pageSize: sp.pageSize,
      })
    : null;

  // Only read for the whole-term view: the matrix is every cell at once, and
  // computing it to render one week would be the whole term for nothing.
  const overview = showAllWeeks
    ? await getParticipationOverview(user.id, sectionId)
    : null;

  const filterParams = {
    week: showAllWeeks ? "all" : (currentCycleId ?? undefined),
    question: requestedQuestionId,
    answer: requestedAnswerKey,
  };
  const exportHref = (report: string, extra: Record<string, string> = {}) => {
    const query = new URLSearchParams({ report });
    for (const [key, value] of Object.entries({ ...filterParams, ...extra })) {
      if (value) query.set(key, value);
    }
    return `${path}/export?${query.toString()}`;
  };

  /**
   * Which downloads to OFFER. Presentation only — the services refuse them
   * regardless (`requireInstructor`), which is the enforcement point.
   *
   * The three newer identity-bearing files are instructor-only, so a Student
   * Assistant holding `export_participation` reads this screen but is not shown
   * buttons that would answer with a refusal. The whole-term matrix and the
   * detailed export stay on the flag, per decision D17.
   */
  const canExportIdentityFiles = !!access.staff?.isInstructor;

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
      title="Participation"
      /**
       * The exports follow the FILTER, so they belong beside it rather than in
       * a card of their own. Each one names what it will contain, because a
       * button called "Export" beside a filtered list is a guess.
       */
      actions={
        <>
          {currentCycle && canExportIdentityFiles && (
            /* CSV only. The XLSX twins doubled the row of buttons to offer the
               same three reports in a second file format nobody had asked for,
               and the format suffix can go with them: when every download is a
               CSV, saying so on each button is noise. */
            <>
              <a className="button button--primary" href={exportHref("responders")}>
                <IconDownload size={15} />
                Who responded
              </a>
              <a
                className="button button--secondary"
                href={exportHref("responders", { include: "all" })}
              >
                <IconDownload size={15} />
                Everyone, responded or not
              </a>
              {/* Not "This week" — that named the FILTER, which the selector
                  above already shows, and said nothing about what the file
                  holds. This one is the table as it currently stands, answer
                  filter and all, which is the only thing that distinguishes it
                  from the two above. */}
              <a className="button button--secondary" href={exportHref("week")}>
                <IconDownload size={15} />
                This list, as shown
              </a>
            </>
          )}
          {showAllWeeks && (
            <>
              <a
                className="button button--secondary"
                href={exportHref("weekly_matrix")}
              >
                <IconDownload size={15} />
                Weekly matrix
              </a>
              <a className="button button--secondary" href={exportHref("detailed")}>
                <IconDownload size={15} />
                Detailed responses
              </a>
            </>
          )}
        </>
      }
    >
      <div className="stack-4">
        {cycles.length === 0 ? (
          <EmptyState title="No participation to report yet">
            Participation is derived from valid weekly submissions. Once the
            first form closes with submissions in it, the weeks and the exports
            appear here.
          </EmptyState>
        ) : (
          <>
            {/* One GET form: week, then question, then answer. Choosing
                applies, and every choice is in the URL, so a filtered view is
                shareable and survives a reload. */}
            <form className="toolbar" method="get" action={path}>
              <AutoSubmitSelect
                id="part-week"
                name="week"
                label="Which week"
                defaultValue={showAllWeeks ? "all" : (currentCycleId ?? "all")}
              >
                {cycles
                  .slice()
                  .reverse()
                  .map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>
                      {cycle.label} · {cycle.responseCount}{" "}
                      {cycle.responseCount === 1 ? "response" : "responses"}
                    </option>
                  ))}
                <option value="all">All weeks (the whole term)</option>
              </AutoSubmitSelect>

              {/* Answer filtering is per week by design: a question belongs to
                  one occurrence's snapshot, so "that answer" has no meaning
                  across a term whose forms may differ. */}
              {currentCycleId && answerFilters.length > 0 && (
                <>
                  <AutoSubmitSelect
                    id="part-question"
                    name="question"
                    label="To which question"
                    defaultValue={question?.questionId ?? ""}
                  >
                    <option value="">Any question</option>
                    {answerFilters.map((q) => (
                      <option key={q.questionId} value={q.questionId}>
                        {shorten(q.prompt)}
                      </option>
                    ))}
                  </AutoSubmitSelect>
                  {question && (
                    <AutoSubmitSelect
                      id="part-answer"
                      name="answer"
                      label="Who answered"
                      defaultValue={answer?.key ?? ""}
                    >
                      <option value="">Any answer</option>
                      {question.options.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </AutoSubmitSelect>
                  )}
                </>
              )}
              {/* No `<noscript>` submit here: every `AutoSubmitSelect` ships
                  its own, so the form still applies with JavaScript off. */}
            </form>

            {question && !requestedAnswerKey ? (
              <p className="meta">
                Pick an answer to narrow the list. No students are shown until
                both the question and answer are selected.
              </p>
            ) : hasRequestedAnswerFilter && !hasAppliedAnswerFilter ? (
              <Alert variant="warning" title="That answer filter is unavailable">
                This question or answer is no longer available. No students are
                shown for this filter.
              </Alert>
            ) : null}

            {week && currentCycle ? (
              <section className="notice">
                <div className="notice__head">
                  <div>
                    <h2>{currentCycle.label}</h2>
                    {/* Only the filter is described, and only when one is on.
                        The old line read "2 of 3 students on this page
                        responded · still open": a count scoped to the current
                        PAGE rather than the class, beside a state the selector
                        and the Submitted column both already imply. The
                        response-count figure that sat opposite it is gone too
                        — the Responded column is the count. */}
                    {question && answer && (
                      <p>
                        {`${week.total} ${week.total === 1 ? "student" : "students"} answered “${answer.label}”`}
                      </p>
                    )}
                  </div>
                </div>

                {week.rows.length === 0 ? (
                  <div className="notice__body">
                    <p className="muted">
                      {question && answer
                        ? "Nobody gave that answer this week."
                        : hasRequestedAnswerFilter
                          ? "No students match this filter."
                          : "Nobody is on this class list yet."}
                    </p>
                  </div>
                ) : (
                  <div className="table-scroll table-scroll--flush">
                    <table className="data-table">
                      <caption className="visually-hidden">
                        {currentCycle.label} participation by student
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Student</th>
                          <th scope="col">Responded</th>
                          <th scope="col">Submitted</th>
                          {question && answer && (
                            <th scope="col">Their answer</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {week.rows.map((row) => (
                          <tr key={row.studentRecordId}>
                            <th scope="row" className="wrap">
                              {row.fullName}
                              {!row.active && (
                                <>
                                  {" "}
                                  <Stamp tone="neutral">Dropped</Stamp>
                                </>
                              )}
                            </th>
                            <td>
                              {row.participated ? (
                                <span className="yesno yesno--yes">Yes</span>
                              ) : (
                                /* A submission marked invalid earns no credit,
                                   so it answers "responded?" with No like any
                                   other. The reason is kept on the cell rather
                                   than in a second badge beside the word —
                                   losing it would hide the one No a teacher
                                   might need to explain. */
                                <span
                                  className="yesno yesno--no"
                                  title={
                                    row.validity === "invalid"
                                      ? "Marked invalid, so it earns no credit"
                                      : undefined
                                  }
                                >
                                  No
                                </span>
                              )}
                            </td>
                            <td>
                              {row.submittedAt ? (
                                formatDateTime(row.submittedAt, section.timezone)
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                            {question && answer && (
                              <td className="wrap">{row.answerLabels ?? "—"}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Paginated in the database, so a large class list costs one
                    page of rows rather than the whole class. */}
                <Pagination
                  page={week.page}
                  totalPages={week.totalPages}
                  total={week.total}
                  basePath={path}
                  params={filterParams}
                  label="students"
                />
              </section>
            ) : null}

            {overview && (
              <section className="notice">
                <div className="notice__head">
                  <div>
                    <h2>The whole term</h2>
                    <p>
                      {overview.students.length} student
                      {overview.students.length === 1 ? "" : "s"}
                      {overview.summary.deactivatedStudentCount > 0 &&
                        `, including ${overview.summary.deactivatedStudentCount} dropped and kept for the record`}
                    </p>
                  </div>
                </div>
                {overview.summary.cycleCount === 0 ||
                overview.students.length === 0 ? (
                  <div className="notice__body">
                    <p className="muted">
                      Nothing has been collected from this class yet.
                    </p>
                  </div>
                ) : (
                  <div className="table-scroll table-scroll--flush">
                    <table className="data-table">
                      <caption className="visually-hidden">
                        Weekly participation by student
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Student</th>
                          {overview.cycles.map((cycle) => (
                            <th scope="col" className="num" key={cycle.id}>
                              {/* Each week is a way in: the column heading
                                  opens that week's own filterable list. */}
                              <Link
                                className="link"
                                href={`${path}?week=${cycle.id}`}
                              >
                                Week {cycle.cycleIndex}
                              </Link>
                              <span className="visually-hidden">
                                {" "}
                                starting{" "}
                                {formatDate(cycle.openAt, section.timezone)}
                              </span>
                            </th>
                          ))}
                          <th scope="col" className="num matrix__total">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.students.map((student) => (
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
                            {overview.cycles.map((cycle) => {
                              const participated =
                                student.participatedCycleIds.has(cycle.id);
                              return (
                                <td className="num" key={cycle.id}>
                                  {/* The same green Yes as the week list, so
                                      one colour means one thing across both
                                      views. A blank week stays an em dash
                                      rather than a red No: across eight weeks
                                      of a term that would paint most of the
                                      grid red, and here the cell means "no
                                      form answered", not "failed to". */}
                                  <span
                                    className={
                                      participated
                                        ? "yesno yesno--yes"
                                        : "muted"
                                    }
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
                              <strong>{student.totalWeeks}</strong> /{" "}
                              {overview.cycles.length}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

/**
 * A prompt short enough to be an option in a `<select>`.
 *
 * Cut on a word, never through one: two questions whose labels cannot be told
 * apart are worse than two long ones. Plain text — a `<select>` cannot render
 * markup, so a prompt carrying Markdown or LaTeX shows its source here, which
 * is the honest limit of the control rather than something to fake.
 */
function shorten(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 60);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
