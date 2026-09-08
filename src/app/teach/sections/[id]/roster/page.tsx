import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { loadStaffSection, sectionLabel } from "@/lib/staff-section";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionTabGroups } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  Alert,
  EmptyState,
  MetaList,
  Stamp,
} from "@/components/ui";
import { RosterImportDialog } from "@/components/staff/roster-import-dialog";
import { listSectionRosterPage, type RosterState } from "@/modules/catalog";
import {
  commitRosterImport,
  getRosterImportOutcome,
  parseRosterCsv,
  parseRosterXlsx,
  looksLikeXlsx,
  WARNING_LABELS,
  type ParsedRoster,
  type RowWarning,
} from "@/modules/roster-import";
import { AuthzError } from "@/modules/authz";
import { formatStudentNumber, studentNumberTail } from "@/lib/student-number";
import { toShellUser } from "@/lib/session";

/**
 * The class list for one section.
 *
 * There is nothing to approve here, and that is the point. A student's access
 * follows from their UP email appearing on this list — importing the row IS the
 * grant — so this page reports state rather than deciding it. The one control
 * that changes anything is the import, which now opens as a modal ON this page
 * rather than as its own destination (GitHub issue #12): the whole list is
 * replaced and absent students are deactivated, never deleted.
 *
 * Staff who hold `viewStudentIdentities` see the WHOLE student number, in its
 * real format. It is decrypted per render by the read model, which requires
 * that capability — so nobody else can reach this page at all, let alone the
 * number.
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
    /** the import that just ran, so its outcome can be read back */
    imported?: string;
    error?: string;
  }>;
}) {
  const { id: sectionId } = await params;
  const path = `/teach/sections/${sectionId}/roster`;
  const { q, state, page, pageSize, imported, error } = await searchParams;
  const rosterState: RosterState =
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

  /**
   * Filtered, counted, ordered and sliced in the DATABASE.
   *
   * The screen used to load the whole class list, decrypt every student number
   * to search it, and then page the array — so a section paid one AES-GCM
   * decrypt per enrolled student on every render, search included. Now only the
   * rows on this page are opened. `stats` still describes the whole section,
   * because the heading below counts the class, not the page.
   *
   * The one thing that narrowed with the move: a number can be searched whole
   * or by its last four, but not by an arbitrary substring. The plaintext is in
   * no column — see `listSectionRosterPage` for why that is the trade and why
   * it stays.
   */
  const paged = await listSectionRosterPage(user.id, sectionId, {
    state: rosterState,
    q,
    page,
    pageSize,
  });
  const { stats } = paged;

  /**
   * The outcome of the import that just ran, read back from what the commit
   * persisted. This is what replaced the preview: a teacher still has to be
   * told which lines were refused, and now they are told it AFTER the fact
   * rather than before.
   */
  const outcome = imported
    ? await getRosterImportOutcome(user.id, sectionId, imported)
    : null;

  /**
   * Import and apply, in one step.
   *
   * Safe without a confirm step because none of the safety was ever in the
   * preview: `commitRosterImport` requires `viewStudentIdentities` on THIS
   * section, re-derives every decision from live data inside one transaction,
   * refuses any row whose UP email it cannot trust, deactivates rather than
   * deletes anyone the file no longer mentions, and audits all of it against
   * one import batch.
   *
   * The file never round-trips through the query string — only the batch id
   * does, and that carries no student data.
   */
  async function runImport(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const back = (params: Record<string, string>) =>
      `${path}?${new URLSearchParams(params).toString()}`;

    const upload = formData.get("file");
    const pasted = String(formData.get("csv") ?? "");
    let parsed: ParsedRoster;
    let source: string;

    try {
      if (upload instanceof File && upload.size > 0) {
        const bytes = Buffer.from(await upload.arrayBuffer());
        const namedXlsx = upload.name.toLowerCase().endsWith(".xlsx");
        if (namedXlsx || looksLikeXlsx(bytes)) {
          parsed = await parseRosterXlsx(bytes);
        } else {
          // A non-XLSX binary upload should not be decoded as CSV and then
          // reported as a page of unrelated malformed rows.
          if (looksBinary(new TextDecoder().decode(bytes.subarray(0, 8)))) {
            redirect(
              back({
                error:
                  "That file is not a readable CSV or Excel workbook. Choose a .csv or .xlsx class list.",
              }),
            );
          }
          parsed = parseRosterCsv(new TextDecoder().decode(bytes));
        }
        source = upload.name || "class list";
      } else if (pasted.trim()) {
        parsed = parseRosterCsv(pasted);
        source = "pasted class list";
      } else {
        redirect(back({ error: "Choose a CSV or XLSX file, or paste the rows." }));
      }

      if (parsed.fileError) redirect(back({ error: parsed.fileError }));
      const summary = await commitRosterImport(uid, sectionId, parsed, source!);
      revalidatePath(path);
      redirect(back({ imported: summary.importBatchId }));
    } catch (err) {
      if (err instanceof AuthzError) redirect(back({ error: err.message }));
      /* A `redirect()` above throws a control-flow signal that must not be
         swallowed by this catch. */
      if (
        err &&
        typeof err === "object" &&
        "digest" in err &&
        String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
      ) {
        throw err;
      }
      console.error("[roster import] unmapped error", err);
      redirect(
        back({
          error:
            "That file could not be imported. Nothing was changed. Check that it is a CSV with a student number, a name and a UP email in each row.",
        }),
      );
    }
  }
  const pageHref = (n: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (rosterState !== "all") query.set("state", rosterState);
    /* Carried, or "Next" silently re-pages the list at the default size: a
       reader on ?pageSize=100 would jump from rows 1-100 to rows 26-50, and
       neither the rows they skipped nor the ones they saw twice would say so. */
    if (pageSize) query.set("pageSize", pageSize);
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
      tabGroups={staffSectionTabGroups(access, path)}
      tabsLabel={sectionLabel(course.code, section.title)}
      tabsMode="menu"
      contextLabel={sectionLabel(course.code, section.title)}
      title="Class list"
      actions={
        <RosterImportDialog action={runImport} sectionTitle={section.title} />
      }
    >
      <div className="stack-4">
        {error && <Alert variant="error">{error}</Alert>}
        {outcome?.summary && (
          <ImportOutcomePanel
            outcome={outcome as NonNullable<typeof outcome>}
          />
        )}

        {stats.missingEmail > 0 && (
          <Alert variant="warning" title="Some rows have no UP email">
            {stats.missingEmail} student
            {stats.missingEmail === 1 ? " has" : "s have"} no UP email on this list, so
            they cannot reach this class. Re-import the list with their UP Mail
            column filled in.
          </Alert>
        )}

        <section className="notice">
          <div className="notice__head">
            <div>
              <h2>Imported students</h2>
            </div>
            {/* ONE phrase. Two adjacent figures rendered as
                "2 on the list2 signed in" — two stats with nothing between
                them, which is not a sentence and not a pair of figures either
                (GitHub issue #12). */}
            {stats.total > 0 && (
              <p className="tally">
                <strong>{stats.total}</strong>{" "}
                {stats.total === 1 ? "student" : "students"} (
                <strong>{stats.signedIn}</strong> signed in)
              </p>
            )}
          </div>

          {stats.total === 0 ? (
            <div className="notice__body stack-4">
              <EmptyState title="No students imported yet">
                The list needs a student number, a name, and a UP email for each
                student.
              </EmptyState>
              {/* The same control as the header's, because an empty state that
                  only describes the next step makes the reader go and find
                  it. */}
              <RosterImportDialog
                action={runImport}
                label="Import the class list"
                sectionTitle={section.title}
              />
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
                  {/* Two different causes, two different answers. An empty page
                      because nothing matched is a search problem; an empty page
                      because `?page=` ran past the end is not, and telling that
                      reader to try another name sends them after a fault that
                      is not theirs. */}
                  {paged.total === 0 ? (
                    <p className="muted">
                      No students match. Try a different name, email, or number.
                    </p>
                  ) : (
                    <p className="muted">
                      That page is past the end of this list.{" "}
                      <Link href={pageHref(1)}>Back to the first page</Link>.
                    </p>
                  )}
                </div>
              ) : (
                <ul className="match-list">
                  {paged.rows.map(({ record, enrollment, signedIn, studentNumber }) => (
                    <li className="roster-row" key={record.id}>
                      <div className="roster-row__main">
                        <p className="match__name">{record.fullName}</p>
                        <MetaList
                          items={[
                            record.rosterEmail ?? "No UP email on this list",
                            /* The whole number, in the format it is written
                               in. A masked tail is only what remains when the
                               stored value cannot be opened, and it says so
                               rather than passing itself off as complete. */
                            formatStudentNumber(studentNumber) ??
                              (studentNumberTail(record.studentNumberLast4)
                                ? `Student number ${studentNumberTail(record.studentNumberLast4)} — could not be read in full`
                                : "No student number on this list"),
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

/**
 * Whether the first bytes of an upload are a binary container rather than text.
 *
 * `PK\x03\x04` is the ZIP header, and an `.xlsx` is a ZIP. Checked because
 * this screen accepts CSV only: parsing a spreadsheet as text would produce a
 * page of nonsense rows and a stack of blocked lines, when the honest answer is
 * one sentence telling the reader to save it as CSV.
 *
 * Advisory only, and cheap: the parser refuses malformed content on its own.
 */
function looksBinary(head: string): boolean {
  return head.startsWith("PK\u0003\u0004") || head.includes("\u0000");
}

/**
 * What the import just did.
 *
 * This is the screen that replaced the preview, so it has to carry the two
 * things the preview was for and a summary cannot: WHICH lines were refused,
 * and WHO is no longer on the list. Everything here comes from what the commit
 * already persisted — the batch's stored summary and its own audit rows — so
 * nothing had to be added to the log to make it readable.
 */
function ImportOutcomePanel({
  outcome,
}: {
  outcome: NonNullable<Awaited<ReturnType<typeof getRosterImportOutcome>>>;
}) {
  const s = outcome.summary!;
  const added = s.created;
  return (
    <section className="notice">
      <div className="notice__head">
        <div>
          <h2>Class list imported</h2>
          <MetaList
            items={[
              outcome.sourceDescription,
              `${added} added`,
              `${s.enrolled} newly enrolled here`,
              s.reactivated > 0 ? `${s.reactivated} returned` : null,
              s.emailsLinked > 0 ? `${s.emailsLinked} UP email links set` : null,
              s.namesUpdated > 0 ? `${s.namesUpdated} names corrected` : null,
              s.unchanged > 0 ? `${s.unchanged} unchanged` : null,
            ]}
          />
        </div>
      </div>

      {s.errored > 0 && (
        <div className="notice__body">
          {/* Without this the fix that stops a mangled file dropping students
              would be silent: the import would quietly decline to deactivate
              anyone and the teacher would be left wondering why the person who
              left is still on the list. */}
          <Alert
            variant="warning"
            title={`${s.errored} ${s.errored === 1 ? "line could" : "lines could"} not be read`}
          >
            A line missing its student number or its name cannot say who it
            meant, so nobody was marked as dropped from this import — a student
            must never lose a class over one empty cell. Fix those lines and
            import the list again; anyone who has genuinely left is dropped
            then.
          </Alert>
        </div>
      )}

      {outcome.blocked.length > 0 && (
        <div className="notice__body">
          <Alert
            variant="warning"
            title={`${outcome.blocked.length} ${
              outcome.blocked.length === 1 ? "row was" : "rows were"
            } not imported`}
          >
            <p>
              Everything else was. Fix these lines in the file and import it
              again — re-importing the same people changes nothing for them.
            </p>
            <ul className="plain-list">
              {outcome.blocked.map((row, index) => (
                <li key={index}>
                  <strong>
                    {row.line === null ? "A row" : `Line ${row.line}`}
                  </strong>
                  {": "}
                  {row.reasons
                    .map(
                      (reason) =>
                        WARNING_LABELS[reason as RowWarning["code"]] ?? reason,
                    )
                  .join(" ")}
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      )}

      {outcome.deactivated.length > 0 && (
        <div className="notice__body stack-3">
          <p>
            <strong>
              {outcome.deactivated.length}{" "}
              {outcome.deactivated.length === 1 ? "student is" : "students are"}{" "}
              no longer on this list
            </strong>{" "}
            {outcome.deactivated.length === 1 ? "and is" : "and are"} marked as
            dropped. Nothing they wrote was deleted, and their participation
            record is intact.
          </p>
          <ul className="plain-list">
            {outcome.deactivated.map((row, index) => (
              <li key={index}>
                {row.name}
                {row.studentNumberLast4
                  ? ` · ${studentNumberTail(row.studentNumberLast4)}`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
