import { pgEnum } from "drizzle-orm/pg-core";

// --- catalog ---
export const sectionStaffRole = pgEnum("section_staff_role", [
  "teacher",
  "ta",
  "co_teacher",
]);

export const enrollmentStatus = pgEnum("enrollment_status", [
  "active",
  "deactivated",
]);

/**
 * Normalized CRS enrollment status. The registrar's full code list is still
 * outstanding (docs/product/specification.md §14), so anything unrecognized becomes
 * `unknown` and the row is flagged for staff review rather than guessed at.
 */
export const crsEnrollmentStatus = pgEnum("crs_enrollment_status", [
  "enrolled",
  "not_enrolled",
  "unknown",
]);

export const lessonTopicKind = pgEnum("lesson_topic_kind", [
  "lesson",
  "lecture",
  "module",
  "topic",
]);

// --- forms ---
export const templateVisibility = pgEnum("template_visibility", [
  "private",
  "course_shared",
]);

/**
 * @deprecated Superseded by `formDeliveryMode`. Kept so the column keeps a valid
 * type; nothing reads it. A new enum was introduced rather than adding values
 * here because Postgres refuses to *use* an enum value added in the same
 * transaction, and drizzle's migrator wraps every pending file in one — an
 * `ALTER TYPE` would have forced a second migration file for no product gain.
 */
export const recurrenceFrequency = pgEnum("recurrence_frequency", ["weekly"]);

/**
 * How a form is delivered (docs/domain/forms-and-audiences.md §3).
 * Weekly is ONE mode, not the identity of a form.
 */
export const formDeliveryMode = pgEnum("form_delivery_mode", [
  /** exactly one instance, with an explicit open/deadline window */
  "one_time",
  /** one instance per week */
  "weekly",
  /** one instance every N weeks (N ≥ 2), same day/time controls */
  "custom_recurring",
  /** staff create, open, and close each instance by hand */
  "manual",
]);

/**
 * Who may receive a form. `all_sections` re-resolves to the course's ACTIVE
 * sections each time instances are generated, so a section added mid-term is
 * included without the teacher editing the schedule; `selected_sections` is a
 * fixed list. Either way the resolved list is written to the audience table, so
 * an instance's audience is always an explicit, auditable set of rows.
 */
export const formAudienceMode = pgEnum("form_audience_mode", [
  "all_sections",
  "selected_sections",
]);

/**
 * Where an instance-side question came from, so the per-occurrence editor can
 * show what is inherited and what is this occurrence's own, and so exports can
 * tell an edited question from a new one. NULL on definition-side rows.
 */
export const instanceQuestionOrigin = pgEnum("instance_question_origin", [
  /** copied from the source definition version and unchanged */
  "inherited",
  /** copied, then edited for this occurrence only */
  "modified",
  /** added to this occurrence only; absent from the definition */
  "instance_only",
]);

export const weeklyCycleState = pgEnum("weekly_cycle_state", [
  "draft",
  "scheduled",
  "open",
  "closed",
  "archived",
  "skipped",
]);

export const questionType = pgEnum("question_type", [
  "short_answer",
  "paragraph",
  "multiple_choice",
  "checkboxes",
  "dropdown",
  "linear_scale",
  "yes_no",
  "date",
  "time",
]);

export const questionCategory = pgEnum("question_category", [
  "content",
  "logistics",
  "misc",
]);

// --- responses (independent state dimensions, per docs/domain/domain-model.md §3) ---
/** The REVIEW dimension. Untouched by the draft/edit work — see responseLifecycle. */
export const formResponseState = pgEnum("form_response_state", [
  "submitted",
  "under_review",
  "reviewed",
  "archived",
]);

/**
 * docs/domain/domain-model.md §3.1a. A new type rather than new values on
 * `form_response_state`, because the two dimensions are independent and because
 * extending an existing enum would force another single-statement migration.
 */
export const responseLifecycle = pgEnum("response_lifecycle", [
  "draft",
  "submitted",
  "locked",
]);

export const responseRevisionAction = pgEnum("response_revision_action", [
  "draft_saved",
  "submitted",
  "edited",
  "locked",
  "unlocked",
]);

/**
 * @deprecated Superseded by `submissionValidity`. The type is still declared so
 * the migration is a column retype rather than a drop-and-recreate (drizzle-kit
 * would otherwise ask, interactively, whether the enum was renamed). No column
 * references it after migration 0002; dropping it is a separate cleanup.
 */
export const participationValidity = pgEnum("participation_validity", [
  "valid",
  "invalid",
]);

/**
 * docs/domain/domain-model.md §3.3. Replaces the two-state `participation_validity`.
 * `flagged` keeps participation credit (decision D15) — only an Instructor's
 * `invalid` removes it.
 */
export const submissionValidity = pgEnum("submission_validity", [
  "valid",
  "flagged",
  "invalid",
]);

export const validityAction = pgEnum("validity_action", [
  "flag",
  "confirm_flag",
  "reject_flag",
  "invalidate",
  "restore",
]);

export const submissionItemType = pgEnum("submission_item_type", [
  "question",
  "feedback",
  "concern",
  "clarification",
  "suggestion",
]);

/**
 * Separates a triageable question from the form's single general comment
 * (docs/product/specification.md §5.2). A general comment is never triaged and can never be
 * published as a Q&A entry.
 */
export const submissionItemKind = pgEnum("submission_item_kind", [
  "question",
  "general_comment",
]);

export const itemReviewState = pgEnum("item_review_state", [
  "new",
  "under_review",
  "resolved",
  "archived",
  "moved_to_backlog",
]);

export const responseDisposition = pgEnum("response_disposition", [
  "undecided",
  "private",
  "public",
  "private_and_public",
  "no_response",
  "merged",
]);

// --- publishing ---
/**
 * docs/product/specification.md §10: `Draft → Awaiting Approval → Published → Updated/Unpublished`.
 *
 * `awaiting_approval` is the ONLY value ever added to an existing enum in this
 * schema, and it must be generated as its own migration file: drizzle's migrator
 * wraps every pending file in a single transaction, and Postgres refuses to *use*
 * an enum value added in the same transaction. Rejection is deliberately not a
 * state — a rejected draft returns to `draft` and the decision lives in
 * public_answer_approvals — so exactly one ALTER TYPE is needed, ever.
 */
export const publicAnswerState = pgEnum("public_answer_state", [
  "draft",
  "awaiting_approval",
  "scheduled",
  "published",
  "unpublished",
]);

export const sourceOrigin = pgEnum("source_origin", [
  "current",
  "legacy",
  "staff_curated",
]);

// --- backlog & import ---
export const backlogQuestionState = pgEnum("backlog_question_state", [
  "imported",
  "needs_review",
  "answerable",
  "drafting",
  "scheduled",
  "published",
  "archived",
  "not_suitable",
]);

export const backlogProvenance = pgEnum("backlog_provenance", [
  "current_copied",
  "current_moved",
  "legacy_import",
  "manual_entry",
]);

export const importBatchKind = pgEnum("import_batch_kind", [
  "roster",
  "legacy",
]);

export const backlogPriority = pgEnum("backlog_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);

/** Instructor-confirmed membership, independent of backlogQuestionState. */
export const backlogConfirmation = pgEnum("backlog_confirmation", [
  "recommended",
  "confirmed",
  "rejected",
  "removal_recommended",
  "removed",
]);

export const backlogRecommendationKind = pgEnum("backlog_recommendation_kind", [
  "add",
  "remove",
]);

export const recommendationState = pgEnum("recommendation_state", [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
]);

export const mergeGroupState = pgEnum("merge_group_state", [
  "active",
  "unmerged",
]);

// --- legacy import (P1) ---
export const legacySourceKind = pgEnum("legacy_source_kind", [
  "typst",
  "csv",
  "xlsx",
  "paste",
]);

export const legacyRowState = pgEnum("legacy_row_state", [
  "parsed",
  "error",
  "needs_attention",
  "accepted",
  "rejected",
]);

// --- private threads, approval, email, discussion ---
export const privateMessageRole = pgEnum("private_message_role", [
  "staff",
  "student",
]);

export const approvalDecision = pgEnum("approval_decision", [
  "requested",
  "approved",
  "rejected",
]);

export const emailEventType = pgEnum("email_event_type", [
  "form_opened",
  "deadline_reminder",
  "private_answer_received",
  "public_answer_linked",
  "submission_invalidated",
  "submission_restored",
  "approval_requested",
  "approval_decided",
  "backlog_assigned",
]);

export const emailDeliveryState = pgEnum("email_delivery_state", [
  "pending",
  "sending",
  "sent",
  "failed",
  "cancelled",
]);

export const reactionKind = pgEnum("reaction_kind", [
  "helpful",
  "thanks",
  "same_question",
]);

export const commentState = pgEnum("comment_state", [
  "pending",
  "approved",
  "rejected",
  "removed",
]);

/** Whether a cycle's bonus period was chosen automatically or pinned by staff. */
export const bonusAssignmentSource = pgEnum("bonus_assignment_source", [
  "auto",
  "staff_override",
]);

// --- invalidation reasons (docs/domain/participation.md §2.1; staff-only) ---
export const invalidationReason = pgEnum("invalidation_reason", [
  "spam",
  "abusive_content",
  "empty_or_meaningless",
  "irrelevant",
  "bad_faith_credit_attempt",
]);
