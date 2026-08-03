"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui";

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
  originalQuestion,
  canPublish,
}: {
  action: (formData: FormData) => void | Promise<void>;
  itemId: string;
  selectedResponseId: string;
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
      <div className="field-row">
        <label htmlFor={`pubq-${itemId}`}>Public question</label>
        <textarea
          id={`pubq-${itemId}`}
          className="textarea-field"
          name="publicQuestion"
          rows={2}
          defaultValue={originalQuestion}
          required
        />
      </div>
      <div className="field-row">
        <label htmlFor={`puba-${itemId}`}>Public answer</label>
        <textarea
          id={`puba-${itemId}`}
          className="textarea-field"
          name="answerBody"
          rows={4}
        />
      </div>
      <Alert variant="warning" title="Before you publish">
        This answer will be visible to students in this section. The original
        wording stays private, but specific details can still identify the
        asker. Review the public wording before publishing.
      </Alert>
      <label className="choice">
        <input
          ref={acknowledgmentRef}
          type="checkbox"
          name="acknowledged"
          value="yes"
          aria-invalid={acknowledgmentError ? "true" : undefined}
          aria-describedby={acknowledgmentError ? errorId : undefined}
          onChange={() => setAcknowledgmentError(false)}
        />
        <span>I have checked the public wording</span>
      </label>
      {acknowledgmentError && (
        <p className="field-error" id={errorId} role="alert">
          Check the public wording and acknowledge the anonymity warning before
          publishing. Your question and answer have been kept.
        </p>
      )}
      <div className="row-gap" style={{ marginTop: 12 }}>
        <button
          className="button button--secondary"
          type="submit"
          name="intent"
          value="draft"
        >
          Save as draft
        </button>
        {canPublish && (
          <button
            className="button button--primary"
            type="submit"
            name="intent"
            value="publish"
          >
            Publish to this section
          </button>
        )}
      </div>
    </form>
  );
}
