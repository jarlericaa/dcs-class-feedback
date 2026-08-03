import { isNull, sql } from "drizzle-orm";
import { db } from "../src/db";
import { studentRecords } from "../src/db/schema";
import { writeAudit } from "../src/modules/audit";
import {
  ciphertextKeyVersion,
  KEY_VERSIONS,
  openStudentNumber,
  sealStudentNumber,
  studentNumberCryptoReady,
} from "../src/modules/crypto/student-number";
import { env } from "../src/env";

/**
 * Student-number encryption backfill (project-specs.md §11).
 *
 * Runs BETWEEN the migration that adds the sealed columns and the future
 * migration that drops the plaintext one. See docs/DEPLOYMENT.md.
 *
 *   npm run db:backfill:student-numbers -- [--dry-run] [--verify-only] [--rotate]
 *
 * Properties that matter:
 *
 * - **Idempotent and resumable.** Work is selected by `hash IS NULL`, so an
 *   interrupted run simply continues, and a completed run is a no-op.
 *   Each batch is its own transaction.
 * - **Verified before you can drop anything.** The final pass proves there are no
 *   unsealed rows, no hash collisions (which would silently merge two students),
 *   and that a sample decrypts back to the plaintext it came from.
 * - **Never logs a student number.** Only counts and row ids.
 * - `--rotate` re-seals with the current key, reading through
 *   `STUDENT_NUMBER_ENC_KEY_PREVIOUS`, for key rotation.
 */

const BATCH_SIZE = 500;
const SAMPLE_SIZE = 20;

interface Flags {
  dryRun: boolean;
  verifyOnly: boolean;
  rotate: boolean;
}

function parseFlags(argv: string[]): Flags {
  return {
    dryRun: argv.includes("--dry-run"),
    verifyOnly: argv.includes("--verify-only"),
    rotate: argv.includes("--rotate"),
  };
}

function requireKeys() {
  if (!studentNumberCryptoReady()) {
    throw new Error(
      "STUDENT_NUMBER_ENC_KEY and STUDENT_NUMBER_HASH_KEY must both be set to 32 base64 bytes. Generate with: openssl rand -base64 32",
    );
  }
  if (env.usingDevCryptoKeys) {
    console.warn(
      "WARNING: using the built-in DEVELOPMENT keys. Never run this against real student data with these.",
    );
  }
}

async function seal(flags: Flags): Promise<number> {
  let total = 0;
  for (;;) {
    const batch = await db
      .select({
        id: studentRecords.id,
        studentNumber: studentRecords.studentNumber,
      })
      .from(studentRecords)
      .where(isNull(studentRecords.studentNumberHash))
      .limit(BATCH_SIZE);
    if (batch.length === 0) break;

    const usable = batch.filter((row) => row.studentNumber);
    const unusable = batch.length - usable.length;
    if (unusable > 0) {
      throw new Error(
        `${unusable} record(s) have neither a plaintext number nor a sealed one. Fix or delete them before continuing.`,
      );
    }

    if (flags.dryRun) {
      console.log(`[dry-run] would seal ${usable.length} record(s)`);
      total += usable.length;
      // Without writing, the same batch would be selected forever.
      if (usable.length < BATCH_SIZE) break;
      // A dry run cannot page reliably; report the first batch and stop.
      break;
    }

    await db.transaction(async (tx) => {
      for (const row of usable) {
        const sealed = sealStudentNumber(row.studentNumber!, row.id);
        await tx
          .update(studentRecords)
          .set({
            studentNumberCiphertext: sealed.ciphertext,
            studentNumberHash: sealed.hash,
            studentNumberLast4: sealed.last4,
            encKeyVersion: sealed.encKeyVersion,
            updatedAt: new Date(),
          })
          .where(sql`${studentRecords.id} = ${row.id}`);
      }
      await writeAudit(tx, {
        actorUserId: null,
        action: "student_number.backfilled",
        entityType: "student_records",
        // Counts only. A student number must never reach the audit log.
        metadata: { count: usable.length },
      });
    });
    total += usable.length;
    console.log(`sealed ${usable.length} record(s) (running total ${total})`);
  }
  return total;
}

async function rotate(flags: Flags): Promise<number> {
  const rows = await db
    .select({
      id: studentRecords.id,
      ciphertext: studentRecords.studentNumberCiphertext,
    })
    .from(studentRecords);
  let rotated = 0;
  for (const row of rows) {
    if (!row.ciphertext) continue;
    if (ciphertextKeyVersion(row.ciphertext) === KEY_VERSIONS.current) continue;
    const plaintext = openStudentNumber(row.ciphertext, row.id);
    if (flags.dryRun) {
      rotated += 1;
      continue;
    }
    const sealed = sealStudentNumber(plaintext, row.id);
    await db
      .update(studentRecords)
      .set({
        studentNumberCiphertext: sealed.ciphertext,
        studentNumberHash: sealed.hash,
        studentNumberLast4: sealed.last4,
        encKeyVersion: sealed.encKeyVersion,
        updatedAt: new Date(),
      })
      .where(sql`${studentRecords.id} = ${row.id}`);
    rotated += 1;
  }
  return rotated;
}

async function verify(): Promise<void> {
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      unsealed: sql<number>`count(*) FILTER (WHERE student_number_hash IS NULL)::int`,
      distinctHashes: sql<number>`count(DISTINCT student_number_hash)::int`,
      sealed: sql<number>`count(*) FILTER (WHERE student_number_hash IS NOT NULL)::int`,
    })
    .from(studentRecords);

  const problems: string[] = [];
  if (counts!.unsealed > 0) {
    problems.push(`${counts!.unsealed} record(s) are still unsealed.`);
  }
  // A hash collision would mean two students share one identity. Refuse loudly.
  if (counts!.distinctHashes !== counts!.sealed) {
    problems.push(
      `hash collision: ${counts!.sealed} sealed record(s) but only ${counts!.distinctHashes} distinct hashes.`,
    );
  }

  // Sampled round-trip against the surviving plaintext, where there is one.
  const sample = await db
    .select({
      id: studentRecords.id,
      plaintext: studentRecords.studentNumber,
      ciphertext: studentRecords.studentNumberCiphertext,
      last4: studentRecords.studentNumberLast4,
    })
    .from(studentRecords)
    .limit(SAMPLE_SIZE);
  let checked = 0;
  for (const row of sample) {
    if (!row.ciphertext) continue;
    const decrypted = openStudentNumber(row.ciphertext, row.id);
    if (row.plaintext) {
      const normalizedPlain = row.plaintext
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      if (decrypted !== normalizedPlain) {
        problems.push(`record ${row.id} does not decrypt back to its plaintext.`);
      }
    }
    if (row.last4 && !decrypted.endsWith(row.last4)) {
      problems.push(`record ${row.id} has a last-4 that does not match.`);
    }
    checked += 1;
  }

  console.log(
    `verification: ${counts!.total} record(s), ${counts!.sealed} sealed, ${checked} sampled and decrypted`,
  );
  if (problems.length > 0) {
    throw new Error(`verification FAILED:\n  - ${problems.join("\n  - ")}`);
  }
  console.log("verification passed.");
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  requireKeys();

  if (flags.verifyOnly) {
    await verify();
    return;
  }

  if (flags.rotate) {
    const rotated = await rotate(flags);
    console.log(
      flags.dryRun
        ? `[dry-run] would re-seal ${rotated} record(s) with the current key`
        : `re-sealed ${rotated} record(s) with the current key`,
    );
  } else {
    const sealedCount = await seal(flags);
    console.log(
      flags.dryRun
        ? `[dry-run] ${sealedCount} record(s) need sealing`
        : `sealed ${sealedCount} record(s)`,
    );
  }

  if (flags.dryRun) {
    console.log("dry run: nothing was written, and verification was skipped.");
    return;
  }

  await verify();
  console.log(
    [
      "",
      "Next step: the plaintext `student_records.student_number` column is now",
      "redundant. Drop it with a follow-up migration, applied as its OWN",
      "`npm run db:migrate` run:",
      "",
      "  1. remove `studentNumber` from src/db/schema/identity.ts",
      "  2. mark studentNumberCiphertext / Hash / Last4 as .notNull()",
      "  3. npm run db:generate && npm run db:migrate",
      "",
      "Do not do this until this verification has passed on the target database.",
    ].join("\n"),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
