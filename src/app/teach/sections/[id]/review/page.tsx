import Link from "next/link";
import { toShellUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { loadStaffSection } from "@/lib/staff-section";
import { formatDateTime } from "@/lib/datetime";
import { staffSectionNav, type NavGroup } from "@/components/layout/nav";
import {
  DayGroupHeading,
  ListPane,
  WorkspaceShell,
} from "@/components/layout/workspace-shell";
import {
  categoryShape,
  categoryShortLabel,
  groupByDay,
  QUESTION_CATEGORIES,
  shortAgo,
} from "@/lib/threads";
import {
  AccessDenied,
  Alert,
  Category,
  Quote,
  Stamp,
  StripLabel,
  ValidityBadge,
} from "@/components/ui";
import { CategoryMark, IconPrivate, IconPublic } from "@/components/ui/icons";
import { PublicAnswerComposer } from "@/components/staff/public-answer-composer";
import {
  confirmFlag,
  createPrivateResponse,
  flagSubmission,
  getReviewQueue,
  getSubmissionDetail,
  getValidityHistory,
  invalidateSubmission,
  rejectFlag,
  restoreSubmission,
  type ReviewFilter,
} from "@/modules/review";
import {
  AnonymityCheckRequired,
  anonymityWarnings,
  draftPublicAnswer,
  publishNow,
} from "@/modules/publishing";

/**
 * Staff review inbox. Queue on the left, the selected submission on the right,
 * collapsing to a single column below 860px.
 *
 * Everything shown here comes from getReviewQueue/getSubmissionDetail, which
 * mask student identity in the DATA when the actor lacks
 * view_student_identities. Nothing on this page is student-visible: validity,
 * review state and drafts all stay inside it.
 */

const FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "needs_review", label: "Needs review" },
  { key: "answered", label: "Answered" },
  { key: "invalid", label: "Marked invalid" },
];

/**
 * Internal validity reasons. These are the staff vocabulary and are NEVER shown
 * to a student; when a decision removes credit, the student sees only the
 * separate `studentVisibleReason` a human types.
 */
const INVALID_REASONS = [
  { value: "empty_or_meaningless", label: "Empty or meaningless" },
  { value: "spam", label: "Spam" },
  { value: "abusive_content", label: "Abusive content" },
  { value: "irrelevant", label: "Completely irrelevant" },
  { value: "bad_faith_credit_attempt", label: "Bad-faith credit attempt" },
];

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    selected?: string;
    filter?: string;
    cycle?: string;
    category?: string;
    q?: string;
    warn?: string;
    error?: string;
    ok?: string;
  }>;
}) {
  const { id: sectionId } = await params;
  const sp = await searchParams;
  const ctx = await loadStaffSection(sectionId, "reviewResponses");
  if (!ctx.ok) {
    return (
      <WorkspaceShell
        user={toShellUser(ctx.user)}
        contextTitle="Class Feedback"
      >
        <AccessDenied what="this section's submissions" />
      </WorkspaceShell>
    );
  }
  const { user, access, section, course, can } = ctx;

  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ??
    "all") as ReviewFilter;
  const { rows, counts, cycles, canSeeIdentities } = await getReviewQueue(
    user.id,
    sectionId,
    { filter, cycleId: sp.cycle },
  );

  // Category and free-text narrowing happen here rather than in the service:
  // both are presentation filters over an already-authorized result set.
  const term = sp.q?.trim().toLowerCase();
  const searchRows = rows.filter((row) => {
    if (
      term &&
      !row.items.some((i) =>
        i.item.originalText.toLowerCase().includes(term),
      ) &&
      !(row.student?.fullName.toLowerCase().includes(term) ?? false)
    ) {
      return false;
    }
    return true;
  });
  const visibleRows = searchRows.filter(
    (row) =>
      !sp.category || row.items.some((i) => i.item.category === sp.category),
  );
  const categoryCounts = new Map(
    QUESTION_CATEGORIES.map((category) => [category.slug as string, 0]),
  );
  for (const row of searchRows) {
    for (const item of row.items) {
      if (categoryCounts.has(item.item.category)) {
        categoryCounts.set(
          item.item.category,
          categoryCounts.get(item.item.category)! + 1,
        );
      }
    }
  }
  // getReviewQueue returns only `submitted` and `locked` responses, so every row
  // here has a submittedAt; the read model's type is nullable because a draft
  // (never in this queue) has none.
  const submittedAt = (row: (typeof visibleRows)[number]) =>
    row.response.submittedAt ?? new Date();
  const groups = groupByDay(
    visibleRows,
    submittedAt,
    new Date(),
    section.timezone,
  );

  const selectedRow =
    visibleRows.find((r) => r.response.id === sp.selected) ?? visibleRows[0];
  const detail = selectedRow
    ? await getSubmissionDetail(user.id, selectedRow.response.id)
    : null;
  const validityHistory = selectedRow
    ? await getValidityHistory(user.id, selectedRow.response.id)
    : [];
  // Only an instructor may finalize or reverse validity. This decides which
  // controls are rendered; the service layer is the authorization backstop.
  const isInstructor = access.staff?.isInstructor ?? false;

  const queryFor = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      filter,
      cycle: sp.cycle,
      category: sp.category,
      q: sp.q,
      selected: sp.selected,
      ...patch,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    return `/teach/sections/${sectionId}/review?${next.toString()}`;
  };

  // --- server actions ------------------------------------------------------

  // A student assistant may FLAG; only an instructor may finalize or reverse a
  // validity decision. The service layer re-checks every one of these.
  async function flag(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await flagSubmission(uid, String(formData.get("responseId")), {
      reason: String(formData.get("reason")) as "spam",
      note: String(formData.get("note") ?? "") || undefined,
    });
    revalidatePath(`/teach/sections/${sectionId}/review`);
  }

  async function confirmFlagged(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await confirmFlag(uid, String(formData.get("responseId")), {
      reason: String(formData.get("reason")) as "spam",
      studentVisibleReason: String(formData.get("studentVisibleReason") ?? ""),
      note: String(formData.get("note") ?? "") || undefined,
    });
    revalidatePath(`/teach/sections/${sectionId}/review`);
  }

  async function dismissFlag(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await rejectFlag(uid, String(formData.get("responseId")), {
      note: String(formData.get("note") ?? "") || undefined,
    });
    revalidatePath(`/teach/sections/${sectionId}/review`);
  }

  async function invalidate(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await invalidateSubmission(uid, String(formData.get("responseId")), {
      reason: String(formData.get("reason")) as "spam",
      studentVisibleReason: String(formData.get("studentVisibleReason") ?? ""),
      note: String(formData.get("note") ?? "") || undefined,
    });
    revalidatePath(`/teach/sections/${sectionId}/review`);
  }

  async function restoreValid(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await restoreSubmission(uid, String(formData.get("responseId")));
    revalidatePath(`/teach/sections/${sectionId}/review`);
  }

  async function sendPrivate(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const body = String(formData.get("body") ?? "").trim();
    const selected = String(formData.get("selected") ?? "");
    if (!body) {
      redirect(
        `/teach/sections/${sectionId}/review?selected=${selected}&error=${encodeURIComponent(
          "A private reply cannot be empty.",
        )}`,
      );
    }
    await createPrivateResponse(uid, String(formData.get("itemId")), body);
    revalidatePath(`/teach/sections/${sectionId}/review`);
    redirect(
      `/teach/sections/${sectionId}/review?selected=${selected}&ok=${encodeURIComponent(
        "Private reply sent. Only this student and the teaching team can see it.",
      )}`,
    );
  }

  async function draftOrPublish(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const itemId = String(formData.get("itemId"));
    const selected = String(formData.get("selected") ?? "");
    const publicQuestionText = String(
      formData.get("publicQuestion") ?? "",
    ).trim();
    const answerBody = String(formData.get("answerBody") ?? "").trim();
    const intent = String(formData.get("intent") ?? "draft");

    const fail = (message: string) =>
      redirect(
        `/teach/sections/${sectionId}/review?selected=${selected}&error=${encodeURIComponent(message)}`,
      );

    if (!publicQuestionText)
      fail("Write the public version of the question first.");
    if (intent === "publish" && !answerBody) {
      fail("An answer is required before publishing.");
    }

    const acknowledged = formData.get("acknowledged") === "yes";

    // Check anonymity BEFORE writing anything. publishNow enforces the same
    // rule against the persisted row and stays the real backstop, but reaching
    // it with an unacknowledged draft would leave that draft (and its source
    // link) behind on every rejected attempt, so a staff member correcting
    // their wording would pile up duplicates.
    if (intent === "publish" && !acknowledged) {
      const warnings = anonymityWarnings(publicQuestionText, 1);
      if (warnings.length > 0) {
        redirect(
          `/teach/sections/${sectionId}/review?selected=${selected}&warn=${encodeURIComponent(
            warnings.join(" | "),
          )}`,
        );
      }
    }

    const answer = await draftPublicAnswer(uid, {
      sectionId,
      itemIds: [itemId],
      publicQuestionText,
      answerBody: answerBody || undefined,
    });
    if (intent === "publish") {
      try {
        await publishNow(uid, answer.id, {
          anonymityAcknowledged: acknowledged,
        });
      } catch (err) {
        if (err instanceof AnonymityCheckRequired) {
          // The draft is already saved, so send the user to it rather than
          // leaving an invisible orphan behind.
          redirect(
            `/teach/sections/${sectionId}/publications?warn=${encodeURIComponent(
              err.warnings.join(" | "),
            )}`,
          );
        }
        throw err;
      }
    }
    revalidatePath(`/teach/sections/${sectionId}/review`);
    redirect(
      `/teach/sections/${sectionId}/review?selected=${selected}&ok=${encodeURIComponent(
        intent === "publish"
          ? "Published to this section, anonymously."
          : "Saved as a draft. Finish it in the publication queue.",
      )}`,
    );
  }

  // --- render --------------------------------------------------------------

  const weekGroup: NavGroup[] =
    cycles.length > 0
      ? [
          {
            label: "Week",
            items: [
              {
                href: queryFor({ cycle: undefined, selected: undefined }),
                label: "All weeks",
                icon: "week" as const,
                active: !sp.cycle,
              },
              ...cycles.slice(0, 12).map((cycle) => ({
                href: queryFor({ cycle: cycle.id, selected: undefined }),
                label: `Week ${cycle.cycleIndex}${cycle.state === "open" ? " · open" : ""}`,
                icon: "week" as const,
                active: sp.cycle === cycle.id,
              })),
            ],
          },
        ]
      : [];

  return (
    <WorkspaceShell
      user={toShellUser(user)}
      contextTitle={`${course.code} ${section.term} · Review inbox`}
      workspaceLabel="Staff workspace"
      categories={[
        {
          slug: "all",
          label: "All topics",
          shape: "circle",
          count: searchRows.reduce((count, row) => count + row.items.length, 0),
          href: queryFor({ category: undefined, selected: undefined }),
          active: !sp.category,
        },
        ...QUESTION_CATEGORIES.map((c) => ({
          slug: c.slug,
          label: c.label,
          shape: c.shape,
          count: categoryCounts.get(c.slug) ?? 0,
          href: queryFor({ category: c.slug, selected: undefined }),
          clearHref: queryFor({ category: undefined, selected: undefined }),
          active: sp.category === c.slug,
        })),
      ]}
      navGroups={[
        ...staffSectionNav(
          access,
          `/teach/sections/${sectionId}/review`,
          counts,
        ),
        ...weekGroup,
      ]}
      railFooter={
        <p>
          Everything in this workspace is staff-only. Students never see
          validity, drafts or internal notes.
        </p>
      }
      selection={{
        active: !!sp.selected,
        backHref: queryFor({ selected: undefined }),
      }}
      listPane={
        <ListPane
          label="Submissions"
          hiddenOnMobile={!!sp.selected}
          searchAction={`/teach/sections/${sectionId}/review`}
          searchName="q"
          searchValue={sp.q}
          searchPlaceholder="Search submissions"
          hiddenFields={{ filter, cycle: sp.cycle, category: sp.category }}
          filter={{
            current: filter,
            label: "Everything",
            options: FILTERS.map((f) => ({
              key: f.key,
              label:
                f.key === "all"
                  ? `Everything (${counts.total})`
                  : f.key === "needs_review"
                    ? `Needs review (${counts.needsReview})`
                    : f.key === "answered"
                      ? `Answered (${counts.answered})`
                      : `Marked invalid (${counts.invalid})`,
              href: queryFor({ filter: f.key, selected: undefined }),
            })),
          }}
        >
          {visibleRows.length === 0 ? (
            <p className="ws-list__note">
              {counts.total === 0
                ? "No submissions yet. They arrive as students send this week's form."
                : "Nothing matches this filter."}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <DayGroupHeading>{group.label}</DayGroupHeading>
                {group.rows.map((row) => {
                  const isActive = selectedRow?.response.id === row.response.id;
                  const firstItem = row.items[0]?.item;
                  const needsReview = !row.answered && row.items.length > 0;
                  return (
                    <Link
                      key={row.response.id}
                      className={`ws-row ${isActive ? "ws-row--active" : ""} ${
                        needsReview ? "ws-row--unread" : ""
                      }`}
                      href={queryFor({ selected: row.response.id })}
                      aria-current={isActive ? "true" : undefined}
                    >
                      <span className="ws-row__top">
                        <span className="ws-row__title">
                          {firstItem
                            ? truncate(firstItem.originalText, 80)
                            : "Form answers only"}
                        </span>
                        <span className="ws-row__flags">
                          {row.response.validity === "invalid" && (
                            <Stamp tone="red">Invalid</Stamp>
                          )}
                          {row.answered && <Stamp tone="green">Answered</Stamp>}
                          {needsReview && <Stamp tone="amber">New</Stamp>}
                        </span>
                      </span>
                      <span className="ws-row__meta">
                        {firstItem && (
                          <span className="category">
                            <CategoryMark
                              shape={categoryShape(firstItem.category)}
                            />
                            {categoryShortLabel(firstItem.category)}
                          </span>
                        )}
                        <span>
                          {row.student
                            ? row.student.fullName
                            : "Identity hidden"}
                        </span>
                        <span>Week {row.cycleIndex}</span>
                        <span>{shortAgo(submittedAt(row))}</span>
                        {row.items.length > 1 && (
                          <span>{row.items.length} items</span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))
          )}
        </ListPane>
      }
    >
      <div className="stack-4" style={{ marginBottom: "var(--s5)" }}>
        {sp.ok && <Alert variant="success">{sp.ok}</Alert>}
        {sp.error && <Alert variant="error">{sp.error}</Alert>}
        {sp.warn && (
          <Alert variant="warning" title="Check the wording before publishing">
            <ul>
              {sp.warn.split(" | ").map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
            Tick &ldquo;I have checked the public wording&rdquo; to publish
            anyway.
          </Alert>
        )}
        {!canSeeIdentities && (
          <Alert variant="info" title="Identities are hidden for your account">
            You can review and respond, but you have not been granted &ldquo;see
            student identities&rdquo; on this section.
          </Alert>
        )}
      </div>

      {!selectedRow || !detail ? (
        <div className="ws-empty-detail">
          <p>
            {counts.total === 0
              ? "No submissions yet. They arrive as students send this week's form."
              : "Choose a submission from the list to read it and respond."}
          </p>
        </div>
      ) : (
        <article>
          <header className="submission">
            <h1 className="object-title">
              {selectedRow.student
                ? selectedRow.student.fullName
                : "Identity hidden"}
              <span className="object-title__sub">
                {" "}
                · week {selectedRow.cycleIndex}
              </span>
            </h1>
            <p className="submission__meta">
              {selectedRow.student && (
                <span className="ident">
                  {selectedRow.student.studentNumber}
                </span>
              )}
              <span>
                {selectedRow.response.submittedAt
                  ? `Submitted ${formatDateTime(
                      selectedRow.response.submittedAt,
                      section.timezone,
                    )}`
                  : "Draft — not submitted yet"}
              </span>
              <ValidityBadge
                validity={
                  selectedRow.response.validity as
                    "valid" | "flagged" | "invalid"
                }
              />
            </p>

            {(can("markValidity") || can("flagValidity")) && (
              <div className="validity" style={{ marginTop: "var(--s4)" }}>
                {/* A flag is an internal state. A student is never told one
                    exists, and never sees the internal reason — only the
                    student-visible sentence an instructor types. */}
                {selectedRow.response.validity === "valid" &&
                  can("flagValidity") &&
                  !isInstructor && (
                    <form action={flag} className="inline-form">
                      <input
                        type="hidden"
                        name="responseId"
                        value={selectedRow.response.id}
                      />
                      <label className="visually-hidden" htmlFor="flag-reason">
                        Reason for flagging
                      </label>
                      <select
                        id="flag-reason"
                        className="select-field"
                        name="reason"
                        defaultValue="empty_or_meaningless"
                        style={{ maxWidth: 240 }}
                      >
                        {INVALID_REASONS.map((reason) => (
                          <option key={reason.value} value={reason.value}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                      <label className="visually-hidden" htmlFor="flag-note">
                        Note for the instructor
                      </label>
                      <input
                        id="flag-note"
                        className="field"
                        name="note"
                        placeholder="Note for the instructor (optional)"
                        style={{ maxWidth: 260 }}
                      />
                      <button
                        className="button button--secondary button--small"
                        type="submit"
                      >
                        Flag for the instructor
                      </button>
                      <span className="meta">
                        Keeps this week&apos;s credit for now. The student is
                        never told a flag exists.
                      </span>
                    </form>
                  )}

                {isInstructor &&
                  can("markValidity") &&
                  selectedRow.response.validity === "flagged" && (
                    <div className="stack-3">
                      {(() => {
                        const flagEvent = [...validityHistory]
                          .reverse()
                          .find((event) => event.action === "flag");
                        return flagEvent ? (
                          <Alert
                            variant="warning"
                            title="Flagged by a student assistant"
                          >
                            {flagEvent.actorName}:{" "}
                            {(flagEvent.reason ?? "no reason given").replace(
                              /_/g,
                              " ",
                            )}
                            {flagEvent.staffNote
                              ? ` — ${flagEvent.staffNote}`
                              : ""}
                          </Alert>
                        ) : null;
                      })()}
                      <form action={confirmFlagged} className="inline-form">
                        <input
                          type="hidden"
                          name="responseId"
                          value={selectedRow.response.id}
                        />
                        <label
                          className="visually-hidden"
                          htmlFor="confirm-reason"
                        >
                          Internal reason for confirming the flag
                        </label>
                        <select
                          id="confirm-reason"
                          className="select-field"
                          name="reason"
                          defaultValue="empty_or_meaningless"
                          style={{ maxWidth: 240 }}
                        >
                          {INVALID_REASONS.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </select>
                        <label
                          className="visually-hidden"
                          htmlFor="confirm-student-reason"
                        >
                          Reason the student will see
                        </label>
                        <input
                          id="confirm-student-reason"
                          className="field"
                          name="studentVisibleReason"
                          required
                          placeholder="Reason the student will see"
                          style={{ maxWidth: 300 }}
                        />
                        <button
                          className="button button--danger button--small"
                          type="submit"
                        >
                          Confirm — remove credit
                        </button>
                      </form>
                      <form action={dismissFlag} className="inline-form">
                        <input
                          type="hidden"
                          name="responseId"
                          value={selectedRow.response.id}
                        />
                        <button
                          className="button button--secondary button--small"
                          type="submit"
                        >
                          Dismiss the flag — keep the credit
                        </button>
                      </form>
                    </div>
                  )}

                {isInstructor &&
                  can("markValidity") &&
                  selectedRow.response.validity === "valid" && (
                    <form action={invalidate} className="inline-form">
                      <input
                        type="hidden"
                        name="responseId"
                        value={selectedRow.response.id}
                      />
                      <label
                        className="visually-hidden"
                        htmlFor="invalid-reason"
                      >
                        Internal reason for removing credit
                      </label>
                      <select
                        id="invalid-reason"
                        className="select-field"
                        name="reason"
                        defaultValue="empty_or_meaningless"
                        style={{ maxWidth: 240 }}
                      >
                        {INVALID_REASONS.map((reason) => (
                          <option key={reason.value} value={reason.value}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                      <label
                        className="visually-hidden"
                        htmlFor="invalid-student-reason"
                      >
                        Reason the student will see
                      </label>
                      <input
                        id="invalid-student-reason"
                        className="field"
                        name="studentVisibleReason"
                        required
                        placeholder="Reason the student will see"
                        style={{ maxWidth: 280 }}
                      />
                      <button
                        className="button button--danger button--small"
                        type="submit"
                      >
                        Remove participation credit
                      </button>
                      <span className="meta">
                        Audited and reversible. The student sees the sentence
                        you type, never the internal reason or note.
                      </span>
                    </form>
                  )}

                {isInstructor &&
                  can("markValidity") &&
                  selectedRow.response.validity === "invalid" && (
                    <form action={restoreValid} className="inline-form">
                      <input
                        type="hidden"
                        name="responseId"
                        value={selectedRow.response.id}
                      />
                      <button
                        className="button button--secondary button--small"
                        type="submit"
                      >
                        Restore participation credit
                      </button>
                      <span className="meta">
                        Reason on record:{" "}
                        {(
                          selectedRow.response.invalidationReason ?? ""
                        ).replace(/_/g, " ")}
                      </span>
                    </form>
                  )}

                {validityHistory.length > 0 && (
                  <details className="validity__history">
                    <summary className="meta">
                      Validity history ({validityHistory.length})
                    </summary>
                    <ul className="data-list">
                      {validityHistory.map((event) => (
                        <li key={event.id}>
                          <span className="data-list__main">
                            <strong>
                              {event.priorValidity} &rarr; {event.newValidity}
                            </strong>
                            <small>
                              {event.actorName} ({event.actorRole}) ·{" "}
                              {formatDateTime(
                                event.createdAt,
                                section.timezone,
                              )}
                              {event.reason
                                ? ` · ${event.reason.replace(/_/g, " ")}`
                                : ""}
                              {event.staffNote ? ` · ${event.staffNote}` : ""}
                            </small>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </header>

          {detail.answers.length > 0 && (
            <section style={{ marginTop: "var(--s5)" }}>
              <StripLabel>Form answers</StripLabel>
              <dl className="answers">
                {detail.answers.map((answer, index) => (
                  <div key={index}>
                    <dt>{answer.prompt}</dt>
                    <dd>{renderAnswer(answer)}</dd>
                  </div>
                ))}
              </dl>
              {detail.unansweredCount > 0 && (
                <p className="meta" style={{ marginTop: "var(--s3)" }}>
                  {detail.unansweredCount} optional question
                  {detail.unansweredCount === 1 ? "" : "s"} left blank.
                </p>
              )}
            </section>
          )}

          {selectedRow.items.length === 0 ? (
            <div style={{ marginTop: "var(--s5)" }}>
              <Alert variant="info">
                This student answered the form questions but did not add a
                question or feedback of their own. There is nothing to answer.
              </Alert>
            </div>
          ) : (
            <section style={{ marginTop: "var(--s6)" }}>
              <StripLabel count={`${selectedRow.items.length}`}>
                {selectedRow.items.length === 1
                  ? "Written by the student"
                  : "Written by the student"}
              </StripLabel>

              {selectedRow.items.map(
                ({ item, privateResponses, publicAnswers }) => {
                  const events = [
                    ...privateResponses.map((response) => ({
                      kind: "private" as const,
                      at: response.createdAt,
                      response,
                    })),
                    ...publicAnswers.map((answer) => ({
                      kind: "public" as const,
                      at: answer.publishedAt ?? answer.createdAt,
                      answer,
                    })),
                  ].sort((a, b) => a.at.getTime() - b.at.getTime());

                  return (
                    <div className="item" key={item.id}>
                      <div className="item__head">
                        <span className="row">
                          <Category value={item.category} />
                          <span className="meta">{item.submissionType}</span>
                        </span>
                        <Stamp
                          tone={
                            item.reviewState === "resolved" ? "green" : "amber"
                          }
                        >
                          {item.reviewState.replace(/_/g, " ")}
                        </Stamp>
                      </div>

                      <Quote label="Original wording — never overwritten" staff>
                        {item.originalText}
                      </Quote>

                      {events.length > 0 && (
                        <section
                          className="thread"
                          aria-labelledby={`responses-${item.id}`}
                        >
                          <h3 className="label" id={`responses-${item.id}`}>
                            {events.length} response
                            {events.length === 1 ? "" : "s"} so far
                          </h3>
                          {events.map((event) => {
                            if (event.kind === "private") {
                              return (
                                <article
                                  className="event event--private"
                                  key={`private-${event.response.id}`}
                                >
                                  <div className="event__mark">
                                    <IconPrivate size={13} />
                                  </div>
                                  <div>
                                    <div className="event__meta">
                                      <strong>Private reply</strong>
                                      <span>to this student only</span>
                                      <span>
                                        {formatDateTime(
                                          event.response.createdAt,
                                          section.timezone,
                                        )}
                                      </span>
                                    </div>
                                    <p className="event__body">
                                      {event.response.body}
                                    </p>
                                  </div>
                                </article>
                              );
                            }

                            const { answer } = event;
                            const label =
                              answer.state === "published"
                                ? "Published to the class"
                                : answer.state === "scheduled"
                                  ? "Scheduled to publish"
                                  : "Public draft";

                            return (
                              <article
                                className="event event--public"
                                key={`public-${answer.id}`}
                              >
                                <div className="event__mark">
                                  <IconPublic size={13} />
                                </div>
                                <div>
                                  <div className="event__meta">
                                    <strong>{label}</strong>
                                    <span>anonymously</span>
                                    <span>
                                      {formatDateTime(
                                        event.at,
                                        section.timezone,
                                      )}
                                    </span>
                                  </div>
                                  {answer.publishFailed && (
                                    <p style={{ marginTop: 4 }}>
                                      <Stamp tone="red">
                                        Publication failed
                                      </Stamp>
                                    </p>
                                  )}
                                  <p className="event__body event__body--lead">
                                    {answer.publicQuestionText}
                                  </p>
                                  {answer.answerBody && (
                                    <p className="event__body">
                                      {answer.answerBody}
                                    </p>
                                  )}
                                  <p style={{ marginTop: 6 }}>
                                    {answer.state === "published" ? (
                                      <Link
                                        className="link small"
                                        href={`/sections/${sectionId}/qa?selected=${answer.id}`}
                                      >
                                        See it in the class Q&amp;A
                                      </Link>
                                    ) : can("draftPublicAnswers") ? (
                                      <Link
                                        className="link small"
                                        href={`/teach/sections/${sectionId}/publications`}
                                      >
                                        Finish it in the publication queue
                                      </Link>
                                    ) : null}
                                  </p>
                                </div>
                              </article>
                            );
                          })}
                        </section>
                      )}

                      {(can("sendPrivateResponses") ||
                        can("draftPublicAnswers")) && (
                        <div className="composers">
                          {can("sendPrivateResponses") && (
                            <div className="composer">
                              <h3>Reply to this student only</h3>
                              <p>
                                Appears under their own submissions. No
                                classmate can see it.
                              </p>
                              <form action={sendPrivate}>
                                <input
                                  type="hidden"
                                  name="itemId"
                                  value={item.id}
                                />
                                <input
                                  type="hidden"
                                  name="selected"
                                  value={selectedRow.response.id}
                                />
                                <label
                                  className="visually-hidden"
                                  htmlFor={`private-${item.id}`}
                                >
                                  Private reply
                                </label>
                                <textarea
                                  id={`private-${item.id}`}
                                  className="textarea-field"
                                  name="body"
                                  rows={4}
                                  placeholder="Answer this student directly…"
                                  required
                                />
                                <div>
                                  <button
                                    className="button button--secondary"
                                    type="submit"
                                  >
                                    Send private reply
                                  </button>
                                </div>
                              </form>
                            </div>
                          )}

                          {can("draftPublicAnswers") && (
                            <div className="composer">
                              <h3>Answer the whole section</h3>
                              <p>
                                Rewrite the question so it cannot identify the
                                asker. The original above stays untouched.
                              </p>
                              <PublicAnswerComposer
                                action={draftOrPublish}
                                itemId={item.id}
                                selectedResponseId={selectedRow.response.id}
                                originalQuestion={item.originalText}
                                canPublish={can("publishPublicAnswers")}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                },
              )}
            </section>
          )}
        </article>
      )}
    </WorkspaceShell>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

function renderAnswer(answer: {
  value: unknown;
  freeText: string | null;
}): string {
  if (answer.freeText) return answer.freeText;
  const value = (answer.value ?? {}) as {
    optionLabels?: string[];
    scaleValue?: number;
    boolValue?: boolean;
    dateValue?: string;
    timeValue?: string;
  };
  if (value.optionLabels?.length) return value.optionLabels.join(", ");
  if (value.scaleValue !== undefined) return String(value.scaleValue);
  if (value.boolValue !== undefined) return value.boolValue ? "Yes" : "No";
  return value.dateValue ?? value.timeValue ?? "—";
}
