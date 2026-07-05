import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import {
  getOpenCycleForStudent,
  submitResponse,
  SubmissionError,
} from "@/modules/forms/submission";
import type { QuestionOption } from "@/modules/forms/questions";
import { AuthzError } from "@/modules/authz";

/** Student weekly form for the currently-open cycle of this section. */
export default async function SectionFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/signin");
  const { id: sectionId } = await params;
  const { error } = await searchParams;

  let current;
  try {
    current = await getOpenCycleForStudent(userId, sectionId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return <main><p>You do not have access to this section.</p></main>;
    }
    throw err;
  }

  if (!current) {
    return (
      <main>
        <h1>Weekly form</h1>
        <p>No form is open right now.</p>
      </main>
    );
  }
  if (current.alreadySubmitted) {
    return (
      <main>
        <h1>Weekly form</h1>
        <p>
          Submitted. You have already completed this week&apos;s form —
          submissions cannot be edited.
        </p>
      </main>
    );
  }

  const { cycle, questions } = current;

  async function submit(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const answers = questions.map((q) => {
      const raw = formData.getAll(`q_${q.id}`).map(String).filter(Boolean);
      switch (q.type) {
        case "short_answer":
        case "paragraph":
          return { questionId: q.id, text: raw[0] ?? "" };
        case "multiple_choice":
        case "dropdown":
        case "checkboxes":
          return { questionId: q.id, optionIds: raw };
        case "linear_scale":
          return raw[0]
            ? { questionId: q.id, scaleValue: Number(raw[0]) }
            : { questionId: q.id };
        case "yes_no":
          return raw[0]
            ? { questionId: q.id, boolValue: raw[0] === "yes" }
            : { questionId: q.id };
        case "date":
          return { questionId: q.id, dateValue: raw[0] || undefined };
        case "time":
          return { questionId: q.id, timeValue: raw[0] || undefined };
      }
    });
    const itemText = String(formData.get("item_text") ?? "").trim();
    try {
      await submitResponse(uid, cycle.id, {
        answers,
        studentItem: itemText
          ? {
              submissionType: String(formData.get("item_type")) as "question",
              category: String(formData.get("item_category")) as "content",
              text: itemText,
            }
          : undefined,
      });
    } catch (err) {
      if (err instanceof SubmissionError) {
        const detail = err.details[0]?.message ?? err.message;
        redirect(`/sections/${sectionId}?error=${encodeURIComponent(detail)}`);
      }
      throw err;
    }
    revalidatePath(`/sections/${sectionId}`);
    redirect(`/sections/${sectionId}/history`);
  }

  return (
    <main>
      <h1>Weekly form — week {cycle.cycleIndex}</h1>
      <p>Deadline: {cycle.deadlineAt.toLocaleString()}</p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <form action={submit}>
        {questions.map((q) => (
          <fieldset key={q.id} style={{ margin: "1rem 0" }}>
            <legend>
              {q.prompt} {q.required && <em>(required)</em>}
            </legend>
            {q.description && <p>{q.description}</p>}
            {(q.type === "short_answer" || q.type === "paragraph") && (
              <textarea name={`q_${q.id}`} rows={q.type === "paragraph" ? 4 : 1} />
            )}
            {(q.type === "multiple_choice" || q.type === "checkboxes") &&
              ((q.options ?? []) as QuestionOption[]).map((opt) => (
                <label key={opt.stableId} style={{ display: "block" }}>
                  <input
                    type={q.type === "checkboxes" ? "checkbox" : "radio"}
                    name={`q_${q.id}`}
                    value={opt.stableId}
                  />
                  {opt.label}
                </label>
              ))}
            {q.type === "dropdown" && (
              <select name={`q_${q.id}`} defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                {((q.options ?? []) as QuestionOption[]).map((opt) => (
                  <option key={opt.stableId} value={opt.stableId}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
            {q.type === "linear_scale" &&
              (() => {
                const scale = q.scale as {
                  min: number;
                  max: number;
                  step?: number;
                };
                const values = [];
                for (let v = scale.min; v <= scale.max; v += scale.step ?? 1) {
                  values.push(v);
                }
                return values.map((v) => (
                  <label key={v} style={{ marginRight: "0.75rem" }}>
                    <input type="radio" name={`q_${q.id}`} value={v} /> {v}
                  </label>
                ));
              })()}
            {q.type === "yes_no" && (
              <>
                <label>
                  <input type="radio" name={`q_${q.id}`} value="yes" /> Yes
                </label>{" "}
                <label>
                  <input type="radio" name={`q_${q.id}`} value="no" /> No
                </label>
              </>
            )}
            {q.type === "date" && <input type="date" name={`q_${q.id}`} />}
            {q.type === "time" && <input type="time" name={`q_${q.id}`} />}
          </fieldset>
        ))}

        <fieldset style={{ margin: "1rem 0" }}>
          <legend>Your question or feedback (optional)</legend>
          <label>
            Type:{" "}
            <select name="item_type" defaultValue="question">
              <option value="question">Question</option>
              <option value="feedback">Feedback</option>
              <option value="concern">Concern</option>
              <option value="clarification">Clarification</option>
              <option value="suggestion">Suggestion</option>
            </select>
          </label>{" "}
          <label>
            Category:{" "}
            <select name="item_category" defaultValue="content">
              <option value="content">Content</option>
              <option value="logistics">Logistics</option>
              <option value="misc">Miscellaneous</option>
            </select>
          </label>
          <textarea
            name="item_text"
            rows={3}
            style={{ display: "block", width: "100%", marginTop: "0.5rem" }}
            placeholder="Ask a question or leave feedback…"
          />
        </fieldset>

        <button type="submit">Submit (cannot be edited afterwards)</button>
      </form>
    </main>
  );
}
