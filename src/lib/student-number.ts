/**
 * Student numbers, for reading.
 *
 * The stored plaintext is NORMALIZED: `normalizeStudentNumber` uppercases and
 * strips every character outside `[A-Z0-9]`, so `2026-00001`, `2026 00001` and
 * `202600001` are one student and cannot drift apart. That normalization is
 * what makes the uniqueness constraint and the lookup hash work, and it is
 * deliberately lossy about punctuation.
 *
 * Which leaves a display problem: a teacher reads `2026-00001` on their own
 * class list, and the number they were shown was `Student number ending 0001`.
 * This restores the separator for reading ONLY. It invents nothing: the digits
 * are exactly the stored ones, in order, and the identity of the record is
 * still the normalized form. If the value is not the one shape the separator is
 * known to belong to, it is printed exactly as stored rather than guessed at.
 */

/**
 * The UP student number: a four-digit entry year, then a five-digit serial.
 *
 * Narrow on purpose. Splitting anything else — an eight-digit number, a ten
 * digit one, a value carrying a letter — would be inventing a structure this
 * code has not been told about, and a mis-split identifier is worse than an
 * unpunctuated one.
 */
const UP_FORMAT = /^(\d{4})(\d{5})$/;

export function formatStudentNumber(
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;
  const match = UP_FORMAT.exec(trimmed);
  // Leading zeroes are preserved throughout: a student number is an
  // identifier, never a number.
  return match ? `${match[1]}-${match[2]}` : trimmed;
}

/**
 * What to show where the full number cannot be read.
 *
 * A record created before the encryption backfill has no ciphertext, and a
 * ciphertext sealed with a key this deployment no longer holds cannot be
 * opened. Both degrade to the last four characters, which are stored in clear
 * for exactly this reason — and the reader is told which one they are looking
 * at, rather than being shown a truncated value dressed as a whole one.
 */
export function studentNumberTail(last4: string | null | undefined): string | null {
  return last4 ? `…${last4}` : null;
}
