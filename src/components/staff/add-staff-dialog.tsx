"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { IconPlus } from "@/components/ui/icons";
import {
  staffBatchProblemLabel,
  staffGrantSummary,
  staffScopeSentence,
} from "@/lib/staff-batch-labels";

/**
 * Adding staff: one dialog, one permission set, however many people.
 *
 * It replaced a fourteen-checkbox form that sat permanently expanded in a
 * section's setup page and could only ever add one person to that one section.
 * A lab instructor teaching three of eight class lists meant opening three
 * pages and repeating the same fourteen choices three times.
 *
 * The shape follows the model ADR-0004 settled, and the two scopes are a
 * deliberate first choice rather than a detail below the fold:
 *
 * - COURSE-WIDE is instructor standing on every section, including sections
 *   that do not exist yet. There is nothing for a permission flag to narrow, so
 *   the permission list is not shown and a student assistant cannot be granted
 *   it at all. The service refuses that combination independently.
 * - PER CLASS LIST is the narrow grant, with the permission catalogue attached,
 *   and it is where a student assistant belongs.
 *
 * `fixedSection` pins the dialog to one class list and drops the scope choice.
 * No page passes it today — the section setup page that did is gone, and staff
 * are assigned from the course's Teaching team, where every scope is visible
 * in one table. It is kept because the constraint it encodes still holds: a
 * grant made from inside one section must read as a grant to THAT section, so
 * any future single-section entry point needs this and not the scope picker.
 *
 * Every field is controlled, which is not incidental: React resets an
 * uncontrolled form when its action completes, and a refused paste of twenty
 * addresses must not be wiped by the refusal that named the one typo in it.
 *
 * This component decides nothing. It reads what was chosen, posts it, and shows
 * what came back; the owner check, the address validation, the atomic refusal
 * and the audit all live in the service.
 */

export interface AddStaffSection {
  id: string;
  title: string;
}

/** One address (or one part of the request) the service refused, by code. */
export interface AddStaffProblem {
  email: string;
  reason: string;
}

export interface AddStaffState {
  status: "idle" | "done" | "error";
  /** a whole-request refusal — no addresses were even considered */
  message?: string;
  /** per-address refusals; the grant applied to nobody */
  problems?: AddStaffProblem[];
  /** what a successful grant did */
  result?: {
    added: number;
    updated: number;
    unchanged: number;
    /** the class lists written to; empty for a course-wide grant */
    sectionTitles: string[];
  };
}

export const ADD_STAFF_INITIAL: AddStaffState = { status: "idle" };

type Scope = "course" | "sections";

/**
 * Two roles, and only two. "Co-teacher" was a third name over the same
 * standing as Teacher — roles-and-permissions.md gives every instructor on a
 * course equal permissions — so offering it as a third option asked the reader
 * to make a choice that decided nothing. Existing `co_teacher` rows keep
 * working and read as Teacher wherever they are shown.
 */
const SECTION_ROLES = [
  { value: "ta", label: "SA" },
  { value: "teacher", label: "Teacher" },
] as const;

/** Course-wide standing is Instructor-only (ADR-0004): no assistant, no flags. */
const COURSE_ROLES = [{ value: "teacher", label: "Teacher" }] as const;

export function AddStaffDialog({
  action,
  sections = [],
  fixedSection,
  permissions,
  permissionLabels,
}: {
  action: (
    state: AddStaffState,
    formData: FormData,
  ) => Promise<AddStaffState>;
  /** the course's class lists, for the per-class-list scope */
  sections?: AddStaffSection[];
  /**
   * Locks the grant to ONE class list and drops the scope choice with it.
   * Supersedes `sections`, which a caller in this mode has no reason to pass.
   */
  fixedSection?: AddStaffSection;
  /** the permission catalogue, in its canonical order */
  permissions: readonly string[];
  permissionLabels: Record<string, string>;
}) {
  return (
    <Dialog
      variant="primary"
      label={
        <>
          {/* Matches the other page-header actions, which are all "icon + verb". */}
          <IconPlus size={15} />
          Add staff
        </>
      }
      title="Add teaching staff"
      description="They must have signed in at least once — this never creates an account."
    >
      <AddStaffForm
        action={action}
        sections={sections}
        fixedSection={fixedSection}
        permissions={permissions}
        permissionLabels={permissionLabels}
      />
    </Dialog>
  );
}

/**
 * Separate from the trigger on purpose: `Dialog` renders its children only
 * while open, so every piece of state below is created when the dialog opens
 * and discarded when it closes. A dialog that reopened holding the previous
 * attempt's addresses and its stale refusal would be worse than one that
 * reopens empty.
 */
function AddStaffForm({
  action,
  sections,
  fixedSection,
  permissions,
  permissionLabels,
}: {
  action: (
    state: AddStaffState,
    formData: FormData,
  ) => Promise<AddStaffState>;
  sections: AddStaffSection[];
  fixedSection?: AddStaffSection;
  permissions: readonly string[];
  permissionLabels: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    ADD_STAFF_INITIAL,
  );
  const [emails, setEmails] = useState("");
  // Course-wide leads because it is the answer to "a co-teacher for CS 33",
  // which is the common case. A course with no class lists yet has only that.
  const [pickedScope, setPickedScope] = useState<Scope>("course");
  // A locked scope is not a choice this component gets to hold state about.
  const scope: Scope = fixedSection ? "sections" : pickedScope;
  // One class list's own page is where an assistant is delegated; the course's
  // page is where an instructor is added. Each opens on its own common case.
  const [role, setRole] = useState<string>(fixedSection ? "ta" : "teacher");
  const [chosen, setChosen] = useState<string[]>([]);
  const [granted, setGranted] = useState<string[]>([]);

  // A successful grant clears the addresses, so the next paste starts from
  // empty rather than silently re-submitting the list that just succeeded.
  // The choices stay: adding three assistants to the same class list one after
  // another should not mean re-picking the class list three times.
  useEffect(() => {
    if (state.status === "done") setEmails("");
  }, [state]);

  const roles = scope === "course" ? COURSE_ROLES : SECTION_ROLES;
  // Switching to course-wide with "SA" selected would post a
  // combination the service refuses. Correct it here rather than letting the
  // reader submit a form that cannot succeed.
  const effectiveRole = roles.some((option) => option.value === role)
    ? role
    : "teacher";
  const showPermissions = scope === "sections" && effectiveRole === "ta";
  const noSections = sections.length === 0;

  const toggle = (
    list: string[],
    setList: (next: string[]) => void,
    value: string,
  ) =>
    setList(
      list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value],
    );

  return (
    <form action={formAction}>
      {state.status === "done" && state.result && (
        <Alert variant="success" title="Access granted">
          {staffGrantSummary(state.result)}.{" "}
          {staffScopeSentence(state.result.sectionTitles)}
        </Alert>
      )}
      {state.status === "error" && state.message && (
        <Alert variant="error">{state.message}</Alert>
      )}
      {state.status === "error" && (state.problems?.length ?? 0) > 0 && (
        <Alert variant="error" title="Nobody was added">
          {/* All-or-nothing: the service refuses the whole request, so this
              lists every reason at once rather than one per attempt. */}
          <ul>
            {state.problems!.map((problem, index) => (
              <li key={`${problem.email}-${problem.reason}-${index}`}>
                {problem.email ? <strong>{problem.email}</strong> : null}
                {problem.email ? " — " : null}
                {staffBatchProblemLabel(problem.reason)}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="field-row">
        <label htmlFor="add-staff-emails">University emails</label>
        <textarea
          id="add-staff-emails"
          className="field"
          name="emails"
          rows={3}
          required
          value={emails}
          onChange={(event) => setEmails(event.target.value)}
          placeholder="assistant@up.edu.ph, lecturer@up.edu.ph"
          aria-describedby="add-staff-emails-help"
        />
        <span className="helper-text" id="add-staff-emails-help">
          One or more, separated by commas, semicolons, spaces or new lines. Up
          to 50 at a time. Everyone listed gets the same access, and if one
          address cannot be added nobody is.
        </span>
      </div>

      {fixedSection ? (
        /* Stated, not chosen — but still stated. On this page there is only one
           answer, and a grant whose reach is left implied is how a reader ends
           up believing they granted something narrower than they did. The field
           order matches the other mode so the two do not read as two forms. */
        <div className="field-row">
          <span className="field-label">What they can reach</span>
          <span>Only {fixedSection.title}</span>
          <span className="helper-text">
            Access to every section of this course is granted on the
            course&rsquo;s own Teaching team page, where such a grant can also
            be seen and undone.
          </span>
        </div>
      ) : (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">What they can reach</legend>
          <div className="stack-2" style={{ marginTop: "var(--s2)" }}>
            <label className="choice">
              <input
                type="radio"
                name="scope"
                value="course"
                checked={scope === "course"}
                onChange={() => setPickedScope("course")}
              />
              <span>Every section of this course</span>
            </label>
            <label className="choice">
              <input
                type="radio"
                name="scope"
                value="sections"
                checked={scope === "sections"}
                onChange={() => setPickedScope("sections")}
                disabled={noSections}
              />
              <span>Only the class lists I choose</span>
            </label>
          </div>
          {/* One line, outside the labels: a choice row is a single line by
              design, and a paragraph is not valid inside a label anyway. */}
          <span className="helper-text">
            {scope === "course"
              ? "Course-wide access covers sections added later, which is the difference between the two. It cannot be narrowed."
              : noSections
                ? "This course has no class lists yet, so there is nothing narrower to choose."
                : "A narrower grant, on the class lists you tick. This is where a student assistant belongs."}
          </span>
        </fieldset>
      )}

      {scope === "sections" && !fixedSection && !noSections && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">Class lists</legend>
          <div className="form-grid" style={{ marginTop: "var(--s2)" }}>
            {sections.map((section) => (
              <label className="choice" key={section.id}>
                <input
                  type="checkbox"
                  name="sectionIds"
                  value={section.id}
                  checked={chosen.includes(section.id)}
                  onChange={() => toggle(chosen, setChosen, section.id)}
                />
                <span>{section.title}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="field-row">
        <label htmlFor="add-staff-role">Role</label>
        <select
          id="add-staff-role"
          className="select-field"
          name="role"
          value={effectiveRole}
          onChange={(event) => setRole(event.target.value)}
        >
          {roles.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="helper-text">
          {scope === "course"
            ? "A course-wide grant is always full instructor access, so there is no student assistant here."
            : fixedSection
              ? "A teacher or co-teacher holds every capability on this class list."
              : "A teacher or co-teacher holds every capability on the class lists you choose."}
        </span>
      </div>

      {showPermissions && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">
            SA permissions
          </legend>
          <div className="form-grid" style={{ marginTop: "var(--s2)" }}>
            {permissions.map((permission) => (
              <label className="choice" key={permission}>
                <input
                  type="checkbox"
                  name={`perm_${permission}`}
                  checked={granted.includes(permission)}
                  onChange={() => toggle(granted, setGranted, permission)}
                />
                <span>{permissionLabels[permission]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="row">
        <button
          className="button button--primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "Adding…" : "Grant access"}
        </button>
      </div>
    </form>
  );
}
