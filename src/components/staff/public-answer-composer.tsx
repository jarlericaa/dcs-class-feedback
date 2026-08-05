"use client";

import { useRef, useState } from "react";

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
        <label htmlFor={`pubq-${itemId}`}>Public version of the question</label>
        <textarea
          id={`pubq-${itemId}`}
          className="textarea-field"
          name="publicQuestion"
          rows={3}
          defaultValue={originalQuestion}
          required
        />
      </div>

      <div className="field-row">
        <label htmlFor={`puba-${itemId}`}>
          Answer <span className="optional-mark">required to publish</span>
        </label>
        <textarea
          id={`puba-${itemId}`}
          className="textarea-field"
          name="answerBody"
          rows={5}
        />
      </div>

      {canPublish && (
        <div className="visibility-note">
          Publishing shows this question and answer to everyone enrolled in this
          section. The original wording stays private, but a specific enough
          detail can still identify the person who asked — especially in a small
          class.
        </div>
      )}

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
          Read the public wording once more, then tick the box to publish.
          Nothing you typed has been lost.
        </p>
      )}

      <div className="row">
        <button
          className="button button--secondary"
          type="submit"
          name="intent"
          value="draft"
        >
          Save as a draft
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
