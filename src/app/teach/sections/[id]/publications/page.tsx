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
} from "@/components/ui";
import {
  anonymityWarnings,
  cancelScheduledPublication,
  listPublicationQueue,
  publishNow,
  rewordPublicQuestion,
  schedulePublication,
  updateAnswerBody,
} from "@/modules/publishing";
import { AuthzError } from "@/modules/authz";

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
  const ctx = await loadStaffSection(sectionId, "draftPublicAnswers");
  if (!ctx.ok) {
    return (
      <AppShell user={ctx.user} workspace="staff" navGroups={[]} title="Publication queue">
        <AccessDenied what="this section's public answers" />
      </AppShell>
    );
  }
  const { user, access, section, course, can } = ctx;
  const queue = await listPublicationQueue(user.id, sectionId);

  const back = (message: string, kind: "ok" | "error" | "warn" = "ok") =>
    `/teach/sections/${sectionId}/publications?${kind}=${encodeURIComponent(message)}`;

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
      redirect(back(describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/publications`);
    redirect(back("Draft saved."));
  }

  async function publish(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const answerId = String(formData.get("answerId"));
    const question = String(formData.get("publicQuestion") ?? "");
    const sourceCount = Number(formData.get("sourceCount") ?? 1);
    const warnings = anonymityWarnings(question, sourceCount);
    if (warnings.length > 0 && formData.get("acknowledged") !== "yes") {
      redirect(back(warnings.join(" | "), "warn"));
    }
    try {
      await publishNow(uid, answerId);
    } catch (err) {
      redirect(back(describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/publications`);
    redirect(back("Published to this section."));
  }

  async function schedule(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const answerId = String(formData.get("answerId"));
    const when = String(formData.get("scheduledAt") ?? "");
    if (!when) redirect(back("Pick a date and time to schedule.", "error"));
    try {
      await schedulePublication(uid, answerId, new Date(when));
    } catch (err) {
      redirect(back(describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/publications`);
    redirect(back("Scheduled. The reconciliation poller publishes it."));
  }

  async function cancel(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await cancelScheduledPublication(uid, String(formData.get("answerId")));
    } catch (err) {
      redirect(back(describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/publications`);
    redirect(back("Schedule cancelled. It is a draft again."));
  }

  const editable = [...queue.failed, ...queue.drafts, ...queue.scheduled];

  return (
    <AppShell
      user={user}
      workspace="staff"
      navGroups={staffSectionNav(access, `/teach/sections/${sectionId}/publications`)}
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
              <div className="row-gap" style={{ justifyContent: "space-between" }}>
                <div>
                  <p className="section-kicker">
                    {sourceCount} source submission{sourceCount === 1 ? "" : "s"}
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
                    Scheduled {formatDateTime(answer.scheduledAt, section.timezone)}
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

              <form action={saveDraft} className="stack-gap" style={{ marginTop: 16 }}>
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
                      <input
                        type="hidden"
                        name="publicQuestion"
                        value={answer.publicQuestionText}
                      />
                      <input type="hidden" name="sourceCount" value={sourceCount} />
                      <label className="choice">
                        <input type="checkbox" name="acknowledged" value="yes" />
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
                      <button className="button button--secondary" type="submit">
                        {answer.state === "scheduled" ? "Reschedule" : "Schedule"}
                      </button>
                    </form>
                    {answer.state === "scheduled" && (
                      <form action={cancel} style={{ marginTop: 10 }}>
                        <input type="hidden" name="answerId" value={answer.id} />
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
                <p>
                  Published answers cannot be withdrawn in this release.
                </p>
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
                      {answer.publishedLate && " · published late by reconciliation"}
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
