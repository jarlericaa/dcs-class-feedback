import Link from "next/link";

import { formatDateTime, initials } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { studentSectionTabs } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  EmptyState,
  Notice,
  Quote,
  Stamp,
} from "@/components/ui";
import { IconRoster } from "@/components/ui/icons";
import {
  Thread,
  ThreadAudience,
  ThreadMessage,
} from "@/components/ui/thread";
import { getStudentHistory } from "@/modules/publishing";
import { AuthzError } from "@/modules/authz";
import { getSectionWithCourse } from "@/modules/catalog";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * The student's own record: their answers, private replies to them, and
 * whether their question was published without their name.
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
          navGroups={await primaryNavFor(
            user,
            `/sections/${sectionId}/history`,
          )}
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
      navGroups={await primaryNavFor(user, `/sections/${sectionId}/history`)}
      tabs={studentSectionTabs(
        sectionId,
        course.id,
        `/sections/${sectionId}/history`,
      )}
      tabsLabel={course.code}
      contextLabel={`${course.code} · ${section.title}`}
      title="My submissions"
      /* Privacy, and it was also wrong: it said a submitted form cannot be
         edited while /sections/[id] says "Submitted · still editable". The
         implemented rule is that a week stays editable until its deadline. */
      description="Only you and your teaching team can see this page. A week can be edited until its deadline, and is fixed after that."
      roomy
    >
      {history.length === 0 ? (
        /* CONTENT-VOICE §5: "No X", never "You have not X" — absence should
           not read as a failing. */
        <EmptyState
          title="No submissions yet"
          action={{
            href: `/sections/${sectionId}`,
            label: "Fill in the form",
          }}
          primary
        >
          Your submitted forms and any replies appear here.
        </EmptyState>
      ) : (
        <div className="stack-4">
          {answeredCount > 0 && (
            <p className="meta">
              {answeredCount} of {history.length} {history.length === 1 ? "week has" : "weeks have"} a reply or a
              published answer
            </p>
          )}

          <Notice flush>
            {history.map((entry) => (
              <article className="record" key={entry.responseId}>
                <div className="record__head">
                  <h2 className="panel-title">Week {entry.cycleIndex}</h2>
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

                {entry.items.map((item) => {
                  const hasReply =
                    item.privateResponses.length > 0 || !!item.publicAnswer;
                  return (
                    <div
                      className="stack-3 mt-6"
                      key={item.id}
                    >
                      <Quote label={`Your ${item.submissionType}`}>
                        {item.originalText}
                      </Quote>

                      {hasReply ? (
                        <Thread
                          audience={
                            item.publicAnswer ? (
                              <ThreadAudience scope="public">
                                A published answer goes to your whole class
                                without your name on it. Anything private below
                                is only between you and your teaching team.
                              </ThreadAudience>
                            ) : (
                              <ThreadAudience scope="private">
                                Only you and your teaching team can read this.
                              </ThreadAudience>
                            )
                          }
                        >
                          {item.privateResponses.map((reply, index) => {
                            /* The student's own follow-up shares this thread.
                               Without the role their own words came back
                               labelled as the teaching team's. */
                            const mine = reply.authorRole === "student";
                            return (
                              <ThreadMessage
                                key={index}
                                from={mine ? "student" : "staff"}
                                author={mine ? "You" : "Your teaching team"}
                                mark={
                                  mine ? (
                                    initials(user.displayName)
                                  ) : (
                                    <IconRoster size={14} />
                                  )
                                }
                                action={mine ? "followed up" : "replied"}
                                at={reply.createdAt}
                                timezone={section.timezone}
                              >
                                <p className="thread__body">{reply.body}</p>
                              </ThreadMessage>
                            );
                          })}

                          {item.publicAnswer && (
                            <ThreadMessage
                              from="public"
                              author="Your teaching team"
                              mark={<IconRoster size={14} />}
                              action="answered the class"
                              at={item.publicAnswer.publishedAt}
                              timezone={section.timezone}
                            >
                              <p className="thread__body">
                                <strong>
                                  {item.publicAnswer.rewordedQuestion}
                                </strong>
                              </p>
                              {item.publicAnswer.answer && (
                                <p className="thread__body">
                                  {item.publicAnswer.answer}
                                </p>
                              )}
                            </ThreadMessage>
                          )}
                        </Thread>
                      ) : (
                        <p className="meta">
                          <Stamp tone="neutral">No reply yet</Stamp>{" "}
                          <span className="ml-2">
                            Your teaching team has not written back about this
                            one.
                          </span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </article>
            ))}
          </Notice>

          <p className="meta">
            Looking for an answer that went out to everyone?{" "}
            <Link className="link" href={`/courses/${course.id}/qa`}>
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
