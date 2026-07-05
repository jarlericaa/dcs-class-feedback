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
export const formResponseState = pgEnum("form_response_state", [
  "submitted",
  "under_review",
  "reviewed",
  "archived",
]);

export const participationValidity = pgEnum("participation_validity", [
  "valid",
  "invalid",
]);

export const submissionItemType = pgEnum("submission_item_type", [
  "question",
  "feedback",
  "concern",
  "clarification",
  "suggestion",
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
// "unpublished" is RESERVED (Open D6, post-MVP). No code path may set it.
export const publicAnswerState = pgEnum("public_answer_state", [
  "draft",
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

// --- invalidation reasons (participation-rules.md §2.1; staff-only) ---
export const invalidationReason = pgEnum("invalidation_reason", [
  "spam",
  "abusive_content",
  "empty_or_meaningless",
  "irrelevant",
  "bad_faith_credit_attempt",
]);
