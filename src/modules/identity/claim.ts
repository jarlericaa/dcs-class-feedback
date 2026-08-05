import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accountMatches,
  enrollments,
  rosterClaims,
  studentRecords,
  users,
} from "@/db/schema";
import { env } from "@/env";
import { writeAudit } from "@/modules/audit";
import {
  AuthzError,
  requireActiveUser,
  requireSectionStaff,
} from "@/modules/authz";
import {
  last4,
  sealStudentNumber,
  studentNumberHash,
} from "@/modules/crypto/student-number";
import { scoreNames, STRONG_MATCH_THRESHOLD } from "./normalize";

/**
 * Student-initiated roster claiming (project-specs.md §6.1).
 *
 * The CRS class list carries no email address, so the student supplies the link:
 * they sign in, type their student number, and the system compares their Google
 * display name with that one unclaimed roster entry.
 *
 * ## The non-disclosure rule
 *
 * Everything that is not an immediate auto-confirm returns the SAME result:
 * `{ outcome: "submitted_for_review" }`. An unknown number, a number belonging to
 * someone else, a mismatched name and an ambiguous name are indistinguishable to
 * the caller. Without this, the claim form is a student-number oracle: an attacker
 * could enumerate valid numbers, and a "that number belongs to Maria Santos"
 * response would hand out a classmate's name.
 *
 * The real reason is recorded on the claim row for staff only.
 *
 * ## Policy
 *
 * Default is teacher-confirm-all (open-decisions.md D2). Auto-confirm exists but
 * is disabled unless `ROSTER_CLAIM_AUTO_CONFIRM=true`, and even then only for a
 * unique, high-confidence name match on an unclaimed record.
 */

export class ClaimThrottledError extends Error {
  readonly status = 429;
  constructor(readonly retryAfterSeconds: number) {
    super(
      "You have tried several times recently. Wait a little, then try again — or ask your teacher to link you.",
    );
    this.name = "ClaimThrottledError";
  }
}

export class ClaimInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimInputError";
  }
}

/** The ONLY shape a student ever receives. Never a name, never a record id. */
export type ClaimResult =
  | { outcome: "linked"; sectionCount: number }
  | { outcome: "submitted_for_review" };

export function autoConfirmPolicy(): { enabled: boolean; minScore: number } {
  return {
    enabled: env.rosterClaimAutoConfirm,
    minScore: env.rosterClaimAutoConfirmMinScore ?? STRONG_MATCH_THRESHOLD,
  };
}

/**
 * Submit a claim.
 *
 * Rate-limited per account: the claim form is the one place an unauthenticated-ish
 * user can probe the roster, so unlimited attempts would defeat the
 * non-disclosure rule by letting someone brute-force a number space.
 */
export async function submitRosterClaim(
  actorUserId: string,
  rawStudentNumber: string,
  now: Date = new Date(),
): Promise<ClaimResult> {
  const user = await requireActiveUser(db, actorUserId);
  const typed = rawStudentNumber.trim();
  if (!typed) throw new ClaimInputError("Enter your student number.");
  if (typed.length > 64) throw new ClaimInputError("That is not a student number.");

  // Throttle before doing any lookup, so a throttled attempt reveals nothing.
  const windowStart = new Date(now.getTime() - 60 * 60 * 1000);
  const recent = await db.query.rosterClaims.findMany({
    where: and(
      eq(rosterClaims.userId, actorUserId),
      gte(rosterClaims.createdAt, windowStart),
    ),
  });
  if (recent.length >= env.ROSTER_CLAIM_MAX_PER_HOUR) {
    throw new ClaimThrottledError(3600);
  }

  const hash = studentNumberHash(typed);
  const record = await db.query.studentRecords.findFirst({
    where: eq(studentRecords.studentNumberHash, hash),
  });

  // Already bound to this very user → nothing to do, and saying so is safe
  // because it is their own identity.
  const own = await db.query.accountMatches.findFirst({
    where: and(
      eq(accountMatches.userId, actorUserId),
      eq(accountMatches.state, "confirmed"),
    ),
  });

  const claimId = randomUUID();
  const sealed = sealStudentNumber(typed, claimId);

  let reason:
    | "no_roster_match"
    | "name_mismatch"
    | "name_ambiguous"
    | "already_claimed"
    | "user_already_confirmed"
    | "policy_confirm_all"
    | "exact_name_match";
  let nameScore: number | null = null;
  let takenByAnother = false;

  if (own) {
    reason = "user_already_confirmed";
  } else if (!record) {
    reason = "no_roster_match";
  } else {
    const claimed = await db.query.accountMatches.findFirst({
      where: and(
        eq(accountMatches.studentRecordId, record.id),
        eq(accountMatches.state, "confirmed"),
      ),
    });
    takenByAnother = !!claimed;
    nameScore = scoreNames(user.displayName, record.fullName);
    if (claimed) {
      reason = "already_claimed";
    } else {
      // Ambiguity here means the typed number's record is not clearly this
      // person — several roster names score as well as theirs.
      const rivals = await db.query.studentRecords.findMany({
        where: inArray(studentRecords.normalizedTokens, [record.normalizedTokens]),
      });
      const ambiguous = rivals.length > 1;
      const policy = autoConfirmPolicy();
      if (ambiguous) reason = "name_ambiguous";
      else if (nameScore >= policy.minScore) reason = "exact_name_match";
      else reason = "name_mismatch";
    }
  }

  const policy = autoConfirmPolicy();
  const canAutoConfirm =
    policy.enabled &&
    !!record &&
    !takenByAnother &&
    !own &&
    reason === "exact_name_match";

  return db.transaction(async (tx) => {
    // A student re-typing supersedes their open attempt, so the partial unique
    // index (one pending claim per user) stays satisfiable.
    await tx
      .update(rosterClaims)
      .set({ state: "superseded", updatedAt: now })
      .where(
        and(
          eq(rosterClaims.userId, actorUserId),
          eq(rosterClaims.state, "pending"),
        ),
      );

    let accountMatchId: string | null = null;
    let linkedSections = 0;

    if (canAutoConfirm && record) {
      const [created] = await tx
        .insert(accountMatches)
        .values({
          userId: actorUserId,
          studentRecordId: record.id,
          state: "confirmed",
          method: "auto_pipeline",
          confidence: { nameScore, source: "roster_claim" },
          confirmedAt: now,
        })
        .returning();
      accountMatchId = created!.id;
      const sections = await tx.query.enrollments.findMany({
        where: and(
          eq(enrollments.studentRecordId, record.id),
          eq(enrollments.status, "active"),
        ),
      });
      linkedSections = sections.length;
    }

    await tx.insert(rosterClaims).values({
      id: claimId,
      userId: actorUserId,
      typedNumberCiphertext: sealed.ciphertext,
      typedNumberHash: sealed.hash,
      typedNumberLast4: sealed.last4,
      matchedStudentRecordId: record?.id ?? null,
      accountMatchId,
      googleDisplayNameAtClaim: user.displayName,
      nameScore,
      state: canAutoConfirm ? "auto_confirmed" : "pending",
      reason: canAutoConfirm ? "exact_name_match" : reason,
      resolvedByUserId: null,
      resolvedAt: canAutoConfirm ? now : null,
    });

    await writeAudit(tx, {
      actorUserId,
      action: canAutoConfirm ? "claim.auto_confirmed" : "claim.submitted",
      entityType: "roster_claim",
      entityId: claimId,
      // The typed number is PII; only its tail and the outcome are recorded.
      metadata: {
        typedLast4: sealed.last4,
        reason: canAutoConfirm ? "exact_name_match" : reason,
        nameScore,
      },
    });

    return canAutoConfirm
      ? ({ outcome: "linked", sectionCount: linkedSections } as const)
      : ({ outcome: "submitted_for_review" } as const);
  });
}

/** What the student sees about their own claim. Their own data only. */
export async function getMyClaimStatus(actorUserId: string): Promise<
  | { kind: "confirmed"; studentRecordId: string }
  | { kind: "pending"; typedLast4: string; submittedAt: Date }
  | { kind: "none" }
> {
  const confirmed = await db.query.accountMatches.findFirst({
    where: and(
      eq(accountMatches.userId, actorUserId),
      eq(accountMatches.state, "confirmed"),
    ),
  });
  if (confirmed?.studentRecordId) {
    return { kind: "confirmed", studentRecordId: confirmed.studentRecordId };
  }
  const pending = await db.query.rosterClaims.findFirst({
    where: and(
      eq(rosterClaims.userId, actorUserId),
      eq(rosterClaims.state, "pending"),
    ),
    orderBy: desc(rosterClaims.createdAt),
  });
  if (pending) {
    return {
      kind: "pending",
      typedLast4: pending.typedNumberLast4,
      submittedAt: pending.createdAt,
    };
  }
  return { kind: "none" };
}

export interface ClaimReviewRow {
  claim: typeof rosterClaims.$inferSelect;
  account: { id: string; displayName: string; email: string };
  /** null when the typed number matched no roster record at all */
  record: { id: string; fullName: string; studentNumberLast4: string | null } | null;
  /** the reason, spelled out for staff */
  explanation: string;
}

const REASON_EXPLANATION: Record<string, string> = {
  no_roster_match: "The number they typed is not on any roster.",
  name_mismatch:
    "The number is on the roster, but their Google name does not look like that student.",
  name_ambiguous:
    "More than one roster entry has a similar name, so this cannot be resolved automatically.",
  already_claimed: "That roster entry is already linked to another account.",
  user_already_confirmed: "This account is already linked to a roster entry.",
  policy_confirm_all: "Waiting for confirmation (all claims are confirmed by staff).",
  exact_name_match: "The name matches closely; confirm to link.",
};

/** Pending claims for this section's roster. Staff-only. */
export async function listClaimsForSection(
  actorUserId: string,
  sectionId: string,
): Promise<ClaimReviewRow[]> {
  await requireSectionStaff(db, actorUserId, sectionId, "viewStudentIdentities", {
    allowArchived: true,
  });
  const enrolled = await db
    .select({ studentRecordId: enrollments.studentRecordId })
    .from(enrollments)
    .where(eq(enrollments.sectionId, sectionId));
  const recordIds = enrolled.map((e) => e.studentRecordId);

  // Claims that matched one of this section's records, plus claims that matched
  // nothing at all — a student who typed a wrong number still needs help, and no
  // section would otherwise own their claim.
  const claims = await db.query.rosterClaims.findMany({
    where: eq(rosterClaims.state, "pending"),
    orderBy: desc(rosterClaims.createdAt),
  });
  const relevant = claims.filter(
    (claim) =>
      claim.matchedStudentRecordId === null ||
      recordIds.includes(claim.matchedStudentRecordId),
  );
  if (relevant.length === 0) return [];

  const accounts = await db.query.users.findMany({
    where: inArray(users.id, [...new Set(relevant.map((c) => c.userId))]),
  });
  const accountById = new Map(accounts.map((u) => [u.id, u]));
  const matchedIds = relevant
    .map((c) => c.matchedStudentRecordId)
    .filter((v): v is string => v !== null);
  const records = matchedIds.length
    ? await db.query.studentRecords.findMany({
        where: inArray(studentRecords.id, matchedIds),
      })
    : [];
  const recordById = new Map(records.map((r) => [r.id, r]));

  return relevant.map((claim) => {
    const account = accountById.get(claim.userId)!;
    const record = claim.matchedStudentRecordId
      ? recordById.get(claim.matchedStudentRecordId)
      : undefined;
    return {
      claim,
      account: {
        id: account.id,
        displayName: account.displayName,
        email: account.email,
      },
      record: record
        ? {
            id: record.id,
            fullName: record.fullName,
            studentNumberLast4: record.studentNumberLast4,
          }
        : null,
      explanation: REASON_EXPLANATION[claim.reason] ?? claim.reason,
    };
  });
}

/**
 * Staff resolve a claim.
 *
 * Confirming takes an explicit `studentRecordId` rather than trusting the one the
 * claim matched, so staff can fix a mistyped number without the student having to
 * try again.
 */
export async function resolveRosterClaim(
  actorUserId: string,
  claimId: string,
  decision:
    | { kind: "confirm"; studentRecordId: string }
    | { kind: "reject"; reason: string },
  now: Date = new Date(),
): Promise<{ accountMatchId: string | null }> {
  const claim = await db.query.rosterClaims.findFirst({
    where: eq(rosterClaims.id, claimId),
  });
  if (!claim) throw new AuthzError("Claim not found");
  if (claim.state !== "pending") {
    throw new Error("This claim has already been resolved.");
  }

  const targetRecordId =
    decision.kind === "confirm"
      ? decision.studentRecordId
      : claim.matchedStudentRecordId;

  // Authorization is scoped by the RECORD's sections: staff may only resolve a
  // claim against a student on a section they hold identities for.
  if (targetRecordId) {
    const sections = await db
      .select({ sectionId: enrollments.sectionId })
      .from(enrollments)
      .where(eq(enrollments.studentRecordId, targetRecordId));
    let permitted = false;
    for (const row of sections) {
      try {
        await requireSectionStaff(
          db,
          actorUserId,
          row.sectionId,
          "viewStudentIdentities",
        );
        permitted = true;
        break;
      } catch {
        // try the next section
      }
    }
    if (!permitted) {
      throw new AuthzError("Not authorized for this student's sections");
    }
  } else {
    // A claim that matched nothing has no section to scope against. Only a
    // teacher-capable account may dispose of it.
    const actor = await requireActiveUser(db, actorUserId);
    if (!actor.isTeacher) throw new AuthzError("Not authorized to resolve this claim");
  }

  return db.transaction(async (tx) => {
    let accountMatchId: string | null = null;

    if (decision.kind === "confirm") {
      const taken = await tx.query.accountMatches.findFirst({
        where: and(
          eq(accountMatches.studentRecordId, decision.studentRecordId),
          eq(accountMatches.state, "confirmed"),
        ),
      });
      if (taken) {
        throw new Error(
          "That roster entry is already linked to another account. Unlink it first.",
        );
      }
      const [created] = await tx
        .insert(accountMatches)
        .values({
          userId: claim.userId,
          studentRecordId: decision.studentRecordId,
          state: "confirmed",
          method: "teacher",
          confidence: { nameScore: claim.nameScore, source: "roster_claim" },
          confirmedByUserId: actorUserId,
          confirmedAt: now,
        })
        .returning();
      accountMatchId = created!.id;
    }

    const updated = await tx
      .update(rosterClaims)
      .set({
        state: decision.kind === "confirm" ? "confirmed" : "rejected",
        accountMatchId,
        matchedStudentRecordId:
          decision.kind === "confirm"
            ? decision.studentRecordId
            : claim.matchedStudentRecordId,
        resolvedByUserId: actorUserId,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(rosterClaims.id, claimId), eq(rosterClaims.state, "pending")),
      )
      .returning({ id: rosterClaims.id });
    if (updated.length === 0) {
      throw new Error("This claim was already resolved. Reload and try again.");
    }

    await writeAudit(tx, {
      actorUserId,
      action: decision.kind === "confirm" ? "claim.confirmed" : "claim.rejected",
      entityType: "roster_claim",
      entityId: claimId,
      before: { state: "pending", reason: claim.reason },
      after: {
        state: decision.kind === "confirm" ? "confirmed" : "rejected",
        studentRecordId:
          decision.kind === "confirm" ? decision.studentRecordId : null,
      },
      metadata:
        decision.kind === "reject" ? { reason: decision.reason } : undefined,
    });

    return { accountMatchId };
  });
}

/** Exported for tests: the tail of a typed number, without decrypting. */
export const claimLast4 = last4;
