import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { currentUserId } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { db } from "@/db";
import { studentRecords, weeklyCycles } from "@/db/schema";
import { AuthzError } from "@/modules/authz";
import { createPrivateResponse, listSubmissionsForSection, setValidity } from "@/modules/review";
import { anonymityWarnings, draftPublicAnswer, publishNow } from "@/modules/publishing";

/** Teacher review dashboard: submissions, validity, private + public replies. */
export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ warn?: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect("/signin");
  const { id: sectionId } = await params;
  const { warn } = await searchParams;
  let submissions;
  try {
    submissions = await listSubmissionsForSection(userId, sectionId);
  } catch (err) {
    if (err instanceof AuthzError) return <main className="page-shell"><div className="card empty-state"><h1>Access unavailable</h1><p>You do not have access to this section.</p></div></main>;
    throw err;
  }

  const cycleById = new Map((submissions.length ? await db.query.weeklyCycles.findMany({ where: inArray(weeklyCycles.id, [...new Set(submissions.map((s) => s.response.cycleId))]) }) : []).map((c) => [c.id, c]));
  const recordIds = [...new Set(submissions.map((s) => s.response.studentRecordId).filter((v): v is string => v !== null))];
  const recordById = new Map((recordIds.length ? await db.query.studentRecords.findMany({ where: inArray(studentRecords.id, recordIds) }) : []).map((r) => [r.id, r]));

  async function invalidate(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await setValidity(uid, String(formData.get("responseId")), "invalid", String(formData.get("reason")) as "spam");
    revalidatePath("/teach/sections/" + sectionId + "/review");
  }
  async function revalidate(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await setValidity(uid, String(formData.get("responseId")), "valid");
    revalidatePath("/teach/sections/" + sectionId + "/review");
  }
  async function sendPrivate(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await createPrivateResponse(uid, String(formData.get("itemId")), String(formData.get("body")));
    revalidatePath("/teach/sections/" + sectionId + "/review");
  }
  async function draftAndPublish(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const publicQuestionText = String(formData.get("publicQuestion"));
    const itemIds = formData.getAll("itemId").map(String);
    const warnings = anonymityWarnings(publicQuestionText, itemIds.length);
    if (warnings.length > 0 && formData.get("acknowledged") !== "yes") redirect("/teach/sections/" + sectionId + "/review?warn=" + encodeURIComponent(warnings.join(" | ")));
    const answer = await draftPublicAnswer(uid, { sectionId, itemIds, publicQuestionText, answerBody: String(formData.get("answerBody")) });
    await publishNow(uid, answer.id);
    revalidatePath("/teach/sections/" + sectionId + "/review");
    redirect("/teach/sections/" + sectionId + "/review");
  }

  return (
    <AppShell workspace="staff" sectionId={sectionId} eyebrow="Teaching team" title="Review inbox" description="Validate submissions, reply privately, and publish carefully reworded answers to the class archive.">
      <div className="stack-gap">
        {warn && <div className="alert alert-warning"><strong>Anonymity check</strong><p>{warn}</p><span>Review the wording and acknowledge the check before publishing.</span></div>}
        <div className="stat-row"><div className="stat-card"><span className="eyebrow">Inbox</span><strong>{submissions.length}</strong><span className="muted">submissions to review</span></div><div className="stat-card"><span className="eyebrow">Privacy gate</span><strong>On</strong><span className="muted">required before publishing</span></div><div className="stat-card"><span className="eyebrow">Visibility</span><strong>Private</strong><span className="muted">until staff publishes</span></div></div>
        {submissions.length === 0 ? <div className="card empty-state"><div className="empty-icon">✓</div><h2>Review inbox is clear</h2><p>New student submissions will appear here for validation.</p></div> : <div className="review-layout"><section className="card review-queue"><div className="card-heading"><div><span className="eyebrow">Needs attention</span><h2>Submissions</h2></div><span className="privacy-pill">Staff only</span></div>{submissions.map(({ response, items }) => <div key={response.id} className="queue-row"><div><strong>{response.studentRecordId ? recordById.get(response.studentRecordId)?.fullName : "Identity hidden"}</strong><span className="muted">Week {cycleById.get(response.cycleId)?.cycleIndex} · {items.length} item{items.length === 1 ? "" : "s"}</span></div><span className={response.validity === "valid" ? "badge badge-success" : "badge badge-danger"}>{response.validity}</span></div>)}</section><section className="review-detail">{submissions.map(({ response, items }) => { const record = response.studentRecordId ? recordById.get(response.studentRecordId) : null; return <article key={response.id} className="card detail-card"><div className="card-heading"><div><span className="eyebrow">Week {cycleById.get(response.cycleId)?.cycleIndex} · {response.state}</span><h2>{record ? record.fullName : "Identity hidden"}</h2><p className="muted">{record?.studentNumber ?? "No student identity attached"} · submitted {response.submittedAt.toLocaleString()}</p></div><span className={response.validity === "valid" ? "badge badge-success" : "badge badge-danger"}>{response.validity}</span></div>{response.validity === "valid" ? <form action={invalidate} className="inline-form"><input type="hidden" name="responseId" value={response.id} /><select className="select-field" name="reason" defaultValue="spam"><option value="spam">Spam</option><option value="abusive_content">Abusive content</option><option value="empty_or_meaningless">Empty / meaningless</option><option value="irrelevant">Irrelevant</option><option value="bad_faith_credit_attempt">Bad-faith credit attempt</option></select><button className="button button-quiet" type="submit">Mark invalid</button></form> : <form action={revalidate} className="inline-form"><input type="hidden" name="responseId" value={response.id} /><button className="button button-quiet" type="submit">Restore valid</button></form>}{items.map((item) => <div key={item.id} className="review-item"><div className="item-heading"><span className="badge">{item.submissionType}</span><span className="muted">{item.category} · {item.reviewState} · {item.disposition}</span></div><p className="original-text">{item.originalText}</p><div className="composer-grid"><form action={sendPrivate} className="composer-card"><span className="eyebrow">Private reply</span><input type="hidden" name="itemId" value={item.id} /><textarea className="textarea-field" name="body" placeholder="Reply to this student" required /><button className="button button-secondary" type="submit">Send privately</button></form><form action={draftAndPublish} className="composer-card composer-public"><span className="eyebrow">Public answer</span><input type="hidden" name="itemId" value={item.id} /><input className="field" name="publicQuestion" placeholder="Reworded public question" required /><textarea className="textarea-field" name="answerBody" placeholder="Answer for the class" required /><label className="check-row"><input type="checkbox" name="acknowledged" value="yes" /> I checked this wording for identifying context</label><button className="button button-primary" type="submit">Publish to class archive</button></form></div></div>)}</article>; })}</section></div>}
      </div>
    </AppShell>
  );
}
