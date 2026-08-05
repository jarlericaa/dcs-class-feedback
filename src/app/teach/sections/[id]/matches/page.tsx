import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { accountMatches, studentRecords, users } from "@/db/schema";
import { loadStaffSection } from "@/lib/staff-section";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionNav } from "@/components/layout/nav";
import {
  AccessDenied,
  Alert,
  Stamp,
  Breadcrumbs,
  EmptyState,
  MetaList,
} from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { RejectClaim } from "@/components/staff/reject-claim";
import {
  confirmMatch,
  listPendingMatchesForSection,
  rejectMatch,
  unlinkMatch,
} from "@/modules/identity/matching";
import { listSectionRoster } from "@/modules/catalog";
import {
  listClaimsForSection,
  resolveRosterClaim,
} from "@/modules/identity/claim";
import { toShellUser } from "@/lib/session";

/**
 * Teacher-confirm-all account matching (Open D2).
 *
 * The pipeline only ever proposes. Nothing binds a Google account to a roster
 * record without an explicit confirmation here, and every decision is audited.
 */
export default async function MatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    ok?: string;
    error?: string;
    q?: string;
    state?: string;
  }>;
}) {
  const { id: sectionId } = await params;
  const { ok, error, q, state } = await searchParams;
  const rosterState =
    state === "linked" || state === "unlinked" ? state : "all";
  const ctx = await loadStaffSection(sectionId, "viewStudentIdentities");
  if (!ctx.ok) {
    return (
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={[]}
        title="Account matches"
      >
        <AccessDenied what="student identities in this section" />
      </AppShell>
    );
  }
  const { user, access, section, course } = ctx;

  const pending = await listPendingMatchesForSection(user.id, sectionId);
  const roster = await listSectionRoster(user.id, sectionId);
  // Student-initiated claims (project-specs.md §6.1). A claim carries the name the
  // student signs in with, next to the roster name, so staff can compare them.
  const claims = await listClaimsForSection(user.id, sectionId);

  const userIds = [...new Set(pending.map((m) => m.userId))];
  const recordIds = [
    ...new Set(
      pending.map((m) => m.studentRecordId).filter((v): v is string => !!v),
    ),
  ];
  const userById = new Map(
    (userIds.length
      ? await db.query.users.findMany({ where: inArray(users.id, userIds) })
      : []
    ).map((u) => [u.id, u]),
  );
  const recordById = new Map(
    (recordIds.length
      ? await db.query.studentRecords.findMany({
          where: inArray(studentRecords.id, recordIds),
        })
      : []
    ).map((r) => [r.id, r]),
  );

  // Group by the signing-in account, so an ambiguous case reads as one
  // decision with several candidates rather than several unrelated rows.
  const byAccount = new Map<string, typeof pending>();
  for (const match of pending) {
    const list = byAccount.get(match.userId) ?? [];
    list.push(match);
    byAccount.set(match.userId, list);
  }

  async function confirm(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await confirmMatch(uid, String(formData.get("matchId")));
    } catch (err) {
      redirect(
        backTo(
          sectionId,
          err instanceof Error ? err.message : "Could not confirm",
          "error",
        ),
      );
    }
    revalidatePath(`/teach/sections/${sectionId}/matches`);
    redirect(
      backTo(
        sectionId,
        "Identity confirmed. The student can now use this section.",
      ),
    );
  }

  async function reject(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await rejectMatch(uid, String(formData.get("matchId")));
    } catch (err) {
      redirect(
        backTo(
          sectionId,
          err instanceof Error ? err.message : "Could not reject",
          "error",
        ),
      );
    }
    revalidatePath(`/teach/sections/${sectionId}/matches`);
    redirect(backTo(sectionId, "Suggestion rejected."));
  }

  async function confirmClaim(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await resolveRosterClaim(uid, String(formData.get("claimId")), {
        kind: "confirm",
        studentRecordId: String(formData.get("studentRecordId")),
      });
    } catch (err) {
      redirect(
        backTo(
          sectionId,
          err instanceof Error ? err.message : "Could not confirm the request",
          "error",
        ),
      );
    }
    revalidatePath(`/teach/sections/${sectionId}/matches`);
    redirect(
      backTo(sectionId, "Linked. The student can now use this section."),
    );
  }

  async function rejectClaim(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await resolveRosterClaim(uid, String(formData.get("claimId")), {
        kind: "reject",
        reason: String(formData.get("reason") ?? "Not this student"),
      });
    } catch (err) {
      redirect(
        backTo(
          sectionId,
          err instanceof Error ? err.message : "Could not reject the request",
          "error",
        ),
      );
    }
    revalidatePath(`/teach/sections/${sectionId}/matches`);
    redirect(backTo(sectionId, "Request rejected."));
  }

  async function unlink(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await unlinkMatch(
        uid,
        String(formData.get("matchId")),
        String(formData.get("reason") ?? ""),
      );
    } catch (err) {
      redirect(
        backTo(
          sectionId,
          err instanceof Error ? err.message : "Could not unlink",
          "error",
        ),
      );
    }
    revalidatePath(`/teach/sections/${sectionId}/matches`);
    redirect(
      backTo(
        sectionId,
        "Unlinked. Their submissions are kept, and either account can be linked again.",
      ),
    );
  }

  const linkedCount = roster.filter((r) => r.accountLinked).length;
  // The unlink control needs the confirmed match's id, which the roster read model
  // does not carry (it only reports whether an account is linked).
  const confirmedMatches = roster.length
    ? await db.query.accountMatches.findMany({
        where: and(
          inArray(
            accountMatches.studentRecordId,
            roster.map((r) => r.record.id),
          ),
          eq(accountMatches.state, "confirmed"),
        ),
      })
    : [];
  const confirmedMatchByRecord = new Map(
    confirmedMatches
      .filter((m) => m.studentRecordId)
      .map((m) => [m.studentRecordId!, m.id]),
  );
  // The linked account's email, so a row can name what it is linked TO rather
  // than only that it is linked. Read from the already-authorized match rows.
  const linkedUserIds = [
    ...new Set(confirmedMatches.map((m) => m.userId).filter(Boolean)),
  ];
  const linkedEmailByUser = new Map(
    (linkedUserIds.length
      ? await db.query.users.findMany({
          where: inArray(users.id, linkedUserIds),
        })
      : []
    ).map((u) => [u.id, u.email]),
  );
  const emailByRecord = new Map(
    confirmedMatches
      .filter((m) => m.studentRecordId)
      .map((m) => [
        m.studentRecordId!,
        linkedEmailByUser.get(m.userId) ?? null,
      ]),
  );

  /**
   * Search and state narrowing happen here, over an already-authorized read
   * model — the same pattern the review inbox uses for its category filter.
   * `q` matches the class-list name or the visible last four digits; it never
   * searches the full student number, which is not on screen anyway.
   */
  const needle = q?.trim().toLowerCase();
  const visibleRoster = roster
    .map((entry) => ({
      ...entry,
      linkedEmail: emailByRecord.get(entry.record.id) ?? null,
    }))
    .filter((entry) => {
      if (rosterState === "linked" && !entry.accountLinked) return false;
      if (rosterState === "unlinked" && entry.accountLinked) return false;
      if (!needle) return true;
      return (
        entry.record.fullName.toLowerCase().includes(needle) ||
        (entry.record.studentNumberLast4 ?? "").includes(needle) ||
        entry.enrollment.rosterName.toLowerCase().includes(needle)
      );
    });

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={staffSectionNav(
        access,
        `/teach/sections/${sectionId}/matches`,
      )}
      contextLabel={section.title}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/", label: "Overview" },
            { label: course.code },
            { label: "Account matches" },
          ]}
        />
      }
      title="Account matches"
    >
      <div className="stack-4">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        {/* The page used to open with a three-line "Nothing is verified
            automatically" alert. Every row here already offers "This is them"
            and "Not this student", so the sentence that actually prevents a
            wrong match now sits on the panel that has those buttons. */}
        {claims.length > 0 && (
          <section className="notice">
            <div className="notice__head">
              <div>
                <h2>Students asking to be linked</h2>
              </div>
            </div>
            <ul className="match-list">
              {claims.map((row) => (
                <li className="match" key={row.claim.id}>
                  {/* Two labelled sides: who is asking, and who the class list
                      says that number belongs to. The teacher compares names
                      rather than decoding a sentence. */}
                  <div className="match__sides">
                    <div className="match__side">
                      <p className="match__label">School account</p>
                      <p className="match__name">{row.account.displayName}</p>
                      <p className="meta">{row.account.email}</p>
                    </div>
                    <div className="match__side">
                      <p className="match__label">Student number entered</p>
                      <p className="match__name">
                        Ending in {row.claim.typedNumberLast4}
                      </p>
                      <p className="meta">
                        {row.record
                          ? `Class list: ${row.record.fullName}`
                          : "No matching student number in this section"}
                      </p>
                    </div>
                  </div>

                  <div className="match__actions">
                    {row.record ? (
                      <>
                        <Dialog
                          variant="primary"
                          className="button--small"
                          label="Confirm match"
                          title="Confirm this is the same person?"
                          description="Confirm only when the names match. A matching student number is not proof of identity."
                        >
                          <form action={confirmClaim}>
                            <input
                              type="hidden"
                              name="claimId"
                              value={row.claim.id}
                            />
                            <input
                              type="hidden"
                              name="studentRecordId"
                              value={row.record.id}
                            />
                            <dl className="qa-pairs">
                              <div className="qa-pairs__row">
                                <dt>School account</dt>
                                <dd>{row.account.displayName}</dd>
                              </div>
                              <div className="qa-pairs__row">
                                <dt>Class list</dt>
                                <dd>{row.record.fullName}</dd>
                              </div>
                            </dl>
                            <div className="row">
                              <button
                                className="button button--primary"
                                type="submit"
                              >
                                Confirm match
                              </button>
                            </div>
                          </form>
                        </Dialog>
                        <RejectClaim
                          action={rejectClaim}
                          claimId={row.claim.id}
                          label="Not this student"
                        />
                      </>
                    ) : (
                      <RejectClaim
                        action={rejectClaim}
                        claimId={row.claim.id}
                        label="Reject request"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Absence needs no panel. This used to render an empty state BETWEEN
            two populated panels, which made a page full of content read as
            empty. */}
        {byAccount.size > 0 && (
          <section className="notice">
            <div className="notice__head">
              <div>
                <h2>Waiting for your decision</h2>
                <p>
                  {byAccount.size} account{byAccount.size === 1 ? "" : "s"} to
                  review.
                </p>
              </div>
            </div>
            <div className="notice__body stack-4">
              {[...byAccount.entries()].map(([accountId, matches]) => {
                const account = userById.get(accountId);
                const ambiguous = matches.length > 1;
                return (
                  <article className="notice notice--pad" key={accountId}>
                    <div
                      className="row"
                      style={{ justifyContent: "space-between" }}
                    >
                      <div>
                        <p className="label">Signed-in account</p>
                        <h3 className="panel-title">
                          {account?.displayName ?? "Unknown"}
                        </h3>
                        <p className="muted small" style={{ margin: 0 }}>
                          {account?.email}
                        </p>
                      </div>
                      {ambiguous ? (
                        <Stamp tone="red">
                          Ambiguous · {matches.length} possible students
                        </Stamp>
                      ) : (
                        <Stamp tone="amber">Suggested match</Stamp>
                      )}
                    </div>

                    {ambiguous && (
                      <p className="muted small" style={{ marginTop: 10 }}>
                        Several students on the class list have a similar name.
                        Pick the right one, or reject them all and correct the
                        roster.
                      </p>
                    )}

                    <ul className="data-list" style={{ marginTop: 12 }}>
                      {matches.map((match) => {
                        const record = match.studentRecordId
                          ? recordById.get(match.studentRecordId)
                          : null;
                        const score = (
                          match.confidence as { score?: number } | null
                        )?.score;
                        return (
                          <li key={match.id}>
                            <span className="data-list__main">
                              <strong>
                                {record
                                  ? `${record.fullName} (${record.studentNumber})`
                                  : "Unknown roster record"}
                              </strong>
                              <small>
                                {match.state}
                                {score !== undefined &&
                                  ` · name similarity ${(score * 100).toFixed(0)}%`}
                              </small>
                            </span>
                            <span className="row">
                              <form action={confirm} className="inline-form">
                                <input
                                  type="hidden"
                                  name="matchId"
                                  value={match.id}
                                />
                                <button
                                  className="button button--primary button--small"
                                  type="submit"
                                >
                                  This is them
                                </button>
                              </form>
                              <form action={reject} className="inline-form">
                                <input
                                  type="hidden"
                                  name="matchId"
                                  value={match.id}
                                />
                                <button
                                  className="button button--quiet button--small"
                                  type="submit"
                                >
                                  Not this student
                                </button>
                              </form>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="notice">
          <div className="notice__head">
            <div>
              <h2>Class list</h2>
            </div>
            {/* Labelled figures, not a lone sentence, and never colour alone. */}
            {roster.length > 0 && (
              <div className="row">
                <span className="tally">
                  <strong>{linkedCount}</strong> linked
                </span>
                <span className="tally">
                  <strong>{roster.length - linkedCount}</strong> not linked
                </span>
                {claims.length > 0 && (
                  <span className="tally tally--attention">
                    <strong>{claims.length}</strong> pending
                  </span>
                )}
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
                Import the class list first, then link accounts here.
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
                action={`/teach/sections/${sectionId}/matches`}
              >
                <label className="visually-hidden" htmlFor="roster-q">
                  Search the class list
                </label>
                <input
                  id="roster-q"
                  className="field"
                  name="q"
                  type="search"
                  placeholder="Name or student number"
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
                  <option value="linked">Linked</option>
                  <option value="unlinked">Not linked</option>
                </select>
                <button className="button button--secondary" type="submit">
                  Search
                </button>
              </form>

              {visibleRoster.length === 0 ? (
                <div className="notice__body">
                  <p className="muted">
                    No students match. Try a different name or number.
                  </p>
                </div>
              ) : (
                <ul className="match-list">
                  {visibleRoster.map(({ record, enrollment, accountLinked, linkedEmail }) => (
                    <li className="roster-row" key={record.id}>
                      <div className="roster-row__main">
                        <p className="match__name">{record.fullName}</p>
                        <MetaList
                          items={[
                            record.studentNumberLast4
                              ? `Student number ending ${record.studentNumberLast4}`
                              : "Student number not shown",
                            linkedEmail ? `Linked account: ${linkedEmail}` : null,
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
                        <Stamp tone={accountLinked ? "green" : "neutral"}>
                          {accountLinked ? "Linked" : "Not linked"}
                        </Stamp>
                        {accountLinked && confirmedMatchByRecord.get(record.id) && (
                          <Dialog
                            variant="quiet"
                            className="button--small"
                            label="Unlink"
                            title="Unlink this account?"
                            description="Their submissions are kept, and either account can be linked again."
                          >
                            <form action={unlink}>
                              <input
                                type="hidden"
                                name="matchId"
                                value={confirmedMatchByRecord.get(record.id)!}
                              />
                              <div className="field-row">
                                <label htmlFor={`unlink-${record.id}`}>
                                  Why unlink?{" "}
                                  <span className="required-mark">Required</span>
                                </label>
                                <input
                                  id={`unlink-${record.id}`}
                                  className="field"
                                  name="reason"
                                  required
                                />
                                <span className="helper-text">
                                  Staff only. Recorded in the audit history.
                                </span>
                              </div>
                              <div className="row">
                                <button
                                  className="button button--danger"
                                  type="submit"
                                >
                                  Unlink account
                                </button>
                              </div>
                            </form>
                          </Dialog>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}

/**
 * Module scope on purpose: a server action serializes everything it closes
 * over, so it may not capture a helper defined inside the page component.
 */
function backTo(
  sectionId: string,
  message: string,
  kind: "ok" | "error" = "ok",
): string {
  return `/teach/sections/${sectionId}/matches?${kind}=${encodeURIComponent(message)}`;
}
