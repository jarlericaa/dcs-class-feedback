import Link from "next/link";
import { toShellUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { loadStaffSection } from "@/lib/staff-section";
import { formatDateTime } from "@/lib/datetime";
import { staffSectionNav } from "@/components/layout/nav";
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
  MetaList,
  Stamp,
  ValidityBadge,
} from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import {
  CategoryMark,
  IconBack,
  IconPrivate,
  IconPublic,
} from "@/components/ui/icons";
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
  // The most recent flag, for the instructor's decision dialog.
  const flagEvent = [...validityHistory]
    .reverse()
    .find((event) => event.action === "flag");

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
          ? "Published to this section without your name on it."
          : "Saved as a draft. Finish it in the publication queue.",
      )}`,
    );
  }

  // --- render --------------------------------------------------------------

  /**
   * Week is a FILTER over this list, not a destination, so it belongs in the
   * list pane next to the state filter. It used to be a 12-item rail group,
   * which pushed the rail to 24 rows and buried the actual destinations at the
   * top of it while duplicating a filter the list pane already had.
   */
  const cycleFilter =
    cycles.length > 0
      ? {
          name: "Week",
          current: sp.cycle ?? "all",
          options: [
            {
              key: "all",
              label: "All weeks",
              href: queryFor({ cycle: undefined, selected: undefined }),
            },
            ...cycles.map((cycle) => ({
              key: cycle.id,
              label: `Week ${cycle.cycleIndex}${cycle.state === "open" ? " · open" : ""}`,
              href: queryFor({ cycle: cycle.id, selected: undefined }),
            })),
          ],
        }
      : undefined;

  return (
    <WorkspaceShell
      user={toShellUser(user)}
      contextTitle={section.title}
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
      navGroups={staffSectionNav(
        access,
        `/teach/sections/${sectionId}/review`,
        counts,
      )}
      selection={{
        active: !!sp.selected,
        backHref: queryFor({ selected: undefined }),
      }}
      listPane={
        <ListPane
          label="Submissions"
          hiddenOnMobile={!!sp.selected}
          /* The hierarchy the top bar could not carry: what this destination
             is, which section it belongs to, and the way back out. No fake
             path, no chevron. */
          header={
            <div className="pane-head">
              <Link className="pane-head__back" href="/teach/courses">
                <IconBack size={14} />
                My courses
              </Link>
              <h1 className="pane-head__title">Review inbox</h1>
              <p className="pane-head__context">{section.title}</p>
            </div>
          }
          searchAction={`/teach/sections/${sectionId}/review`}
          searchName="q"
          searchValue={sp.q}
          searchPlaceholder="Student name or question"
          hiddenFields={{ filter, cycle: sp.cycle, category: sp.category }}
          filterGroups={[
            {
              name: "State",
              current: filter,
              options: FILTERS.map((f) => ({
                key: f.key,
                label:
                  f.key === "all"
                    ? `Everything (${counts.total})`
                    : f.key === "needs_review"
                      ? `Needs reply (${counts.needsReview})`
                      : f.key === "answered"
                        ? `Answered (${counts.answered})`
                        : `Marked invalid (${counts.invalid})`,
                href: queryFor({ filter: f.key, selected: undefined }),
              })),
            },
            cycleFilter,
          ]}
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
        <article className="review">
          {/* Who, when, and what state — as separate elements, with this
              submission's own actions beside them. */}
          <header className="review__head">
            <div className="review__ident">
              <h1 className="object-title">
                {selectedRow.student
                  ? selectedRow.student.fullName
                  : "Identity hidden"}
              </h1>
              <MetaList
                items={[
                  `Week ${selectedRow.cycleIndex}`,
                  selectedRow.response.submittedAt
                    ? `Submitted ${formatDateTime(
                        selectedRow.response.submittedAt,
                        section.timezone,
                      )}`
                    : "Draft — not submitted yet",
                ]}
              />
            </div>

            <div className="review__head-actions">
              <ValidityBadge
                validity={
                  selectedRow.response.validity as
                    "valid" | "flagged" | "invalid"
                }
              />
              {/* Invalidation is destructive, so it is separated from the two
                  reply actions and never a one-click state change. */}
              {isInstructor &&
                can("markValidity") &&
                selectedRow.response.validity === "valid" && (
                  <Dialog
                    variant="danger"
                    className="button--small"
                    label="Mark as invalid"
                    title="Mark this submission as invalid?"
                    description="This removes the week's participation credit. It is recorded and can be reversed."
                  >
                    <form action={invalidate}>
                      <input
                        type="hidden"
                        name="responseId"
                        value={selectedRow.response.id}
                      />
                      <div className="field-row">
                        <label htmlFor="invalid-reason">Reason</label>
                        <select
                          id="invalid-reason"
                          className="select-field"
                          name="reason"
                          defaultValue="empty_or_meaningless"
                        >
                          {INVALID_REASONS.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </select>
                        <span className="helper-text">Staff only.</span>
                      </div>
                      <div className="field-row">
                        <label htmlFor="invalid-student-reason">
                          What the student sees{" "}
                          <span className="required-mark">Required</span>
                        </label>
                        <input
                          id="invalid-student-reason"
                          className="field"
                          name="studentVisibleReason"
                          required
                        />
                      </div>
                      <div className="row">
                        <button
                          className="button button--danger"
                          type="submit"
                        >
                          Mark as invalid
                        </button>
                      </div>
                    </form>
                  </Dialog>
                )}

              {/* A student assistant may flag; only an instructor decides. */}
              {selectedRow.response.validity === "valid" &&
                can("flagValidity") &&
                !isInstructor && (
                  <Dialog
                    className="button--small"
                    label="Flag for the instructor"
                    title="Flag this submission?"
                    description="The week's credit is kept until an instructor decides. The student is never told a flag exists."
                  >
                    <form action={flag}>
                      <input
                        type="hidden"
                        name="responseId"
                        value={selectedRow.response.id}
                      />
                      <div className="field-row">
                        <label htmlFor="flag-reason">Reason</label>
                        <select
                          id="flag-reason"
                          className="select-field"
                          name="reason"
                          defaultValue="empty_or_meaningless"
                        >
                          {INVALID_REASONS.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field-row">
                        <label htmlFor="flag-note">
                          Note for the instructor{" "}
                          <span className="optional-mark">optional</span>
                        </label>
                        <input id="flag-note" className="field" name="note" />
                      </div>
                      <div className="row">
                        <button
                          className="button button--primary"
                          type="submit"
                        >
                          Flag for the instructor
                        </button>
                      </div>
                    </form>
                  </Dialog>
                )}

              {isInstructor &&
                can("markValidity") &&
                selectedRow.response.validity === "flagged" && (
                  <Dialog
                    className="button--small"
                    label="Decide on this flag"
                    title="A student assistant flagged this submission"
                    description={
                      flagEvent
                        ? `${flagEvent.actorName}: ${(flagEvent.reason ?? "no reason given").replace(/_/g, " ")}${flagEvent.staffNote ? ` — ${flagEvent.staffNote}` : ""}`
                        : undefined
                    }
                  >
                    <form action={confirmFlagged}>
                      <input
                        type="hidden"
                        name="responseId"
                        value={selectedRow.response.id}
                      />
                      <div className="field-row">
                        <label htmlFor="confirm-reason">Reason</label>
                        <select
                          id="confirm-reason"
                          className="select-field"
                          name="reason"
                          defaultValue="empty_or_meaningless"
                        >
                          {INVALID_REASONS.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </select>
                        <span className="helper-text">Staff only.</span>
                      </div>
                      <div className="field-row">
                        <label htmlFor="confirm-student-reason">
                          What the student sees{" "}
                          <span className="required-mark">Required</span>
                        </label>
                        <input
                          id="confirm-student-reason"
                          className="field"
                          name="studentVisibleReason"
                          required
                        />
                      </div>
                      <div className="row">
                        <button className="button button--danger" type="submit">
                          Remove the credit
                        </button>
                      </div>
                    </form>
                    <form action={dismissFlag} style={{ marginTop: "var(--s4)" }}>
                      <input
                        type="hidden"
                        name="responseId"
                        value={selectedRow.response.id}
                      />
                      <button
                        className="button button--secondary"
                        type="submit"
                      >
                        Dismiss the flag and keep the credit
                      </button>
                    </form>
                  </Dialog>
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
                      Restore the credit
                    </button>
                  </form>
                )}
            </div>
          </header>

          {/* Identity details a reviewer rarely needs, kept out of the header. */}
          {(selectedRow.student || validityHistory.length > 0) && (
            <details className="review__details">
              <summary>Details</summary>
              <div className="review__details-body">
                {selectedRow.student && (
                  <p className="meta">
                    Student number{" "}
                    <span className="ident">
                      {selectedRow.student.studentNumber}
                    </span>
                  </p>
                )}
                {validityHistory.length > 0 && (
                  <ul className="plain-list">
                    {validityHistory.map((event) => (
                      <li className="meta" key={event.id}>
                        {event.priorValidity} to {event.newValidity} —{" "}
                        {event.actorName} ({event.actorRole}),{" "}
                        {formatDateTime(event.createdAt, section.timezone)}
                        {event.reason
                          ? `, ${event.reason.replace(/_/g, " ")}`
                          : ""}
                        {event.staffNote ? `, ${event.staffNote}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          )}

          {detail.answers.length > 0 && (
            <section className="review__section">
              <h2 className="review__section-title">Submitted answers</h2>
              {/* One aligned prompt/answer pair per question, so the whole set
                  scans down a single column instead of reading as loose text. */}
              <dl className="qa-pairs">
                {detail.answers.map((answer, index) => (
                  <div className="qa-pairs__row" key={index}>
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
            <section className="review__section">
              <Alert variant="info">
                This student answered the form questions and did not add a
                question of their own. There is nothing to answer.
              </Alert>
            </section>
          ) : (
            selectedRow.items.map(
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
                const published = publicAnswers.some(
                  (answer) => answer.state === "published",
                );

                return (
                  <section className="review__section" key={item.id}>
                    <div className="review__section-head">
                      <h2 className="review__section-title">
                        Student question
                      </h2>
                      {/* One status, in words. */}
                      <Stamp
                        tone={
                          published
                            ? "green"
                            : item.reviewState === "resolved"
                              ? "green"
                              : "amber"
                        }
                      >
                        {published
                          ? "Published"
                          : item.reviewState === "resolved"
                            ? "Answered"
                            : "Needs reply"}
                      </Stamp>
                    </div>

                    {/* The category is secondary metadata, not the heading. */}
                    <MetaList
                      items={[
                        categoryShortLabel(item.category),
                        sentenceCase(item.submissionType),
                      ]}
                    />

                    {/* Structure carries what the banner used to announce: this
                        block is the student's own words, and it is private. */}
                    <blockquote className="review__original">
                      {item.originalText}
                    </blockquote>

                    <div className="review__actions">
                      {can("sendPrivateResponses") && (
                        <Dialog
                          variant="primary"
                          label="Reply privately"
                          title="Reply privately"
                          description={`Only ${selectedRow.student?.fullName ?? "this student"} can see this.`}
                        >
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
                            <div className="field-row">
                              <label htmlFor={`private-${item.id}`}>
                                Your reply{" "}
                                <span className="required-mark">Required</span>
                              </label>
                              <textarea
                                id={`private-${item.id}`}
                                className="textarea-field"
                                name="body"
                                rows={6}
                                required
                              />
                            </div>
                            <div className="row">
                              <button
                                className="button button--primary"
                                type="submit"
                              >
                                Send private reply
                              </button>
                            </div>
                          </form>
                        </Dialog>
                      )}

                      {can("draftPublicAnswers") && (
                        <Dialog
                          label="Answer publicly"
                          title="Answer this section"
                          description="Everyone enrolled in this section sees the wording you write here."
                        >
                          <PublicAnswerComposer
                            action={draftOrPublish}
                            itemId={item.id}
                            selectedResponseId={selectedRow.response.id}
                            originalQuestion={item.originalText}
                            canPublish={can("publishPublicAnswers")}
                          />
                        </Dialog>
                      )}
                    </div>

                    {events.length > 0 && (
                      <div className="responses">
                        <h3 className="review__section-title">
                          Responses
                          {events.length > 1 && (
                            <span className="review__count">
                              {events.length}
                            </span>
                          )}
                        </h3>
                        {events.map((event) => {
                          if (event.kind === "private") {
                            return (
                              <article
                                className="response response--private"
                                key={`private-${event.response.id}`}
                              >
                                <div className="response__head">
                                  <span className="response__type">
                                    <IconPrivate size={13} />
                                    Private reply
                                  </span>
                                  <span className="response__audience">
                                    Only{" "}
                                    {selectedRow.student?.fullName ??
                                      "this student"}{" "}
                                    can see this
                                  </span>
                                  <span className="response__when">
                                    {formatDateTime(
                                      event.response.createdAt,
                                      section.timezone,
                                    )}
                                  </span>
                                </div>
                                <p className="response__body">
                                  {event.response.body}
                                </p>
                              </article>
                            );
                          }

                          const { answer } = event;
                          const label =
                            answer.state === "published"
                              ? "Published answer"
                              : answer.state === "scheduled"
                                ? "Scheduled answer"
                                : "Draft answer";

                          return (
                            <article
                              className="response response--public"
                              key={`public-${answer.id}`}
                            >
                              <div className="response__head">
                                <span className="response__type">
                                  <IconPublic size={13} />
                                  {label}
                                </span>
                                <span className="response__audience">
                                  Everyone in this section, without the
                                  asker&apos;s name
                                </span>
                                <span className="response__when">
                                  {formatDateTime(event.at, section.timezone)}
                                </span>
                              </div>
                              {answer.publishFailed && (
                                <p style={{ marginTop: 4 }}>
                                  <Stamp tone="red">Publication failed</Stamp>
                                </p>
                              )}
                              <dl className="qa-pairs">
                                <div className="qa-pairs__row">
                                  <dt>Question</dt>
                                  <dd>{answer.publicQuestionText}</dd>
                                </div>
                                {answer.answerBody && (
                                  <div className="qa-pairs__row">
                                    <dt>Answer</dt>
                                    <dd>{answer.answerBody}</dd>
                                  </div>
                                )}
                              </dl>
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
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              },
            )
          )}
        </article>
      )}
    </WorkspaceShell>
  );
}

/** An internal enum value, said the way a person would say it. */
function sentenceCase(value: string): string {
  const words = value.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
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
