import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  accountMatches,
  enrollments,
  studentRecords,
  users,
} from "@/db/schema";
import { writeAudit } from "@/modules/audit";
import { AuthzError, requireSectionStaff } from "@/modules/authz";
import { classifyCandidates, scoreNames } from "./normalize";

/**
 * Account-match services (account-matching.md).
 * Policy: TEACHER-CONFIRM-ALL (D2 recommended default). The pipeline only
 * proposes; every binding requires an explicit staff confirmation. No code
 * path here auto-confirms anything.
 */

/**
 * (Re)generate match candidate rows for a user by comparing their Google
 * display name against actively-enrolled roster records that have no
 * confirmed match yet. Existing non-confirmed rows for the user are replaced.
 * Never touches confirmed rows.
 */
export async function generateMatchCandidates(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new AuthzError("Unknown user");

  const confirmed = await db.query.accountMatches.findFirst({
    where: and(
      eq(accountMatches.userId, userId),
      eq(accountMatches.state, "confirmed"),
    ),
  });
  if (confirmed) return { outcome: "already-confirmed" as const };

  // Candidate pool: records with an active enrollment somewhere and no
  // confirmed match to any user.
  const pool = await db
    .select({
      id: studentRecords.id,
      fullName: studentRecords.fullName,
    })
    .from(studentRecords)
    .innerJoin(enrollments, eq(enrollments.studentRecordId, studentRecords.id))
    .where(eq(enrollments.status, "active"))
    .groupBy(studentRecords.id);

  const confirmedRecords = await db
    .select({ recordId: accountMatches.studentRecordId })
    .from(accountMatches)
    .where(eq(accountMatches.state, "confirmed"));
  const taken = new Set(confirmedRecords.map((r) => r.recordId));

  const scored = pool
    .filter((r) => !taken.has(r.id))
    .map((r) => ({
      recordId: r.id,
      score: scoreNames(user.displayName, r.fullName),
    }));
  const outcome = classifyCandidates(scored);

  await db.transaction(async (tx) => {
    await tx
      .delete(accountMatches)
      .where(
        and(
          eq(accountMatches.userId, userId),
          ne(accountMatches.state, "confirmed"),
        ),
      );
    if (outcome.kind === "unmatched") {
      await tx.insert(accountMatches).values({
        userId,
        studentRecordId: null,
        state: "unmatched",
      });
    } else if (outcome.kind === "candidate") {
      await tx.insert(accountMatches).values({
        userId,
        studentRecordId: outcome.recordId,
        state: "candidate",
        confidence: { score: outcome.score },
      });
    } else {
      await tx.insert(accountMatches).values(
        outcome.candidates.map((c) => ({
          userId,
          studentRecordId: c.recordId,
          state: "ambiguous" as const,
          confidence: { score: c.score },
        })),
      );
    }
    await writeAudit(tx, {
      actorUserId: null,
      action: "match.candidates_generated",
      entityType: "user",
      entityId: userId,
      after: { outcome: outcome.kind },
    });
  });

  return { outcome: outcome.kind };
}

/**
 * Pending matches relevant to a section's roster, for the teacher match
 * dashboard. Staff-only.
 */
export async function listPendingMatchesForSection(
  actorUserId: string,
  sectionId: string,
) {
  await requireSectionStaff(db, actorUserId, sectionId, "viewStudentIdentities");
  const sectionRecords = await db
    .select({ id: enrollments.studentRecordId })
    .from(enrollments)
    .where(eq(enrollments.sectionId, sectionId));
  const ids = sectionRecords.map((r) => r.id);
  if (ids.length === 0) return [];
  return db.query.accountMatches.findMany({
    where: and(
      inArray(accountMatches.studentRecordId, ids),
      inArray(accountMatches.state, ["candidate", "ambiguous"]),
    ),
  });
}

async function requireStaffForMatchRecord(
  actorUserId: string,
  studentRecordId: string,
) {
  // The actor must be staff of at least one section where this record is enrolled.
  const rows = await db
    .select({ sectionId: enrollments.sectionId })
    .from(enrollments)
    .where(eq(enrollments.studentRecordId, studentRecordId));
  for (const row of rows) {
    try {
      await requireSectionStaff(db, actorUserId, row.sectionId, "viewStudentIdentities");
      return;
    } catch {
      // try next section
    }
  }
  throw new AuthzError("Not authorized for this student's sections");
}

/**
 * Teacher confirms a candidate/ambiguous match. Binds User ↔ StudentRecord;
 * sibling candidate rows become rejected. Audited with before/after.
 */
export async function confirmMatch(actorUserId: string, matchId: string) {
  const match = await db.query.accountMatches.findFirst({
    where: eq(accountMatches.id, matchId),
  });
  if (!match || !match.studentRecordId) {
    throw new AuthzError("Match not found");
  }
  if (!["candidate", "ambiguous", "correction_pending"].includes(match.state)) {
    throw new Error(`Cannot confirm a match in state ${match.state}`);
  }
  await requireStaffForMatchRecord(actorUserId, match.studentRecordId);

  await db.transaction(async (tx) => {
    await tx
      .update(accountMatches)
      .set({
        state: "confirmed",
        method: "teacher",
        confirmedByUserId: actorUserId,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accountMatches.id, matchId));
    // Sibling proposals for the same user are no longer valid.
    await tx
      .update(accountMatches)
      .set({ state: "rejected", updatedAt: new Date() })
      .where(
        and(
          eq(accountMatches.userId, match.userId),
          ne(accountMatches.id, matchId),
          inArray(accountMatches.state, ["candidate", "ambiguous", "unmatched"]),
        ),
      );
    await writeAudit(tx, {
      actorUserId,
      action: "match.confirmed",
      entityType: "account_match",
      entityId: matchId,
      before: { state: match.state },
      after: {
        state: "confirmed",
        userId: match.userId,
        studentRecordId: match.studentRecordId,
      },
    });
  });
}

export async function rejectMatch(actorUserId: string, matchId: string) {
  const match = await db.query.accountMatches.findFirst({
    where: eq(accountMatches.id, matchId),
  });
  if (!match || !match.studentRecordId) throw new AuthzError("Match not found");
  await requireStaffForMatchRecord(actorUserId, match.studentRecordId);
  await db.transaction(async (tx) => {
    await tx
      .update(accountMatches)
      .set({ state: "rejected", updatedAt: new Date() })
      .where(eq(accountMatches.id, matchId));
    await writeAudit(tx, {
      actorUserId,
      action: "match.rejected",
      entityType: "account_match",
      entityId: matchId,
      before: { state: match.state, studentRecordId: match.studentRecordId },
      after: { state: "rejected" },
    });
  });
}

/**
 * Correction after verification (account-matching.md §7): a confirmed match
 * was wrong. Moves the old binding to correction_pending, creates a new
 * candidate row for the correct record, and confirms it — all in one
 * transaction, fully audited with prior and new bindings.
 */
export async function correctMatch(
  actorUserId: string,
  confirmedMatchId: string,
  correctStudentRecordId: string,
) {
  const oldMatch = await db.query.accountMatches.findFirst({
    where: eq(accountMatches.id, confirmedMatchId),
  });
  if (!oldMatch || oldMatch.state !== "confirmed" || !oldMatch.studentRecordId) {
    throw new Error("Only a confirmed match can be corrected");
  }
  await requireStaffForMatchRecord(actorUserId, oldMatch.studentRecordId);
  await requireStaffForMatchRecord(actorUserId, correctStudentRecordId);

  await db.transaction(async (tx) => {
    await tx
      .update(accountMatches)
      .set({ state: "correction_pending", updatedAt: new Date() })
      .where(eq(accountMatches.id, confirmedMatchId));
    await writeAudit(tx, {
      actorUserId,
      action: "match.correction_started",
      entityType: "account_match",
      entityId: confirmedMatchId,
      before: {
        state: "confirmed",
        studentRecordId: oldMatch.studentRecordId,
      },
      after: { state: "correction_pending" },
    });

    await tx
      .update(accountMatches)
      .set({ state: "rejected", updatedAt: new Date() })
      .where(eq(accountMatches.id, confirmedMatchId));
    // A prior (rejected/candidate) row for the same pairing would collide
    // with the unique (userId, studentRecordId) index — clear it first.
    await tx
      .delete(accountMatches)
      .where(
        and(
          eq(accountMatches.userId, oldMatch.userId),
          eq(accountMatches.studentRecordId, correctStudentRecordId),
          ne(accountMatches.state, "confirmed"),
        ),
      );
    const [newMatch] = await tx
      .insert(accountMatches)
      .values({
        userId: oldMatch.userId,
        studentRecordId: correctStudentRecordId,
        state: "confirmed",
        method: "manual_correction",
        confirmedByUserId: actorUserId,
        confirmedAt: new Date(),
      })
      .returning();
    await writeAudit(tx, {
      actorUserId,
      action: "match.corrected",
      entityType: "account_match",
      entityId: newMatch!.id,
      before: {
        userId: oldMatch.userId,
        studentRecordId: oldMatch.studentRecordId,
      },
      after: {
        userId: oldMatch.userId,
        studentRecordId: correctStudentRecordId,
      },
    });
  });
}
