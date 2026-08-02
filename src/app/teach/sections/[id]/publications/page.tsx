import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { loadStaffSectionAny } from "@/lib/staff-section";
import { formatDateTime } from "@/lib/datetime";
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
  AnonymityCheckRequired,
  cancelScheduledPublication,
  listPublicationQueue,
  publishNow,
  rewordPublicQuestion,
  schedulePublication,
  updateAnswerBody,
} from "@/modules/publishing";
import { AuthzError, PUBLICATION_PERMISSIONS } from "@/modules/authz";
import { zonedTimeToUtc } from "@/modules/forms/timezone";
import { toShellUser } from "@/lib/session";

/**
 * Publication queue: drafts, scheduled answers, failed publications and what
 * has recently gone out.
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
  const { id: sectionId } = await params;
  const { ok, error, warn } = await searchParams;
  // Reading the queue needs any publication capability, not specifically
  // draftPublicAnswers — listPublicationQueue enforces the same rule.
  const ctx = await loadStaffSectionAny(sectionId, PUBLICATION_PERMISSIONS);
  if (!ctx.ok) {
    return (
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={[]}
        title="Publication queue"
      >
        <AccessDenied what="this section's public answers" />
      </AppShell>
    );
  }
  const { user, access, section, course, can } = ctx;
  const queue = await listPublicationQueue(user.id, sectionId);
  // A server action may only close over serializable values, so pull the
  // timezone out as a string rather than capturing `section`.
  const timezone = section.timezone;

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
      redirect(backTo(sectionId, describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/publications`);
    redirect(backTo(sectionId, "Draft saved."));
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
        redirect(backTo(sectionId, err.warnings.join(" | "), "warn"));
      }
      redirect(backTo(sectionId, describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/publications`);
    redirect(backTo(sectionId, "Published to this section."));
  }

  async function schedule(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const answerId = String(formData.get("answerId"));
    const when = String(formData.get("scheduledAt") ?? "");
    if (!when)
      redirect(backTo(sectionId, "Pick a date and time to schedule.", "error"));
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
        redirect(backTo(sectionId, err.warnings.join(" | "), "warn"));
      }
      redirect(backTo(sectionId, describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/publications`);
    redirect(
      backTo(sectionId, "Scheduled. The reconciliation poller publishes it."),
    );
  }

  async function cancel(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await cancelScheduledPublication(uid, String(formData.get("answerId")));
    } catch (err) {
      redirect(backTo(sectionId, describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/publications`);
    redirect(backTo(sectionId, "Schedule cancelled. It is a draft again."));
  }

  const editable = [...queue.failed, ...queue.drafts, ...queue.scheduled];

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={staffSectionNav(
        access,
        `/teach/sections/${sectionId}/publications`,
      )}
      contextLabel={section.title}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/", label: "Overview" },
            { label: `${course.code} · ${section.term}` },
            { label: "Publication queue" },
          ]}
        />
      }
      eyebrow="Staff only"
      title="Publication queue"
      description="Drafts, scheduled answers, and anything whose publication failed."
    >
      <div className="stack-gap">
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
          <EmptyState title="Nothing waiting to publish">
            Drafts you create from the review inbox appear here, together with
            anything scheduled for later.
          </EmptyState>
        ) : (
          editable.map(({ answer, sourceCount }) => (
            <section className="card card--padded" key={answer.id}>
              <div
                className="row-gap"
                style={{ justifyContent: "space-between" }}
              >
                <div>
                  <p className="section-kicker">
                    {sourceCount} source submission
                    {sourceCount === 1 ? "" : "s"}
                    {sourceCount > 1 && " · merged"}
                  </p>
                  <h2 style={{ margin: "2px 0 0", fontSize: 17 }}>
                    {answer.publicQuestionText}
                  </h2>
                </div>
                {answer.publishFailed ? (
                  <Badge tone="red">Publication failed</Badge>
                ) : answer.state === "scheduled" ? (
                  <Badge tone="amber">
                    Scheduled{" "}
                    {formatDateTime(answer.scheduledAt, section.timezone)}
                  </Badge>
                ) : (
                  <Badge tone="neutral">Draft</Badge>
                )}
              </div>

              {answer.publishFailed && answer.publishFailureReason && (
                <div style={{ marginTop: 12 }}>
                  <Alert variant="error" title="Why it failed">
                    {answer.publishFailureReason}
                  </Alert>
                </div>
              )}

              <form
                action={saveDraft}
                className="stack-gap"
                style={{ marginTop: 16 }}
              >
                <input type="hidden" name="answerId" value={answer.id} />
                <div className="field-row">
                  <label htmlFor={`q-${answer.id}`}>Public question</label>
                  <textarea
                    id={`q-${answer.id}`}
                    className="textarea-field"
                    name="publicQuestion"
                    rows={2}
                    defaultValue={answer.publicQuestionText}
                  />
                  <span className="helper-text">
                    The student&apos;s original wording is preserved separately
                    and never changes.
                  </span>
                </div>
                <div className="field-row">
                  <label htmlFor={`a-${answer.id}`}>Answer</label>
                  <textarea
                    id={`a-${answer.id}`}
                    className="textarea-field"
                    name="answerBody"
                    rows={5}
                    defaultValue={answer.answerBody ?? ""}
                  />
                </div>
                <div>
                  <button className="button button--secondary" type="submit">
                    Save draft
                  </button>
                </div>
              </form>

              <div className="composer-grid" style={{ marginTop: 18 }}>
                {can("publishPublicAnswers") && (
                  <div className="composer-card">
                    <h3>Publish now</h3>
                    <p>
                      Visible to everyone enrolled in this section. The asker
                      stays anonymous, but specific details can still identify
                      them.
                    </p>
                    <form action={publish}>
                      <input type="hidden" name="answerId" value={answer.id} />
                      <label className="choice">
                        <input
                          type="checkbox"
                          name="acknowledged"
                          value="yes"
                        />
                        <span>I have checked the public wording</span>
                      </label>
                      <button className="button button--primary" type="submit">
                        Publish to this section
                      </button>
                    </form>
                  </div>
                )}

                {can("schedulePublication") && (
                  <div className="composer-card">
                    <h3>
                      {answer.state === "scheduled" ? "Reschedule" : "Schedule"}
                    </h3>
                    <p>
                      Times are {section.timezone}. Publication is retried by
                      the reconciliation poller if the app was down.
                    </p>
                    <form action={schedule}>
                      <input type="hidden" name="answerId" value={answer.id} />
                      <label
                        className="visually-hidden"
                        htmlFor={`when-${answer.id}`}
                      >
                        Publish at
                      </label>
                      <input
                        id={`when-${answer.id}`}
                        className="field"
                        type="datetime-local"
                        name="scheduledAt"
                        required
                      />
                      <label className="choice">
                        <input
                          type="checkbox"
                          name="acknowledged"
                          value="yes"
                        />
                        <span>I have checked the public wording</span>
                      </label>
                      <button
                        className="button button--secondary"
                        type="submit"
                      >
                        {answer.state === "scheduled"
                          ? "Reschedule"
                          : "Schedule"}
                      </button>
                    </form>
                    {answer.state === "scheduled" && (
                      <form action={cancel} style={{ marginTop: 10 }}>
                        <input
                          type="hidden"
                          name="answerId"
                          value={answer.id}
                        />
                        <button
                          className="button button--quiet button--small"
                          type="submit"
                        >
                          Cancel schedule
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </section>
          ))
        )}

        {queue.published.length > 0 && (
          <section className="card">
            <div className="card__header">
              <div>
                <h2>Recently published</h2>
                <p>Published answers cannot be withdrawn in this release.</p>
              </div>
            </div>
            <ul className="data-list">
              {queue.published.map(({ answer, sourceCount }) => (
                <li key={answer.id}>
                  <span className="data-list__main">
                    <strong>{answer.publicQuestionText}</strong>
                    <small>
                      Published{" "}
                      {formatDateTime(answer.publishedAt, section.timezone)} ·{" "}
                      {sourceCount} source{sourceCount === 1 ? "" : "s"}
                      {answer.publishedLate &&
                        " · published late by reconciliation"}
                    </small>
                  </span>
                  <Badge tone="green">Live to this section</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function describe(err: unknown): string {
  if (err instanceof AuthzError) return err.message;
  if (err instanceof Error) return err.message;
  throw err;
}

/**
 * Module scope on purpose: a server action serializes everything it closes
 * over, so it may not capture a helper defined inside the page component.
 */
function backTo(
  sectionId: string,
  message: string,
  kind: "ok" | "error" | "warn" = "ok",
): string {
  return `/teach/sections/${sectionId}/publications?${kind}=${encodeURIComponent(message)}`;
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
