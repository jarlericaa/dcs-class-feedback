import Link from "next/link";
import { eq } from "drizzle-orm";
import { toShellUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { formatDateTime } from "@/lib/datetime";
import { courseNav } from "@/components/layout/nav";
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
  getCourseReviewQueue,
  getSubmissionDetail,
  getValidityHistory,
  invalidateSubmission,
  rejectFlag,
  restoreSubmission,
  type ReviewFilter,
} from "@/modules/review";
import {
  AuthzError,
  getSectionAccess,
  type SectionPermission,
} from "@/modules/authz";
import { requireUser } from "@/lib/session";
import {
  AnonymityCheckRequired,
  anonymityWarnings,
  draftPublicAnswer,
  publishNow,
} from "@/modules/publishing";

/**
 * Staff review inbox for one COURSE. Queue on the left, the selected submission
 * on the right, collapsing to a single column below 860px.
 *
 * Course-scoped on purpose: a form shared by several sections is ONE queue, so a
 * teacher reads its responses together — the section split is not something
 * students experience. A Section filter narrows when it is operationally useful,
 * and only appears when the reader's own sections are more than one.
 *
 * Everything shown here comes from getCourseReviewQueue/getSubmissionDetail,
 * which mask student identity in the DATA when the actor lacks
 * view_student_identities and which scope every row to the sections the actor
 * holds `review_responses` on. Nothing on this page is student-visible: validity,
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
/**
 * Does this actor hold `permission` on the SELECTED submission's section?
 *
 * Module scope so the page body stays readable, and per-section because that is
 * where the permission catalog lives: a course-wide inbox must not lend standing
 * from one section to another. The services re-check every action regardless.
 */
function canOn(
  access: Awaited<ReturnType<typeof getSectionAccess>> | null,
  permission: SectionPermission,
): boolean {
  return access?.staff?.permissions[permission] ?? false;
}

const INVALID_REASONS = [
  { value: "empty_or_meaningless", label: "Empty or meaningless" },
  { value: "spam", label: "Spam" },
  { value: "abusive_content", label: "Abusive content" },
  { value: "irrelevant", label: "Completely irrelevant" },
  { value: "bad_faith_credit_attempt", label: "Bad-faith credit attempt" },
];

export default async function CourseResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    selected?: string;
    filter?: string;
    /** one form occurrence */
    cycle?: string;
    /** one form definition — narrows to that form's occurrences */
    form?: string;
    /** one class section, when the reader has more than one */
    section?: string;
    category?: string;
    q?: string;
    warn?: string;
    error?: string;
    ok?: string;
  }>;
}) {
  const { id: courseId } = await params;
  const sp = await searchParams;
  const user = await requireUser();

  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ??
    "all") as ReviewFilter;
  let queue;
  try {
    queue = await getCourseReviewQueue(user.id, courseId, {
      filter,
      instanceId: sp.cycle,
      sectionId: sp.section,
    });
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <WorkspaceShell
          user={toShellUser(user)}
          contextTitle="Class Feedback"
        >
          <AccessDenied what="this course's responses" />
        </WorkspaceShell>
      );
    }
    throw err;
  }
  const { rows, counts, instances, sections, canSeeIdentities } = queue;
  const course = (await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  }))!;
  // Timezone and instructor standing come from a section the reader can see.
  // Every instructor capability is per-section, so the controls follow the
  // SELECTED submission's section, resolved below.
  const timezone = sections[0]?.timezone ?? "Asia/Manila";

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
  const groups = groupByDay(visibleRows, submittedAt, new Date(), timezone);

  const selectedRow =
    visibleRows.find((r) => r.response.id === sp.selected) ?? visibleRows[0];
  const detail = selectedRow
    ? await getSubmissionDetail(user.id, selectedRow.response.id)
    : null;
  const validityHistory = selectedRow
    ? await getValidityHistory(user.id, selectedRow.response.id)
    : [];

  /**
   * Standing is resolved on the SELECTED submission's own section, not on the
   * course: instructor capabilities are per-section, and a course-wide inbox must
   * not lend a co-teacher of Section A the power to finalize a Section B
   * decision. The services re-check every one of these regardless.
   */
  const selectedSectionId = selectedRow?.response.sectionId ?? null;
  const selectedAccess = selectedSectionId
    ? await getSectionAccess(db, user.id, selectedSectionId)
    : null;
  const isInstructor = selectedAccess?.staff?.isInstructor ?? false;
  const can = (permission: Parameters<typeof canOn>[1]) =>
    canOn(selectedAccess, permission);
  const selectedSection = selectedSectionId
    ? (sections.find((s) => s.id === selectedSectionId) ?? null)
    : null;
  const detailTimezone = selectedSection?.timezone ?? timezone;

  // The most recent flag, for the instructor's decision dialog.
  const flagEvent = [...validityHistory]
    .reverse()
    .find((event) => event.action === "flag");

  const queryFor = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      filter,
      cycle: sp.cycle,
      form: sp.form,
      section: sp.section,
      category: sp.category,
      q: sp.q,
      selected: sp.selected,
      ...patch,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    return `/teach/courses/${courseId}/responses?${next.toString()}`;
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
    revalidatePath(`/teach/courses/${courseId}/responses`);
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
    revalidatePath(`/teach/courses/${courseId}/responses`);
  }

  async function dismissFlag(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await rejectFlag(uid, String(formData.get("responseId")), {
      note: String(formData.get("note") ?? "") || undefined,
    });
    revalidatePath(`/teach/courses/${courseId}/responses`);
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
    revalidatePath(`/teach/courses/${courseId}/responses`);
  }

  async function restoreValid(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await restoreSubmission(uid, String(formData.get("responseId")));
    revalidatePath(`/teach/courses/${courseId}/responses`);
  }

  async function sendPrivate(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const body = String(formData.get("body") ?? "").trim();
    const selected = String(formData.get("selected") ?? "");
    if (!body) {
      redirect(
        `/teach/courses/${courseId}/responses?selected=${selected}&error=${encodeURIComponent(
          "A private reply cannot be empty.",
        )}`,
      );
    }
    await createPrivateResponse(uid, String(formData.get("itemId")), body);
    revalidatePath(`/teach/courses/${courseId}/responses`);
    redirect(
      `/teach/courses/${courseId}/responses?selected=${selected}&ok=${encodeURIComponent(
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
        `/teach/courses/${courseId}/responses?selected=${selected}&error=${encodeURIComponent(message)}`,
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
          `/teach/courses/${courseId}/responses?selected=${selected}&warn=${encodeURIComponent(
            warnings.join(" | "),
          )}`,
        );
      }
    }

    /**
     * Published into the ASKER's own section, which the form carries. A form
     * shared across the course must not widen a publication: Section A's answer
     * stays in Section A's archive, and cross-section reuse goes through the
     * course backlog. `draftPublicAnswer` refuses any other section for this
     * item, so this is checked twice.
     */
    const publishSectionId = String(formData.get("sectionId") ?? "");
    const answer = await draftPublicAnswer(uid, {
      sectionId: publishSectionId,
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
            `/teach/sections/${publishSectionId}/publications?warn=${encodeURIComponent(
              err.warnings.join(" | "),
            )}`,
          );
        }
        throw err;
      }
    }
    revalidatePath(`/teach/courses/${courseId}/responses`);
    redirect(
      `/teach/courses/${courseId}/responses?selected=${selected}&ok=${encodeURIComponent(
        intent === "publish"
          ? "Published to the asker's section without their name on it."
          : "Saved as a draft. Finish it in the publication queue.",
      )}`,
    );
  }

  // --- render --------------------------------------------------------------

  /**
   * Which occurrence is a FILTER over this list, not a destination, so it belongs
   * in the list pane next to the state filter. Its labels come from the read
   * model, so a one-time form is never called "Week 1".
   */
  const occurrenceFilter =
    instances.length > 0
      ? {
          name: "Form",
          current: sp.cycle ?? "all",
          options: [
            {
              key: "all",
              label: "Every form",
              href: queryFor({ cycle: undefined, selected: undefined }),
            },
            ...instances.map(({ instance, label }) => ({
              key: instance.id,
              label: `${label}${instance.state === "open" ? " · open" : ""}`,
              href: queryFor({ cycle: instance.id, selected: undefined }),
            })),
          ],
        }
      : undefined;

  /**
   * The section filter, and the reason it is a filter rather than the shape of
   * the page: students in Section A and Section B answer the SAME form, so the
   * default view does not invent a separation they never experience. It appears
   * only when this reader actually has more than one section — a control with one
   * option is noise.
   */
  const sectionFilter =
    sections.length > 1
      ? {
          name: "Section",
          current: sp.section ?? "all",
          options: [
            {
              key: "all",
              label: "All sections",
              href: queryFor({ section: undefined, selected: undefined }),
            },
            ...sections.map((section) => ({
              key: section.id,
              label: section.title,
              href: queryFor({ section: section.id, selected: undefined }),
            })),
          ],
        }
      : undefined;

  return (
    <WorkspaceShell
      user={toShellUser(user)}
      contextTitle={course.code}
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
      navGroups={courseNav(courseId, `/teach/courses/${courseId}/responses`, {
        needsReview: counts.needsReview,
      })}
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
              <Link
                className="pane-head__back"
                href={`/teach/courses/${courseId}`}
              >
                <IconBack size={14} />
                {course.code}
              </Link>
              <h1 className="pane-head__title">Responses</h1>
              {/* The course is the context, and the section only when the
                  reader has narrowed to one — otherwise saying "Section A" here
                  would be a claim about the whole list that is not true. */}
              <p className="pane-head__context">
                {sp.section
                  ? (sections.find((s) => s.id === sp.section)?.title ??
                    course.code)
                  : sections.length > 1
                    ? "All sections"
                    : (sections[0]?.title ?? course.code)}
              </p>
            </div>
          }
          searchAction={`/teach/courses/${courseId}/responses`}
          searchName="q"
          searchValue={sp.q}
          searchPlaceholder="Student name or question"
          hiddenFields={{
            filter,
            cycle: sp.cycle,
            section: sp.section,
            category: sp.category,
          }}
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
            occurrenceFilter,
            sectionFilter,
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
                        <span>{row.instanceLabel ?? "Form"}</span>
                        {/* The section only when the list spans more than one:
                            otherwise it is the same word on every row. */}
                        {!sp.section && sections.length > 1 && (
                          <span>
                            {sections.find(
                              (s) => s.id === row.response.sectionId,
                            )?.title ?? ""}
                          </span>
                        )}
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
                  detail.instanceLabel,
                  // Named only when the reader has more than one, so the label
                  // carries information rather than repeating itself.
                  sections.length > 1 ? (selectedSection?.title ?? null) : null,
                  selectedRow.response.submittedAt
                    ? `Submitted ${formatDateTime(
                        selectedRow.response.submittedAt,
                        detailTimezone,
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
                        {formatDateTime(event.createdAt, detailTimezone)}
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
                          title="Answer this student's section"
                          description={`Everyone enrolled in ${selectedSection?.title ?? "their section"} sees the wording you write here. No other section does.`}
                        >
                          <PublicAnswerComposer
                            action={draftOrPublish}
                            itemId={item.id}
                            selectedResponseId={selectedRow.response.id}
                            /* The asker's own section. A shared form must not
                               widen a publication, so the target is carried
                               explicitly and re-checked server-side. */
                            sectionId={selectedRow.response.sectionId}
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
                                      detailTimezone,
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
                                  {formatDateTime(event.at, detailTimezone)}
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
                                    href={`/sections/${selectedSectionId}/qa?selected=${answer.id}`}
                                  >
                                    See it in the class Q&amp;A
                                  </Link>
                                ) : can("draftPublicAnswers") ? (
                                  <Link
                                    className="link small"
                                    href={`/teach/sections/${selectedSectionId}/publications`}
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
