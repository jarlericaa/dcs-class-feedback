-- Deterministic UP-email identity: a student record gains the address that
-- resolves to it. Model and rationale: docs/student-identity.md.
--
-- HAND-EDITED to carry the backfill. The generated DDL is unchanged; the UPDATE
-- between the column and its unique index is what stops the next migration
-- (0005, which drops account_matches) from silently revoking access for every
-- student a teacher had already confirmed.
--
-- Migration behaviour, stated plainly because it is not reversible:
--   * A CONFIRMED account match becomes a roster email. That student keeps their
--     enrollments, submissions, history, and participation, and needs no second
--     login — their next request resolves through the new column.
--   * Candidate, ambiguous, unmatched, rejected and correction-pending rows are
--     DISCARDED. They were proposals, never access, and there is no honest way
--     to convert a name-similarity guess into an identity. Those students are
--     rostered again the next time their teacher imports a class list carrying
--     their UP email — which is now the only way anyone gets access.
--   * Roster claims are discarded with the same reasoning. The typed numbers in
--     them were encrypted guesses, and nothing downstream reads them.
--   * Student records themselves are untouched, so nothing a student wrote is
--     lost either way.
--   * Audit rows are NOT deleted: the log is append-only, so historical
--     claim.*/match.* events stay readable (see src/lib/audit-labels.ts).

ALTER TABLE "student_records" ADD COLUMN "roster_email" text;--> statement-breakpoint

-- Backfill from confirmed matches only. DISTINCT ON keeps one record per
-- address, so a database that somehow holds two confirmed matches for one email
-- cannot violate the unique index created below — the extra record is simply
-- left without an email and must be re-imported.
UPDATE "student_records" AS sr
SET "roster_email" = m."email"
FROM (
  SELECT DISTINCT ON (lower(btrim(u."email")))
    am."student_record_id" AS student_record_id,
    lower(btrim(u."email")) AS email
  FROM "account_matches" am
  JOIN "users" u ON u."id" = am."user_id"
  WHERE am."state" = 'confirmed'
    AND am."student_record_id" IS NOT NULL
    AND u."email" IS NOT NULL
  ORDER BY lower(btrim(u."email")), am."confirmed_at" DESC NULLS LAST, am."id"
) AS m
WHERE sr."id" = m."student_record_id";--> statement-breakpoint

-- Same normalization applied to accounts, so both sides of every future
-- comparison are already normalized and equality is the whole rule.
--
-- If two accounts differ only in case, this FAILS on users_email_unique and the
-- whole migration rolls back. That is deliberate: which of the two is the real
-- person is a human decision, and quietly picking one would hand somebody else's
-- classes to whichever row won.
UPDATE "users" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));--> statement-breakpoint

CREATE UNIQUE INDEX "student_records_roster_email_unique" ON "student_records" USING btree ("roster_email") WHERE "student_records"."roster_email" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "student_records" ADD CONSTRAINT "roster_email_normalized" CHECK ("student_records"."roster_email" IS NULL OR "student_records"."roster_email" = lower(btrim("student_records"."roster_email")));
