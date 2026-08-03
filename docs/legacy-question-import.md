# Legacy Question Import

> **Status:** Product rule specification; implementation is partial and tracked
> in [CURRENT_STATE.md](CURRENT_STATE.md).
> This document **owns** the import of historical questions and its privacy defaults. Backlog behavior: [question-backlog.md](question-backlog.md). Roster CSV import is separate — see [account-matching.md](account-matching.md#9-class-list-csv-import).
> Label key as in [product-requirements.md](product-requirements.md).

## 1. Purpose **[Confirmed]**

Support importing or manually recording questions from previous semesters and old workflows into the course-level backlog.

## 2. Possible legacy sources **[Confirmed]**

- Past Typst files
- Previous public Q&A documents
- Google Forms response sheets
- Weekly feedback response sheets
- Questions marked "will answer"
- Unread feedback that staff later identify as answerable

Legacy files may contain **both answered and unanswered** questions.

## 3. Privacy default: anonymous-by-default **[Confirmed]**

- Legacy sheets may still include student identifiers. **The default import behavior treats legacy questions as anonymous legacy questions** unless the teacher **explicitly** chooses to preserve source identity (Risk R7).
- For imports **with** known source identity: preserve the source link **only when explicitly chosen and appropriate**.
- For imports **without** reliable or intentionally retained source identity: treat as **anonymous legacy** or **staff-curated** entries.

## 4. Provenance the model must distinguish **[Confirmed]**

The data model distinguishes:

- Live student submissions from the current website
- Imported historical questions
- Imported previously-answered questions
- Imported unanswered-but-answerable questions
- Questions with known student source information
- Questions deliberately treated as anonymous legacy questions
- Questions with unknown/unavailable source information

These map to `BacklogQuestion` fields: source provenance, identity-preservation flag, optional source link, answered/unanswered marker ([domain-model.md](domain-model.md)).

## 5. Import methods **[Confirmed — project-specs.md §8 P1, approved 2026-08-03]**

All four inputs are in scope: **Typst files**, **CSV** feedback-sheet exports, **XLSX**
feedback-sheet exports, and **manual copy-paste**. Every path goes through the same
preview-and-field-mapping step before anything is committed.

- **[Confirmed]** Do **not** assume all legacy files can be parsed automatically or perfectly.
  Import is human-in-the-loop: parsing produces a reviewable, editable staging table, never a
  silent commit.

### 5.1 Recognized Typst subset

There is no Typst compiler. A line/block scanner recognizes a deliberately small subset:

- Preamble lines (`#import`, `#let`, `#set`, `#show`, `#pagebreak`, `//` comments) are discarded.
- Verbatim regions are never split: fenced raw blocks, inline backtick code, and `$…$` math.
- Blocks are separated by blank lines, with bracket-depth counters so a multi-paragraph
  `#question[…]` stays one block.
- Question/answer markers: `#question[…]` / `#answer[…]` / `#qa(question: …, answer: …)`;
  term-list `/ Question:` and `/ Answer:`; bold or plain `*Q:*` / `Q:` / `*A:*` / `A:` at line
  start. Headings (`=`, `==`, `===`) become a topic hint for the rows that follow, never a question.
- Only light unwrapping (`#strong[x]`, `*x*`, `#emph[x]`, `_x_`); everything else is preserved
  byte-for-byte and sanitized at render time.
- **Degradation, never failure.** A `Q` with no answer becomes an unanswered row; an orphan `A`,
  an unrecognized block, or a bracket-balance failure becomes a row needing attention with the
  source text intact and editable. Caps (2000 rows, 64 KB per row) emit one explanatory error row.
  The verbatim source text of every row is always retained, so nothing is discarded.

## 6. Import behavior **[Confirmed]**

- Each import creates an `ImportBatch` (kind = legacy) recording source kind, file name, source
  description, field mapping, importer, counts, and timestamps — audited
  ([domain-model.md](domain-model.md#audit-events)).
- Parsing **stages** rows into `LegacyImportRow` first. Staff review the preview, fix field
  mapping, edit individual rows, and reject rows, and only then commit.
- Row-level errors are surfaced per row and **never discard the valid rows**.
- Committed rows enter the **private review area** as backlog questions in `Needs review` — they do
  not become answerable, and nothing is published.
- Rows that carry an existing question–answer pair become **drafts** requiring staff review before
  publication. A legacy import can never produce a published entry.
- Commit is retry-safe: a row already mapped to a backlog question is skipped, so re-running
  produces no duplicates.
- Identity preservation is a course-staff decision, **not** delegable to a TA permission flag, and
  stores a resolved roster-record reference rather than a free-text student number, so a legacy
  import cannot reintroduce plaintext identifiers.

## 7. Participation **[Confirmed]**

Legacy imported questions **do not count toward current participation**
([participation-rules.md](participation-rules.md#3-participation-derivation)). This is structural,
not a rule to remember: participation derives only from `FormResponse` rows, and a legacy import
never creates one.

## 8. Source-link handling on publish

When a legacy question is later published, source-link and anonymity rules from [public-qa-and-source-linking.md](public-qa-and-source-linking.md) apply. A legacy entry deliberately kept anonymous publishes with **no** source link (a valid case of a `Published` answer with zero source links — see [domain-model.md](domain-model.md#39-invalid-combinations-illustrative)).

## 9. Related documents

[question-backlog.md](question-backlog.md) · [domain-model.md](domain-model.md) · [account-matching.md](account-matching.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [participation-rules.md](participation-rules.md) · [mvp-scope.md](mvp-scope.md)
