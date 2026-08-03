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
  avatarColour,
  categoryClass,
  categoryShortLabel,
  groupByDay,
  QUESTION_CATEGORIES,
  shortAgo,
} from "@/lib/threads";
import { AccessDenied, Alert, Badge } from "@/components/ui";
import { PublicAnswerComposer } from "@/components/staff/public-answer-composer";
import {
  createPrivateResponse,
  getReviewQueue,
  getSubmissionDetail,
  setValidity,
  type ReviewFilter,
} from "@/modules/review";
import {
  AnonymityCheckRequired,
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
  const visibleRows = rows.filter((row) => {
    if (
      sp.category &&
      !row.items.some((i) => i.item.category === sp.category)
    ) {
      return false;
    }
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
  const groups = groupByDay(
    visibleRows,
    (row) => row.response.submittedAt,
    new Date(),
    section.timezone,
  );

  const selectedRow =
    visibleRows.find((r) => r.response.id === sp.selected) ?? visibleRows[0];
  const detail = selectedRow
    ? await getSubmissionDetail(user.id, selectedRow.response.id)
    : null;

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

  const railSections = [
    { id: sectionId, label: `${course.code} ${section.title}` },
  ];

  return (
    <WorkspaceShell
      user={toShellUser(user)}
      contextTitle={`${course.code} ${section.term} — Review`}
      notificationCount={counts.needsReview}
      courses={railSections.map((s) => ({
        href: `/teach/sections/${s.id}/review`,
        label: s.label,
        active: s.id === sectionId,
        count: counts.needsReview || undefined,
      }))}
      categories={QUESTION_CATEGORIES.map((c) => ({
        slug: c.slug,
        label: c.label,
        href: queryFor({ category: c.slug, selected: undefined }),
        clearHref: queryFor({ category: undefined, selected: undefined }),
        active: sp.category === c.slug,
      }))}
      navGroups={[
        ...(cycles.length > 0
          ? [
              {
                label: "Weeks",
                items: [
                  {
                    href: queryFor({ cycle: undefined, selected: undefined }),
                    label: "All weeks",
                    icon: "•",
                    active: !sp.cycle,
                  },
                  ...cycles.slice(0, 12).map((cycle) => ({
                    href: queryFor({ cycle: cycle.id, selected: undefined }),
                    label: `Week ${cycle.cycleIndex}`,
                    icon: cycle.state === "open" ? "○" : "·",
                    active: sp.cycle === cycle.id,
                  })),
                ],
              },
            ]
          : []),
        ...staffSectionNav(access, `/teach/sections/${sectionId}/review`).map(
          (g) => ({
            ...g,
            label: g.label === "Section" ? "Workspace" : g.label,
          }),
        ),
      ]}
      selection={{
        active: !!sp.selected,
        backHref: queryFor({ selected: undefined }),
      }}
      listPane={
        <ListPane
          hiddenOnMobile={!!sp.selected}
          searchAction={`/teach/sections/${sectionId}/review`}
          searchName="q"
          searchValue={sp.q}
          searchPlaceholder="Search submissions"
          hiddenFields={{ filter, cycle: sp.cycle, category: sp.category }}
          filter={{
            current: filter,
            options: FILTERS.map((f) => ({
              key: f.key,
              label:
                f.key === "all"
                  ? `All (${counts.total})`
                  : f.key === "needs_review"
                    ? `Needs review (${counts.needsReview})`
                    : f.key === "answered"
                      ? `Answered (${counts.answered})`
                      : `Invalid (${counts.invalid})`,
              href: queryFor({ filter: f.key, selected: undefined }),
            })),
          }}
        >
          {visibleRows.length === 0 ? (
            <p style={{ padding: "22px 16px", color: "#6b7280" }}>
              {counts.total === 0
                ? "No submissions yet"
                : "Nothing matches this filter."}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <DayGroupHeading>{group.label}</DayGroupHeading>
                {group.rows.map((row) => {
                  const isActive = selectedRow?.response.id === row.response.id;
                  const firstItem = row.items[0]?.item;
                  return (
                    <Link
                      key={row.response.id}
                      className={`ws-row ${isActive ? "ws-row--active" : ""}`}
                      href={queryFor({ selected: row.response.id })}
                      aria-current={isActive ? "true" : undefined}
                    >
                      <span className="ws-row__top">
                        {!row.answered && row.items.length > 0 && (
                          <span className="ws-row__dot" aria-hidden="true" />
                        )}
                        <span className="ws-row__kind" aria-hidden="true">
                          {row.items.length > 0 ? "?" : "▤"}
                        </span>
                        <span className="ws-row__title">
                          {firstItem
                            ? truncate(firstItem.originalText, 70)
                            : "Form answers only"}
                        </span>
                        <span className="ws-row__flags">
                          {row.response.validity === "invalid" && (
                            <span
                              className="ws-chip-s"
                              style={{ background: "#b54747" }}
                            >
                              !
                            </span>
                          )}
                          {row.answered && <span className="ws-chip-s">A</span>}
                        </span>
                      </span>
                      <span className="ws-row__meta">
                        {firstItem && (
                          <span
                            className={categoryClass(
                              firstItem.category,
                              "label",
                            )}
                          >
                            {categoryShortLabel(firstItem.category)}
                          </span>
                        )}
                        <span>
                          {row.student
                            ? row.student.fullName
                            : "Identity hidden"}
                        </span>
                        <span>Wk {row.cycleIndex}</span>
                        <span>{shortAgo(row.response.submittedAt)}</span>
                        {row.items.length > 0 && (
                          <span className="ws-row__count">
                            <span aria-hidden="true">🗨</span> {row.items.length}
                          </span>
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
      {sp.ok && (
        <div style={{ marginBottom: 16 }}>
          <Alert variant="success">{sp.ok}</Alert>
        </div>
      )}
      {sp.error && (
        <div style={{ marginBottom: 16 }}>
          <Alert variant="error">{sp.error}</Alert>
        </div>
      )}
      {sp.warn && (
        <div style={{ marginBottom: 16 }}>
          <Alert variant="warning" title="Check the wording before publishing">
            <ul>
              {sp.warn.split(" | ").map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
            Tick &ldquo;I have checked the public wording&rdquo; to publish
            anyway.
          </Alert>
        </div>
      )}
      {!canSeeIdentities && (
        <div style={{ marginBottom: 16 }}>
          <Alert variant="info" title="Identities are hidden for your account">
            You can review and respond, but you have not been granted &ldquo;see
            student identities&rdquo; on this section.
          </Alert>
        </div>
      )}

      {!selectedRow || !detail ? (
        <div className="ws-empty-detail">
          <div>
            <p style={{ fontSize: 17, marginBottom: 6 }}>
              {counts.total === 0
                ? "No submissions yet"
                : "Select a submission"}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="ws-thread-head">
            <h1 className="ws-thread-title">
              {selectedRow.items[0]
                ? truncate(selectedRow.items[0].item.originalText, 90)
                : `Week ${selectedRow.cycleIndex} submission`}{" "}
              <span className="ws-num">#{selectedRow.cycleIndex}</span>
            </h1>
            <div className="ws-thread-actions">
              <span className="ws-thread-action">
                <strong>{selectedRow.items.length}</strong>
                ITEMS
              </span>
              <span
                className={`ws-thread-action ${
                  selectedRow.response.validity === "valid"
                    ? "ws-thread-action--on"
                    : ""
                }`}
              >
                <strong aria-hidden="true">
                  {selectedRow.response.validity === "valid" ? "✔" : "✕"}
                </strong>
                {selectedRow.response.validity === "valid"
                  ? "COUNTS"
                  : "INVALID"}
              </span>
            </div>
          </div>

          <div className="ws-post">
            <span
              className="ws-avatar"
              style={{
                background: selectedRow.student
                  ? avatarColour(selectedRow.student.fullName)
                  : undefined,
              }}
              aria-hidden="true"
            >
              {selectedRow.student
                ? selectedRow.student.fullName.slice(0, 1).toUpperCase()
                : "?"}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="ws-post__who" style={{ margin: 0 }}>
                {selectedRow.student
                  ? selectedRow.student.fullName
                  : "Identity hidden"}
              </p>
              <p className="ws-post__when" style={{ margin: 0 }}>
                {selectedRow.student
                  ? `${selectedRow.student.studentNumber} · `
                  : ""}
                submitted{" "}
                {formatDateTime(
                  selectedRow.response.submittedAt,
                  section.timezone,
                )}{" "}
                · week {selectedRow.cycleIndex}
              </p>

              {can("markValidity") && (
                <div style={{ marginTop: 12 }}>
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
                        style={{ maxWidth: 240 }}
                      >
                        <option value="spam">Spam</option>
                        <option value="abusive_content">Abusive content</option>
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
                        className="button button--danger button--small"
                        type="submit"
                      >
                        Mark invalid
                      </button>
                      <span className="muted small">
                        Removes participation credit. Never shown to the
                        student.
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
                        className="button button--secondary button--small"
                        type="submit"
                      >
                        Restore participation credit
                      </button>
                      <span className="muted small">
                        Marked invalid:{" "}
                        {selectedRow.response.invalidationReason}
                      </span>
                    </form>
                  )}
                </div>
              )}

              {detail.answers.length > 0 && (
                <div className="source-box" style={{ marginTop: 16 }}>
                  <p className="source-box__label">Form answers</p>
                  <dl style={{ margin: 0 }}>
                    {detail.answers.map((answer, index) => (
                      <div key={index} style={{ marginBottom: 8 }}>
                        <dt className="muted small" style={{ fontWeight: 700 }}>
                          {answer.prompt}
                        </dt>
                        <dd style={{ margin: 0 }}>{renderAnswer(answer)}</dd>
                      </div>
                    ))}
                  </dl>
                  {detail.unansweredCount > 0 && (
                    <p className="muted small" style={{ marginTop: 8 }}>
                      {detail.unansweredCount} optional question
                      {detail.unansweredCount === 1 ? "" : "s"} left blank.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {selectedRow.items.length === 0 && (
            <div style={{ marginTop: 22 }}>
              <Alert variant="info">
                This student answered the form questions but did not add a
                question or feedback of their own.
              </Alert>
            </div>
          )}

          {selectedRow.items.length > 0 && (
            <h2 className="ws-answers-heading">
              {selectedRow.items.length === 1
                ? `Student ${selectedRow.items[0]?.item.submissionType ?? "item"}`
                : `${selectedRow.items.length} student items`}
            </h2>
          )}

          {selectedRow.items.map(
            ({ item, privateResponses, publicAnswers }) => {
              const responseEvents = [
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
              <article className="ws-answer review-item-thread" key={item.id}>
                <header className="review-item-thread__header">
                  <span className={categoryClass(item.category, "label")}>
                    {item.submissionType} · {categoryShortLabel(item.category)}
                  </span>
                  <Badge
                    tone={item.reviewState === "resolved" ? "green" : "neutral"}
                  >
                    {item.reviewState.replace(/_/g, " ")}
                  </Badge>
                </header>

                <div className="review-item-original">
                  <p className="review-item-original__label">
                    Original message
                  </p>
                  <p className="review-item-original__body">
                    {item.originalText}
                  </p>
                </div>

                {responseEvents.length > 0 && (
                  <section
                    className="review-response-history"
                    aria-labelledby={`responses-${item.id}`}
                  >
                    <h3 id={`responses-${item.id}`}>
                      Responses <span>{responseEvents.length}</span>
                    </h3>
                    <div className="review-response-list">
                      {responseEvents.map((event) => {
                        if (event.kind === "private") {
                          return (
                            <article
                              className="review-response review-response--private"
                              key={`private-${event.response.id}`}
                            >
                              <div className="review-response__marker" aria-hidden="true">
                                ↙
                              </div>
                              <div>
                                <div className="review-response__meta">
                                  <strong>Private reply</strong>
                                  <span>
                                    {formatDateTime(
                                      event.response.createdAt,
                                      section.timezone,
                                    )}
                                  </span>
                                </div>
                                <p className="review-response__body">
                                  {event.response.body}
                                </p>
                              </div>
                            </article>
                          );
                        }

                        const { answer } = event;
                        const publicLabel =
                          answer.state === "published"
                            ? "Published to Class Q&A"
                            : answer.state === "scheduled"
                              ? "Scheduled public answer"
                              : "Public answer draft";

                        return (
                          <article
                            className="review-response review-response--public"
                            key={`public-${answer.id}`}
                          >
                            <div className="review-response__marker" aria-hidden="true">
                              ↗
                            </div>
                            <div>
                              <div className="review-response__meta">
                                <strong>{publicLabel}</strong>
                                <span>
                                  {formatDateTime(event.at, section.timezone)}
                                </span>
                              </div>
                              {answer.publishFailed && (
                                <p className="review-response__error">
                                  Publication failed
                                </p>
                              )}
                              <p className="review-response__question">
                                {answer.publicQuestionText}
                              </p>
                              {answer.answerBody && (
                                <p className="review-response__body">
                                  {answer.answerBody}
                                </p>
                              )}
                              <div className="review-response__actions">
                                {answer.state === "published" ? (
                                  <Link
                                    href={`/sections/${sectionId}/qa?selected=${answer.id}`}
                                  >
                                    View in Class Q&amp;A
                                  </Link>
                                ) : can("draftPublicAnswers") ? (
                                  <Link
                                    href={`/teach/sections/${sectionId}/publications`}
                                  >
                                    Open in publication queue
                                  </Link>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}

                {(can("sendPrivateResponses") ||
                  can("draftPublicAnswers")) && (
                  <div className="composer-grid review-item-thread__composer">
                    {can("sendPrivateResponses") && (
                    <div className="composer-card">
                      <h3>Reply privately</h3>
                      <form action={sendPrivate}>
                        <input type="hidden" name="itemId" value={item.id} />
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
              </article>
              );
            },
          )}
        </>
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
