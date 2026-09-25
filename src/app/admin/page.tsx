import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { platformAdminNav } from "@/components/layout/nav";
import { requirePlatformAdminSession, toShellPlatformAdmin } from "@/lib/session";
import { Alert, Breadcrumbs, Stamp } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/form";
import { IconChevron, IconPlus, IconSearch } from "@/components/ui/icons";
import { buttonClass } from "@/components/ui/button";
import {
  getAccountForAdmin,
  listAccountsForAdmin,
  listPendingTeacherAccess,
  type AdminAccountRow,
  type AdminAccountsPage,
} from "@/modules/catalog";
import { grantTeacherAction, revokeTeacherAction, accountStatusAction, startImpersonationAction } from "@/app/admin/actions";

function roleLabel(account: AdminAccountRow) {
  if (account.isPlatformAdmin) return "Admin";
  if (account.isTeacher) return "Teacher";
  if (account.isStudentAssistant) return "Student assistant";
  if (account.isStudent) return "Student";
  return "—";
}

function roleTone(account: AdminAccountRow): "green" | "amber" | "neutral" | "red" {
  if (!account.active) return "red";
  if (account.isPlatformAdmin) return "red";
  if (account.isTeacher) return "green";
  if (account.isStudentAssistant) return "amber";
  return "neutral";
}

function hrefWith(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const encoded = query.toString();
  return encoded ? `/admin?${encoded}` : "/admin";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; page?: string; account?: string; ok?: string; error?: string }>;
}) {
  const admin = await requirePlatformAdminSession();
  const params = await searchParams;

  const role = ["all", "student", "teacher", "assistant", "admin", "deactivated"].includes(params.role ?? "")
    ? (params.role as "all" | "student" | "teacher" | "assistant" | "admin" | "deactivated")
    : "all";
  const result = await listAccountsForAdmin(admin.id, { search: params.q, role, page: params.page, pageSize: 10 });
  const page = result as AdminAccountsPage;
  const selected = params.account ? await getAccountForAdmin(admin.id, params.account) : null;
  const pending = role === "teacher" || role === "all" ? await listPendingTeacherAccess(admin.id) : [];
  const currentQuery = { q: params.q, role: role === "all" ? undefined : role };

  return (
    <AppShell
      user={toShellPlatformAdmin(admin)}
      workspace="admin"
      navGroups={platformAdminNav("/admin")}
      breadcrumbs={<Breadcrumbs items={[{ label: "Platform admin" }, { label: "Accounts" }]} />}
      title="Accounts"
      description="Manage user accounts, roles, and access."
    >
      <div className="stack-4">
        {params.ok && <Alert variant="success">{params.ok}</Alert>}
        {params.error && <Alert variant="error">{params.error}</Alert>}

        <div className="flex flex-wrap items-center gap-3">
          <form className="relative min-w-[min(100%,420px)] flex-1" method="get" role="search">
            <label className="visually-hidden" htmlFor="admin-search">Search by name or identity</label>
            <IconSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" size={17} />
            <Field id="admin-search" name="q" type="search" placeholder="Search by name or identity" defaultValue={params.q ?? ""} className="pl-10" />
            {role !== "all" && <input type="hidden" name="role" value={role} />}
          </form>
          <Dialog label="Filters" title="Filter accounts" description="Narrow the account list by role." variant="secondary" cancelLabel="Cancel" footer={<button className={buttonClass({ variant: "primary" })} form="account-filters" type="submit">Apply filters</button>}>
            <form action="/admin" id="account-filters" method="get">
              <label className="field-label" htmlFor="account-role-filter">Role</label>
              <Select id="account-role-filter" name="role" defaultValue={role} data-autofocus>
                <option value="all">All accounts</option><option value="student">Students</option><option value="teacher">Teachers</option><option value="assistant">Student assistants</option><option value="admin">Admins</option><option value="deactivated">Deactivated</option>
              </Select>
              {params.q && <input type="hidden" name="q" value={params.q} />}
            </form>
          </Dialog>
          <Dialog
            label={<><IconPlus aria-hidden="true" size={16} /> Add teacher</>}
            title="Add teacher access"
            description="Use university email addresses. People who have not signed in yet will receive the role on their first sign-in."
            variant="primary"
            cancelLabel="Cancel"
            footer={<button className={buttonClass({ variant: "primary" })} form="add-teacher-form" type="submit">Grant teacher access</button>}
          >
            <form action={grantTeacherAction} id="add-teacher-form">
              <label className="field-label" htmlFor="teacher-emails">Email addresses</label>
              <textarea className="field min-h-28" id="teacher-emails" name="emails" placeholder="teacher@up.edu.ph" required data-autofocus />
              <p className="field-help">Separate multiple addresses with commas, semicolons, or new lines.</p>
            </form>
          </Dialog>
        </div>

        <nav aria-label="Account filters" className="flex flex-wrap gap-5 border-b border-rule">
          {([
            ["all", "All"],
            ["student", "Students"],
            ["teacher", "Teachers"],
            ["assistant", "Student assistants"],
            ["admin", "Admins"],
            ["deactivated", "Deactivated"],
          ] as const).map(([key, label]) => (
            <Link className={`border-b-2 px-1 py-3 text-ui-sm ${role === key ? "border-accent font-semibold text-ink" : "border-transparent text-ink-muted hover:text-ink"}`} href={hrefWith({ ...currentQuery, role: key === "all" ? undefined : key, page: undefined, account: undefined })} key={key}>
              {label} <span className="text-ink-faint">{page.counts[key]}</span>
            </Link>
          ))}
        </nav>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <section className={`${selected ? "hidden lg:block" : ""} overflow-hidden rounded-panel border border-rule bg-paper`} aria-label="Accounts list">
            <div className="grid grid-cols-[minmax(150px,1.2fr)_minmax(180px,1.4fr)_minmax(110px,.8fr)_110px_24px] gap-3 border-b border-rule bg-paper-quiet px-4 py-3 text-strip font-bold uppercase text-ink-muted">
              <span>Name</span><span>Identity</span><span>Role</span><span>Status</span><span />
            </div>
            {page.rows.length ? page.rows.map((account) => (
              <Link className={`grid grid-cols-[minmax(150px,1.2fr)_minmax(180px,1.4fr)_minmax(110px,.8fr)_110px_24px] items-center gap-3 border-b border-rule px-4 py-3 text-ui-sm last:border-0 hover:bg-paper-quiet ${selected?.id === account.id ? "bg-accent-wash" : ""}`} href={hrefWith({ ...currentQuery, page: String(page.page), account: account.id })} key={account.id}>
                <span className="min-w-0 truncate font-semibold">{account.displayName}</span>
                <span className="min-w-0 truncate text-ink-muted">{account.email ?? account.username}</span>
                <span><Stamp tone={roleTone(account)}>{roleLabel(account)}</Stamp></span>
                <span className="text-ink-muted">{account.active ? "Active" : "Deactivated"}</span>
                <IconChevron aria-hidden="true" className="text-ink-muted" size={16} />
              </Link>
            )) : <p className="p-6 text-ui-sm text-ink-muted">No accounts match these filters.</p>}
            <div className="flex items-center justify-between border-t border-rule px-4 py-3 text-ui-sm text-ink-muted">
              <span>Showing {page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1}–{Math.min(page.page * page.pageSize, page.total)} of {page.total} accounts</span>
              <div className="flex gap-2">
                {page.hasPrevious && <Link className={buttonClass({ variant: "secondary", size: "small" })} href={hrefWith({ ...currentQuery, page: String(page.page - 1), account: params.account })}>Previous</Link>}
                {page.hasNext && <Link className={buttonClass({ variant: "secondary", size: "small" })} href={hrefWith({ ...currentQuery, page: String(page.page + 1), account: params.account })}>Next</Link>}
              </div>
            </div>
          </section>

          <aside className="rounded-panel border border-rule bg-paper p-5 lg:sticky lg:top-4 lg:self-start">
            {selected ? <><Link className="mb-4 inline-block text-ui-sm text-ink-muted underline lg:hidden" href={hrefWith({ ...currentQuery, page: String(page.page) })}>Back to accounts</Link><AccountDetail account={selected} /></> : <p className="m-0 text-ui-sm text-ink-muted">Select an account to see its admin actions.</p>}
          </aside>
        </div>

        {pending.length > 0 && (
          <section className="border-t border-rule pt-5">
            <h2 className="panel-title">Pending first sign-in</h2>
            <p className="mt-1 text-ui-sm text-ink-muted">These email grants will apply when the person signs in.</p>
            <ul className="mt-3 grid gap-2 text-ui-sm">
              {pending.filter((grant) => !page.rows.some((row) => row.email === grant.email)).map((grant) => <li className="flex items-center justify-between gap-3 border-b border-rule py-2" key={grant.id}><span>{grant.email}</span><form action={revokeTeacherAction}><input type="hidden" name="email" value={grant.email} /><button className="text-ui-sm font-semibold text-red-deep underline underline-offset-2" type="submit">Revoke</button></form></li>)}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function AccountDetail({ account }: { account: AdminAccountRow }) {
  return (
    <div className="stack-4">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-paper-quiet text-panel-title font-bold">{account.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
        <div className="min-w-0"><h2 className="m-0 truncate font-document text-panel-title font-bold">{account.displayName}</h2><p className="m-0 truncate text-ui-sm text-ink-muted">{account.email ?? account.username}</p></div>
      </div>
      <Stamp tone={roleTone(account)}>{roleLabel(account)}</Stamp>
      {account.isTeacher && account.isStudentAssistant && <Alert variant="warning">Legacy role conflict detected. New assignments are blocked until the Student Assistant assignments are removed.</Alert>}
      <div className="border-t border-rule pt-4">
        <h3 className="m-0 font-document text-lg font-bold">Admin actions</h3>
        <div className="mt-3 grid gap-2">
          {!account.isPlatformAdmin && <Dialog label="Impersonate account" title={`Impersonate ${account.displayName}`} description="This opens a read-only support session. All changes are blocked until you stop impersonating." variant="secondary" cancelLabel="Cancel" footer={<button className={buttonClass({ variant: "primary" })} form={`impersonate-${account.id}`} type="submit">Start session</button>}><form action={startImpersonationAction} id={`impersonate-${account.id}`}><input type="hidden" name="userId" value={account.id} /><label className="field-label" htmlFor={`reason-${account.id}`}>Reason</label><textarea className="field min-h-24" id={`reason-${account.id}`} name="reason" placeholder="Support investigation" required data-autofocus /></form></Dialog>}
          {!account.isPlatformAdmin && <form action={accountStatusAction}><input type="hidden" name="userId" value={account.id} /><input type="hidden" name="active" value={String(!account.active)} /><button className={buttonClass({ variant: account.active ? "danger" : "secondary" })} type="submit">{account.active ? "Deactivate account" : "Reactivate account"}</button></form>}
        </div>
      </div>
    </div>
  );
}
