import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { platformAdminNav } from "@/components/layout/nav";
import { requirePlatformAdminSession, toShellPlatformAdmin } from "@/lib/session";
import { Breadcrumbs } from "@/components/ui";
import { Field, Select } from "@/components/ui/form";
import { IconChevron, IconSearch } from "@/components/ui/icons";
import { buttonClass } from "@/components/ui/button";
import { auditSentence, describeChanges, hasStudentActor } from "@/lib/audit-story";
import { auditActionLabel } from "@/lib/audit-labels";
import { AUDIT_CATEGORIES, auditCategoryForAction } from "@/modules/audit";
import { listPlatformAuditCourses, listPlatformAuditEvents, type AuditHistoryRow } from "@/modules/audit";

function hrefWith(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const encoded = query.toString();
  return encoded ? `/admin/audit?${encoded}` : "/admin/audit";
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" }).format(date);
}

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(date);
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; actor?: "staff" | "students" | "system"; course?: string; from?: string; to?: string; page?: string; event?: string }>;
}) {
  const admin = await requirePlatformAdminSession();
  const params = await searchParams;
  const filters = { search: params.q, category: params.category, actor: params.actor, courseId: params.course, from: params.from, to: params.to, page: params.page, pageSize: 25 };
  const [audit, courses] = await Promise.all([listPlatformAuditEvents(admin.id, filters), listPlatformAuditCourses(admin.id)]);
  const selected = params.event ? audit.rows.find((row) => row.event.id === params.event) : audit.rows[0];
  const base = { q: params.q, category: params.category, actor: params.actor, course: params.course, from: params.from, to: params.to };
  const courseCodes = new Map(courses.map((course) => [course.id, course.code]));

  return (
    <AppShell user={toShellPlatformAdmin(admin)} workspace="admin" navGroups={platformAdminNav("/admin/audit")} breadcrumbs={<Breadcrumbs items={[{ label: "Platform admin" }, { label: "Audit log" }]} />} title="Audit log" description="Review important activity across the platform.">
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
        <section className={`${selected ? "hidden lg:block" : ""} min-w-0`}>
          <form className="flex flex-wrap items-center gap-2" method="get" role="search">
            <label className="relative min-w-[220px] flex-1" htmlFor="audit-search"><span className="visually-hidden">Search activity</span><IconSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" size={17} /><Field className="pl-10" id="audit-search" name="q" placeholder="Search activity" defaultValue={params.q ?? ""} /></label>
            <Select aria-label="Event type" name="category" defaultValue={params.category ?? ""}><option value="">Event type</option>{AUDIT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</Select>
            <Select aria-label="Actor" name="actor" defaultValue={params.actor ?? ""}><option value="">Actor</option><option value="staff">Staff</option><option value="students">Students</option><option value="system">System</option></Select>
            <Select aria-label="Course" name="course" defaultValue={params.course ?? ""}><option value="">Course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code}</option>)}</Select>
            <Field aria-label="From" name="from" type="date" defaultValue={params.from ?? ""} />
            <Field aria-label="To" name="to" type="date" defaultValue={params.to ?? ""} />
            <button className={buttonClass({ variant: "secondary" })} type="submit">Filter</button>
          </form>

          <nav aria-label="Audit categories" className="mt-4 flex flex-wrap gap-5 border-b border-rule">
            <Link className={`border-b-2 px-1 py-3 text-ui-sm ${!params.category ? "border-accent font-semibold text-ink" : "border-transparent text-ink-muted"}`} href={hrefWith({ ...base, category: undefined, page: undefined })}>All</Link>
            {AUDIT_CATEGORIES.map((category) => <Link className={`border-b-2 px-1 py-3 text-ui-sm ${params.category === category ? "border-accent font-semibold text-ink" : "border-transparent text-ink-muted"}`} href={hrefWith({ ...base, category, page: undefined })} key={category}>{category}</Link>)}
          </nav>

          {audit.rows.length ? <AuditFeed rows={audit.rows} selectedId={selected?.event.id} base={base} courseCodes={courseCodes} /> : <p className="mt-6 text-ui-sm text-ink-muted">No activity matches these filters.</p>}
          <div className="mt-4 flex justify-between text-ui-sm text-ink-muted"><span>{audit.total} activities</span><span className="flex gap-2">{audit.hasPrevious && <Link className={buttonClass({ variant: "secondary", size: "small" })} href={hrefWith({ ...base, page: String(audit.page - 1) })}>Previous</Link>}{audit.hasNext && <Link className={buttonClass({ variant: "secondary", size: "small" })} href={hrefWith({ ...base, page: String(audit.page + 1) })}>Next</Link>}</span></div>
        </section>

        <aside className="rounded-panel border border-rule bg-paper p-5 lg:sticky lg:top-4 lg:self-start">{selected ? <><Link className="mb-4 inline-block text-ui-sm text-ink-muted underline lg:hidden" href={hrefWith(base)}>Back to audit log</Link><AuditDetail row={selected} courseCode={courses.find((course) => course.id === selected.event.courseId)?.code} /></> : <p className="m-0 text-ui-sm text-ink-muted">Select an activity to see its details.</p>}</aside>
      </div>
    </AppShell>
  );
}

function sentenceFor(row: AuditHistoryRow, courseCode?: string) {
  const sentence = auditSentence({ action: row.event.action, entityType: row.event.entityType, actorName: row.actor?.displayName ?? row.actorPlatformAdmin?.displayName ?? row.actorPlatformAdmin?.username ?? null, subject: row.subject });
  return courseCode && row.event.courseId ? `${sentence.slice(0, -1)} in ${courseCode}.` : sentence;
}

function AuditFeed({ rows, selectedId, base, courseCodes }: { rows: AuditHistoryRow[]; selectedId?: string; base: Record<string, string | undefined>; courseCodes: Map<string, string> }) {
  let lastDate = "";
  return <div className="mt-5 overflow-hidden rounded-panel border border-rule bg-paper">{rows.map((row) => { const date = dateLabel(row.event.createdAt); const heading = date !== lastDate; lastDate = date; return <div key={row.event.id}>{heading && <h2 className="border-b border-rule bg-paper-quiet px-4 py-3 font-document text-lg font-bold">{date}</h2>}<Link className={`block border-b border-rule px-4 py-3 last:border-0 hover:bg-paper-quiet ${selectedId === row.event.id ? "bg-accent-wash" : ""}`} href={hrefWith({ ...base, event: row.event.id })}><div className="flex items-start gap-3"><time className="w-16 shrink-0 pt-0.5 text-ui-sm text-ink-muted">{timeLabel(row.event.createdAt)}</time><div className="min-w-0"><p className="m-0 text-ui-sm font-semibold">{sentenceFor(row, row.event.courseId ? courseCodes.get(row.event.courseId) : undefined)}</p><p className="m-0 pt-1 text-ui-xs text-ink-muted">{auditCategoryForAction(row.event.action)} · {auditActionLabel(row.event.action)}</p></div><IconChevron aria-hidden="true" className="ml-auto shrink-0 text-ink-muted" size={16} /></div></Link></div>})}</div>;
}

function AuditDetail({ row, courseCode }: { row: AuditHistoryRow; courseCode?: string }) {
  const changes = describeChanges(row.event.before, row.event.after);
  return <div className="stack-4"><div><h2 className="m-0 font-document text-panel-title font-bold">Activity details</h2><p className="mt-2 text-ui-sm font-semibold">{sentenceFor(row, courseCode)}</p></div><dl className="grid gap-2 border-t border-rule pt-4 text-ui-sm"><div className="flex justify-between gap-4"><dt className="text-ink-muted">Actor</dt><dd className="m-0 text-right">{row.actor ? <span className="grid gap-0.5"><span>{row.actor.displayName}</span><span className="text-ui-xs text-ink-muted">{row.actor.email}</span></span> : row.actorPlatformAdmin ? <span className="grid gap-0.5"><span>{row.actorPlatformAdmin.displayName}</span><span className="text-ui-xs text-ink-muted">{row.actorPlatformAdmin.username}</span></span> : hasStudentActor(row.event.action) ? "A student" : "The system"}</dd></div><div className="flex justify-between gap-4"><dt className="text-ink-muted">Action</dt><dd className="m-0 text-right">{auditActionLabel(row.event.action)}</dd></div><div className="flex justify-between gap-4"><dt className="text-ink-muted">Course</dt><dd className="m-0 text-right">{courseCode ?? "—"}</dd></div><div className="flex justify-between gap-4"><dt className="text-ink-muted">Time</dt><dd className="m-0 text-right">{dateLabel(row.event.createdAt)} · {timeLabel(row.event.createdAt)}</dd></div></dl>{changes.length > 0 && <div className="border-t border-rule pt-4"><h3 className="m-0 font-document text-lg font-bold">Changes</h3><div className="mt-3 grid gap-3">{changes.map((change) => <div className="grid gap-1 text-ui-sm" key={change.field}><span className="font-semibold">{change.label}</span><div className="grid gap-1"><span className="rounded-control bg-paper-quiet px-2 py-1"><span className="mr-2 text-ui-xs font-semibold uppercase text-ink-muted">Before</span>{change.before ?? "not recorded"}</span><span className="rounded-control bg-accent-wash px-2 py-1"><span className="mr-2 text-ui-xs font-semibold uppercase text-accent-deep">After</span>{change.after ?? "not recorded"}</span></div></div>)}</div></div>}<details className="border-t border-rule pt-4"><summary className="cursor-pointer font-semibold">Technical details</summary><dl className="mt-3 grid gap-1 text-ui-xs text-ink-muted"><div>Event ID: {row.event.id}</div><div>Action: {row.event.action}</div><div>Entity: {row.event.entityType}</div>{row.event.entityId && <div>Entity ID: {row.event.entityId}</div>}{row.event.courseId && <div>Course ID: {row.event.courseId}</div>}{row.event.sectionId && <div>Section ID: {row.event.sectionId}</div>}</dl></details></div>;
}
