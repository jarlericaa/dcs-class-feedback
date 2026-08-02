import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/auth";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { homeNav } from "@/components/layout/nav";
import { AccessDenied, Alert, Badge, Breadcrumbs } from "@/components/ui";
import { CatalogError, listAccountsForAdmin, setTeacherRole } from "@/modules/catalog";
import { AuthzError } from "@/modules/authz";

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
        user={user}
        workspace="home"
        navGroups={homeNav("/admin", {
          isTeacher: user.isTeacher,
          isPlatformAdmin: false,
        })}
        title="Platform administration"
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
        grant ? `${email} can now create courses.` : `Teacher role removed from ${email}.`,
      )}`,
    );
  }

  return (
    <AppShell
      user={user}
      workspace="admin"
      navGroups={homeNav("/admin", {
        isTeacher: user.isTeacher,
        isPlatformAdmin: true,
      })}
      breadcrumbs={
        <Breadcrumbs
          items={[{ href: "/", label: "Overview" }, { label: "Platform admin" }]}
        />
      }
      eyebrow="Platform administration"
      title="Accounts and roles"
      description="Grant the teacher role so someone can create their own courses and sections."
    >
      <div className="stack-gap">
        {ok && <Alert variant="success">{ok}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        <Alert variant="info" title="Administration is separate from teaching">
          Being a platform administrator gives you no access to any course,
          section, student, or submission. To see class content you must be
          added to that section&apos;s teaching team.
        </Alert>

        <form className="filter-bar" method="get" role="search">
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

        <section className="card">
          <div className="card__header">
            <div>
              <h2>Accounts</h2>
              <p>
                {accounts.length} account{accounts.length === 1 ? "" : "s"}. An
                account only exists after its owner has signed in once.
              </p>
            </div>
          </div>
          <ul className="data-list">
            {accounts.map((account) => (
              <li key={account.id}>
                <span className="data-list__main">
                  <strong>{account.displayName}</strong>
                  <small>
                    {account.email} · joined {formatDate(account.createdAt)}
                  </small>
                </span>
                <span className="row-gap">
                  {account.isPlatformAdmin && <Badge tone="neutral">Admin</Badge>}
                  {account.isTeacher ? (
                    <Badge tone="green">Teacher</Badge>
                  ) : (
                    <Badge tone="neutral">Standard</Badge>
                  )}
                  {!account.active && <Badge tone="red">Deactivated</Badge>}
                  <form action={toggleTeacher} className="inline-form">
                    <input type="hidden" name="email" value={account.email} />
                    <input
                      type="hidden"
                      name="grant"
                      value={account.isTeacher ? "no" : "yes"}
                    />
                    <button
                      className={`button button--small ${
                        account.isTeacher ? "button--quiet" : "button--secondary"
                      }`}
                      type="submit"
                    >
                      {account.isTeacher ? "Remove teacher role" : "Make teacher"}
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
