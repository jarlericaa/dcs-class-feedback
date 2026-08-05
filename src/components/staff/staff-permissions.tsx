"use client";

import { Dialog } from "@/components/ui/dialog";

/**
 * Editing one staff member's permissions.
 *
 * The only hint that permissions were changeable used to be the text
 * "2 of 14 permissions" in a row's metadata, which is not a control and does not
 * look like one. This is an explicit action, prefilled with what they currently
 * hold, kept separate from Remove.
 *
 * It posts to the SAME `assignSectionStaff` action the add form uses — that
 * service upserts by email and re-checks owner standing, so this adds no new
 * server surface and no new authorization path.
 */
export function EditStaffPermissions({
  action,
  email,
  displayName,
  role,
  permissions,
  permissionLabels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  email: string;
  displayName: string;
  role: string;
  /** permission key → whether they hold it now */
  permissions: { key: string; granted: boolean }[];
  permissionLabels: Record<string, string>;
}) {
  return (
    <Dialog
      className="button--small"
      label="Edit permissions"
      title={`Permissions for ${displayName}`}
      description="Used only for a student assistant."
    >
      <form action={action}>
        <input type="hidden" name="email" value={email} />

        <div className="field-row">
          <label htmlFor={`role-${email}`}>Role</label>
          <select
            id={`role-${email}`}
            className="select-field"
            name="role"
            defaultValue={role}
          >
            <option value="ta">Student assistant</option>
            <option value="co_teacher">Co-teacher</option>
            <option value="teacher">Teacher</option>
          </select>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">Student assistant permissions</legend>
          <div className="form-grid" style={{ marginTop: "var(--s2)" }}>
            {permissions.map((permission) => (
              <label className="choice" key={permission.key}>
                <input
                  type="checkbox"
                  name={`perm_${permission.key}`}
                  defaultChecked={permission.granted}
                />
                <span>{permissionLabels[permission.key]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="row">
          <button className="button button--primary" type="submit">
            Save permissions
          </button>
        </div>
      </form>
    </Dialog>
  );
}
