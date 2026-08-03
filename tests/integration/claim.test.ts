import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  confirmMatchDirect,
  enroll,
  makeCourse,
  makeSection,
  makeStudentRecord,
  makeUser,
} from "./fixtures";
import { accountMatches, auditEvents, rosterClaims } from "@/db/schema";
import {
  ClaimThrottledError,
  getMyClaimStatus,
  listClaimsForSection,
  resolveRosterClaim,
  submitRosterClaim,
} from "@/modules/identity/claim";
import { unlinkMatch } from "@/modules/identity/matching";
import { AuthzError, requireEnrolledStudent } from "@/modules/authz";

async function setup() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  const record = await makeStudentRecord("Juan Dela Cruz", "2026-00042");
  await enroll(section.id, record.id);
  return { teacher, course, section, record };
}

describe("student roster claim", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("records a pending claim under the default teacher-confirm-all policy", async () => {
    const { record } = await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });

    const result = await submitRosterClaim(student.id, "2026-00042");
    expect(result).toEqual({ outcome: "submitted_for_review" });

    const claim = (await db.query.rosterClaims.findFirst())!;
    expect(claim.state).toBe("pending");
    expect(claim.matchedStudentRecordId).toBe(record.id);
    // The typed number is never stored in the clear.
    expect(claim.typedNumberCiphertext).not.toContain("2026");
    expect(claim.typedNumberLast4).toBe("0042");
    // Nothing is linked yet.
    const matches = await db.query.accountMatches.findMany();
    expect(matches).toHaveLength(0);
  });

  /**
   * The core privacy property (project-specs.md §6.1): the claim form must not be
   * usable as a student-number oracle, and must never hand out a classmate's name.
   */
  it("returns a byte-identical result for unknown, taken and mismatched numbers", async () => {
    const { teacher, record } = await setup();

    const unknownUser = await makeUser({ displayName: "Someone Else" });
    const unknown = await submitRosterClaim(unknownUser.id, "9999-99999");

    const takenRecord = await makeStudentRecord("Maria Santos", "2026-00777");
    const owner = await makeUser({ displayName: "Maria Santos" });
    await confirmMatchDirect(owner.id, takenRecord.id, teacher.id);
    const thief = await makeUser({ displayName: "Not Maria" });
    const taken = await submitRosterClaim(thief.id, "2026-00777");

    const mismatchUser = await makeUser({ displayName: "Completely Different" });
    const mismatch = await submitRosterClaim(mismatchUser.id, "2026-00042");

    expect(JSON.stringify(unknown)).toBe(JSON.stringify(taken));
    expect(JSON.stringify(taken)).toBe(JSON.stringify(mismatch));

    // And no result mentions a name or a record id anywhere.
    for (const result of [unknown, taken, mismatch]) {
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("Maria");
      expect(serialized).not.toContain(record.id);
      expect(serialized).not.toContain(takenRecord.id);
    }
  });

  it("records the real reason for staff even though the student is told nothing", async () => {
    await setup();
    const unknownUser = await makeUser({ displayName: "Someone Else" });
    await submitRosterClaim(unknownUser.id, "9999-99999");
    const claim = (await db.query.rosterClaims.findFirst())!;
    expect(claim.reason).toBe("no_roster_match");
    expect(claim.matchedStudentRecordId).toBeNull();
  });

  it("throttles repeated attempts so the number space cannot be brute-forced", async () => {
    await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    for (let i = 0; i < 5; i++) {
      await submitRosterClaim(student.id, `2026-0000${i}`);
    }
    await expect(submitRosterClaim(student.id, "2026-00042")).rejects.toBeInstanceOf(
      ClaimThrottledError,
    );
  });

  it("supersedes the previous pending claim rather than piling them up", async () => {
    await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    await submitRosterClaim(student.id, "2026-00001");
    await submitRosterClaim(student.id, "2026-00042");
    const claims = await db.query.rosterClaims.findMany();
    expect(claims).toHaveLength(2);
    expect(claims.filter((c) => c.state === "pending")).toHaveLength(1);
    expect(claims.filter((c) => c.state === "superseded")).toHaveLength(1);
  });

  it("auto-confirms only when the policy flag is on and the name matches", async () => {
    const { record } = await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });

    vi.stubEnv("ROSTER_CLAIM_AUTO_CONFIRM", "true");
    vi.resetModules();
    const { submitRosterClaim: submitWithAuto } = await import(
      "@/modules/identity/claim"
    );
    const result = await submitWithAuto(student.id, "2026-00042");
    vi.unstubAllEnvs();
    vi.resetModules();

    expect(result.outcome).toBe("linked");
    const match = (await db.query.accountMatches.findFirst())!;
    expect(match.state).toBe("confirmed");
    expect(match.studentRecordId).toBe(record.id);
    expect(match.method).toBe("auto_pipeline");
  });

  it("shows the student only their own claim status", async () => {
    await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    expect(await getMyClaimStatus(student.id)).toEqual({ kind: "none" });
    await submitRosterClaim(student.id, "2026-00042");
    const status = await getMyClaimStatus(student.id);
    expect(status.kind).toBe("pending");
    if (status.kind === "pending") expect(status.typedLast4).toBe("0042");
  });
});

describe("staff claim resolution", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("lists pending claims with both names side by side", async () => {
    const { teacher, section } = await setup();
    const student = await makeUser({ displayName: "Juan D. Cruz" });
    await submitRosterClaim(student.id, "2026-00042");

    const rows = await listClaimsForSection(teacher.id, section.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.account.displayName).toBe("Juan D. Cruz");
    expect(rows[0]!.record!.fullName).toBe("Juan Dela Cruz");
    // Staff see the tail, not the number.
    expect(rows[0]!.record!.studentNumberLast4).toBe("0042");
    expect(rows[0]!.explanation).toBeTruthy();
  });

  it("confirming links the account and audits it", async () => {
    const { teacher, section, record } = await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    await submitRosterClaim(student.id, "2026-00042");
    const claim = (await db.query.rosterClaims.findFirst())!;

    const { accountMatchId } = await resolveRosterClaim(teacher.id, claim.id, {
      kind: "confirm",
      studentRecordId: record.id,
    });
    expect(accountMatchId).toBeTruthy();

    // The student now has section access.
    await expect(
      requireEnrolledStudent(db, student.id, section.id),
    ).resolves.toBeTruthy();

    const audit = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "claim.confirmed"),
    });
    expect(audit).toBeTruthy();
  });

  it("refuses to confirm a record that is already linked to someone else", async () => {
    const { teacher, record } = await setup();
    const owner = await makeUser({ displayName: "Juan Dela Cruz" });
    await confirmMatchDirect(owner.id, record.id, teacher.id);

    const other = await makeUser({ displayName: "Juan Dela Cruz" });
    await submitRosterClaim(other.id, "2026-00042");
    const claim = (await db.query.rosterClaims.findFirst({
      where: eq(rosterClaims.userId, other.id),
    }))!;

    await expect(
      resolveRosterClaim(teacher.id, claim.id, {
        kind: "confirm",
        studentRecordId: record.id,
      }),
    ).rejects.toThrow(/already linked/);
  });

  it("lets staff fix a mistyped number by confirming a different record", async () => {
    const { teacher, section } = await setup();
    const right = await makeStudentRecord("Ana Reyes", "2026-00555");
    await enroll(section.id, right.id);
    const student = await makeUser({ displayName: "Ana Reyes" });
    // They typed someone else's number by mistake.
    await submitRosterClaim(student.id, "2026-00042");
    const claim = (await db.query.rosterClaims.findFirst())!;

    await resolveRosterClaim(teacher.id, claim.id, {
      kind: "confirm",
      studentRecordId: right.id,
    });
    const match = (await db.query.accountMatches.findFirst())!;
    expect(match.studentRecordId).toBe(right.id);
  });

  it("resolving twice is refused rather than creating a second link", async () => {
    const { teacher, record } = await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    await submitRosterClaim(student.id, "2026-00042");
    const claim = (await db.query.rosterClaims.findFirst())!;
    await resolveRosterClaim(teacher.id, claim.id, {
      kind: "confirm",
      studentRecordId: record.id,
    });
    await expect(
      resolveRosterClaim(teacher.id, claim.id, {
        kind: "confirm",
        studentRecordId: record.id,
      }),
    ).rejects.toThrow(/already been resolved/);
    expect(await db.query.accountMatches.findMany()).toHaveLength(1);
  });

  it("refuses a student, an unrelated teacher, and a TA without the identity flag", async () => {
    const { section, record } = await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    await submitRosterClaim(student.id, "2026-00042");
    const claim = (await db.query.rosterClaims.findFirst())!;

    const outsider = await makeUser({ isTeacher: true });
    const ta = await makeUser({});
    await addSectionStaff(section.id, ta.id, "ta", { reviewResponses: true });

    for (const actor of [student.id, outsider.id, ta.id]) {
      await expect(
        listClaimsForSection(actor, section.id),
      ).rejects.toBeInstanceOf(AuthzError);
      await expect(
        resolveRosterClaim(actor, claim.id, {
          kind: "confirm",
          studentRecordId: record.id,
        }),
      ).rejects.toBeInstanceOf(AuthzError);
    }
  });

  it("allows a TA who does hold view_student_identities", async () => {
    const { section, record } = await setup();
    const ta = await makeUser({});
    await addSectionStaff(section.id, ta.id, "ta", {
      viewStudentIdentities: true,
    });
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    await submitRosterClaim(student.id, "2026-00042");
    const claim = (await db.query.rosterClaims.findFirst())!;
    await expect(
      resolveRosterClaim(ta.id, claim.id, {
        kind: "confirm",
        studentRecordId: record.id,
      }),
    ).resolves.toBeTruthy();
  });
});

describe("unlinking a confirmed identity", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("revokes access, keeps the data, and can be re-linked", async () => {
    const { teacher, section, record } = await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    const match = await confirmMatchDirect(student.id, record.id, teacher.id);

    await expect(
      requireEnrolledStudent(db, student.id, section.id),
    ).resolves.toBeTruthy();

    await unlinkMatch(teacher.id, match.id, "Wrong person confirmed");

    // Access is gone immediately.
    await expect(
      requireEnrolledStudent(db, student.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);

    // Nothing was deleted: the enrolment and the record still stand.
    const enrolments = await db.query.enrollments.findMany();
    expect(enrolments).toHaveLength(1);
    const records = await db.query.studentRecords.findMany();
    expect(records).toHaveLength(1);

    const audit = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "match.unlinked"),
    });
    expect(audit).toBeTruthy();
    expect(audit!.after).toMatchObject({ reason: "Wrong person confirmed" });

    // The record is free again, so the right person can be linked.
    const rightful = await makeUser({ displayName: "Juan Dela Cruz" });
    await expect(
      confirmMatchDirect(rightful.id, record.id, teacher.id),
    ).resolves.toBeTruthy();
  });

  it("requires a reason", async () => {
    const { teacher, record } = await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    const match = await confirmMatchDirect(student.id, record.id, teacher.id);
    await expect(unlinkMatch(teacher.id, match.id, "   ")).rejects.toThrow(
      /reason is required/,
    );
  });

  it("refuses an unrelated teacher and a non-confirmed match", async () => {
    const { teacher, record } = await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    const match = await confirmMatchDirect(student.id, record.id, teacher.id);

    const outsider = await makeUser({ isTeacher: true });
    await expect(
      unlinkMatch(outsider.id, match.id, "because"),
    ).rejects.toBeInstanceOf(AuthzError);

    await unlinkMatch(teacher.id, match.id, "first unlink");
    await expect(unlinkMatch(teacher.id, match.id, "again")).rejects.toThrow(
      /confirmed identity can be unlinked/,
    );
  });

  it("does not leak the unlink reason to the student's own claim status", async () => {
    const { teacher, record } = await setup();
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    const match = await confirmMatchDirect(student.id, record.id, teacher.id);
    await unlinkMatch(teacher.id, match.id, "internal staff note about conduct");

    const status = await getMyClaimStatus(student.id);
    expect(JSON.stringify(status)).not.toContain("conduct");
    // A rejected match is not a pending claim either.
    const rows = await db.query.accountMatches.findMany({
      where: and(
        eq(accountMatches.userId, student.id),
        eq(accountMatches.state, "rejected"),
      ),
    });
    expect(rows).toHaveLength(1);
  });
});
