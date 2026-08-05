"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui";

/**
 * Student roster claim form.
 *
 * A client component so a rejected attempt keeps the typed number in the field —
 * retyping a student number after an error is exactly the friction that makes
 * people give up and email their teacher instead.
 *
 * The messages here are deliberately uniform. The server returns the same result
 * for an unknown number, a number belonging to someone else, and a name mismatch,
 * so this component has nothing to differentiate even if it wanted to.
 */

export interface ClaimState {
  status: "idle" | "linked" | "pending" | "error" | "throttled";
  studentNumber: string;
  message?: string;
}

export function RosterClaim({
  action,
  initialStatus,
  typedLast4,
}: {
  action: (state: ClaimState, formData: FormData) => Promise<ClaimState>;
  initialStatus: "none" | "pending";
  typedLast4?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: initialStatus === "pending" ? "pending" : "idle",
    studentNumber: "",
  } satisfies ClaimState);

  const waiting = state.status === "pending";

  return (
    <div className="stack-4">
      {state.status === "linked" && (
        <Alert variant="success" title="You are linked">
          {state.message}
        </Alert>
      )}
      {waiting && (
        <Alert variant="info" title="Waiting for your teacher">
          {state.message ??
            (typedLast4
              ? `We have your request (number ending ${typedLast4}). Your teacher will confirm it — you do not need to do anything else.`
              : "We have your request. Your teacher will confirm it — you do not need to do anything else.")}
        </Alert>
      )}
      {state.status === "throttled" && (
        <Alert variant="warning" title="Too many attempts">
          {state.message}
        </Alert>
      )}
      {state.status === "error" && (
        <Alert variant="error" title="That did not work">
          {state.message}
        </Alert>
      )}

      {state.status !== "linked" && (
        <form action={formAction} className="notice notice--pad">
          <div className="field-row" style={{ maxWidth: 360 }}>
            <label htmlFor="student-number">Your student number</label>
            <input
              id="student-number"
              className="field"
              name="studentNumber"
              inputMode="text"
              autoComplete="off"
              defaultValue={state.studentNumber}
              required
              aria-describedby="student-number-help"
            />
            <span className="helper-text" id="student-number-help">
              Exactly as it appears on your registration, including any leading
              zero. We compare it with your Google account name.
            </span>
          </div>
          <div className="submit-bar">
            <p className="submit-bar__note">
              Your teacher confirms every link by hand, so nothing happens to
              your record until they do.
            </p>
            <button
              className="button button--primary"
              type="submit"
              disabled={pending}
            >
              {pending
                ? "Sending…"
                : waiting
                  ? "Try a different number"
                  : "Request access"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
