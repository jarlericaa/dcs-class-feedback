/**
 * Vitest setupFile for the integration project. Runs BEFORE any test file's
 * imports are evaluated, so src/db reads the test database URL — never the
 * dev database. (Doing this inside helpers.ts does not work: static imports
 * hoist above any assignment in the same module.)
 */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://feedback:feedback@localhost:5433/feedback_test";
