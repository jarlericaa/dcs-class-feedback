import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { studentSectionTabs } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import { AccessDenied, EmptyState } from "@/components/ui";
import { listOpenInstancesForStudent } from "@/modules/forms/submission";
import { AuthzError } from "@/modules/authz";
import { getSectionWithCourse } from "@/modules/catalog";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * A student's class-section entry point.
 *
 * The student's object is the FORM, not the section, so this resolves the form
 * that is open for them and forwards to it. It survives as a route because the
 * nav, the Q&A archive and old links all point here — and because when nothing is
 * open, "nothing is open for this class" is the honest answer and needs somewhere
 * to be said.
 *
 * When more than one form is open, the one closing soonest wins and the rest are
 * listed: that is the order that matters to someone deciding what to do next.
 */
export default async function SectionEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: sectionId } = await params;

  let open: Awaited<ReturnType<typeof listOpenInstancesForStudent>>;
  try {
    open = await listOpenInstancesForStudent(user.id, sectionId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="student"
          navGroups={await primaryNavFor(user, `/sections/${sectionId}`)}
          title="Class section"
        >
          <AccessDenied what="this class section" />
        </AppShell>
      );
    }
    throw err;
  }

  // Exactly one thing to do: go and do it, rather than showing a list of one.
  if (open.length === 1) redirect(`/forms/${open[0]!.instance.id}`);

  const { section, course } = await getSectionWithCourse(sectionId);
  const shell = {
    user: toShellUser(user),
    workspace: "student" as const,
    navGroups: await primaryNavFor(user, `/sections/${sectionId}`),
    tabs: studentSectionTabs(sectionId, `/sections/${sectionId}`),
    tabsLabel: course.code,
    contextLabel: course.code,
    roomy: true,
  };

  if (open.length === 0) {
    return (
      <AppShell {...shell} title={course.code} description={section.title}>
        <EmptyState title="Nothing to fill in right now">
          Forms open on a schedule set by your teaching team. When the next one
          opens it appears here, and you will have until its deadline to send it.
        </EmptyState>
        <div className="row" style={{ marginTop: "var(--s4)" }}>
          <Link
            className="button button--secondary"
            href={`/sections/${sectionId}/qa`}
          >
            Class Q&amp;A archive
          </Link>
          <Link
            className="button button--quiet"
            href={`/sections/${sectionId}/history`}
          >
            My submissions
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      {...shell}
      title={course.code}
      description={`${open.length} forms are open. The one closing soonest is first.`}
    >
      <div className="stack-4">
        {open.map(({ instance, formTitle, sequenceLabel, focusLabel, alreadySubmitted }) => (
          <Link
            className="notice section-notice"
            key={instance.id}
            href={`/forms/${instance.id}`}
          >
            <div className="notice__body">
              <h2 className="panel-title">{formTitle}</h2>
              <p className="meta">
                {[sequenceLabel, focusLabel, alreadySubmitted ? "Submitted" : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
