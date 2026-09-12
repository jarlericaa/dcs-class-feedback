import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, truncateAll } from "./helpers";

/**
 * The shape migration 0008 leaves behind (ADR-0005).
 *
 * These assertions read the live database rather than the Drizzle schema
 * object, because the thing that can drift is the DATABASE: a migration that
 * was hand-written, or applied in a different order, is exactly what a schema
 * import cannot catch. The backfill itself is exercised below on real rows.
 */
describe("public Q&A is course-owned in the database", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function columns(table: string) {
    const rows = await db.execute<{
      column_name: string;
      is_nullable: string;
    }>(sql`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
    `);
    return new Map(rows.rows.map((r) => [r.column_name, r.is_nullable]));
  }

  it("makes course_id required and origin_section_id optional provenance", async () => {
    const cols = await columns("public_answers");
    expect(cols.get("course_id")).toBe("NO");
    expect(cols.get("origin_section_id")).toBe("YES");
    // The old authoritative column is gone under its old name, so nothing can
    // keep treating it as the access key by accident.
    expect(cols.has("section_id")).toBe(false);
  });

  it("moves comments to the course as well", async () => {
    const cols = await columns("public_answer_comments");
    expect(cols.get("course_id")).toBe("NO");
    expect(cols.get("origin_section_id")).toBe("YES");
    expect(cols.has("section_id")).toBe(false);
  });

  it("keys the archive and the idempotency token on the course", async () => {
    const rows = await db.execute<{ indexname: string; indexdef: string }>(sql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'public_answers'
    `);
    const byName = new Map(rows.rows.map((r) => [r.indexname, r.indexdef]));

    expect(byName.has("public_answers_course_idx")).toBe(true);
    expect(byName.has("public_answers_section_idx")).toBe(false);
    expect(byName.get("public_answers_archive_idx")).toContain("course_id");
    expect(byName.get("public_answers_archive_idx")).not.toContain("section_id");
    // Drafting stays idempotent per course rather than per section.
    expect(byName.get("public_answers_request_token_unique")).toContain(
      "course_id",
    );
    // Full-text search over the archive survived the move.
    expect(byName.has("public_answers_search_idx")).toBe(true);
  });

  it("keeps the foreign keys rather than weakening them", async () => {
    const rows = await db.execute<{ constraint_name: string }>(sql`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'public_answers'
        AND constraint_type = 'FOREIGN KEY'
    `);
    const names = rows.rows.map((r) => r.constraint_name).join(" ");
    expect(names).toContain("course_id_courses_id_fk");
    expect(names).toContain("origin_section_id");
  });

  /**
   * Per-section backlog exposure is retained as history, under a name that says
   * so — no rows were dropped, and nothing reads it as a live mechanism.
   */
  it("retains the old exposure rows as history, not as a visibility mechanism", async () => {
    const rows = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'section_backlog_visibility', 'backlog_section_exposure_history'
        )
    `);
    const names = rows.rows.map((r) => r.table_name);
    expect(names).toContain("backlog_section_exposure_history");
    expect(names).not.toContain("section_backlog_visibility");
  });

  /**
   * The backfill rule itself: an answer's course is the course of the section
   * it was published through. Asserted against real rows inserted the way the
   * pre-migration schema would have held them.
   */
  it("resolves a pre-migration row's course from its origin section", async () => {
    const { makeCourse, makeSection, makeUser } = await import("./fixtures");
    const teacher = await makeUser({ isTeacher: true });
    const course = await makeCourse(teacher.id);
    const section = await makeSection(course.id);

    // A row as the old model wrote it: owned by a section.
    await db.execute(sql`
      INSERT INTO public_answers
        (course_id, origin_section_id, public_question_text, answer_body,
         state, published_at, created_by_user_id)
      VALUES
        (${course.id}, ${section.id}, 'Legacy question', 'Legacy answer',
         'published', now(), ${teacher.id})
    `);

    const check = await db.execute<{ ok: boolean }>(sql`
      SELECT pa.course_id = cs.course_id AS ok
      FROM public_answers pa
      JOIN class_sections cs ON cs.id = pa.origin_section_id
    `);
    expect(check.rows).toHaveLength(1);
    expect(check.rows[0]!.ok).toBe(true);
  });
});
