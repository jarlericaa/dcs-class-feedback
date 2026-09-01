import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { loadStaffSection, sectionLabel } from "@/lib/staff-section";
import { formatDate } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionTabs } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  Alert,
  Stamp,
  Breadcrumbs,
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
    import?: string;
  }>;
}) {
  const { id: sectionId } = await params;
  const path = `/teach/sections/${sectionId}/backlog`;
  const sp = await searchParams;
  const ctx = await loadStaffSection(sectionId, "manageBacklogImports");
  if (!ctx.ok) {
    return (
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={await primaryNavFor(ctx.user, path)}
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
          navGroups={await primaryNavFor(ctx.user, path)}
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
      navGroups={await primaryNavFor(user, path, {
        /* A section is reached through its course, and the course now has its
           own rail row — so mark that one rather than the courses index. */
        fallbackHref: `/teach/courses/${course.id}`,
      })}
      tabs={staffSectionTabs(access, path)}
      tabsLabel={sectionLabel(course.code, section.title)}
      tabsMode="menu"
      contextLabel={sectionLabel(course.code, section.title)}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/", label: "Overview" },
            { label: course.code },
            { label: "Question backlog" },
          ]}
        />
      }
      title="Question backlog"
      actions={
        <Link
          className="button button--secondary"
          href={`/teach/sections/${sectionId}/backlog?import=1`}
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
          <input
            id="backlog-q"
            className="field"
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
              href: `/teach/sections/${sectionId}/backlog?import=1`,
              label: "Import questions",
            }}
          />
        ) : (
          <section className="notice">
            <ul className="data-list">
              {backlog.questions.map(({ question, visibleSectionIds }) => (
                <li key={question.id}>
                  <span className="data-list__main">
                    <strong>{question.text}</strong>
                    <MetaList
                      items={[
                        sentenceCase(question.provenance),
                        formatDate(question.createdAt),
                        question.previouslyAnswered && "Has a previous answer",
                        visibleSectionIds.includes(sectionId) &&
                          "Already shared with this section",
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

        {/* Opened by the header action, which is this form's only entry point.
            Expanded by default it used to be the only visible submit button on
            a page whose real work is triaging the rows above it. */}
        {(sp.import === "1" || !!sp.error) && (
          <section className="notice notice--pad" id="import">
            <h2 className="panel-title">
              Import questions from a previous semester
            </h2>
          <form action={importLegacy} className="stack-4">
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
            <div className="row">
              <button className="button button--primary" type="submit">
                Import anonymously
              </button>
              <Link
                className="button button--quiet"
                href={`/teach/sections/${sectionId}/backlog`}
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
  sectionId: string,
  message: string,
  kind: "ok" | "error" = "ok",
): string {
  return `/teach/sections/${sectionId}/backlog?${kind}=${encodeURIComponent(message)}`;
}
