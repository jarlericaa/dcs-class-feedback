"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

export type PublicationEditState = { error?: string };
export type PublicationEditAction = (
  previousState: PublicationEditState,
  formData: FormData,
) => Promise<PublicationEditState>;

/**
 * The queue reads like an editorial surface first. This is the only part that
 * becomes an editor, and it stays scoped to one field so a teacher can make a
 * small correction without opening two large textareas at once.
 */
export function PublicationQueueEditor({
  action,
  answerId,
  mode,
  question,
  answer,
  cancelHref,
}: {
  action: PublicationEditAction;
  answerId: string;
  mode: "question" | "answer";
  question: string;
  answer: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const fieldId = `publication-${mode}-${answerId}`;
  const errorId = `${fieldId}-error`;

  return (
    <form
      action={formAction}
      className="publication-inline-editor"
    >
      <input type="hidden" name="answerId" value={answerId} />
      <input type="hidden" name="editMode" value={mode} />
      {mode === "question" ? (
        <>
          <label htmlFor={fieldId}>Public question</label>
          <textarea
            id={fieldId}
            name="publicQuestion"
            defaultValue={question}
            rows={3}
            required
            aria-invalid={state.error ? "true" : undefined}
            aria-describedby={state.error ? errorId : undefined}
          />
          <input type="hidden" name="answerBody" value={answer} />
        </>
      ) : (
        <>
          <label htmlFor={fieldId}>Draft answer</label>
          <textarea
            id={fieldId}
            name="answerBody"
            defaultValue={answer}
            rows={6}
            aria-invalid={state.error ? "true" : undefined}
            aria-describedby={state.error ? errorId : undefined}
          />
          <input type="hidden" name="publicQuestion" value={question} />
        </>
      )}
      {state.error && (
        <p className="field-error" id={errorId} role="alert">
          {state.error} Nothing was changed. Your text is still here.
        </p>
      )}
      <div className="publication-inline-editor__actions">
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save {mode === "question" ? "question" : "answer"}
        </SubmitButton>
        <Link
          className={buttonClass({ variant: "quiet" })}
          href={cancelHref}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
