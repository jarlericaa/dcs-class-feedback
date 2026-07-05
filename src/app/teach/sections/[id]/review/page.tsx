import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { studentRecords, weeklyCycles } from "@/db/schema";
import { AuthzError } from "@/modules/authz";
import {
  createPrivateResponse,
  listSubmissionsForSection,
  setValidity,
} from "@/modules/review";
import {
  anonymityWarnings,
  draftPublicAnswer,
  publishNow,
} from "@/modules/publishing";

/** Teacher review dashboard: submissions, validity, private + public replies. */
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ warn?: string }>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/signin");
  const { id: sectionId } = await params;
  const { warn } = await searchParams;

  let submissions;
  try {
    submissions = await listSubmissionsForSection(userId, sectionId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return <main><p>You do not have access to this section.</p></main>;
    }
    throw err;
  }

  const cycleById = new Map(
    (submissions.length
      ? await db.query.weeklyCycles.findMany({
          where: inArray(
            weeklyCycles.id,
            [...new Set(submissions.map((s) => s.response.cycleId))],
          ),
        })
      : []
    ).map((c) => [c.id, c]),
  );
  const recordIds = [
    ...new Set(
      submissions
        .map((s) => s.response.studentRecordId)
        .filter((v): v is string => v !== null),
    ),
  ];
  const recordById = new Map(
    (recordIds.length
      ? await db.query.studentRecords.findMany({
          where: inArray(studentRecords.id, recordIds),
        })
      : []
    ).map((r) => [r.id, r]),
  );

  async function invalidate(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    await setValidity(
      uid,
      String(formData.get("responseId")),
      "invalid",
      String(formData.get("reason")) as "spam",
    );
    revalidatePath(`/teach/sections/${sectionId}/review`);
  }

  async function revalidate(formData: FormData) {
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
    await createPrivateResponse(
      uid,
      String(formData.get("itemId")),
      String(formData.get("body")),
    );
    revalidatePath(`/teach/sections/${sectionId}/review`);
  }

  async function draftAndPublish(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const publicQuestionText = String(formData.get("publicQuestion"));
    const itemIds = formData.getAll("itemId").map(String);
    // Pre-publish anonymity check (Risk R2): warn once before publishing.
    const warnings = anonymityWarnings(publicQuestionText, itemIds.length);
    if (warnings.length > 0 && formData.get("acknowledged") !== "yes") {
      redirect(
        `/teach/sections/${sectionId}/review?warn=${encodeURIComponent(warnings.join(" | "))}`,
      );
    }
    const answer = await draftPublicAnswer(uid, {
      sectionId,
      itemIds,
      publicQuestionText,
      answerBody: String(formData.get("answerBody")),
    });
    await publishNow(uid, answer.id);
    revalidatePath(`/teach/sections/${sectionId}/review`);
    redirect(`/teach/sections/${sectionId}/review`);
  }

  return (
    <main>
      <h1>Review submissions</h1>
      {warn && (
        <p style={{ color: "darkorange", border: "1px solid darkorange", padding: "0.5rem" }}>
          Anonymity warning: {warn} — re-submit with “I have checked the
          wording” ticked to publish anyway.
        </p>
      )}
      {submissions.length === 0 && <p>No submissions yet.</p>}
      {submissions.map(({ response, items }) => {
        const record = response.studentRecordId
          ? recordById.get(response.studentRecordId)
          : null;
        return (
          <article
            key={response.id}
            style={{ border: "1px solid #ccc", padding: "1rem", margin: "1rem 0" }}
          >
            <p>
              <strong>
                {record
                  ? `${record.fullName} (${record.studentNumber})`
                  : "Identity hidden"}
              </strong>{" "}
              · week {cycleById.get(response.cycleId)?.cycleIndex} · submitted{" "}
              {response.submittedAt.toLocaleString()} · review:{" "}
              {response.state} · validity: <strong>{response.validity}</strong>
              {response.invalidationReason && ` (${response.invalidationReason})`}
            </p>
            {response.validity === "valid" ? (
              <form action={invalidate} style={{ display: "inline" }}>
                <input type="hidden" name="responseId" value={response.id} />
                <select name="reason" defaultValue="spam">
                  <option value="spam">Spam</option>
                  <option value="abusive_content">Abusive content</option>
                  <option value="empty_or_meaningless">Empty / meaningless</option>
                  <option value="irrelevant">Irrelevant</option>
                  <option value="bad_faith_credit_attempt">Bad-faith credit attempt</option>
                </select>
                <button type="submit">Mark invalid</button>
              </form>
            ) : (
              <form action={revalidate} style={{ display: "inline" }}>
                <input type="hidden" name="responseId" value={response.id} />
                <button type="submit">Restore valid</button>
              </form>
            )}

            {items.map((item) => (
              <div key={item.id} style={{ marginTop: "0.75rem", paddingLeft: "1rem", borderLeft: "3px solid #eee" }}>
                <p>
                  <em>
                    {item.submissionType} · {item.category} · {item.reviewState} ·
                    disposition: {item.disposition}
                  </em>
                  <br />
                  {item.originalText}
                </p>
                <form action={sendPrivate}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input name="body" placeholder="Private reply to this student" required />
                  <button type="submit">Send private reply</button>
                </form>
                <form action={draftAndPublish} style={{ marginTop: "0.25rem" }}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input
                    name="publicQuestion"
                    placeholder="Reworded public question (original is preserved)"
                    required
                  />
                  <input name="answerBody" placeholder="Public answer" required />
                  <label>
                    <input type="checkbox" name="acknowledged" value="yes" /> I
                    have checked the wording for identifying context
                  </label>
                  <button type="submit">Publish anonymously to class</button>
                </form>
              </div>
            ))}
          </article>
        );
      })}
    </main>
  );
}
