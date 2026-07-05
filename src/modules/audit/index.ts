import { auditEvents } from "@/db/schema";
import type { DbOrTx } from "@/db";

/**
 * Append-only audit log (domain-model.md §4). INSERT-only — the application
 * never updates or deletes audit rows. Call inside the same transaction as
 * the audited change so both commit together.
 */

export type AuditAction =
  | "course.created"
  | "section.created"
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
  | "response.validity_changed"
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
