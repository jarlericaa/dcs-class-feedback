"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  WeeklyForm,
  type FormQuestionView,
  type StudentSectionConfigView,
  type SubmitState,
} from "@/components/student/weekly-form";
import { buttonClass } from "@/components/ui/button";

/**
 * What the students will answer, from the editor's current unsaved state.
 *
 * This renders the REAL `WeeklyForm`, not a lookalike, so the preview cannot
 * drift from `/sections/[id]` as that page changes. Two guarantees make it safe
 * to do that:
 *
 *  - `preview` mode replaces the submit bar, so there is no control that could
 *    send anything, and
 *  - the action passed to it is an inert local reducer. No server action is
 *    referenced from this module at all.
 *
 * It is portalled to `document.body` because the template editor lives inside a
 * `<form>`, and `WeeklyForm` renders its own — nested forms are invalid HTML and
 * browsers silently drop the inner one. The portal takes it out of that tree.
 *
 * A native `<dialog>` carries the focus trap, the Escape handler and the
 * `aria-modal` semantics, so none of that is reimplemented here.
 */

/** Never mutates, never submits: the preview's form has nowhere to post. */
async function inertAction(state: SubmitState): Promise<SubmitState> {
  return state;
}

export function TemplatePreview({
  open,
  onClose,
  questions,
  config,
  templateName,
}: {
  open: boolean;
  onClose: () => void;
  questions: FormQuestionView[];
  config: StudentSectionConfigView;
  templateName: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape and the backdrop both close through the same path as the button, so
  // the editor's open state never disagrees with the dialog's.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", onClose);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", onClose);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <dialog className="preview" ref={ref} aria-labelledby="preview-title">
      <div className="preview__bar">
        <div>
          <h2 className="preview__title" id="preview-title">
            Preview
          </h2>
          <p className="preview__sub">
            {templateName.trim() || "Untitled template"} — what students answer.
            Nothing here is saved or sent.
          </p>
        </div>
        <button
          className={buttonClass({ variant: "secondary", size: "small" })}
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className="preview__body">
        {questions.length === 0 ? (
          <p className="muted">
            No questions yet. Add one to see how the form reads.
          </p>
        ) : (
          <div className="form-sheet">
            {/* Markdown and LaTeX in a prompt are rendered by the server's one
                sanitizer, which deliberately does not run in the browser, so a
                prompt appears here as the plain text it was typed as. Said out
                loud rather than left as a surprise. */}
            <WeeklyForm
              preview
              questions={questions}
              action={inertAction}
              deadlineLabel="the deadline"
              config={config}
            />
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
