import { RequiredMark } from "@/components/ui/required-mark";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { db } from "@/db";
import { courses } from "@/db/schema";

import { AppShell } from "@/components/layout/app-shell";
import { staffSectionTabGroups } from "@/components/layout/nav";
import { courseTabGroupsFor, primaryNavFor } from "@/lib/nav-context";
import {
  loadStaffSection,
  sectionLabel,
  type StaffSectionContext,
} from "@/lib/staff-section";
import { AccessDenied, Alert, Breadcrumbs, EmptyState } from "@/components/ui";
import { DeliveryFields } from "@/components/staff/delivery-fields";
import { TemplateEditor } from "@/components/staff/template-editor";
import { AuthzError, requireCourseStaff } from "@/modules/authz";
import { AudienceError } from "@/modules/forms/audience";
import { createTemplate } from "@/modules/forms/templates";
import {
  configureDelivery,
  listAudienceOptions,
  ScheduleError,
} from "@/modules/forms/schedules";
import { InstanceError } from "@/modules/forms/instances";
import type { QuestionDefinition } from "@/modules/forms/questions";
import { requireUser, toShellUser } from "@/lib/session";
import { Field, FieldRow, FormSection } from "@/components/ui/form";

/**
 * Create one form: what it is, who gets it, when it goes out, what it asks.
 *
 * One page rather than a wizard, because the four decisions are small and a
 * teacher wants to see them together before committing. The order still matters,
 * and the headings say so.
 *
 * Two things are created here, and the distinction is real: a reusable form
 * DEFINITION (title, purpose, questions, versioned) and a DELIVERY configuration
 * (audience + schedule) that generates the instances students answer. Editing one
 * future instance is a third thing, and lives on that instance's own page.
 */
export default async function NewFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; sectionId?: string }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const { error, sectionId } = await searchParams;
  const path = `/teach/courses/${courseId}/forms/new`;
  // Navigation context must not reach UUID comparisons in the section loader.
  const safeSectionId =
    sectionId && z.string().uuid().safeParse(sectionId).success
      ? sectionId
      : undefined;
  let templateSection: Extract<StaffSectionContext, { ok: true }> | null = null;
  let templateOnly = false;

  try {
    await requireCourseStaff(db, user.id, courseId);
  } catch (err) {
    if (!(err instanceof AuthzError)) throw err;
    if (!safeSectionId) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={await primaryNavFor(user, path)}
          title="New form"
        >
          <AccessDenied what="this course's forms" />
        </AppShell>
      );
    }
    const candidate = await loadStaffSection(safeSectionId, "manageTemplates");
    if (!candidate.ok || candidate.course.id !== courseId) {
      return (
        <AppShell
          user={toShellUser(user)}
          workspace="staff"
          navGroups={await primaryNavFor(user, path)}
          title="New form"
        >
          <AccessDenied what="this course's forms" />
        </AppShell>
      );
    }
    templateSection = candidate;
    templateOnly = true;
  }

  const course = (await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  }))!;
  const sections = templateOnly
    ? []
    : await listAudienceOptions(user.id, courseId);

  async function createForm(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");

    const fail = (message: string) => {
      const query = new URLSearchParams({ error: message });
      if (templateOnly && safeSectionId) query.set("sectionId", safeSectionId);
      redirect(`/teach/courses/${courseId}/forms/new?${query.toString()}`);
    };

    let templateId: string;
    try {
      const created = await createTemplate(uid, {
        courseId,
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? "") || undefined,
        purpose: String(formData.get("purpose") ?? "") || undefined,
        visibility: "course_shared",
        questions: parseQuestions(formData.get("questions")),
        studentSection: parseStudentSection(formData),
      });
      templateId = created.template.id;
    } catch (err) {
      fail(describe(err));
      return;
    }

    // A section assistant owns the definition only. Delivery is a separate
    // course-level decision, so leave the new form unscheduled and return to the
    // section-scoped forms doorway.
    if (templateOnly) {
      revalidatePath(`/teach/sections/${safeSectionId}/forms`);
      redirect(
        `/teach/courses/${courseId}/forms/${templateId}?sectionId=${safeSectionId}&ok=${encodeURIComponent(
          "Form saved. A course instructor can decide when and where it goes out.",
        )}`,
      );
    }

    // The definition is saved. If the delivery configuration is rejected the
    // form still exists as an unscheduled draft rather than vanishing with
    // everything the teacher typed — they finish it from the form's own page.
    const mode = String(formData.get("deliveryMode") ?? "weekly");
    try {
      await configureDelivery(uid, courseId, {
        templateId,
        deliveryMode: mode,
        audienceMode: String(formData.get("audienceMode") ?? "all_sections"),
        sectionIds: formData.getAll("sectionIds").map(String),
        openDayOfWeek: String(formData.get("openDayOfWeek") ?? "") || undefined,
        openTime: String(formData.get("openTime") ?? ""),
        deadlineDayOfWeek:
          String(formData.get("deadlineDayOfWeek") ?? "") || undefined,
        deadlineTime: String(formData.get("deadlineTime") ?? ""),
        startDate: String(formData.get("startDate") ?? ""),
        endDate: String(formData.get("endDate") ?? ""),
        intervalWeeks: String(formData.get("intervalWeeks") ?? "") || undefined,
        openDate: String(formData.get("openDate") ?? ""),
        openAtTime: String(formData.get("openAtTime") ?? ""),
        deadlineDate: String(formData.get("deadlineDate") ?? ""),
        deadlineAtTime: String(formData.get("deadlineAtTime") ?? ""),
      });
    } catch (err) {
      revalidatePath(`/teach/courses/${courseId}`);
      redirect(
        `/teach/courses/${courseId}/forms/${templateId}?error=${encodeURIComponent(
          `The form was saved, but its schedule was not: ${describe(err)}`,
        )}`,
      );
    }

    revalidatePath(`/teach/courses/${courseId}`);
    redirect(
      `/teach/courses/${courseId}/forms/${templateId}?ok=${encodeURIComponent(
        mode === "manual"
          ? "Form saved. Create the first one when you are ready to open it."
          : "Form saved and scheduled.",
      )}`,
    );
  }

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, path, {
        fallbackHref: templateOnly
          ? `/teach/sections/${safeSectionId}`
          : undefined,
      })}
      /* Course staff see the course strip. A section-scoped template manager
         stays in the section context, where the Forms doorway is real and
         delivery controls are not implied. */
      tabGroups={
        templateOnly
          ? staffSectionTabGroups(
              templateSection!.access,
              `/teach/sections/${safeSectionId}/forms`,
            )
          : await courseTabGroupsFor(user.id, courseId, path, {
              activeHref: `/teach/courses/${courseId}`,
            })
      }
      tabsLabel={
        templateOnly
          ? sectionLabel(course.code, templateSection!.section.title)
          : course.code
      }
      tabsMode={templateOnly ? "menu" : undefined}
      contextLabel={
        templateOnly
          ? sectionLabel(course.code, templateSection!.section.title)
          : course.code
      }
      breadcrumbs={
        <Breadcrumbs
          items={
            templateOnly
              ? [
                  {
                    href: `/teach/sections/${safeSectionId}/forms`,
                    label: sectionLabel(
                      course.code,
                      templateSection!.section.title,
                    ),
                  },
                  { label: "New form" },
                ]
              : [
                  { href: "/teach/courses", label: "My courses" },
                  { href: `/teach/courses/${courseId}`, label: course.code },
                  { label: "New form" },
                ]
          }
        />
      }
      nested
      title="New form"
    >
      <div className="stack-4">
        {error && <Alert variant="error">{error}</Alert>}

        {!templateOnly && sections.length === 0 ? (
          <EmptyState
            title="No class lists yet"
            action={{
              href: `/teach/courses/${courseId}/sections?new=1`,
              label: "Add a section",
            }}
            primary
          >
            A form needs at least one section to go to.
          </EmptyState>
        ) : (
          <form action={createForm} className="grid gap-4">
            {/*
              Four numbered steps, in one register. They used to be four
              headings in two: "What this form is" and "What it asks" were 20px
              serif panel titles, while "Who gets this form" and "When it goes
              out" were 11px uppercase chips inside `DeliveryFields` — so the
              parts of one form read as unrelated blocks. Numbering also makes
              the template-only branch honest: it genuinely has fewer steps.
            */}
            <FormSection step={1} title="Form details">
              <div className="form-grid">
                <FieldRow
                  label={
                    <>
                      Form name <RequiredMark />
                    </>
                  }
                  htmlFor="form-title"
                >
                  <Field
                    id="form-title"
                    name="title"
                    placeholder="Weekly feedback"
                    required
                    aria-describedby="form-title-help"
                  />
                  <span className="helper-text" id="form-title-help">
                    What students see at the top of it. &ldquo;LE 1
                    feedback&rdquo;, &ldquo;Course evaluation&rdquo;.
                  </span>
                </FieldRow>
                <FieldRow label="Label" htmlFor="form-purpose">
                  <Field
                    id="form-purpose"
                    name="purpose"
                    placeholder="Long exam"
                    aria-describedby="form-purpose-help"
                  />
                  <span className="helper-text" id="form-purpose-help">
                    Only to help you find it later in a long list.
                  </span>
                </FieldRow>
                <FieldRow label="Short description" htmlFor="form-description">
                  <Field id="form-description" name="description" />
                </FieldRow>
              </div>
            </FormSection>

            {templateOnly ? (
              <FormSection step={2} title="Delivery">
                <p className="muted">
                  This saves the form questions only. A course instructor can
                  decide which sections receive it and when it opens.
                </p>
              </FormSection>
            ) : (
              /* Two steps, not one: who gets it and when it goes out are
                 separate decisions and were already separate fieldsets. */
              <DeliveryFields
                sections={sections.map((s) => ({
                  id: s.id,
                  title: s.title,
                  term: s.term,
                }))}
                firstStep={2}
              />
            )}

            <FormSection step={templateOnly ? 3 : 4} title="Questions">
              {/* The same editor and the same student preview the rest of the
                    product uses. A shared audience does not mean a copy of the
                    form per section: there is one question list. */}
              <TemplateEditor
                showTitleFields={false}
                initialQuestions={[]}
                submitLabel="Save form"
                cancelHref={
                  templateOnly
                    ? `/teach/sections/${safeSectionId}/forms`
                    : `/teach/courses/${courseId}`
                }
                versionNote="Later edits create a new version. Forms already sent keep the questions their students answered."
              />
            </FormSection>
          </form>
        )}
      </div>
    </AppShell>
  );
}

/** Read the student-additions configuration out of the editor's fields. */
function parseStudentSection(formData: FormData) {
  const generalComment = String(formData.get("generalComment") ?? "optional");
  return {
    maxStudentQuestions: Number.parseInt(
      String(formData.get("maxStudentQuestions") ?? "1"),
      10,
    ),
    studentQuestionPrompt:
      String(formData.get("studentQuestionPrompt") ?? "") || null,
    generalCommentEnabled: generalComment !== "off",
    generalCommentPrompt:
      String(formData.get("generalCommentPrompt") ?? "") || null,
    generalCommentRequired: generalComment === "required",
  };
}

function parseQuestions(raw: FormDataEntryValue | null): QuestionDefinition[] {
  const text = String(raw ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The question list could not be read. Try again.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Add at least one question.");
  }
  return parsed as QuestionDefinition[];
}

function describe(err: unknown): string {
  if (
    err instanceof AuthzError ||
    err instanceof ScheduleError ||
    err instanceof AudienceError ||
    err instanceof InstanceError
  ) {
    return err.message;
  }
  if (err instanceof Error && err.name === "ZodError") {
    try {
      const issues = JSON.parse(err.message) as { message: string }[];
      return issues.map((i) => i.message).join(" ");
    } catch {
      return "Check the values you entered and try again.";
    }
  }
  if (err instanceof Error) return err.message;
  throw err;
}
