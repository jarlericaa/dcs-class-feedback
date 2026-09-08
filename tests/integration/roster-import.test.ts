import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { studentNumberHash } from "@/modules/crypto/student-number";
import { db, truncateAll } from "./helpers";
import { makeCourse, makeSection, makeUser } from "./fixtures";
import { auditEvents, enrollments, studentRecords } from "@/db/schema";
import {
  commitRosterImport,
  parseRosterCsv,
  previewRosterImport,
} from "@/modules/roster-import";
import { AuthzError } from "@/modules/authz";

const CSV_V1 =
  "student number,full name,up mail\n" +
  "2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n" +
  "2026-002,Maria Santos,maria.santos@up.edu.ph\n";

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
      "student number,full name,up mail\n2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n",
    );
    const summary2 = await commitRosterImport(teacher.id, section.id, v2, "v2");
    expect(summary2.deactivated).toBe(1);

    const all = await db.query.enrollments.findMany({
      where: eq(enrollments.sectionId, section.id),
    });
    expect(all).toHaveLength(2); // nothing deleted
    expect(all.filter((e) => e.status === "deactivated")).toHaveLength(1);
    // Removing someone from the class list is audited.
    const dropped = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "roster.row_deactivated"),
    });
    expect(dropped).toBeTruthy();

    const summary3 = await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "v3",
    );
    expect(summary3.reactivated).toBe(1);
  });

  /**
   * The name is a label, not an identity key: a corrected spelling is simply
   * applied. The old "locked once a match was confirmed" rule is gone with the
   * matching workflow it protected.
   */
  it("canonical name updates freely and is audited", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "v1",
    );

    const fix = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-001,Juan De La Cruz,juan.delacruz@up.edu.ph\n" +
        "2026-002,Maria Santos,maria.santos@up.edu.ph\n",
    );
    const s2 = await commitRosterImport(teacher.id, section.id, fix, "v2");
    expect(s2.namesUpdated).toBe(1);
    const rec = (await db.query.studentRecords.findFirst({
      where: eq(studentRecords.studentNumberHash, studentNumberHash("2026-001")),
    }))!;
    expect(rec.fullName).toBe("Juan De La Cruz");
    // The email — the thing that actually grants access — did not move.
    expect(rec.rosterEmail).toBe("juan.delacruz@up.edu.ph");

    const audit = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "student_record.name_corrected"),
    });
    expect(audit).toBeTruthy();
  });

  it("re-importing the same list is idempotent: no new records, no relinking", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "v1",
    );
    const s2 = await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "v2",
    );
    expect(s2).toMatchObject({
      created: 0,
      enrolled: 0,
      emailsLinked: 0,
      namesUpdated: 0,
      blocked: 0,
      deactivated: 0,
    });
    expect(await db.query.studentRecords.findMany()).toHaveLength(2);
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

describe("roster import: the email is the access key", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function setup() {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    return { teacher, course, section };
  }

  it("refuses a file with no email column at all", async () => {
    const parsed = parseRosterCsv(
      "student number,full name\n2026-001,Juan Dela Cruz\n",
    );
    expect(parsed.fileError).toMatch(/UP email column/i);
  });

  it("normalizes case and surrounding whitespace before storing", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(
        'student number,full name,up mail\n2026-001,Juan Dela Cruz,"  Juan.DelaCruz@UP.edu.PH  "\n',
      ),
      "v1",
    );
    const rec = (await db.query.studentRecords.findFirst())!;
    expect(rec.rosterEmail).toBe("juan.delacruz@up.edu.ph");
  });

  it("rejects two rows sharing one email, keeping the first", async () => {
    const { teacher, section } = await setup();
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-001,Juan Dela Cruz,shared@up.edu.ph\n" +
        "2026-002,Maria Santos,SHARED@up.edu.ph\n",
    );
    expect(
      parsed.rows[1]!.warnings.some((w) => w.code === "duplicate_email"),
    ).toBe(true);

    const summary = await commitRosterImport(teacher.id, section.id, parsed, "v1");
    expect(summary.blocked).toBe(1);
    expect(summary.created).toBe(1);
    const records = await db.query.studentRecords.findMany();
    expect(records).toHaveLength(1);
    expect(records[0]!.rosterEmail).toBe("shared@up.edu.ph");
    const rejected = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.action, "roster.row_rejected"),
    });
    expect(rejected).toBeTruthy();
    // The rejection reason is recorded without the address or the name.
    expect(JSON.stringify(rejected!.metadata)).not.toContain("shared@");
    expect(JSON.stringify(rejected!.metadata)).not.toContain("Maria");
  });

  it("rejects a missing email, a malformed one, and a disallowed domain", async () => {
    const { teacher, section } = await setup();
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-001,No Email,\n" +
        "2026-002,Bad Shape,not-an-email\n" +
        "2026-003,Wrong Domain,someone@gmail.com\n" +
        "2026-004,Fine,fine@up.edu.ph\n",
    );
    const codes = parsed.rows.map((r) => r.warnings.map((w) => w.code));
    expect(codes[0]).toContain("missing_email");
    expect(codes[1]).toContain("invalid_email");
    expect(codes[2]).toContain("disallowed_email_domain");
    expect(codes[3]).toEqual([]);

    const summary = await commitRosterImport(teacher.id, section.id, parsed, "v1");
    expect(summary.blocked).toBe(3);
    expect(summary.created).toBe(1);
  });

  it("refuses to move an email that already belongs to another student record", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "v1",
    );

    // A different student number claiming Juan's address.
    const clash = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n" +
        "2026-002,Maria Santos,maria.santos@up.edu.ph\n" +
        "2026-999,Impostor,juan.delacruz@up.edu.ph\n",
    );
    const preview = await previewRosterImport(teacher.id, section.id, clash);
    expect(preview.actions.some((a) => a.kind === "blocked")).toBe(true);

    const summary = await commitRosterImport(teacher.id, section.id, clash, "v2");
    expect(summary.blocked).toBe(1);
    const juan = (await db.query.studentRecords.findFirst({
      where: eq(studentRecords.studentNumberHash, studentNumberHash("2026-001")),
    }))!;
    expect(juan.rosterEmail).toBe("juan.delacruz@up.edu.ph");
    const impostor = await db.query.studentRecords.findFirst({
      where: eq(studentRecords.studentNumberHash, studentNumberHash("2026-999")),
    });
    expect(impostor).toBeUndefined();
  });

  it("a file whose every row is rejected deactivates nobody", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "v1",
    );
    const broken = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-001,Juan Dela Cruz,oops\n" +
        "2026-002,Maria Santos,\n",
    );
    const summary = await commitRosterImport(teacher.id, section.id, broken, "v2");
    expect(summary.blocked).toBe(2);
    expect(summary.deactivated).toBe(0);
    const active = await db.query.enrollments.findMany({
      where: and(
        eq(enrollments.sectionId, section.id),
        eq(enrollments.status, "active"),
      ),
    });
    expect(active).toHaveLength(2);
  });

  it("changing a student's email is audited as a linkage change", async () => {
    const { teacher, section } = await setup();
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "v1",
    );
    const moved = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-001,Juan Dela Cruz,jdelacruz@up.edu.ph\n" +
        "2026-002,Maria Santos,maria.santos@up.edu.ph\n",
    );
    const summary = await commitRosterImport(teacher.id, section.id, moved, "v2");
    expect(summary.emailsLinked).toBe(1);

    const events = await db.query.auditEvents.findMany({
      where: eq(auditEvents.action, "roster.email_linked"),
    });
    const change = events.find(
      (e) => (e.before as { rosterEmail?: string })?.rosterEmail,
    )!;
    expect(change.before).toMatchObject({
      rosterEmail: "juan.delacruz@up.edu.ph",
    });
    expect(change.after).toMatchObject({ rosterEmail: "jdelacruz@up.edu.ph" });
  });
});

/**
 * Blocking a row must never be mistaken for the student having left the class.
 *
 * The two sets are different questions: "did this row import?" and "is this
 * student on the uploaded list?". Deactivation answers only the second, so a
 * typo in one email cell can never silently drop somebody from a section.
 */
describe("a blocked row is present, not absent", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function setupWithBoth() {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(CSV_V1),
      "v1",
    );
    const active = await db.query.enrollments.findMany({
      where: and(
        eq(enrollments.sectionId, section.id),
        eq(enrollments.status, "active"),
      ),
    });
    expect(active).toHaveLength(2); // Juan and Maria both start active
    return { teacher, section };
  }

  const statusFor = async (sectionId: string, studentNumber: string) => {
    const record = (await db.query.studentRecords.findFirst({
      where: eq(studentRecords.studentNumberHash, studentNumberHash(studentNumber)),
    }))!;
    const enrollment = await db.query.enrollments.findFirst({
      where: and(
        eq(enrollments.sectionId, sectionId),
        eq(enrollments.studentRecordId, record.id),
      ),
    });
    return { record, status: enrollment?.status };
  };

  it("keeps a student whose email cell is malformed, and still imports the rest", async () => {
    const { teacher, section } = await setupWithBoth();
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n" +
        "2026-002,Maria Santos,not-an-email\n",
    );
    expect(
      parsed.rows[1]!.warnings.map((w) => w.code),
    ).toContain("invalid_email");

    const summary = await commitRosterImport(teacher.id, section.id, parsed, "v2");
    expect(summary.blocked).toBe(1);
    // The critical assertion: Maria was on the list, so she is still in the class.
    expect(summary.deactivated).toBe(0);
    expect((await statusFor(section.id, "2026-002")).status).toBe("active");
    expect((await statusFor(section.id, "2026-001")).status).toBe("active");
  });

  it("leaves the blocked student's record and enrolment completely untouched", async () => {
    const { teacher, section } = await setupWithBoth();
    const before = await statusFor(section.id, "2026-002");

    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(
        "student number,full name,up mail\n" +
          "2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n" +
          "2026-002,Maria RENAMED Santos,not-an-email\n",
      ),
      "v2",
    );

    const after = await statusFor(section.id, "2026-002");
    expect(after.record.fullName).toBe(before.record.fullName);
    expect(after.record.rosterEmail).toBe("maria.santos@up.edu.ph");
    expect(after.status).toBe("active");
  });

  it("still deactivates a student who is genuinely off the list", async () => {
    const { teacher, section } = await setupWithBoth();
    const summary = await commitRosterImport(
      teacher.id,
      section.id,
      // Maria is simply gone; Juan's row is fine.
      parseRosterCsv(
        "student number,full name,up mail\n2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n",
      ),
      "v2",
    );
    expect(summary.deactivated).toBe(1);
    expect((await statusFor(section.id, "2026-002")).status).toBe("deactivated");
    expect((await statusFor(section.id, "2026-001")).status).toBe("active");
  });

  it("previews exactly the deactivations the commit performs", async () => {
    const { teacher, section } = await setupWithBoth();
    // Juan fine, Maria blocked, and a third student absent entirely.
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(
        "student number,full name,up mail\n" +
          "2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n" +
          "2026-002,Maria Santos,maria.santos@up.edu.ph\n" +
          "2026-003,Jose Mercado,jose.mercado@up.edu.ph\n",
      ),
      "v2",
    );

    const parsed = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n" +
        "2026-002,Maria Santos,not-an-email\n",
    );
    const preview = await previewRosterImport(teacher.id, section.id, parsed);
    // Only Jose — Maria is blocked but still listed.
    expect(preview.toDeactivate.map((d) => d.name)).toEqual(["Jose Mercado"]);
    expect(preview.blockedCount).toBe(1);

    const summary = await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(
        "student number,full name,up mail\n" +
          "2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n" +
          "2026-002,Maria Santos,not-an-email\n",
      ),
      "v3",
    );
    expect(summary.deactivated).toBe(preview.toDeactivate.length);
    expect(summary.deactivated).toBe(1);
    expect((await statusFor(section.id, "2026-002")).status).toBe("active");
    expect((await statusFor(section.id, "2026-003")).status).toBe("deactivated");
  });

  it("deactivates nobody when every row in the file is blocked", async () => {
    const { teacher, section } = await setupWithBoth();
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-001,Juan Dela Cruz,broken\n" +
        "2026-002,Maria Santos,\n",
    );
    const preview = await previewRosterImport(teacher.id, section.id, parsed);
    expect(preview.blockedCount).toBe(2);
    expect(preview.toDeactivate).toEqual([]);

    const summary = await commitRosterImport(teacher.id, section.id, parsed, "v2");
    expect(summary.blocked).toBe(2);
    expect(summary.deactivated).toBe(0);
    expect((await statusFor(section.id, "2026-001")).status).toBe("active");
    expect((await statusFor(section.id, "2026-002")).status).toBe("active");
  });

  it("deactivates nobody when a fully blocked file names only strangers", async () => {
    const { teacher, section } = await setupWithBoth();
    // Nothing importable, and nobody currently enrolled is even mentioned. The
    // file tells us nothing reliable, so it must not empty the section.
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n2026-999,Someone Else,broken\n",
    );
    const preview = await previewRosterImport(teacher.id, section.id, parsed);
    expect(preview.toDeactivate).toEqual([]);
    const summary = await commitRosterImport(teacher.id, section.id, parsed, "v2");
    expect(summary.deactivated).toBe(0);
    expect((await statusFor(section.id, "2026-001")).status).toBe("active");
    expect((await statusFor(section.id, "2026-002")).status).toBe("active");
  });
});

/**
 * `student_records.roster_email` is GLOBAL, but import authority is
 * SECTION-scoped. Without a boundary here, a teacher who can import their own
 * class list could type any student number, supply a different address, and move
 * that student's access in a class they have no standing on.
 *
 * The rule: you may change the identity of a student you actually hold. You may
 * add a student you do not hold only by naming their existing address exactly.
 */
describe("section-scoped import is not global identity-edit authority", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  /** Two courses with different owners, so neither teacher staffs the other. */
  async function twoUnrelatedSections() {
    const teacherA = await makeUser({ isTeacher: true });
    const teacherB = await makeUser({ isTeacher: true });
    const courseA = await makeCourse(teacherA.id);
    const courseB = await makeCourse(teacherB.id);
    const sectionA = await makeSection(courseA.id);
    const sectionB = await makeSection(courseB.id);
    // Maria exists only in section B.
    await commitRosterImport(
      teacherB.id,
      sectionB.id,
      parseRosterCsv(
        "student number,full name,up mail\n2026-002,Maria Santos,maria.santos@up.edu.ph\n",
      ),
      "section B roster",
    );
    return { teacherA, teacherB, sectionA, sectionB };
  }

  const maria = async () =>
    (await db.query.studentRecords.findFirst({
      where: eq(studentRecords.studentNumberHash, studentNumberHash("2026-002")),
    }))!;

  it("refuses a section-A import that would rewrite a section-B student's email", async () => {
    const { teacherA, sectionA } = await twoUnrelatedSections();
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n2026-002,Maria Santos,attacker@up.edu.ph\n",
    );

    const preview = await previewRosterImport(teacherA.id, sectionA.id, parsed);
    expect(preview.actions.map((a) => a.kind)).toEqual(["blocked"]);
    expect(
      preview.actions[0]!.row.warnings.map((w) => w.code),
    ).toContain("cross_section_email_conflict");

    const summary = await commitRosterImport(teacherA.id, sectionA.id, parsed, "v1");
    expect(summary.blocked).toBe(1);
    expect(summary.emailsLinked).toBe(0);
    expect(summary.enrolled).toBe(0);
    expect(summary.created).toBe(0);
  });

  it("leaves the student record and both sections' enrollments untouched", async () => {
    const { teacherA, sectionA, sectionB } = await twoUnrelatedSections();
    const before = await maria();

    await commitRosterImport(
      teacherA.id,
      sectionA.id,
      parseRosterCsv(
        "student number,full name,up mail\n2026-002,Hijacked Name,attacker@up.edu.ph\n",
      ),
      "v1",
    );

    const after = await maria();
    expect(after.rosterEmail).toBe("maria.santos@up.edu.ph");
    expect(after.fullName).toBe(before.fullName);
    expect(after.id).toBe(before.id); // no duplicate record for the same number
    expect(await db.query.studentRecords.findMany()).toHaveLength(1);

    // Section A gained nothing; section B is unchanged.
    expect(
      await db.query.enrollments.findMany({
        where: eq(enrollments.sectionId, sectionA.id),
      }),
    ).toHaveLength(0);
    const inB = await db.query.enrollments.findMany({
      where: eq(enrollments.sectionId, sectionB.id),
    });
    expect(inB).toHaveLength(1);
    expect(inB[0]!.status).toBe("active");
  });

  it("still lets section A enrol that student using their existing email", async () => {
    const { teacherA, sectionA } = await twoUnrelatedSections();
    const summary = await commitRosterImport(
      teacherA.id,
      sectionA.id,
      parseRosterCsv(
        "student number,full name,up mail\n2026-002,Maria Santos,maria.santos@up.edu.ph\n",
      ),
      "v1",
    );
    expect(summary.blocked).toBe(0);
    expect(summary.enrolled).toBe(1);
    expect(summary.emailsLinked).toBe(0); // identity untouched — only an enrolment
    expect((await maria()).rosterEmail).toBe("maria.santos@up.edu.ph");
    // One record, two sections — the reuse the model is built for.
    expect(await db.query.studentRecords.findMany()).toHaveLength(1);
  });

  it("normalizes case and whitespace before deciding, so no false conflict", async () => {
    const { teacherA, sectionA } = await twoUnrelatedSections();
    const summary = await commitRosterImport(
      teacherA.id,
      sectionA.id,
      parseRosterCsv(
        'student number,full name,up mail\n2026-002,Maria Santos,"  MARIA.Santos@UP.EDU.PH "\n',
      ),
      "v1",
    );
    expect(summary.blocked).toBe(0);
    expect(summary.enrolled).toBe(1);
    expect((await maria()).rosterEmail).toBe("maria.santos@up.edu.ph");
  });

  it("lets staff correct the email of a student already in their own section", async () => {
    const { teacherB, sectionB } = await twoUnrelatedSections();
    const summary = await commitRosterImport(
      teacherB.id,
      sectionB.id,
      parseRosterCsv(
        "student number,full name,up mail\n2026-002,Maria Santos,m.santos@up.edu.ph\n",
      ),
      "corrected",
    );
    expect(summary.blocked).toBe(0);
    expect(summary.emailsLinked).toBe(1);
    expect((await maria()).rosterEmail).toBe("m.santos@up.edu.ph");
  });

  it("lets a section correct a student it holds even when they are also elsewhere", async () => {
    const { teacherA, teacherB, sectionA, sectionB } = await twoUnrelatedSections();
    // Maria joins section A under her existing address first.
    await commitRosterImport(
      teacherA.id,
      sectionA.id,
      parseRosterCsv(
        "student number,full name,up mail\n2026-002,Maria Santos,maria.santos@up.edu.ph\n",
      ),
      "join A",
    );
    // Now section A genuinely holds her, so A may correct her address.
    const summary = await commitRosterImport(
      teacherA.id,
      sectionA.id,
      parseRosterCsv(
        "student number,full name,up mail\n2026-002,Maria Santos,maria.s@up.edu.ph\n",
      ),
      "correct in A",
    );
    expect(summary.blocked).toBe(0);
    expect(summary.emailsLinked).toBe(1);
    expect((await maria()).rosterEmail).toBe("maria.s@up.edu.ph");
    // Section B keeps her enrolment; the identity moved for both, as it must.
    expect(
      await db.query.enrollments.findMany({
        where: eq(enrollments.sectionId, sectionB.id),
      }),
    ).toHaveLength(1);
    expect(teacherB.id).toBeTruthy();
  });

  it("refuses to give a section-B student an email they do not yet have", async () => {
    const { teacherA, teacherB, sectionA, sectionB } = await twoUnrelatedSections();
    // Simulate a record imported before the email column existed.
    await db
      .update(studentRecords)
      .set({ rosterEmail: null })
      .where(eq(studentRecords.id, (await maria()).id));

    // The SAME parsed roster is deliberately reused across all three calls: a
    // conflict found for section A must not linger on the row and block the
    // section that legitimately holds her.
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n2026-002,Maria Santos,someone@up.edu.ph\n",
    );
    const preview = await previewRosterImport(teacherA.id, sectionA.id, parsed);
    expect(preview.actions.map((a) => a.kind)).toEqual(["blocked"]);
    const summary = await commitRosterImport(teacherA.id, sectionA.id, parsed, "v1");
    expect(summary.blocked).toBe(1);
    expect((await maria()).rosterEmail).toBeNull();

    // Section B, which actually holds her, may assign it.
    const ok = await commitRosterImport(teacherB.id, sectionB.id, parsed, "v1");
    expect(ok.blocked).toBe(0);
    expect((await maria()).rosterEmail).toBe("someone@up.edu.ph");
  });

  it("commit re-checks independently of preview", async () => {
    const { teacherA, teacherB, sectionA, sectionB } = await twoUnrelatedSections();
    // A preview taken while section A could legitimately enrol her...
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n2026-002,Maria Santos,maria.santos@up.edu.ph\n",
    );
    const preview = await previewRosterImport(teacherA.id, sectionA.id, parsed);
    expect(preview.actions.map((a) => a.kind)).toEqual(["enroll_existing"]);

    // ...goes stale when section B moves her address in the meantime.
    await commitRosterImport(
      teacherB.id,
      sectionB.id,
      parseRosterCsv(
        "student number,full name,up mail\n2026-002,Maria Santos,moved@up.edu.ph\n",
      ),
      "B moves her",
    );

    // Commit must refuse on live data, not on the stale plan it was handed.
    const summary = await commitRosterImport(teacherA.id, sectionA.id, parsed, "v1");
    expect(summary.blocked).toBe(1);
    expect(summary.enrolled).toBe(0);
    expect((await maria()).rosterEmail).toBe("moved@up.edu.ph");
  });
});

/**
 * Deactivation is inferred from ABSENCE, so it is only sound when the parse can
 * be trusted to say who is present.
 *
 * A row that FAILED TO PARSE never reaches `parsed.rows`, so — unlike a row
 * blocked by a warning — it cannot be counted present, and the student it named
 * would be dropped over one empty cell. A parse that yields no usable rows at
 * all (a header-only file, a file of blank lines, a file whose every line is
 * malformed) mentions nobody, and "mentions nobody" must never read as
 * "everybody left": before this was guarded, such a file removed the whole
 * class in one click, with no confirmation step to catch it.
 *
 * The other half of the contract is asserted too: none of this may make a
 * genuinely departed student undroppable.
 */
describe("a parse that cannot say who is present deactivates nobody", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function classOfThree() {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(
        "student number,full name,up mail\n" +
          "2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n" +
          "2026-002,Maria Santos,maria.santos@up.edu.ph\n" +
          "2026-003,Pedro Reyes,pedro.reyes@up.edu.ph\n",
      ),
      "v1",
    );
    return { teacher, section };
  }

  const activeCount = async (sectionId: string) =>
    (
      await db.query.enrollments.findMany({
        where: and(
          eq(enrollments.sectionId, sectionId),
          eq(enrollments.status, "active"),
        ),
      })
    ).length;

  const statusOf = async (sectionId: string, studentNumber: string) => {
    const record = (await db.query.studentRecords.findFirst({
      where: eq(
        studentRecords.studentNumberHash,
        studentNumberHash(studentNumber),
      ),
    }))!;
    const enrollment = await db.query.enrollments.findFirst({
      where: and(
        eq(enrollments.sectionId, sectionId),
        eq(enrollments.studentRecordId, record.id),
      ),
    });
    return enrollment?.status;
  };

  it("keeps a student whose NAME cell is empty, though her row never parsed", async () => {
    const { teacher, section } = await classOfThree();
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n" +
        "2026-002,,maria.santos@up.edu.ph\n" +
        "2026-003,Pedro Reyes,pedro.reyes@up.edu.ph\n",
    );
    // The row is genuinely lost to the parser — that is the premise.
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.errors).toEqual([{ line: 3, message: "Missing full name" }]);

    const summary = await commitRosterImport(teacher.id, section.id, parsed, "v2");
    expect(summary.errored).toBe(1);
    expect(summary.deactivated).toBe(0);
    expect(await statusOf(section.id, "2026-002")).toBe("active");
    expect(await activeCount(section.id)).toBe(3);
  });

  it("keeps everyone when a row has no student number to match on", async () => {
    const { teacher, section } = await classOfThree();
    // Nothing can rescue this row individually: with no number there is no
    // identity to mark present, so the whole file waits to be fixed.
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n" +
        ",Maria Santos,maria.santos@up.edu.ph\n",
    );
    expect(parsed.errors).toEqual([
      { line: 3, message: "Missing student number" },
    ]);

    const summary = await commitRosterImport(teacher.id, section.id, parsed, "v2");
    expect(summary.deactivated).toBe(0);
    // Pedro is absent from this file too, but a file this unreliable may not
    // decide that either.
    expect(await activeCount(section.id)).toBe(3);
  });

  it("deactivates nobody from a header-only file", async () => {
    const { teacher, section } = await classOfThree();
    const parsed = parseRosterCsv("student number,full name,up mail\n");
    // No fileError: the header is valid, which is exactly what made this
    // dangerous — it reaches commit looking like a legitimate empty class list.
    expect(parsed.fileError).toBeUndefined();
    expect(parsed.rows).toHaveLength(0);

    const summary = await commitRosterImport(teacher.id, section.id, parsed, "v2");
    expect(summary.deactivated).toBe(0);
    expect(await activeCount(section.id)).toBe(3);
  });

  it("deactivates nobody from a file of blank lines", async () => {
    const { teacher, section } = await classOfThree();
    const parsed = parseRosterCsv("student number,full name,up mail\n,,\n,,\n");
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors).toHaveLength(0);

    const summary = await commitRosterImport(teacher.id, section.id, parsed, "v2");
    expect(summary.deactivated).toBe(0);
    expect(await activeCount(section.id)).toBe(3);
  });

  it("deactivates nobody when every line failed to parse", async () => {
    const { teacher, section } = await classOfThree();
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n" +
        ",Juan Dela Cruz,juan.delacruz@up.edu.ph\n" +
        ",Maria Santos,maria.santos@up.edu.ph\n",
    );
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors).toHaveLength(2);

    const summary = await commitRosterImport(teacher.id, section.id, parsed, "v2");
    expect(summary.deactivated).toBe(0);
    expect(await activeCount(section.id)).toBe(3);
  });

  it("the preview promises exactly what the commit does, in every unsafe case", async () => {
    const { teacher, section } = await classOfThree();
    const unsafe = [
      // header only
      "student number,full name,up mail\n",
      // blank lines only
      "student number,full name,up mail\n,,\n",
      // every line unparseable
      "student number,full name,up mail\n,Juan,juan.delacruz@up.edu.ph\n",
      // one parse error alongside good rows, and Pedro absent
      "student number,full name,up mail\n" +
        "2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n" +
        "2026-002,,maria.santos@up.edu.ph\n",
      // every usable row blocked (the original valve)
      "student number,full name,up mail\n2026-001,Juan Dela Cruz,oops\n",
    ];
    for (const csv of unsafe) {
      const parsed = parseRosterCsv(csv);
      const preview = await previewRosterImport(teacher.id, section.id, parsed);
      expect(preview.toDeactivate).toEqual([]);
      const summary = await commitRosterImport(teacher.id, section.id, parsed, "v2");
      expect(summary.deactivated).toBe(0);
      expect(await activeCount(section.id)).toBe(3);
    }
  });

  it("refuses malformed and uncertain numbers without aborting or deactivating", async () => {
    const { teacher, section } = await classOfThree();
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n" +
        "!!!,Punctuation Only,punctuation@up.edu.ph\n" +
        "2.02312e+8,Scientific Value,scientific@up.edu.ph\n" +
        "2026.00001,Decimal Value,decimal@up.edu.ph\n" +
        "2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n",
    );

    // The malformed rows are explicit refused actions, not a parser or hash
    // failure. The clean row remains importable, but an uncertain number makes
    // absence unsafe, so no existing student is dropped.
    const preview = await previewRosterImport(teacher.id, section.id, parsed);
    expect(preview.blockedCount).toBe(3);
    expect(preview.actions.filter((a) => a.kind === "blocked")).toHaveLength(3);
    expect(preview.toDeactivate).toEqual([]);

    const summary = await commitRosterImport(teacher.id, section.id, parsed, "v2");
    expect(summary.blocked).toBe(3);
    expect(summary.deactivated).toBe(0);
    expect(summary.created).toBe(0);
    expect(await activeCount(section.id)).toBe(3);
    expect((await db.query.studentRecords.findMany()).map((r) => r.rosterEmail)).toEqual([
      "juan.delacruz@up.edu.ph",
      "maria.santos@up.edu.ph",
      "pedro.reyes@up.edu.ph",
    ]);
  });

  it("still drops a student who is genuinely off a clean list", async () => {
    const { teacher, section } = await classOfThree();
    // No parse errors, usable rows, not all blocked: the list is trustworthy,
    // so absence means absence. Maria's row is blocked on its email AND Pedro
    // is missing — she stays, he goes.
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-001,Juan Dela Cruz,juan.delacruz@up.edu.ph\n" +
        "2026-002,Maria Santos,not-an-email\n",
    );
    expect(parsed.errors).toHaveLength(0);

    const preview = await previewRosterImport(teacher.id, section.id, parsed);
    expect(preview.toDeactivate).toHaveLength(1);

    const summary = await commitRosterImport(teacher.id, section.id, parsed, "v2");
    expect(summary.blocked).toBe(1);
    expect(summary.deactivated).toBe(1);
    expect(await statusOf(section.id, "2026-001")).toBe("active");
    expect(await statusOf(section.id, "2026-002")).toBe("active");
    expect(await statusOf(section.id, "2026-003")).toBe("deactivated");
  });
});

/**
 * Two spellings of one student number are one student.
 *
 * The identity is the NORMALIZED number — that is what the uniqueness hash and
 * every lookup are keyed on — so in-file duplicate detection has to normalize
 * too. Comparing raw cells let `2026-00001` and `202600001` pass as two people,
 * and the second line then overwrote the first one's UP email: the access key,
 * reassigned to a different person with no warning and no blocked row.
 */
describe("in-file duplicate student numbers collide across punctuation", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function setup() {
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);
    return { teacher, section };
  }

  const recordFor = async (studentNumber: string) =>
    db.query.studentRecords.findFirst({
      where: eq(
        studentRecords.studentNumberHash,
        studentNumberHash(studentNumber),
      ),
    });

  it("flags the second spelling as a duplicate rather than a second student", async () => {
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-00001,Juan Dela Cruz,juan@up.edu.ph\n" +
        "202600001,Maria Santos,maria@up.edu.ph\n",
    );
    // Reported on both channels the CSV path offers.
    expect(parsed.errors).toEqual([
      {
        line: 3,
        message: "Duplicate student number 202600001 (first seen on line 2)",
      },
    ]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.studentNumber).toBe("2026-00001");
  });

  it("cannot overwrite the first student's identity or UP email", async () => {
    const { teacher, section } = await setup();
    const summary = await commitRosterImport(
      teacher.id,
      section.id,
      parseRosterCsv(
        "student number,full name,up mail\n" +
          "2026-00001,Juan Dela Cruz,juan@up.edu.ph\n" +
          "202600001,Maria Santos,maria@up.edu.ph\n",
      ),
      "dup file",
    );
    expect(summary.created).toBe(1);
    expect(summary.errored).toBe(1);
    // The line that would have stolen the access key never ran.
    expect(summary.emailsLinked).toBe(1);
    expect(summary.namesUpdated).toBe(0);

    const record = (await recordFor("2026-00001"))!;
    expect(record.fullName).toBe("Juan Dela Cruz");
    expect(record.rosterEmail).toBe("juan@up.edu.ph");
    expect(await db.query.studentRecords.findMany()).toHaveLength(1);
  });

  it("separator, spacing and case are all one number", async () => {
    for (const spelling of ["2026 00001", "2026--00001", " 2026-00001 "]) {
      const parsed = parseRosterCsv(
        "student number,full name,up mail\n" +
          "2026-00001,Juan Dela Cruz,juan@up.edu.ph\n" +
          `${spelling},Maria Santos,maria@up.edu.ph\n`,
      );
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.errors).toHaveLength(1);
      expect(parsed.errors[0]!.message).toContain("Duplicate student number");
    }
  });

  it("does not collide two genuinely different numbers", async () => {
    const parsed = parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-00001,Juan Dela Cruz,juan@up.edu.ph\n" +
        "2026-00002,Maria Santos,maria@up.edu.ph\n",
    );
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.errors).toHaveLength(0);
  });
});
