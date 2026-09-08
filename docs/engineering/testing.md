# Testing Strategy

## Test layers

| Layer | Current status | Purpose |
|---|---|---|
| Unit tests | **[Implemented]** | Pure normalization, validation, recurrence, and small domain rules |
| Database integration tests | **[Implemented]** | Authz, form submission, matching, roster import, review, publishing, and participation behavior |
| Browser end-to-end tests | **[Deferred]** | Full student/staff journeys against a running app |
| Manual UI verification | **[Required now]** | Responsive layout, accessibility, empty/error/loading states, and privacy copy |

## Existing test locations

- `tests/unit/answer-validation.test.ts`
- `tests/unit/audit-story.test.ts`
- `tests/unit/cycle-windows.test.ts`
- `tests/unit/email-identity.test.ts`
- `tests/unit/email-list.test.ts`
- `tests/unit/env.test.ts`
- `tests/unit/long-text.test.ts`
- `tests/unit/nav.test.ts`
- `tests/unit/qa-remediation.test.ts`
- `tests/unit/richtext-render.test.ts`
- `tests/unit/roster-csv.test.ts`
- `tests/unit/staff-batch-labels.test.ts`
- `tests/unit/student-number-display.test.ts`
- `tests/unit/term.test.ts`
- `tests/integration/audit-history.test.ts`
- `tests/integration/authz.test.ts`
- `tests/integration/catalog.test.ts`
- `tests/integration/email-outbox.test.ts`
- `tests/integration/form-delivery.test.ts`
- `tests/integration/forms-audience.test.ts`
- `tests/integration/forms-privacy.test.ts`
- `tests/integration/forms.test.ts`
- `tests/integration/identity-privacy.test.ts`
- `tests/integration/instance-customization.test.ts`
- `tests/integration/operations.test.ts`
- `tests/integration/participation-filters.test.ts`
- `tests/integration/participation.test.ts`
- `tests/integration/review-findings.test.ts`
- `tests/integration/review-publishing.test.ts`
- `tests/integration/review-questions.test.ts`
- `tests/integration/review-reads.test.ts`
- `tests/integration/review-scope.test.ts`
- `tests/integration/roster-display.test.ts`
- `tests/integration/roster-page.test.ts`
- `tests/integration/roster-import.test.ts`
- `tests/integration/student-identity.test.ts`
- `tests/integration/submission-lifecycle.test.ts`

> Corrected 2026-09-06: this list previously named `tests/unit/normalize.test.ts`
> and `tests/integration/matching.test.ts`, neither of which exists — account
> matching was removed with decision D23 ([domain/student-identity.md](../domain/student-identity.md)).

## High-value invariants

Every implementation change should preserve these behaviors:

- A signed-in account is a student exactly where its **normalized UP email
  equals** a class-list `roster_email`, and that record holds an **active
  enrolment** in the section. No confirmation, no claim, no name matching, and
  no canonicalization that could map two mailboxes onto one
  ([domain/student-identity.md](../domain/student-identity.md), decision D23).
- Two student records can never carry the same address
  (`student_records_roster_email_unique`), so "who is this?" has exactly one
  answer.
- An account whose email is on no class list is told only that, and is shown no
  roster data.
- A TA cannot perform a section action without its specific permission flag.
- A teacher cannot access unrelated courses or sections through a guessed URL.
- Only the course owner grants or revokes staff standing, at either scope; a
  co-teacher holding full capability on a section still cannot.
- The Teaching team list shows the owner once. The rows the platform writes for
  them by itself are suppressed — their `course_staff` row always, their
  `section_staff` row only when it grants everything — but a `ta` row written
  for the owner deliberately is KEPT, because it is not removable and no other
  view discloses it. The suppression reaches the owner and nobody else, and the
  count, order and offset all come from the same statement, so it can never
  produce a short page or a phantom next page.
- Course-wide standing reaches a section created *after* the grant, and is
  refused role `ta` — there is no course-wide Student Assistant.
- Revoking course-wide standing leaves that person's separate section grants
  intact, and the owner's own standing cannot be revoked.
- Adding several people is atomic: one unusable address writes nothing, and no
  address without an active account is ever granted anything.
- A section id from another course is refused rather than written to.
- A student cannot submit twice for the same cycle.
- Required questions are validated on the server, not only in the browser.
- A closed cycle rejects late submissions unless the approved reopen policy is
  explicitly applied.
- Invalid responses do not count toward participation.
- Public answers do not expose source identities.
- Merged answers preserve all internal source links.
- Re-running the scheduler does not duplicate cycles or publications.
- Roster re-import deactivates missing enrollments without deleting history.
- The class Q&A archive names the staff member who **published** an answer and
  never the student who **asked** — and carries no source link, draft or
  revision metadata in the student payload
  ([domain/public-qa.md](../domain/public-qa.md) §8).
- Every published answer has an author: `public_answers.created_by_user_id` is
  NOT NULL with a foreign key, so the "no name" arm of that byline is defensive
  only.
- The audit history's default diff prints no identity value and no body. The
  roster rows genuinely store a student's `fullName` and `rosterEmail` — that is
  what makes an access grant auditable — so the diff shows the field's label and
  `withheld`, with absence still reading as `not set`. Prose fields report a
  length. Enforced by an explicit list AND by name patterns, so a field a future
  writer adds is withheld until classified. `publicQuestionText` is the one
  documented exception. The raw payload behind the closed "Technical details"
  disclosure is deliberately unredacted, staff-only, and never modifies the row.
- The audit history names no student anywhere: not as the object, not as the
  actor, and not in the actor filter's options. A student-shaped entity resolves
  to a noun rather than a label; the subject map is keyed by entity TYPE and id
  so a student-shaped row cannot inherit a course entity's label, and each
  lookup is constrained to this section or its course; the actions a student
  performs are masked in the read model (`actor` null, no `actorUserId`) and
  read as "A student"; and the actor selector offers a person only when they
  wrote a row as staff, with "Students" as a group option. Filtering by a
  guessed student id returns nothing rather than that student's own activity.
- The audit action filter is offered from an explicit allowlist derived from
  `AUDIT_ACTIONS`, not from the visible page, so an action with no rows in this
  section is still findable. Requesting a withheld action inside the default
  scope returns nothing rather than dropping the filter.
- Audit date bounds are the SECTION's calendar days, both ends inclusive: a row
  at 00:30 Manila belongs to that local day, not to the previous UTC one, and
  `from == to` is one whole day. A malformed date is ignored rather than
  emptying the list.
- Audit filtering, counting, ordering and offset all come from one predicate,
  so a filtered view cannot advertise a page it has nothing to fill — and rows
  written before the audit table had a section column are still reached by the
  entity-id fan-out.
- The audit scope admits its **owning course's** course-level rows (those naming
  a course and no section), because a section's forms, templates and schedules
  live there. A row that explicitly names a SIBLING section is excluded even
  when it shares the course or names a colliding entity id: scoping rests on
  what the row says, never on uuid uniqueness.
- Only the exact scope value `all` widens the audit view. Any other value —
  `ALL`, `everything`, a typo, an empty string — normalizes to the default, so
  an unrecognised parameter cannot drop the allowlist clause. The action
  selector is built from the set the current scope can show, so it never
  advertises a record it cannot select.
- A participation filter NARROWS and never widens. The answer key must be one
  the question actually offers, checked against the same list the selector is
  built from — so an off-step or out-of-range scale value, a key that merely
  parses to a number (`2abc`), a question from another occurrence, or an unknown
  option id all return nothing rather than everyone. A half-specified filter is
  refused, and a blank or whitespace query-string value is absent rather than a
  value. The export header and the audit row describe the filter that was
  APPLIED, so neither can claim a narrowing the query refused.
- The filtered week list is one row per STUDENT even when the filtered answer is
  a multi-select, and it is paginated in the database — a class of any size
  costs one page of rows.
- An export runs the same scope query as the screen above it, so the file and
  the list can never disagree about what the filter meant.
- Every export is audited with the filter that produced it — ids, counts and a
  format, never a name, an address or a student number.
- The whole student number reaches the class-list screen only through
  `listSectionRosterPage` (the older whole-section `listSectionRoster` remains a
  staff-only service read), both of which require `viewStudentIdentities`; the
  paged screen decrypts only rows on the requested page, degrades to the stored
  last four when a row cannot be opened, and never writes a number to an audit
  row, an export header, or any student-facing payload. The display formatter
  restores the separator for one known shape and prints anything else exactly as
  stored — it must never be the reason two students look alike.
- A class-list import accepts a CRS-style XLSX, an uploaded CSV, or pasted CSV;
  it is atomic and audited whether or not a preview preceded it: one
  transaction, one `ImportBatch`, a refused row written nothing, and a student
  the file no longer lists is deactivated rather than deleted. When EVERY row
  is refused, nobody is deactivated — an unusable file must not empty a class
  list.
- Read state is **per reader**: marking a response read never changes what a
  colleague sees, and it changes nothing about the submission — no validity, no
  participation credit, no disposition, no publication. A student is never told
  whether staff have opened their submission, and cannot set the marker.
- Marking read is idempotent: a second mark adds no row, does not move
  `read_at`, and writes no second entry to the append-only audit log. A bulk
  sweep writes ONE audit row carrying its count.
- A read mark is authorized on the response's **own** section, so standing on
  one audience section of a shared form cannot reach another's rows; a bulk
  sweep drops foreign ids rather than failing the whole batch.
- The review view renders the **occurrence's own** `form_questions` snapshot,
  in `displayOrder`, with each question's real type — never a fixed shape and
  never the base form's questions where an occurrence was customized. A
  question that was asked and not answered stays in the read model, marked.
- Staff-authored prompts and help text render through
  `src/modules/richtext/render.ts`; **student-authored text never does** and is
  emitted as escaped JSX text, so `src/components/rich-text.tsx` and its client
  twin remain the only two places HTML reaches the DOM.
- The contextual column offers a reader no destination that would reject them:
  the course strip inside a section appears only with course standing, and
  `firstStaffSectionHref` resolves a section to a **section** view.

## UI test checklist for the first build slice

- Test the student flow at narrow mobile widths and desktop widths.
- Confirm keyboard focus and visible focus states for every form control.
- Confirm required-field errors are associated with the right question.
- Confirm a duplicate-submit race produces one response and a clear message.
- Confirm the student sees no internal review or identity metadata.
- Confirm the teacher sees enough context to review but cannot accidentally
  publish the original identifying wording without an explicit warning.
- Confirm empty, loading, error, and success states are designed rather than
  relying on a blank page.
- Confirm route-level access checks still work when navigation links are hidden.

## Test commands

```bash
npm test
npm run test:integration
npm run lint
npm run typecheck
npm run build
```

Integration tests require the test PostgreSQL database described in
[development.md](development.md).

The 2026-09-07 verification pass reported lint, typecheck, production build,
**213 unit tests** and **388 PostgreSQL integration tests** passing from the
tracked files listed above; the audit write-side scope pass on 2026-09-08 added
four integration tests to `audit-history.test.ts`, for **392**. The integration run used an explicit local
Postgres URL rather than the Compose default:
`TEST_DATABASE_URL=postgres://feedback:feedback@127.0.0.1:5432/feedback_test npm run test:integration`. The same run in the authoring working tree reported
**219** unit tests, because an untracked `tests/unit/form-errors.test.ts` (6
tests) was present locally; it is not part of the committed suite, so **213 is
the number a clean checkout reproduces**. (The 2026-09-06 pass reported 157 and
284; the 2026-08-03 pass reported 44 and 114.)

`bash scripts/verify/http-matrix.sh` drives the running app over HTTP as the
seeded accounts and asserts on the rendered HTML, including the negative
authorization cases. The 2026-09-08 run reported **133 passed, 0 failed**
against `npm run db:seed` + `npm run dev`. Desktop/mobile
Chromium QA and remediation results are in
[qa/final-remediation-report.md](../qa/final-remediation-report.md).
