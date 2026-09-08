import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/db";
import {
  auditEvents,
  classSections,
  courses,
  emailOutbox,
  enrollments,
  formInstances,
  formTemplates,
  formResponseRevisions,
  formResponses,
  importBatches,
  privateResponses,
  promptAnalysisNotes,
  publicAnswerApprovals,
  publicAnswerComments,
  publicAnswerRevisions,
  publicAnswers,
  questionMergeGroups,
  recurrenceSchedules,
  sectionStaff,
  sourceLinks,
  studentSubmissionItems,
  submissionValidityEvents,
  users,
} from "@/db/schema";
import { requireNonTaSectionStaff } from "@/modules/authz";
import { instanceIdsForSection } from "@/modules/forms/audience";
import { instanceLabel } from "@/modules/forms/instances";
import { richTextToPlain } from "@/modules/richtext/plain";
import { buildPage, parsePageParams } from "@/lib/pagination";
import {
  hasStudentActor,
  isTeacherFacing,
  STUDENT_ACTOR_ACTIONS,
  TEACHER_FACING_ACTIONS,
} from "@/lib/audit-story";
import { zonedTimeToUtc } from "@/modules/forms/timezone";
import type { AuditAction } from "./actions";

/** The form value that means "the scheduler", which has no actor row. */
export const SYSTEM_ACTOR = "system";

/**
 * The form value that means "whatever students did", as a group.
 *
 * A student is never an actor OPTION by name, so this is how student activity
 * stays filterable at all. It selects on the ACTION rather than on any account,
 * which is also why it cannot be turned into a per-student filter.
 */
export const STUDENT_ACTORS = "students";

export interface AuditHistoryRow {
  event: typeof auditEvents.$inferSelect;
  /** null actor = a system/scheduler action */
  actor: typeof users.$inferSelect | null;
  /**
   * A short, PLAIN, already-safe label for the thing acted on, or null.
   *
   * Resolved only for entity types that belong to the course rather than to one
   * identifiable student — see `resolveSubjects`. Null is the answer for every
   * student-shaped entity, which is what keeps a student's name out of the
   * sentence this feeds.
   */
  subject: string | null;
}

/**
 * Midnight of a `YYYY-MM-DD` day in a named timezone, as a UTC instant.
 *
 * `offsetDays` shifts to the start of a later day, which is how an INCLUSIVE
 * end date is expressed: everything strictly before the next day's midnight.
 * A malformed value yields null and the bound is simply not applied — a bad
 * `?from=` in a URL should show the unfiltered list, not an error page.
 */
function dayStart(
  day: string | undefined,
  timeZone: string,
  offsetDays = 0,
): Date | null {
  if (!day) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return null;
  const [, year, month, date] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dateNumber = Number(date);
  if (
    monthNumber < 1 ||
    monthNumber > 12 ||
    dateNumber < 1 ||
    dateNumber > new Date(Date.UTC(yearNumber, monthNumber, 0)).getUTCDate()
  ) {
    return null;
  }
  const base = zonedTimeToUtc(
    yearNumber,
    monthNumber,
    dateNumber,
    0,
    0,
    0,
    timeZone,
  );
  return offsetDays === 0
    ? base
    : new Date(base.getTime() + offsetDays * 86_400_000);
}

/**
 * Append-only audit log (docs/domain/domain-model.md §4). INSERT-only — the application
 * never updates or deletes audit rows. Call inside the same transaction as
 * the audited change so both commit together.
 */

export { AUDIT_ACTIONS } from "./actions";
export type { AuditAction } from "./actions";

export interface AuditInput {
  /** null = system/scheduler action */
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  /**
   * Denormalized scope. Supply whichever applies: without it, this row is only
   * findable through the legacy entity-id fan-out, which cannot be paginated.
   * Never put message bodies, comment text, or student numbers in any field.
   */
  sectionId?: string | null;
  courseId?: string | null;
}

export async function writeAudit(dbx: DbOrTx, input: AuditInput) {
  await dbx.insert(auditEvents).values({
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: input.metadata ?? null,
    sectionId: input.sectionId ?? null,
    courseId: input.courseId ?? null,
  });
}

/**
 * The predicate that scopes the audit log to ONE section.
 *
 * Extracted so the list and the actor selector share it literally rather than
 * agreeing by inspection: a selector built on a wider scope would offer a
 * reader the name of somebody whose rows they cannot see.
 *
 * Two paths, either sufficient on its own. Rows written since the audit table
 * gained a `section_id` column carry it; rows written before that do not, so
 * their entity ids are collected by fanning out from the section — which is
 * why this is a query rather than one clause.
 */
async function sectionAuditScope(
  sectionId: string,
  courseId: string,
): Promise<SQL> {
  // Instances are collected through the AUDIENCE table, so a form shared with
  // this section is in scope for its staff even though the instance itself is
  // course-level and carries no section column.
  const cycleIds = await instanceIdsForSection(db, sectionId);
  // Responses are this section's own, so a shared instance never drags another
  // section's response ids — and therefore its audit rows — into this history.
  const responses = await db.query.formResponses.findMany({
    where: eq(formResponses.sectionId, sectionId),
  });
  const responseIds = responses.map((r) => r.id);
  const items = responseIds.length
    ? await db.query.studentSubmissionItems.findMany({
        where: inArray(studentSubmissionItems.responseId, responseIds),
      })
    : [];
  const itemIds = items.map((i) => i.id);
  const privates = itemIds.length
    ? await db.query.privateResponses.findMany({
        where: inArray(privateResponses.itemId, itemIds),
      })
    : [];
  const answers = await db.query.publicAnswers.findMany({
    where: eq(publicAnswers.sectionId, sectionId),
  });
  const links = answers.length
    ? await db.query.sourceLinks.findMany({
        where: inArray(
          sourceLinks.publicAnswerId,
          answers.map((a) => a.id),
        ),
      })
    : [];
  const staffRows = await db.query.sectionStaff.findMany({
    where: eq(sectionStaff.sectionId, sectionId),
  });
  const schedules = await db.query.recurrenceSchedules.findMany({
    where: eq(recurrenceSchedules.sectionId, sectionId),
  });
  const batches = await db.query.importBatches.findMany({
    where: eq(importBatches.sectionId, sectionId),
  });
  const enrolled = await db.query.enrollments.findMany({
    where: eq(enrollments.sectionId, sectionId),
  });
  const recordIds = enrolled.map((e) => e.studentRecordId);
  const enrollmentIds = enrolled.map((e) => e.id);

  // Entities added after the audit table gained a section column still need the
  // fan-out, because a row written before that column existed carries no scope.
  const validityEvents = responseIds.length
    ? await db.query.submissionValidityEvents.findMany({
        where: inArray(submissionValidityEvents.responseId, responseIds),
      })
    : [];
  const revisions = responseIds.length
    ? await db.query.formResponseRevisions.findMany({
        where: inArray(formResponseRevisions.responseId, responseIds),
      })
    : [];
  const notes = await db.query.promptAnalysisNotes.findMany({
    where: eq(promptAnalysisNotes.sectionId, sectionId),
  });
  const mergeGroups = await db.query.questionMergeGroups.findMany({
    where: eq(questionMergeGroups.sectionId, sectionId),
  });
  const comments = await db.query.publicAnswerComments.findMany({
    where: eq(publicAnswerComments.sectionId, sectionId),
  });
  const answerIds = answers.map((a) => a.id);
  const approvals = answerIds.length
    ? await db.query.publicAnswerApprovals.findMany({
        where: inArray(publicAnswerApprovals.publicAnswerId, answerIds),
      })
    : [];
  const answerRevisions = answerIds.length
    ? await db.query.publicAnswerRevisions.findMany({
        where: inArray(publicAnswerRevisions.publicAnswerId, answerIds),
      })
    : [];
  const outbox = await db.query.emailOutbox.findMany({
    where: eq(emailOutbox.sectionId, sectionId),
  });

  const scopedIds = [
    sectionId,
    ...cycleIds,
    ...responseIds,
    ...itemIds,
    ...privates.map((p) => p.id),
    ...answerIds,
    ...links.map((l) => l.id),
    ...staffRows.map((s) => s.id),
    ...schedules.map((s) => s.id),
    ...batches.map((b) => b.id),
    ...recordIds,
    ...enrollmentIds,
    ...validityEvents.map((e) => e.id),
    ...revisions.map((r) => r.id),
    ...notes.map((n) => n.id),
    ...mergeGroups.map((g) => g.id),
    ...comments.map((c) => c.id),
    ...approvals.map((a) => a.id),
    ...answerRevisions.map((r) => r.id),
    ...outbox.map((o) => o.id),
  ];

  /**
   * Three DISJOINT cases, decided by how much scope the writer recorded.
   *
   * 1. **This section, explicitly.** The row names it, so it is ours.
   * 2. **This course, and no section.** A section's forms, templates,
   *    schedules and backlog all live at the COURSE level, and the writers
   *    that own them record only `course_id` for that reason —
   *    `course.created`, `course.updated`, `template.created`,
   *    `template.version_created`, `form.delivery_configured`, `form.audience_set`,
   *    `cycle.*`, `staff.course_*`, `legacy.imported`, `backlog.*`. None of
   *    those entities is reachable from a section by id, so without this
   *    clause a section's own history silently omitted every one of them —
   *    which is why "why did this form change?" had no answer on this page. It
   *    admits course-level structure only: no student data is written at
   *    course scope.
   * 3. **No scope at all**, found by entity. This is the legacy path: the audit
   *    table gained its `section_id`/`course_id` columns after rows already
   *    existed. Today's writers all record one of the two, but this case still
   *    reaches the rows written before they did — and it is why a writer whose
   *    entity is DELETED in the same transaction (`staff.removed`) must record
   *    its section on the row: an id that no longer exists can never be found
   *    by fanning out again.
   *
   * `section_id IS NULL` on cases 2 and 3 is the safety, not a detail. Without
   * it a row that explicitly says "section B" would be pulled into section A's
   * history by a colliding entity id or by sharing a course — so scoping would
   * rest on uuid uniqueness rather than on what the row actually says. Case 3
   * additionally requires no course, so the two lower cases cannot overlap and
   * a row belonging to another course cannot arrive through an id collision.
   */
  const explicitlyThisSection = eq(auditEvents.sectionId, sectionId);
  const courseLevel = and(
    isNull(auditEvents.sectionId),
    eq(auditEvents.courseId, courseId),
  )!;
  const unscopedButOurs = scopedIds.length
    ? and(
        isNull(auditEvents.sectionId),
        isNull(auditEvents.courseId),
        inArray(auditEvents.entityId, scopedIds),
      )!
    : null;

  return unscopedButOurs
    ? or(explicitlyThisSection, courseLevel, unscopedButOurs)!
    : or(explicitlyThisSection, courseLevel)!;
}
/**
 * Audit history for one section (docs/domain/roles-and-permissions.md §3: teachers may
 * view audit history for their own resources).
 *
 * The audit table is intentionally generic — it stores entityType/entityId,
 * not a section column — so scoping means collecting the ids of everything
 * that belongs to this section and matching on those. Anything not reachable
 * from the section is invisible here, which keeps one teacher out of another
 * teacher's history.
 *
 * Access: section staff without a TA flag, i.e. teachers, co-teachers, and
 * course staff. There is no `view_audit_history` flag in the MVP permission
 * catalog, so audit browsing is deliberately NOT delegable to a TA.
 * Never student-visible (Risk R6).
 */
/**
 * The requested scope, normalized to one of two values.
 *
 * `all` and nothing else opens the log up. `?? "teacher"` alone was not enough:
 * an unrecognised value — `"ALL"`, `"everything"`, a typo, anything a caller or
 * a URL supplies — is neither `undefined` nor `"teacher"`, so a check written
 * as `(opts.scope ?? "teacher") === "teacher"` fell through and silently
 * dropped the allowlist clause. Widening must be an explicit, exact request.
 */
function normalizeScope(scope: string | undefined): "teacher" | "all" {
  return scope === "all" ? "all" : "teacher";
}

export interface AuditHistoryFilter {
  /** one action code; ignored unless it is in scope for this reader */
  action?: string;
  /** one staff member, or `system` for the scheduler's own rows */
  actor?: string;
  /** inclusive calendar days in the SECTION's timezone, `YYYY-MM-DD` */
  from?: string;
  to?: string;
  /**
   * `teacher` (default) shows only the teacher-facing actions; `all` shows
   * every record this section holds, including the platform's own. Withheld is
   * never deleted — the log is append-only and this switch is one click.
   *
   * Typed loosely on purpose: it arrives from a query string, and
   * `normalizeScope` is what decides. Only the exact string `all` widens.
   */
  scope?: string;
  page?: string | number | null;
  pageSize?: string | number | null;
}

export async function listSectionAuditEvents(
  actorUserId: string,
  sectionId: string,
  opts: AuditHistoryFilter = {},
) {
  const section = await requireNonTaSectionStaff(db, actorUserId, sectionId, {
    allowArchived: true,
  });
  const params = parsePageParams(opts, 50);
  if (
    opts.actor &&
    opts.actor !== SYSTEM_ACTOR &&
    opts.actor !== STUDENT_ACTORS &&
    !z.string().uuid().safeParse(opts.actor).success
  ) {
    // Query-string input must not reach a PostgreSQL UUID comparison. An
    // invalid actor is a refused narrowing, not a reason to widen the log.
    return buildPage<AuditHistoryRow>([], 0, params);
  }

  const scopeFilter = await sectionAuditScope(sectionId, section.courseId);
  /**
   * Every narrowing is a SQL clause, not a filter over the page.
   *
   * The count, the order and the offset all come from this one predicate, so a
   * filtered view can never advertise a page it cannot fill — and "which
   * actions exist" is answered from the allowlist and a scoped `DISTINCT`
   * rather than from whatever happened to land on page 1.
   */
  const clauses = [scopeFilter];
  const scope = normalizeScope(opts.scope);

  // Default scope: the teacher-facing allowlist. `all` drops the clause rather
  // than inverting it, so nothing is unreachable.
  if (scope === "teacher") {
    clauses.push(inArray(auditEvents.action, [...TEACHER_FACING_ACTIONS]));
  }

  /**
   * A requested action narrows, and can never widen: one that the current
   * scope does not admit is refused with an empty result rather than silently
   * dropped, which would answer a narrowing request with everything.
   */
  if (opts.action) {
    if (scope === "teacher" && !isTeacherFacing(opts.action)) {
      return buildPage<AuditHistoryRow>([], 0, params);
    }
    clauses.push(eq(auditEvents.action, opts.action));
  }

  if (opts.actor) {
    if (opts.actor === SYSTEM_ACTOR) {
      // The scheduler's rows carry no actor, and a null cannot be a form value.
      clauses.push(isNull(auditEvents.actorUserId));
    } else if (opts.actor === STUDENT_ACTORS) {
      // Students as a GROUP, selected on the action rather than on an account —
      // which is what makes it impossible to narrow this to one student.
      clauses.push(inArray(auditEvents.action, [...STUDENT_ACTOR_ACTIONS]));
    } else {
      /**
       * One person, by id — and only their STAFF rows.
       *
       * The `notInArray` is the load-bearing half. Without it a hand-edited
       * `?actor=<a student's id>` would answer with that student's own
       * submissions, which is a per-student activity view this page does not
       * offer and the selector cannot reach. Their rows still read "A student"
       * either way, but the filter must not become the way to build such a
       * view one id at a time.
       */
      clauses.push(eq(auditEvents.actorUserId, opts.actor));
      clauses.push(
        notInArray(auditEvents.action, [...STUDENT_ACTOR_ACTIONS]),
      );
    }
  }

  /**
   * Dates are the reader's CALENDAR days, resolved in the section's timezone.
   * `from` starts at 00:00 of that day and `to` ends the instant 00:00 of the
   * following day begins, so "5 to 5 September" is one whole day rather than an
   * empty range — the boundary a UTC comparison gets wrong by up to a day.
   */
  const from = dayStart(opts.from, section.timezone);
  if (from) clauses.push(gte(auditEvents.createdAt, from));
  const to = dayStart(opts.to, section.timezone, 1);
  if (to) clauses.push(lt(auditEvents.createdAt, to));

  const where = clauses.length === 1 ? clauses[0]! : and(...clauses)!;

  const [{ count: total } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(where);

  const rows = await db.query.auditEvents.findMany({
    where,
    orderBy: [desc(auditEvents.createdAt), desc(auditEvents.id)],
    limit: params.pageSize,
    offset: params.offset,
  });

  /**
   * Actor names are resolved only for the rows STAFF wrote.
   *
   * The actor of a submission, an edit, a withdrawal, a private follow-up or a
   * comment is the student the row is about. Masking in the DATA rather than
   * trusting the page not to print it is the same stance the review queue takes
   * with student identity: `actor` comes back null and the projected event
   * carries no `actorUserId`, so no surface over this read model can print a
   * name it was never given. `auditSentence` says "A student" for exactly these
   * actions, and the underlying row is untouched — the log is append-only, and
   * which student it was stays answerable from the submission itself in the
   * review inbox.
   */
  const staffActorIds = [
    ...new Set(
      rows
        .filter((row) => !hasStudentActor(row.action))
        .map((row) => row.actorUserId)
        .filter((id): id is string => !!id),
    ),
  ];
  const actors = staffActorIds.length
    ? await db.query.users.findMany({ where: inArray(users.id, staffActorIds) })
    : [];
  const actorById = new Map(actors.map((u) => [u.id, u]));
  const subjects = await resolveSubjects(rows, {
    sectionId,
    courseId: section.courseId,
  });

  return buildPage<AuditHistoryRow>(
    rows.map((row) => {
      const studentActor = hasStudentActor(row.action);
      return {
        // Projected, not the raw row: `actorUserId` is the identity binding for
        // a student-authored action, so it is dropped here rather than left for
        // a caller to notice.
        event: studentActor ? { ...row, actorUserId: null } : row,
        /** null actor = the scheduler, or a student whose name is withheld */
        actor:
          !studentActor && row.actorUserId
            ? (actorById.get(row.actorUserId) ?? null)
            : null,
        subject: row.entityId
          ? (subjects.get(subjectKey(row.entityType, row.entityId)) ?? null)
          : null,
      };
    }),
    total,
    params,
  );
}

/**
 * A readable label for the thing each row points at — for the safe types only.
 *
 * This is the privacy boundary of the whole feature. An audit row names an
 * entity by id, and turning that id into words is exactly where a student's
 * name could enter a sentence a teacher scans. So the resolution is an
 * ALLOWLIST of entity types that belong to the course rather than to one
 * person:
 *
 * - a public answer's reworded public question — staff-authored, and already
 *   visible to that whole class;
 * - a class list's name, a course's code, a form's title, an occurrence's
 *   label — all staff-authored course structure.
 *
 * Everything else resolves to null and the sentence falls back to a noun.
 * `form_response`, `student_submission_item`, `student_record`, `enrollment`
 * and `private_response` are the student-shaped types, and none of them is
 * listed here: no lookup exists that could return a name, an address, or a word
 * a student wrote.
 *
 * One query per entity type present on the PAGE, so the cost is bounded by the
 * page rather than by the section's history.
 */
async function resolveSubjects(
  rows: (typeof auditEvents.$inferSelect)[],
  scope: { sectionId: string; courseId: string },
): Promise<Map<string, string>> {
  const byType = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.entityId) continue;
    const ids = byType.get(row.entityType) ?? [];
    ids.push(row.entityId);
    byType.set(row.entityType, ids);
  }
  const found = new Map<string, string>();
  /**
   * Keyed by TYPE AND ID, never by id alone.
   *
   * Two rows can name the same id under different entity types — a stale or
   * hand-written row, a fixture, or one day a genuine collision — and keying on
   * the id alone let a student-shaped row inherit the label resolved for a
   * course-shaped one. That is the exact failure this whole allowlist exists to
   * prevent, so the key carries the type that earned the lookup.
   */
  const put = (
    entityType: string,
    id: string,
    label: string | null | undefined,
  ) => {
    const text = label?.trim();
    if (text) found.set(subjectKey(entityType, id), text);
  };

  for (const [entityType, rawIds] of byType) {
    const ids = [...new Set(rawIds)];
    switch (entityType) {
      case "public_answer": {
        const answers = await db.query.publicAnswers.findMany({
          // Constrained to THIS section as well as to the ids: an id that
          // reached the log by another route resolves to nothing rather than to
          // another class's published wording.
          where: and(
            inArray(publicAnswers.id, ids),
            eq(publicAnswers.sectionId, scope.sectionId),
          ),
          columns: { id: true, publicQuestionText: true },
        });
        // Flattened here, not at the page: the label is a plain string by the
        // time it leaves this module, so no caller can be tempted to render it
        // as markup.
        for (const a of answers) {
          put(entityType, a.id, richTextToPlain(a.publicQuestionText));
        }
        break;
      }
      case "class_section": {
        const sections = await db.query.classSections.findMany({
          where: and(
            inArray(classSections.id, ids),
            eq(classSections.courseId, scope.courseId),
          ),
          columns: { id: true, title: true },
        });
        for (const row of sections) put(entityType, row.id, row.title);
        break;
      }
      case "course": {
        // Only the section's own course: any other id is not this reader's.
        const rows_ = await db.query.courses.findMany({
          where: and(inArray(courses.id, ids), eq(courses.id, scope.courseId)),
          columns: { id: true, code: true },
        });
        for (const row of rows_) put(entityType, row.id, row.code);
        break;
      }
      case "form_template": {
        const templates = await db.query.formTemplates.findMany({
          where: and(
            inArray(formTemplates.id, ids),
            eq(formTemplates.courseId, scope.courseId),
          ),
          columns: { id: true, title: true },
        });
        for (const row of templates) put(entityType, row.id, row.title);
        break;
      }
      case "weekly_cycle":
      case "form_instance": {
        const instances = await db.query.formInstances.findMany({
          where: and(
            inArray(formInstances.id, ids),
            eq(formInstances.courseId, scope.courseId),
          ),
        });
        for (const row of instances) put(entityType, row.id, instanceLabel(row));
        break;
      }
      default:
        // Every student-shaped type lands here, deliberately.
        break;
    }
  }
  return found;
}

/** The subject map's key: the type that earned the lookup, and the id. */
function subjectKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Who a reader may filter BY — staff, the system, and students as a group.
 *
 * Never a student by name. `selectDistinct` over the section's history returns
 * whoever wrote a row, and a submission is written by the student it is about —
 * so a naive list put student names in a `<select>`, which is exactly the
 * invariant the sentences were built to hold. The clause therefore excludes the
 * student-authored actions before the distinct, so a person is offered only
 * when they wrote at least one row as STAFF. A teacher who is also enrolled in
 * their own section still appears, on the strength of their staff rows.
 *
 * Student activity stays filterable without anyone being named: `students` is a
 * single option meaning "the rows students wrote", and it is offered only when
 * there are some. Its own rows come back with the actor masked, like every
 * other read of them.
 *
 * Scoped the same way the list is, so a control cannot offer a choice that
 * yields an empty page: under the default `teacher` scope the allowlist applies
 * here too, so an actor whose only rows are withheld system records is not
 * offered.
 *
 * A complete, finite selector — a section's staff is a handful of people — so
 * it is returned whole rather than paginated.
 */
export async function listSectionAuditActors(
  actorUserId: string,
  sectionId: string,
  opts: { scope?: string } = {},
): Promise<{ id: string; name: string }[]> {
  const section = await requireNonTaSectionStaff(db, actorUserId, sectionId, {
    allowArchived: true,
  });
  const scope = await sectionAuditScope(sectionId, section.courseId);
  const visible =
    normalizeScope(opts.scope) === "teacher"
      ? and(scope, inArray(auditEvents.action, [...TEACHER_FACING_ACTIONS]))!
      : scope;

  const staffRows = await db
    .selectDistinct({ actorUserId: auditEvents.actorUserId })
    .from(auditEvents)
    .where(
      and(visible, notInArray(auditEvents.action, [...STUDENT_ACTOR_ACTIONS]))!,
    );

  const ids = staffRows
    .map((row) => row.actorUserId)
    .filter((id): id is string => !!id);
  const people = ids.length
    ? await db.query.users.findMany({ where: inArray(users.id, ids) })
    : [];
  const options = people
    .map((person) => ({ id: person.id, name: person.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // The scheduler, when it has written anything a reader can see here.
  if (staffRows.some((row) => row.actorUserId === null)) {
    options.push({ id: SYSTEM_ACTOR, name: "The system" });
  }

  /**
   * "Students", as a group. One extra query, and only to decide whether the
   * option is worth offering — a control that filters to nothing is worse than
   * no control.
   */
  const [studentRows] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(
      and(visible, inArray(auditEvents.action, [...STUDENT_ACTOR_ACTIONS]))!,
    );
  if ((studentRows?.count ?? 0) > 0) {
    options.push({ id: STUDENT_ACTORS, name: "Students" });
  }

  return options;
}
