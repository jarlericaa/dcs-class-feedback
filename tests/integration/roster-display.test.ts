import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  makeCourse,
  makeSection,
  makeUser,
} from "./fixtures";
import { studentRecords } from "@/db/schema";
import { listSectionRoster } from "@/modules/catalog";
import {
  commitRosterImport,
  getRosterImportOutcome,
  parseRosterCsv,
} from "@/modules/roster-import";
import { formatStudentNumber } from "@/lib/student-number";
import { AuthzError, SECTION_PERMISSIONS } from "@/modules/authz";

/**
 * The class list, as authorized staff read it (GitHub issue #12).
 *
 * Two claims under test. First, that a staff member holding
 * `viewStudentIdentities` gets the WHOLE student number and everyone else gets
 * nothing at all — the number is decrypted per render and the capability is the
 * only gate. Second, that dropping the import's preview step did not drop the
 * information it carried: which rows were refused, and who is no longer on the
 * list.
 */

const HEADER = "student number,full name,up mail\n";

function csv(...rows: string[]) {
  return parseRosterCsv(HEADER + rows.map((r) => `${r}\n`).join(""));
}

async function setup() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  await addSectionStaff(section.id, teacher.id, "teacher");
  return { teacher, course, section };
}

describe("the class list shows a whole student number to the reader entitled to it", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("returns the full plaintext number, normalized, and renders it in UP format", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      csv("2026-00001,Juan Dela Cruz,juan@up.edu.ph"),
      "initial",
    );

    const roster = await listSectionRoster(teacher.id, section.id);
    expect(roster).toHaveLength(1);
    const entry = roster[0]!;
    // Stored form: normalized, so no separator. This is the identity.
    expect(entry.studentNumber).toBe("202600001");
    // Reading form: the separator restored, which is what the teacher typed.
    expect(formatStudentNumber(entry.studentNumber)).toBe("2026-00001");
    // The masked tail is still there, so a row that cannot be decrypted has
    // something truthful to fall back to.
    expect(entry.record.studentNumberLast4).toBe("0001");
    // And the ciphertext never left: this is a decrypt for one render, not a
    // plaintext column.
    const stored = (await db.query.studentRecords.findFirst({
      where: eq(studentRecords.id, entry.record.id),
    }))!;
    expect(stored.studentNumber).toBeNull();
    expect(stored.studentNumberCiphertext).toBeTruthy();
    expect(stored.studentNumberCiphertext).not.toContain("202600001");
  });

  it("refuses the class list outright without viewStudentIdentities", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      csv("2026-00001,Juan Dela Cruz,juan@up.edu.ph"),
      "initial",
    );

    // A student assistant with every OTHER flag: the number is gated on this
    // one capability and nothing else substitutes for it.
    const ta = await makeUser({});
    await addSectionStaff(
      section.id,
      ta.id,
      "ta",
      Object.fromEntries(
        SECTION_PERMISSIONS.map((p) => [p, p !== "viewStudentIdentities"]),
      ),
    );
    await expect(listSectionRoster(ta.id, section.id)).rejects.toBeInstanceOf(
      AuthzError,
    );

    const outsider = await makeUser({ isTeacher: true });
    await expect(
      listSectionRoster(outsider.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  /**
   * A record from before the encryption backfill has no ciphertext. It must
   * degrade to its last four rather than throwing and taking the whole class
   * list down with it.
   */
  it("degrades one unreadable row instead of failing the list", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      csv(
        "2026-00001,Juan Dela Cruz,juan@up.edu.ph",
        "2026-00002,Maria Santos,maria@up.edu.ph",
      ),
      "initial",
    );
    const rows = await listSectionRoster(teacher.id, section.id);
    const juan = rows.find((r) => r.record.fullName === "Juan Dela Cruz")!;
    await db
      .update(studentRecords)
      .set({ studentNumberCiphertext: null })
      .where(eq(studentRecords.id, juan.record.id));

    const after = await listSectionRoster(teacher.id, section.id);
    expect(after).toHaveLength(2);
    const broken = after.find((r) => r.record.id === juan.record.id)!;
    const intact = after.find((r) => r.record.id !== juan.record.id)!;
    expect(broken.studentNumber).toBeNull();
    expect(broken.record.studentNumberLast4).toBe("0001");
    expect(intact.studentNumber).toBe("202600002");
  });

  it("never writes a plaintext number into the audit log", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      csv("2026-00001,Juan Dela Cruz,juan@up.edu.ph"),
      "initial",
    );
    const events = await db.query.auditEvents.findMany();
    const dump = JSON.stringify(events);
    expect(dump).not.toContain("202600001");
    expect(dump).not.toContain("2026-00001");
    // The last four are allowed: they are stored in clear for staff lists.
    expect(dump).toContain("0001");
  });
});

describe("the outcome of an import, now that nothing is previewed", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("reports the counts the commit recorded", async () => {
    const { teacher, section } = await setup();
    const summary = await commitRosterImport(
      teacher.id,
      section.id,
      csv(
        "2026-00001,Juan Dela Cruz,juan@up.edu.ph",
        "2026-00002,Maria Santos,maria@up.edu.ph",
      ),
      "first upload.csv",
    );

    const outcome = (await getRosterImportOutcome(
      teacher.id,
      section.id,
      summary.importBatchId,
    ))!;
    expect(outcome.batchId).toBe(summary.importBatchId);
    expect(outcome.sourceDescription).toBe("first upload.csv");
    expect(outcome.committedAt).toBeInstanceOf(Date);
    expect(outcome.summary).toMatchObject({ created: 2, enrolled: 2 });
    expect(outcome.blocked).toEqual([]);
    expect(outcome.deactivated).toEqual([]);
  });

  /**
   * The preview's whole job: telling a teacher WHICH line to fix. A count of
   * "1 blocked" is not actionable, so the outcome carries the line number and
   * the machine-readable reason — and nothing from the row itself, because the
   * audit rows it is built from deliberately hold no student data.
   */
  it("names the lines it refused, and why", async () => {
    const { teacher, section } = await setup();
    const summary = await commitRosterImport(
      teacher.id,
      section.id,
      csv(
        "2026-00001,Juan Dela Cruz,juan@up.edu.ph",
        "2026-00002,No Email Here,",
        "2026-00003,Bad Domain,someone@gmail.com",
      ),
      "mixed.csv",
    );
    expect(summary.created).toBe(1);
    expect(summary.blocked).toBe(2);

    const outcome = (await getRosterImportOutcome(
      teacher.id,
      section.id,
      summary.importBatchId,
    ))!;
    expect(outcome.blocked).toHaveLength(2);
    expect(outcome.blocked.map((b) => b.line).sort()).toEqual([3, 4]);
    const reasons = outcome.blocked.flatMap((b) => b.reasons);
    expect(reasons).toContain("missing_email");
    expect(reasons).toContain("disallowed_email_domain");
    // No names, no addresses, no numbers.
    const dump = JSON.stringify(outcome.blocked);
    expect(dump).not.toContain("No Email Here");
    expect(dump).not.toContain("gmail.com");
  });

  it("names who is no longer on the list", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      csv(
        "2026-00001,Juan Dela Cruz,juan@up.edu.ph",
        "2026-00002,Maria Santos,maria@up.edu.ph",
      ),
      "v1",
    );
    const second = await commitRosterImport(
      teacher.id,
      section.id,
      csv("2026-00001,Juan Dela Cruz,juan@up.edu.ph"),
      "v2",
    );
    expect(second.deactivated).toBe(1);

    const outcome = (await getRosterImportOutcome(
      teacher.id,
      section.id,
      second.importBatchId,
    ))!;
    expect(outcome.deactivated).toEqual([
      { name: "Maria Santos", studentNumberLast4: "0002" },
    ]);
    // The FIRST import dropped nobody, and reading it back must not borrow the
    // second one's events.
    const first = (await getRosterImportOutcome(
      teacher.id,
      section.id,
      outcome.batchId,
    ))!;
    expect(first.batchId).toBe(second.importBatchId);
  });

  it("keeps each batch's events to itself", async () => {
    const { teacher, section } = await setup();
    const one = await commitRosterImport(
      teacher.id,
      section.id,
      csv("2026-00001,Juan Dela Cruz,juan@up.edu.ph", "2026-00002,No Email,"),
      "v1",
    );
    const two = await commitRosterImport(
      teacher.id,
      section.id,
      csv("2026-00001,Juan Dela Cruz,juan@up.edu.ph"),
      "v2",
    );

    const first = (await getRosterImportOutcome(
      teacher.id,
      section.id,
      one.importBatchId,
    ))!;
    const secondOutcome = (await getRosterImportOutcome(
      teacher.id,
      section.id,
      two.importBatchId,
    ))!;
    expect(first.blocked).toHaveLength(1);
    // The second upload listed only Juan, and the blocked row was never
    // enrolled, so nobody is dropped and nothing carries over.
    expect(secondOutcome.blocked).toEqual([]);
    expect(secondOutcome.deactivated).toEqual([]);
  });

  it("is scoped to the section, and refuses an unrelated reader", async () => {
    const { teacher, section } = await setup();
    const other = await setup();
    const summary = await commitRosterImport(
      teacher.id,
      section.id,
      csv("2026-00001,Juan Dela Cruz,juan@up.edu.ph"),
      "v1",
    );

    // Right batch, wrong section: nothing, rather than another class's import.
    expect(
      await getRosterImportOutcome(
        other.teacher.id,
        other.section.id,
        summary.importBatchId,
      ),
    ).toBeNull();
    // A malformed query-string id is also just an absent batch, not a database
    // UUID error.
    expect(
      await getRosterImportOutcome(teacher.id, section.id, "not-a-uuid"),
    ).toBeNull();
    // Right section, no standing on it.
    await expect(
      getRosterImportOutcome(other.teacher.id, section.id, summary.importBatchId),
    ).rejects.toBeInstanceOf(AuthzError);
  });
});
