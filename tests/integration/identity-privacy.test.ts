import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "./helpers";
import {
  addSectionStaff,
  makeCourse,
  makeSection,
  makeUser,
} from "./fixtures";
import { AuthzError } from "@/modules/authz";
import { listSectionRoster, listSectionStaff } from "@/modules/catalog";
import { listSectionAuditEvents } from "@/modules/audit";
import { commitRosterImport, parseRosterCsv, previewRosterImport } from "@/modules/roster-import";
import { weeklyMatrixCsv } from "@/modules/participation";

/**
 * The privacy invariants that the identity change must not have weakened.
 *
 * A student now resolves through their own email rather than a match row, so
 * these assert the thing that actually matters: being a student grants access to
 * YOUR classes and nothing about anybody else, and the staff-only identity
 * surfaces stay staff-only.
 */

async function classWithTwoStudents() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  await commitRosterImport(
    teacher.id,
    section.id,
    parseRosterCsv(
      "student number,full name,up mail\n" +
        "2026-0001,Juan Dela Cruz,juan@up.edu.ph\n" +
        "2026-0002,Maria Santos,maria@up.edu.ph\n",
    ),
    "seed roster",
  );
  const juan = await makeUser({ email: "juan@up.edu.ph", displayName: "Juan Dela Cruz" });
  const maria = await makeUser({ email: "maria@up.edu.ph", displayName: "Maria Santos" });
  return { teacher, course, section, juan, maria };
}

describe("a student cannot reach staff identity surfaces", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("refuses the class list, staff list, audit history, and exports", async () => {
    const { section, juan } = await classWithTwoStudents();

    await expect(
      listSectionRoster(juan.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      listSectionStaff(juan.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      listSectionAuditEvents(juan.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      weeklyMatrixCsv(juan.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("refuses to let a student import or preview a class list", async () => {
    const { section, juan } = await classWithTwoStudents();
    const list = parseRosterCsv(
      "student number,full name,up mail\n2026-9999,Self Enrol,juan@up.edu.ph\n",
    );
    await expect(
      previewRosterImport(juan.id, section.id, list),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      commitRosterImport(juan.id, section.id, list, "self-service"),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("refuses a classmate's roster row even to a student in the same section", async () => {
    const { section, maria } = await classWithTwoStudents();
    // Being rostered is not staff standing. Maria cannot read the list she is on.
    await expect(
      listSectionRoster(maria.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("keeps the class list, with its emails, behind view_student_identities", async () => {
    const { section, teacher } = await classWithTwoStudents();
    const plainTa = await makeUser();
    await addSectionStaff(section.id, plainTa.id, "ta", { reviewResponses: true });
    await expect(
      listSectionRoster(plainTa.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);

    const identityTa = await makeUser();
    await addSectionStaff(section.id, identityTa.id, "ta", {
      viewStudentIdentities: true,
    });
    const roster = await listSectionRoster(identityTa.id, section.id);
    expect(roster.map((r) => r.record.rosterEmail).sort()).toEqual([
      "juan@up.edu.ph",
      "maria@up.edu.ph",
    ]);
    // And the teacher sees the same thing.
    expect(await listSectionRoster(teacher.id, section.id)).toHaveLength(2);
  });

  it("shows staff the last four of a student number, never the whole thing", async () => {
    const { section, teacher } = await classWithTwoStudents();
    const roster = await listSectionRoster(teacher.id, section.id);
    for (const entry of roster) {
      expect(entry.record.studentNumberLast4).toMatch(/^\d{4}$/);
      // The plaintext column is dead; only ciphertext and the tail are readable.
      expect(entry.record.studentNumber).toBeNull();
      expect(JSON.stringify(entry.record)).not.toContain("2026-000");
    }
  });

  it("tells a rostered student nothing about a classmate through their own reads", async () => {
    const { juan, maria } = await classWithTwoStudents();
    const { listSectionsForUser } = await import("@/modules/catalog");
    const view = await listSectionsForUser(juan.id);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("maria@up.edu.ph");
    expect(serialized).not.toContain("Maria Santos");
    expect(serialized).not.toContain(maria.id);
  });
});
