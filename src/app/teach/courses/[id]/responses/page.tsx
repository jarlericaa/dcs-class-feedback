import Link from "next/link";
import { eq } from "drizzle-orm";
import { toShellUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { formatDateTime, initials } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { courseTabs, staffSectionTabs } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import {
  markReviewedThisSession,
  readReviewedThisSession,
  unmarkReviewedThisSession,
} from "@/lib/reviewed-session";
import { categoryShortLabel } from "@/lib/threads";
import {
  AccessDenied,
  Alert,
  EmptyState,
  MetaList,
  Stamp,
  ValidityBadge,
} from "@/components/ui";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { Dialog } from "@/components/ui/dialog";
import { ScrollToPost } from "@/components/ui/scroll-to";
import { Thread, ThreadMessage } from "@/components/ui/thread";
import {
  IconNoReply,
  IconPrivate,
  IconPublic,
  IconSearch,
} from "@/components/ui/icons";
import { PublicAnswerComposer } from "@/components/staff/public-answer-composer";
import {
  confirmFlag,
  createPrivateResponse,
  declineToAnswer,
  flagSubmission,
  getCourseReviewQueue,
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
 * Staff review for ONE occurrence of a course's forms, as a single column of
 * posts.
 *
 * Course-scoped on purpose: a form shared by several sections is ONE queue, so a
 * teacher reads its responses together — the section split is not something
 * students experience. A Section filter narrows when it is operationally useful.
 *
 * One WEEK at a time, and that bound is the design. A feed's native shape is
 * endless, which is exactly wrong for work meant to finish: a week is the
 * product's unit of rhythm and it is also a pile a teacher can get to the bottom
 * of. So the column is scoped to one occurrence, nothing loads on scroll, and it
 * ends with a card that says how much of it is left.
 *
 * Oldest first, not newest first. Reverse-chronological — the shape a social
 * feed would take — systematically starves whoever asked earliest, and the
 * student who has waited longest is the one who should be reached first.
 *
 * Everything here comes from getCourseReviewQueue, which masks student identity
 * in the DATA when the actor lacks view_student_identities and scopes every row
 * to the sections the actor holds `review_responses` on. Nothing on this page is
 * student-visible: validity, review state and drafts all stay inside it.
 *
 * And nothing here is social. No reactions, no view counts, no signal of how
 * many people read a submission. These were written under an anonymity promise,
 * often to report a problem with the teaching, and anything resembling a score
 * would break the frame that makes students willing to write honestly.
 */

const FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "needs_review", label: "Needs a reply" },
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

type QueueRow = Awaited<ReturnType<typeof getCourseReviewQueue>>["rows"][number];

/**
 * Waiting on this reader: a valid response carrying a real question nobody has
 * settled — replied to, published, or explicitly declined.
 *
 * A general comment never counts. The schema says it is never triaged and can
 * never be published, so treating one as outstanding would put a number on the
 * queue that no action could ever clear.
 */
function needsReply(row: QueueRow): boolean {
  return row.response.validity === "valid" && row.outstanding;
}

export default async function CourseResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    filter?: string;
    /** one form occurrence — the week this column is reading */
    cycle?: string;
    /** one class section, when the reader has more than one */
    section?: string;
    category?: string;
    q?: string;
    /** the post an action just finished on, so the reader lands back on it */
    at?: string;
    warn?: string;
    error?: string;
    ok?: string;
  }>;
}) {
  const { id: courseId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const path = `/teach/courses/${courseId}/responses`;

  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ??
    "all") as ReviewFilter;

  let queue;
  try {
    /**
     * Always read the whole occurrence and narrow in memory. The "needs a
     * reply" view has to keep showing a post the reader has just answered
     * (see `reviewed-session`), and a row the query has already dropped cannot
     * be put back.
     */
    queue = await getCourseReviewQueue(user.id, courseId, {
      filter: "all",
      instanceId: sp.cycle,
      sectionId: sp.section,
    });
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={await primaryNavFor(user, path)}
          title="Responses"
        >
          <AccessDenied what="this course's responses" />
        </AppShell>
      );
    }
    throw err;
  }
  const { rows, counts, instances, sections, canSeeIdentities } = queue;
  const course = (await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  }))!;

  /**
   * Which week the column is reading.
   *
   * Without an explicit choice it is the most recent occurrence anyone has
   * actually answered — landing on next week's empty form would be technically
   * correct and useless. `instances` arrives newest-first.
   */
  const currentCycleId =
    sp.cycle ??
    instances.find((i) => i.responseCount > 0)?.instance.id ??
    instances[0]?.instance.id;
  const currentCycle = instances.find((i) => i.instance.id === currentCycleId);

  /**
   * Standing is resolved per SECTION, not per course: every instructor
   * capability is granted on a section, and a course-wide column must not lend
   * a co-teacher of Section A the power to finalize a Section B decision. One
   * lookup per section this reader holds, reused by every post. The services
   * re-check each of these regardless.
   */
  const accessBySection = new Map(
    await Promise.all(
      sections.map(
        async (section) =>
          [section.id, await getSectionAccess(db, user.id, section.id)] as const,
      ),
    ),
  );
  const canOn = (sectionId: string, permission: SectionPermission) =>
    accessBySection.get(sectionId)?.staff?.permissions[permission] ?? false;
  const isInstructorOn = (sectionId: string) =>
    accessBySection.get(sectionId)?.staff?.isInstructor ?? false;
  const timezoneOf = (sectionId: string) =>
    sections.find((s) => s.id === sectionId)?.timezone ?? "Asia/Manila";

  const reviewedThisSession = await readReviewedThisSession();

  // Category and free-text narrowing happen here rather than in the service:
  // both are presentation filters over an already-authorized result set.
  const term = sp.q?.trim().toLowerCase();
  const matchesSearch = (row: QueueRow) =>
    !term ||
    row.items.some((i) => i.item.originalText.toLowerCase().includes(term)) ||
    (row.student?.fullName.toLowerCase().includes(term) ?? false);
  const matchesCategory = (row: QueueRow) =>
    !sp.category || row.items.some((i) => i.item.category === sp.category);
  const matchesFilter = (row: QueueRow) => {
    switch (filter) {
      case "needs_review":
        // A post answered in this session stays in place, marked done, rather
        // than vanishing and shifting the column under the cursor.
        return needsReply(row) || reviewedThisSession.has(row.response.id);
      case "answered":
        return row.answered;
      case "invalid":
        return row.response.validity === "invalid";
      default:
        return true;
    }
  };

  const submittedAt = (row: QueueRow) => row.response.submittedAt ?? new Date(0);
  const visible = rows
    .filter(
      (row) => matchesSearch(row) && matchesCategory(row) && matchesFilter(row),
    )
    .sort((a, b) => submittedAt(a).getTime() - submittedAt(b).getTime());

  const nextWaiting = visible.find(
    (row) => needsReply(row) && !reviewedThisSession.has(row.response.id),
  );
  const waitingCount = visible.filter(
    (row) => needsReply(row) && !reviewedThisSession.has(row.response.id),
  ).length;

  // Validity history only where a flag is actually pending — usually none, and
  // reading it for every post would be one query per row for nothing.
  const flagEvents = new Map(
    await Promise.all(
      visible
        .filter((row) => row.response.validity === "flagged")
        .map(async (row) => {
          const history = await getValidityHistory(user.id, row.response.id);
          return [
            row.response.id,
            [...history].reverse().find((event) => event.action === "flag") ??
              null,
          ] as const;
        }),
    ),
  );

  /**
   * Which context this page belongs to, for the reader looking at it. Course
   * staff read it as one of the course's views; a delegated assistant has no
   * course workspace, and for them it is a view of their own section.
   */
  const railSectionId = sp.section ?? sections[0]?.id ?? null;
  const railAccess = railSectionId
    ? (accessBySection.get(railSectionId) ??
      (await getSectionAccess(db, user.id, railSectionId)))
    : null;
  const showsCourseTabs = railAccess?.staff?.hasCourseStanding ?? true;
  const tabs = showsCourseTabs
    ? courseTabs(courseId, path, { needsReview: counts.needsReview })
    : staffSectionTabs(railAccess!, path, {
        needsReview: counts.needsReview,
        activeHref: `/teach/sections/${railSectionId}/review`,
      });

  // --- server actions ------------------------------------------------------

  /**
   * The query string an action returns to, as a plain STRING.
   *
   * Everything a `use server` closure captures is serialized, so these actions
   * may only close over plain values — a helper function defined out here is
   * refused outright. Each action re-opens this, adds its own message, and
   * anchors to the post it acted on, because without the anchor every reply
   * throws the reader back to the top of a column they were halfway down.
   */
  const backQuery = new URLSearchParams(
    Object.entries({
      filter,
      cycle: currentCycleId,
      section: sp.section,
      category: sp.category,
      q: sp.q,
    }).filter((entry): entry is [string, string] => !!entry[1]),
  ).toString();


  // A student assistant may FLAG; only an instructor may finalize or reverse a
  // validity decision. The service layer re-checks every one of these.
  async function flag(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const responseId = String(formData.get("responseId"));
    await flagSubmission(uid, responseId, {
      reason: String(formData.get("reason")) as "spam",
      note: String(formData.get("note") ?? "") || undefined,
    });
    await markReviewedThisSession(responseId);
    revalidatePath(path);
    {
      const back = new URLSearchParams(backQuery);
      back.set("at", responseId);
      redirect(`${path}?${back.toString()}`);
    }
  }

  async function confirmFlagged(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const responseId = String(formData.get("responseId"));
    await confirmFlag(uid, responseId, {
      reason: String(formData.get("reason")) as "spam",
      studentVisibleReason: String(formData.get("studentVisibleReason") ?? ""),
      note: String(formData.get("note") ?? "") || undefined,
    });
    await markReviewedThisSession(responseId);
    revalidatePath(path);
    {
      const back = new URLSearchParams(backQuery);
      back.set("at", responseId);
      redirect(`${path}?${back.toString()}`);
    }
  }

  async function dismissFlag(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const responseId = String(formData.get("responseId"));
    await rejectFlag(uid, responseId, {
      note: String(formData.get("note") ?? "") || undefined,
    });
    revalidatePath(path);
    {
      const back = new URLSearchParams(backQuery);
      back.set("at", responseId);
      redirect(`${path}?${back.toString()}`);
    }
  }

  async function invalidate(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const responseId = String(formData.get("responseId"));
    await invalidateSubmission(uid, responseId, {
      reason: String(formData.get("reason")) as "spam",
      studentVisibleReason: String(formData.get("studentVisibleReason") ?? ""),
      note: String(formData.get("note") ?? "") || undefined,
    });
    await markReviewedThisSession(responseId);
    revalidatePath(path);
    {
      const back = new URLSearchParams(backQuery);
      back.set("at", responseId);
      redirect(`${path}?${back.toString()}`);
    }
  }

  async function restoreValid(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const responseId = String(formData.get("responseId"));
    await restoreSubmission(uid, responseId);
    revalidatePath(path);
    {
      const back = new URLSearchParams(backQuery);
      back.set("at", responseId);
      redirect(`${path}?${back.toString()}`);
    }
  }

  async function sendPrivate(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const body = String(formData.get("body") ?? "").trim();
    const responseId = String(formData.get("responseId") ?? "");
    if (!body) {
      const q = new URLSearchParams(backQuery);
      q.set("error", "A private reply cannot be empty.");

      q.set("at", responseId);
      redirect(`${path}?${q.toString()}`);
    }
    await createPrivateResponse(uid, String(formData.get("itemId")), body);
    await markReviewedThisSession(responseId);
    revalidatePath(path);
    const sent = new URLSearchParams(backQuery);
    sent.set(
      "ok",
      "Private reply sent. Only this student and the teaching team can see it.",
    );
    sent.set("at", responseId);
    redirect(`${path}?${sent.toString()}`);
  }

  /**
   * Decide a question will not be answered.
   *
   * The student is told nothing: domain-model.md §3.5 is explicit that `No
   * response` never surfaces, so their view stays "Submitted". Nothing is
   * deleted, the decision is audited, and the same control reverses it — which
   * is why it needs no confirmation step.
   */
  async function declineAnswer(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const responseId = String(formData.get("responseId"));
    const undo = formData.get("undo") === "yes";
    await declineToAnswer(uid, String(formData.get("itemId")), { undo });
    // Putting it back means putting it back: the "done" mark goes too, or the
    // post stays stamped and the count never recovers.
    if (undo) await unmarkReviewedThisSession(responseId);
    else await markReviewedThisSession(responseId);
    revalidatePath(path);
    const q = new URLSearchParams(backQuery);
    q.set(
      "ok",
      undo
        ? "Back in the queue. The student was never told either way."
        : "Marked as not being answered. The student is not told — their view still says submitted.",
    );
    q.set("at", responseId);
    redirect(`${path}?${q.toString()}`);
  }

  async function draftOrPublish(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const itemId = String(formData.get("itemId"));
    const responseId = String(formData.get("selected") ?? "");
    const publicQuestionText = String(
      formData.get("publicQuestion") ?? "",
    ).trim();
    const answerBody = String(formData.get("answerBody") ?? "").trim();
    const intent = String(formData.get("intent") ?? "draft");

    const fail = (message: string) => {
      const q = new URLSearchParams(backQuery);
      q.set("error", message);

      q.set("at", responseId);
      redirect(`${path}?${q.toString()}`);
    };

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
        const q = new URLSearchParams(backQuery);
        q.set("warn", warnings.join(" | "));

        q.set("at", responseId);
        redirect(`${path}?${q.toString()}`);
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
    await markReviewedThisSession(responseId);
    revalidatePath(path);
    const done = new URLSearchParams(backQuery);
    done.set(
      "ok",
      intent === "publish"
        ? "Published to the asker's section without their name on it."
        : "Saved as a draft. Finish it in the publication queue.",
    );
    done.set("at", responseId);
    redirect(`${path}?${done.toString()}`);
  }

  // --- render --------------------------------------------------------------

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, path, {
        /* Reached from the section rail rather than the course rail when the
           reader has no course standing — so that is the row to mark. */
        fallbackHref: showsCourseTabs
          ? `/teach/courses/${courseId}`
          : `/teach/sections/${railSectionId}`,
      })}
      tabs={tabs}
      tabsMode={showsCourseTabs ? undefined : "menu"}
      tabsLabel={
        showsCourseTabs ? course.code : (railAccess?.section.title ?? course.code)
      }
      contextLabel={course.code}
      title="Responses"
    >
      {sp.at && <ScrollToPost anchorId={`r-${sp.at}`} />}

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

      {/* The controls stay in reach down a long column, and the count beside
          them is the map a list pane used to be: how much is left. */}
      <div className="feedbar">
        <form className="feedbar__controls" method="get" action={path}>
          {sp.category && (
            <input type="hidden" name="category" value={sp.category} />
          )}
          {/* The scope, on its own line and full width: which form's responses
              this whole column is, before anything narrows it. */}
          {instances.length > 0 && (
            <div className="feedbar__scope">
            <AutoSubmitSelect
              id="feed-week"
              name="cycle"
              defaultValue={currentCycleId ?? ""}
              label="Which form"
            >
              {instances.map(({ instance, label }) => (
                <option key={instance.id} value={instance.id}>
                  {label}
                  {instance.state === "open" ? " · open" : ""}
                </option>
              ))}
            </AutoSubmitSelect>
            </div>
          )}

          {/* The search line, with the narrowing controls trailing it. */}
          <div className="feedbar__line">
          <span className="feedbar__search">
            <IconSearch size={15} />
            <label className="visually-hidden" htmlFor="feed-q">
              Search this form
            </label>
            <input
              id="feed-q"
              name="q"
              type="search"
              placeholder="Search"
              defaultValue={sp.q ?? ""}
            />
          </span>

          <AutoSubmitSelect
            id="feed-filter"
            name="filter"
            defaultValue={filter}
            label="Show"
          >
            {FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.key === "all"
                  ? `Everything (${counts.total})`
                  : f.key === "needs_review"
                    ? `Needs a reply (${counts.needsReview})`
                    : f.key === "answered"
                      ? `Answered (${counts.answered})`
                      : `Marked invalid (${counts.invalid})`}
              </option>
            ))}
          </AutoSubmitSelect>

          {/* Only when the reader actually has more than one: a control with a
              single option is noise. */}
          {sections.length > 1 && (
            <AutoSubmitSelect
              id="feed-section"
              name="section"
              defaultValue={sp.section ?? ""}
              label="Section"
            >
              <option value="">All sections</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </AutoSubmitSelect>
          )}

          <button className="visually-hidden" type="submit">
            Search
          </button>
          </div>
        </form>

        <p className="feedbar__status">
          <span>
            <strong>{visible.length}</strong>{" "}
            {visible.length === 1 ? "response" : "responses"} shown
          </span>
          {waitingCount > 0 ? (
            <>
              <span className="feedbar__waiting">
                {waitingCount} still {waitingCount === 1 ? "needs" : "need"} a
                reply
              </span>
              {nextWaiting && (
                <a className="link small" href={`#r-${nextWaiting.response.id}`}>
                  Jump to the next one
                </a>
              )}
            </>
          ) : (
            <span>Nothing here is waiting on you.</span>
          )}
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={
            counts.total === 0 ? "No responses yet" : "Nothing matches these filters"
          }
        >
          {counts.total === 0
            ? undefined
            : "Try another form, a wider filter, or clear the search."}
        </EmptyState>
      ) : (
        <div className="feed">
          {visible.map((row) => {
            const sectionId = row.response.sectionId;
            const timezone = timezoneOf(sectionId);
            const doneNow = reviewedThisSession.has(row.response.id);
            const waiting = needsReply(row);
            const section = sections.find((s) => s.id === sectionId);
            const flagEvent = flagEvents.get(row.response.id) ?? null;
            const who = row.student?.fullName ?? "Identity hidden";

            return (
              <article
                className={`post ${waiting && !doneNow ? "post--waiting" : ""} ${
                  row.response.validity === "invalid" ? "post--invalid" : ""
                }`}
                key={row.response.id}
                id={`r-${row.response.id}`}
              >
                {/* Three columns: who, what they said, and when. The time
                    leaves the name line for a column of its own so the dates
                    line up down the page and can be compared without reading
                    the rest of the row. */}
                <span className="post__mark" aria-hidden="true">
                  {row.student ? initials(row.student.fullName) : "—"}
                </span>

                <div className="post__stamp">
                  <span className="post__stamp-label">Submitted</span>
                  <span className="post__stamp-when">
                    {row.response.submittedAt
                      ? formatDateTime(row.response.submittedAt, timezone)
                      : "Not submitted"}
                  </span>
                  {/* Validity sits under the date — both are facts about the
                      submission rather than about what it says. A "done" stamp
                      used to be here too, but the reply it referred to is now
                      visible in the thread below. */}
                  {row.response.validity !== "valid" && (
                    <ValidityBadge
                      validity={row.response.validity as "flagged" | "invalid"}
                    />
                  )}
                </div>

                <div className="post__ident">
                  <p className="post__who">{who}</p>
                  <MetaList
                    items={[
                      row.instanceLabel,
                      // Named only when the reader has more than one, so the
                      // label carries information rather than repeating.
                      sections.length > 1 ? (section?.title ?? null) : null,
                    ]}
                  />
                </div>

                <div className="post__content">

                {/* Measurements first — they compare across the page, so they
                    stay visible and aligned. Then anything the student wrote,
                    in their own register, before the question they raised. */}
                <Measurements answers={row.answers} />
                <WrittenAnswers answers={row.answers} />

                {row.items.length === 0 ? (
                  /* They answered the form and asked nothing. There is no reply
                     to write, and saying so plainly beats a row of buttons that
                     would all be wrong. It still earns a post: this is where a
                     reader sees who took part, and where an empty submission is
                     judged. */
                  /* The answers are already above, so there is nothing to
                     re-count here — only the absence to state. */
                  <p className="post__quiet">
                    They answered the form and did not add a question or comment.
                  </p>
                ) : (
                  row.items.map((entry) => {
                    const { item, privateResponses, publicAnswers } = entry;
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
                    const isComment = item.kind === "general_comment";
                    const declined = item.disposition === "no_response";
                    const settled = entry.settled;

                    return (
                      <section className="post__item" key={item.id}>
                        {/* What kind of thing this is, before the thing itself —
                            a reader knows how to read "Question · Content"
                            before they start reading it, not after. */}
                        <p className="post__itemmeta">
                          <span>
                            {isComment
                              ? "General comment · never publishable"
                              : `${sentenceCase(item.submissionType)} · ${categoryShortLabel(item.category)}`}
                          </span>
                          {/* A stamp only where the body cannot say it. An
                              answered question shows its answer in the thread
                              below, so "Answered" was labelling something the
                              reader can already see; the states that leave no
                              trace still need words. */}
                          {published ? (
                            <Stamp tone="green">Published</Stamp>
                          ) : declined ? (
                            <Stamp tone="neutral">Not being answered</Stamp>
                          ) : isComment ? (
                            <Stamp tone="neutral">No reply needed</Stamp>
                          ) : settled ? null : (
                            <Stamp tone="amber">Needs a reply</Stamp>
                          )}
                        </p>

                        {/* The student's own words, in the document register,
                            because a person wrote them. */}
                        <blockquote className="post__words">
                          {item.originalText}
                        </blockquote>

                        {events.length > 0 && (
                          <Thread>
                            {events.map((event) => {
                              if (event.kind === "private") {
                                const message = event.response;
                                const fromStudent =
                                  message.authorRole === "student";
                                return (
                                  <ThreadMessage
                                    key={`private-${message.id}`}
                                    from={fromStudent ? "student" : "staff"}
                                    author={
                                      message.authorName ??
                                      (fromStudent
                                        ? "Identity hidden"
                                        : "A teaching team member")
                                    }
                                    mark={
                                      message.authorName
                                        ? initials(message.authorName)
                                        : null
                                    }
                                    action={
                                      fromStudent
                                        ? "followed up"
                                        : "replied privately"
                                    }
                                    at={message.createdAt}
                                    timezone={timezone}
                                  >
                                    <p className="thread__body">
                                      {message.body}
                                    </p>
                                  </ThreadMessage>
                                );
                              }

                              const { answer } = event;
                              return (
                                <ThreadMessage
                                  key={`public-${answer.id}`}
                                  from="public"
                                  author={
                                    answer.authorName ??
                                    "A teaching team member"
                                  }
                                  mark={
                                    answer.authorName
                                      ? initials(answer.authorName)
                                      : null
                                  }
                                  action={
                                    answer.state === "published"
                                      ? "answered the section"
                                      : answer.state === "scheduled"
                                        ? "scheduled an answer"
                                        : "drafted an answer"
                                  }
                                  at={event.at}
                                  timezone={timezone}
                                >
                                  {answer.publishFailed && (
                                    <p style={{ marginTop: 4 }}>
                                      <Stamp tone="red">Publication failed</Stamp>
                                    </p>
                                  )}
                                  <p className="thread__body">
                                    {answer.publicQuestionText}
                                  </p>
                                  {answer.answerBody && (
                                    <p className="thread__body">
                                      {answer.answerBody}
                                    </p>
                                  )}
                                  <p style={{ marginTop: 4 }}>
                                    {answer.state === "published" ? (
                                      <Link
                                        className="link small"
                                        href={`/sections/${sectionId}/qa?selected=${answer.id}`}
                                      >
                                        See it in the class Q&amp;A
                                      </Link>
                                    ) : canOn(sectionId, "draftPublicAnswers") ? (
                                      <Link
                                        className="link small"
                                        href={`/teach/sections/${sectionId}/publications`}
                                      >
                                        Finish it in the publication queue
                                      </Link>
                                    ) : null}
                                  </p>
                                </ThreadMessage>
                              );
                            })}
                          </Thread>
                        )}

                        <div className="post__actions">
                          {canOn(sectionId, "sendPrivateResponses") && (
                            <Dialog
                              variant="quiet"
                              className="post__action"
                              label={
                                <>
                                  <IconPrivate size={15} />
                                  Reply privately
                                </>
                              }
                              title="Reply privately"
                              description={`Only ${who} can see this.`}
                            >
                              <form action={sendPrivate}>
                                <input
                                  type="hidden"
                                  name="itemId"
                                  value={item.id}
                                />
                                <input
                                  type="hidden"
                                  name="responseId"
                                  value={row.response.id}
                                />
                                <div className="field-row">
                                  <label htmlFor={`private-${item.id}`}>
                                    Your reply{" "}
                                    <span className="required-mark">
                                      Required
                                    </span>
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

                          {/* A general comment is never triaged and can never
                              become a Q&A entry — the schema enforces it. The
                              button is absent rather than disabled, because an
                              action that cannot exist should not look like one
                              this reader merely lacks. */}
                          {!isComment && canOn(sectionId, "draftPublicAnswers") && (
                            <Dialog
                              variant="quiet"
                              className="post__action"
                              label={
                                <>
                                  <IconPublic size={15} />
                                  Answer publicly
                                </>
                              }
                              title="Answer this student's section"
                              description={`Everyone enrolled in ${section?.title ?? "their section"} sees the wording you write here. No other section does.`}
                            >
                              <PublicAnswerComposer
                                action={draftOrPublish}
                                itemId={item.id}
                                selectedResponseId={row.response.id}
                                /* The asker's own section. A shared form must
                                   not widen a publication, so the target is
                                   carried explicitly and re-checked
                                   server-side. */
                                sectionId={sectionId}
                                originalQuestion={item.originalText}
                                canPublish={canOn(
                                  sectionId,
                                  "publishPublicAnswers",
                                )}
                              />
                            </Dialog>
                          )}

                          {/* The third outcome. A question can be replied to,
                              published, or deliberately left — and without a
                              way to say the third, the queue never empties and
                              a reader has to reply to things that need no
                              reply. Reversible, audited, and invisible to the
                              student either way, so it needs no confirmation. */}
                          {/* Exactly the condition `declineToAnswer` enforces,
                              rather than a proxy for it: an item that already
                              carries a reply or a drafted answer has an outcome,
                              and "will not answer" would misdescribe it. Offering
                              the control there would only produce an error. */}
                          {!isComment &&
                            (item.disposition === "undecided" ||
                              item.disposition === "no_response") &&
                            canOn(sectionId, "reviewResponses") && (
                              <form action={declineAnswer}>
                                <input
                                  type="hidden"
                                  name="itemId"
                                  value={item.id}
                                />
                                <input
                                  type="hidden"
                                  name="responseId"
                                  value={row.response.id}
                                />
                                {declined && (
                                  <input type="hidden" name="undo" value="yes" />
                                )}
                                <button
                                  className="button button--quiet post__action"
                                  type="submit"
                                >
                                  <IconNoReply size={15} />
                                  {declined
                                    ? "Put back in the queue"
                                    : "Will not answer"}
                                </button>
                              </form>
                            )}
                        </div>
                      </section>
                    );
                  })
                )}

                {/* Validity last, and folded. It removes a student's
                    participation credit, so it must never sit beside Reply
                    where one slip costs someone their week. */}
                <ResponseValidity
                  responseId={row.response.id}
                  validity={row.response.validity}
                  canMark={canOn(sectionId, "markValidity")}
                  canFlag={canOn(sectionId, "flagValidity")}
                  isInstructor={isInstructorOn(sectionId)}
                  studentNumber={row.student?.studentNumber}
                  flagLine={
                    flagEvent
                      ? `${flagEvent.actorName}: ${(flagEvent.reason ?? "no reason given").replace(/_/g, " ")}${flagEvent.staffNote ? ` — ${flagEvent.staffNote}` : ""}`
                      : undefined
                  }
                  onFlag={flag}
                  onConfirm={confirmFlagged}
                  onDismiss={dismissFlag}
                  onInvalidate={invalidate}
                  onRestore={restoreValid}
                />
                </div>
              </article>
            );
          })}

          {/* The bottom of the pile, said out loud. A column with no end is the
              one thing this page must not become: the week is finite, and
              finishing it should feel like finishing. */}
          <p className="feed__end">
            That is all {visible.length}{" "}
            {visible.length === 1 ? "response" : "responses"}
            {currentCycle ? ` for ${currentCycle.label}` : ""}.{" "}
            {waitingCount > 0
              ? `${waitingCount} still ${waitingCount === 1 ? "needs" : "need"} a reply.`
              : "Nothing is waiting on you."}
          </p>
        </div>
      )}
    </AppShell>
  );
}

/**
 * The form answers, split by what they actually are.
 *
 * "Form answers" was one collapsed block holding two unrelated things, and it
 * served neither. A scale or a choice is a MEASUREMENT: its value is in the
 * comparison across students, which a per-row disclosure makes impossible —
 * thirty doors, and the numbers still never line up. A written answer is
 * AUTHORED PROSE, the same student writing in the same voice as the question
 * they raised themselves; filing it as metadata was a schema distinction
 * showing through into the reading.
 *
 * So the measurements come out and stay out, aligned down the page. The prose
 * goes where the student's other words are. Nothing is left to hide.
 */

/** How many meters stay visible before the rest go behind a count. */
const MEASUREMENTS_SHOWN = 3;

interface AnswerRow {
  prompt: string;
  type: string;
  scale: unknown;
  value: unknown;
  freeText: string | null;
}

function Measurements({ answers }: { answers: AnswerRow[] }) {
  const measured = answers
    .filter((a) => !a.freeText)
    .map((a) => ({
      label: shortPrompt(a.prompt),
      prompt: a.prompt,
      text: compactValue(a),
      scale: scaleOf(a),
    }))
    .filter((m): m is typeof m & { text: string } => !!m.text);
  if (measured.length === 0) return null;

  const shown = measured.slice(0, MEASUREMENTS_SHOWN);
  const rest = measured.slice(MEASUREMENTS_SHOWN);

  return (
    <div className="meters">
      <ul className="meters__list">
        {shown.map((m, i) => (
          <Meter key={i} {...m} />
        ))}
      </ul>
      {/* A form can carry a dozen questions. The first few earn their place in
          every row; the rest wait behind a count rather than making the header
          taller than the answer underneath it. */}
      {rest.length > 0 && (
        <details className="meters__more">
          <summary>{rest.length} more</summary>
          <ul className="meters__list">
            {rest.map((m, i) => (
              <Meter key={i} {...m} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * One measurement.
 *
 * The cells are the point: `2` alone cannot say whether it is near the bottom
 * of the range, and a reader scanning thirty rows should not have to divide.
 * They are drawn from the question's own scale, never invented — a question
 * with no scale, or one too long to cell honestly, shows its value as words.
 *
 * The cells are `aria-hidden`; the accessible name carries the same fact in
 * text, because a row of filled boxes is not something to read out.
 */
function Meter({
  label,
  prompt,
  text,
  scale,
}: {
  label: string;
  prompt: string;
  text: string;
  scale: { min: number; max: number; value: number } | null;
}) {
  return (
    <li className="meter" title={`${prompt}: ${text}`}>
      <span className="meter__label">{label}</span>
      {scale && (
        <span className="meter__cells" aria-hidden="true">
          {Array.from({ length: scale.max - scale.min + 1 }, (_, i) => (
            <span
              key={i}
              className={`meter__cell ${
                scale.min + i <= scale.value ? "meter__cell--on" : ""
              }`}
            />
          ))}
        </span>
      )}
      <span className="meter__value">{text}</span>
    </li>
  );
}

/**
 * The cells a value can honestly be drawn on, or null.
 *
 * Ten steps is the limit: past that the cells stop being countable at a glance,
 * which is the only thing they were for, and the number on its own is clearer.
 */
function scaleOf(
  answer: AnswerRow,
): { min: number; max: number; value: number } | null {
  const value = (answer.value ?? {}) as { scaleValue?: number };
  const scale = answer.scale as { min?: number; max?: number } | null;
  if (value.scaleValue === undefined) return null;
  const min = scale?.min ?? 1;
  const max = scale?.max;
  if (max === undefined || max - min + 1 > 10 || max <= min) return null;
  return { min, max, value: value.scaleValue };
}

/**
 * A written form answer, in the same shape as a question the student raised.
 *
 * Because it is the same thing: a person writing prose. The only difference is
 * what prompted it, which is exactly what the label says. It carries no stamp
 * and no actions — there is nothing here to answer, only something to read
 * before answering what is below it.
 */
function WrittenAnswers({ answers }: { answers: AnswerRow[] }) {
  const written = answers.filter((a) => a.freeText);
  if (written.length === 0) return null;
  return (
    <>
      {written.map((answer, index) => (
        <section className="post__item" key={index}>
          <p className="post__itemmeta">
            <span>{answer.prompt}</span>
          </p>
          <blockquote className="post__words">{answer.freeText}</blockquote>
        </section>
      ))}
    </>
  );
}

/**
 * A prompt short enough to sit in a scannable row without becoming a sentence.
 *
 * Cut on a word, never through one: "How difficult was the l…" could be the lab
 * or the lecture, and a label that cannot be told apart from its neighbour has
 * stopped being a label. The full prompt stays in the meter's `title` either
 * way, so nothing is actually lost — only deferred.
 */
function shortPrompt(prompt: string): string {
  const clean = prompt.replace(/[?:]\s*$/, "").trim();
  if (clean.length <= 32) return clean;
  const cut = clean.slice(0, 32);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 12 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** The answer as one readable token, or null when it cannot honestly be one. */
function compactValue(answer: { scale: unknown; value: unknown }): string | null {
  const value = (answer.value ?? {}) as {
    optionLabels?: string[];
    scaleValue?: number;
    boolValue?: boolean;
    dateValue?: string;
    timeValue?: string;
  };
  if (value.scaleValue !== undefined) {
    const max = (answer.scale as { max?: number } | null)?.max;
    return max ? `${value.scaleValue}/${max}` : String(value.scaleValue);
  }
  if (value.boolValue !== undefined) return value.boolValue ? "Yes" : "No";
  if (value.optionLabels?.length) return value.optionLabels.join(", ");
  return value.dateValue ?? value.timeValue ?? null;
}

/**
 * Participation credit, in a disclosure at the foot of the post.
 *
 * Folded on purpose. Marking a submission invalid removes a student's credit for
 * the week; putting that one slip away from "Reply privately" would be a
 * destructive default. Opening it costs one click and states what it is for.
 *
 * The student number lives here too rather than in the header — it is an
 * identifier a reader needs while making this decision, not while reading.
 */
function ResponseValidity({
  responseId,
  validity,
  canMark,
  canFlag,
  isInstructor,
  studentNumber,
  flagLine,
  onFlag,
  onConfirm,
  onDismiss,
  onInvalidate,
  onRestore,
}: {
  responseId: string;
  validity: string;
  canMark: boolean;
  canFlag: boolean;
  isInstructor: boolean;
  studentNumber?: string | null;
  flagLine?: string;
  onFlag: (formData: FormData) => Promise<void>;
  onConfirm: (formData: FormData) => Promise<void>;
  onDismiss: (formData: FormData) => Promise<void>;
  onInvalidate: (formData: FormData) => Promise<void>;
  onRestore: (formData: FormData) => Promise<void>;
}) {
  const canDecide = isInstructor && canMark;
  const offers =
    (validity === "valid" && (canDecide || (canFlag && !isInstructor))) ||
    (validity === "flagged" && canDecide) ||
    (validity === "invalid" && canDecide);
  if (!offers) return null;

  return (
    <details className="post__validity">
      <summary>Participation credit</summary>
      <div className="post__validity-body">
        {studentNumber && (
          <p className="meta">
            Student number <span className="ident">{studentNumber}</span>
          </p>
        )}

        {validity === "valid" && canDecide && (
          <Dialog
            variant="danger"
            className="button--small"
            label="Mark as invalid"
            title="Mark this submission as invalid?"
            description="This removes the week's participation credit. It is recorded and can be reversed."
          >
            <form action={onInvalidate}>
              <input type="hidden" name="responseId" value={responseId} />
              <div className="field-row">
                <label htmlFor={`invalid-reason-${responseId}`}>Reason</label>
                <select
                  id={`invalid-reason-${responseId}`}
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
                <label htmlFor={`invalid-student-${responseId}`}>
                  What the student sees{" "}
                  <span className="required-mark">Required</span>
                </label>
                <input
                  id={`invalid-student-${responseId}`}
                  className="field"
                  name="studentVisibleReason"
                  required
                />
              </div>
              <div className="row">
                <button className="button button--danger" type="submit">
                  Mark as invalid
                </button>
              </div>
            </form>
          </Dialog>
        )}

        {/* A student assistant may flag; only an instructor decides. */}
        {validity === "valid" && canFlag && !isInstructor && (
          <Dialog
            className="button--small"
            label="Flag for the instructor"
            title="Flag this submission?"
            description="The week's credit is kept until an instructor decides. The student is never told a flag exists."
          >
            <form action={onFlag}>
              <input type="hidden" name="responseId" value={responseId} />
              <div className="field-row">
                <label htmlFor={`flag-reason-${responseId}`}>Reason</label>
                <select
                  id={`flag-reason-${responseId}`}
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
                <label htmlFor={`flag-note-${responseId}`}>
                  Note for the instructor{" "}
                  <span className="optional-mark">optional</span>
                </label>
                <input
                  id={`flag-note-${responseId}`}
                  className="field"
                  name="note"
                />
              </div>
              <div className="row">
                <button className="button button--primary" type="submit">
                  Flag for the instructor
                </button>
              </div>
            </form>
          </Dialog>
        )}

        {validity === "flagged" && canDecide && (
          <Dialog
            className="button--small"
            label="Decide on this flag"
            title="A student assistant flagged this submission"
            description={flagLine}
          >
            <form action={onConfirm}>
              <input type="hidden" name="responseId" value={responseId} />
              <div className="field-row">
                <label htmlFor={`confirm-reason-${responseId}`}>Reason</label>
                <select
                  id={`confirm-reason-${responseId}`}
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
                <label htmlFor={`confirm-student-${responseId}`}>
                  What the student sees{" "}
                  <span className="required-mark">Required</span>
                </label>
                <input
                  id={`confirm-student-${responseId}`}
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
            <form action={onDismiss} style={{ marginTop: "var(--s4)" }}>
              <input type="hidden" name="responseId" value={responseId} />
              <button className="button button--secondary" type="submit">
                Dismiss the flag and keep the credit
              </button>
            </form>
          </Dialog>
        )}

        {validity === "invalid" && canDecide && (
          <form action={onRestore} className="inline-form">
            <input type="hidden" name="responseId" value={responseId} />
            <button
              className="button button--secondary button--small"
              type="submit"
            >
              Restore the credit
            </button>
          </form>
        )}
      </div>
    </details>
  );
}

/** An internal enum value, said the way a person would say it. */
function sentenceCase(value: string): string {
  const words = value.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
