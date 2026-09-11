"use client";

import { SubmitButton } from "@/components/ui/submit-button";
import { Dialog } from "@/components/ui/dialog";
import { Choice, FieldLabel, FieldRow, Select } from "@/components/ui/form";

/**
 * Editing one staff member's permissions.
 *
 * The only hint that permissions were changeable used to be the text
 * "2 of 14 permissions" in a row's metadata, which is not a control and does not
 * look like one. This is an explicit action, prefilled with what they currently
 * hold, kept separate from Remove.
 *
 * It posts to `assignSectionStaff`, which upserts by email and re-checks owner
 * standing — no new server surface and no new authorization path.
 *
 * Adding people no longer goes through here: that is `AddStaffDialog`, on the
 * course's Teaching team page, and it calls
 * `assignSectionStaffBatch` so one paste can name several people. This stayed
 * on the single-target service because editing is inherently one row at a time
 * — a batch that re-sent one person's whole flag set would be a different,
 * riskier action wearing the same label.
 */
export function EditStaffPermissions({
  action,
  email,
  displayName,
  role,
  sectionId,
  permissions,
  permissionLabels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  email: string;
  displayName: string;
  role: string;
  /**
   * Which class list the grant belongs to. Passed when the editor is opened
   * from a table that spans several sections — the course's teaching team —
   * where the route cannot say which one a row means. The receiving action
   * re-authorizes it against that section's own course, so it is a hint about
   * which row was clicked, never the thing that grants access.
   */
  sectionId?: string;
  /** permission key → whether they hold it now */
  permissions: { key: string; granted: boolean }[];
  permissionLabels: Record<string, string>;
}) {
  return (
    <Dialog
      size="small"
      label="Edit permissions"
      title={`Permissions for ${displayName}`}
      description="Permissions apply to an SA. A course handler holds every capability."
    >
      <form action={action}>
        <input type="hidden" name="email" value={email} />
        {sectionId && (
          <input type="hidden" name="sectionId" value={sectionId} />
        )}

        <FieldRow label="Role" htmlFor={`role-${email}`}>
          <Select id={`role-${email}`} name="role" defaultValue={role}>
            {/* Two roles. "Teacher" and "Co-teacher" were never two standings
                — every instructor on a course holds equal permissions — so
                offering both invited a choice with no consequence. Rows stored
                as either read as Course handler. */}
            <option value="ta">SA</option>
            <option value="teacher">Course handler</option>
          </Select>
        </FieldRow>

        <fieldset className="m-0 border-0 p-0">
          <FieldLabel>SA permissions</FieldLabel>
          <div className="form-grid mt-2">
            {permissions.map((permission) => (
              <Choice
                key={permission.key}
                type="checkbox"
                name={`perm_${permission.key}`}
                defaultChecked={permission.granted}
              >
                {permissionLabels[permission.key]}
              </Choice>
            ))}
          </div>
        </fieldset>

        <div className="row">
          <SubmitButton variant="primary" pendingLabel="Saving…">
            Save permissions
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
