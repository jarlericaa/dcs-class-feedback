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
- `tests/unit/cycle-windows.test.ts`
- `tests/unit/env.test.ts`
- `tests/unit/normalize.test.ts`
- `tests/unit/qa-remediation.test.ts`
- `tests/unit/roster-csv.test.ts`
- `tests/integration/authz.test.ts`
- `tests/integration/catalog.test.ts`
- `tests/integration/forms.test.ts`
- `tests/integration/matching.test.ts`
- `tests/integration/operations.test.ts`
- `tests/integration/participation.test.ts`
- `tests/integration/review-findings.test.ts`
- `tests/integration/review-publishing.test.ts`
- `tests/integration/roster-import.test.ts`

## High-value invariants

Every implementation change should preserve these behaviors:

- An unconfirmed account cannot access a section as a student.
- A TA cannot perform a section action without its specific permission flag.
- A teacher cannot access unrelated courses or sections through a guessed URL.
- A student cannot submit twice for the same cycle.
- Required questions are validated on the server, not only in the browser.
- A closed cycle rejects late submissions unless the approved reopen policy is
  explicitly applied.
- Invalid responses do not count toward participation.
- Public answers do not expose source identities.
- Merged answers preserve all internal source links.
- Re-running the scheduler does not duplicate cycles or publications.
- Roster re-import deactivates missing enrollments without deleting history.

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
[DEVELOPMENT.md](DEVELOPMENT.md).

The 2026-08-03 verification pass reported lint, typecheck, production build,
44 unit tests, and 114 PostgreSQL integration tests passing. Desktop/mobile
Chromium QA and remediation results are in
[qa/final-remediation-report.md](qa/final-remediation-report.md).
