/**
 * Integration-test DB access. The DATABASE_URL override lives in
 * setup-env.ts (a vitest setupFile) so it runs before ANY module import —
 * a same-file assignment would be hoisted below the imports and the app db
 * would silently connect to the dev database.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";

const url = process.env.DATABASE_URL ?? "";
if (!url.includes("5433") && !url.includes("feedback_test")) {
  throw new Error(
    `Refusing to run integration tests against a non-test database: ${url}`,
  );
}

export { db };
export * as schema from "@/db/schema";

/** Empty every app table (not the migrations journal). */
export async function truncateAll() {
  const tables = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '__drizzle%'
  `);
  const names = tables.rows
    .map((r) => `"${r.tablename}"`)
    .join(", ");
  if (names.length > 0) {
    await db.execute(sql.raw(`TRUNCATE TABLE ${names} CASCADE`));
  }
}

let seq = 0;
/** Unique-ish suffix for fixture values within a test run. */
export function uniq(prefix: string) {
  seq += 1;
  return `${prefix}-${seq}`;
}
