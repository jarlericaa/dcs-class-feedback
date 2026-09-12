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
import {
  formatDate,
  formatDateTime,
  formatTime,
  initials,
} from "@/lib/datetime";
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
import {
  AccessDenied,
  Alert,
  EmptyState,
  Stamp,
  StripLabel,
} from "@/components/ui";
import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { MarkReadOnView } from "@/components/staff/mark-read-on-view";
import { Dialog } from "@/components/ui/dialog";
import { ScrollToPost } from "@/components/ui/scroll-to";
import { Thread, ThreadMessage } from "@/components/ui/thread";
import {
  IconBack,
  IconForward,
  IconNoReply,
  IconPrivate,
  IconPublic,
  IconSearch,
} from "@/components/ui/icons";
import { renderRichText } from "@/modules/richtext/render";
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
import {
  aggregateQuestion,
  AnswerBlock,
  AnswerBody,
  CategoryFlair,
  FilterChips,
  ItemStamp,
  QuestionBlock,
  Sheet,
  StudentQuestionRow,
  SubmissionHeader,
  SubmissionRow,
  ViewSwitch,
  type AnswerRow,
  type QuestionEntry,
  type RenderedQuestions,
  type ResponsesView,
} from "./parts";

/**
 * Staff review for ONE occurrence of a course's forms, on two axes.
 *
 * **By question** is the default and the reason this page was rebuilt. A
 * teacher's first question about a week is "what did the class think of Q3",
 * and the only shape that answers it is every student's answer under one
 * prompt. Reading it per student meant reading the same prompt thirty times
 * and holding the distribution in your head.
 *
 * **By submission** is the other axis through the same records — not a second
 * design, and not a second query. It is one row per student, and the row opens
 * that student's whole submission, which is where every decision about an
 * individual gets made: the private reply, the public answer, and the one
 * exceptional act of invalidating it.
 *
 * Course-scoped on purpose: a form shared by several sections is ONE queue, so
 * a teacher reads its responses together — the section split is not something
 * students experience. A Section filter narrows when it is operationally
 * useful.
 *
 * One WEEK at a time, and that bound is the design. A week is the product's
 * unit of rhythm and it is also a pile a teacher can get to the bottom of, so
 * both views are scoped to one occurrence and nothing loads on scroll.
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

/** The by-submission list's own narrowing. */
const FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "needs_review", label: "Needs a reply" },
  { key: "answered", label: "Answered" },
  { key: "invalid", label: "Marked invalid" },
];

/**
 * The Student questions & feedback list's own narrowing, which is a different
 * question from the one above: that filter is about SUBMISSIONS, this one is
 * about the questions inside them.
 *
 * Each option carries its own count, and that is deliberately where the
 * counting now happens. The page used to print "N responses shown" and
 * "Nothing here is waiting on you" above the feed — two sentences that said how
 * much was on screen rather than how much was left to do. A filter that states
 * what it holds answers the second question and costs no extra line.
 */
const SQ_FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_reply", label: "Needs reply" },
  { key: "answered", label: "Answered" },
] as const;
type SqFilter = (typeof SQ_FILTERS)[number]["key"];

/**
 * Newest first by default — the approved design's call, reversing what this
 * file used to argue for.
 *
 * The old rationale here was fairness: oldest-first reaches whoever has waited
 * longest, and reverse chronology starves them. That argument belongs to a
 * QUEUE, and by-submission is not one — the work of clearing a week is driven
 * by the `Needs reply` filter and by the student-questions list, both of which
 * carry their own counts. This list is what a teacher opens to see what has
 * just come in, so it opens on what has just come in. Oldest-first is one
 * selection away and lives in the URL like every other selection.
 */
const SORTS = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

const VIEWS: ResponsesView[] = ["question", "submission"];

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

/** The same list, keyed, for printing back a decision somebody already took. */
const INVALID_REASON_LABEL = new Map(
  INVALID_REASONS.map((reason) => [reason.value, reason.label]),
);

type QueueRow = Awaited<
  ReturnType<typeof getCourseReviewQueue>
>["rows"][number];
type QueueItem = QueueRow["items"][number];
type QueueItemQuestion = QueueItem["item"];
type PrivateResponse = QueueItem["privateResponses"][number];
type PublicAnswer = QueueItem["publicAnswers"][number];
type FeedbackEvent =
  | { kind: "private"; at: Date; response: PrivateResponse }
  | { kind: "public"; at: Date; answer: PublicAnswer };
type FormAction = (formData: FormData) => Promise<void>;

/** The compact conversation shown beneath a handled student item. */
function FeedbackThread({
  events,
  originalQuestion,
  timezone,
  courseId,
  canDraftPublicAnswers,
}: {
  events: FeedbackEvent[];
  originalQuestion: string;
  timezone: string;
  /** Both onward links are course-owned destinations (ADR-0005). */
  courseId: string;
  canDraftPublicAnswers: boolean;
}) {
  return (
    <Thread>
      {events.map((event) => {
        if (event.kind === "private") {
          const message = event.response;
          const fromStudent = message.authorRole === "student";
          return (
            <ThreadMessage
              action={fromStudent ? "followed up" : "replied privately"}
              at={message.createdAt}
              author={
                message.authorName ??
                (fromStudent ? "Identity hidden" : "A teaching team member")
              }
              from={fromStudent ? "student" : "staff"}
              key={`private-${message.id}`}
              mark={message.authorName ? initials(message.authorName) : null}
              timezone={timezone}
            >
              <p className="thread__body">{message.body}</p>
            </ThreadMessage>
          );
        }

        const { answer } = event;
        return (
          <ThreadMessage
            action={
              answer.state === "published"
                ? "answered the section"
                : answer.state === "scheduled"
                  ? "scheduled an answer"
                  : "drafted an answer"
            }
            at={event.at}
            author={answer.authorName ?? "A teaching team member"}
            from="public"
            key={`public-${answer.id}`}
            mark={answer.authorName ? initials(answer.authorName) : null}
            timezone={timezone}
          >
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <Stamp tone="green">Public answer</Stamp>
              {answer.publishFailed && (
                <Stamp tone="red">Publication failed</Stamp>
              )}
            </p>
            {isReworded(originalQuestion, answer.publicQuestionText) && (
              <>
                <p className="mt-1 font-sans text-strip uppercase text-ink-muted">
                  Published as
                </p>
                <p className="thread__body">{answer.publicQuestionText}</p>
              </>
            )}
            {answer.answerBody && <AnswerBody>{answer.answerBody}</AnswerBody>}
            <p className="mt-2">
              {answer.state === "published" ? (
                <Link
                  className={buttonClass({ variant: "secondary", size: "small" })}
                  href={`/courses/${courseId}/qa?selected=${answer.id}`}
                >
                  See in Class Q&amp;A
                  <IconForward size={15} />
                </Link>
              ) : canDraftPublicAnswers ? (
                <Link
                  className={buttonClass({ variant: "secondary", size: "small" })}
                  href={`/teach/courses/${courseId}/publications`}
                >
                  Finish it in the publication queue
                  <IconForward size={15} />
                </Link>
              ) : null}
            </p>
          </ThreadMessage>
        );
      })}
    </Thread>
  );
}

/** Reply and publication actions, kept quiet beneath the words they affect. */
function FeedbackActions({
  item,
  responseId,
  who,
  isComment,
  published,
  declined,
  canSendPrivate,
  canDraftPublicAnswers,
  canPublishPublicAnswers,
  canReview,
  onPrivate,
  onPublic,
  onDecline,
}: {
  item: QueueItemQuestion;
  responseId: string;
  who: string;
  isComment: boolean;
  published: boolean;
  declined: boolean;
  canSendPrivate: boolean;
  canDraftPublicAnswers: boolean;
  canPublishPublicAnswers: boolean;
  canReview: boolean;
  onPrivate: FormAction;
  onPublic: FormAction;
  onDecline: FormAction;
}) {
  return (
    <div className="post__actions">
      {canSendPrivate && (
        <Dialog
          className="post__action"
          description={`Only ${who} can see this.`}
          label={
            <>
              <IconPrivate size={15} />
              Reply privately
            </>
          }
          title="Reply privately"
          variant="quiet"
        >
          <form action={onPrivate}>
            <input name="itemId" type="hidden" value={item.id} />
            <input name="responseId" type="hidden" value={responseId} />
            <FieldRow
              htmlFor={`private-${item.id}`}
              label={
                <>
                  Your reply <RequiredMark />
                </>
              }
            >
              <Textarea
                id={`private-${item.id}`}
                name="body"
                required
                rows={6}
              />
            </FieldRow>
            <div className="row">
              <SubmitButton pendingLabel="Sending…" variant="primary">
                Send private reply
              </SubmitButton>
            </div>
          </form>
        </Dialog>
      )}

      {!isComment &&
        !published &&
        canDraftPublicAnswers && (
          <Dialog
            className="post__action"
            description="Everyone taking this course sees the wording you write here, in Class Q&A. The asker is not named."
            label={
              <>
                <IconPublic size={15} />
                Answer publicly
              </>
            }
            title="Answer this student's section"
            variant="quiet"
          >
            <PublicAnswerComposer
              action={onPublic}
              canPublish={canPublishPublicAnswers}
              itemId={item.id}
              originalQuestion={item.originalText}
              selectedResponseId={responseId}
            />
          </Dialog>
        )}

      {!isComment &&
        (item.disposition === "undecided" ||
          item.disposition === "no_response") &&
        canReview && (
          <form action={onDecline}>
            <input name="itemId" type="hidden" value={item.id} />
            <input name="responseId" type="hidden" value={responseId} />
            {declined && (
              <input name="undo" type="hidden" value="yes" />
            )}
            <SubmitButton className="post__action" variant="quiet">
              <IconNoReply size={15} />
              {declined ? "Put back in the queue" : "Will not answer"}
            </SubmitButton>
          </form>
        )}
    </div>
  );
}

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

/** The same test, for one item rather than for the whole submission. */
function itemNeedsReply(row: QueueRow, entry: QueueItem): boolean {
  return (
    row.response.validity === "valid" &&
    entry.item.kind !== "general_comment" &&
    !entry.settled
  );
}

/** Somebody has already said something back, privately or to the section. */
function itemAnswered(entry: QueueItem): boolean {
  return (
    entry.privateResponses.length > 0 ||
    entry.publicAnswers.some((answer) => answer.state === "published")
  );
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
    /** which axis through the week: `question` (default) or `submission` */
    view?: string;
    /** one submission, opened on its own — the detail screen */
    r?: string;
    filter?: string;
    /** the Student questions & feedback list's own filter */
    sq?: string;
    /** the by-submission list's order */
    sort?: string;
    /**
     * one FORM — the outer axis. A course can run several, and an occurrence
     * label ("Week 1") does not say which form it belongs to, so without this
     * a two-form course showed both forms' weeks in one undifferentiated list.
     * `courses/[id]/page.tsx` has always linked here with it.
     */
    form?: string;
    /** one form occurrence — the week this page is reading, within `form` */
    cycle?: string;
    /** one class section, when the reader has more than one */
    section?: string;
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

  const view: ResponsesView = VIEWS.includes(sp.view as ResponsesView)
    ? (sp.view as ResponsesView)
    : "question";
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ??
    "all") as ReviewFilter;
  const sqFilter = (SQ_FILTERS.find((f) => f.key === sp.sq)?.key ??
    "all") as SqFilter;
  const sort = (SORTS.find((s) => s.key === sp.sort)?.key ??
    "newest") as SortKey;

  let queue;
  try {
    /**
     * Always read the whole occurrence and narrow in memory. The "needs a
     * reply" view has to keep showing an item the reader has just answered
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
   * Which form the page is reading.
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
   * Which week the page is reading, WITHIN the chosen form.
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
        view,
        filter: sp.filter,
        sq: sp.sq,
        sort: sp.sort,
        form: currentFormId,
        cycle: currentCycleId,
        section: sp.section,
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
   * the selector displayed the default one. The result was a page headed
   * "Week 8" listing Week 3 posts, with counts to match. The default cannot
   * move into the query, because deriving it needs the occurrence list the
   * query returns; so it is applied here, where the selector's own value is
   * finally known.
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
   * capability is granted on a section, and a course-wide page must not lend
   * a co-teacher of Section A the power to finalize a Section B decision. One
   * lookup per section this reader holds, reused by every row. The services
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
  const sectionTitleOf = (sectionId: string) =>
    sections.find((s) => s.id === sectionId)?.title ?? null;

  const reviewedThisSession = await readReviewedThisSession();

  /**
   * Which of this week's responses this reader has already read.
   *
   * Read state is still tracked, still per-reader, and still persisted — what
   * changed is that it no longer runs the page. There is no "Read and unread"
   * selector any more, because opening a submission is what marks it read and a
   * control for something the page can see for itself was costing a filter slot
   * for nothing. What survives is the quiet marker on a submission row and the
   * deliberate reversal on the submission itself.
   */
  const readIds = await listReadResponseIds(
    user.id,
    rows.map((row) => row.response.id),
  );
  const isUnread = (row: QueueRow) => !readIds.has(row.response.id);

  // Free-text narrowing happens here rather than in the service: it is a
  // presentation filter over an already-authorized result set.
  const term = sp.q?.trim().toLowerCase();

  /**
   * The submission opened on its own, if one is.
   *
   * Resolved against the WHOLE authorized scope rather than against the week on
   * screen, so a link from another occurrence still opens rather than 404ing
   * into an empty page. It is not a widening: `scopeRows` is exactly what
   * `getCourseReviewQueue` already decided this reader may see.
   */
  const detailRow = sp.r
    ? (scopeRows.find((row) => row.response.id === sp.r) ?? null)
    : null;

  /**
   * The occurrence's question snapshot, once.
   *
   * Every response in one occurrence answers the SAME set of questions —
   * `getCourseReviewQueue` builds one row per question asked, answered or not —
   * so the snapshot is read off the rows rather than re-queried, and a question
   * the whole class skipped is still present because every row carries it.
   * Authored order, which is the order the student saw and the order both views
   * number in.
   */
  const questions: AnswerRow[] = [];
  const entriesByQuestion = new Map<string, QuestionEntry[]>();
  /**
   * Invalidated submissions are left out of the aggregate.
   *
   * A submission is invalidated for exactly one class of reason — empty, spam,
   * abusive, irrelevant, bad faith — and every one of them says the content is
   * not genuine feedback. Averaging it into "what the class thought" would let
   * one spam submission move a rating a teacher has already judged.
   *
   * It is not hidden and it is not announced: the by-submission list carries it
   * under `Marked invalid`, one click away. A standing sentence above the
   * questions saying so interrupted the page's hierarchy to explain an
   * exception most weeks do not have.
   */
  const countedRows = rows.filter((row) => row.response.validity !== "invalid");
  for (const row of countedRows) {
    for (const answer of row.answers) {
      if (!entriesByQuestion.has(answer.questionId)) {
        questions.push(answer);
        entriesByQuestion.set(answer.questionId, []);
      }
      entriesByQuestion.get(answer.questionId)!.push({
        responseId: row.response.id,
        /* null when this reader may not see identities — masked in the DATA,
           upstream, never blanked out here. */
        who: row.student?.fullName ?? null,
        sectionTitle:
          sections.length > 1 ? sectionTitleOf(row.response.sectionId) : null,
        when: row.response.submittedAt
          ? formatDateTime(
              row.response.submittedAt,
              timezoneOf(row.response.sectionId),
            )
          : null,
        answer,
      });
    }
  }
  questions.sort((a, b) => a.displayOrder - b.displayOrder);

  /**
   * The question prompts and help text, rendered ONCE.
   *
   * These are staff-authored rich text — the same Markdown, code and LaTeX the
   * student was shown — and a prompt reading `How confident are you about
   * $\\int x^3\\,dx$?` must not reach a teacher as literal dollar signs.
   * Rendered here, keyed by question id, because every response in the week
   * shares one snapshot: N distinct prompts, not N x students. `renderRichText`
   * is the single sanctioned renderer and it memoizes on the source as well.
   */
  const questionHtml: RenderedQuestions = new Map();
  for (const answer of detailRow ? detailRow.answers : questions) {
    if (questionHtml.has(answer.questionId)) continue;
    questionHtml.set(answer.questionId, {
      prompt: await renderRichText(answer.prompt),
      description: await renderRichText(answer.description),
    });
  }

  /**
   * Every student-originated item in the week, flattened.
   *
   * Operationally different from a form answer — it is the thing a person is
   * owed a reply to — which is why it gets its own region rather than sitting
   * inside the answers.
   */
  const studentItems = countedRows
    .flatMap((row) => row.items.map((entry) => ({ row, entry })))
    .filter(
      ({ row, entry }) =>
        !term ||
        entry.item.originalText.toLowerCase().includes(term) ||
        (row.student?.fullName.toLowerCase().includes(term) ?? false),
    )
    .sort((a, b) => {
      const at = (row: QueueRow) =>
        (row.response.submittedAt ?? new Date(0)).getTime();
      return at(a.row) - at(b.row);
    });
  const itemCounts = {
    all: studentItems.length,
    needs_reply: studentItems.filter(
      ({ row, entry }) =>
        itemNeedsReply(row, entry) && !reviewedThisSession.has(row.response.id),
    ).length,
    answered: studentItems.filter(({ entry }) => itemAnswered(entry)).length,
  };
  const visibleItems = studentItems.filter(({ row, entry }) => {
    switch (sqFilter) {
      case "needs_reply":
        /* An item answered in this sitting stays in place, so the list does
           not shift under the cursor the moment it is dealt with. */
        return (
          itemNeedsReply(row, entry) || reviewedThisSession.has(row.response.id)
        );
      case "answered":
        return itemAnswered(entry);
      default:
        return true;
    }
  });

  /** The by-submission list: the same week, one row per student. */
  const submittedAt = (row: QueueRow) =>
    row.response.submittedAt ?? new Date(0);
  const visibleRows = rows
    .filter(
      (row) =>
        (!term ||
          row.items.some((i) =>
            i.item.originalText.toLowerCase().includes(term),
          ) ||
          (row.student?.fullName.toLowerCase().includes(term) ?? false)) &&
        (filter === "all"
          ? true
          : filter === "needs_review"
            ? needsReply(row) || reviewedThisSession.has(row.response.id)
            : filter === "answered"
              ? row.answered
              : row.response.validity === "invalid"),
    )
    .sort((a, b) => {
      const order = submittedAt(a).getTime() - submittedAt(b).getTime();
      return sort === "newest" ? -order : order;
    });

  /**
   * The validity trail for the submission on screen — and only for it.
   *
   * One query, on one response, and only when a submission is actually open. It
   * is what lets the invalidated notice say WHO decided and WHEN rather than
   * only that somebody did; reading it for every row of a week would be one
   * query per row for a panel nobody is looking at.
   */
  const detailHistory =
    detailRow && detailRow.response.validity !== "valid"
      ? await getValidityHistory(user.id, detailRow.response.id)
      : [];
  const lastFlag =
    [...detailHistory].reverse().find((event) => event.action === "flag") ??
    null;
  const lastInvalidation =
    [...detailHistory]
      .reverse()
      .find(
        (event) =>
          event.action === "invalidate" || event.action === "confirm_flag",
      ) ?? null;

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
   * anchors to the submission it acted on.
   *
   * `view` and `r` are carried for the same reason every other selection is:
   * these actions are taken FROM the submission's own screen, so sending the
   * reader back to a list they were not on would lose the place they were
   * working in.
   */
  const backQuery = new URLSearchParams(
    Object.entries({
      view,
      r: sp.r,
      filter: filter === "all" ? undefined : filter,
      sq: sqFilter === "all" ? undefined : sqFilter,
      sort: sort === "newest" ? undefined : sort,
      form: currentFormId,
      cycle: currentCycleId,
      section: sp.section,
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
     * Published into the COURSE's one Class Q&A (ADR-0005). No section is sent
     * and none is asked for: an answer useful to CS 33 is useful to all of CS
     * 33, and publishing it three times because the course runs three labs was
     * the defect this removed.
     *
     * The course comes from the page's own route, never from the form.
     * `draftPublicAnswer` independently re-derives the asker's section from the
     * item and refuses an actor who does not hold `draft_public_answers` there,
     * so naming an item is not a way to reach a section you cannot review.
     */
    const answer = await draftPublicAnswer(uid, {
      courseId,
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
            `/teach/courses/${courseId}/publications?warn=${encodeURIComponent(
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
        ? "Published to Class Q&A without the asker's name on it."
        : "Saved as a draft. Finish it in the publication queue.",
    );
    done.set("at", responseId);
    redirect(`${path}?${done.toString()}`);
  }

  // --- render --------------------------------------------------------------

  /**
   * A link back into this page, with every selection preserved.
   *
   * Defined here rather than beside `backQuery` because it is a render helper:
   * a `use server` closure may only capture plain values, so a function like
   * this one cannot be shared with the actions above.
   */
  const hrefWith = (overrides: Record<string, string | undefined>) => {
    const query = new URLSearchParams(
      Object.entries({
        view,
        r: sp.r,
        filter: filter === "all" ? undefined : filter,
        sq: sqFilter === "all" ? undefined : sqFilter,
        sort: sort === "newest" ? undefined : sort,
        form: currentFormId,
        cycle: currentCycleId,
        section: sp.section,
        q: sp.q,
        ...overrides,
      }).filter((entry): entry is [string, string] => !!entry[1]),
    ).toString();
    return query ? `${path}?${query}` : path;
  };

  /**
   * What a per-question search form has to carry so submitting it keeps the
   * page where it is. A plain list of pairs rather than a URL, because the
   * control is a GET form and these are its hidden fields.
   */
  const searchHidden: [string, string][] = Object.entries({
    view,
    sq: sqFilter === "all" ? undefined : sqFilter,
    form: currentFormId,
    cycle: currentCycleId,
    section: sp.section,
  }).filter((entry): entry is [string, string] => !!entry[1]);

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
      description={courseSubtitle({ terms: courseTerms })}
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

      {detailRow ? (
        (() => {
          const row = detailRow;
          const sectionId = row.response.sectionId;
          const timezone = timezoneOf(sectionId);
          const who = row.student?.fullName ?? "Identity hidden";
          const unread = isUnread(row);
          const validity = row.response.validity;
          return (
            <div className="grid gap-6" id={`r-${row.response.id}`}>
              <div className="grid gap-4">
                <p>
                  <Link
                    className={buttonClass({
                      variant: "quiet",
                      size: "small",
                      className: "-ml-2.5",
                    })}
                    href={hrefWith({ r: undefined, at: undefined })}
                  >
                    <IconBack size={15} />
                    {view === "question"
                      ? "Back to the questions"
                      : "Back to submissions"}
                  </Link>
                </p>

                {/* Reading it is what marks it read (see `MarkReadOnView`), and
                    the observer watches this wrapper rather than the whole
                    page — a submission that never scrolls into view has not
                    been read. Mounted only while it is still unread, so a
                    re-open starts no observer at all. */}
                <div>
                  {unread && (
                    <MarkReadOnView
                      action={markReadOnView}
                      responseId={row.response.id}
                    />
                  )}
                  <SubmissionHeader
                    action={
                      <>
                        {/* This reader's own place, beside the object it is
                            about. Reading marks a submission read on its own,
                            so only the REVERSAL is a real intention — a quiet
                            secondary control in the header, never a primary
                            one, and never stranded under the student's words
                            as a lone line of page furniture. */}
                        {!unread && (
                          <form action={markUnread}>
                            <input
                              name="responseId"
                              type="hidden"
                              value={row.response.id}
                            />
                            <SubmitButton size="small" variant="quiet">
                              Mark as unread
                            </SubmitButton>
                          </form>
                        )}
                        <ValidityAction
                          canFlag={canOn(sectionId, "flagValidity")}
                          canMark={canOn(sectionId, "markValidity")}
                          flagLine={
                            lastFlag
                              ? `${lastFlag.actorName}: ${(
                                  lastFlag.reason ?? "no reason given"
                                ).replace(/_/g, " ")}${
                                  lastFlag.staffNote
                                    ? ` — ${lastFlag.staffNote}`
                                    : ""
                                }`
                              : undefined
                          }
                          isInstructor={isInstructorOn(sectionId)}
                          onConfirm={confirmFlagged}
                          onDismiss={dismissFlag}
                          onFlag={flag}
                          onInvalidate={invalidate}
                          onRestore={restoreValid}
                          responseId={row.response.id}
                          studentNumber={row.student?.studentNumber}
                          validity={validity}
                        />
                      </>
                    }
                    submitted={
                      row.response.submittedAt
                        ? formatDateTime(row.response.submittedAt, timezone)
                        : "Not submitted"
                    }
                    tags={[row.instanceLabel, sectionTitleOf(sectionId)]}
                    who={who}
                  />
                </div>

                {validity === "invalid" && (
                  <InvalidatedNotice
                    at={
                      lastInvalidation
                        ? formatDateTime(lastInvalidation.createdAt, timezone)
                        : null
                    }
                    by={lastInvalidation?.actorName ?? null}
                    note={row.response.invalidationNote}
                    reason={row.response.invalidationReason}
                    studentVisibleReason={row.response.studentVisibleReason}
                  />
                )}
                {validity === "flagged" && (
                  <Alert
                    title="A student assistant flagged this submission"
                    variant="warning"
                  >
                    The week&rsquo;s participation credit is kept until an
                    instructor decides.
                    {lastFlag && (
                      <>
                        {" "}
                        Flagged by {lastFlag.actorName}
                        {lastFlag.reason
                          ? `, reason: ${(INVALID_REASON_LABEL.get(lastFlag.reason) ?? lastFlag.reason).toLowerCase()}`
                          : ""}
                        .
                      </>
                    )}
                  </Alert>
                )}
              </div>

              {/* Each region of a submission is its own quiet sheet. The common
                  one-question case follows Panel 3 directly; multi-item posts
                  stay compact inside one Questions & feedback sheet. */}
              <div className="grid gap-4">
                <Sheet title="Form answers" tone="accent">
                  {row.answers.length === 0 ? (
                    <p className="max-w-measure-empty font-sans text-ui-sm text-ink-muted">
                      This occurrence asked no questions of its own.
                    </p>
                  ) : (
                    <ul className="m-0 grid list-none p-0">
                      {row.answers.map((answer, index) => (
                        <AnswerBlock
                          index={index}
                          key={answer.questionId}
                          question={answer}
                          rendered={questionHtml}
                        />
                      ))}
                    </ul>
                  )}
                </Sheet>

                {row.items.length === 1 ? (
                  (() => {
                    const entry = row.items[0]!;
                    const { item, privateResponses, publicAnswers } = entry;
                    const events: FeedbackEvent[] = [
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
                    return (
                      <>
                        <Sheet
                          aside={
                            <ItemStamp
                              declined={declined}
                              isComment={isComment}
                              published={published}
                              settled={entry.settled}
                            />
                          }
                          title="Student question"
                        >
                          <CategoryFlair value={item.category} />
                          <p className="mt-3 max-w-measure font-document text-doc-dense text-ink whitespace-pre-wrap">
                            {item.originalText}
                          </p>
                          <FeedbackActions
                            canDraftPublicAnswers={canOn(
                              sectionId,
                              "draftPublicAnswers",
                            )}
                            canPublishPublicAnswers={canOn(
                              sectionId,
                              "publishPublicAnswers",
                            )}
                            canReview={canOn(
                              sectionId,
                              "reviewResponses",
                            )}
                            canSendPrivate={canOn(
                              sectionId,
                              "sendPrivateResponses",
                            )}
                            declined={declined}
                            isComment={isComment}
                            item={item}
                            onDecline={declineAnswer}
                            onPrivate={sendPrivate}
                            onPublic={draftOrPublish}
                            published={published}
                            responseId={row.response.id}
                            who={who}
                          />
                        </Sheet>
                        {events.length > 0 && (
                          <Sheet title="Instructor response">
                            <FeedbackThread
                              canDraftPublicAnswers={canOn(
                                sectionId,
                                "draftPublicAnswers",
                              )}
                              courseId={courseId}
                              events={events}
                              originalQuestion={item.originalText}
                              timezone={timezone}
                            />
                          </Sheet>
                        )}
                      </>
                    );
                  })()
                ) : (
                <Sheet title="Questions &amp; feedback" tone="accent">
                  {row.items.length === 0 ? (
                    /* They answered the form and asked nothing. There is no
                       reply to write, and saying so plainly beats a row of
                       buttons that would all be wrong. */
                    <p className="max-w-measure font-sans text-ui-sm text-ink-muted">
                      They answered the form and did not add a question or
                      comment.
                    </p>
                  ) : (
                    <ul className="m-0 grid list-none p-0">
                      {row.items.map((entry) => {
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

                        return (
                          <li
                            className="border-t border-rule py-5 first:border-t-0 first:pt-0 last:pb-0"
                            key={item.id}
                          >
                            {/* What it is about, and what it still needs — the two
                            facts a reader triages on, on one line. */}
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                              <CategoryFlair value={item.category} />
                              <ItemStamp
                                declined={declined}
                                isComment={isComment}
                                published={published}
                                settled={entry.settled}
                              />
                            </div>
                            {/* The student's own words, in the document register,
                            and never overwritten by a reworded public
                            version. */}
                            <blockquote className="post__words mt-3">
                              {item.originalText}
                            </blockquote>

                            {events.length > 0 && (
                              <div className="mt-4">
                                <FeedbackThread
                                  canDraftPublicAnswers={canOn(
                                    sectionId,
                                    "draftPublicAnswers",
                                  )}
                                  courseId={courseId}
                                  events={events}
                                  originalQuestion={item.originalText}
                                  timezone={timezone}
                                />
                              </div>
                            )}

                            <FeedbackActions
                              canDraftPublicAnswers={canOn(
                                sectionId,
                                "draftPublicAnswers",
                              )}
                              canPublishPublicAnswers={canOn(
                                sectionId,
                                "publishPublicAnswers",
                              )}
                              canReview={canOn(sectionId, "reviewResponses")}
                              canSendPrivate={canOn(
                                sectionId,
                                "sendPrivateResponses",
                              )}
                              declined={declined}
                              isComment={isComment}
                              item={item}
                              onDecline={declineAnswer}
                              onPrivate={sendPrivate}
                              onPublic={draftOrPublish}
                              published={published}
                              responseId={row.response.id}
                              who={who}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Sheet>
                )}
              </div>
            </div>
          );
        })()
      ) : (
        <>
          {/* Two decisions, in the order they are made: which axis am I
              reading the week on, then which week. One compact group — 12px
              between the switch and the selectors, not a band of air. */}
          <div className="mb-6 grid justify-items-start gap-3">
            <ViewSwitch
              current={view}
              hrefFor={(next) =>
                hrefWith({ view: next, r: undefined, at: undefined })
              }
            />

            <form
              action={path}
              className="flex w-full flex-wrap items-center gap-2"
              method="get"
            >
              <input name="view" type="hidden" value={view} />
              {view === "submission" && sort !== "newest" && (
                <input name="sort" type="hidden" value={sort} />
              )}
              {view === "question" && sqFilter !== "all" && (
                <input name="sq" type="hidden" value={sqFilter} />
              )}
              {/* By question has no page-wide search: the only thing worth
                  searching there is a written answer, and that control lives
                  in that question's own header. The term still has to survive
                  a change of week. */}
              {view === "question" && sp.q && (
                <input name="q" type="hidden" value={sp.q} />
              )}

              {/* The scope: form (on the question axis), occurrence, and
                  section are peers in one compact selector row. Keeping them
                  in one GET form preserves the current cycle when a teacher
                  changes the outer form; stale cycles are corrected above. */}
              {instances.length > 0 && (
                <>
                  {view === "question" && currentFormId && (
                    <AutoSubmitSelect
                      className="w-auto max-w-[28ch]"
                      defaultValue={currentFormId}
                      id="feed-form"
                      label="Which form"
                      name="form"
                    >
                      {forms.map((form) => (
                        <option key={form.id} value={form.id}>
                          {form.title}
                        </option>
                      ))}
                      {hasUnassigned && (
                        <option value={UNASSIGNED_FORM}>
                          Other occurrences
                        </option>
                      )}
                    </AutoSubmitSelect>
                  )}
                  {currentCycleId && formInstances.length > 0 && (
                    <AutoSubmitSelect
                      className="w-auto max-w-[24ch]"
                      defaultValue={currentCycleId ?? ""}
                      id="feed-week"
                      label="Which occurrence"
                      name="cycle"
                    >
                      {formInstances.map(({ instance, label }) => (
                        <option key={instance.id} value={instance.id}>
                          {label}
                          {instance.state === "open" ? " · Open" : ""}
                        </option>
                      ))}
                    </AutoSubmitSelect>
                  )}
                  {/* Only when the reader actually has more than one: a control
                      with a single option is noise. */}
                  {sections.length > 1 && (
                    <AutoSubmitSelect
                      className="w-auto max-w-[22ch]"
                      defaultValue={sp.section ?? ""}
                      id="feed-section"
                      label="Section"
                      name="section"
                    >
                      <option value="">All sections</option>
                      {sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.title}
                        </option>
                      ))}
                    </AutoSubmitSelect>
                  )}
                </>
              )}

              {/* By submission keeps a page-wide search because its subject is
                  a student or something they wrote. It shares this compact row
                  with the week and section selectors, as in the approved
                  submission panel. Filter and order remain on the list sheet. */}
              {view === "submission" && (
                <span className="feedbar__search min-w-0 w-[20rem] max-w-full flex-[0_1_20rem]">
                  <IconSearch size={15} />
                  <label className="visually-hidden" htmlFor="feed-q">
                    Search student name or content
                  </label>
                  <input
                    defaultValue={sp.q ?? ""}
                    id="feed-q"
                    name="q"
                    placeholder="Search student name or content…"
                    type="search"
                  />
                </span>
              )}

              <button className="visually-hidden" type="submit">
                Apply
              </button>
            </form>
          </div>

          {view === "question" ? (
            counts.total === 0 ? (
              <EmptyState title="No responses yet">
                Nothing has been submitted for this occurrence. The answers and
                the questions students raise will appear here as they arrive.
              </EmptyState>
            ) : (
              <div className="grid gap-4">
                {questions.map((question, index) => (
                  <QuestionBlock
                    aggregate={aggregateQuestion(
                      question,
                      entriesByQuestion.get(question.questionId) ?? [],
                    )}
                    index={index}
                    key={question.questionId}
                    question={question}
                    rendered={questionHtml}
                    /* Every selection this page is holding, so the per-question
                       search is a plain GET that keeps the week, the form and
                       the section it was typed on. */
                    search={{
                      action: path,
                      hidden: searchHidden,
                      value: sp.q ?? "",
                    }}
                    total={questions.length}
                  />
                ))}

                <div className="mt-2">
                  {/* `itemCounts.all` counts student-originated ITEMS, not
                      the submissions they arrived in — one submission can
                      carry a question and a comment. Calling them submissions
                      would have printed a number that disagrees with the
                      by-submission list beside it.

                      `.strip` uppercases its whole line, which is right for
                      the batten's label and wrong for a count that reads as a
                      sentence. `ml-auto` puts it at the far end of the batten,
                      where the approved design has it. */}
                  <StripLabel
                    count={
                      <span className="ml-auto normal-case">
                        {itemCounts.all}{" "}
                        {itemCounts.all === 1 ? "item" : "items"}
                      </span>
                    }
                  >
                    Student questions &amp; feedback
                  </StripLabel>
                  <Sheet className="p-0">
                    <div className="border-b border-rule px-5 py-3">
                      <FilterChips
                        current={sqFilter}
                        label="Filter student questions"
                        options={SQ_FILTERS.map((option) => ({
                          key: option.key,
                          label: option.label,
                          count: itemCounts[option.key],
                          href: hrefWith({
                            sq: option.key === "all" ? undefined : option.key,
                            r: undefined,
                          }),
                        }))}
                      />
                    </div>
                    {visibleItems.length === 0 ? (
                      <p className="max-w-measure-empty p-4 font-sans text-ui-sm text-ink-muted">
                        {itemCounts.all === 0
                          ? "Nobody added a question or comment to this occurrence."
                          : "No question matches this filter."}
                      </p>
                    ) : (
                      <ul className="m-0 grid list-none divide-y divide-rule p-0">
                        {visibleItems.map(({ row, entry }) => (
                          <StudentQuestionRow
                            category={entry.item.category}
                            href={hrefWith({
                              r: row.response.id,
                              at: row.response.id,
                            })}
                            key={entry.item.id}
                            meta={[
                              sections.length > 1
                                ? sectionTitleOf(row.response.sectionId)
                                : null,
                              row.response.submittedAt
                                ? formatDateTime(
                                    row.response.submittedAt,
                                    timezoneOf(row.response.sectionId),
                                  )
                                : null,
                            ]}
                            stamp={
                              <ItemStamp
                                declined={
                                  entry.item.disposition === "no_response"
                                }
                                isComment={
                                  entry.item.kind === "general_comment"
                                }
                                published={entry.publicAnswers.some(
                                  (answer) => answer.state === "published",
                                )}
                                settled={entry.settled}
                              />
                            }
                            text={entry.item.originalText}
                          />
                        ))}
                      </ul>
                    )}
                  </Sheet>
                </div>
              </div>
            )
          ) : visibleRows.length === 0 ? (
            <EmptyState
              action={
                counts.total === 0
                  ? undefined
                  : {
                      href: hrefWith({
                        filter: undefined,
                        q: undefined,
                        r: undefined,
                      }),
                      label: "Show every submission",
                    }
              }
              title={
                counts.total === 0
                  ? "No responses yet"
                  : "Nothing matches these filters"
              }
            >
              {counts.total === 0
                ? "Nothing has been submitted for this occurrence yet."
                : "Try another form, a wider filter, or clear the search."}
            </EmptyState>
          ) : (
            <Sheet
              aside={
                /* Order only. Its own GET form, because the page's scope form
                   sits above and a form cannot contain another. */
                <form
                  action={path}
                  className="flex flex-wrap items-center gap-2"
                  method="get"
                >
                  <input name="view" type="hidden" value={view} />
                  {currentFormId && (
                    <input name="form" type="hidden" value={currentFormId} />
                  )}
                  {currentCycleId && (
                    <input name="cycle" type="hidden" value={currentCycleId} />
                  )}
                  {sp.section && (
                    <input name="section" type="hidden" value={sp.section} />
                  )}
                  {sp.q && <input name="q" type="hidden" value={sp.q} />}
                  {filter !== "all" && (
                    <input name="filter" type="hidden" value={filter} />
                  )}
                  <AutoSubmitSelect
                    className="w-auto max-w-[18ch]"
                    defaultValue={sort}
                    id="feed-sort"
                    label="Order"
                    name="sort"
                  >
                    {SORTS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </AutoSubmitSelect>
                  <noscript>
                    <button
                      className={buttonClass({
                        variant: "secondary",
                        size: "small",
                      })}
                      type="submit"
                    >
                      Apply
                    </button>
                  </noscript>
                </form>
              }
              flush
              title="Submissions"
            >
              {/* The narrowing, as chips rather than a second dropdown beside
                  the order. A select whose resting value is "Everything" is a
                  control that mostly says nothing while taking the same weight
                  as the one beside it that always says something; chips state
                  what each filter holds and make the default visibly the
                  default. */}
              <div className="border-b border-rule px-5 py-3">
                <FilterChips
                  current={filter}
                  label="Filter submissions"
                  options={FILTERS.map((f) => ({
                    key: f.key,
                    label:
                      f.key === "all"
                        ? "All"
                        : f.key === "needs_review"
                          ? "Needs reply"
                          : f.key === "answered"
                            ? "Answered"
                            : "Invalid",
                    count:
                      f.key === "all"
                        ? counts.total
                        : f.key === "needs_review"
                          ? counts.needsReview
                          : f.key === "answered"
                            ? counts.answered
                            : counts.invalid,
                    href: hrefWith({
                      filter: f.key === "all" ? undefined : f.key,
                      r: undefined,
                    }),
                  }))}
                />
              </div>
              <ul className="m-0 grid list-none p-0">
                {visibleRows.map((row) => {
                  const sectionId = row.response.sectionId;
                  const published = row.items.some((entry) =>
                    entry.publicAnswers.some(
                      (answer) => answer.state === "published",
                    ),
                  );
                  return (
                    <SubmissionRow
                      href={hrefWith({
                        r: row.response.id,
                        at: row.response.id,
                      })}
                      key={row.response.id}
                      mark={row.student ? initials(row.student.fullName) : "—"}
                      stamp={
                        <span className="flex flex-wrap items-center gap-2">
                          <SubmissionStamp
                            hasItems={row.items.length > 0}
                            needsReply={
                              needsReply(row) &&
                              !reviewedThisSession.has(row.response.id)
                            }
                            published={published}
                            validity={row.response.validity}
                          />
                        </span>
                      }
                      /* Always the section, when its title is known. Which
                         class list a submission came from is a fact about that
                         submission; hiding it because the READER happens to
                         hold only one section made the row say less for no
                         privacy gain — `sections` is already exactly what this
                         reader is authorized to see. */
                      tags={[row.instanceLabel, sectionTitleOf(sectionId)]}
                      date={
                        row.response.submittedAt
                          ? formatDate(
                              row.response.submittedAt,
                              timezoneOf(sectionId),
                            )
                          : "Not submitted"
                      }
                      time={
                        row.response.submittedAt
                          ? formatTime(
                              row.response.submittedAt,
                              timezoneOf(sectionId),
                            )
                          : ""
                      }
                      who={row.student?.fullName ?? "Identity hidden"}
                    />
                  );
                })}
              </ul>
            </Sheet>
          )}
        </>
      )}
    </AppShell>
  );
}

/**
 * Did staff actually reword the question for publication?
 *
 * Compared on the text a reader would see rather than byte for byte: trailing
 * punctuation, case and collapsed whitespace are not a rewording, and treating
 * them as one would put a "Published as" block above a line identical to the
 * one above it. Anything beyond that IS a rewording and the difference is
 * exactly what the label exists to show.
 */
function isReworded(original: string, published: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.?!,;:]+$/g, "")
      .trim();
  return normalize(original) !== normalize(published);
}

/**
 * What a submission needs, in one word, on its row in the list.
 *
 * One stamp, in a fixed order of precedence, because a row carrying four of
 * them distinguishes nothing (DESIGN.md anti-pattern 29). Invalid outranks
 * everything — it is the only state that changes what the submission is worth;
 * then what is owed; then what has already gone out.
 */
function SubmissionStamp({
  validity,
  needsReply,
  published,
  hasItems,
}: {
  validity: string;
  needsReply: boolean;
  published: boolean;
  hasItems: boolean;
}) {
  if (validity === "invalid") return <Stamp tone="red">Invalid</Stamp>;
  if (validity === "flagged") return <Stamp tone="amber">Flagged</Stamp>;
  if (needsReply) return <Stamp tone="amber">Needs reply</Stamp>;
  if (published) return <Stamp tone="green">Published</Stamp>;
  if (!hasItems) return <Stamp tone="neutral">No question</Stamp>;
  return <Stamp tone="green">Answered</Stamp>;
}

/**
 * The one exceptional act available on a submission, in the header beside who
 * it is from.
 *
 * **There is no "Valid" control, and that is the change.** A submission counts
 * toward participation because it exists and has not been invalidated —
 * participation is DERIVED, not a flag somebody sets (AGENTS.md §4) — so a
 * validity dropdown and a "Participation credit" toggle were both inviting a
 * decision that does not exist. What exists is one exception, and the header
 * offers exactly that one:
 *
 * | state | the action |
 * |---|---|
 * | valid, instructor | Invalidate submission |
 * | valid, assistant | Flag for the instructor |
 * | flagged, instructor | Decide on this flag |
 * | invalid, instructor | Revert invalidation |
 *
 * The recovery is in the SAME place as the act, which is the property a reader
 * needs when they have just done it by mistake — it was previously at the foot
 * of the page, behind a disclosure, under a different name.
 *
 * A student assistant may flag; only an instructor may finalize or reverse a
 * validity decision, and `requireInstructorSectionCapability` in the service
 * refuses a TA who has been granted `markValidity` regardless of what this
 * renders. Nothing here is the check.
 *
 * Destruction is a bordered danger button, never a red slab (DESIGN.md §6): it
 * should look serious, not eager to be clicked.
 */
function ValidityAction({
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

  /* The student number lives inside these dialogs rather than in the header:
     it is an identifier a reader needs while TAKING this decision, not while
     reading the submission. It is present only when the queue supplied it,
     which is only when the reader holds `view_student_identities`. */
  const identifier = studentNumber ? (
    <p className="meta">
      Student number <span className="ident">{studentNumber}</span>
    </p>
  ) : null;

  if (validity === "valid" && canDecide) {
    return (
      <Dialog
        description="This removes the week's participation credit. It is recorded and can be reversed."
        label="Invalidate submission"
        size="small"
        title="Invalidate this submission?"
        variant="danger"
      >
        <form action={onInvalidate}>
          <input name="responseId" type="hidden" value={responseId} />
          {identifier}
          <FieldRow htmlFor={`invalid-reason-${responseId}`} label="Reason">
            <Select
              defaultValue="empty_or_meaningless"
              id={`invalid-reason-${responseId}`}
              name="reason"
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
            htmlFor={`invalid-student-${responseId}`}
            label={
              <>
                What the student sees <RequiredMark />
              </>
            }
          >
            <Field
              id={`invalid-student-${responseId}`}
              name="studentVisibleReason"
              required
            />
          </FieldRow>
          <div className="row">
            <SubmitButton pendingLabel="Invalidating…" variant="danger">
              Invalidate submission
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    );
  }

  if (validity === "valid" && canFlag && !isInstructor) {
    return (
      <Dialog
        description="Credit is kept until an instructor decides."
        label="Flag for the instructor"
        size="small"
        title="Flag this submission?"
        variant="secondary"
      >
        <form action={onFlag}>
          <input name="responseId" type="hidden" value={responseId} />
          {identifier}
          <FieldRow htmlFor={`flag-reason-${responseId}`} label="Reason">
            <Select
              defaultValue="empty_or_meaningless"
              id={`flag-reason-${responseId}`}
              name="reason"
            >
              {INVALID_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </Select>
          </FieldRow>
          <FieldRow
            htmlFor={`flag-note-${responseId}`}
            label="Note for the instructor"
          >
            <Field id={`flag-note-${responseId}`} name="note" />
          </FieldRow>
          <div className="row">
            <SubmitButton pendingLabel="Flagging…" variant="primary">
              Flag for the instructor
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    );
  }

  if (validity === "flagged" && canDecide) {
    return (
      <Dialog
        description={flagLine}
        label="Decide on this flag"
        size="small"
        title="A student assistant flagged this submission"
        variant="secondary"
      >
        <form action={onConfirm}>
          <input name="responseId" type="hidden" value={responseId} />
          {identifier}
          <FieldRow htmlFor={`confirm-reason-${responseId}`} label="Reason">
            <Select
              defaultValue="empty_or_meaningless"
              id={`confirm-reason-${responseId}`}
              name="reason"
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
            htmlFor={`confirm-student-${responseId}`}
            label={
              <>
                What the student sees <RequiredMark />
              </>
            }
          >
            <Field
              id={`confirm-student-${responseId}`}
              name="studentVisibleReason"
              required
            />
          </FieldRow>
          <div className="row">
            <SubmitButton pendingLabel="Removing…" variant="danger">
              Remove the credit
            </SubmitButton>
          </div>
        </form>
        <form action={onDismiss} className="mt-4">
          <input name="responseId" type="hidden" value={responseId} />
          <SubmitButton pendingLabel="Dismissing…" variant="secondary">
            Dismiss the flag and keep the credit
          </SubmitButton>
        </form>
      </Dialog>
    );
  }

  if (validity === "invalid" && canDecide) {
    return (
      <form action={onRestore}>
        <input name="responseId" type="hidden" value={responseId} />
        <SubmitButton pendingLabel="Reverting…" variant="secondary">
          Revert invalidation
        </SubmitButton>
      </form>
    );
  }

  return null;
}

/**
 * What was decided about this submission, near the top of it.
 *
 * Not a full-page banner and not only a colour: the heading names the state in
 * words, the stamp carries the word plus its shape plus its tone, and the two
 * reasons are labelled separately because they are two different texts with two
 * different audiences — the internal reason is staff vocabulary a student must
 * never read (DESIGN.md §11.15a), and the student-visible sentence is the only
 * one that ever leaves this page.
 *
 * It carries no action of its own. The reversal is in the header, where the act
 * itself was: two entry points side by side for one action is one too many
 * (DESIGN.md anti-pattern 28).
 */
function InvalidatedNotice({
  reason,
  studentVisibleReason,
  note,
  by,
  at,
}: {
  reason: string | null;
  studentVisibleReason: string | null;
  note: string | null;
  by: string | null;
  at: string | null;
}) {
  return (
    <Alert title="Invalidated submission" variant="error">
      <p className="mb-2">
        <Stamp tone="red">Invalidated</Stamp>
      </p>
      <p>It does not count toward this week&rsquo;s participation.</p>
      <dl className="mt-2 grid gap-1">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold">Reason</dt>
          <dd className="m-0">
            {reason
              ? (INVALID_REASON_LABEL.get(reason) ?? reason.replace(/_/g, " "))
              : "Not recorded"}
          </dd>
        </div>
        {studentVisibleReason && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-semibold">What the student sees</dt>
            <dd className="m-0">{studentVisibleReason}</dd>
          </div>
        )}
        {note && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-semibold">Staff note</dt>
            <dd className="m-0">{note}</dd>
          </div>
        )}
        {(by || at) && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-semibold">Decided</dt>
            <dd className="m-0">
              {[at, by ? `by ${by}` : null].filter(Boolean).join(" ")}
            </dd>
          </div>
        )}
      </dl>
    </Alert>
  );
}
