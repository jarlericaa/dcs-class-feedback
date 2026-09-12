import { SubmitButton } from "@/components/ui/submit-button";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { formatDate } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import {
  type Tone,
  AccessDenied,
  Alert,
  Stamp,
  EmptyState,
  MetaList,
} from "@/components/ui";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import {
  draftFromBacklog,
  importLegacyEntries,
  listBacklogForCourse,
  setBacklogState,
} from "@/modules/backlog";
import { AuthzError, getCourseCapabilities } from "@/modules/authz";
import { requireUser, toShellUser } from "@/lib/session";
import { buttonClass } from "@/components/ui/button";
import { Field, FieldRow, Textarea } from "@/components/ui/form";

/**
 * The course's question backlog (ADR-0005).
 *
 * One backlog per course, reached from the course. Drafting an answer from a
 * question creates ONE entry in the course's publication queue — there is no
 * section to choose and no per-section copy, because a published answer belongs
 * to the course.
 *
 * Legacy imports are anonymous by default: this bulk path never preserves a
 * student identity or creates a source link to one.
 */

const STATE_TONE: Record<string, Tone> = {
  imported: "neutral",
  needs_review: "amber",
  answerable: "green",
  drafting: "amber",
  scheduled: "amber",
  published: "green",
  archived: "neutral",
  not_suitable: "red",
};

export default async function BacklogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    state?: string;
    q?: string;
    ok?: string;
    error?: string;
    import?: string;
  }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const path = `/teach/courses/${courseId}/backlog`;
  const sp = await searchParams;

  let backlog;
  try {
    backlog = await listBacklogForCourse(user.id, courseId, {
      state: sp.state,
      search: sp.q,
    });
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={await primaryNavFor(user, path)}
          title="Question backlog"
        >
          <AccessDenied what="this course's question backlog" />
        </AppShell>
      );
    }
    throw err;
  }

  const course = (await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  }))!;
  // Presentation only — `draftFromBacklog` re-checks server-side.
  const capabilities = await getCourseCapabilities(db, user.id, courseId);
  const can = (permission: "draftPublicAnswers") =>
    capabilities?.permissions[permission] ?? false;

  async function advance(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await setBacklogState(
        uid,
        String(formData.get("questionId")),
        String(formData.get("state")) as "answerable",
      );
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/backlog`);
    redirect(backTo(courseId, "Backlog question updated."));
  }

  async function draftHere(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await draftFromBacklog(uid, String(formData.get("questionId")));
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/backlog`);
    redirect(
      backTo(
        courseId,
        "Draft created. Finish it in the publication queue.",
      ),
    );
  }

  async function importLegacy(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const lines = String(formData.get("entries") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      redirect(
        backTo(courseId, "Add at least one question to import.", "error"),
      );
    }
    // redirect() signals by throwing, so it must sit OUTSIDE the try: inside,
    // the success redirect is caught by the catch below and reported as a
    // failure even though the import committed.
    let summary: string;
    try {
      const result = await importLegacyEntries(
        uid,
        course.id,
        lines.map((text) => ({ text })),
        String(formData.get("source") || "pasted legacy questions"),
      );
      summary = `${result.created.length} question(s) imported anonymously${
        result.errors.length > 0 ? `, ${result.errors.length} skipped` : ""
      }.`;
    } catch (err) {
      redirect(backTo(courseId, describe(err), "error"));
    }
    revalidatePath(`/teach/courses/${courseId}/backlog`);
    redirect(backTo(courseId, summary));
  }

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, path)}
      tabGroups={await courseTabGroupsFor(user.id, courseId, path)}
      tabsLabel={course.code}
      tabsMode="menu"
      contextLabel={course.code}
      crumbs={[
        { href: "/teach/courses", label: "My courses" },
        { href: `/teach/courses/${course.id}`, label: course.code },
      ]}
      title="Question backlog"
      actions={
        <Link
          className={buttonClass({ variant: "secondary" })}
          href={`/teach/courses/${courseId}/backlog?import=1`}
        >
          Import questions
        </Link>
      }
    >
      <div className="stack-4">
        {sp.ok && <Alert variant="success">{sp.ok}</Alert>}
        {sp.error && <Alert variant="error">{sp.error}</Alert>}

        <form className="toolbar" method="get" role="search">
          <label className="visually-hidden" htmlFor="backlog-q">
            Search the backlog
          </label>
          <Field
            // was `.toolbar .field` (§3.2)
            className="flex-[1_1_220px] min-w-0"
            id="backlog-q"
            name="q"
            type="search"
            placeholder="Search questions"
            defaultValue={sp.q ?? ""}
          />
          {/* Choosing applies. The separate generic "Filter" button is gone:
              it made one decision take two clicks, and the first did nothing. */}
          <AutoSubmitSelect
            id="backlog-state"
            name="state"
            label="Show which state"
            defaultValue={sp.state ?? ""}
          >
            <option value="">All states ({backlog.total})</option>
            {Object.entries(backlog.counts).map(([state, count]) => (
              <option key={state} value={state}>
                {sentenceCase(state)} ({count})
              </option>
            ))}
          </AutoSubmitSelect>
        </form>

        {backlog.questions.length === 0 ? (
          <EmptyState
            title="No questions in the backlog"
            action={{
              href: `/teach/courses/${courseId}/backlog?import=1`,
              label: "Import questions",
            }}
          />
        ) : (
          <section className="notice">
            <ul className="data-list">
              {backlog.questions.map(({ question }) => (
                <li key={question.id}>
                  <span className="data-list__main">
                    <strong>{question.text}</strong>
                    <MetaList
                      items={[
                        sentenceCase(question.provenance),
                        formatDate(question.createdAt),
                        question.previouslyAnswered && "Has a previous answer",
                      ]}
                    />
                  </span>
                  <span className="row">
                    <Stamp tone={STATE_TONE[question.state] ?? "neutral"}>
                      {sentenceCase(question.state)}
                    </Stamp>
                    {question.state === "imported" && (
                      <form action={advance} className="inline-form">
                        <input
                          type="hidden"
                          name="questionId"
                          value={question.id}
                        />
                        <input
                          type="hidden"
                          name="state"
                          value="needs_review"
                        />
                        <SubmitButton
                          variant="quiet"
                          size="small"
                          pendingLabel="Starting…"
                        >
                          Start triage
                        </SubmitButton>
                      </form>
                    )}
                    {question.state === "needs_review" && (
                      <>
                        <form action={advance} className="inline-form">
                          <input
                            type="hidden"
                            name="questionId"
                            value={question.id}
                          />
                          <input
                            type="hidden"
                            name="state"
                            value="answerable"
                          />
                          <SubmitButton
                            variant="secondary"
                            size="small"
                            pendingLabel="Marking…"
                          >
                            Answerable
                          </SubmitButton>
                        </form>
                        <form action={advance} className="inline-form">
                          <input
                            type="hidden"
                            name="questionId"
                            value={question.id}
                          />
                          <input
                            type="hidden"
                            name="state"
                            value="not_suitable"
                          />
                          <SubmitButton
                            variant="quiet"
                            size="small"
                            pendingLabel="Marking…"
                          >
                            Not suitable
                          </SubmitButton>
                        </form>
                      </>
                    )}
                    {question.state === "answerable" &&
                      can("draftPublicAnswers") && (
                        <form action={draftHere} className="inline-form">
                          <input
                            type="hidden"
                            name="questionId"
                            value={question.id}
                          />
                          <SubmitButton
                            variant="primary"
                            size="small"
                            pendingLabel="Drafting…"
                          >
                            Draft an answer
                          </SubmitButton>
                        </form>
                      )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Opened by the header action, which is this form's only entry point.
            Expanded by default it used to be the only visible submit button on
            a page whose real work is triaging the rows above it. */}
        {(sp.import === "1" || !!sp.error) && (
          <section className="notice notice--pad" id="import">
            <h2 className="panel-title">
              Import questions from a previous semester
            </h2>
            <form action={importLegacy} className="stack-4">
              <FieldRow label="Questions" htmlFor="entries">
                <Textarea
                  id="entries"
                  name="entries"
                  rows={6}
                  placeholder={
                    "Why do we normalise database tables?\nWill the finals be cumulative?"
                  }
                  required
                />
              </FieldRow>
              <FieldRow
                label="Where did these come from?"
                htmlFor="legacy-source"
                className="max-w-105"
              >
                <Field
                  id="legacy-source"
                  name="source"
                  placeholder="AY2025-2 Q&A document"
                />
              </FieldRow>
              <div className="row">
                <SubmitButton variant="primary" pendingLabel="Importing…">
                  Import anonymously
                </SubmitButton>
                <Link
                  className={buttonClass({ variant: "quiet" })}
                  href={`/teach/courses/${courseId}/backlog`}
                >
                  Cancel
                </Link>
              </div>
            </form>
          </section>
        )}
      </div>
    </AppShell>
  );
}

/** An internal state value, said the way a person would say it. */
function sentenceCase(value: string): string {
  const words = value.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function describe(err: unknown): string {
  if (err instanceof AuthzError) return err.message;
  if (err instanceof Error) return err.message;
  throw err;
}

/**
 * Module scope on purpose: a server action serializes everything it closes
 * over, so it may not capture a helper defined inside the page component.
 */
function backTo(
  courseId: string,
  message: string,
  kind: "ok" | "error" = "ok",
): string {
  return `/teach/courses/${courseId}/backlog?${kind}=${encodeURIComponent(message)}`;
}
