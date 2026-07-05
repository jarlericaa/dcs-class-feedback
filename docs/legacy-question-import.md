# Legacy Question Import

> **Status:** Planning / pre-implementation.
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

## 5. Import methods

- **MVP [Confirmed]:** manual entry, CSV import, copy-paste import, semi-structured import.
- **Post-MVP [Confirmed]:** parser-assisted import for Typst files and old spreadsheets; automated Typst parsing; automated old-spreadsheet parsing ([mvp-scope.md](mvp-scope.md)).
- **[Confirmed]** Do **not** assume all legacy files can be parsed automatically/perfectly. MVP import is human-in-the-loop.

## 6. Import behavior **[Recommended]**

- Each import creates an `ImportBatch` (kind = legacy) recording source description, importer, counts, and timestamp — audited ([domain-model.md](domain-model.md#audit-events)).
- Row/entry-level errors are surfaced per item (bad rows do not fail the whole import), consistent with roster import ([account-matching.md](account-matching.md#91-import-flow)).
- Answered legacy questions may import their prior answer text (as a starting `PublicAnswer` draft or archived reference); unanswered ones land as `Answerable`/`Needs review`.

## 7. Participation **[Confirmed]**

Legacy imported questions **do not count toward current participation** ([participation-rules.md](participation-rules.md#3-participation-derivation)).

## 8. Source-link handling on publish

When a legacy question is later published, source-link and anonymity rules from [public-qa-and-source-linking.md](public-qa-and-source-linking.md) apply. A legacy entry deliberately kept anonymous publishes with **no** source link (a valid case of a `Published` answer with zero source links — see [domain-model.md](domain-model.md#39-invalid-combinations-illustrative)).

## 9. Related documents

[question-backlog.md](question-backlog.md) · [domain-model.md](domain-model.md) · [account-matching.md](account-matching.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [participation-rules.md](participation-rules.md) · [mvp-scope.md](mvp-scope.md)
