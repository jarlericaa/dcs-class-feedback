import { AUDIT_ACTIONS } from "./actions";

export const AUDIT_CATEGORIES = ["Access", "Courses", "Responses", "Publishing", "System"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** Stable, human-facing buckets for the platform-wide audit feed. */
export function auditCategoryForAction(action: string): AuditCategory {
  if (action.startsWith("admin.") || action.startsWith("user.") || action.startsWith("teacher_access.") || action.startsWith("staff.") || action.startsWith("roster.") || action.startsWith("student_record.") || action.startsWith("student_number.")) return "Access";
  if (action.startsWith("public_answer.") || action.startsWith("source_link.") || action.startsWith("backlog.") || action.startsWith("legacy.") || action.startsWith("merge.") || action.startsWith("comment.") || action.startsWith("discussion.")) return "Publishing";
  if (action.startsWith("response.") || action.startsWith("item.") || action.startsWith("private_response.") || action.startsWith("validity.") || action.startsWith("participation.") || action.startsWith("export.")) return "Responses";
  if (action.startsWith("course.") || action.startsWith("section.") || action.startsWith("template.") || action.startsWith("recurrence.") || action.startsWith("form.") || action.startsWith("cycle.") || action.startsWith("bonus_period.") || action.startsWith("triage.") || action.startsWith("analysis.")) return "Courses";
  return "System";
}

/** A guardrail used by tests and future writers: every stored action has a bucket. */
export function unmappedAuditActions() {
  return AUDIT_ACTIONS.filter((action) => !AUDIT_CATEGORIES.includes(auditCategoryForAction(action)));
}
