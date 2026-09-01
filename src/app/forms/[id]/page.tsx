import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { courses } from "@/db/schema";

import { formatDateTime, formatDeadline, timeRemaining } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { studentSectionTabs } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  Alert,
  MetaList,
  Notice,
  Stamp,
} from "@/components/ui";
import {
  WeeklyForm,
  type FormQuestionView,
  type SubmitState,
} from "@/components/student/weekly-form";
import {
  editSubmittedResponse,
  getStudentFormStateForInstance,
  saveDraft,
  submitResponse,
  SubmissionError,
} from "@/modules/forms/submission";
import type { QuestionOption } from "@/modules/forms/questions";
import { renderRichText } from "@/modules/richtext/render";
import { AuthzError } from "@/modules/authz";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * One form, as the student sees it.
 *
 * Keyed on the FORM, not on a section: a form shared by several sections is one
 * thing a student fills in once, so making the section the route would offer them
 * a distinction they do not have and cannot act on.
 *
 * What they see is the course code, the form's name, its focus if the teacher set
 * one, the deadline, the questions, and one submit action. Nothing about the
 * audience, no other section, no counts.
 *
 * Everything authoritative happens in modules/forms/submission: audience access,
 * the open window and the deadline, validation, the one-response-per-form rule,
 * and the audit write. This page renders and relays.
 */
export default async function StudentFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const user = await requireUser();
  const { id: instanceId } = await params;
  const { submitted } = await searchParams;
  const path = `/forms/${instanceId}`;

  let current: Awaited<ReturnType<typeof getStudentFormStateForInstance>>;
  try {
    current = await getStudentFormStateForInstance(user.id, instanceId);
  } catch (err) {
    if (err instanceof AuthzError) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="student"
          navGroups={await primaryNavFor(user, path)}
          title="Form"
        >
          <AccessDenied what="this form" />
        </AppShell>
      );
    }
    throw err;
  }
  if (!current) {
    return (
      <AppShell
        user={toShellUser(user)}
        workspace="student"
        navGroups={await primaryNavFor(user, path)}
        title="Form"
      >
        <AccessDenied what="this form" />
      </AppShell>
    );
  }

  const {
    instance,
    questions,
    config,
    response,
    canEdit,
    formTitle,
    sequenceLabel,
    focusLabel,
    topicTitle,
    attributedSectionId,
    showSectionLabel,
    sectionTitle,
    timezone,
  } = current;
  const course = (await db.query.courses.findFirst({
    where: eq(courses.id, instance.courseId),
  }))!;
  const shell = {
    user: toShellUser(user),
    workspace: "student" as const,
    /* A form instance is reached through the reader's class, but its URL says
       nothing about which one, so the page tells the rail. */
    navGroups: await primaryNavFor(user, `/forms/${instanceId}`, {
      fallbackHref: `/sections/${attributedSectionId}`,
    }),
    /* A form instance is what the section's Forms view leads to, not a peer of
       it, so the strip marks that tab rather than showing nothing selected. */
    tabs: studentSectionTabs(attributedSectionId, `/forms/${instanceId}`, {
      activeHref: `/sections/${attributedSectionId}`,
    }),
    tabsLabel: course.code,
    /* The course code is the identity. The section is not in the label: the
       student's action and this form are identical in every section it went to,
       so naming one would imply a difference that does not exist. */
    contextLabel: course.code,
    roomy: true,
  };

  /**
   * Not editable: either the deadline has passed or the form is not open. Shown
   * whether or not they answered — offering a form the server will refuse is
   * worse than saying plainly that it is closed.
   */
  if (!canEdit) {
    return (
      <AppShell
        {...shell}
        title={`${formTitle} is closed`}
        status={<Stamp tone="neutral">Closed</Stamp>}
      >
        <div className="stack-5">
          {submitted === "1" && (
            <Alert variant="success" title="Your form was submitted">
              It has been recorded. The deadline has since passed, so nothing
              here can be changed now.
            </Alert>
          )}
          <Notice roomy>
            <p className="doc">
              {response
                ? `Your answers were recorded. This closed ${formatDeadline(instance.deadlineAt, timezone)}, so nothing here can be changed now.`
                : `This closed ${formatDeadline(instance.deadlineAt, timezone)} and was not sent. Nothing can be added to it now.`}
            </p>
            <p className="doc">
              If a staff member replies to something you wrote, the reply appears
              under your submissions — only you and the teaching team can see it.
            </p>
            <div className="row" style={{ marginTop: "var(--s5)" }}>
              <Link
                className="button button--primary"
                href={`/sections/${attributedSectionId}/history`}
              >
                See my submissions
              </Link>
              <Link
                className="button button--secondary"
                href={`/sections/${attributedSectionId}/qa`}
              >
                Class Q&amp;A
              </Link>
            </div>
          </Notice>
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
    else if (value.optionIds)
      initialAnswers[answer.questionId] = value.optionIds;
    else if (value.scaleValue !== undefined)
      initialAnswers[answer.questionId] = String(value.scaleValue);
    else if (value.boolValue !== undefined)
      initialAnswers[answer.questionId] = value.boolValue ? "yes" : "no";
    else if (value.dateValue)
      initialAnswers[answer.questionId] = value.dateValue;
    else if (value.timeValue)
      initialAnswers[answer.questionId] = value.timeValue;
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
    // service re-validates the shape, the count against the form, and the
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
        const result = await saveDraft(uid, instanceId, payload);
        revalidatePath(`/forms/${instanceId}`);
        return {
          status: "saved",
          errors: {},
          message:
            "Your draft is saved. It does not count until you submit, and only you can see it.",
          itemIdMappings: result.itemIdMappings,
        };
      }
      const result =
        intent === "edit"
          ? await editSubmittedResponse(uid, instanceId, payload)
          : await submitResponse(uid, instanceId, payload);
      revalidatePath(`/forms/${instanceId}`);
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
        itemIdMappings: result.itemIdMappings,
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
      /* The form's own name is the title. "Week 4" is context beneath it when
         the form actually has a number, and the teacher's focus sits there too
         when they set one — that is what explains an unfamiliar question. */
      title={formTitle}
      description={
        <>
          <MetaList
            items={[
              sequenceLabel,
              focusLabel ? `Focus: ${focusLabel}` : null,
              topicTitle && topicTitle !== focusLabel ? topicTitle : null,
              /* The section, only when the student is in more than one class
                 list this form went to — otherwise it tells them nothing. */
              showSectionLabel ? sectionTitle : null,
            ]}
          />
          <span>
            Closes {formatDeadline(instance.deadlineAt, timezone)}. Your teaching
            team sees your name beside your answers; your classmates never do.
          </span>
        </>
      }
      status={
        <>
          <Stamp tone={response ? "green" : "amber"}>
            {response ? "Submitted" : "Not submitted"}
          </Stamp>
          <span className="meta">
            {timeRemaining(instance.deadlineAt)} left
          </span>
        </>
      }
    >
      <Notice roomy>
        <WeeklyForm
          questions={questionViews}
          action={submit}
          deadlineLabel={formatDeadline(instance.deadlineAt, timezone)}
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
              ? formatDateTime(response.lastEditedAt, timezone)
              : undefined
          }
        />
      </Notice>
    </AppShell>
  );
}
