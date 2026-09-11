"use client";

import { SubmitButton } from "@/components/ui/submit-button";
import { useRef, useState } from "react";
import { Choice, FieldRow, Textarea } from "@/components/ui/form";

/**
 * The public-answer composer.
 *
 * The acknowledgment is a client-side guard that keeps a staff member from
 * publishing by reflex; `publishNow` re-checks it against the persisted row
 * and remains the real backstop. Failing the guard preserves both fields —
 * losing a rewritten question because a checkbox was unticked would push
 * people towards pasting the original back in, which is the exact risk the
 * check exists to prevent.
 */

export function publishNeedsAcknowledgement(
  intent: string | null,
  acknowledged: boolean,
) {
  return intent === "publish" && !acknowledged;
}

export function PublicAnswerComposer({
  action,
  itemId,
  selectedResponseId,
  sectionId,
  originalQuestion,
  canPublish,
}: {
  action: (formData: FormData) => void | Promise<void>;
  itemId: string;
  selectedResponseId: string;
  /**
   * The asker's own section — the ONLY section this answer may be published to.
   * A form shared across sections does not widen a publication, and the server
   * refuses any other target for this item.
   */
  sectionId: string;
  originalQuestion: string;
  canPublish: boolean;
}) {
  const acknowledgmentRef = useRef<HTMLInputElement>(null);
  const [acknowledgmentError, setAcknowledgmentError] = useState(false);
  const errorId = `publish-ack-error-${itemId}`;

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement | null;
        if (
          publishNeedsAcknowledgement(
            submitter?.value ?? null,
            Boolean(acknowledgmentRef.current?.checked),
          )
        ) {
          event.preventDefault();
          setAcknowledgmentError(true);
          requestAnimationFrame(() => acknowledgmentRef.current?.focus());
        }
      }}
    >
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="selected" value={selectedResponseId} />
      <input type="hidden" name="sectionId" value={sectionId} />

      <FieldRow
        label="Public version of the question"
        htmlFor={`pubq-${itemId}`}
      >
        <Textarea
          id={`pubq-${itemId}`}
          name="publicQuestion"
          rows={3}
          defaultValue={originalQuestion}
          required
        />
      </FieldRow>

      <FieldRow
        label={
          <>
            Answer <span className="qualifier-mark">Required to publish</span>
          </>
        }
        htmlFor={`puba-${itemId}`}
      >
        <Textarea id={`puba-${itemId}`} name="answerBody" rows={5} />
      </FieldRow>

      {/* The privacy risk in one line, next to the control that acts on it.
          The behaviour is unchanged: publishNow still re-checks the
          acknowledgment against the persisted row. */}
      {canPublish && (
        <p className="helper-text">
          A specific detail can still identify the asker in a small class.
        </p>
      )}

      <Choice
        ref={acknowledgmentRef}
        type="checkbox"
        name="acknowledged"
        value="yes"
        aria-invalid={acknowledgmentError ? "true" : undefined}
        aria-describedby={acknowledgmentError ? errorId : undefined}
        onChange={() => setAcknowledgmentError(false)}
      >
        I have checked the public wording
      </Choice>
      {acknowledgmentError && (
        <p className="field-error" id={errorId} role="alert">
          Read the public wording once more, then tick the box to publish.
          Nothing you typed has been lost.
        </p>
      )}

      <div className="row">
        <SubmitButton
          variant="secondary"
          name="intent"
          value="draft"
          pendingLabel="Saving…"
        >
          Save as a draft
        </SubmitButton>
        {canPublish && (
          <SubmitButton
            variant="primary"
            name="intent"
            value="publish"
            pendingLabel="Publishing…"
          >
            Publish to this section
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
