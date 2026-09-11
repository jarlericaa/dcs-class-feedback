"use client";

import { useState } from "react";
import { TemplatePreview } from "@/components/staff/template-preview";
import type { FormQuestionView } from "@/components/student/weekly-form";
import { buttonClass } from "@/components/ui/button";

/**
 * "Preview form" for a page that is only *reading* a form.
 *
 * `TemplateEditor` already offers a preview of its own unsaved state. A teacher
 * looking at a saved form had no way to see it as a student without entering
 * edit mode first, which is a strange price for a read. This is the same dialog
 * and the same real `WeeklyForm`, driven by the saved questions instead.
 *
 * A client component only because the dialog needs open state; it receives
 * already-authorized data and renders it.
 */
export function PreviewFormButton({
  questions,
  formTitle,
  config,
  label = "Preview form",
  primary = false,
}: {
  questions: FormQuestionView[];
  formTitle: string;
  config: {
    maxStudentQuestions: number;
    studentQuestionPrompt: string | null;
    generalCommentEnabled: boolean;
    generalCommentPrompt: string | null;
    generalCommentRequired: boolean;
  };
  label?: string;
  primary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={buttonClass({ variant: primary ? "primary" : "secondary" })}
        type="button"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open && (
        <TemplatePreview
          open={open}
          onClose={() => setOpen(false)}
          questions={questions}
          templateName={formTitle}
          config={config}
        />
      )}
    </>
  );
}
