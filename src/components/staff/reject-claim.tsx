"use client";

import { Dialog } from "@/components/ui/dialog";

/**
 * Rejecting a link request.
 *
 * The reason field used to sit permanently beside every pending row, which both
 * cluttered the comparison and put a destructive input one stray keystroke from
 * being submitted. It lives in this dialog instead, because the service records
 * a staff-only reason with the decision and the audit trail needs it.
 */
export function RejectClaim({
  action,
  claimId,
  label,
}: {
  action: (formData: FormData) => void | Promise<void>;
  claimId: string;
  label: string;
}) {
  return (
    <Dialog
      className="button--small"
      label={label}
      title="Reject this link request?"
      description="The student can ask again. Nothing is deleted."
    >
      <form action={action}>
        <input type="hidden" name="claimId" value={claimId} />
        <div className="field-row">
          <label htmlFor={`reject-reason-${claimId}`}>
            Reason <span className="optional-mark">optional</span>
          </label>
          <input
            id={`reject-reason-${claimId}`}
            className="field"
            name="reason"
            placeholder="Names do not match"
          />
          <span className="helper-text">
            Staff only. Recorded in the audit history.
          </span>
        </div>
        <div className="row">
          <button className="button button--danger" type="submit">
            Reject request
          </button>
        </div>
      </form>
    </Dialog>
  );
}
