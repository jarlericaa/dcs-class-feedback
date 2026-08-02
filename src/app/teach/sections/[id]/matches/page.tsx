import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { studentRecords, users } from "@/db/schema";
import { loadStaffSection } from "@/lib/staff-section";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionNav } from "@/components/layout/nav";
import {
  AccessDenied,
  Alert,
  Badge,
  Breadcrumbs,
  EmptyState,
} from "@/components/ui";
import {
  confirmMatch,
  listPendingMatchesForSection,
  rejectMatch,
} from "@/modules/identity/matching";
import { listSectionRoster } from "@/modules/catalog";
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

  const linkedCount = roster.filter((r) => r.accountLinked).length;

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
      eyebrow="Staff only"
      title="Account matches"
      description="Confirm that each signed-in account belongs to the student on your class list."
    >
      <div className="stack-gap">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        <Alert variant="info" title="Nothing is verified automatically">
          Class lists have no email address, so matching relies on names alone.
          A confident-looking suggestion can still be the wrong person, so every
          match waits for you and every decision is recorded.
        </Alert>

        {byAccount.size === 0 ? (
          <EmptyState title="No accounts are waiting for confirmation">
            When a student signs in for the first time, their suggested match
            appears here.
          </EmptyState>
        ) : (
          <section className="card">
            <div className="card__header">
              <div>
                <h2>Waiting for your decision</h2>
                <p>
                  {byAccount.size} account{byAccount.size === 1 ? "" : "s"} to
                  review.
                </p>
              </div>
            </div>
            <div className="card__body stack-gap">
              {[...byAccount.entries()].map(([accountId, matches]) => {
                const account = userById.get(accountId);
                const ambiguous = matches.length > 1;
                return (
                  <article className="card card--padded" key={accountId}>
                    <div
                      className="row-gap"
                      style={{ justifyContent: "space-between" }}
                    >
                      <div>
                        <p className="section-kicker">Signed-in account</p>
                        <h3 style={{ margin: "2px 0 0", fontSize: 16 }}>
                          {account?.displayName ?? "Unknown"}
                        </h3>
                        <p className="muted small" style={{ margin: 0 }}>
                          {account?.email}
                        </p>
                      </div>
                      {ambiguous ? (
                        <Badge tone="red">
                          Ambiguous · {matches.length} possible students
                        </Badge>
                      ) : (
                        <Badge tone="amber">Suggested match</Badge>
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
                            <span className="row-gap">
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

        <section className="card">
          <div className="card__header">
            <div>
              <h2>Class list</h2>
              <p>
                {linkedCount} of {roster.length} students have a confirmed
                account.
              </p>
            </div>
          </div>
          {roster.length === 0 ? (
            <div className="card__body">
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
                      {record.studentNumber}
                      {enrollment.rosterName !== record.fullName &&
                        ` · roster name: ${enrollment.rosterName}`}
                    </small>
                  </span>
                  <span className="row-gap">
                    {enrollment.status === "deactivated" && (
                      <Badge tone="neutral">Dropped</Badge>
                    )}
                    {accountLinked ? (
                      <Badge tone="green">Account confirmed</Badge>
                    ) : (
                      <Badge tone="amber">No account yet</Badge>
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
