# Participation Rules

> **Status:** Product rule specification with an implemented foundation.
> This document **owns** the participation model, the validity/invalidation rules, participation derivation, and the CSV export specifications. States are defined in [domain-model.md](domain-model.md#3-state-models).
> Label key as in [product-requirements.md](product-requirements.md).

## 1. Confirmed participation rules **[Confirmed]**

- Submitting the weekly form counts as participation.
- A student can count **at most once per weekly cycle**.
- A complete submitted form counts as participation **by default**.
- Answer quality does not block participation **unless** a teacher marks the response invalid.
- Teachers may mark a response invalid; invalid responses do not count.
- Validity changes must be **audited**.
- Students do **not** see validity decisions in the MVP.
- Participation is **derived** from valid weekly form responses.
- The system tracks which weeks each student participated.
- The system calculates total participated weeks per student.

## 2. Validity model

- Validity is an independent state dimension on `FormResponse`: `Valid` | `Invalid` ([domain-model.md](domain-model.md#33-participation-validity)). Default `Valid` on submit.
- Only authorized staff change it (`mark_validity` permission — [roles-and-permissions.md](roles-and-permissions.md)).
- Every change records actor, timestamp, before/after, and an invalidation reason (staff-only) as an `AuditEvent`.

### 2.1 Possible invalidation reasons **[Confirmed]**

Spam · abusive content · empty or meaningless answers · completely irrelevant responses · attempts to gain credit without completing the form in good faith.

- **[Recommended]** The reason is a required field when invalidating, chosen from the above plus a free-text note (staff-only). Never shown to students (Risk R6).

## 3. Participation derivation **[Recommended]**

Participation is **not** a separately maintained, mutable table — it is computed from the source of truth (valid `FormResponse`s):

> A student **participated** in a cycle **iff** there exists a `FormResponse` for `(cycle, student)` with state `Submitted`/`Reviewed`/`Archived` **and** validity `Valid`.

- **[Recommended]** Compute on demand for dashboards/exports; optionally materialize a cached view for performance later. Because it derives from responses + validity, marking a response invalid immediately removes that week's credit with no separate bookkeeping.
- Legacy imported questions never contribute (see [legacy-question-import.md](legacy-question-import.md)).
- Merged submissions still each count for their own author's participation — merging is a publishing concern, not a participation concern (see [public-qa-and-source-linking.md](public-qa-and-source-linking.md)).

## 4. Participation CSV exports **[Confirmed]**

Three reports. All are **identity-bearing** — only authorized staff (`export_participation`) may access them, and access is audited (Risk R4).

### 4.1 Weekly participation matrix

Columns (example): Student number · Student name · Week 1 · Week 2 · Week 3 · … · Total weeks.

- Each week cell indicates whether the student had **one valid submitted form** that cycle.
- **[Recommended]** Column headers map to cycle identifiers (with dates) so weeks are unambiguous across sections.

### 4.2 Participating-student list

A **deduplicated** list of students who participated during a selected week, date range, or term.

### 4.3 Detailed response export

Columns (example): Student number · Student name · Course · Class section · Weekly cycle · Submission timestamp · Form question identifier · Question text · Student answer · Student-originated question/feedback · Submission type · Category · Lesson/topic · Validity · Invalidation reason · Private-response indicator · Public-publication indicator.

- **[Confirmed]** For multiple-choice, checkbox, dropdown, and scale answers, export **both** readable labels **and** stable internal question/option identifiers where useful (see stable-id design in [weekly-form-workflow.md](weekly-form-workflow.md#51-conceptual-question-shape-not-a-schema)).
- The invalidation reason column is staff-only output (these exports are staff-only by definition).

## 5. Student-facing participation **[Confirmed]**

- **MVP:** students do **not** see participation totals.
- Student-facing participation totals are **post-MVP** ([mvp-scope.md](mvp-scope.md)).

## 6. Open decisions affecting participation

- [Open D5] Grace period / reopen — affects whether a late-reopened cycle can newly count.
- [Open D8] Cross-cycle merge — confirm it never alters per-cycle participation (recommended: it never does).

See [open-decisions.md](open-decisions.md).

## 7. Related documents

[domain-model.md](domain-model.md) · [weekly-form-workflow.md](weekly-form-workflow.md) · [roles-and-permissions.md](roles-and-permissions.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [legacy-question-import.md](legacy-question-import.md) · [open-decisions.md](open-decisions.md)
