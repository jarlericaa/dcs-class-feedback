import { RequiredMark } from "@/components/ui/required-mark";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { toShellUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { courseSubtitle } from "@/components/staff/course-heading";
import { classSections, courses } from "@/db/schema";
import { formatDateTime, initials } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import {
  courseTabGroups,
  staffSectionTabGroups,
} from "@/components/layout/nav";
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
  Stamp,
  ValidityBadge,
} from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { TagList } from "@/components/ui/tag";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { MarkReadOnView } from "@/components/staff/mark-read-on-view";
import { Dialog } from "@/components/ui/dialog";
import { ScrollToPost } from "@/components/ui/scroll-to";
import { Thread, ThreadMessage } from "@/components/ui/thread";
import {
  IconNoReply,
  IconPrivate,
  IconPublic,
  IconSearch,
} from "@/components/ui/icons";
import { PreRenderedRichText } from "@/components/rich-text-client";
import { LongText } from "@/components/ui/long-text";
import { renderRichText, richTextToPlain } from "@/modules/richtext/render";
import { PublicAnswerComposer } from "@/components/staff/public-answer-composer";
import {
  confirmFlag,
  createPrivateResponse,
  declineToAnswer,
  flagSubmission,
  getCourseReviewQueue,
  getValidityHistory,
  invalidateSubmission,
  listReadResponseIds,
  markResponseRead,
  markResponseUnread,
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
import { Field, FieldRow, Select, Textarea } from "@/components/ui/form";

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
 * Read state, a SECOND and independent dimension (GitHub issue #6).
 *
 * Not folded into the filter above, because the two answer different
 * questions: "what still needs work" is about the submission, "what have I not
 * read" is about this reader. A response can be answered and unread (a
 * colleague dealt with it) or unanswered and read (you read it and moved on),
 * and one control could not express either.
 *
 * Read/unread rather than seen/unseen in the copy. The issue borrows
 * Messenger's word; what a teacher does with a response is READ it, and
 * "seen" in a product that also promises anonymity invites the wrong reading.
 */
const READ_FILTERS = [
  { key: "all", label: "Read and unread" },
  { key: "unread", label: "Unread only" },
] as const;

type ReadFilter = (typeof READ_FILTERS)[number]["key"];

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

type QueueRow = Awaited<
  ReturnType<typeof getCourseReviewQueue>
>["rows"][number];

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

/**
 * Stands in for "occurrences with no recorded form version" in the `form`
 * param. A sentinel rather than an empty string, which the URL cannot tell
 * apart from "not chosen".
 */
const UNASSIGNED_FORM = "unassigned";

export default async function CourseResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    filter?: string;
    /**
     * one FORM — the outer axis. A course can run several, and an occurrence
     * label ("Week 1") does not say which form it belongs to, so without this
     * a two-form course showed both forms' weeks in one undifferentiated list.
     * `courses/[id]/page.tsx` has always linked here with it.
     */
    form?: string;
    /** one form occurrence — the week this column is reading, within `form` */
    cycle?: string;
    /** one class section, when the reader has more than one */
    section?: string;
    /** read state: everything, or only what this reader has not read */
    seen?: string;
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
  const readFilter = (READ_FILTERS.find((f) => f.key === sp.seen)?.key ??
    "all") as ReadFilter;

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
  const { rows: scopeRows, instances, sections, canSeeIdentities } = queue;
  const course = (await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  }))!;

  /* The same header this course shows on every other tab. One extra column
     read, so that navigating a tab does not change the heading — see
     `courseSubtitle`. */
  const courseTerms = [
    ...new Set(
      (
        await db
          .select({ term: classSections.term })
          .from(classSections)
          .where(eq(classSections.courseId, courseId))
      ).map((row) => row.term),
    ),
  ];

  /**
   * The forms this course runs, newest occurrence first.
   *
   * Built from the occurrences rather than queried separately, so the list can
   * only ever contain forms this reader is already authorized to see — the
   * scope resolution upstream is what makes that true, and re-querying
   * `formTemplates` by course would quietly widen it.
   */
  const forms: { id: string; title: string }[] = [];
  for (const entry of instances) {
    const form = entry.form;
    if (form && !forms.some((f) => f.id === form.id)) forms.push(form);
  }
  const hasUnassigned = instances.some((i) => !i.form);

  /**
   * Which form the column is reading.
   *
   * An unknown id is not honoured: it falls back to the default rather than
   * rendering an empty column for a form that does not exist in this scope.
   */
  const defaultInstance =
    instances.find((i) => i.responseCount > 0) ?? instances[0];
  const currentFormId =
    (sp.form && forms.some((f) => f.id === sp.form)) ||
    (sp.form === UNASSIGNED_FORM && hasUnassigned)
      ? sp.form
      : (defaultInstance?.form?.id ??
        (hasUnassigned ? UNASSIGNED_FORM : undefined));

  /** The chosen form's own occurrences — the only ones the week switcher offers. */
  const formInstances = currentFormId
    ? instances.filter((i) =>
        currentFormId === UNASSIGNED_FORM
          ? !i.form
          : i.form?.id === currentFormId,
      )
    : instances;

  /**
   * Which week the column is reading, WITHIN the chosen form.
   *
   * Without an explicit choice it is the most recent occurrence anyone has
   * actually answered — landing on next week's empty form would be technically
   * correct and useless. `instances` arrives newest-first.
   */
  const currentCycleId =
    (sp.cycle && formInstances.some((i) => i.instance.id === sp.cycle)
      ? sp.cycle
      : undefined) ??
    formInstances.find((i) => i.responseCount > 0)?.instance.id ??
    formInstances[0]?.instance.id;

  /**
   * A `cycle` belonging to a DIFFERENT form is stale — the reader just changed
   * forms and the browser resubmitted the old week alongside the new form.
   *
   * The rows above were fetched for that stale week, so they cannot simply be
   * re-filtered; correcting the URL and letting the page load again is both
   * cheaper than always fetching the whole term and honest about what the
   * reader asked for.
   */
  if (sp.cycle && sp.cycle !== currentCycleId) {
    const corrected = new URLSearchParams(
      Object.entries({
        filter: sp.filter,
        form: currentFormId,
        cycle: currentCycleId,
        section: sp.section,
        seen: sp.seen,
        category: sp.category,
        q: sp.q,
      }).filter((entry): entry is [string, string] => !!entry[1]),
    ).toString();
    redirect(corrected ? `${path}?${corrected}` : path);
  }

  /**
   * Narrowed to the week the selector is SHOWING, which is not the same thing
   * as the week the query was given.
   *
   * The fetch above passes `sp.cycle`, and that is undefined until the reader
   * picks a week explicitly — so a first load asked for every occurrence while
   * the selector displayed the default one. The result was a column headed
   * "Week 8" listing Week 3 posts, with counts to match. The default cannot
   * move into the query, because deriving it needs the occurrence list the
   * query returns; so it is applied here, where the selector's own value is
   * finally known.
   *
   * Counts are re-derived over the same narrowed set rather than taken from
   * the service, for exactly the same reason: they describe the week on
   * screen, and the service counted the scope it was asked for.
   */
  const rows = currentCycleId
    ? scopeRows.filter((row) => row.response.cycleId === currentCycleId)
    : scopeRows;
  const counts = {
    total: rows.length,
    needsReview: rows.filter(needsReply).length,
    answered: rows.filter((row) => row.answered).length,
    invalid: rows.filter((row) => row.response.validity === "invalid").length,
  };

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
          [
            section.id,
            await getSectionAccess(db, user.id, section.id),
          ] as const,
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

  /**
   * Which of this week's responses this reader has already read.
   *
   * One query for the whole occurrence, resolved before any filtering so the
   * unread COUNT describes the week rather than whatever is on screen. The ids
   * handed over have already been scoped to the reader's own sections by
   * `getCourseReviewQueue`.
   */
  const readIds = await listReadResponseIds(
    user.id,
    rows.map((row) => row.response.id),
  );
  const isUnread = (row: QueueRow) => !readIds.has(row.response.id);
  const unreadInScope = rows.filter(isUnread).length;

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

  const submittedAt = (row: QueueRow) =>
    row.response.submittedAt ?? new Date(0);
  /**
   * Unread first, then oldest first inside each group.
   *
   * "Resume where you left off" is the whole request, and ordering delivers it
   * without hiding anything: what you have not read leads the column, and what
   * you have is still there below it. Oldest-first survives INSIDE the unread
   * group, which is where the fairness argument actually bites — reverse
   * chronology would keep starving whoever asked earliest.
   *
   * Seen rows are NOT filtered out by default, though the issue offers that as
   * an alternative. Hiding two thirds of a week on arrival makes "where did the
   * rest go?" the first question a teacher asks, and puts the number on this
   * page at odds with the count in the navigation. The Unread-only filter is
   * one click away for anyone who wants it, and it is in the URL.
   *
   * The order is computed once per render, so nothing moves under the cursor
   * while a reader works down the column; marking something read reorders on
   * the NEXT navigation, and the `at` anchor carries them back to the post they
   * acted on.
   */
  const visible = rows
    .filter(
      (row) =>
        matchesSearch(row) &&
        matchesCategory(row) &&
        matchesFilter(row) &&
        (readFilter === "all" || isUnread(row)),
    )
    .sort((a, b) => {
      const unread = Number(isUnread(b)) - Number(isUnread(a));
      if (unread !== 0) return unread;
      return submittedAt(a).getTime() - submittedAt(b).getTime();
    });

  const nextWaiting = visible.find(
    (row) => needsReply(row) && !reviewedThisSession.has(row.response.id),
  );
  const waitingCount = visible.filter(
    (row) => needsReply(row) && !reviewedThisSession.has(row.response.id),
  ).length;

  /**
   * The occurrence's question prompts and help text, rendered ONCE.
   *
   * These are staff-authored rich text — the same Markdown, code and LaTeX the
   * student was shown — and the review view used to print them as raw strings,
   * so a prompt reading `How confident are you about $\\int x^3\\,dx$?` reached a
   * teacher as literal dollar signs. Rendered here, keyed by question id,
   * because every post in the week shares one snapshot: N distinct prompts, not
   * N x students. `renderRichText` is the single sanctioned renderer and it
   * memoizes on the source as well.
   */
  const questionHtml = new Map<
    string,
    { prompt: string; description: string; plain: string }
  >();
  for (const row of visible) {
    for (const answer of row.answers) {
      if (questionHtml.has(answer.questionId)) continue;
      questionHtml.set(answer.questionId, {
        prompt: await renderRichText(answer.prompt),
        description: await renderRichText(answer.description),
        /* Markup stripped, never rendered: this one goes into a compact label
           and a `title`, both of which must be plain text. */
        plain: richTextToPlain(answer.prompt) || answer.prompt,
      });
    }
  }

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
  const tabGroups = showsCourseTabs
    ? courseTabGroups(
        courseId,
        path,
        { needsReview: counts.needsReview },
        sections.length === 1
          ? (accessBySection.get(sections[0]!.id) ?? null)
          : null,
      )
    : staffSectionTabGroups(railAccess!, path, {
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
      form: currentFormId,
      cycle: currentCycleId,
      section: sp.section,
      seen: readFilter === "all" ? undefined : readFilter,
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
    /* Resolving a post means having read it. Persisted as well as marked for
       this sitting: the session cookie keeps the post in place under "needs a
       reply", the row keeps it out of the unread pile tomorrow. */
    await markResponseRead(uid, responseId, "resolved");
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
    /* Resolving a post means having read it. Persisted as well as marked for
       this sitting: the session cookie keeps the post in place under "needs a
       reply", the row keeps it out of the unread pile tomorrow. */
    await markResponseRead(uid, responseId, "resolved");
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
    /* Resolving a post means having read it. Persisted as well as marked for
       this sitting: the session cookie keeps the post in place under "needs a
       reply", the row keeps it out of the unread pile tomorrow. */
    await markResponseRead(uid, responseId, "resolved");
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
    /* Resolving a post means having read it. Persisted as well as marked for
       this sitting: the session cookie keeps the post in place under "needs a
       reply", the row keeps it out of the unread pile tomorrow. */
    await markResponseRead(uid, responseId, "resolved");
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
   * The student is told nothing: docs/domain/domain-model.md §3.5 is explicit that `No
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
    if (undo) {
      await unmarkReviewedThisSession(responseId);
      /* Putting a question back in the queue does NOT make it unread: the
         reader has plainly read it. Only the "done in this sitting" mark is
         reversed, which is what the undo is about. */
    } else {
      await markReviewedThisSession(responseId);
      await markResponseRead(uid, responseId, "resolved");
    }
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

  /**
   * Read state, the three deliberate moves (GitHub issue #6).
   *
   * All three re-authorize inside the service on the response's OWN section, so
   * a forged id from a course this reader does not staff is refused rather than
   * written. Each lands back on the post it acted on, for the same reason every
   * other action here does.
   */
  /**
   * The same write, fired by having actually read the thing (see
   * `MarkReadOnView`).
   *
   * Quiet on purpose: no `revalidatePath`, no `redirect`. Both would rearrange
   * the column underneath a reader mid-response — and with "Unread only" on,
   * revalidating would delete the row they are reading out from under them.
   * The state is correct on the next load, which is when it is read back.
   *
   * Recorded as `viewed`, which the service deliberately does not audit: one
   * row per response somebody scrolled past would bury the entries that record
   * an actual decision.
   */
  async function markReadOnView(responseId: string) {
    "use server";
    const uid = await currentUserId();
    if (!uid) return;
    await markResponseRead(uid, responseId, "viewed");
  }

  async function markUnread(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const responseId = String(formData.get("responseId"));
    await markResponseUnread(uid, responseId);
    revalidatePath(path);
    {
      const back = new URLSearchParams(backQuery);
      back.set("at", responseId);
      redirect(`${path}?${back.toString()}`);
    }
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
    /* Resolving a post means having read it. Persisted as well as marked for
       this sitting: the session cookie keeps the post in place under "needs a
       reply", the row keeps it out of the unread pile tomorrow. */
    await markResponseRead(uid, responseId, "resolved");
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
      tabGroups={tabGroups}
      tabsMode={showsCourseTabs ? undefined : "menu"}
      tabsLabel={
        showsCourseTabs
          ? course.code
          : (railAccess?.section.title ?? course.code)
      }
      contextLabel={course.code}
      /*
        The COURSE is the heading here, not "Responses" — the owner's question:
        *"selected tab from the cs33 like responses replaces the cs33 with
        Responses, but the forms doesnt do that? … shud we really replace the
        heading?"*

        No. Forms and Responses are two views OF one course, so the course is
        the subject on both and the active tab says which view you are in.
        Replacing the heading with the tab's name did two bad things at once: it
        repeated the tab (which is already marked maroon and underlined a few
        pixels below) and it threw away the only thing that said WHICH course
        you were looking at. It also made the two tabs inconsistent, since Forms
        kept the course and Responses did not.

        The breadcrumb carries the path, the heading carries the subject, the
        tab carries the view. Nothing says the same thing twice.
      */
      crumbs={[
        { href: "/teach/courses", label: "My courses" },
        { href: `/teach/courses/${courseId}`, label: course.code },
      ]}
      title={course.code}
      description={courseSubtitle({ title: course.title, terms: courseTerms })}
    >
      {sp.at && <ScrollToPost anchorId={`r-${sp.at}`} />}

      <div className="stack-4 mb-6">
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
              this whole column is, before anything narrows it.

              Two controls, because they are two questions. The form is the
              outer axis and the occurrence lives inside it; one merged list of
              every form's weeks could offer two indistinguishable "Week 1"s.

              Both live in one GET form, so changing the form resubmits the
              previous form's `cycle` along with it. That is handled above, by
              correcting the URL rather than by splitting the controls into two
              forms - a second form would break the `noscript` submit, which is
              the only way this bar works before hydration. */}
          {instances.length > 0 && (
            <div className="feedbar__scope">
              {forms.length + (hasUnassigned ? 1 : 0) > 1 && (
                <AutoSubmitSelect
                  id="feed-form"
                  name="form"
                  defaultValue={currentFormId ?? ""}
                  label="Which form"
                >
                  {forms.map((form) => (
                    <option key={form.id} value={form.id}>
                      {form.title}
                    </option>
                  ))}
                  {hasUnassigned && (
                    <option value={UNASSIGNED_FORM}>Other occurrences</option>
                  )}
                </AutoSubmitSelect>
              )}
              {formInstances.length > 1 && (
                <AutoSubmitSelect
                  id="feed-week"
                  name="cycle"
                  defaultValue={currentCycleId ?? ""}
                  label="Which occurrence"
                >
                  {formInstances.map(({ instance, label }) => (
                    <option key={instance.id} value={instance.id}>
                      {label}
                      {instance.state === "open" ? " · open" : ""}
                    </option>
                  ))}
                </AutoSubmitSelect>
              )}
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
              // was `.feedbar__line .select-field` (§3.2)
              className="max-w-[22ch]"
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

            {/* Read state, this reader's own. Offered whenever there is anything
              to read: the count is what says how much of the week is left. */}
            {counts.total > 0 && (
              <AutoSubmitSelect
                id="feed-seen"
                name="seen"
                defaultValue={readFilter}
                label="Read"
              >
                {READ_FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.key === "all"
                      ? `${f.label} (${counts.total})`
                      : `${f.label} (${unreadInScope})`}
                  </option>
                ))}
              </AutoSubmitSelect>
            )}

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

        {/* A `div`, not a `p`: it carries the mark-all form, and a form inside
            a paragraph is invalid markup that browsers silently repair by
            moving it out. */}
        <div className="feedbar__status">
          <span>
            <strong>{visible.length}</strong>{" "}
            {visible.length === 1 ? "response" : "responses"} shown
          </span>
          {/* How much of the week is left to READ, which is a different
              question from how much is left to answer — and the one a reader
              coming back to a half-finished column is asking. */}
          {unreadInScope > 0 && (
            <span className="feedbar__unread">{unreadInScope} unread</span>
          )}
          {waitingCount > 0 ? (
            <>
              <span className="feedbar__waiting">
                {waitingCount} still {waitingCount === 1 ? "needs" : "need"} a
                reply
              </span>
              {nextWaiting && (
                <a
                  className="link small"
                  href={`#r-${nextWaiting.response.id}`}
                >
                  Jump to the next one
                </a>
              )}
            </>
          ) : (
            <span>Nothing here is waiting on you.</span>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={
            counts.total === 0
              ? "No responses yet"
              : /* Reaching the bottom of the unread pile is FINISHING, not a
                   failed search, and it should read like it. */
                readFilter === "unread" && unreadInScope === 0
                ? "You have read all of these"
                : "Nothing matches these filters"
          }
          action={
            readFilter === "unread" && unreadInScope === 0
              ? {
                  href: `${path}?${new URLSearchParams(
                    Object.entries({
                      filter,
                      form: currentFormId,
                      cycle: currentCycleId,
                      section: sp.section,
                    }).filter((e): e is [string, string] => !!e[1]),
                  ).toString()}`,
                  label: "Show everything again",
                }
              : undefined
          }
        >
          {counts.total === 0
            ? undefined
            : readFilter === "unread" && unreadInScope === 0
              ? `All ${counts.total} of this form's responses are marked as read for your account. Nobody else's view changed.`
              : "Try another form, a wider filter, or clear the search."}
        </EmptyState>
      ) : (
        <div className="feed">
          {visible.map((row) => {
            const sectionId = row.response.sectionId;
            const timezone = timezoneOf(sectionId);
            const doneNow = reviewedThisSession.has(row.response.id);
            const unread = isUnread(row);
            const waiting = needsReply(row);
            const section = sections.find((s) => s.id === sectionId);
            const flagEvent = flagEvents.get(row.response.id) ?? null;
            const who = row.student?.fullName ?? "Identity hidden";

            return (
              <article
                className={`post ${waiting && !doneNow ? "post--waiting" : ""} ${
                  row.response.validity === "invalid" ? "post--invalid" : ""
                } ${unread ? "post--unread" : ""}`}
                key={row.response.id}
                id={`r-${row.response.id}`}
              >
                {/* Three columns: who, what they said, and when. The time
                    leaves the name line for a column of its own so the dates
                    line up down the page and can be compared without reading
                    the rest of the row. */}
                {/* Reading it is what marks it read. Mounted only while the
                    post is still unread, so a re-render of an already-read
                    column starts no observers at all. */}
                {unread && (
                  <MarkReadOnView
                    responseId={row.response.id}
                    action={markReadOnView}
                  />
                )}

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
                  {/* This reader's own marker, and only theirs — a colleague
                      reading the same post sees their own state. Never shown
                      to the student: whether staff have opened a submission is
                      not a promise this product makes. */}
                  {unread && <Stamp tone="amber">Unread</Stamp>}
                </div>

                <div className="post__ident">
                  <p className="post__who">{who}</p>
                  {/* Which occurrence this submission belongs to, as a tag: it
                      is the fact a reader scanning a mixed column looks for
                      first, and as dot-separated metadata it read as part of
                      the student's name line. */}
                  <TagList
                    items={[
                      row.instanceLabel,
                      // Named only when the reader has more than one, so the
                      // label carries information rather than repeating.
                      sections.length > 1 ? (section?.title ?? null) : null,
                    ]}
                  />
                </div>

                <div className="post__content">
                  {/* The form, as the form asks it: every question this
                    occurrence actually put to the student, in its authored
                    order, answered or not. */}
                  <FormAnswers answers={row.answers} rendered={questionHtml} />

                  {row.items.length === 0 ? (
                    /* They answered the form and asked nothing. There is no reply
                     to write, and saying so plainly beats a row of buttons that
                     would all be wrong. It still earns a post: this is where a
                     reader sees who took part, and where an empty submission is
                     judged. */
                    /* The answers are already above, so there is nothing to
                     re-count here — only the absence to state. */
                    <p className="post__quiet">
                      They answered the form and did not add a question or
                      comment.
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
                              {/* Just what it is. "· never publishable" was
                                policy trivia about a thing the reader was not
                                trying to publish, printed on every general
                                comment; the "No reply needed" stamp beside it
                                already says what to do with one. */}
                              {isComment
                                ? "General comment"
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
                                      <p className="mt-1">
                                        <Stamp tone="red">
                                          Publication failed
                                        </Stamp>
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
                                    <p className="mt-1">
                                      {answer.state === "published" ? (
                                        <Link
                                          className="link small"
                                          href={`/sections/${sectionId}/qa?selected=${answer.id}`}
                                        >
                                          See it in the class Q&amp;A
                                        </Link>
                                      ) : canOn(
                                          sectionId,
                                          "draftPublicAnswers",
                                        ) ? (
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
                                  <FieldRow
                                    label={
                                      <>
                                        Your reply <RequiredMark />
                                      </>
                                    }
                                    htmlFor={`private-${item.id}`}
                                  >
                                    <Textarea
                                      id={`private-${item.id}`}
                                      name="body"
                                      rows={6}
                                      required
                                    />
                                  </FieldRow>
                                  <div className="row">
                                    <SubmitButton
                                      variant="primary"
                                      pendingLabel="Sending…"
                                    >
                                      Send private reply
                                    </SubmitButton>
                                  </div>
                                </form>
                              </Dialog>
                            )}

                            {/* A general comment is never triaged and can never
                              become a Q&A entry — the schema enforces it. The
                              button is absent rather than disabled, because an
                              action that cannot exist should not look like one
                              this reader merely lacks. */}
                            {!isComment &&
                              canOn(sectionId, "draftPublicAnswers") && (
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
                                    <input
                                      type="hidden"
                                      name="undo"
                                      value="yes"
                                    />
                                  )}
                                  <SubmitButton
                                    variant="quiet"
                                    className="post__action"
                                  >
                                    <IconNoReply size={15} />
                                    {declined
                                      ? "Put back in the queue"
                                      : "Will not answer"}
                                  </SubmitButton>
                                </form>
                              )}
                          </div>
                        </section>
                      );
                    })
                  )}

                  {/* The foot of the post: where this reader marks their own
                    place, and where the one destructive control is folded
                    away. Both are about the response as a whole rather than
                    about any one question in it. */}
                  <div className="post__foot">
                    {/* Only the reversal. "Mark as read" asked the reader to
                      tell the page something it can see for itself, once per
                      response, down a whole week — reading now does that on
                      its own. Putting one BACK is a real intention and has no
                      other way to be expressed, so that control stays. */}
                    {!unread && (
                      <form action={markUnread}>
                        <input
                          type="hidden"
                          name="responseId"
                          value={row.response.id}
                        />
                        <SubmitButton variant="quiet" size="small">
                          Mark as unread
                        </SubmitButton>
                      </form>
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
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

/**
 * The occurrence's own questions, and this student's answers to them.
 *
 * Driven entirely by the form's SNAPSHOT: `getCourseReviewQueue` reads
 * `form_questions` for this response's occurrence ordered by `displayOrder`,
 * so what appears here is whatever was actually authored for that week — its
 * real prompts, its real types, its real order, including a per-occurrence
 * customization that differs from the base form. Nothing about the question set
 * is assumed by this page.
 *
 * Authored order is kept, and that is a correction. Every measurement used to
 * be hoisted above every written answer, which read the form back to a teacher
 * in an order they had never written. Runs of adjacent measurements are still
 * grouped into one aligned block — that is what makes a scale comparable down
 * the page — but a group never jumps a question that came before it.
 *
 * A scale or a choice is a MEASUREMENT: its value is in the comparison across
 * students, so it stays compact and aligned. A written answer is AUTHORED
 * PROSE, the same student writing in the same voice as the question they raised
 * themselves, so it is set as a quotation. The split follows the question's
 * TYPE, not whether a value happens to be free text — which is what used to
 * file an unanswered paragraph question as a measurement.
 */

/** How many measurements in one run stay visible before the rest go behind a count. */
const MEASUREMENTS_SHOWN = 3;

/**
 * The two question types whose answer is prose a person wrote. Everything else
 * — scale, choice, checkboxes, dropdown, yes/no, date, time — measures.
 */
const PROSE_TYPES = new Set(["short_answer", "paragraph"]);

interface AnswerRow {
  questionId: string;
  prompt: string;
  description: string | null;
  type: string;
  required: boolean;
  displayOrder: number;
  scale: unknown;
  /** false when the form asked and the student left it blank */
  answered: boolean;
  value: unknown;
  freeText: string | null;
}

/** Prompt and help text, already through the one sanctioned renderer. */
type RenderedQuestions = Map<
  string,
  { prompt: string; description: string; plain: string }
>;

function FormAnswers({
  answers,
  rendered,
}: {
  answers: AnswerRow[];
  rendered: RenderedQuestions;
}) {
  if (answers.length === 0) return null;

  // One pass in authored order, collecting adjacent measurements together so
  // they can be drawn as one aligned block without reordering anything.
  const blocks: (
    { kind: "meters"; rows: AnswerRow[] } | { kind: "prose"; row: AnswerRow }
  )[] = [];
  for (const row of answers) {
    if (PROSE_TYPES.has(row.type)) {
      blocks.push({ kind: "prose", row });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.kind === "meters") last.rows.push(row);
    else blocks.push({ kind: "meters", rows: [row] });
  }

  return (
    <>
      {blocks.map((block, index) =>
        block.kind === "meters" ? (
          <Measurements
            key={`m-${index}`}
            rows={block.rows}
            rendered={rendered}
          />
        ) : (
          <WrittenAnswer
            key={block.row.questionId}
            row={block.row}
            rendered={rendered}
          />
        ),
      )}
    </>
  );
}

function Measurements({
  rows,
  rendered,
}: {
  rows: AnswerRow[];
  rendered: RenderedQuestions;
}) {
  const measured = rows.map((row) => {
    const meta = rendered.get(row.questionId);
    return {
      // Plain text, never markup: this is the visible question label.
      label: promptLabel(meta?.plain ?? row.prompt),
      /**
       * `blank` and "no printable value" are different facts, and conflating
       * them would put "Not answered" under a question the student did answer.
       * Every measurement type `validateAnswers` accepts produces a printable
       * value, so the second arm is defensive — but it must not lie.
       */
      blank: !row.answered,
      text: row.answered ? compactValue(row) : null,
      scale: row.answered ? scaleOf(row) : null,
    };
  });

  const shown = measured.slice(0, MEASUREMENTS_SHOWN);
  const rest = measured.slice(MEASUREMENTS_SHOWN);

  return (
    <div className="meters">
      <ul className="meters__list">
        {shown.map((m, i) => (
          <Meter key={i} {...m} />
        ))}
      </ul>
      {/* A form can carry a dozen questions. The first few stay visible in each
          compact block; the rest wait behind a count so a long form does not
          make every response unnecessarily tall. */}
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
 *
 * `blank` means the form ASKED and the student left it blank. Saying so is the
 * point: a dropped row made a skipped question indistinguishable from one this
 * form never contained.
 */
function Meter({
  label,
  text,
  scale,
  blank,
}: {
  label: string;
  text: string | null;
  scale: { min: number; max: number; value: number } | null;
  blank: boolean;
}) {
  return (
    <li className="meter">
      <span className="meter__label">{label}</span>
      {/* No separator glyph. The answer sits under the question now, so there
          is no gap between them for a dash to bridge — and an em dash floating
          mid-row was reading as punctuation inside the question itself. */}
      <span className="meter__answer">
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
        {blank ? (
          <span className="meter__value meter__value--blank">Not answered</span>
        ) : (
          <span className="meter__value">{text ?? "Answered"}</span>
        )}
      </span>
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
 * A written form answer, under the question that prompted it.
 *
 * The prompt is rendered through the one sanctioned renderer, in the register
 * the student saw it in — a teacher reviewing an answer to a formula needs to
 * read the formula, not its source. The answer beneath it is the student's own
 * words, quoted, and a long one collapses so that one essay cannot bury the
 * twenty-nine responses after it.
 *
 * It carries no stamp and no actions: there is nothing here to answer, only
 * something to read before answering what is below it.
 */
function WrittenAnswer({
  row,
  rendered,
}: {
  row: AnswerRow;
  rendered: RenderedQuestions;
}) {
  const meta = rendered.get(row.questionId);
  return (
    <section className="post__item">
      <div className="post__ask">
        <div className="post__prompt">
          {meta?.prompt ? (
            <PreRenderedRichText
              html={meta.prompt}
              className="rich-text--inline"
            />
          ) : (
            row.prompt
          )}
        </div>
        {!row.answered && <Stamp tone="neutral">Not answered</Stamp>}
      </div>
      {meta?.description && (
        <div className="post__askdesc">
          <PreRenderedRichText html={meta.description} />
        </div>
      )}
      {row.answered ? (
        <LongText text={row.freeText ?? ""} />
      ) : (
        <p className="post__blank">
          {row.required
            ? "Left blank, though the form required it."
            : "The student left this optional question blank."}
        </p>
      )}
    </section>
  );
}

/** Keep the full question visible so a label never depends on hover or focus. */
function promptLabel(prompt: string): string {
  return prompt.replace(/[?:]\s*$/, "").trim();
}

/**
 * The answer as one readable token, or null when it cannot honestly be one.
 *
 * Null also means "asked and not answered" once the caller has checked
 * `answered`; both render as words rather than as an empty cell, because a gap
 * in a column of numbers reads as a rendering fault.
 */
function compactValue(answer: {
  scale: unknown;
  value: unknown;
}): string | null {
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
            size="small"
            label="Mark as invalid"
            title="Mark this submission as invalid?"
            description="This removes the week's participation credit. It is recorded and can be reversed."
          >
            <form action={onInvalidate}>
              <input type="hidden" name="responseId" value={responseId} />
              <FieldRow label="Reason" htmlFor={`invalid-reason-${responseId}`}>
                <Select
                  id={`invalid-reason-${responseId}`}
                  name="reason"
                  defaultValue="empty_or_meaningless"
                >
                  {INVALID_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </Select>
                <span className="helper-text">Staff only.</span>
              </FieldRow>
              <FieldRow
                label={
                  <>
                    What the student sees <RequiredMark />
                  </>
                }
                htmlFor={`invalid-student-${responseId}`}
              >
                <Field
                  id={`invalid-student-${responseId}`}
                  name="studentVisibleReason"
                  required
                />
              </FieldRow>
              <div className="row">
                <SubmitButton variant="danger" pendingLabel="Marking…">
                  Mark as invalid
                </SubmitButton>
              </div>
            </form>
          </Dialog>
        )}

        {/* A student assistant may flag; only an instructor decides. */}
        {validity === "valid" && canFlag && !isInstructor && (
          <Dialog
            size="small"
            label="Flag for the instructor"
            title="Flag this submission?"
            description="The week's credit is kept until an instructor decides. The student is never told a flag exists."
          >
            <form action={onFlag}>
              <input type="hidden" name="responseId" value={responseId} />
              <FieldRow label="Reason" htmlFor={`flag-reason-${responseId}`}>
                <Select
                  id={`flag-reason-${responseId}`}
                  name="reason"
                  defaultValue="empty_or_meaningless"
                >
                  {INVALID_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </Select>
              </FieldRow>
              <FieldRow
                label="Note for the instructor"
                htmlFor={`flag-note-${responseId}`}
              >
                <Field id={`flag-note-${responseId}`} name="note" />
              </FieldRow>
              <div className="row">
                <SubmitButton variant="primary" pendingLabel="Flagging…">
                  Flag for the instructor
                </SubmitButton>
              </div>
            </form>
          </Dialog>
        )}

        {validity === "flagged" && canDecide && (
          <Dialog
            size="small"
            label="Decide on this flag"
            title="A student assistant flagged this submission"
            description={flagLine}
          >
            <form action={onConfirm}>
              <input type="hidden" name="responseId" value={responseId} />
              <FieldRow label="Reason" htmlFor={`confirm-reason-${responseId}`}>
                <Select
                  id={`confirm-reason-${responseId}`}
                  name="reason"
                  defaultValue="empty_or_meaningless"
                >
                  {INVALID_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </Select>
                <span className="helper-text">Staff only.</span>
              </FieldRow>
              <FieldRow
                label={
                  <>
                    What the student sees <RequiredMark />
                  </>
                }
                htmlFor={`confirm-student-${responseId}`}
              >
                <Field
                  id={`confirm-student-${responseId}`}
                  name="studentVisibleReason"
                  required
                />
              </FieldRow>
              <div className="row">
                <SubmitButton variant="danger" pendingLabel="Removing…">
                  Remove the credit
                </SubmitButton>
              </div>
            </form>
            <form className="mt-4" action={onDismiss}>
              <input type="hidden" name="responseId" value={responseId} />
              <SubmitButton variant="secondary" pendingLabel="Dismissing…">
                Dismiss the flag and keep the credit
              </SubmitButton>
            </form>
          </Dialog>
        )}

        {validity === "invalid" && canDecide && (
          <form action={onRestore} className="inline-form">
            <input type="hidden" name="responseId" value={responseId} />
            <SubmitButton
              variant="secondary"
              size="small"
              pendingLabel="Restoring…"
            >
              Restore the credit
            </SubmitButton>
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
