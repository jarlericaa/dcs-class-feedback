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
  ResponseTypeTag,
  Stamp,
} from "@/components/ui";
import { CategoryFlair } from "@/components/ui/category-flair";
import { IconBack, IconForward, IconRoster } from "@/components/ui/icons";
import { Thread, ThreadMessage } from "@/components/ui/thread";
import { getStudentCourseHistory } from "@/modules/publishing";
import { activeStudentSectionsForCourse, AuthzError } from "@/modules/authz";

type StudentHistoryEntry = Awaited<
  ReturnType<typeof getStudentCourseHistory>
>[number];
type StudentHistoryItem = StudentHistoryEntry["items"][number];

function normalizedQuestion(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function publicQuestionDiffers(original: string, published: string) {
  return normalizedQuestion(original) !== normalizedQuestion(published);
}

/** The student-facing response channels for one original question. */
function StudentResponseBlocks({
  item,
  timezone,
  studentName,
}: {
  item: StudentHistoryItem;
  timezone: string;
  studentName: string;
}) {
  const publicAnswer = item.publicAnswer;
  const privateResponses = item.privateResponses;
  const hasResponse = privateResponses.length > 0 || publicAnswer !== null;
  if (!hasResponse) {
    return (
      <p className="font-sans text-ui-sm text-ink-muted">No response yet.</p>
    );
  }

  return (
    <div className="grid gap-5">
      {publicAnswer && (
        <section className="grid" aria-labelledby={`public-${item.id}`}>
          <h3
            className="m-0 justify-self-start"
            id={`public-${item.id}`}
          >
            <ResponseTypeTag type="public" />
          </h3>
          <Thread>
            <ThreadMessage
              at={publicAnswer.publishedAt}
              author="Your teaching team"
              from="public"
              mark={<IconRoster size={14} />}
              timezone={timezone}
            >
              <div className="grid gap-2 rounded-control border border-rule bg-paper-quiet px-4 py-3">
                {publicQuestionDiffers(
                  item.originalText,
                  publicAnswer.rewordedQuestion,
                ) && (
                  <p className="font-document text-doc-dense font-semibold text-ink">
                    {publicAnswer.rewordedQuestion}
                  </p>
                )}
                {publicAnswer.answer && (
                  <p className="font-document text-doc-dense text-ink">
                    {publicAnswer.answer}
                  </p>
                )}
              </div>
              <p className="mt-2">
                <Link
                  className={buttonClass({
                    variant: "secondary",
                    size: "small",
                  })}
                  href={`/courses/${publicAnswer.courseId}/qa?selected=${publicAnswer.id}`}
                >
                  See in Class Q&amp;A
                  <IconForward size={15} />
                </Link>
              </p>
            </ThreadMessage>
          </Thread>
        </section>
      )}

      {privateResponses.length > 0 && (
        <section
          aria-labelledby={`private-${item.id}`}
          className={
            publicAnswer ? "grid border-t border-rule pt-4" : "grid"
          }
        >
          <h3 className="m-0 justify-self-start" id={`private-${item.id}`}>
            <ResponseTypeTag
              label={
                privateResponses.length > 1
                  ? "Private thread"
                  : "Private reply"
              }
              type="private"
            />
          </h3>
          <Thread>
            {privateResponses.map((reply, index) => {
              const mine = reply.authorRole === "student";
              return (
                <ThreadMessage
                  at={reply.createdAt}
                  author={mine ? "You" : "Your teaching team"}
                  from={mine ? "student" : "staff"}
                  key={`${reply.createdAt.toISOString()}-${index}`}
                  mark={mine ? initials(studentName) : <IconRoster size={14} />}
                  timezone={timezone}
                >
                  <div className="rounded-control border border-rule bg-paper-quiet px-4 py-3">
                    <p className="font-document text-doc-dense text-ink">
                      {reply.body}
                    </p>
                  </div>
                </ThreadMessage>
              );
            })}
          </Thread>
        </section>
      )}
    </div>
  );
}

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
    >
      <div className="stack-4">
        <Link
          className={buttonClass({
            variant: "quiet",
            size: "small",
            className: "-ml-2.5 justify-self-start",
          })}
          href={`/courses/${courseId}/submissions`}
        >
          <IconBack size={15} />
          Back to my submissions
        </Link>

        <section className="rounded-panel border border-rule bg-paper">
          <div className="border-b border-rule px-4 py-3">
            <h2 className="font-document text-panel-title font-bold text-ink">
              Your form answers
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
                    presentation="stars"
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {entry.items.length > 0 && (
          <section className="rounded-panel border border-rule bg-paper">
            <div className="border-b border-rule px-4 py-3">
              <h2 className="font-document text-panel-title font-bold text-ink">
                Your question and feedback
              </h2>
            </div>
            <div className="grid gap-5 p-4">
              {entry.items.map((item) => (
                <div className="grid gap-3" key={item.id}>
                  <CategoryFlair value={item.category} />
                  <p className="max-w-measure rounded-control border border-rule bg-paper-quiet px-4 py-3 font-document text-doc-dense text-ink whitespace-pre-wrap">
                    {item.originalText}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {entry.items.length > 0 && (
          <section className="rounded-panel border border-rule bg-paper">
            <div className="border-b border-rule px-4 py-3">
              <h2 className="font-document text-panel-title font-bold text-ink">
                Teaching team responses
              </h2>
            </div>
            <div className="grid gap-5 p-4">
              {entry.items.map((item, index) => (
                <div
                  className={
                    index > 0 ? "border-t border-rule pt-5" : undefined
                  }
                  key={item.id}
                >
                  <StudentResponseBlocks
                    item={item}
                    studentName={user.displayName}
                    timezone={entry.timezone}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
