import { spawn } from "node:child_process";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const DEFAULT_DATABASE_URL =
  "postgres://feedback:feedback@localhost:5432/feedback";
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on real environment variables
}

function assertSafeTarget(databaseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL connection URL.");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(
      "DATABASE_URL must use the postgres:// or postgresql:// scheme.",
    );
  }

  if (!LOCAL_DATABASE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(
      `Refusing to reset non-local database host "${parsed.hostname}".`,
    );
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name.");
  }
  if (databaseName === "feedback_test" || databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to reset test database "${databaseName}". Set DATABASE_URL to the development database instead.`,
    );
  }

  if (process.env.TEST_DATABASE_URL === databaseUrl) {
    throw new Error("Refusing to reset TEST_DATABASE_URL.");
  }
}

function runNpmScript(script: string) {
  return new Promise<void>((resolve, reject) => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npm, ["run", script], {
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${script} failed with ${signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`}.`,
        ),
      );
    });
  });
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const unknownArgs = [...args].filter(
    (arg) => arg !== "--yes" && arg !== "--no-seed",
  );

  if (unknownArgs.length > 0 || !args.has("--yes")) {
    throw new Error(
      "Usage: npm run db:reset -- --yes [--no-seed]\nThis permanently replaces the local development database.",
    );
  }

  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") {
    throw new Error(
      `Refusing to reset with NODE_ENV=${process.env.NODE_ENV}; this command is development-only.`,
    );
  }
  assertSafeTarget(databaseUrl);

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    console.log("Resetting local development database...");
    // Drizzle stores its migration journal in the separate `drizzle` schema.
    // Clearing only `public` leaves that journal behind, so the next migrate
    // call incorrectly believes the tables have already been created.
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO public");
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }

  if (!args.has("--no-seed")) {
    await runNpmScript("db:seed");
    console.log("Development seed applied.");
  }

  console.log("Database reset complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
