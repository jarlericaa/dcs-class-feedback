/**
 * Every audit action this application can write, as DATA.
 *
 * A union type could not be enumerated at runtime, and two things need to
 * enumerate it: the teacher-facing allowlist that decides what the audit
 * history shows by default (`src/lib/audit-story.ts`), and the filter control
 * built from it. Deriving the type FROM the list rather than keeping both means
 * an action added here cannot be missing from either.
 *
 * The stored codes belong to the domain and must not change: they go into an
 * append-only table and are queried by value. Add to this list; never rename.
 *
 * Deliberately importless, so a unit test can read it without pulling in the
 * database module.
 */
export const AUDIT_ACTIONS = [
  "user.teacher_role_changed",
  "course.created",
  "course.updated",
  "section.created",
  "section.updated",
  "staff.assigned",
  "staff.removed",
  "staff.permissions_changed",
  /** course-wide instructor standing, granted and revoked (ADR-0004) */
  "staff.course_assigned",
  "staff.course_removed",
  "roster.imported",
  "student_record.name_corrected",
  "template.created",
  "template.version_created",
  "recurrence.configured",
  // --- course-level forms, audiences, per-occurrence customization ---
  "form.delivery_configured",
  "form.audience_set",
  "cycle.questions_customized",
  "cycle.questions_reworded",
  "cycle.questions_restored",
  "cycle.focus_changed",
  "cycle.generated",
  "cycle.opened",
  "cycle.closed",
  "cycle.reopened",
  "cycle.skipped",
  "cycle.restored",
  "response.submitted",
  "response.review_state_changed",
  "response.validity_changed",
  "item.review_state_changed",
  /**
   * Staff decided a question will not be answered, and the reversal of that.
   * The student is never told either happened (docs/domain/domain-model.md §3.5), so the
   * audit log is the only record that a decision was taken at all.
   */
  "item.answer_declined",
  "item.answer_declined_undone",
  "item.type_category_corrected",
  "private_response.created",
  "public_answer.drafted",
  "public_answer.reworded",
  "public_answer.edited",
  "public_answer.scheduled",
  "public_answer.schedule_cancelled",
  "public_answer.published",
  "public_answer.publish_failed",
  "source_link.created",
  "backlog.question_created",
  "backlog.moved_from_submission",
  "backlog.copied_from_submission",
  "backlog.state_changed",
  "backlog.made_visible_to_section",
  "legacy.imported",
  "participation.exported",
  // --- roster import + email identity (Epic A, docs/student-identity.md) ---
  "roster.parsed",
  "roster.preview_edited",
  "roster.row_added",
  "roster.row_deactivated",
  "roster.row_rejected",
  /** a student record's UP email was set or changed — this IS the access grant */
  "roster.email_linked",
  "student_record.fields_updated",
  "student_number.backfilled",
  "student_number.revealed",
  // --- submissions (Epic B) ---
  "response.draft_saved",
  "response.edited",
  "response.locked",
  "response.unlocked",
  "response.item_withdrawn",
  /**
   * Per-reader read state (GitHub issue #6). Audited because "who opened whose
   * submission" is a privacy-relevant access record, not because a read marker
   * changes anything: it touches no validity, no credit and no publication.
   *
   * Only the DELIBERATE marks are written. A read implied by resolving a post —
   * replying, publishing, declining — is not audited a second time, because
   * the action that resolved it already has its own row and "and they had read
   * it first" adds no fact. `response.all_marked_read` is ONE row carrying a
   * count, never one row per response.
   */
  "response.marked_read",
  "response.marked_unread",
  "response.all_marked_read",
  "cycle.window_overridden",
  // --- validity + bonus (Epic C) ---
  "validity.flagged",
  "validity.flag_confirmed",
  "validity.flag_rejected",
  "validity.invalidated",
  "validity.restored",
  "bonus_period.created",
  "bonus_period.updated",
  "bonus_period.archived",
  "bonus_period.default_changed",
  "cycle.bonus_period_assigned",
  "cycle.bonus_period_overridden",
  "analysis.note_created",
  "analysis.note_updated",
  "analysis.note_archived",
  "export.responses",
  "export.bonus_records",
  "export.backlog_status",
  "export.pdf_summary",
  // --- triage, backlog, merge (Epic D) ---
  "triage.will_answer",
  "triage.will_not_answer",
  "triage.will_not_answer_undone",
  "backlog.recommended",
  "backlog.recommendation_approved",
  "backlog.recommendation_rejected",
  "backlog.recommendation_withdrawn",
  "backlog.metadata_updated",
  "backlog.assigned",
  "backlog.draft_answer_saved",
  "merge.created",
  "merge.member_added",
  "merge.member_removed",
  "merge.unmerged",
  // --- answering (Epic E) ---
  "private_response.student_follow_up",
  "private_response.removed",
  "public_answer.submitted_for_approval",
  "public_answer.approved",
  "public_answer.rejected",
  "public_answer.revised",
  "public_answer.unpublished",
  "public_answer.restored",
  // --- operations (Epic F) ---
  "email.queued",
  "email.sent",
  "email.failed",
  "course.archived",
  "course.restored",
  "course.cloned",
  // --- legacy import (P1) ---
  "legacy.staged",
  "legacy.row_updated",
  "legacy.identity_preservation_changed",
  "legacy.committed",
  // --- discussion (P2) ---
  "comment.submitted",
  "comment.moderated",
  "discussion.lock_changed",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
