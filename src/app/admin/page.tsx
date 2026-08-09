import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";

import { AppShell } from "@/components/layout/app-shell";
import { primaryNavFor } from "@/lib/nav-context";
import { AccessDenied, Alert, Stamp, Breadcrumbs } from "@/components/ui";
import {
  CatalogError,
  listAccountsForAdmin,
  setTeacherRole,
} from "@/modules/catalog";
import { AuthzError } from "@/modules/authz";
import { requireUser, toShellUser } from "@/lib/session";

/**
 * Platform administration (Open D3, provisional: an admin grants the teacher
 * role and teachers self-serve courses from there).
 *
 * Being a platform admin grants NO access to any course, section, student or
 * submission. This page shows accounts and role flags only.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { q, ok, error } = await searchParams;

  if (!user.isPlatformAdmin) {
    return (
      <AppShell
        user={toShellUser(user)}
        workspace="home"
        navGroups={await primaryNavFor(user, "/admin")}
        title="Platform admin"
      >
        <AccessDenied what="platform administration" />
      </AppShell>
    );
  }

  const accounts = await listAccountsForAdmin(user.id, q);

  async function toggleTeacher(formData: FormData) {
    "use server";
    const uid = await currentUserId();
    if (!uid) redirect("/signin");
    const email = String(formData.get("email") ?? "");
    const grant = String(formData.get("grant")) === "yes";
    try {
      await setTeacherRole(uid, email, grant);
    } catch (err) {
      const message =
        err instanceof CatalogError || err instanceof AuthzError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not change the role";
      redirect(`/admin?error=${encodeURIComponent(message)}`);
    }
    revalidatePath("/admin");
    redirect(
      `/admin?ok=${encodeURIComponent(
        grant
          ? `${email} can now create courses.`
          : `Teacher role removed from ${email}.`,
      )}`,
    );
  }

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="admin"
      navGroups={await primaryNavFor(user, "/admin")}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { href: "/", label: "Overview" },
            { label: "Platform admin" },
          ]}
        />
      }
      title="Accounts"
    >
      <div className="stack-4">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        <form className="toolbar" method="get" role="search">
          <label className="visually-hidden" htmlFor="admin-q">
            Search accounts
          </label>
          <input
            id="admin-q"
            className="field"
            name="q"
            type="search"
            placeholder="Search by name or email"
            defaultValue={q ?? ""}
          />
          <button className="button button--secondary" type="submit">
            Search
          </button>
        </form>

        {/* The panel head used to repeat the page title and its own row count.
            The page title names the thing; the rows are the count. */}
        <section className="notice">
          <ul className="data-list">
            {accounts.map((account) => (
              <li key={account.id}>
                <span className="data-list__main">
                  <strong>{account.displayName}</strong>
                  <small>{account.email}</small>
                </span>
                <span className="row">
                  {account.isPlatformAdmin && (
                    <Stamp tone="neutral">Admin</Stamp>
                  )}
                  {/* Only a granted role is stamped. "Standard" was a badge
                      for the ABSENCE of one, on most rows, distinguishing
                      nothing. The button beside it already says which way the
                      change goes. */}
                  {account.isTeacher && <Stamp tone="green">Teacher</Stamp>}
                  {!account.active && <Stamp tone="red">Deactivated</Stamp>}
                  <form action={toggleTeacher} className="inline-form">
                    <input type="hidden" name="email" value={account.email} />
                    <input
                      type="hidden"
                      name="grant"
                      value={account.isTeacher ? "no" : "yes"}
                    />
                    <button
                      className={`button button--small ${
                        account.isTeacher
                          ? "button--quiet"
                          : "button--secondary"
                      }`}
                      type="submit"
                    >
                      {account.isTeacher
                        ? "Remove teacher role"
                        : "Make teacher"}
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
