import Link from "next/link";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { classSections, courses } from "@/db/schema";
import { AppShell } from "@/components/layout/app-shell";
import { primaryNavFor } from "@/lib/nav-context";
import { requireUser, toShellUser } from "@/lib/session";
import { courseTermParts } from "@/lib/term";
import { formatDateTime, initials } from "@/lib/datetime";
import { renderRichText } from "@/modules/richtext/render";
import { SubmissionAnswerBlock } from "@/components/submission-answer";
import { buttonClass } from "@/components/ui/button";
import {
  AccessDenied,
  MetaList,
  Quote,
  Stamp,
} from "@/components/ui";
import { IconRoster } from "@/components/ui/icons";
import {
  Thread,
  ThreadAudience,
  ThreadMessage,
} from "@/components/ui/thread";
import { getStudentCourseHistory } from "@/modules/publishing";
import { activeStudentSectionsForCourse, AuthzError } from "@/modules/authz";

/** Read-only student view of one submitted occurrence. */
export default async function StudentSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string; instanceId: string }>;
}) {
  const user = await requireUser();
  const { id: courseId, instanceId } = await params;
  const path = `/courses/${courseId}/submissions/${instanceId}`;

  let history;
  try {
    history = await getStudentCourseHistory(user.id, courseId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="student"
          navGroups={await primaryNavFor(user, path)}
          title="Submission"
        >
          <AccessDenied what="this submission" />
        </AppShell>
      );
    }
    throw err;
  }
  const entry = history.find((item) => item.instanceId === instanceId);
  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!course || !entry) {
    return (
      <AppShell
        user={toShellUser(user)}
        workspace="student"
        navGroups={await primaryNavFor(user, path)}
        title="Submission"
      >
        <AccessDenied what="this submission" />
      </AppShell>
    );
  }

  const sectionIds = await activeStudentSectionsForCourse(db, user.id, courseId);
  const sections = sectionIds.length
    ? await db.query.classSections.findMany({
        where: inArray(classSections.id, sectionIds),
        columns: { term: true },
      })
    : [];
  const termFacts = courseTermParts(
    course.term,
    sections.map((section) => section.term),
  );
  const rendered = new Map(
    await Promise.all(
      entry.answers.map(async (answer) => [
        answer.questionId,
        {
          prompt: await renderRichText(answer.prompt),
          description: await renderRichText(answer.description),
        },
      ] as const),
    ),
  );

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="student"
      navGroups={await primaryNavFor(user, path)}
      contextLabel={course.code}
      title={entry.formLabel ?? "Class feedback"}
      status={<Stamp tone="green">Submitted</Stamp>}
      description={
        <MetaList
          items={[
            entry.sequenceLabel,
            ...termFacts,
            entry.submittedAt
              ? `Submitted ${formatDateTime(entry.submittedAt, entry.timezone)}`
              : null,
          ]}
        />
      }
      crumbs={[
        { href: "/courses", label: "My courses" },
        { href: `/courses/${courseId}`, label: course.code },
        { href: `/courses/${courseId}/submissions`, label: "My submissions" },
      ]}
      nested
      roomy
    >
      <div className="stack-4">
        <Link
          className={buttonClass({ variant: "secondary", size: "small" })}
          href={`/courses/${courseId}/submissions`}
        >
          Back to my submissions
        </Link>

        <section className="relative rounded-panel border border-rule bg-paper before:absolute before:inset-y-0 before:left-0 before:w-px before:rounded-l-panel before:bg-accent before:content-['']">
          <div className="border-b border-rule px-4 py-3">
            <h2 className="font-document text-panel-title font-bold text-ink">
              Form answers
            </h2>
          </div>
          <div className="p-4">
            {entry.answers.length === 0 ? (
              <p className="max-w-measure-empty font-sans text-ui-sm text-ink-muted">
                This form asked no questions of its own.
              </p>
            ) : (
              <ul className="m-0 grid list-none p-0">
                {entry.answers.map((answer, index) => (
                  <SubmissionAnswerBlock
                    index={index}
                    key={answer.questionId}
                    question={answer}
                    rendered={rendered}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {entry.items.length > 0 && (
          <section className="relative rounded-panel border border-rule bg-paper before:absolute before:inset-y-0 before:left-0 before:w-px before:rounded-l-panel before:bg-accent before:content-['']">
            <div className="border-b border-rule px-4 py-3">
              <h2 className="font-document text-panel-title font-bold text-ink">
                Your questions and feedback
              </h2>
            </div>
            <div className="grid gap-6 p-4">
              {entry.items.map((item) => {
                const hasReply =
                  item.privateResponses.length > 0 || !!item.publicAnswer;
                return (
                  <div className="grid gap-4" key={item.id}>
                    <Quote label={`Your ${item.submissionType}`}>
                      {item.originalText}
                    </Quote>
                    {hasReply ? (
                      <Thread
                        audience={
                          item.publicAnswer ? (
                            <ThreadAudience scope="public">
                              A published answer is visible to your class
                              without your name.
                            </ThreadAudience>
                          ) : (
                            <ThreadAudience scope="private">
                              Only you and your teaching team can read this.
                            </ThreadAudience>
                          )
                        }
                      >
                        {item.privateResponses.map((reply, index) => {
                          const mine = reply.authorRole === "student";
                          return (
                            <ThreadMessage
                              key={index}
                              from={mine ? "student" : "staff"}
                              author={mine ? "You" : "Your teaching team"}
                              mark={
                                mine ? initials(user.displayName) : <IconRoster size={14} />
                              }
                              action={mine ? "followed up" : "replied"}
                              at={reply.createdAt}
                              timezone={entry.timezone}
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
                            timezone={entry.timezone}
                          >
                            <p className="thread__body">
                              <strong>{item.publicAnswer.rewordedQuestion}</strong>
                            </p>
                            {item.publicAnswer.answer && (
                              <p className="thread__body">{item.publicAnswer.answer}</p>
                            )}
                          </ThreadMessage>
                        )}
                      </Thread>
                    ) : (
                      <p className="meta">
                        <Stamp tone="neutral">No reply yet</Stamp>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
