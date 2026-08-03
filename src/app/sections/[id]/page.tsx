import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";

import { formatDateTime, formatDeadline, timeRemaining } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { studentSectionNav } from "@/components/layout/nav";
import { AccessDenied, Alert, Badge, EmptyState } from "@/components/ui";
import {
  WeeklyForm,
  type FormQuestionView,
  type SubmitState,
} from "@/components/student/weekly-form";
import {
  editSubmittedResponse,
  getStudentFormState,
  saveDraft,
  submitResponse,
  SubmissionError,
} from "@/modules/forms/submission";
import type { QuestionOption } from "@/modules/forms/questions";
import { renderRichText } from "@/modules/richtext/render";
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

  let current: Awaited<ReturnType<typeof getStudentFormState>>;
  try {
    current = await getStudentFormState(user.id, sectionId);
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
    contextLabel: section.title,
  };

  if (!current) {
    return (
      <AppShell
        {...shell}
        eyebrow={`${course.code} · ${section.term}`}
        title={section.title}
        description="There is no feedback form open for this class right now."
      >
        <EmptyState title="No form is open at the moment">
          Your teacher opens a new weekly form on a schedule. When one opens it
          will appear here, and you can always read past answers in the class
          Q&amp;A archive.
        </EmptyState>
        <div
          className="row-gap"
          style={{ marginTop: 16, justifyContent: "center" }}
        >
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

  const { cycle, questions, config, response, canEdit } = current;

  if (response && !canEdit) {
    return (
      <AppShell
        {...shell}
        eyebrow={`${course.code} · Week ${cycle.cycleIndex}`}
        title="You have completed this week's form"
        description="Thanks — that is everything we need from you this week."
      >
        <div className="stack-gap">
          {submitted === "1" && (
            <Alert variant="success" title="Submitted">
              Your response was recorded. Submissions cannot be edited, so
              nothing here can be changed or withdrawn.
            </Alert>
          )}
          <section className="card card--padded">
            <div
              className="row-gap"
              style={{ justifyContent: "space-between" }}
            >
              <div>
                <p className="section-kicker">Week {cycle.cycleIndex}</p>
                <h2 style={{ margin: "4px 0 6px", fontSize: 20 }}>
                  Submitted · edits are closed
                </h2>
                <p className="muted" style={{ margin: 0 }}>
                  Closed {formatDeadline(cycle.deadlineAt, section.timezone)}.
                  If a staff member replies to your question, it appears in your
                  submissions.
                </p>
              </div>
              <Badge tone="green">Submitted</Badge>
            </div>
            <div className="row-gap" style={{ marginTop: 18 }}>
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
                Class Q&amp;A archive
              </Link>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  // Rendered here, on the server, so the client form never runs a sanitizer.
  const questionViews: FormQuestionView[] = await Promise.all(
    questions.map(async (q) => ({
    id: q.id,
    prompt: q.prompt,
    description: q.description,
    promptHtml: await renderRichText(q.prompt),
    descriptionHtml: await renderRichText(q.description),
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
    })),
  );

  /**
   * Restore the student's saved answers into the shape the form control uses, so
   * reopening a draft shows exactly what they typed.
   */
  const initialAnswers: Record<string, string | string[]> = {};
  for (const answer of response?.answers ?? []) {
    const value = (answer.value ?? {}) as {
      optionIds?: string[];
      scaleValue?: number;
      boolValue?: boolean;
      dateValue?: string;
      timeValue?: string;
    };
    if (answer.freeText) initialAnswers[answer.questionId] = answer.freeText;
    else if (value.optionIds) initialAnswers[answer.questionId] = value.optionIds;
    else if (value.scaleValue !== undefined)
      initialAnswers[answer.questionId] = String(value.scaleValue);
    else if (value.boolValue !== undefined)
      initialAnswers[answer.questionId] = value.boolValue ? "yes" : "no";
    else if (value.dateValue) initialAnswers[answer.questionId] = value.dateValue;
    else if (value.timeValue) initialAnswers[answer.questionId] = value.timeValue;
  }

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

    // The client posts its item blocks as one JSON field. Untrusted input: the
    // service re-validates the shape, the count against the template, and the
    // ownership of every itemId.
    let items: unknown = [];
    try {
      items = JSON.parse(String(formData.get("items") ?? "[]"));
    } catch {
      items = [];
    }
    const expectedRevisionRaw = formData.get("expectedRevision");
    const payload = {
      answers,
      items,
      expectedRevision: expectedRevisionRaw
        ? Number(expectedRevisionRaw)
        : undefined,
    };

    const intent = String(formData.get("intent") ?? "submit");
    try {
      if (intent === "draft") {
        await saveDraft(uid, cycle.id, payload);
        revalidatePath(`/sections/${sectionId}`);
        return {
          status: "saved",
          errors: {},
          message:
            "Your draft is saved. It does not count until you submit, and only you can see it.",
        };
      }
      const result =
        intent === "edit"
          ? await editSubmittedResponse(uid, cycle.id, payload)
          : await submitResponse(uid, cycle.id, payload);
      revalidatePath(`/sections/${sectionId}`);
      return {
        status: "submitted",
        errors: {},
        message:
          result.rejectedItemIds.length > 0
            ? "Saved. Some questions could not be changed because staff have already acted on them."
            : intent === "edit"
              ? "Your changes are saved. You can keep editing until the deadline."
              : "Submitted. You can still edit until the deadline.",
        rejectedItemIds: result.rejectedItemIds,
      };
    } catch (err) {
      if (err instanceof SubmissionError) {
        const errors: Record<string, string> = {};
        for (const detail of err.details) {
          errors[detail.questionId ?? ""] = detail.message;
        }
        if (Object.keys(errors).length === 0) errors[""] = err.message;
        return { status: "error", errors };
      }
      if (err instanceof AuthzError) {
        return { status: "error", errors: { "": err.message } };
      }
      throw err;
    }
  }

  return (
    <AppShell
      {...shell}
      eyebrow={`${course.code} · ${section.term}`}
      title={`Week ${cycle.cycleIndex} feedback`}
      description="Answer your teacher's questions, and add anything of your own. It takes a couple of minutes."
      actions={
        <Badge tone="amber">Open · {timeRemaining(cycle.deadlineAt)}</Badge>
      }
    >
      <section className="card form-card">
        <div className="form-card__top">
          <h2>{section.title}</h2>
          <p>
            Closes {formatDeadline(cycle.deadlineAt, section.timezone)}. Your
            teacher sees your name with your answers. Anything published to the
            class is anonymous and reworded first.
          </p>
        </div>
        <div className="form-body">
          <WeeklyForm
            questions={questionViews}
            action={submit}
            deadlineLabel={formatDeadline(cycle.deadlineAt, section.timezone)}
            config={config}
            lifecycle={response?.lifecycle ?? "new"}
            revision={response?.revision}
            initialAnswers={initialAnswers}
            initialItems={
              response?.items.map((item) => ({
                clientKey: item.id,
                itemId: item.id,
                kind: item.kind,
                submissionType: item.submissionType,
                category: item.category,
                text: item.text,
                editable: item.editable,
              })) ?? []
            }
            lastEditedLabel={
              response?.lastEditedAt
                ? formatDateTime(response.lastEditedAt, section.timezone)
                : undefined
            }
          />
        </div>
      </section>
    </AppShell>
  );
}
