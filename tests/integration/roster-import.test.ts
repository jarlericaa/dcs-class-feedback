import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { studentNumberHash } from "@/modules/crypto/student-number";
import { db, truncateAll } from "./helpers";
import { makeCourse, makeSection, makeUser } from "./fixtures";
import { accountMatches, enrollments, studentRecords } from "@/db/schema";
import {
  commitRosterImport,
  parseRosterCsv,
  previewRosterImport,
} from "@/modules/roster-import";
import {
  generateMatchCandidates,
  confirmMatch,
} from "@/modules/identity/matching";
import { AuthzError } from "@/modules/authz";

const CSV_V1 =
  "student number,full name\n2026-001,Juan Dela Cruz\n2026-002,Maria Santos\n";

describe("roster CSV import", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function setup() {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    return { teacher, course, section };
  }

  it("creates records and enrollments with rosterName snapshots", async () => {
    const { teacher, section } = await setup();
    const summary = await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "initial roster",
    );
    expect(summary).toMatchObject({ created: 2, enrolled: 2, deactivated: 0 });

    const enrolled = await db.query.enrollments.findMany({
      where: eq(enrollments.sectionId, section.id),
    });
    expect(enrolled).toHaveLength(2);
    expect(enrolled.every((e) => e.status === "active")).toBe(true);
    expect(enrolled.map((e) => e.rosterName).sort()).toEqual([
      "Juan Dela Cruz",
      "Maria Santos",
    ]);
  });

  it("unrelated staff cannot import into someone else's section", async () => {
    const { section } = await setup();
    const outsider = await makeUser({ isTeacher: true });
    await expect(
      commitRosterImport(outsider.id, section.id, parseRosterCsv(CSV_V1), "x"),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("re-import: absent students are deactivated, never deleted; re-listing reactivates", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "v1",
    );

    const v2 = parseRosterCsv(
      "student number,full name\n2026-001,Juan Dela Cruz\n",
    );
    const summary2 = await commitRosterImport(teacher.id, section.id, v2, "v2");
    expect(summary2.deactivated).toBe(1);

    const all = await db.query.enrollments.findMany({
      where: eq(enrollments.sectionId, section.id),
    });
    expect(all).toHaveLength(2); // nothing deleted
    expect(all.filter((e) => e.status === "deactivated")).toHaveLength(1);

    const summary3 = await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "v3",
    );
    expect(summary3.reactivated).toBe(1);
  });

  it("canonical name updates only while unmatched, and is audited", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "v1",
    );

    // Typo fix while NO confirmed match exists → canonical name updates.
    const fix = parseRosterCsv(
      "student number,full name\n2026-001,Juan De La Cruz\n2026-002,Maria Santos\n",
    );
    const s2 = await commitRosterImport(teacher.id, section.id, fix, "v2");
    expect(s2.namesUpdated).toBe(1);
    const rec = (await db.query.studentRecords.findFirst({
      where: eq(studentRecords.studentNumberHash, studentNumberHash("2026-001")),
    }))!;
    expect(rec.fullName).toBe("Juan De La Cruz");

    // Confirm a match for 2026-001, then try renaming again → locked.
    const student = await makeUser({ displayName: "Juan De La Cruz" });
    await generateMatchCandidates(student.id);
    const row = (await db.query.accountMatches.findFirst({
      where: and(
        eq(accountMatches.userId, student.id),
        eq(accountMatches.state, "candidate"),
      ),
    }))!;
    await confirmMatch(teacher.id, row.id);

    const rename = parseRosterCsv(
      "student number,full name\n2026-001,Different Person\n2026-002,Maria Santos\n",
    );
    const preview = await previewRosterImport(teacher.id, section.id, rename);
    expect(preview.actions.some((a) => a.kind === "name_diff_locked")).toBe(
      true,
    );

    const s3 = await commitRosterImport(teacher.id, section.id, rename, "v3");
    expect(s3.nameDiffsLocked).toBe(1);
    expect(s3.namesUpdated).toBe(0);
    const recAfter = (await db.query.studentRecords.findFirst({
      where: eq(studentRecords.studentNumberHash, studentNumberHash("2026-001")),
    }))!;
    expect(recAfter.fullName).toBe("Juan De La Cruz"); // unchanged
    // rosterName snapshot still records what the file said
    const enr = await db.query.enrollments.findFirst({
      where: and(
        eq(enrollments.sectionId, section.id),
        eq(enrollments.studentRecordId, recAfter.id),
      ),
    });
    expect(enr!.rosterName).toBe("Different Person");
  });

  it("confirmed matches survive re-import (keyed on student number)", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "v1",
    );
    const student = await makeUser({ displayName: "Maria Santos" });
    await generateMatchCandidates(student.id);
    const row = (await db.query.accountMatches.findFirst({
      where: eq(accountMatches.userId, student.id),
    }))!;
    await confirmMatch(teacher.id, row.id);

    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "v2",
    );

    const still = await db.query.accountMatches.findFirst({
      where: and(
        eq(accountMatches.userId, student.id),
        eq(accountMatches.state, "confirmed"),
      ),
    });
    expect(still).toBeTruthy();
  });

  it("preview shows the plan without changing anything", async () => {
    const { teacher, section } = await setup();
    const preview = await previewRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
    );
    expect(preview.actions.filter((a) => a.kind === "create")).toHaveLength(2);
    const count = await db.query.studentRecords.findMany();
    expect(count).toHaveLength(0);
  });
});
