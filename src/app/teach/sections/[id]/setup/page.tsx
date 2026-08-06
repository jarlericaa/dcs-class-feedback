import Link from "next/link";
import { toShellUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { loadStaffSection } from "@/lib/staff-section";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionNav } from "@/components/layout/nav";
import {
  AccessDenied,
  Alert,
  Breadcrumbs,
  MetaList,
} from "@/components/ui";

/** The domain's role names, in the product's sentence case. */
const ROLE_LABELS: Record<string, string> = {
  teacher: "Teacher",
  co_teacher: "Co-teacher",
  ta: "Student assistant",
};
import { IconChevron } from "@/components/ui/icons";
import { Dialog } from "@/components/ui/dialog";
import { EditStaffPermissions } from "@/components/staff/staff-permissions";
import { TermFields } from "@/components/ui/term-fields";
import {
  assignSectionStaff,
  CatalogError,
  listSectionStaff,
  removeSectionStaff,
  updateSection,
} from "@/modules/catalog";
import { ScheduleError } from "@/modules/forms/schedules";
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
  const { user, access, section, course } = ctx;
  const isOwner = access.staff!.isCourseOwner;

  const staff = await listSectionStaff(user.id, sectionId);

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
        {/* Delivery is a property of the FORM now, not of the section: one
            schedule can serve several sections, and a teacher configuring a
            weekly form should not have to repeat it per class list. What is left
            here is what genuinely belongs to a section — who runs it, and its own
            details. */}
        <Alert variant="info" title="Forms are set up on the course">
          Which forms this section receives, when they open, and what they ask
          are set on the form itself.{" "}
          <Link className="link" href={`/teach/courses/${course.id}`}>
            Open {course.code}
          </Link>
          .
        </Alert>

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
                  <MetaList
                    items={[
                      account?.email,
                      ROLE_LABELS[row.role] ?? row.role.replace("_", " "),
                    ]}
                  />
                </span>
                {isOwner && account?.id !== course.ownerUserId && (
                  <span className="row">
                    {/* An explicit control, prefilled. The row's
                        "N of 14 permissions" text was the only hint before, and
                        it was not clickable. */}
                    {account?.email && (
                      <EditStaffPermissions
                        action={saveStaff}
                        email={account.email}
                        displayName={account.displayName}
                        role={row.role}
                        permissions={SECTION_PERMISSIONS.map((p) => ({
                          key: p,
                          granted: !!row[p],
                        }))}
                        permissionLabels={SECTION_PERMISSION_LABELS}
                      />
                    )}
                    <Dialog
                      variant="danger"
                      className="button--small"
                      label="Remove"
                      title={`Remove ${account?.displayName ?? "this person"} from this section?`}
                      description="They lose access to this section. Nothing they already did is deleted."
                    >
                      <form action={dropStaff}>
                        <input type="hidden" name="staffId" value={row.id} />
                        <div className="row">
                          <button
                            className="button button--danger"
                            type="submit"
                          >
                            Remove from this section
                          </button>
                        </div>
                      </form>
                    </Dialog>
                  </span>
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
                        <option value="ta">Student assistant</option>
                        <option value="co_teacher">Co-teacher</option>
                        <option value="teacher">Teacher</option>
                      </select>
                    </div>
                  </div>
                  <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className="field-label">
                      Student assistant permissions
                    </legend>
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

        {/* Name, term and timezone: the section's own details, changed rarely,
            so they no longer occupy a titled panel at the top of the page. The
            timezone lives here rather than in the course list's scan line. */}
        <details className="disclose">
          <summary>
            <IconChevron className="disclose__mark" size={15} />
            Section details
          </summary>
          <div className="disclose__body">
            <form action={saveDetails} className="stack-4">
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
              <TermFields defaultTerm={section.term} />
              <div>
                <button className="button button--primary" type="submit">
                  Save
                </button>
              </div>
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
