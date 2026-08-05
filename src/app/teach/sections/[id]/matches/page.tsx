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
} from "@/components/ui";
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
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id: sectionId } = await params;
  const { ok, error } = await searchParams;
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
            { label: `${course.code} · ${section.term}` },
            { label: "Account matches" },
          ]}
        />
      }
      title="Account matches"
    >
      <div className="stack-4">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        <Alert variant="info" title="Nothing is verified automatically">
          Class lists have no email address, so matching relies on names alone.
          A confident-looking suggestion can still be the wrong person, so every
          match waits for you and every decision is recorded.
        </Alert>

        {claims.length > 0 && (
          <section className="notice">
            <div className="notice__head">
              <div>
                <h2>Students asking to be linked</h2>
                <p>
                  {claims.length} request
                  {claims.length === 1 ? "" : "s"}. Each student typed their own
                  student number; compare the name on their school account with
                  the name on the class list before you confirm.
                </p>
              </div>
            </div>
            <ul className="data-list">
              {claims.map((row) => (
                <li key={row.claim.id}>
                  <span className="data-list__main">
                    <strong>{row.account.displayName}</strong>
                    <small>
                      {row.account.email} · typed a number ending{" "}
                      {row.claim.typedNumberLast4}
                    </small>
                    <small>
                      {row.record
                        ? `Class list says: ${row.record.fullName} (…${row.record.studentNumberLast4 ?? "?"})`
                        : "That number is not on any class list."}
                    </small>
                    <small className="muted">{row.explanation}</small>
                  </span>
                  <span className="row">
                    {row.record && (
                      <form action={confirmClaim} className="inline-form">
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
                        <button
                          className="button button--primary"
                          type="submit"
                        >
                          Confirm this is them
                        </button>
                      </form>
                    )}
                    <form action={rejectClaim} className="inline-form">
                      <input
                        type="hidden"
                        name="claimId"
                        value={row.claim.id}
                      />
                      <label
                        className="visually-hidden"
                        htmlFor={`reject-reason-${row.claim.id}`}
                      >
                        Reason for rejecting, staff-only
                      </label>
                      <input
                        id={`reject-reason-${row.claim.id}`}
                        className="field"
                        name="reason"
                        placeholder="Reason (staff-only)"
                        style={{ maxWidth: 220 }}
                      />
                      <button
                        className="button button--secondary"
                        type="submit"
                      >
                        Reject
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {byAccount.size === 0 ? (
          <EmptyState title="No accounts are waiting for confirmation">
            When a student signs in for the first time, their suggested match
            appears here.
          </EmptyState>
        ) : (
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
              <p>
                {linkedCount} of {roster.length} students have a confirmed
                account.
              </p>
            </div>
          </div>
          {roster.length === 0 ? (
            <div className="notice__body">
              <EmptyState
                title="No students imported yet"
                action={{
                  href: `/teach/sections/${sectionId}/import`,
                  label: "Import the class list",
                }}
              >
                Import the registrar CSV to populate this section.
              </EmptyState>
            </div>
          ) : (
            <ul className="data-list">
              {roster.map(({ record, enrollment, accountLinked }) => (
                <li key={record.id}>
                  <span className="data-list__main">
                    <strong>{record.fullName}</strong>
                    <small>
                      {/* Last 4 only on screen. The full number is revealed in
                          the audited exports, not on a page left open in a
                          lecture hall. */}
                      {record.studentNumberLast4
                        ? `…${record.studentNumberLast4}`
                        : "number not shown"}
                      {enrollment.rosterName !== record.fullName &&
                        ` · roster name: ${enrollment.rosterName}`}
                    </small>
                  </span>
                  <span className="row">
                    {enrollment.status === "deactivated" && (
                      <Stamp tone="neutral">Dropped</Stamp>
                    )}
                    {accountLinked ? (
                      <>
                        <Stamp tone="green">Account confirmed</Stamp>
                        {confirmedMatchByRecord.get(record.id) && (
                          <form action={unlink} className="inline-form">
                            <input
                              type="hidden"
                              name="matchId"
                              value={confirmedMatchByRecord.get(record.id)!}
                            />
                            <label
                              className="visually-hidden"
                              htmlFor={`unlink-reason-${record.id}`}
                            >
                              Why unlink this account?
                            </label>
                            <input
                              id={`unlink-reason-${record.id}`}
                              className="field"
                              name="reason"
                              required
                              placeholder="Why unlink?"
                              style={{ maxWidth: 200 }}
                            />
                            <button
                              className="button button--secondary"
                              type="submit"
                            >
                              Unlink
                            </button>
                          </form>
                        )}
                      </>
                    ) : (
                      <Stamp tone="amber">No account yet</Stamp>
                    )}
                  </span>
                </li>
              ))}
            </ul>
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
