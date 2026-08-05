import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";

import { formatDeadline, timeRemaining } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { studentSectionNav } from "@/components/layout/nav";
import {
  AccessDenied,
  Alert,
  Breadcrumbs,
  EmptyState,
  Notice,
  Stamp,
} from "@/components/ui";
import {
  WeeklyForm,
  type FormQuestionView,
  type SubmitState,
} from "@/components/student/weekly-form";
import {
  getOpenCycleForStudent,
  submitResponse,
  SubmissionError,
} from "@/modules/forms/submission";
import type { QuestionOption } from "@/modules/forms/questions";
import { AuthzError } from "@/modules/authz";
import { getSectionWithCourse } from "@/modules/catalog";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * Student weekly form for the currently-open cycle of this section.
 *
 * Everything authoritative happens in modules/forms/submission: authorization,
 * open-window and deadline enforcement, validation, the one-per-cycle rule and
 * the audit write. This page only renders and relays.
 */
export default async function SectionFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const user = await requireUser();
  const { id: sectionId } = await params;
  const { submitted } = await searchParams;

  let current: Awaited<ReturnType<typeof getOpenCycleForStudent>>;
  try {
    current = await getOpenCycleForStudent(user.id, sectionId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="student"
          navGroups={[]}
          title="Class section"
        >
          <AccessDenied what="this class section" />
        </AppShell>
      );
    }
    throw err;
  }

  const { section, course } = await getSectionWithCourse(sectionId);
  const shell = {
    user: toShellUser(user),
    workspace: "student" as const,
    navGroups: studentSectionNav(sectionId, `/sections/${sectionId}`),
    contextLabel: `${course.code} · ${section.title}`,
    roomy: true,
    breadcrumbs: (
      <Breadcrumbs
        items={[
          { href: "/", label: "Overview" },
          { label: `${course.code} ${section.term}` },
        ]}
      />
    ),
  };

  if (!current) {
    return (
      <AppShell {...shell} title={section.title}>
        <EmptyState title="No form is open at the moment">
          Weekly forms open on a schedule set by your teaching team. When the
          next one opens it appears here, and you will have until its deadline
          to send it.
        </EmptyState>
        <div className="row" style={{ marginTop: "var(--s4)" }}>
          <Link
            className="button button--secondary"
            href={`/sections/${sectionId}/qa`}
          >
            Class Q&amp;A
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

  const { cycle, questions, alreadySubmitted } = current;

  if (alreadySubmitted) {
    return (
      <AppShell
        {...shell}
        title={`Week ${cycle.cycleIndex} is done`}
        status={<Stamp tone="green">Submitted</Stamp>}
      >
        <div className="stack-5">
          {submitted === "1" && (
            <Alert variant="success" title="Your form was submitted">
              It has been recorded for week {cycle.cycleIndex}. Submissions
              cannot be edited or withdrawn, so nothing here can be changed
              now.
            </Alert>
          )}
          <Notice roomy>
            <p className="doc">
              You have nothing left to do for this week. If a staff member
              replies to something you wrote, the reply appears under your
              submissions — only you and the teaching team can see it.
            </p>
            <p className="meta" style={{ marginTop: "var(--s4)" }}>
              This week closes{" "}
              {formatDeadline(cycle.deadlineAt, section.timezone)}.
            </p>
            <div className="row" style={{ marginTop: "var(--s5)" }}>
              <Link
                className="button button--primary"
                href={`/sections/${sectionId}/history`}
              >
                See my submissions
              </Link>
              <Link
                className="button button--secondary"
                href={`/sections/${sectionId}/qa`}
              >
                Class Q&amp;A
              </Link>
            </div>
          </Notice>
        </div>
      </AppShell>
    );
  }

  const questionViews: FormQuestionView[] = questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    description: q.description,
    type: q.type,
    required: q.required,
    options: ((q.options ?? []) as QuestionOption[]).map((o) => ({
      stableId: o.stableId,
      label: o.label,
    })),
    scale: q.scale
      ? {
          min: (q.scale as { min: number }).min,
          max: (q.scale as { max: number }).max,
          step: (q.scale as { step?: number }).step ?? 1,
        }
      : null,
  }));

  async function submit(
    _prev: SubmitState,
    formData: FormData,
  ): Promise<SubmitState> {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");

    const answers = questionViews.map((q) => {
      const raw = formData.getAll(`q_${q.id}`).map(String).filter(Boolean);
      switch (q.type) {
        case "short_answer":
        case "paragraph":
          return { questionId: q.id, text: raw[0] ?? "" };
        case "multiple_choice":
        case "dropdown":
        case "checkboxes":
          return { questionId: q.id, optionIds: raw };
        case "linear_scale":
          return raw[0]
            ? { questionId: q.id, scaleValue: Number(raw[0]) }
            : { questionId: q.id };
        case "yes_no":
          return raw[0]
            ? { questionId: q.id, boolValue: raw[0] === "yes" }
            : { questionId: q.id };
        case "date":
          return { questionId: q.id, dateValue: raw[0] || undefined };
        case "time":
          return { questionId: q.id, timeValue: raw[0] || undefined };
      }
    });

    const itemText = String(formData.get("item_text") ?? "").trim();
    try {
      await submitResponse(uid, cycle.id, {
        answers,
        studentItem: itemText
          ? {
              submissionType: String(formData.get("item_type") ?? "question"),
              category: String(formData.get("item_category") ?? "content"),
              text: itemText,
            }
          : undefined,
      });
    } catch (err) {
      if (err instanceof SubmissionError) {
        // Map per-question errors back onto the fields so the student keeps
        // everything they typed and sees exactly what to fix.
        const errors: Record<string, string> = {};
        for (const detail of err.details) {
          errors[detail.questionId ?? ""] = detail.message;
        }
        if (err.details.length === 0) errors[""] = err.message;
        return { status: "error", errors };
      }
      if (err instanceof AuthzError) {
        return {
          status: "error",
          errors: { "": "You are not able to submit for this section." },
        };
      }
      throw err;
    }

    revalidatePath(`/sections/${sectionId}`);
    redirect(`/sections/${sectionId}?submitted=1`);
  }

  return (
    <AppShell
      {...shell}
      title={`Week ${cycle.cycleIndex}`}
      status={<Stamp tone="amber">Open · {timeRemaining(cycle.deadlineAt)}</Stamp>}
      description={`Closes ${formatDeadline(cycle.deadlineAt, section.timezone)}. There is no late submission and no editing afterwards.`}
    >
      <Notice roomy>
        <WeeklyForm questions={questionViews} action={submit} />
      </Notice>
    </AppShell>
  );
}
