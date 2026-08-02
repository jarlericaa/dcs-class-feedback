import { and, desc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import {
  accountMatches,
  auditEvents,
  enrollments,
  formResponses,
  importBatches,
  privateResponses,
  publicAnswers,
  recurrenceSchedules,
  sectionStaff,
  sourceLinks,
  studentSubmissionItems,
  users,
  weeklyCycles,
} from "@/db/schema";
import { requireSectionStaff } from "@/modules/authz";

/**
 * Append-only audit log (domain-model.md §4). INSERT-only — the application
 * never updates or deletes audit rows. Call inside the same transaction as
 * the audited change so both commit together.
 */

export type AuditAction =
  | "user.teacher_role_changed"
  | "course.created"
  | "course.updated"
  | "section.created"
  | "section.updated"
  | "staff.assigned"
  | "staff.removed"
  | "staff.permissions_changed"
  | "roster.imported"
  | "student_record.name_corrected"
  | "match.candidates_generated"
  | "match.confirmed"
  | "match.rejected"
  | "match.correction_started"
  | "match.corrected"
  | "template.created"
  | "template.version_created"
  | "recurrence.configured"
  | "cycle.generated"
  | "cycle.opened"
  | "cycle.closed"
  | "cycle.reopened"
  | "cycle.skipped"
  | "response.submitted"
  | "response.review_state_changed"
  | "response.validity_changed"
  | "item.review_state_changed"
  | "item.type_category_corrected"
  | "private_response.created"
  | "public_answer.drafted"
  | "public_answer.reworded"
  | "public_answer.edited"
  | "public_answer.scheduled"
  | "public_answer.schedule_cancelled"
  | "public_answer.published"
  | "public_answer.publish_failed"
  | "source_link.created"
  | "backlog.question_created"
  | "backlog.moved_from_submission"
  | "backlog.copied_from_submission"
  | "backlog.state_changed"
  | "backlog.made_visible_to_section"
  | "legacy.imported"
  | "participation.exported";

export interface AuditInput {
  /** null = system/scheduler action */
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
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
  });
}

/**
 * Audit history for one section (roles-and-permissions.md §3: teachers may
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
export async function listSectionAuditEvents(
  actorUserId: string,
  sectionId: string,
  opts: { limit?: number; action?: string } = {},
) {
  await requireSectionStaff(db, actorUserId, sectionId);

  const cycles = await db.query.weeklyCycles.findMany({
    where: eq(weeklyCycles.sectionId, sectionId),
  });
  const cycleIds = cycles.map((c) => c.id);
  const responses = cycleIds.length
    ? await db.query.formResponses.findMany({
        where: inArray(formResponses.cycleId, cycleIds),
      })
    : [];
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
  const matches = recordIds.length
    ? await db.query.accountMatches.findMany({
        where: inArray(accountMatches.studentRecordId, recordIds),
      })
    : [];

  const scopedIds = [
    sectionId,
    ...cycleIds,
    ...responseIds,
    ...itemIds,
    ...privates.map((p) => p.id),
    ...answers.map((a) => a.id),
    ...links.map((l) => l.id),
    ...staffRows.map((s) => s.id),
    ...schedules.map((s) => s.id),
    ...batches.map((b) => b.id),
    ...recordIds,
    ...matches.map((m) => m.id),
  ];
  if (scopedIds.length === 0) return [];

  const where = opts.action
    ? and(
        inArray(auditEvents.entityId, scopedIds),
        eq(auditEvents.action, opts.action),
      )
    : inArray(auditEvents.entityId, scopedIds);

  const rows = await db.query.auditEvents.findMany({
    where,
    orderBy: desc(auditEvents.createdAt),
    limit: Math.min(opts.limit ?? 100, 500),
  });
  if (rows.length === 0) return [];

  const actorIds = [
    ...new Set(rows.map((r) => r.actorUserId).filter((v): v is string => !!v)),
  ];
  const actors = actorIds.length
    ? await db.query.users.findMany({ where: inArray(users.id, actorIds) })
    : [];
  const actorById = new Map(actors.map((u) => [u.id, u]));

  return rows.map((row) => ({
    event: row,
    /** null actor = a system/scheduler action */
    actor: row.actorUserId
      ? (actorById.get(row.actorUserId) ?? null)
      : null,
  }));
}
