import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  enroll,
  makeCourse,
  makeSection,
  makeStudentRecord,
  makeUser,
} from "./fixtures";
import { accountMatches, auditEvents } from "@/db/schema";
import {
  confirmMatch,
  correctMatch,
  generateMatchCandidates,
} from "@/modules/identity/matching";
import { AuthzError } from "@/modules/authz";

describe("account matching (teacher-confirm-all)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function sectionWithTeacher() {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    return { teacher, course, section };
  }

  it("single strong match produces a candidate — never auto-confirmed", async () => {
    const { section } = await sectionWithTeacher();
    const record = await makeStudentRecord("Juan Dela Cruz");
    await enroll(section.id, record.id);
    const student = await makeUser({ displayName: "Juan Dela Cruz" });

    const { outcome } = await generateMatchCandidates(student.id);
    expect(outcome).toBe("candidate");

    const rows = await db.query.accountMatches.findMany({
      where: eq(accountMatches.userId, student.id),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe("candidate"); // NOT confirmed
  });

  it("two similar roster names → ambiguous rows requiring teacher pick", async () => {
    const { section } = await sectionWithTeacher();
    const r1 = await makeStudentRecord("Maria Santos");
    const r2 = await makeStudentRecord("Maria Santos");
    await enroll(section.id, r1.id);
    await enroll(section.id, r2.id);
    const student = await makeUser({ displayName: "Maria Santos" });

    const { outcome } = await generateMatchCandidates(student.id);
    expect(outcome).toBe("ambiguous");
    const rows = await db.query.accountMatches.findMany({
      where: eq(accountMatches.userId, student.id),
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.state === "ambiguous")).toBe(true);
  });

  it("no plausible roster name → unmatched (pending verification)", async () => {
    const { section } = await sectionWithTeacher();
    const record = await makeStudentRecord("Juan Dela Cruz");
    await enroll(section.id, record.id);
    const student = await makeUser({ displayName: "Completely Different" });

    const { outcome } = await generateMatchCandidates(student.id);
    expect(outcome).toBe("unmatched");
  });

  it("teacher confirm binds the user, rejects siblings, and audits", async () => {
    const { teacher, section } = await sectionWithTeacher();
    const r1 = await makeStudentRecord("Maria Santos");
    const r2 = await makeStudentRecord("Maria Santos");
    await enroll(section.id, r1.id);
    await enroll(section.id, r2.id);
    const student = await makeUser({ displayName: "Maria Santos" });
    await generateMatchCandidates(student.id);

    const rows = await db.query.accountMatches.findMany({
      where: eq(accountMatches.userId, student.id),
    });
    const pick = rows.find((r) => r.studentRecordId === r1.id)!;
    await confirmMatch(teacher.id, pick.id);

    const after = await db.query.accountMatches.findMany({
      where: eq(accountMatches.userId, student.id),
    });
    expect(after.find((r) => r.id === pick.id)!.state).toBe("confirmed");
    expect(
      after
        .filter((r) => r.id !== pick.id)
        .every((r) => r.state === "rejected"),
    ).toBe(true);

    const audit = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "match.confirmed"),
    });
    expect(audit?.actorUserId).toBe(teacher.id);
  });

  it("an unrelated teacher cannot confirm someone else's section match", async () => {
    const { section } = await sectionWithTeacher();
    const outsider = await makeUser({ isTeacher: true });
    const record = await makeStudentRecord("Juan Dela Cruz");
    await enroll(section.id, record.id);
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    await generateMatchCandidates(student.id);
    const row = (await db.query.accountMatches.findFirst({
      where: eq(accountMatches.userId, student.id),
    }))!;

    await expect(confirmMatch(outsider.id, row.id)).rejects.toBeInstanceOf(
      AuthzError,
    );
  });

  it("a TA with viewStudentIdentities may confirm; without it, denied", async () => {
    const { section } = await sectionWithTeacher();
    const record = await makeStudentRecord("Juan Dela Cruz");
    await enroll(section.id, record.id);
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    await generateMatchCandidates(student.id);
    const row = (await db.query.accountMatches.findFirst({
      where: eq(accountMatches.userId, student.id),
    }))!;

    const taNo = await makeUser();
    await addSectionStaff(section.id, taNo.id, "ta", {});
    await expect(confirmMatch(taNo.id, row.id)).rejects.toBeInstanceOf(
      AuthzError,
    );

    const taYes = await makeUser();
    await addSectionStaff(section.id, taYes.id, "ta", {
      viewStudentIdentities: true,
    });
    await confirmMatch(taYes.id, row.id);
    const confirmed = await db.query.accountMatches.findFirst({
      where: and(
        eq(accountMatches.userId, student.id),
        eq(accountMatches.state, "confirmed"),
      ),
    });
    expect(confirmed).toBeTruthy();
  });

  it("correction after verification rebinds and audits prior + new binding", async () => {
    const { teacher, section } = await sectionWithTeacher();
    const wrong = await makeStudentRecord("Juan Dela Cruz");
    const right = await makeStudentRecord("Juan Dela Cruz Jr");
    await enroll(section.id, wrong.id);
    await enroll(section.id, right.id);
    const student = await makeUser({ displayName: "Juan Dela Cruz" });
    await generateMatchCandidates(student.id);
    const rows = await db.query.accountMatches.findMany({
      where: eq(accountMatches.userId, student.id),
    });
    const wrongRow = rows.find((r) => r.studentRecordId === wrong.id)!;
    await confirmMatch(teacher.id, wrongRow.id);

    await correctMatch(teacher.id, wrongRow.id, right.id);

    const confirmed = await db.query.accountMatches.findFirst({
      where: and(
        eq(accountMatches.userId, student.id),
        eq(accountMatches.state, "confirmed"),
      ),
    });
    expect(confirmed?.studentRecordId).toBe(right.id);
    expect(confirmed?.method).toBe("manual_correction");

    const audit = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "match.corrected"),
    });
    expect(audit).toBeTruthy();
  });

  it("a student record confirmed to one user can never confirm to another (DB constraint)", async () => {
    const { teacher, section } = await sectionWithTeacher();
    const record = await makeStudentRecord("Juan Dela Cruz");
    await enroll(section.id, record.id);
    const s1 = await makeUser({ displayName: "Juan Dela Cruz" });
    const s2 = await makeUser({ displayName: "Juan Dela Cruz" });
    await generateMatchCandidates(s1.id);
    const row1 = (await db.query.accountMatches.findFirst({
      where: eq(accountMatches.userId, s1.id),
    }))!;
    await confirmMatch(teacher.id, row1.id);

    // Second user gets no candidate (record already taken) → unmatched.
    const { outcome } = await generateMatchCandidates(s2.id);
    expect(outcome).toBe("unmatched");

    // Forcing a duplicate confirmed row violates the partial unique index.
    await expect(
      db.insert(accountMatches).values({
        userId: s2.id,
        studentRecordId: record.id,
        state: "confirmed",
        method: "teacher",
      }),
    ).rejects.toThrow();
  });
});
