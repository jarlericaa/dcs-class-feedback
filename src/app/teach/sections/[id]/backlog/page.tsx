import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { loadStaffSection } from "@/lib/staff-section";
import { formatDate } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionNav } from "@/components/layout/nav";
import {
  AccessDenied,
  Alert,
  Badge,
  Breadcrumbs,
  EmptyState,
} from "@/components/ui";
import {
  draftFromBacklog,
  importLegacyEntries,
  listBacklogForCourse,
  setBacklogState,
} from "@/modules/backlog";
import { AuthzError } from "@/modules/authz";
import { toShellUser } from "@/lib/session";

/**
 * Course question backlog, triaged from a section.
 *
 * The backlog belongs to the COURSE; nothing in it ever reaches a section
 * automatically. Publishing to this class is an explicit act that creates a
 * draft in this section's publication queue.
 *
 * Legacy imports are anonymous by default: this bulk path never preserves a
 * student identity or creates a source link to one.
 */

const STATE_TONE: Record<string, "green" | "amber" | "neutral" | "red"> = {
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
  }>;
}) {
  const { id: sectionId } = await params;
  const sp = await searchParams;
  const ctx = await loadStaffSection(sectionId, "manageBacklogImports");
  if (!ctx.ok) {
    return (
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={[]}
        title="Question backlog"
      >
        <AccessDenied what="this course's question backlog" />
      </AppShell>
    );
  }
  const { user, access, section, course, can } = ctx;

  let backlog;
  try {
    backlog = await listBacklogForCourse(user.id, course.id, {
      state: sp.state,
      search: sp.q,
    });
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={[]}
          title="Question backlog"
        >
          <AccessDenied what="this course's question backlog" />
        </AppShell>
      );
    }
    throw err;
  }

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
      redirect(backTo(sectionId, describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/backlog`);
    redirect(backTo(sectionId, "Backlog question updated."));
  }

  async function draftHere(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await draftFromBacklog(
        uid,
        String(formData.get("questionId")),
        sectionId,
        {},
      );
    } catch (err) {
      redirect(backTo(sectionId, describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/backlog`);
    redirect(
      backTo(
        sectionId,
        "Draft created for this section. Finish it in the publication queue.",
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
        backTo(sectionId, "Add at least one question to import.", "error"),
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
      redirect(backTo(sectionId, describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/backlog`);
    redirect(backTo(sectionId, summary));
  }

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={staffSectionNav(
        access,
        `/teach/sections/${sectionId}/backlog`,
      )}
      contextLabel={section.title}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/", label: "Overview" },
            { label: `${course.code} · ${section.term}` },
            { label: "Question backlog" },
          ]}
        />
      }
      eyebrow="Staff only"
      title={`${course.code} question backlog`}
      description="Questions worth answering later, plus anything imported from previous semesters. Nothing reaches a class until you publish it there."
    >
      <div className="stack-gap">
        {sp.ok && <Alert variant="success">{sp.ok}</Alert>}
        {sp.error && <Alert variant="error">{sp.error}</Alert>}

        <form className="filter-bar" method="get" role="search">
          <label className="visually-hidden" htmlFor="backlog-q">
            Search the backlog
          </label>
          <input
            id="backlog-q"
            className="field"
            name="q"
            type="search"
            placeholder="Search questions"
            defaultValue={sp.q ?? ""}
          />
          <label className="visually-hidden" htmlFor="backlog-state">
            Filter by state
          </label>
          <select
            id="backlog-state"
            className="select-field"
            name="state"
            defaultValue={sp.state ?? ""}
            style={{ flex: "0 1 220px" }}
          >
            <option value="">All states ({backlog.total})</option>
            {Object.entries(backlog.counts).map(([state, count]) => (
              <option key={state} value={state}>
                {state.replace(/_/g, " ")} ({count})
              </option>
            ))}
          </select>
          <button className="button button--secondary" type="submit">
            Filter
          </button>
        </form>

        {backlog.questions.length === 0 ? (
          <EmptyState title="Nothing in the backlog">
            Move a student question here from the review inbox, or import
            questions from a previous semester below.
          </EmptyState>
        ) : (
          <section className="card">
            <ul className="data-list">
              {backlog.questions.map(({ question, visibleSectionIds }) => (
                <li key={question.id}>
                  <span className="data-list__main">
                    <strong>{question.text}</strong>
                    <small>
                      {question.provenance.replace(/_/g, " ")} ·{" "}
                      {formatDate(question.createdAt)}
                      {question.previouslyAnswered &&
                        " · has a previous answer"}
                      {visibleSectionIds.includes(sectionId) &&
                        " · already shared with this section"}
                    </small>
                  </span>
                  <span className="row-gap">
                    <Badge tone={STATE_TONE[question.state] ?? "neutral"}>
                      {question.state.replace(/_/g, " ")}
                    </Badge>
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
                        <button
                          className="button button--quiet button--small"
                          type="submit"
                        >
                          Start triage
                        </button>
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
                          <button
                            className="button button--secondary button--small"
                            type="submit"
                          >
                            Answerable
                          </button>
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
                          <button
                            className="button button--quiet button--small"
                            type="submit"
                          >
                            Not suitable
                          </button>
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
                          <button
                            className="button button--primary button--small"
                            type="submit"
                          >
                            Draft for this section
                          </button>
                        </form>
                      )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card card--padded">
          <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>
            Import questions from a previous semester
          </h2>
          <p className="muted small" style={{ margin: "0 0 14px" }}>
            One question per line. Everything imported this way is anonymous: no
            student identity is attached, and imported questions never count
            towards anyone&apos;s participation.
          </p>
          <form action={importLegacy} className="stack-gap">
            <div className="field-row">
              <label htmlFor="entries">Questions</label>
              <textarea
                id="entries"
                className="textarea-field"
                name="entries"
                rows={6}
                placeholder={
                  "Why do we normalise database tables?\nWill the finals be cumulative?"
                }
                required
              />
            </div>
            <div className="field-row" style={{ maxWidth: 420 }}>
              <label htmlFor="legacy-source">Where did these come from?</label>
              <input
                id="legacy-source"
                className="field"
                name="source"
                placeholder="AY2025-2 Q&A document"
              />
            </div>
            <div>
              <button className="button button--secondary" type="submit">
                Import anonymously
              </button>
            </div>
          </form>
        </section>

        <p className="muted small">
          Ready drafts appear in the{" "}
          <Link href={`/teach/sections/${sectionId}/publications`}>
            publication queue
          </Link>
          .
        </p>
      </div>
    </AppShell>
  );
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
  sectionId: string,
  message: string,
  kind: "ok" | "error" = "ok",
): string {
  return `/teach/sections/${sectionId}/backlog?${kind}=${encodeURIComponent(message)}`;
}
