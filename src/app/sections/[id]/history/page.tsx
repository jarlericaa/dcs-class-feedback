import { redirect } from "next/navigation";
import { currentUserId } from "@/auth";
import { getStudentHistory } from "@/modules/publishing";
import { AuthzError } from "@/modules/authz";

/** Student's own submission history: answers, private replies, public status. */
export default async function HistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/signin");
  const { id: sectionId } = await params;

  let history;
  try {
    history = await getStudentHistory(userId, sectionId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return <main><p>You do not have access to this section.</p></main>;
    }
    throw err;
  }

  return (
    <main>
      <h1>My submissions</h1>
      {history.length === 0 && <p>No submissions yet.</p>}
      {history.map((entry) => (
        <article
          key={entry.responseId}
          style={{ border: "1px solid #ccc", padding: "1rem", margin: "1rem 0" }}
        >
          <h2>Week {entry.cycleIndex}</h2>
          <p>
            Submitted {entry.submittedAt.toLocaleString()} — status:{" "}
            <strong>Submitted</strong>
          </p>
          <ul>
            {entry.answers.map((a, i) => (
              <li key={i}>
                <strong>{a.prompt}:</strong>{" "}
                {a.freeText ??
                  (a.value as { optionLabels?: string[] })?.optionLabels?.join(
                    ", ",
                  ) ??
                  JSON.stringify(a.value)}
              </li>
            ))}
          </ul>
          {entry.items.map((item) => (
            <div key={item.id} style={{ marginTop: "0.5rem" }}>
              <p>
                <strong>Your {item.submissionType}:</strong> {item.originalText}
                <br />
                Status:{" "}
                <strong>
                  {item.status === "answered" ? "Answered" : "Submitted"}
                </strong>
              </p>
              {item.privateResponses.map((p, i) => (
                <blockquote key={i}>
                  <strong>Private reply from your teacher:</strong> {p.body}
                </blockquote>
              ))}
              {item.publicAnswer && (
                <blockquote>
                  <strong>Published to the class (anonymous) as:</strong>{" "}
                  {item.publicAnswer.rewordedQuestion}
                  <br />
                  <strong>Answer:</strong> {item.publicAnswer.answer}
                </blockquote>
              )}
            </div>
          ))}
        </article>
      ))}
    </main>
  );
}
