import Link from "next/link";
import { toShellUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { loadStaffSection } from "@/lib/staff-section";
import { formatDateTime } from "@/lib/datetime";
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
import {
  createPrivateResponse,
  getReviewQueue,
  getSubmissionDetail,
  setValidity,
  type ReviewFilter,
} from "@/modules/review";
import {
  anonymityWarnings,
  draftPublicAnswer,
  publishNow,
} from "@/modules/publishing";

/**
 * Staff review inbox. Queue on the left, selected submission on the right,
 * collapsing to a single column below 960px.
 *
 * Everything shown here comes from getReviewQueue/getSubmissionDetail, which
 * mask student identity in the DATA when the actor lacks
 * view_student_identities. Nothing on this page is student-visible.
 */

const FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_review", label: "Needs review" },
  { key: "answered", label: "Answered" },
  { key: "invalid", label: "Invalid" },
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
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={[]}
        title="Review"
      >
        <AccessDenied what="this section's submissions" />
      </AppShell>
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

  const selectedRow =
    rows.find((r) => r.response.id === sp.selected) ?? rows[0];
  const detail = selectedRow
    ? await getSubmissionDetail(user.id, selectedRow.response.id)
    : null;

  const queryFor = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { filter, cycle: sp.cycle, selected: sp.selected, ...patch };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    return `/teach/sections/${sectionId}/review?${next.toString()}`;
  };

  // --- server actions ------------------------------------------------------

  async function invalidate(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await setValidity(
      uid,
      String(formData.get("responseId")),
      "invalid",
      String(formData.get("reason")) as "spam",
      String(formData.get("note") ?? "") || undefined,
    );
    revalidatePath(`/teach/sections/${sectionId}/review`);
  }

  async function restoreValid(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await setValidity(uid, String(formData.get("responseId")), "valid");
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
        "Private reply sent to the student.",
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

    if (intent === "publish") {
      // Pre-publish anonymity check (Risk R2): specific wording can still
      // identify the asker even though the name is never shown.
      const warnings = anonymityWarnings(publicQuestionText, 1);
      if (warnings.length > 0 && formData.get("acknowledged") !== "yes") {
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
      await publishNow(uid, answer.id);
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

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={staffSectionNav(access, `/teach/sections/${sectionId}/review`)}
      contextLabel={section.title}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/", label: "Overview" },
            { label: `${course.code} · ${section.term}` },
            { label: "Review inbox" },
          ]}
        />
      }
      eyebrow="Staff only"
      title="Review inbox"
      description="Student identities, validity decisions and drafts on this page are never visible to students."
    >
      <div className="stack-gap">
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

        <div className="stat-row">
          <Stat value={counts.total} label="submissions" />
          <Stat value={counts.needsReview} label="need review" />
          <Stat value={counts.answered} label="answered" />
          <Stat value={counts.invalid} label="marked invalid" />
        </div>

        {cycles.length > 1 && (
          <form className="filter-bar" method="get">
            <input type="hidden" name="filter" value={filter} />
            <label className="visually-hidden" htmlFor="cycle-filter">
              Filter by week
            </label>
            <select
              id="cycle-filter"
              className="select-field"
              name="cycle"
              defaultValue={sp.cycle ?? ""}
            >
              <option value="">All weeks</option>
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  Week {cycle.cycleIndex} ({cycle.state})
                </option>
              ))}
            </select>
            <button className="button button--secondary" type="submit">
              Apply
            </button>
          </form>
        )}

        {counts.total === 0 ? (
          <EmptyState title="No submissions yet">
            When students submit this section&apos;s weekly form, their
            responses appear here for review.
          </EmptyState>
        ) : (
          <div className="review-layout">
            <section
              className="card review-queue"
              aria-label="Submission queue"
            >
              <div className="review-queue__header">
                <h2>Queue</h2>
                <div className="queue-tabs">
                  {FILTERS.map((option) => (
                    <Link
                      key={option.key}
                      className={`queue-tab ${filter === option.key ? "queue-tab--active" : ""}`}
                      href={queryFor({
                        filter: option.key,
                        selected: undefined,
                      })}
                      aria-current={filter === option.key ? "true" : undefined}
                    >
                      {option.label}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="review-queue__scroll">
                {rows.length === 0 && (
                  <p className="muted" style={{ padding: "18px" }}>
                    Nothing matches this filter.
                  </p>
                )}
                {rows.map((row) => (
                  <Link
                    key={row.response.id}
                    className={`review-row ${
                      selectedRow?.response.id === row.response.id
                        ? "review-row--active"
                        : ""
                    }`}
                    href={queryFor({ selected: row.response.id })}
                    aria-current={
                      selectedRow?.response.id === row.response.id
                        ? "true"
                        : undefined
                    }
                  >
                    <span className="review-row__meta">
                      <span>Week {row.cycleIndex}</span>
                      <span>
                        {formatDateTime(
                          row.response.submittedAt,
                          section.timezone,
                        )}
                      </span>
                    </span>
                    <h3>
                      {row.student
                        ? `${row.student.fullName} (${row.student.studentNumber})`
                        : "Identity hidden"}
                    </h3>
                    <p>
                      {row.items.length === 0
                        ? "Form answers only"
                        : `${row.items.length} question/feedback item${row.items.length === 1 ? "" : "s"}`}
                    </p>
                    <div className="row-gap" style={{ marginTop: 8 }}>
                      {row.response.validity === "invalid" ? (
                        <Badge tone="red">Invalid</Badge>
                      ) : row.answered ? (
                        <Badge tone="green">Answered</Badge>
                      ) : row.items.length > 0 ? (
                        <Badge tone="amber">Needs review</Badge>
                      ) : (
                        <Badge tone="neutral">No question</Badge>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <div className="review-detail">
              {!selectedRow || !detail ? (
                <EmptyState title="Select a submission">
                  Choose a submission from the queue to review it.
                </EmptyState>
              ) : (
                <>
                  <article className="card detail-card">
                    <div
                      className="row-gap"
                      style={{ justifyContent: "space-between" }}
                    >
                      <div>
                        <p className="section-kicker">
                          Week {selectedRow.cycleIndex}
                        </p>
                        <h2>
                          {selectedRow.student
                            ? selectedRow.student.fullName
                            : "Identity hidden"}
                        </h2>
                        <p
                          className="muted small"
                          style={{ margin: "4px 0 0" }}
                        >
                          {selectedRow.student
                            ? `${selectedRow.student.studentNumber} · `
                            : ""}
                          submitted{" "}
                          {formatDateTime(
                            selectedRow.response.submittedAt,
                            section.timezone,
                          )}
                        </p>
                      </div>
                      {selectedRow.response.validity === "invalid" ? (
                        <Badge tone="red">
                          Invalid · {selectedRow.response.invalidationReason}
                        </Badge>
                      ) : (
                        <Badge tone="green">Counts for participation</Badge>
                      )}
                    </div>

                    {can("markValidity") && (
                      <div style={{ marginTop: 18 }}>
                        {selectedRow.response.validity === "valid" ? (
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
                              Reason for marking invalid
                            </label>
                            <select
                              id="invalid-reason"
                              className="select-field"
                              name="reason"
                              defaultValue="empty_or_meaningless"
                              style={{ maxWidth: 260 }}
                            >
                              <option value="spam">Spam</option>
                              <option value="abusive_content">
                                Abusive content
                              </option>
                              <option value="empty_or_meaningless">
                                Empty or meaningless
                              </option>
                              <option value="irrelevant">
                                Completely irrelevant
                              </option>
                              <option value="bad_faith_credit_attempt">
                                Bad-faith credit attempt
                              </option>
                            </select>
                            <button
                              className="button button--danger"
                              type="submit"
                            >
                              Mark invalid
                            </button>
                            <span className="muted small">
                              Removes this week&apos;s participation credit. The
                              student is never shown this.
                            </span>
                          </form>
                        ) : (
                          <form action={restoreValid} className="inline-form">
                            <input
                              type="hidden"
                              name="responseId"
                              value={selectedRow.response.id}
                            />
                            <button
                              className="button button--secondary"
                              type="submit"
                            >
                              Restore participation credit
                            </button>
                          </form>
                        )}
                      </div>
                    )}

                    {detail.answers.length > 0 && (
                      <div className="source-box">
                        <p className="source-box__label">Form answers</p>
                        <dl style={{ margin: 0 }}>
                          {detail.answers.map((answer, index) => (
                            <div key={index} style={{ marginBottom: 8 }}>
                              <dt
                                className="muted small"
                                style={{ fontWeight: 700 }}
                              >
                                {answer.prompt}
                              </dt>
                              <dd style={{ margin: 0 }}>
                                {renderAnswer(answer)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        {detail.unansweredCount > 0 && (
                          <p className="muted small" style={{ marginTop: 8 }}>
                            {detail.unansweredCount} optional question
                            {detail.unansweredCount === 1 ? "" : "s"} left
                            blank.
                          </p>
                        )}
                      </div>
                    )}
                  </article>

                  {selectedRow.items.length === 0 && (
                    <Alert variant="info">
                      This student answered the form questions but did not add a
                      question or feedback of their own.
                    </Alert>
                  )}

                  {selectedRow.items.map(
                    ({ item, privateResponses, publicAnswers }) => (
                      <article className="card detail-card" key={item.id}>
                        <div
                          className="row-gap"
                          style={{ justifyContent: "space-between" }}
                        >
                          <h3 style={{ fontSize: 15, margin: 0 }}>
                            Student {item.submissionType} · {item.category}
                          </h3>
                          <Badge
                            tone={
                              item.reviewState === "resolved"
                                ? "green"
                                : "neutral"
                            }
                          >
                            {item.reviewState.replace(/_/g, " ")}
                          </Badge>
                        </div>

                        <div className="source-box source-box--original">
                          <p className="source-box__label">
                            Original wording · never shown to other students
                          </p>
                          <p>{item.originalText}</p>
                        </div>

                        {privateResponses.map((reply) => (
                          <div
                            className="source-box source-box--private"
                            key={reply.id}
                          >
                            <p className="source-box__label">
                              Private reply sent{" "}
                              {formatDateTime(
                                reply.createdAt,
                                section.timezone,
                              )}
                            </p>
                            <p>{reply.body}</p>
                          </div>
                        ))}

                        {publicAnswers.map((answer) => (
                          <div className="source-box" key={answer.id}>
                            <p className="source-box__label">
                              Public answer · {answer.state}
                              {answer.publishFailed
                                ? " · publication failed"
                                : ""}
                            </p>
                            <p style={{ fontWeight: 650 }}>
                              {answer.publicQuestionText}
                            </p>
                            {answer.answerBody && (
                              <p style={{ marginTop: 6 }}>
                                {answer.answerBody}
                              </p>
                            )}
                            {answer.state !== "published" &&
                              can("draftPublicAnswers") && (
                                <Link
                                  className="button button--secondary button--small"
                                  href={`/teach/sections/${sectionId}/publications`}
                                  style={{ marginTop: 10 }}
                                >
                                  Open in publication queue
                                </Link>
                              )}
                          </div>
                        ))}

                        <div
                          className="composer-grid"
                          style={{ marginTop: 18 }}
                        >
                          {can("sendPrivateResponses") && (
                            <div className="composer-card">
                              <h3>Reply privately</h3>
                              <p>
                                Visible to this student and authorized staff
                                only.
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
                                <button
                                  className="button button--secondary"
                                  type="submit"
                                >
                                  Send private reply
                                </button>
                              </form>
                            </div>
                          )}

                          {can("draftPublicAnswers") && (
                            <div className="composer-card">
                              <h3>Answer the whole class</h3>
                              <p>
                                The original wording above stays private. Write
                                a version that cannot identify the asker.
                              </p>
                              <form action={draftOrPublish}>
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
                                  <label htmlFor={`pubq-${item.id}`}>
                                    Public question
                                  </label>
                                  <textarea
                                    id={`pubq-${item.id}`}
                                    className="textarea-field"
                                    name="publicQuestion"
                                    rows={2}
                                    defaultValue={item.originalText}
                                    required
                                  />
                                </div>
                                <div className="field-row">
                                  <label htmlFor={`puba-${item.id}`}>
                                    Public answer
                                  </label>
                                  <textarea
                                    id={`puba-${item.id}`}
                                    className="textarea-field"
                                    name="answerBody"
                                    rows={4}
                                  />
                                </div>
                                <Alert
                                  variant="warning"
                                  title="Before you publish"
                                >
                                  This answer will be visible to students in
                                  this section. The original wording stays
                                  private, but specific details can still
                                  identify the asker. Review the public wording
                                  before publishing.
                                </Alert>
                                <label className="choice">
                                  <input
                                    type="checkbox"
                                    name="acknowledged"
                                    value="yes"
                                  />
                                  <span>I have checked the public wording</span>
                                </label>
                                <div className="row-gap">
                                  <button
                                    className="button button--secondary"
                                    type="submit"
                                    name="intent"
                                    value="draft"
                                  >
                                    Save as draft
                                  </button>
                                  {can("publishPublicAnswers") && (
                                    <button
                                      className="button button--primary"
                                      type="submit"
                                      name="intent"
                                      value="publish"
                                    >
                                      Publish to this section
                                    </button>
                                  )}
                                </div>
                              </form>
                            </div>
                          )}
                        </div>
                      </article>
                    ),
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
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
