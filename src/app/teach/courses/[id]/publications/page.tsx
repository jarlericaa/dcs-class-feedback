import { SubmitButton } from "@/components/ui/submit-button";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { formatDateTime } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  Alert,
  Stamp,
  EmptyState,
  MetaList,
} from "@/components/ui";
import {
  AnonymityCheckRequired,
  cancelScheduledPublication,
  listCoursePublicationQueue,
  publishNow,
  rewordPublicQuestion,
  schedulePublication,
  updateAnswerBody,
} from "@/modules/publishing";
import { AuthzError, getCourseCapabilities } from "@/modules/authz";
import { resolveCourseTimezone } from "@/modules/catalog";
import { zonedTimeToUtc } from "@/modules/forms/timezone";
import { requireUser, toShellUser } from "@/lib/session";
import { courses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Choice, Field, FieldRow, Textarea } from "@/components/ui/form";

/**
 * Publication queue: drafts, scheduled answers, failed publications and what
 * has recently gone out — for the COURSE (ADR-0005).
 *
 * One queue per course, not one per class list. The teaching team of CS 33
 * works a single pipeline, and an answer drafted from a Lab A question is the
 * same object every instructor on the course opens. Nothing on this page asks
 * which section should see a publication, because a publication goes to the
 * course.
 *
 * A scheduled publication that fails deliberately stays scheduled and flagged
 * rather than silently disappearing, so it can be retried here.
 */
export default async function PublicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; warn?: string }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const path = `/teach/courses/${courseId}/publications`;
  const { ok, error, warn } = await searchParams;

  /**
   * Reading the queue needs ANY publication capability, not specifically
   * `draft_public_answers` — `listCoursePublicationQueue` enforces exactly that
   * rule, so the page asks it rather than re-deriving one.
   */
  let queue;
  try {
    queue = await listCoursePublicationQueue(user.id, courseId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={await primaryNavFor(user, path)}
          title="Publication queue"
        >
          <AccessDenied what="this course's public answers" />
        </AppShell>
      );
    }
    throw err;
  }

  const course = (await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  }))!;
  /**
   * Scheduling happens in the COURSE's timezone, resolved by one shared rule
   * (`resolveCourseTimezone`) rather than by reading whichever section a query
   * happened to return first. A server action may only close over serializable
   * values, so it is pulled out as a string.
   */
  const timezone = await resolveCourseTimezone(courseId);
  /**
   * Which controls to draw. A union across this reader's course standing and
   * their section grants — presentation only; each action re-checks server-side.
   */
  const capabilities = await getCourseCapabilities(db, user.id, courseId);
  const can = (permission: "publishPublicAnswers" | "schedulePublication") =>
    capabilities?.permissions[permission] ?? false;

  async function saveDraft(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const answerId = String(formData.get("answerId"));
    const question = String(formData.get("publicQuestion") ?? "").trim();
    const body = String(formData.get("answerBody") ?? "").trim();
    try {
      if (question) await rewordPublicQuestion(uid, answerId, question);
      await updateAnswerBody(uid, answerId, body);
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/publications`);
    // The archive the answer lands in is course-owned, so it is the other page
    // this action can change.
    revalidatePath(`/courses/${courseId}/qa`);
    redirect(backTo(courseId, "Draft saved."));
  }

  async function publish(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const answerId = String(formData.get("answerId"));
    // No question text or source count comes from the form: publishNow reads
    // both from the database, so a tampered field cannot dodge the warning.
    try {
      await publishNow(uid, answerId, {
        anonymityAcknowledged: formData.get("acknowledged") === "yes",
      });
    } catch (err) {
      if (err instanceof AnonymityCheckRequired) {
        redirect(backTo(courseId, err.warnings.join(" | "), "warn"));
      }
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/publications`);
    // The archive the answer lands in is course-owned, so it is the other page
    // this action can change.
    revalidatePath(`/courses/${courseId}/qa`);
    redirect(
      backTo(courseId, "Published to Class Q&A without the asker's name."),
    );
  }

  async function schedule(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const answerId = String(formData.get("answerId"));
    const when = String(formData.get("scheduledAt") ?? "");
    if (!when)
      redirect(backTo(courseId, "Pick a date and time to schedule.", "error"));
    try {
      // Scheduling is the last human moment before the background executor
      // publishes, so the anonymity check is enforced here too.
      //
      // `when` is a datetime-local value with no offset ("2026-08-05T14:30").
      // new Date() would read it in the SERVER's timezone, so a UTC deployment
      // would publish hours early or late. Interpret it in the section's
      // timezone, which is what the staff member saw next to the field.
      await schedulePublication(
        uid,
        answerId,
        parseLocalToUtc(when, timezone),
        {
          anonymityAcknowledged: formData.get("acknowledged") === "yes",
        },
      );
    } catch (err) {
      if (err instanceof AnonymityCheckRequired) {
        redirect(backTo(courseId, err.warnings.join(" | "), "warn"));
      }
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/publications`);
    // The archive the answer lands in is course-owned, so it is the other page
    // this action can change.
    revalidatePath(`/courses/${courseId}/qa`);
    redirect(
      // CONTENT-VOICE §4 A1: "reconciliation poller" is a module name, and the
      // teacher's actual question is when. Both answered now.
      backTo(
        courseId,
        `Scheduled for ${formatDateTime(parseLocalToUtc(when, timezone), timezone)}. It publishes automatically — you do not need to be here.`,
      ),
    );
  }

  async function cancel(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await cancelScheduledPublication(uid, String(formData.get("answerId")));
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/publications`);
    // The archive the answer lands in is course-owned, so it is the other page
    // this action can change.
    revalidatePath(`/courses/${courseId}/qa`);
    redirect(backTo(courseId, "Schedule cancelled. This is a draft again."));
  }

  const editable = [...queue.failed, ...queue.drafts, ...queue.scheduled];

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, path, {
        /* A section is reached through its course, and the course now has its
           own rail row — so mark that one rather than the courses index. */
        fallbackHref: `/teach/courses/${course.id}`,
      })}
      tabGroups={await courseTabGroupsFor(user.id, courseId, path)}
      tabsLabel={course.code}
      tabsMode="menu"
      contextLabel={course.code}
      crumbs={[
        { href: "/teach/courses", label: "My courses" },
        { href: `/teach/courses/${course.id}`, label: course.code },
      ]}
      title="Publication queue"
    >
      <div className="stack-4">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        {warn && (
          <Alert variant="warning" title="Check the wording before publishing">
            <ul>
              {warn.split(" | ").map((w, index) => (
                <li key={index}>{w}</li>
              ))}
            </ul>
            Tick the acknowledgment to publish anyway.
          </Alert>
        )}

        {queue.failed.length > 0 && (
          <Alert variant="error" title="Some scheduled publications failed">
            They are still scheduled and were not published. Fix and publish
            them below.
          </Alert>
        )}

        {editable.length === 0 ? (
          <EmptyState
            title="No answers waiting to publish"
            action={{
              href: `/teach/courses/${courseId}/responses`,
              label: "Responses",
            }}
            primary
          >
            Drafts and scheduled answers wait here. You start one from a
            response, or from the question backlog.
          </EmptyState>
        ) : (
          editable.map(({ answer, sourceCount }) => (
            <section className="notice notice--pad" key={answer.id}>
              <div className="row justify-between">
                <div>
                  <p className="label">
                    {sourceCount} source submission
                    {sourceCount === 1 ? "" : "s"}
                    {sourceCount > 1 && ", merged"}
                  </p>
                  <h2 className="panel-title">{answer.publicQuestionText}</h2>
                </div>
                {answer.publishFailed ? (
                  <Stamp tone="red">Publication failed</Stamp>
                ) : answer.state === "scheduled" ? (
                  <Stamp tone="amber">
                    Scheduled{" "}
                    {formatDateTime(answer.scheduledAt, timezone)}
                  </Stamp>
                ) : (
                  <Stamp tone="neutral">Draft</Stamp>
                )}
              </div>

              {answer.publishFailed && answer.publishFailureReason && (
                <div className="mt-3">
                  <Alert variant="error" title="Why it failed">
                    {answer.publishFailureReason}
                  </Alert>
                </div>
              )}

              <form action={saveDraft} className="stack-4 mt-4">
                <input type="hidden" name="answerId" value={answer.id} />
                <FieldRow label="Public question" htmlFor={`q-${answer.id}`}>
                  <Textarea
                    id={`q-${answer.id}`}
                    name="publicQuestion"
                    rows={2}
                    defaultValue={answer.publicQuestionText}
                  />
                </FieldRow>
                <FieldRow label="Answer" htmlFor={`a-${answer.id}`}>
                  <Textarea
                    id={`a-${answer.id}`}
                    name="answerBody"
                    rows={5}
                    defaultValue={answer.answerBody ?? ""}
                  />
                </FieldRow>
                <div>
                  <SubmitButton variant="secondary" pendingLabel="Saving…">
                    Save draft
                  </SubmitButton>
                </div>
              </form>

              <div className="composers">
                {can("publishPublicAnswers") && (
                  <div className="composer">
                    <h3>Publish now</h3>
                    <form action={publish}>
                      <input type="hidden" name="answerId" value={answer.id} />
                      <Choice type="checkbox" name="acknowledged" value="yes">
                        I have checked the public wording
                      </Choice>
                      <SubmitButton
                        variant="primary"
                        pendingLabel="Publishing…"
                      >
                        Publish to Class Q&amp;A
                      </SubmitButton>
                    </form>
                  </div>
                )}

                {can("schedulePublication") && (
                  <div className="composer">
                    <h3>
                      {answer.state === "scheduled" ? "Reschedule" : "Schedule"}
                    </h3>
                    <form action={schedule}>
                      <input type="hidden" name="answerId" value={answer.id} />
                      <label
                        className="visually-hidden"
                        htmlFor={`when-${answer.id}`}
                      >
                        Publish at
                      </label>
                      <Field
                        id={`when-${answer.id}`}
                        type="datetime-local"
                        name="scheduledAt"
                        required
                      />
                      <Choice type="checkbox" name="acknowledged" value="yes">
                        I have checked the public wording
                      </Choice>
                      <SubmitButton
                        variant="secondary"
                        pendingLabel="Scheduling…"
                      >
                        {answer.state === "scheduled"
                          ? "Reschedule"
                          : "Schedule"}
                      </SubmitButton>
                    </form>
                    {answer.state === "scheduled" && (
                      <form action={cancel} className="mt-2">
                        <input
                          type="hidden"
                          name="answerId"
                          value={answer.id}
                        />
                        <SubmitButton
                          variant="quiet"
                          size="small"
                          pendingLabel="Cancelling…"
                        >
                          Cancel schedule
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </section>
          ))
        )}

        {queue.published.length > 0 && (
          <section className="notice">
            <div className="notice__head">
              <div>
                <h2 className="panel-title">Recently published</h2>
              </div>
            </div>
            <ul className="data-list">
              {queue.published.map(({ answer, sourceCount }) => (
                <li key={answer.id}>
                  <span className="data-list__main">
                    {/* The question is the way to the answer. The row used to
                        carry the title as inert bold text with the live/scheduled
                        stamp as its only affordance — a badge that led nowhere,
                        beside the one thing a reader actually wants to open.
                        Same href the review feed uses, so "see it in the class
                        Q&A" means one destination everywhere. */}
                    <strong>
                      <Link
                        className="link"
                        href={`/courses/${courseId}/qa?selected=${answer.id}`}
                      >
                        {answer.publicQuestionText}
                      </Link>
                    </strong>
                    <MetaList
                      items={[
                        `Published ${formatDateTime(answer.publishedAt, timezone)}`,
                        `${sourceCount} source submission${sourceCount === 1 ? "" : "s"}`,
                        // "published late by reconciliation" named the module.
                        answer.publishedLate &&
                          "Published later than scheduled",
                      ]}
                    />
                  </span>
                  {/* State only, no longer the row's target. One archive per
                      course, so there is no "to this section" left to say. */}
                  <Stamp tone="green">Published</Stamp>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}

/**
 * The register boundary (CONTENT-VOICE §3).
 *
 * A module error is SYSTEM copy — invariant-shaped, no recovery path — and must
 * never reach a teacher verbatim. This used to return `err.message` for any
 * Error, so all 35 module strings could surface as-is; a teacher reading
 * "Cannot publish an answer in state published" learns that the product talks
 * about them in database states.
 *
 * An AuthzError is already user-facing copy. Everything else maps to the one
 * honest generic, and the original is left for the server log.
 */
function describe(err: unknown): string {
  if (err instanceof AuthzError) return err.message;
  if (err instanceof Error) {
    console.error("[publications] unmapped module error", err);
    return "That did not work. Nothing was changed.";
  }
  throw err;
}

/**
 * Module scope on purpose: a server action serializes everything it closes
 * over, so it may not capture a helper defined inside the page component.
 */
function backTo(
  courseId: string,
  message: string,
  kind: "ok" | "error" | "warn" = "ok",
): string {
  return `/teach/courses/${courseId}/publications?${kind}=${encodeURIComponent(message)}`;
}

/**
 * Interpret a `datetime-local` value (no offset) as wall-clock time in the
 * section's timezone and return the corresponding UTC instant.
 */
function parseLocalToUtc(value: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value,
  );
  if (!match) return new Date(value);
  const [, y, mo, d, h, mi, sec] = match;
  return zonedTimeToUtc(
    Number(y),
    Number(mo),
    Number(d),
    Number(h),
    Number(mi),
    Number(sec ?? "0"),
    timeZone,
  );
}
