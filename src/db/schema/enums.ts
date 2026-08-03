import { pgEnum } from "drizzle-orm/pg-core";

// --- identity ---
export const accountMatchState = pgEnum("account_match_state", [
  "unmatched",
  "candidate",
  "ambiguous",
  "confirmed",
  "rejected",
  "correction_pending",
]);

export const accountMatchMethod = pgEnum("account_match_method", [
  "auto_pipeline",
  "teacher",
  "manual_correction",
]);

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
 * outstanding (project-specs.md §14), so anything unrecognized becomes
 * `unknown` and the row is flagged for staff review rather than guessed at.
 */
export const crsEnrollmentStatus = pgEnum("crs_enrollment_status", [
  "enrolled",
  "not_enrolled",
  "unknown",
]);

/** Lifecycle of a student's attempt to claim a roster entry. */
export const rosterClaimState = pgEnum("roster_claim_state", [
  "pending",
  "auto_confirmed",
  "confirmed",
  "rejected",
  "superseded",
]);

/**
 * Why a claim landed where it did. Recorded for STAFF ONLY — the student always
 * receives the same response, so the claim page cannot be used to discover
 * whether a student number exists or who it belongs to.
 */
export const rosterClaimReason = pgEnum("roster_claim_reason", [
  "no_roster_match",
  "name_mismatch",
  "name_ambiguous",
  "already_claimed",
  "user_already_confirmed",
  "policy_confirm_all",
  "exact_name_match",
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

export const recurrenceFrequency = pgEnum("recurrence_frequency", ["weekly"]);

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

// --- responses (independent state dimensions, per domain-model.md §3) ---
/** The REVIEW dimension. Untouched by the draft/edit work — see responseLifecycle. */
export const formResponseState = pgEnum("form_response_state", [
  "submitted",
  "under_review",
  "reviewed",
  "archived",
]);

/**
 * domain-model.md §3.1a. A new type rather than new values on
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
 * domain-model.md §3.3. Replaces the two-state `participation_validity`.
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
 * (project-specs.md §5.2). A general comment is never triaged and can never be
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
 * project-specs.md §10: `Draft → Awaiting Approval → Published → Updated/Unpublished`.
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

// --- invalidation reasons (participation-rules.md §2.1; staff-only) ---
export const invalidationReason = pgEnum("invalidation_reason", [
  "spam",
  "abusive_content",
  "empty_or_meaningless",
  "irrelevant",
  "bad_faith_credit_attempt",
]);
