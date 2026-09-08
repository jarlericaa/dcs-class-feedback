import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "@/env";

/**
 * Student-number protection at rest (docs/product/specification.md §11).
 *
 * Two independent derivations of the same plaintext:
 *
 * - **Ciphertext** — AES-256-GCM, random IV per call, authenticated with the
 *   owning row id as AAD. The AAD is what stops a ciphertext being copied from
 *   one student_records row onto another: decryption fails unless the row id
 *   matches, so a database-level swap cannot silently re-point an identity.
 * - **Lookup hash** — keyed HMAC-SHA256 of the *normalized* plaintext. It is
 *   deterministic, so it can carry the uniqueness constraint and serve every
 *   lookup without decrypting the table. It is keyed (not a bare digest) so an
 *   attacker holding only a dump cannot brute-force the small student-number
 *   space offline.
 *
 * The two keys are separate: leaking the hash key does not decrypt anything,
 * and leaking the encryption key does not let an attacker recompute lookups.
 *
 * `node:crypto` only — no dependency.
 */

export class CryptoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoConfigError";
  }
}

export class StudentNumberDecryptError extends Error {
  constructor(message = "Could not decrypt student number") {
    super(message);
    this.name = "StudentNumberDecryptError";
  }
}

const CURRENT_KEY_VERSION = 1;
const PREVIOUS_KEY_VERSION = 0;
const IV_BYTES = 12;
const KEY_BYTES = 32;

function decodeKey(value: string | undefined, name: string): Buffer | null {
  if (!value) return null;
  let raw: Buffer;
  try {
    raw = Buffer.from(value, "base64");
  } catch {
    throw new CryptoConfigError(`${name} is not valid base64`);
  }
  if (raw.length !== KEY_BYTES) {
    throw new CryptoConfigError(
      `${name} must decode to exactly ${KEY_BYTES} bytes (got ${raw.length})`,
    );
  }
  return raw;
}

function encKey(): Buffer {
  const key = decodeKey(env.STUDENT_NUMBER_ENC_KEY, "STUDENT_NUMBER_ENC_KEY");
  if (!key) {
    throw new CryptoConfigError(
      "STUDENT_NUMBER_ENC_KEY is not configured. Generate one with: openssl rand -base64 32",
    );
  }
  return key;
}

function previousEncKey(): Buffer | null {
  return decodeKey(
    env.STUDENT_NUMBER_ENC_KEY_PREVIOUS,
    "STUDENT_NUMBER_ENC_KEY_PREVIOUS",
  );
}

function hashKey(): Buffer {
  const key = decodeKey(env.STUDENT_NUMBER_HASH_KEY, "STUDENT_NUMBER_HASH_KEY");
  if (!key) {
    throw new CryptoConfigError(
      "STUDENT_NUMBER_HASH_KEY is not configured. Generate one with: openssl rand -base64 32",
    );
  }
  return key;
}

/** True when both keys are present and well-formed. Used by scripts/health checks. */
export function studentNumberCryptoReady(): boolean {
  try {
    encKey();
    hashKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonical comparison form.
 *
 * Uppercases and drops every character outside [A-Z0-9], so `2023-12345`,
 * `2023 12345` and `202312345` are the same student. **Leading zeroes are
 * preserved** — a student number is an identifier, never a number.
 */
export function normalizeStudentNumber(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Last up-to-4 characters of the normalized number, for staff list views. */
export function last4(raw: string): string {
  const normalized = normalizeStudentNumber(raw);
  return normalized.slice(-4);
}

/** Deterministic keyed lookup hash, base64url. */
export function studentNumberHash(raw: string): string {
  const normalized = normalizeStudentNumber(raw);
  if (!normalized) throw new Error("Student number is empty after normalization");
  return createHmac("sha256", hashKey()).update(normalized, "utf8").digest("base64url");
}

/** Constant-time comparison of two lookup hashes. */
export function studentNumberHashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function aad(recordId: string): Buffer {
  return Buffer.from(`student_record:${recordId}`, "utf8");
}

export interface SealedStudentNumber {
  /** `v<version>.<b64url iv>.<b64url tag>.<b64url ciphertext>` */
  ciphertext: string;
  hash: string;
  last4: string;
  encKeyVersion: number;
}

/**
 * Encrypt + derive the lookup hash. `aadRecordId` must be the id of the row the
 * ciphertext will live on, so callers must generate the row id up front rather
 * than letting the database default it.
 */
export function sealStudentNumber(
  plaintext: string,
  aadRecordId: string,
): SealedStudentNumber {
  const normalized = normalizeStudentNumber(plaintext);
  if (!normalized) throw new Error("Student number is empty after normalization");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv, {
    authTagLength: 16,
  });
  cipher.setAAD(aad(aadRecordId));
  const body = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: [
      `v${CURRENT_KEY_VERSION}`,
      iv.toString("base64url"),
      tag.toString("base64url"),
      body.toString("base64url"),
    ].join("."),
    hash: studentNumberHash(normalized),
    last4: normalized.slice(-4),
    encKeyVersion: CURRENT_KEY_VERSION,
  };
}

function openWith(
  key: Buffer,
  parts: { iv: Buffer; tag: Buffer; body: Buffer },
  aadRecordId: string,
): string {
  const decipher = createDecipheriv("aes-256-gcm", key, parts.iv, {
    authTagLength: 16,
  });
  decipher.setAAD(aad(aadRecordId));
  decipher.setAuthTag(parts.tag);
  return Buffer.concat([decipher.update(parts.body), decipher.final()]).toString(
    "utf8",
  );
}

/**
 * Decrypt. Tries the current key, then `STUDENT_NUMBER_ENC_KEY_PREVIOUS`, so a
 * key rotation does not have to be atomic with the re-seal backfill.
 */
export function openStudentNumber(
  ciphertext: string,
  aadRecordId: string,
): string {
  const segments = ciphertext.split(".");
  if (segments.length !== 4 || !segments[0]!.startsWith("v")) {
    throw new StudentNumberDecryptError("Malformed student-number ciphertext");
  }
  const parts = {
    iv: Buffer.from(segments[1]!, "base64url"),
    tag: Buffer.from(segments[2]!, "base64url"),
    body: Buffer.from(segments[3]!, "base64url"),
  };
  try {
    return openWith(encKey(), parts, aadRecordId);
  } catch (err) {
    if (err instanceof CryptoConfigError) throw err;
    const fallback = previousEncKey();
    if (!fallback) throw new StudentNumberDecryptError();
    try {
      return openWith(fallback, parts, aadRecordId);
    } catch {
      throw new StudentNumberDecryptError();
    }
  }
}

/** Key version a ciphertext was produced with, or null when unreadable. */
export function ciphertextKeyVersion(ciphertext: string): number | null {
  const tag = ciphertext.split(".")[0];
  if (!tag?.startsWith("v")) return null;
  const parsed = Number.parseInt(tag.slice(1), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export const KEY_VERSIONS = {
  current: CURRENT_KEY_VERSION,
  previous: PREVIOUS_KEY_VERSION,
} as const;

/**
 * The single decrypt entry point for application code. Takes the row so the
 * AAD can never be mismatched by a caller.
 */
export function revealStudentNumber(record: {
  id: string;
  studentNumberCiphertext: string | null;
}): string {
  if (!record.studentNumberCiphertext) {
    throw new StudentNumberDecryptError(
      "This student record predates student-number encryption; run scripts/backfill-student-numbers.ts",
    );
  }
  return openStudentNumber(record.studentNumberCiphertext, record.id);
}
