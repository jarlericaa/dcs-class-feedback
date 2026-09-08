import { AUDIT_ACTIONS, type AuditAction } from "@/modules/audit/actions";
import { auditActionLabel } from "@/lib/audit-labels";

/**
 * The audit log, said the way a teacher would say it (GitHub issue #16).
 *
 * The page it feeds used to print an internal action code beside a `<pre>` of
 * raw jsonb. "What happened?" and "does this matter?" were both unanswerable
 * from it. Three pure things live here, all testable without a database:
 *
 * 1. Which actions a teacher should see at all (`TEACHER_FACING_ACTIONS`).
 * 2. One sentence per entry — actor, verb, object (`auditSentence`).
 * 3. A named-field before → after diff (`describeChanges`), so the payload is
 *    read as changes rather than parsed as JSON.
 *
 * Two privacy rules bind every function here, because this module decides what
 * a reader sees FIRST:
 *
 * - **The sentence never names a student**, in either position. Not as the
 *   object — `ENTITY_NOUNS` has no student-shaped noun, and the read model
 *   resolves no label for a student-shaped entity — and not as the ACTOR
 *   either: the handful of actions a student performs render as "A student",
 *   see `STUDENT_ACTOR_ACTIONS`. A teacher reading this page holds
 *   `view_student_identities` by role, so this is not an escalation being
 *   prevented; it is a log whose default reading is about what happened rather
 *   than about who a student is. Which submission it was stays answerable —
 *   the entity id is in the technical details, and the review inbox names the
 *   student against the submission itself.
 * - **Nothing here renders markup.** Every value it returns is plain text for a
 *   JSX text node. A subject label may be staff-authored rich text, so it
 *   arrives already flattened by the read model and is escaped by React on the
 *   way out. This module adds no second HTML sink.
 */

/**
 * Actions this view withholds by default: the platform talking to itself.
 *
 * A denylist, not a hand-kept allowlist, so the visible set below is derived —
 * an action added to `AUDIT_ACTIONS` later is teacher-facing until somebody
 * decides otherwise, which is the safe direction to be wrong in. A record a
 * teacher can see is a record they can ask about; one silently withheld is not.
 *
 * Each exclusion is here for one of three reasons:
 *
 * - **Volume with no decision in it.** `cycle.generated` fires per occurrence
 *   per schedule, `response.locked` once per response per deadline, and the
 *   read-state rows once per post per reader. Thirty of them bury the one row
 *   that says a credit was removed.
 * - **Mechanics of an action whose OUTCOME is already listed.** `roster.parsed`
 *   and `roster.preview_edited` precede `roster.imported` and its per-row
 *   results; `source_link.created` is the internal half of a publication that
 *   already has its own row.
 * - **Not this reader's business.** Email delivery is operations,
 *   `user.teacher_role_changed` is platform administration, and the
 *   student-number rows are an ops backfill and a reveal that belongs in a
 *   platform-level log.
 *
 * Withheld, never deleted: the log is append-only and the page offers an
 * explicit "everything" scope, so nothing here is unreachable.
 */
const SYSTEM_ONLY_ACTIONS: ReadonlySet<string> = new Set<AuditAction>([
  "cycle.generated",
  "email.queued",
  "email.sent",
  "email.failed",
  "response.draft_saved",
  "response.locked",
  "response.unlocked",
  "response.review_state_changed",
  "item.review_state_changed",
  "response.marked_read",
  "response.marked_unread",
  "response.all_marked_read",
  "source_link.created",
  "student_number.revealed",
  "student_number.backfilled",
  "roster.parsed",
  "roster.preview_edited",
  "user.teacher_role_changed",
]);

/**
 * Codes from workflows that no longer exist.
 *
 * The account-matching and claim flow was removed with decision D23, but the
 * log is append-only, so a section that predates it still holds these rows.
 * They describe a decision nobody can act on now, so they are withheld with the
 * rest of the system records rather than left to confuse a reader.
 */
const HISTORICAL_PREFIXES = ["match.", "claim."] as const;

/** The explicit list this view filters by — derived, so it cannot drift. */
export const TEACHER_FACING_ACTIONS: readonly string[] = AUDIT_ACTIONS.filter(
  (action) => !SYSTEM_ONLY_ACTIONS.has(action),
);

export function isTeacherFacing(action: string): boolean {
  if (SYSTEM_ONLY_ACTIONS.has(action)) return false;
  return !HISTORICAL_PREFIXES.some((prefix) => action.startsWith(prefix));
}

/**
 * The actions whose actor is the STUDENT, not a member of staff.
 *
 * A submission, a pre-deadline edit, a withdrawn question, a private follow-up,
 * a comment: the account that wrote the row belongs to the person the log is
 * about. Naming them would put a student's name in the first words of an entry
 * a teacher scans, so the sentence says "A student" and the identity stays
 * where it belongs — beside the submission, in the review inbox.
 *
 * Keyed on the ACTION rather than on the account, so it needs no identity
 * lookup and cannot be defeated by a staff member who is also enrolled.
 */
export const STUDENT_ACTOR_ACTIONS: readonly string[] = [
  "response.submitted",
  "response.edited",
  "response.draft_saved",
  "response.item_withdrawn",
  "private_response.student_follow_up",
  "comment.submitted",
];

const STUDENT_ACTOR_SET: ReadonlySet<string> = new Set(STUDENT_ACTOR_ACTIONS);

/** Whether this action's actor is a student, and so must not be named. */
export function hasStudentActor(action: string): boolean {
  return STUDENT_ACTOR_SET.has(action);
}

/**
 * What each action reads as in a sentence, in the past tense.
 *
 * `phrase` completes "Maria Santos …"; `of` is the preposition that introduces
 * the object when the read model resolved one, and its absence means the
 * subject is not this action's object and is left off rather than glued on with
 * a guess. An action with no entry falls back to a derived phrase, so a new
 * action reads plainly instead of breaking.
 */
interface Predicate {
  phrase: string;
  of?: string;
}

const PREDICATES: Record<string, Predicate> = {
  "course.created": { phrase: "created the course" },
  "course.updated": { phrase: "changed the course settings" },
  "course.archived": { phrase: "archived the course" },
  "course.restored": { phrase: "restored the course" },
  "course.cloned": { phrase: "copied the course" },
  "section.created": { phrase: "created a class list", of: "for" },
  "section.updated": { phrase: "changed the class list settings", of: "for" },

  "staff.assigned": { phrase: "added a teaching staff member" },
  "staff.removed": { phrase: "removed a teaching staff member" },
  "staff.permissions_changed": { phrase: "changed a staff member's permissions" },
  "staff.course_assigned": { phrase: "granted course-wide access" },
  "staff.course_removed": { phrase: "removed course-wide access" },

  "roster.imported": { phrase: "imported a class list" },
  "roster.row_added": { phrase: "added a student to the class list" },
  "roster.row_deactivated": { phrase: "marked a student as no longer on the class list" },
  "roster.row_rejected": { phrase: "had a class-list row refused" },
  "roster.email_linked": { phrase: "set the UP email that gives a student access" },
  "student_record.name_corrected": { phrase: "corrected a student's name" },
  "student_record.fields_updated": { phrase: "updated a student's details" },

  "template.created": { phrase: "created a form", of: "—" },
  "template.version_created": { phrase: "saved a new version of a form", of: "—" },
  "recurrence.configured": { phrase: "saved a weekly schedule" },
  "form.delivery_configured": { phrase: "saved when a form is delivered", of: "for" },
  "form.audience_set": { phrase: "changed who receives a form", of: "—" },

  "cycle.opened": { phrase: "opened a form", of: "—" },
  "cycle.closed": { phrase: "closed a form", of: "—" },
  "cycle.reopened": { phrase: "reopened a form", of: "—" },
  "cycle.skipped": { phrase: "skipped an occurrence", of: "—" },
  "cycle.restored": { phrase: "restored an occurrence", of: "—" },
  "cycle.window_overridden": { phrase: "changed the dates of an occurrence", of: "—" },
  "cycle.questions_customized": { phrase: "changed the questions for one occurrence only", of: "—" },
  "cycle.questions_reworded": { phrase: "fixed the wording of a question for one occurrence", of: "—" },
  "cycle.questions_restored": { phrase: "reset an occurrence to the base form", of: "—" },
  "cycle.focus_changed": { phrase: "changed an occurrence's focus", of: "—" },
  "cycle.bonus_period_assigned": { phrase: "assigned an occurrence to a bonus period", of: "—" },
  "cycle.bonus_period_overridden": { phrase: "overrode an occurrence's bonus period", of: "—" },

  "response.submitted": { phrase: "submitted a form" },
  "response.edited": { phrase: "edited a submission before its deadline" },
  "response.item_withdrawn": { phrase: "withdrew a question from their submission" },

  "validity.flagged": { phrase: "flagged a submission for an instructor" },
  "validity.flag_confirmed": { phrase: "confirmed a flag and removed the week's credit" },
  "validity.flag_rejected": { phrase: "dismissed a flag and kept the week's credit" },
  "validity.invalidated": { phrase: "removed a submission's participation credit" },
  "validity.restored": { phrase: "restored a submission's participation credit" },
  "response.validity_changed": { phrase: "changed a submission's participation credit" },

  "item.type_category_corrected": { phrase: "corrected a question's type or topic" },
  "item.answer_declined": { phrase: "decided a question will not be answered" },
  "item.answer_declined_undone": { phrase: "put a question back in the queue" },
  "triage.will_answer": { phrase: "marked a question to answer" },
  "triage.will_not_answer": { phrase: "marked a question as not being answered" },
  "triage.will_not_answer_undone": { phrase: "undid a not-answering decision" },

  "private_response.created": { phrase: "replied privately to a student" },
  "private_response.removed": { phrase: "removed a private reply" },
  "private_response.student_follow_up": { phrase: "followed up privately" },

  "public_answer.drafted": { phrase: "drafted a public answer", of: "to" },
  "public_answer.reworded": { phrase: "reworded a public question", of: "—" },
  "public_answer.edited": { phrase: "edited a public answer", of: "to" },
  "public_answer.revised": { phrase: "revised a published answer", of: "to" },
  "public_answer.scheduled": { phrase: "scheduled a public answer", of: "to" },
  "public_answer.schedule_cancelled": { phrase: "cancelled a scheduled publication", of: "of" },
  "public_answer.published": { phrase: "published an answer", of: "to" },
  "public_answer.publish_failed": { phrase: "had a publication fail", of: "for" },
  "public_answer.unpublished": { phrase: "unpublished an answer", of: "to" },
  "public_answer.restored": { phrase: "restored an unpublished answer", of: "to" },
  "public_answer.submitted_for_approval": { phrase: "sent a public answer for approval", of: "to" },
  "public_answer.approved": { phrase: "approved a public answer", of: "to" },
  "public_answer.rejected": { phrase: "rejected a public answer", of: "to" },

  "merge.created": { phrase: "merged similar questions" },
  "merge.member_added": { phrase: "added a question to a merge" },
  "merge.member_removed": { phrase: "removed a question from a merge" },
  "merge.unmerged": { phrase: "undid a merge" },

  "backlog.question_created": { phrase: "added a question to the course backlog" },
  "backlog.copied_from_submission": { phrase: "copied a question to the backlog" },
  "backlog.moved_from_submission": { phrase: "moved a question to the backlog" },
  "backlog.state_changed": { phrase: "updated a backlog question" },
  "backlog.metadata_updated": { phrase: "updated a backlog question's details" },
  "backlog.assigned": { phrase: "assigned a backlog question" },
  "backlog.draft_answer_saved": { phrase: "saved a draft answer for a backlog question" },
  "backlog.made_visible_to_section": { phrase: "shared a backlog question with a class", of: "—" },
  "backlog.recommended": { phrase: "recommended a backlog change" },
  "backlog.recommendation_approved": { phrase: "approved a backlog recommendation" },
  "backlog.recommendation_rejected": { phrase: "rejected a backlog recommendation" },
  "backlog.recommendation_withdrawn": { phrase: "withdrew a backlog recommendation" },

  "legacy.staged": { phrase: "staged questions from an earlier semester" },
  "legacy.row_updated": { phrase: "edited a question from an earlier semester" },
  "legacy.identity_preservation_changed": {
    phrase: "changed whether earlier questions keep their author",
  },
  "legacy.committed": { phrase: "imported questions from an earlier semester" },
  "legacy.imported": { phrase: "imported questions from an earlier semester" },

  "bonus_period.created": { phrase: "created a bonus period" },
  "bonus_period.updated": { phrase: "changed a bonus period" },
  "bonus_period.archived": { phrase: "archived a bonus period" },
  "bonus_period.default_changed": { phrase: "changed the default bonus period" },

  "analysis.note_created": { phrase: "added a staff note" },
  "analysis.note_updated": { phrase: "edited a staff note" },
  "analysis.note_archived": { phrase: "archived a staff note" },

  "comment.submitted": { phrase: "posted a comment" },
  "comment.moderated": { phrase: "moderated a comment" },
  "discussion.lock_changed": { phrase: "changed whether a discussion is locked" },

  "participation.exported": { phrase: "downloaded a participation export" },
  "export.responses": { phrase: "downloaded a responses export" },
  "export.bonus_records": { phrase: "downloaded a bonus-records export" },
  "export.backlog_status": { phrase: "downloaded a backlog-status export" },
  "export.pdf_summary": { phrase: "downloaded a summary PDF" },
};

/**
 * The noun for a thing the log points at, when nothing better resolved.
 *
 * Every noun here is a THING, never a person. `form_response`,
 * `student_submission_item` and `student_record` are the entity types that
 * belong to one identifiable student, and each is deliberately named as an
 * object — "a submission", "a question", "a student on the class list" — so no
 * path through this module can put a student's name in a sentence.
 */
const ENTITY_NOUNS: Record<string, string> = {
  course: "the course",
  class_section: "the class list",
  section_staff: "a staff assignment",
  course_staff: "a course-wide grant",
  student_record: "a student on the class list",
  enrollment: "a place on the class list",
  form_template: "a form",
  weekly_cycle: "an occurrence",
  form_instance: "an occurrence",
  recurrence_schedule: "a schedule",
  form_response: "a submission",
  student_submission_item: "a student's question",
  private_response: "a private reply",
  public_answer: "a public answer",
  source_link: "a link to a source submission",
  backlog_question: "a backlog question",
  import_batch: "an import",
  question_merge_group: "a merge",
  bonus_period: "a bonus period",
  email_outbox: "an email",
};

/** The noun for an entity type, or a de-underscored fallback. */
export function auditEntityNoun(entityType: string): string {
  return ENTITY_NOUNS[entityType] ?? entityType.replace(/_/g, " ");
}

export interface AuditStoryInput {
  action: string;
  entityType: string;
  /** the staff member who acted; null means the scheduler or a reconciliation */
  actorName: string | null;
  /**
   * A short, already-safe, already-PLAIN label for the thing acted on — a
   * public question's text, a form's title, a class list's name. Null whenever
   * the read model could not resolve one safely, which includes every entity
   * type that belongs to one identifiable student.
   */
  subject?: string | null;
}

/**
 * One entry, as one sentence.
 *
 * "Maria Santos published an answer to “When will the practice set be
 * available?”" rather than `public_answer.published`. The actor leads because
 * the first question a reader has is who did this; the object trails because it
 * is what they ask second.
 */
export function auditSentence(input: AuditStoryInput): string {
  const actor = hasStudentActor(input.action)
    ? "A student"
    : input.actorName?.trim() || "The system";
  const predicate = PREDICATES[input.action];
  const subject = input.subject?.trim() || null;

  if (!predicate) {
    // A code with no phrase yet: still a sentence, built from the label the
    // existing map already has for it.
    const label = auditActionLabel(input.action);
    const tail = subject ? ` — ${subject}` : "";
    return `${actor} · ${label}${tail}.`;
  }

  let sentence = `${actor} ${predicate.phrase}`;
  if (subject && predicate.of) {
    // An em dash reads as an appositive rather than a preposition, for the
    // actions where the subject names the thing rather than a target.
    sentence +=
      predicate.of === "—" ? ` — ${subject}` : ` ${predicate.of} ${quote(subject)}`;
  }
  return `${sentence}.`;
}

function quote(value: string): string {
  return `“${value}”`;
}

// --- the before → after diff -----------------------------------------------

/**
 * Field names, as words.
 *
 * The stored keys are the domain's — `studentVisibleReason`, `openAt` — and a
 * teacher reading a change should not have to decode camelCase. An unmapped key
 * falls back to a spaced, sentence-cased form, so a new field reads plainly.
 */
const FIELD_LABELS: Record<string, string> = {
  role: "Role",
  title: "Name",
  term: "Term",
  timezone: "Timezone",
  active: "Active",
  code: "Course code",
  state: "State",
  status: "Status",
  validity: "Participation credit",
  lifecycle: "Submission state",
  fullName: "Name",
  rosterEmail: "UP email",
  rosterName: "Name on the class list",
  openAt: "Opens",
  deadlineAt: "Deadline",
  scheduledAt: "Scheduled for",
  publishedAt: "Published",
  invalidationReason: "Reason (staff only)",
  studentVisibleReason: "What the student sees",
  reason: "Reason",
  disposition: "Outcome",
  reviewState: "Review state",
  category: "Topic",
  submissionType: "Kind",
  publicQuestionText: "Public question",
  answerBody: "Answer",
  prompt: "Question",
  required: "Required",
  displayOrder: "Position",
  deliveryMode: "Delivery",
  audienceMode: "Audience",
};

export function auditFieldLabel(field: string): string {
  if (Object.hasOwn(FIELD_LABELS, field)) return FIELD_LABELS[field]!;
  const words = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.]/g, " ")
    .toLowerCase()
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Field names whose VALUE the default diff refuses to print.
 *
 * Not a theoretical guard. Reading every `writeAudit` call in `src/` turns up
 * three kinds of payload the earlier version of this file printed happily,
 * because `FIELD_LABELS` gave each of them a friendly label:
 *
 * - `roster.row_added` writes `after: { fullName, rosterEmail }` and
 *   `roster.email_linked` writes both sides of `rosterEmail`. Those rows exist
 *   precisely to record who was granted access, so the row is right to carry
 *   them — but a teacher scanning a history should not be reading a list of
 *   student names and addresses to find out that an import happened.
 * - `staff.assigned` and `staff.course_assigned` write an `email`.
 * - `public_answer.edited` writes an `answerBody`, and
 *   `response.item_withdrawn` writes lengths rather than the text (which is the
 *   pattern every writer should follow).
 *
 * So the default view states the FACT of the change and withholds the value.
 * The field's own label still shows, because which field changed is the useful
 * part and a field name is not sensitive.
 *
 * Two mechanisms, because a list alone cannot cover a writer added next year:
 * an explicit set, and name patterns. Erring toward withholding is the right
 * direction for a DISPLAY projection — the raw payload disclosure is one click
 * away and holds whatever is really stored (see the audit page for that
 * decision).
 */
const WITHHELD_FIELDS: ReadonlySet<string> = new Set([
  "fullName",
  "rosterName",
  "rosterEmail",
  "email",
  "firstName",
  "familyName",
  "livedName",
  "preferredPronoun",
  "program",
  "studentNumber",
  "displayName",
]);

/**
 * Anything a future writer names like an identity is withheld too.
 *
 * `publicQuestionText` deliberately matches none of these — see
 * `PRINTABLE_TEXT_FIELDS`.
 */
const WITHHELD_PATTERNS = [/email/i, /name/i, /studentnumber/i, /phone/i];

/**
 * Field names whose value is prose, reported by length rather than shown.
 *
 * Distinct from withheld: the LENGTH of a body is a useful fact (it says
 * something changed and roughly how much), while the length of an email
 * address says nothing worth a row.
 */
const PROSE_FIELDS: ReadonlySet<string> = new Set([
  "body",
  "text",
  "note",
  "staffNote",
  "originalText",
  "comment",
  "message",
  "answerBody",
  "feedback",
]);

/** Prose named by a future writer: `…Body`, `…Note`, `…Comment`, `…Message`. */
const PROSE_PATTERNS = [/body$/i, /^text$/i, /note$/i, /comment$/i, /message$/i];

/**
 * The one text field the default diff DOES print, deliberately.
 *
 * `public_answer.reworded` writes both sides of `publicQuestionText`, and that
 * before → after is the single most useful diff in the log: it is what a
 * teacher opens this page to check. Both sides are staff-authored wording
 * already published to that entire class, and the student's original words are
 * immutable and never in this payload — rewording produces public text
 * alongside the original, it does not overwrite it
 * (docs/domain/public-qa.md §2). Truncation still applies, so a long
 * question does not flood the row.
 *
 * Listed explicitly so a future pattern cannot withhold it by accident.
 */
const PRINTABLE_TEXT_FIELDS: ReadonlySet<string> = new Set([
  "publicQuestionText",
  "prompt",
  "title",
  "description",
  "purpose",
  "focusLabel",
]);

/** Whether the default diff prints this field's value at all. */
export function isWithheldField(field: string): boolean {
  if (PRINTABLE_TEXT_FIELDS.has(field)) return false;
  if (WITHHELD_FIELDS.has(field)) return true;
  return WITHHELD_PATTERNS.some((pattern) => pattern.test(field));
}

/** Whether the default diff reports this field's value by length only. */
export function isProseField(field: string): boolean {
  if (PRINTABLE_TEXT_FIELDS.has(field)) return false;
  if (PROSE_FIELDS.has(field)) return true;
  return PROSE_PATTERNS.some((pattern) => pattern.test(field));
}

/** How long a value may be before it is described rather than printed. */
export const MAX_INLINE_VALUE = 80;

/**
 * What stands in for a value the default diff will not print.
 *
 * A word, not an ellipsis or a blank: the reader has to be able to tell "this
 * field is set and I am not being shown it" from "this field is empty".
 */
export const WITHHELD_VALUE = "withheld";

export interface AuditFieldChange {
  field: string;
  label: string;
  /** null when the field was absent on that side */
  before: string | null;
  after: string | null;
}

/**
 * The changed fields between two audit payloads, as text.
 *
 * Only fields that actually DIFFER, because a row that lists forty unchanged
 * permissions buries the one that moved. A field present on one side only reads
 * as "not recorded" on the other, which is the truth: the writer captured one
 * and not the other.
 *
 * Non-scalar values are described rather than serialized — "3 items", "changed"
 * — because a nested object rendered inline is the JSON blob this replaced. The
 * technical-details disclosure is where the real shape belongs.
 */
export function describeChanges(
  before: unknown,
  after: unknown,
): AuditFieldChange[] {
  const left = asRecord(before);
  const right = asRecord(after);
  if (!left && !right) return [];

  const fields = [
    ...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]),
  ].sort();

  const changes: AuditFieldChange[] = [];
  for (const field of fields) {
    const from = left ? left[field] : undefined;
    const to = right ? right[field] : undefined;
    if (left && right && sameValue(from, to)) continue;
    changes.push({
      field,
      label: auditFieldLabel(field),
      before: left ? formatValue(field, from) : null,
      after: right ? formatValue(field, to) : null,
    });
  }
  return changes;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/** One value, as plain text a person can read. Never markup, never a body. */
export function formatValue(field: string, value: unknown): string {
  if (value === undefined) return "not recorded";
  if (value === null) return "not set";
  /**
   * Withheld first, before any other classification.
   *
   * Order matters: a field that is both an identity and long must not fall
   * through to the truncated preview below, which would still print the first
   * eighty characters of somebody's name. Absence is never withheld — "not
   * set" is the fact a reader needs and it discloses nothing.
   */
  if (isWithheldField(field)) return WITHHELD_VALUE;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  }
  if (typeof value === "object") return "changed";

  const text = String(value).trim();
  if (!text) return "empty";
  if (isProseField(field)) {
    return `${text.length} ${text.length === 1 ? "character" : "characters"} of text`;
  }
  if (text.length > MAX_INLINE_VALUE) {
    return `${text.slice(0, MAX_INLINE_VALUE).trimEnd()}…`;
  }
  return text;
}
