import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import {
  accountMatches,
  auditEvents,
  emailOutbox,
  enrollments,
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
  weeklyCycles,
} from "@/db/schema";
import { requireNonTaSectionStaff } from "@/modules/authz";
import { buildPage, parsePageParams } from "@/lib/pagination";

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
  | "participation.exported"
  // --- roster import + claiming (Epic A) ---
  | "roster.parsed"
  | "roster.preview_edited"
  | "student_record.fields_updated"
  | "student_number.backfilled"
  | "student_number.revealed"
  | "claim.submitted"
  | "claim.auto_confirmed"
  | "claim.confirmed"
  | "claim.rejected"
  | "match.unlinked"
  // --- submissions (Epic B) ---
  | "response.draft_saved"
  | "response.edited"
  | "response.locked"
  | "response.unlocked"
  | "response.item_withdrawn"
  | "cycle.window_overridden"
  // --- validity + bonus (Epic C) ---
  | "validity.flagged"
  | "validity.flag_confirmed"
  | "validity.flag_rejected"
  | "validity.invalidated"
  | "validity.restored"
  | "bonus_period.created"
  | "bonus_period.updated"
  | "bonus_period.archived"
  | "bonus_period.default_changed"
  | "cycle.bonus_period_assigned"
  | "cycle.bonus_period_overridden"
  | "analysis.note_created"
  | "analysis.note_updated"
  | "analysis.note_archived"
  | "export.responses"
  | "export.bonus_records"
  | "export.backlog_status"
  | "export.pdf_summary"
  // --- triage, backlog, merge (Epic D) ---
  | "triage.will_answer"
  | "triage.will_not_answer"
  | "triage.will_not_answer_undone"
  | "backlog.recommended"
  | "backlog.recommendation_approved"
  | "backlog.recommendation_rejected"
  | "backlog.recommendation_withdrawn"
  | "backlog.metadata_updated"
  | "backlog.assigned"
  | "backlog.draft_answer_saved"
  | "merge.created"
  | "merge.member_added"
  | "merge.member_removed"
  | "merge.unmerged"
  // --- answering (Epic E) ---
  | "private_response.student_follow_up"
  | "private_response.removed"
  | "public_answer.submitted_for_approval"
  | "public_answer.approved"
  | "public_answer.rejected"
  | "public_answer.revised"
  | "public_answer.unpublished"
  | "public_answer.restored"
  // --- operations (Epic F) ---
  | "email.queued"
  | "email.sent"
  | "email.failed"
  | "course.archived"
  | "course.restored"
  | "course.cloned"
  // --- legacy import (P1) ---
  | "legacy.staged"
  | "legacy.row_updated"
  | "legacy.identity_preservation_changed"
  | "legacy.committed"
  // --- discussion (P2) ---
  | "comment.submitted"
  | "comment.moderated"
  | "discussion.lock_changed";

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
  opts: {
    action?: string;
    page?: string | number | null;
    pageSize?: string | number | null;
  } = {},
) {
  await requireNonTaSectionStaff(db, actorUserId, sectionId, { allowArchived: true });
  const params = parsePageParams(opts, 50);

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
    ...matches.map((m) => m.id),
    ...validityEvents.map((e) => e.id),
    ...revisions.map((r) => r.id),
    ...notes.map((n) => n.id),
    ...mergeGroups.map((g) => g.id),
    ...comments.map((c) => c.id),
    ...approvals.map((a) => a.id),
    ...answerRevisions.map((r) => r.id),
    ...outbox.map((o) => o.id),
  ];

  // Either scope path is sufficient on its own; a row matches if the denormalized
  // section column points here OR its entity belongs to this section.
  const scopeFilter = scopedIds.length
    ? or(
        eq(auditEvents.sectionId, sectionId),
        inArray(auditEvents.entityId, scopedIds),
      )!
    : eq(auditEvents.sectionId, sectionId);
  const where = opts.action
    ? and(scopeFilter, eq(auditEvents.action, opts.action))
    : scopeFilter;

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

  const actorIds = [
    ...new Set(rows.map((r) => r.actorUserId).filter((v): v is string => !!v)),
  ];
  const actors = actorIds.length
    ? await db.query.users.findMany({ where: inArray(users.id, actorIds) })
    : [];
  const actorById = new Map(actors.map((u) => [u.id, u]));

  return buildPage(
    rows.map((row) => ({
      event: row,
      /** null actor = a system/scheduler action */
      actor: row.actorUserId ? (actorById.get(row.actorUserId) ?? null) : null,
    })),
    total,
    params,
  );
}
