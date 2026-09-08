import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, truncateAll } from "./helpers";
import {
  addSectionStaff,
  makeCourse,
  makeSection,
  makeStudentRecord,
  makeUser,
} from "./fixtures";
import { enrollments, studentRecords } from "@/db/schema";
import { AuthzError, SECTION_PERMISSIONS } from "@/modules/authz";
import { listSectionRoster, listSectionRosterPage } from "@/modules/catalog";

/**
 * The class list, paged in the DATABASE.
 *
 * The screen used to load every enrollment, decrypt every student number in
 * order to search it, and then slice the array — so a section paid one AES-GCM
 * decrypt per student on every render, search included, and the query cost grew
 * with the class rather than with the page. This read model filters, counts,
 * orders and slices in SQL, and opens only the ciphertexts on the page.
 *
 * `listSectionRoster` is deliberately untouched and still returns the whole
 * section: the privacy tests hold it to a contract and the import path wants
 * the complete set. Both are asserted here to stay in agreement.
 */

/** Ana, Ben, Cara, Dino, Elle — alphabetical, so page boundaries are legible. */
async function classList() {
  const teacher = await makeUser({ isTeacher: true });
  const course = await makeCourse(teacher.id);
  const section = await makeSection(course.id);
  await addSectionStaff(section.id, teacher.id, "teacher", {
    viewStudentIdentities: true,
  });

  const add = async (
    fullName: string,
    studentNumber: string,
    rosterEmail: string | null,
    opts: {
      rosterName?: string;
      status?: "active" | "deactivated";
      account?: "active" | "inactive" | "none";
    } = {},
  ) => {
    const record = await makeStudentRecord(fullName, studentNumber, rosterEmail);
    await db.insert(enrollments).values({
      sectionId: section.id,
      studentRecordId: record.id,
      status: opts.status ?? "active",
      rosterName: opts.rosterName ?? fullName,
    });
    if (rosterEmail && opts.account && opts.account !== "none") {
      await makeUser({
        email: rosterEmail,
        displayName: fullName,
        active: opts.account === "active",
      });
    }
    return record;
  };

  const ana = await add("Ana Reyes", "2026-00001", "ana@up.edu.ph", {
    account: "active",
  });
  const ben = await add("Ben Cruz", "2026-00002", "ben@up.edu.ph", {
    // The class list spelled it differently from the canonical name, which is
    // the case `rosterName` exists for — and it has to be searchable.
    rosterName: "CRUZ, BENIGNO",
  });
  // An account exists but is deactivated: that is NOT signed in.
  const cara = await add("Cara Lim", "2026-00003", "cara@up.edu.ph", {
    account: "inactive",
  });
  // No UP email at all — cannot sign in, and cannot ever.
  const dino = await add("Dino Tan", "2026-00004", null);
  // Dropped from the list, but the account is real and active.
  const elle = await add("Elle Ong", "2026-00005", "elle@up.edu.ph", {
    status: "deactivated",
    account: "active",
  });

  return { teacher, course, section, ana, ben, cara, dino, elle };
}

const names = (page: { rows: { record: { fullName: string } }[] }) =>
  page.rows.map((r) => r.record.fullName);

describe("the class list is paged in the database", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("counts the whole section, whatever is on the page", async () => {
    const { teacher, section } = await classList();
    const page = await listSectionRosterPage(teacher.id, section.id, {
      pageSize: 2,
    });
    // `stats` describes the CLASS; `total` describes the current filter.
    expect(page.stats).toEqual({ total: 5, signedIn: 2, missingEmail: 1 });
    expect(page.total).toBe(5);
    expect(page.rows).toHaveLength(2);
  });

  it("keeps the section-wide figures independent of the filters", async () => {
    const { teacher, section } = await classList();
    const filtered = await listSectionRosterPage(teacher.id, section.id, {
      state: "dropped",
    });
    // One row matches, but the class still has five students and one of them
    // still has no UP email — the heading must not shrink with the filter.
    expect(filtered.total).toBe(1);
    expect(filtered.stats).toEqual({ total: 5, signedIn: 2, missingEmail: 1 });
  });

  it("walks the pages in a total order, with no row lost or repeated", async () => {
    const { teacher, section } = await classList();
    const opts = { pageSize: 2 };
    const p1 = await listSectionRosterPage(teacher.id, section.id, opts);
    const p2 = await listSectionRosterPage(teacher.id, section.id, {
      ...opts,
      page: 2,
    });
    const p3 = await listSectionRosterPage(teacher.id, section.id, {
      ...opts,
      page: 3,
    });

    expect(names(p1)).toEqual(["Ana Reyes", "Ben Cruz"]);
    expect(names(p2)).toEqual(["Cara Lim", "Dino Tan"]);
    expect(names(p3)).toEqual(["Elle Ong"]);
    expect(p1).toMatchObject({ page: 1, totalPages: 3, hasPrevious: false, hasNext: true });
    expect(p2).toMatchObject({ page: 2, totalPages: 3, hasPrevious: true, hasNext: true });
    expect(p3).toMatchObject({ page: 3, totalPages: 3, hasPrevious: true, hasNext: false });

    const ids = [...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.record.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("returns no rows for a page past the end, while still reporting the total", async () => {
    const { teacher, section } = await classList();
    const past = await listSectionRosterPage(teacher.id, section.id, {
      pageSize: 2,
      page: 9,
    });
    // The distinction the screen needs: nothing on this page, but the filter
    // did match — so it is a bad page number, not a failed search.
    expect(past.rows).toEqual([]);
    expect(past.total).toBe(5);
    expect(past.totalPages).toBe(3);
  });

  it("does not order by an unstable key when names collide", async () => {
    const { teacher, section } = await classList();
    for (const n of ["2026-00101", "2026-00102", "2026-00103"]) {
      const record = await makeStudentRecord("Zed Zamora", n, `z${n}@up.edu.ph`);
      await db.insert(enrollments).values({
        sectionId: section.id,
        studentRecordId: record.id,
        rosterName: "Zed Zamora",
      });
    }
    // Three identical names straddling a page boundary: the enrollment id is
    // the tie-breaker, so nobody appears twice and nobody vanishes.
    const seen: string[] = [];
    for (const page of [1, 2, 3, 4]) {
      const p = await listSectionRosterPage(teacher.id, section.id, {
        pageSize: 2,
        page,
      });
      seen.push(...p.rows.map((r) => r.record.id));
    }
    expect(seen).toHaveLength(8);
    expect(new Set(seen).size).toBe(8);
  });
});

describe("class-list filters run in SQL", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("narrows by signed-in state, counting a deactivated account as not signed in", async () => {
    const { teacher, section } = await classList();
    const of = async (state: "all" | "signed_in" | "not_signed_in" | "dropped") =>
      names(await listSectionRosterPage(teacher.id, section.id, { state }));

    expect(await of("all")).toEqual([
      "Ana Reyes",
      "Ben Cruz",
      "Cara Lim",
      "Dino Tan",
      "Elle Ong",
    ]);
    // Elle is dropped but her account is live, so "signed in" still includes
    // her — the flag reports the ACCOUNT, not the enrollment.
    expect(await of("signed_in")).toEqual(["Ana Reyes", "Elle Ong"]);
    // Cara's account is deactivated and Dino has no address at all: both are
    // "not signed in yet", which is what a teacher is looking for here.
    expect(await of("not_signed_in")).toEqual([
      "Ben Cruz",
      "Cara Lim",
      "Dino Tan",
    ]);
    expect(await of("dropped")).toEqual(["Elle Ong"]);
  });

  it("searches the canonical name, the class-list name, and the email", async () => {
    const { teacher, section } = await classList();
    const find = async (q: string) =>
      names(await listSectionRosterPage(teacher.id, section.id, { q }));

    expect(await find("reyes")).toEqual(["Ana Reyes"]);
    expect(await find("REYES")).toEqual(["Ana Reyes"]); // case-insensitive
    // Only the class-list spelling carries "Benigno".
    expect(await find("benigno")).toEqual(["Ben Cruz"]);
    expect(await find("cara@up")).toEqual(["Cara Lim"]);
    expect(await find("@up.edu.ph")).toHaveLength(4); // Dino has no address
    expect(await find("nobody-here")).toEqual([]);
  });

  it("combines a search with a state filter", async () => {
    const { teacher, section } = await classList();
    expect(
      names(
        await listSectionRosterPage(teacher.id, section.id, {
          q: "@up.edu.ph",
          state: "signed_in",
        }),
      ),
    ).toEqual(["Ana Reyes", "Elle Ong"]);
  });

  it("treats a search term as literal text, not as a LIKE pattern", async () => {
    const { teacher, section } = await classList();
    // A stray % used to match the whole class. It has to match nobody.
    expect(names(await listSectionRosterPage(teacher.id, section.id, { q: "%" }))).toEqual([]);
    expect(names(await listSectionRosterPage(teacher.id, section.id, { q: "_" }))).toEqual([]);
  });
});

/**
 * Searching a number that exists in no column.
 *
 * `student_records` holds a ciphertext, a keyed HMAC and the last four
 * characters — never the number itself. So SQL can match it exactly, through
 * the hash that identity is already keyed on, or by its last four. An arbitrary
 * substring has nothing to match against, and the fix for that would be storing
 * the number in clear, which project-specs.md §11 forbids.
 */
describe("student-number search, and its encrypted boundary", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("finds a whole number written either way", async () => {
    const { teacher, section } = await classList();
    const find = async (q: string) =>
      names(await listSectionRosterPage(teacher.id, section.id, { q }));

    // The separator is normalized away on both sides, so these are one lookup.
    expect(await find("2026-00003")).toEqual(["Cara Lim"]);
    expect(await find("202600003")).toEqual(["Cara Lim"]);
    expect(await find(" 2026 00003 ")).toEqual(["Cara Lim"]);
    expect(await find("2026--00003")).toEqual(["Cara Lim"]);
  });

  it("finds a student by the last four, which are stored in clear", async () => {
    const { teacher, section } = await classList();
    expect(
      names(await listSectionRosterPage(teacher.id, section.id, { q: "0004" })),
    ).toEqual(["Dino Tan"]);
  });

  it("matches only a complete last-four tail, not an arbitrary substring", async () => {
    const { teacher, section } = await classList();
    expect(
      names(await listSectionRosterPage(teacher.id, section.id, { q: "0003" })),
    ).toEqual(["Cara Lim"]);
    // Neither a shorter fragment, a longer fragment, nor the year prefix can
    // be answered from the stored tail; all would require decrypting every
    // record or adding a plaintext search column.
    for (const q of ["003", "00003", "2026"]) {
      expect(
        names(await listSectionRosterPage(teacher.id, section.id, { q })),
      ).toEqual([]);
    }
  });

  it("degrades one unreadable row without touching the rest of the page", async () => {
    const { teacher, section, elle } = await classList();
    await db
      .update(studentRecords)
      .set({ studentNumberCiphertext: null })
      .where(eq(studentRecords.id, elle.id));

    // Elle is on page 3. Page 1 neither reads nor is harmed by her row — which
    // is the point: the decrypt happens per RENDERED row, not per student.
    const p1 = await listSectionRosterPage(teacher.id, section.id, {
      pageSize: 2,
    });
    expect(p1.rows.every((r) => r.studentNumber !== null)).toBe(true);
    expect(p1.stats.total).toBe(5);

    const p3 = await listSectionRosterPage(teacher.id, section.id, {
      pageSize: 2,
      page: 3,
    });
    expect(p3.rows).toHaveLength(1);
    expect(p3.rows[0]!.studentNumber).toBeNull();
    // And the truthful fallback the screen prints is still there.
    expect(p3.rows[0]!.record.studentNumberLast4).toBe("0005");
  });

  it("returns the whole number, normalized, for the reader entitled to it", async () => {
    const { teacher, section } = await classList();
    const page = await listSectionRosterPage(teacher.id, section.id, {
      q: "2026-00001",
    });
    expect(page.rows[0]!.studentNumber).toBe("202600001");
    expect(page.rows[0]!.signedIn).toBe(true);
  });
});

describe("the paged class list is gated exactly like the whole one", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("requires view_student_identities, and nothing else substitutes", async () => {
    const { section } = await classList();
    const ta = await makeUser({});
    await addSectionStaff(
      section.id,
      ta.id,
      "ta",
      Object.fromEntries(
        SECTION_PERMISSIONS.map((p) => [p, p !== "viewStudentIdentities"]),
      ),
    );
    await expect(
      listSectionRosterPage(ta.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);

    const outsider = await makeUser({ isTeacher: true });
    await expect(
      listSectionRosterPage(outsider.id, section.id),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("agrees with listSectionRoster, which still returns the whole section", async () => {
    const { teacher, section } = await classList();
    const whole = await listSectionRoster(teacher.id, section.id);
    const paged = await listSectionRosterPage(teacher.id, section.id, {
      pageSize: 200,
    });

    expect(whole).toHaveLength(5);
    expect(paged.total).toBe(whole.length);
    expect(paged.rows.map((r) => r.record.id)).toEqual(
      whole.map((r) => r.record.id),
    );
    expect(paged.rows.map((r) => r.signedIn)).toEqual(
      whole.map((r) => r.signedIn),
    );
    expect(paged.rows.map((r) => r.studentNumber)).toEqual(
      whole.map((r) => r.studentNumber),
    );
    expect(paged.stats.signedIn).toBe(whole.filter((r) => r.signedIn).length);
    expect(paged.stats.missingEmail).toBe(
      whole.filter((r) => !r.record.rosterEmail).length,
    );
  });
});
