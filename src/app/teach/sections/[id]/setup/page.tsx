import { toShellUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { loadStaffSection } from "@/lib/staff-section";
import { formatDateTime } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionNav } from "@/components/layout/nav";
import {
  AccessDenied,
  Alert,
  Stamp,
  Breadcrumbs,
  CycleStateBadge,
  EmptyState,
} from "@/components/ui";
import { IconChevron } from "@/components/ui/icons";
import {
  assignSectionStaff,
  CatalogError,
  listSectionStaff,
  removeSectionStaff,
  updateSection,
} from "@/modules/catalog";
import {
  configureRecurrence,
  DAY_NAMES,
  deactivateSchedule,
  getActiveSchedule,
  listCyclesForSection,
  ScheduleError,
} from "@/modules/forms/schedules";
import { listTemplatesForSection } from "@/modules/forms/templates";
import { reopenCycle, skipCycle } from "@/modules/forms/cycles";
import {
  AuthzError,
  SECTION_PERMISSION_LABELS,
  SECTION_PERMISSIONS,
} from "@/modules/authz";

/**
 * Section setup: details, teaching staff and the TA permission catalog, the
 * weekly schedule, and cycle management.
 *
 * Staff assignment is rendered only for the course owner, and the service
 * refuses it for anyone else regardless of what is rendered.
 */
export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id: sectionId } = await params;
  const { error, ok } = await searchParams;
  const ctx = await loadStaffSection(sectionId);
  if (!ctx.ok) {
    return (
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={[]}
        title="Section setup"
      >
        <AccessDenied what="this section's settings" />
      </AppShell>
    );
  }
  const { user, access, section, course, can } = ctx;
  const isOwner = access.staff!.isCourseOwner;
  const canManageCycles = can("manageWeeklyCycles");

  const staff = await listSectionStaff(user.id, sectionId);
  const active = canManageCycles ? await getActiveSchedule(sectionId) : null;
  const cycles = canManageCycles
    ? await listCyclesForSection(user.id, sectionId)
    : [];
  const templates = canManageCycles
    ? await listTemplatesForSection(user.id, sectionId, course.id)
    : [];

  // --- server actions ------------------------------------------------------
  // NB: everything a "use server" closure captures is serialized, so these
  // actions may only close over plain values such as sectionId — never over a
  // helper function defined in this component.

  async function saveDetails(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await updateSection(uid, sectionId, {
        title: String(formData.get("title") ?? ""),
        term: String(formData.get("term") ?? ""),
      });
    } catch (err) {
      redirect(backTo(sectionId, describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/setup`);
    redirect(backTo(sectionId, "Section details saved."));
  }

  async function saveStaff(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const role = String(formData.get("role") ?? "ta") as
      "teacher" | "ta" | "co_teacher";
    const permissions = Object.fromEntries(
      SECTION_PERMISSIONS.map((p) => [p, formData.get(`perm_${p}`) === "on"]),
    );
    try {
      await assignSectionStaff(uid, sectionId, {
        email: String(formData.get("email") ?? ""),
        role,
        permissions,
      });
    } catch (err) {
      redirect(backTo(sectionId, describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/setup`);
    redirect(backTo(sectionId, "Teaching staff updated."));
  }

  async function dropStaff(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await removeSectionStaff(uid, sectionId, String(formData.get("staffId")));
    } catch (err) {
      redirect(backTo(sectionId, describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/setup`);
    redirect(backTo(sectionId, "Staff member removed from this section."));
  }

  async function saveSchedule(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    let generated = 0;
    try {
      const result = await configureRecurrence(uid, sectionId, {
        templateId: String(formData.get("templateId") ?? ""),
        openDayOfWeek: String(formData.get("openDayOfWeek") ?? "1"),
        openTime: String(formData.get("openTime") ?? ""),
        deadlineDayOfWeek: String(formData.get("deadlineDayOfWeek") ?? "0"),
        deadlineTime: String(formData.get("deadlineTime") ?? ""),
        startDate: String(formData.get("startDate") ?? ""),
        occurrenceCount:
          String(formData.get("occurrenceCount") ?? "") || undefined,
        endDate: String(formData.get("endDate") ?? "") || undefined,
      });
      generated = result.cyclesGenerated;
    } catch (err) {
      redirect(backTo(sectionId, describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/setup`);
    redirect(
      backTo(
        sectionId,
        `Schedule saved. ${generated} upcoming week${generated === 1 ? "" : "s"} generated.`,
      ),
    );
  }

  async function stopSchedule() {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    try {
      await deactivateSchedule(uid, sectionId);
    } catch (err) {
      redirect(backTo(sectionId, describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/setup`);
    redirect(
      backTo(sectionId, "Schedule stopped. Existing weeks are unchanged."),
    );
  }

  async function cycleAction(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const cycleId = String(formData.get("cycleId"));
    try {
      if (String(formData.get("intent")) === "reopen") {
        await reopenCycle(uid, cycleId);
      } else {
        await skipCycle(uid, cycleId);
      }
    } catch (err) {
      redirect(backTo(sectionId, describe(err), "error"));
    }
    revalidatePath(`/teach/sections/${sectionId}/setup`);
    redirect(backTo(sectionId, "Cycle updated."));
  }

  // --- render --------------------------------------------------------------

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={staffSectionNav(access, `/teach/sections/${sectionId}/setup`)}
      contextLabel={section.title}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/teach/courses", label: "My courses" },
            { label: course.code },
            { label: "Section setup" },
          ]}
        />
      }
      title="Section setup"
    >
      <div className="stack-4">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        {/* Ordered by how often a teacher actually comes here: the schedule and
            its weeks first, then the team, then renaming. The 14-checkbox staff
            form used to sit at the top fully expanded, pushing the schedule
            below the fold on a page nobody visits to assign a TA. */}
        {canManageCycles ? (
          <>
            <section className="notice">
              <div className="notice__head">
                <div>
                  <h2>Weekly schedule</h2>
                </div>
                {active ? (
                  <Stamp tone="green">Active</Stamp>
                ) : (
                  <Stamp tone="amber">Not scheduled</Stamp>
                )}
              </div>

              <div className="notice__body">
                {templates.length === 0 ? (
                  <EmptyState
                    title="This course has no form template yet"
                    action={{
                      href: `/teach/courses/${course.id}/templates`,
                      label: "Create a template",
                    }}
                  >
                    A weekly schedule needs a template to snapshot into each
                    cycle.
                  </EmptyState>
                ) : (
                  /* The populated form IS the current schedule, so the info
                     alert that used to restate all of it in prose is gone. */
                  <form action={saveSchedule} className="stack-4">
                    <div className="form-grid">
                      <div className="field-row">
                        <label htmlFor="templateId">Form template</label>
                        <select
                          id="templateId"
                          className="select-field"
                          name="templateId"
                          defaultValue={active?.schedule.templateId ?? ""}
                          required
                        >
                          <option value="">Choose a template…</option>
                          {templates.map(({ template, questionCount }) => (
                            <option key={template.id} value={template.id}>
                              {template.title} ({questionCount} question
                              {questionCount === 1 ? "" : "s"})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field-row">
                        <label htmlFor="startDate">First week starts</label>
                        <input
                          id="startDate"
                          className="field"
                          type="date"
                          name="startDate"
                          defaultValue={active?.schedule.startDate ?? ""}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-grid">
                      <div className="field-row">
                        <label htmlFor="openDayOfWeek">Opens on</label>
                        <select
                          id="openDayOfWeek"
                          className="select-field"
                          name="openDayOfWeek"
                          defaultValue={String(
                            active?.schedule.openDayOfWeek ?? 1,
                          )}
                        >
                          {DAY_NAMES.map((day, index) => (
                            <option key={day} value={index}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field-row">
                        <label htmlFor="openTime">Opens at</label>
                        <input
                          id="openTime"
                          className="field"
                          type="time"
                          name="openTime"
                          defaultValue={(
                            active?.schedule.openTime ?? "08:00:00"
                          ).slice(0, 5)}
                          required
                        />
                      </div>
                      <div className="field-row">
                        <label htmlFor="deadlineDayOfWeek">Closes on</label>
                        <select
                          id="deadlineDayOfWeek"
                          className="select-field"
                          name="deadlineDayOfWeek"
                          defaultValue={String(
                            active?.schedule.deadlineDayOfWeek ?? 0,
                          )}
                        >
                          {DAY_NAMES.map((day, index) => (
                            <option key={day} value={index}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field-row">
                        <label htmlFor="deadlineTime">Closes at</label>
                        <input
                          id="deadlineTime"
                          className="field"
                          type="time"
                          name="deadlineTime"
                          defaultValue={(
                            active?.schedule.deadlineTime ?? "23:59:00"
                          ).slice(0, 5)}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-grid">
                      <div className="field-row">
                        <label htmlFor="occurrenceCount">Number of weeks</label>
                        <input
                          id="occurrenceCount"
                          className="field"
                          type="number"
                          min={1}
                          max={60}
                          name="occurrenceCount"
                          defaultValue={active?.schedule.occurrenceCount ?? ""}
                        />
                        <span className="helper-text">
                          Leave blank to use an end date instead.
                        </span>
                      </div>
                      <div className="field-row">
                        <label htmlFor="endDate">Or run until</label>
                        <input
                          id="endDate"
                          className="field"
                          type="date"
                          name="endDate"
                          defaultValue={active?.schedule.endDate ?? ""}
                        />
                        <span className="helper-text">
                          Set one of these two, not both.
                        </span>
                      </div>
                    </div>
                    <div className="row">
                      <button className="button button--primary" type="submit">
                        {active ? "Replace schedule" : "Save schedule"}
                      </button>
                      {active && (
                        <span className="muted small">
                          Replacing retires the current schedule; weeks already
                          generated are kept.
                        </span>
                      )}
                    </div>
                  </form>
                )}
              </div>

              {active && (
                <div className="notice__foot">
                  <form action={stopSchedule} className="inline-form">
                    <button
                      className="button button--danger button--small"
                      type="submit"
                    >
                      Stop generating new weeks
                    </button>
                    <span className="muted small">
                      Existing weeks stay exactly as they are.
                    </span>
                  </form>
                </div>
              )}
            </section>

            <section className="notice">
              <div className="notice__head">
                <div>
                  <h2>Weekly cycles</h2>
                  <p>
                    Structural edits lock once the first response arrives, so
                    collected answers always match the questions asked.
                  </p>
                </div>
              </div>
              {cycles.length === 0 ? (
                <div className="notice__body">
                  <EmptyState title="No weeks generated yet">
                    Save a weekly schedule above and the coming weeks are
                    generated for you, opening and closing each one on time.
                  </EmptyState>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Week</th>
                        <th scope="col">State</th>
                        <th scope="col">Opens</th>
                        <th scope="col">Closes</th>
                        <th scope="col">Responses</th>
                        <th scope="col">Edit lock</th>
                        <th scope="col">
                          <span className="visually-hidden">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycles.map(
                        ({
                          cycle,
                          submissionCount,
                          validCount,
                          editLocked,
                        }) => (
                          <tr key={cycle.id}>
                            <th scope="row">Week {cycle.cycleIndex}</th>
                            <td>
                              <CycleStateBadge state={cycle.state} />
                            </td>
                            <td>
                              {formatDateTime(cycle.openAt, section.timezone)}
                            </td>
                            <td>
                              {formatDateTime(
                                cycle.deadlineAt,
                                section.timezone,
                              )}
                            </td>
                            <td>
                              {submissionCount}
                              {submissionCount !== validCount &&
                                ` (${validCount} valid)`}
                            </td>
                            <td>{editLocked ? "Locked" : "Open"}</td>
                            <td>
                              {cycle.state === "closed" && (
                                <form
                                  action={cycleAction}
                                  className="inline-form"
                                >
                                  <input
                                    type="hidden"
                                    name="cycleId"
                                    value={cycle.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="intent"
                                    value="reopen"
                                  />
                                  <button
                                    className="button button--secondary button--small"
                                    type="submit"
                                  >
                                    Reopen
                                  </button>
                                </form>
                              )}
                              {(cycle.state === "scheduled" ||
                                cycle.state === "draft") && (
                                <form
                                  action={cycleAction}
                                  className="inline-form"
                                >
                                  <input
                                    type="hidden"
                                    name="cycleId"
                                    value={cycle.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="intent"
                                    value="skip"
                                  />
                                  <button
                                    className="button button--quiet button--small"
                                    type="submit"
                                  >
                                    Skip
                                  </button>
                                </form>
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </>
        ) : (
          <Alert
            variant="info"
            title="Schedule and cycles are not available to you"
          >
            Managing weekly cycles needs the &ldquo;manage cycles and
            recurrence&rdquo; permission on this section.
          </Alert>
        )}

        <section className="notice">
          <div className="notice__head">
            <div>
              <h2>Teaching team</h2>
            </div>
          </div>
          <ul className="data-list">
            {staff.map(({ staff: row, user: account }) => (
              <li key={row.id}>
                <span className="data-list__main">
                  <strong>{account?.displayName ?? "Unknown account"}</strong>
                  <small>
                    {account?.email} · {row.role.replace("_", "-")}
                    {row.role === "ta" &&
                      ` · ${SECTION_PERMISSIONS.filter((p) => row[p]).length} of ${SECTION_PERMISSIONS.length} permissions`}
                  </small>
                </span>
                {isOwner && account?.id !== course.ownerUserId && (
                  <form action={dropStaff} className="inline-form">
                    <input type="hidden" name="staffId" value={row.id} />
                    <button
                      className="button button--danger button--small"
                      type="submit"
                    >
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>

          {/* Owner-only, and closed: fourteen permission checkboxes are the
              largest thing on this page and are set once a term. Whether the
              reader owns the course is now said by this control existing,
              rather than by a stamp in the panel header. */}
          {isOwner && (
            <details className="disclose disclose--inset">
              <summary>
                <IconChevron className="disclose__mark" size={15} />
                Add or change a staff member
              </summary>
              <div className="disclose__body">
                <form action={saveStaff} className="stack-4">
                  <div className="form-grid">
                    <div className="field-row">
                      <label htmlFor="staff-email">University email</label>
                      <input
                        id="staff-email"
                        className="field"
                        name="email"
                        type="email"
                        placeholder="assistant@up.edu.ph"
                        required
                        aria-describedby="staff-email-help"
                      />
                      <span className="helper-text" id="staff-email-help">
                        They must have signed in at least once.
                      </span>
                    </div>
                    <div className="field-row">
                      <label htmlFor="staff-role">Role</label>
                      <select
                        id="staff-role"
                        className="select-field"
                        name="role"
                        defaultValue="ta"
                      >
                        <option value="ta">Teaching assistant</option>
                        <option value="co_teacher">Co-teacher</option>
                        <option value="teacher">Teacher</option>
                      </select>
                    </div>
                  </div>
                  <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className="field-label">
                      Assistant permissions
                    </legend>
                    {/* Kept: this one warns about a real consequence — the
                        export carries student names and numbers. */}
                    <p
                      className="helper-text"
                      style={{ margin: "2px 0 var(--s3)" }}
                    >
                      Used only for a teaching assistant. Granting
                      &ldquo;export participation&rdquo; lets them download
                      files containing student names and numbers.
                    </p>
                    <div className="form-grid">
                      {SECTION_PERMISSIONS.map((permission) => (
                        <label className="choice" key={permission}>
                          <input type="checkbox" name={`perm_${permission}`} />
                          <span>{SECTION_PERMISSION_LABELS[permission]}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div>
                    <button className="button button--primary" type="submit">
                      Save teaching staff
                    </button>
                  </div>
                </form>
              </div>
            </details>
          )}
        </section>

        {/* Renaming happens once, if ever, so it no longer occupies a titled
            panel at the top of the page. */}
        <details className="disclose">
          <summary>
            <IconChevron className="disclose__mark" size={15} />
            Rename this section
          </summary>
          <div className="disclose__body">
            <form action={saveDetails} className="form-grid">
              <div className="field-row">
                <label htmlFor="section-title">Section name</label>
                <input
                  id="section-title"
                  className="field"
                  name="title"
                  defaultValue={section.title}
                  required
                />
              </div>
              <div className="field-row">
                <label htmlFor="section-term">Term</label>
                <input
                  id="section-term"
                  className="field"
                  name="term"
                  defaultValue={section.term}
                  required
                />
              </div>
              <button className="button button--primary" type="submit">
                Save
              </button>
            </form>
          </div>
        </details>
      </div>
    </AppShell>
  );
}

/**
 * Module scope on purpose: a server action serializes everything it closes
 * over, so it may not capture a helper defined inside the page component.
 */
function backTo(
  sectionId: string,
  message: string,
  kind: "ok" | "error" = "ok",
): string {
  return `/teach/sections/${sectionId}/setup?${kind}=${encodeURIComponent(message)}`;
}

function describe(err: unknown): string {
  if (
    err instanceof CatalogError ||
    err instanceof ScheduleError ||
    err instanceof AuthzError
  ) {
    return err.message;
  }
  if (err instanceof Error && err.name === "ZodError") {
    try {
      const issues = JSON.parse(err.message) as { message: string }[];
      return issues.map((i) => i.message).join(" ");
    } catch {
      return "Check the values you entered and try again.";
    }
  }
  if (err instanceof Error) return err.message;
  throw err;
}
