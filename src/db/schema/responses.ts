import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  formResponseState,
  invalidationReason,
  itemReviewState,
  privateMessageRole,
  questionCategory,
  responseDisposition,
  responseLifecycle,
  responseRevisionAction,
  submissionItemKind,
  submissionItemType,
  submissionValidity,
  validityAction,
} from "./enums";
import { formInstances, formQuestions } from "./forms";
import { studentRecords, users } from "./identity";
import { classSections, lessonsTopics } from "./catalog";

/**
 * One student's completed form instance. THREE independent state dimensions
 * (docs/domain/domain-model.md §3.1a/§3.2/§3.3):
 *
 * - `lifecycle` — draft / submitted / locked
 * - `state`     — the staff review dimension
 * - `validity`  — valid / flagged / invalid
 *
 * The single row IS the draft, the submission, and the locked version in turn:
 * there is never a second row for an (instance, student) pair, which is what
 * makes "one response per form instance" and "editing cannot mint a second
 * credit" structural rather than something the service has to remember.
 *
 * Participation is DERIVED from these rows — there is no participation table.
 */
export const formResponses = pgTable(
  "form_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => formInstances.id),
    studentRecordId: uuid("student_record_id")
      .notNull()
      .references(() => studentRecords.id),
    /**
     * The audience section this response is attributed to — resolved server-side
     * on the first save from the student's active enrolments among the
     * instance's audience, and never re-derived.
     *
     * Deliberately NOT part of the uniqueness key below: a student enrolled in
     * two targeted sections must not be able to produce two responses to the
     * same instance. This column is what makes per-section review filtering,
     * participation, publication scoping, and student history exact without
     * reintroducing a per-section copy of the form.
     */
    sectionId: uuid("section_id")
      .notNull()
      .references(() => classSections.id),
    lifecycle: responseLifecycle("lifecycle").notNull().default("submitted"),
    /**
     * FIRST submission only, and never rewritten. This is the participation
     * anchor: an edit bumps `revision` and `lastEditedAt`, so no edit can look
     * like a new submission.
     * NULL exactly while the response is still a draft.
     */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    /** Incremented on every draft save / submit / edit; used for lost-update detection. */
    revision: integer("revision").notNull().default(1),
    state: formResponseState("state").notNull().default("submitted"),
    validity: submissionValidity("validity").notNull().default("valid"),
    /** staff-only; required when validity is flagged or invalid (service-enforced) */
    invalidationReason: invalidationReason("invalidation_reason"),
    /** staff-only free text; NEVER shown to a student */
    invalidationNote: text("invalidation_note"),
    /**
     * The ONLY reason text a student can read. Deliberately a separate column
     * from `invalidationNote` so an internal note can never leak by accident.
     */
    studentVisibleReason: text("student_visible_reason"),
    validityUpdatedByUserId: uuid("validity_updated_by_user_id").references(
      () => users.id,
    ),
    validityUpdatedAt: timestamp("validity_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // THE one-response-per-student-per-instance rule (docs/domain/form-workflow.md
    // §4). The section is not in this key on purpose — see sectionId above.
    uniqueIndex("one_response_per_cycle_student").on(
      t.cycleId,
      t.studentRecordId,
    ),
    check(
      "response_lifecycle_submitted_at",
      sql`(${t.lifecycle} = 'draft') = (${t.submittedAt} IS NULL)`,
    ),
    check(
      "response_lifecycle_locked_at",
      sql`(${t.lifecycle} = 'locked') = (${t.lockedAt} IS NOT NULL)`,
    ),
    // An invalidation the student cannot be told about is not acceptable.
    check(
      "invalid_requires_student_reason",
      sql`${t.validity} <> 'invalid' OR length(btrim(coalesce(${t.studentVisibleReason}, ''))) > 0`,
    ),
    check(
      "nonvalid_requires_reason",
      sql`${t.validity} = 'valid' OR ${t.invalidationReason} IS NOT NULL`,
    ),
    index("form_responses_student_idx").on(t.studentRecordId),
    index("form_responses_cycle_idx").on(t.cycleId),
    index("form_responses_cycle_lifecycle_idx").on(t.cycleId, t.lifecycle),
    index("form_responses_section_idx").on(t.sectionId),
    index("form_responses_section_cycle_idx").on(t.sectionId, t.cycleId),
    index("form_responses_validity_idx").on(t.validity),
  ],
);

/**
 * Content trail for the draft → submit → edit → lock lifecycle.
 *
 * Separate from audit_events on purpose: audit_events is a generic, append-only
 * security log, while the staff UI needs the before/after content of one
 * response keyed by revision. Both are written in the same transaction.
 */
export const formResponseRevisions = pgTable(
  "form_response_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => formResponses.id),
    revision: integer("revision").notNull(),
    action: responseRevisionAction("action").notNull(),
    /** null = system (the deadline lock performed by reconciliation) */
    actorUserId: uuid("actor_user_id").references(() => users.id),
    /** { answers: [...], items: [...], lifecycle } */
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("response_revision_unique").on(t.responseId, t.revision),
    index("response_revisions_response_idx").on(t.responseId),
  ],
);

/**
 * Append-only validity timeline (docs/domain/domain-model.md §3.3). Insert-only, like
 * audit_events, but keyed per response so the review UI can show the open
 * flag's reason to the Instructor deciding on it, and so the student-visible
 * reason has a channel that is structurally separate from the staff note.
 */
export const submissionValidityEvents = pgTable(
  "submission_validity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => formResponses.id),
    action: validityAction("action").notNull(),
    priorValidity: submissionValidity("prior_validity").notNull(),
    newValidity: submissionValidity("new_validity").notNull(),
    reason: invalidationReason("reason"),
    /** staff-only */
    staffNote: text("staff_note"),
    /** copied onto the response when it becomes invalid */
    studentVisibleReason: text("student_visible_reason"),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    /** snapshot of the actor's standing at decision time */
    actorRole: text("actor_role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "validity_event_transition",
      sql`${t.priorValidity} <> ${t.newValidity}`,
    ),
    check(
      "validity_event_reason",
      sql`${t.action} IN ('reject_flag', 'restore') OR ${t.reason} IS NOT NULL`,
    ),
    check(
      "validity_event_student_reason",
      sql`${t.newValidity} <> 'invalid' OR ${t.studentVisibleReason} IS NOT NULL`,
    ),
    index("validity_events_response_idx").on(t.responseId, t.createdAt),
    index("validity_events_actor_idx").on(t.actorUserId),
  ],
);

export const questionAnswers = pgTable(
  "question_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => formResponses.id),
    questionId: uuid("question_id")
      .notNull()
      .references(() => formQuestions.id),
    /**
     * { optionIds?: string[], optionLabels?: string[], scaleValue?: number,
     *   boolValue?: boolean, dateValue?: string, timeValue?: string }
     * Stores stable option ids AND labels at submission time so exports stay
     * stable if labels are later edited (docs/domain/participation.md §4.3).
     */
    value: jsonb("value"),
    freeText: text("free_text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // An edit UPSERTs on this key rather than inserting a second answer.
    uniqueIndex("one_answer_per_question").on(t.responseId, t.questionId),
    index("question_answers_response_idx").on(t.responseId),
  ],
);

/**
 * A student-originated item inside a response: one of the repeatable questions,
 * or the form's single general comment.
 *
 * `originalText` is IMMUTABLE — no service exposes an update for it, and public
 * rewording lives on publicAnswers.publicQuestionText only. Editing an item
 * before the deadline is modelled as withdraw + supersede, so the original
 * wording survives every edit; an item that staff have already acted on (a
 * private reply, a source link, a non-`new` review state) cannot be replaced at
 * all.
 */
export const studentSubmissionItems = pgTable(
  "student_submission_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => formResponses.id),
    kind: submissionItemKind("kind").notNull().default("question"),
    /** 0-based position among this response's question entries */
    ordinal: integer("ordinal").notNull().default(0),
    submissionType: submissionItemType("submission_type").notNull(),
    category: questionCategory("category").notNull(),
    topicId: uuid("topic_id").references(() => lessonsTopics.id),
    originalText: text("original_text").notNull(),
    reviewState: itemReviewState("review_state").notNull().default("new"),
    disposition: responseDisposition("disposition")
      .notNull()
      .default("undecided"),
    /** set when a pre-deadline edit replaced this item; the row is never deleted */
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    supersededByItemId: uuid("superseded_by_item_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("submission_items_response_idx").on(t.responseId),
    // At most one live general comment per response.
    uniqueIndex("one_general_comment_per_response")
      .on(t.responseId)
      .where(sql`${t.kind} = 'general_comment' AND ${t.withdrawnAt} IS NULL`),
    index("submission_items_live_idx").on(t.responseId, t.kind),
    index("submission_items_review_state_idx").on(t.reviewState),
    index("submission_items_disposition_idx").on(t.disposition),
    index("submission_items_topic_idx").on(t.topicId),
  ],
);

/**
 * One message in the private thread on a submission item.
 *
 * Both directions live here: staff answers and the asking student's linked
 * follow-ups (docs/product/specification.md §6.7). Readable only by the asker and authorized
 * course staff. Bodies never enter audit rows.
 */
export const privateResponses = pgTable(
  "private_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => studentSubmissionItems.id),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    authorRole: privateMessageRole("author_role").notNull().default("staff"),
    body: text("body").notNull(),
    /** makes a double-submitted send idempotent */
    clientToken: text("client_token"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedByUserId: uuid("removed_by_user_id").references(() => users.id),
    removedReason: text("removed_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("private_responses_item_idx").on(t.itemId),
    index("private_responses_thread_idx").on(t.itemId, t.createdAt),
    uniqueIndex("private_responses_client_token_unique")
      .on(t.itemId, t.clientToken)
      .where(sql`${t.clientToken} IS NOT NULL`),
    check(
      "removed_consistency",
      sql`(${t.removedAt} IS NULL) = (${t.removedByUserId} IS NULL)`,
    ),
  ],
);

/**
 * Which responses one reader has already read (GitHub issue #6).
 *
 * PER READER, and that is the design rather than an implementation shortcut. A
 * shared "seen" marker would let a student assistant's skim hide a submission
 * from the instructor who still has to decide on it — the queue would empty
 * without anyone having answered anything. One row per (response, reader) makes
 * that structurally impossible.
 *
 * A read marker is not a fact about the STUDENT: it records nothing about their
 * submission, changes no validity, no participation credit and no publication,
 * and is never projected into any student-facing read model. It is one staff
 * member's bookkeeping about their own afternoon.
 *
 * Distinct from `src/lib/reviewed-session.ts`, which answers a different
 * question — "did I act on this in THIS sitting?" — and is deliberately a
 * session cookie that expires with the browser. This table answers "have I read
 * it, ever, on any device", which is what has to survive a reload.
 *
 * Rows cascade with the response: a deleted response has nothing left to have
 * been read. `read_at` is kept rather than being implied by the row's existence,
 * so "unread since Monday" stays answerable without a schema change.
 */
export const responseReads = pgTable(
  "response_reads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => formResponses.id, { onDelete: "cascade" }),
    readerUserId: uuid("reader_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The identity of the fact: one reader has read one response once. Marking
    // twice must not accumulate rows, so the service upserts onto this.
    uniqueIndex("response_reads_reader_unique").on(t.responseId, t.readerUserId),
    // The read path is always "which of THESE responses have I read", so the
    // reader leads the index.
    index("response_reads_reader_idx").on(t.readerUserId, t.responseId),
  ],
);
