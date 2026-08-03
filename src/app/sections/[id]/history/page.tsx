import Link from "next/link";

import { formatDateTime } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { studentSectionNav } from "@/components/layout/nav";
import { AccessDenied, Badge, EmptyState } from "@/components/ui";
import { getStudentHistory } from "@/modules/publishing";
import { AuthzError } from "@/modules/authz";
import { getSectionWithCourse } from "@/modules/catalog";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * The student's own record: their answers, private replies to them, and
 * whether their question was published anonymously.
 *
 * The projection comes from getStudentHistory, which deliberately excludes
 * validity, review state, dispositions, staff notes and drafts. Nothing here
 * may add a staff-only field back in.
 */
export default async function HistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: sectionId } = await params;

  let history;
  try {
    history = await getStudentHistory(user.id, sectionId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="student"
          navGroups={[]}
          title="My submissions"
        >
          <AccessDenied what="this class section" />
        </AppShell>
      );
    }
    throw err;
  }

  const { section, course } = await getSectionWithCourse(sectionId);
  const answeredCount = history.filter((entry) =>
    entry.items.some((item) => item.status === "answered"),
  ).length;

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="student"
      navGroups={studentSectionNav(sectionId, `/sections/${sectionId}/history`)}
      contextLabel={section.title}
      eyebrow={`${course.code} · ${section.term}`}
      title="My submissions"
    >
      {history.length === 0 ? (
        <EmptyState
          title="You have not submitted anything yet"
          action={{
            href: `/sections/${sectionId}`,
            label: "Go to this week's form",
          }}
        />
      ) : (
        <div className="stack-gap">
          <p className="muted small" style={{ margin: 0 }}>
            {history.length} submission{history.length === 1 ? "" : "s"}
            {answeredCount > 0 && ` · ${answeredCount} answered`}
          </p>
          <section className="card">
            {history.map((entry) => (
              <article className="history-item" key={entry.responseId}>
                <div
                  className="row-gap"
                  style={{ justifyContent: "space-between" }}
                >
                  <div>
                    <h2>Week {entry.cycleIndex}</h2>
                    <p className="history-item__meta">
                      Submitted{" "}
                      {formatDateTime(entry.submittedAt, section.timezone)}
                    </p>
                  </div>
                  <Badge tone="green">Submitted</Badge>
                </div>

                {entry.answers.length > 0 && (
                  <dl style={{ margin: "14px 0 0" }}>
                    {entry.answers.map((answer, index) => (
                      <div key={index} style={{ marginBottom: 10 }}>
                        <dt className="muted small" style={{ fontWeight: 700 }}>
                          {answer.prompt}
                        </dt>
                        <dd style={{ margin: "2px 0 0" }}>
                          {renderAnswer(answer)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {entry.items.map((item) => (
                  <div key={item.id} style={{ marginTop: 16 }}>
                    <div className="source-box source-box--original">
                      <p className="source-box__label">
                        Your {item.submissionType}
                      </p>
                      <p>{item.originalText}</p>
                    </div>
                    <div className="row-gap" style={{ marginTop: 10 }}>
                      {item.status === "answered" ? (
                        <Badge tone="green">Answered</Badge>
                      ) : (
                        <Badge tone="neutral">Submitted</Badge>
                      )}
                    </div>

                    {item.privateResponses.map((reply, index) => (
                      <div className="reply-box" key={index}>
                        <strong>Private reply from your teaching team</strong>
                        <p>{reply.body}</p>
                        <p className="muted small" style={{ marginTop: 6 }}>
                          {formatDateTime(reply.createdAt, section.timezone)}
                        </p>
                      </div>
                    ))}

                    {item.publicAnswer && (
                      <div className="reply-box">
                        <strong>Published to your class, anonymously</strong>
                        <p style={{ fontWeight: 650 }}>
                          {item.publicAnswer.rewordedQuestion}
                        </p>
                        {item.publicAnswer.answer && (
                          <p style={{ marginTop: 8 }}>
                            {item.publicAnswer.answer}
                          </p>
                        )}
                        <p className="muted small" style={{ marginTop: 6 }}>
                          Published{" "}
                          {formatDateTime(
                            item.publicAnswer.publishedAt,
                            section.timezone,
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </article>
            ))}
          </section>
          <p className="muted small" style={{ margin: 0 }}>
            Submitted responses cannot be edited or withdrawn.{" "}
            <Link href={`/sections/${sectionId}/qa`}>
              Browse the class Q&amp;A archive
            </Link>
            .
          </p>
        </div>
      )}
    </AppShell>
  );
}

function renderAnswer(answer: {
  value: unknown;
  freeText: string | null;
}): string {
  if (answer.freeText) return answer.freeText;
  const value = (answer.value ?? {}) as {
    optionLabels?: string[];
    scaleValue?: number;
    boolValue?: boolean;
    dateValue?: string;
    timeValue?: string;
  };
  if (value.optionLabels?.length) return value.optionLabels.join(", ");
  if (value.scaleValue !== undefined) return String(value.scaleValue);
  if (value.boolValue !== undefined) return value.boolValue ? "Yes" : "No";
  return value.dateValue ?? value.timeValue ?? "—";
}
