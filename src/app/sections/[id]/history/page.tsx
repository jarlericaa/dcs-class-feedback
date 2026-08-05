import Link from "next/link";

import { formatDateTime } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { studentSectionNav } from "@/components/layout/nav";
import {
  AccessDenied,
  Breadcrumbs,
  EmptyState,
  Notice,
  Quote,
  Stamp,
} from "@/components/ui";
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
      contextLabel={`${course.code} · ${section.title}`}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/", label: "Overview" },
            { href: `/sections/${sectionId}`, label: `${course.code} ${section.term}` },
            { label: "My submissions" },
          ]}
        />
      }
      title="My submissions"
      description="Only you and your teaching team can see this page. Submitted forms cannot be edited or withdrawn."
      roomy
    >
      {history.length === 0 ? (
        <EmptyState
          title="You have not submitted anything yet"
          action={{
            href: `/sections/${sectionId}`,
            label: "Go to this week's form",
          }}
        >
          Once you send a weekly form it stays here, together with any reply
          your teaching team writes back to you.
        </EmptyState>
      ) : (
        <div className="stack-4">
          <p className="meta">
            {history.length} submission{history.length === 1 ? "" : "s"}
            {answeredCount > 0 &&
              ` · ${answeredCount} with a reply or published answer`}
          </p>

          <Notice flush>
            {history.map((entry) => (
              <article className="record" key={entry.responseId}>
                <div className="record__head">
                  <h2>Week {entry.cycleIndex}</h2>
                  <span className="meta">
                    Submitted{" "}
                    {formatDateTime(entry.submittedAt, section.timezone)}
                  </span>
                </div>

                {entry.answers.length > 0 && (
                  <dl className="answers">
                    {entry.answers.map((answer, index) => (
                      <div key={index}>
                        <dt>{answer.prompt}</dt>
                        <dd>{renderAnswer(answer)}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {entry.items.map((item) => (
                  <div className="stack-3" key={item.id} style={{ marginTop: "var(--s5)" }}>
                    <Quote label={`Your ${item.submissionType}`}>
                      {item.originalText}
                    </Quote>

                    {item.privateResponses.map((reply, index) => (
                      <Quote
                        key={index}
                        tone="private"
                        label={
                          <>
                            Private reply from your teaching team ·{" "}
                            {formatDateTime(reply.createdAt, section.timezone)}
                          </>
                        }
                      >
                        {reply.body}
                      </Quote>
                    ))}

                    {item.publicAnswer ? (
                      <Quote
                        tone="public"
                        label={
                          <>
                            Published to your class anonymously ·{" "}
                            {formatDateTime(
                              item.publicAnswer.publishedAt,
                              section.timezone,
                            )}
                          </>
                        }
                      >
                        <strong>
                          {item.publicAnswer.rewordedQuestion}
                        </strong>
                        {item.publicAnswer.answer && (
                          <>
                            {"\n\n"}
                            {item.publicAnswer.answer}
                          </>
                        )}
                      </Quote>
                    ) : (
                      item.privateResponses.length === 0 && (
                        <p className="meta">
                          <Stamp tone="neutral">No reply yet</Stamp>{" "}
                          <span style={{ marginLeft: 8 }}>
                            Your teaching team has not written back about this
                            one.
                          </span>
                        </p>
                      )
                    )}
                  </div>
                ))}
              </article>
            ))}
          </Notice>

          <p className="meta">
            Looking for an answer that went out to everyone?{" "}
            <Link className="link" href={`/sections/${sectionId}/qa`}>
              Browse the class Q&amp;A
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
