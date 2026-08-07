/**
 * Vitest setupFile shared by both projects.
 *
 * ALLOWED_EMAIL_DOMAINS is load-bearing now: it gates sign-in AND which
 * class-list emails may be imported, so a suite running with the schema default
 * (empty = reject everything) would silently pass tests that never exercised a
 * real address. Pinned here rather than read from .env so the expectations in
 * the identity tests mean something.
 */
process.env.ALLOWED_EMAIL_DOMAINS ??= "up.edu.ph";
