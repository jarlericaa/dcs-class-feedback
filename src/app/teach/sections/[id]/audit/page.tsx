import Link from "next/link";
import { loadStaffSection, sectionLabel } from "@/lib/staff-section";
import { formatDateTime } from "@/lib/datetime";
import { AppShell } from "@/components/layout/app-shell";
import { staffSectionTabGroups } from "@/components/layout/nav";
import { primaryNavFor } from "@/lib/nav-context";
import {
  AccessDenied,
  EmptyState,
  MetaList,
  Pagination,
} from "@/components/ui";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { auditActionLabel } from "@/lib/audit-labels";
import {
  auditEntityNoun,
  auditSentence,
  describeChanges,
  TEACHER_FACING_ACTIONS,
} from "@/lib/audit-story";
import {
  AUDIT_ACTIONS,
  listSectionAuditActors,
  listSectionAuditEvents,
  type AuditHistoryRow,
} from "@/modules/audit";
import { toShellUser } from "@/lib/session";
import { buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/form";

/**
 * Audit history for one section, written for the person who opens it.
 *
 * It used to print an internal action code beside a `<pre>` of raw jsonb, which
 * left "what happened?" and "does this matter?" both unanswerable (GitHub issue
 * #16). Now every entry is one sentence — who, what they did, and to what — the
 * payload is a named-field before → after list, and the raw shape waits behind
 * a disclosure for the rare reader who needs it.
 *
 * What it withholds by default is the platform talking to itself: cycle
 * generation, response locking, email delivery, read-state bookkeeping. That is
 * an explicit allowlist in `audit-story.ts`, applied in SQL, and "Everything,
 * including system records" is one choice away — the log is append-only and
 * nothing here is unreachable.
 *
 * Privacy, unchanged and load-bearing:
 *
 * - Non-delegable. `listSectionAuditEvents` requires non-TA section standing —
 *   there is no `view_audit_history` flag in the MVP catalog — and an archived
 *   course stays readable, because reading a closed term is a read.
 * - Scoped to this section, including rows written before the audit table had a
 *   section column, which are reached by the entity-id fan-out.
 * - **No student is ever named.** The subject of a sentence is resolved only
 *   for course-shaped entities (a public question, a class list, a form, an
 *   occurrence); every student-shaped entity resolves to a noun instead.
 * - Never student-visible (Risk R6), and nothing here renders markup: every
 *   value is plain text in a JSX text node.
 */
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    action?: string;
    actor?: string;
    from?: string;
    to?: string;
    scope?: string;
    page?: string;
  }>;
}) {
  const { id: sectionId } = await params;
  const path = `/teach/sections/${sectionId}/audit`;
  const sp = await searchParams;
  const ctx = await loadStaffSection(sectionId);
  if (!ctx.ok || ctx.access.staff?.role === "ta") {
    return (
      <AppShell
        user={toShellUser(ctx.user)}
        workspace="staff"
        navGroups={await primaryNavFor(ctx.user, path)}
        title="Audit history"
      >
        <AccessDenied what="this section's audit history" />
      </AppShell>
    );
  }
  const { user, access, section, course } = ctx;

  const scope = sp.scope === "all" ? "all" : "teacher";
  const filter = {
    action: sp.action || undefined,
    actor: sp.actor || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
    scope,
    page: sp.page,
  } as const;

  const [events, actors] = await Promise.all([
    listSectionAuditEvents(user.id, sectionId, filter),
    // Scoped like the list, so the control cannot offer a choice that yields an
    // empty page — and it never lists a student by name.
    listSectionAuditActors(user.id, sectionId, { scope }),
  ]);

  /**
   * The action options come from the SET this scope can show, not from the
   * visible page.
   *
   * Offering only what page 1 happens to contain made the control unable to
   * find anything that was not already in front of the reader — which is the
   * one thing a filter is for. And the set has to follow the scope: under
   * "Everything, including system records" the list shows rows the allowlist
   * withholds, so a control built only from the allowlist advertised records it
   * could not then select. The service refuses a withheld action inside the
   * default scope, so the two agree in both directions.
   *
   * Sorted by the words a reader sees rather than by the code behind them.
   */
  const actionOptions = [
    ...(scope === "all" ? AUDIT_ACTIONS : TEACHER_FACING_ACTIONS),
  ]
    .map((code) => ({ code, label: auditActionLabel(code) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Carried on every link and page control, so a filtered view is shareable
  // and survives paging.
  const linkParams = {
    action: filter.action,
    actor: filter.actor,
    from: filter.from,
    to: filter.to,
    scope: scope === "all" ? "all" : undefined,
  };
  const isFiltered = !!(
    filter.action ||
    filter.actor ||
    filter.from ||
    filter.to
  );

  return (
    <AppShell
      user={toShellUser(user)}
      workspace="staff"
      navGroups={await primaryNavFor(user, path, {
        /* A section is reached through its course, and the course now has its
           own rail row — so mark that one rather than the courses index. */
        fallbackHref: `/teach/courses/${course.id}`,
      })}
      tabGroups={staffSectionTabGroups(access, path)}
      tabsLabel={sectionLabel(course.code, section.title)}
      tabsMode="menu"
      contextLabel={sectionLabel(course.code, section.title)}
      crumbs={[
        { href: "/teach/courses", label: "My courses" },
        { href: `/teach/courses/${course.id}`, label: course.code },
        { href: `/teach/sections/${section.id}`, label: section.title },
      ]}
      title={sectionLabel(course.code, section.title)}
    >
      <div className="stack-4">
        {/* Choosing applies. Every control is in one GET form, so the whole
            filter is one URL and one server round trip. */}
        <form className="toolbar" method="get" action={path}>
          <AutoSubmitSelect
            id="audit-action"
            name="action"
            label="Show which action"
            defaultValue={filter.action ?? ""}
          >
            <option value="">Every action</option>
            {actionOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </AutoSubmitSelect>

          {/* Only when there is more than one choice: a control with a single
              option is noise.

              Staff, the scheduler, and "Students" as a GROUP — never a student
              by name. The read model excludes the student-authored actions
              before it takes its distinct, so no name reaches this select. */}
          {actors.length > 1 && (
            <AutoSubmitSelect
              id="audit-actor"
              name="actor"
              label="Show whose actions"
              defaultValue={filter.actor ?? ""}
            >
              <option value="">Anyone</option>
              {actors.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </AutoSubmitSelect>
          )}

          {/* Calendar days in this section's own timezone, both ends
              inclusive — resolved server-side, because "5 September" is not a
              UTC instant. */}
          <label className="visually-hidden" htmlFor="audit-from">
            From date
          </label>
          <Field
            // was `.toolbar .field` (§3.2). A date input is not the row's
            // stretchy element, but it shared the rule, so it keeps it.
            className="flex-[1_1_220px] min-w-0"
            id="audit-from"
            type="date"
            name="from"
            defaultValue={filter.from ?? ""}
          />
          <label className="visually-hidden" htmlFor="audit-to">
            To date
          </label>
          <Field
            className="flex-[1_1_220px] min-w-0"
            id="audit-to"
            type="date"
            name="to"
            defaultValue={filter.to ?? ""}
          />

          <AutoSubmitSelect
            id="audit-scope"
            name="scope"
            label="How much to show"
            defaultValue={scope}
          >
            <option value="teacher">What the teaching team did</option>
            <option value="all">Everything, including system records</option>
          </AutoSubmitSelect>

          <button
            className={buttonClass({ variant: "secondary" })}
            type="submit"
          >
            Apply
          </button>
          {(isFiltered || scope === "all") && (
            <Link className="link small" href={path}>
              Clear
            </Link>
          )}
        </form>

        {events.total === 0 ? (
          isFiltered || scope === "all" ? (
            <EmptyState title="Nothing matches these filters">
              Try a wider date range, another action, or clear the filters.
            </EmptyState>
          ) : (
            <EmptyState title="No audit records yet">
              Every important action in this section — an imported class list, a
              published answer, a participation decision, an export — is
              recorded here with who did it and when.
            </EmptyState>
          )
        ) : (
          <>
            <section className="notice">
              <ul className="data-list">
                {events.rows.map((row) => (
                  <AuditEntry
                    key={row.event.id}
                    row={row}
                    timezone={section.timezone}
                  />
                ))}
              </ul>
            </section>
            <Pagination
              page={events.page}
              totalPages={events.totalPages}
              total={events.total}
              basePath={path}
              params={linkParams}
              label="audit records"
            />
          </>
        )}
      </div>
    </AppShell>
  );
}

/**
 * One entry: a sentence, then what changed, then the raw shape if asked for.
 *
 * Three levels on purpose. The sentence answers "what happened"; the named
 * fields answer "what changed, exactly"; the payload answers "what did the
 * system actually store", which is a question a reader has perhaps once a term
 * and should not have to read past every other time.
 */
function AuditEntry({
  row,
  timezone,
}: {
  row: AuditHistoryRow;
  timezone: string;
}) {
  const { event, actor, subject } = row;
  const sentence = auditSentence({
    action: event.action,
    entityType: event.entityType,
    actorName: actor?.displayName ?? null,
    subject,
  });
  const changes = describeChanges(event.before, event.after);
  const hasPayload =
    event.before !== null || event.after !== null || event.metadata !== null;

  return (
    <li>
      <span className="data-list__main">
        {/* The sentence is the row. Plain text in a text node: a subject may be
            staff-authored, and it is escaped rather than rendered. */}
        <strong>{sentence}</strong>
        <MetaList
          items={[
            formatDateTime(event.createdAt, timezone),
            /* The noun, so a reader can tell two rows of the same action
               apart when neither resolved a subject. */
            subject ? null : auditEntityNoun(event.entityType),
          ]}
        />

        {changes.length > 0 && (
          <dl className="audit-diff">
            {changes.map((change) => (
              <div className="audit-diff__row" key={change.field}>
                <dt>{change.label}</dt>
                <dd>
                  <span className="audit-diff__from">
                    {change.before ?? "not recorded"}
                  </span>
                  <span aria-hidden="true"> → </span>
                  <span className="visually-hidden"> changed to </span>
                  <span className="audit-diff__to">
                    {change.after ?? "not recorded"}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/**
         * The raw payload, DELIBERATELY unredacted, and deliberately closed.
         *
         * The named-field list above withholds identity values and bodies,
         * because a teacher scanning a history should not be reading student
         * names to find out that an import happened. This is the escape
         * hatch for the other question — "what did the system actually
         * store?" — which is the one thing an audit log exists to answer when
         * something has gone wrong, and a redacted version of it could not.
         *
         * Safe as a staff-only exception: this page already requires non-TA
         * section standing, and an instructor holds `view_student_identities`
         * by role, so nothing here is a name or an address they cannot
         * already read on the class list. It stays a click behind a labelled
         * disclosure so it is never what a reader passes on the way to the
         * next entry, and the row itself is never modified — the log is
         * append-only, and what the default view does is project it.
         */}
        {hasPayload && (
          <details className="audit-raw">
            <summary>Technical details, exactly as stored</summary>
            <p className="audit-raw__note">
              The list above withholds names, addresses and message text. This
              is the unedited record, for staff.
            </p>
            <pre className="code-block">
              {JSON.stringify(
                {
                  action: event.action,
                  entityType: event.entityType,
                  entityId: event.entityId,
                  before: event.before,
                  after: event.after,
                  metadata: event.metadata,
                },
                null,
                2,
              )}
            </pre>
          </details>
        )}
      </span>
    </li>
  );
}
