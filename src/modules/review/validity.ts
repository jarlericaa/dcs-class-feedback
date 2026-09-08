import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  formResponses,
  submissionValidityEvents,
  users,
} from "@/db/schema";
import { writeAudit, type AuditAction } from "@/modules/audit";
import {
  requireEnrolledStudent,
  requireInstructorSectionCapability,
  requireSectionStaff,
} from "@/modules/authz";
import { enqueueValidityChanged } from "@/modules/email/outbox";

/**
 * The three-state validity workflow (docs/product/specification.md §6.5, docs/domain/domain-model.md §3.3).
 *
 * The point of this module is the split between FLAGGING and FINALIZING:
 *
 * - A Student Assistant may **flag** with a required reason (`flagValidity`).
 * - Only an **Instructor** may confirm a flag, reject a flag, invalidate
 *   directly, or restore. `requireInstructorSectionCapability` demands the
 *   permission AND a non-TA section role, so a TA who has been granted
 *   `markValidity` is still refused — the specification says a Student Assistant
 *   cannot finalize invalidity, and a boolean must not be able to grant it.
 *
 * A flagged response KEEPS its participation credit (decision D15): a flag is an
 * unconfirmed suspicion, so credit changes exactly once, when an Instructor
 * decides, and the student is never told a flag exists.
 *
 * Every transition is a state-guarded UPDATE plus one event row plus one audit
 * row in a single transaction, so two concurrent decisions cannot both apply and
 * no transition can be recorded twice.
 */

export type ValidityState = "valid" | "flagged" | "invalid";
export type ValidityAction =
  | "flag"
  | "confirm_flag"
  | "reject_flag"
  | "invalidate"
  | "restore";
export type InvalidationReason =
  | "spam"
  | "abusive_content"
  | "empty_or_meaningless"
  | "irrelevant"
  | "bad_faith_credit_attempt";

export class ValidityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidityError";
  }
}

/** Someone else decided first. Retrying with fresh state is the only fix. */
export class ValidityConflictError extends ValidityError {
  constructor(
    message = "Someone else already changed this submission's validity. Reload and check the current decision.",
  ) {
    super(message);
    this.name = "ValidityConflictError";
  }
}

/** Legal transitions. The only source of truth for what may follow what. */
export const VALIDITY_TRANSITIONS: Record<ValidityState, ValidityAction[]> = {
  valid: ["flag", "invalidate"],
  flagged: ["confirm_flag", "reject_flag"],
  invalid: ["restore"],
};

const RESULT_OF: Record<ValidityAction, ValidityState> = {
  flag: "flagged",
  confirm_flag: "invalid",
  reject_flag: "valid",
  invalidate: "invalid",
  restore: "valid",
};

const AUDIT_OF: Record<ValidityAction, AuditAction> = {
  flag: "validity.flagged",
  confirm_flag: "validity.flag_confirmed",
  reject_flag: "validity.flag_rejected",
  invalidate: "validity.invalidated",
  restore: "validity.restored",
};

/** Pure: the state an action produces, or a thrown error if it is illegal. */
export function nextValidity(
  current: ValidityState,
  action: ValidityAction,
): ValidityState {
  if (!VALIDITY_TRANSITIONS[current].includes(action)) {
    throw new ValidityError(
      `Cannot ${action.replace(/_/g, " ")} a submission that is currently ${current}.`,
    );
  }
  return RESULT_OF[action];
}

async function loadResponseSection(responseId: string) {
  const response = await db.query.formResponses.findFirst({
    where: eq(formResponses.id, responseId),
  });
  if (!response) throw new ValidityError("Response not found");
  // The RESPONSE's own section, not the instance's: a shared form has several,
  // and a validity decision belongs to the section the student answered through.
  return { response, sectionId: response.sectionId };
}

/** The actor's standing, snapshotted onto the event row. */
async function actorRoleFor(
  actorUserId: string,
  sectionId: string,
): Promise<string> {
  const membership = await db.query.sectionStaff.findFirst({
    where: (t, { and: a, eq: e }) =>
      a(e(t.sectionId, sectionId), e(t.userId, actorUserId)),
  });
  return membership?.role ?? "course_staff";
}

interface TransitionInput {
  action: ValidityAction;
  reason?: InvalidationReason;
  staffNote?: string;
  studentVisibleReason?: string;
}

async function applyTransition(
  actorUserId: string,
  responseId: string,
  input: TransitionInput,
) {
  const { response, sectionId } = await loadResponseSection(responseId);

  if (input.action === "flag") {
    await requireSectionStaff(db, actorUserId, sectionId, "flagValidity");
  } else {
    // Permission AND non-TA role. A TA holding markValidity is refused here.
    await requireInstructorSectionCapability(
      db,
      actorUserId,
      sectionId,
      "markValidity",
    );
  }

  const prior = response.validity as ValidityState;
  const next = nextValidity(prior, input.action);

  if (input.action !== "reject_flag" && input.action !== "restore" && !input.reason) {
    throw new ValidityError("A reason is required.");
  }
  if (next === "invalid" && !input.studentVisibleReason?.trim()) {
    throw new ValidityError(
      "A student-visible reason is required: the student is told why their submission did not count.",
    );
  }

  const actorRole = await actorRoleFor(actorUserId, sectionId);

  await db.transaction(async (tx) => {
    // State-guarded: if someone else already moved this response on, 0 rows come
    // back and we abort rather than recording a second, contradictory decision.
    const updated = await tx
      .update(formResponses)
      .set({
        validity: next,
        invalidationReason:
          next === "valid" ? null : (input.reason ?? response.invalidationReason),
        invalidationNote:
          next === "valid" ? null : (input.staffNote ?? response.invalidationNote),
        studentVisibleReason:
          next === "invalid" ? input.studentVisibleReason!.trim() : null,
        validityUpdatedByUserId: actorUserId,
        validityUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(formResponses.id, responseId), eq(formResponses.validity, prior)),
      )
      .returning({ id: formResponses.id });
    if (updated.length === 0) throw new ValidityConflictError();

    await tx.insert(submissionValidityEvents).values({
      responseId,
      action: input.action,
      priorValidity: prior,
      newValidity: next,
      reason: next === "valid" ? null : (input.reason ?? response.invalidationReason),
      staffNote: input.staffNote ?? null,
      studentVisibleReason:
        next === "invalid" ? input.studentVisibleReason!.trim() : null,
      actorUserId,
      actorRole,
    });

    await writeAudit(tx, {
      actorUserId,
      action: AUDIT_OF[input.action],
      entityType: "form_response",
      entityId: responseId,
      before: {
        validity: prior,
        invalidationReason: response.invalidationReason,
      },
      after: { validity: next, invalidationReason: input.reason ?? null },
      metadata: { actorRole },
      sectionId,
    });

    // The student is emailed only about a decision that affects their credit —
    // never about a flag, which they must not learn about at all.
    if (next === "invalid") {
      await enqueueValidityChanged(tx, responseId, "invalid");
    } else if (prior === "invalid" && next === "valid") {
      await enqueueValidityChanged(tx, responseId, "valid");
    }
  });

  return { prior, next };
}

/** Student Assistant (or Instructor) raises a suspicion. Credit is unaffected. */
export function flagSubmission(
  actorUserId: string,
  responseId: string,
  input: { reason: InvalidationReason; note?: string },
) {
  return applyTransition(actorUserId, responseId, {
    action: "flag",
    reason: input.reason,
    staffNote: input.note,
  });
}

/** Instructor upholds a flag: the submission becomes invalid and loses credit. */
export function confirmFlag(
  actorUserId: string,
  responseId: string,
  input: { studentVisibleReason: string; reason?: InvalidationReason; note?: string },
) {
  return applyTransition(actorUserId, responseId, {
    action: "confirm_flag",
    reason: input.reason,
    staffNote: input.note,
    studentVisibleReason: input.studentVisibleReason,
  });
}

/** Instructor dismisses a flag. The submission was always credited. */
export function rejectFlag(
  actorUserId: string,
  responseId: string,
  input: { note?: string } = {},
) {
  return applyTransition(actorUserId, responseId, {
    action: "reject_flag",
    staffNote: input.note,
  });
}

/** Instructor invalidates without a prior flag. */
export function invalidateSubmission(
  actorUserId: string,
  responseId: string,
  input: {
    reason: InvalidationReason;
    studentVisibleReason: string;
    note?: string;
  },
) {
  return applyTransition(actorUserId, responseId, {
    action: "invalidate",
    reason: input.reason,
    staffNote: input.note,
    studentVisibleReason: input.studentVisibleReason,
  });
}

/** Instructor restores credit. */
export function restoreSubmission(
  actorUserId: string,
  responseId: string,
  input: { note?: string } = {},
) {
  return applyTransition(actorUserId, responseId, {
    action: "restore",
    staffNote: input.note,
  });
}

export interface ValidityEventView {
  id: string;
  action: ValidityAction;
  priorValidity: ValidityState;
  newValidity: ValidityState;
  reason: string | null;
  staffNote: string | null;
  studentVisibleReason: string | null;
  actorName: string;
  actorRole: string;
  createdAt: Date;
}

/** STAFF-ONLY timeline for one response. */
export async function getValidityHistory(
  actorUserId: string,
  responseId: string,
): Promise<ValidityEventView[]> {
  const { sectionId } = await loadResponseSection(responseId);
  await requireSectionStaff(db, actorUserId, sectionId, "reviewResponses", {
    allowArchived: true,
  });
  const rows = await db.query.submissionValidityEvents.findMany({
    where: eq(submissionValidityEvents.responseId, responseId),
    orderBy: asc(submissionValidityEvents.createdAt),
  });
  const actorIds = [...new Set(rows.map((r) => r.actorUserId))];
  const actors = actorIds.length
    ? await db.query.users.findMany({ where: inArray(users.id, actorIds) })
    : [];
  const byId = new Map(actors.map((u) => [u.id, u]));
  return rows.map((row) => ({
    id: row.id,
    action: row.action as ValidityAction,
    priorValidity: row.priorValidity as ValidityState,
    newValidity: row.newValidity as ValidityState,
    reason: row.reason,
    staffNote: row.staffNote,
    studentVisibleReason: row.studentVisibleReason,
    actorName: byId.get(row.actorUserId)?.displayName ?? "Unknown",
    actorRole: row.actorRole,
    createdAt: row.createdAt,
  }));
}

export interface OwnValidityView {
  responseId: string;
  cycleId: string;
  counted: boolean;
  /** The ONLY reason text a student may read. */
  reason: string | null;
}

/**
 * What a STUDENT may see about their own submissions.
 *
 * Deliberately a narrow projection built by hand rather than a filtered row:
 * `flagged` collapses to `counted: true`, and no actor, internal reason enum, or
 * staff note is present at all — so there is nothing to leak even if a caller
 * spreads the object into a payload.
 */
export async function getOwnValidity(
  userId: string,
  sectionId: string,
): Promise<Map<string, OwnValidityView>> {
  const record = await requireEnrolledStudent(db, userId, sectionId, {
    allowArchived: true,
  });
  // Responses carry their own section, so this needs no instance join — and a
  // shared form's responses from OTHER sections cannot appear here even by
  // accident.
  const rows = await db.query.formResponses.findMany({
    where: and(
      eq(formResponses.studentRecordId, record.id),
      eq(formResponses.sectionId, sectionId),
      inArray(formResponses.lifecycle, ["submitted", "locked"]),
    ),
  });
  return new Map(
    rows.map((row) => [
      row.cycleId,
      {
        responseId: row.id,
        cycleId: row.cycleId,
        counted: row.validity !== "invalid",
        reason: row.validity === "invalid" ? row.studentVisibleReason : null,
      },
    ]),
  );
}
