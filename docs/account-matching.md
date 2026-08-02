# Account Matching & Class-List Import

> **Status:** Product/security specification with an implemented foundation.
> Current route and service coverage is tracked in
> [CURRENT_STATE.md](CURRENT_STATE.md).
> This document **owns** authentication/enrollment, the name-matching design, and the class-list CSV import flow. This is the **highest-risk area** of the system (Risk R1). Match states are in [domain-model.md](domain-model.md#38-account-match-state).
> Label key as in [product-requirements.md](product-requirements.md).

## 1. Authentication **[Confirmed]**

- Google SSO restricted to authorized university accounts.
- Signing in creates/updates a `User` (Google subject, university email, display name). A `User` is **not** a student until an `AccountMatch` is `Confirmed`.

## 2. The core problem

**[Confirmed]** The roster CSV contains only **student number** and **full name** — **no university email**. So the system cannot join Google accounts to roster rows on email. It must attempt to map an authenticated Google account to a roster `StudentRecord` using the Google **display name** vs the roster **full name**.

**[Confirmed]** This name-based matching is a known security and data-quality risk.

## 3. Threat model & why matching must be conservative (Risk R1)

- Google **display names are user-editable** and may be nicknames, abbreviations, or deliberately set to impersonate.
- Two or more students may share identical or very similar names.
- A matching-only scheme with silent auto-enrollment would let any university account claim a roster identity by matching a name.

**Consequences if identity is wrong:** a student sees another student's private responses and submission history; participation is credited to the wrong person; anonymity assumptions break. Therefore matching must **never** silently verify under uncertainty.

## 4. Recommended MVP matching policy **[Recommended — safest default]**

1. **SSO creates an account only.** Login never enrolls anyone by itself.
2. **Matching produces candidates only.** The name pipeline (§5) proposes zero or more `StudentRecord` candidates with a confidence signal; it never finalizes.
3. **No silent verification under any uncertainty.**
4. **Teacher confirmation is required for ambiguous matches** — **[Confirmed]** when two students have identical or very similar names, require manual teacher confirmation.
5. **Recommended MVP stance: teacher-confirm-all** — a teacher confirms every match before a student is bound, even exact-unique matches. Safest; higher teacher effort.
6. **Alternative (open):** exact-unique-match auto-confirm with audit + teacher notification, teacher-confirm only for ambiguous/none. Lower effort; small residual impersonation risk. This is **[Open D2](open-decisions.md)** — do not implement auto-confirm without owner approval.
7. **Optional extra factor (open):** a section join code / teacher-provided verification token the student enters at first login, as a second factor beyond name. **[Open D9](open-decisions.md)** — not an approved requirement; documented as an option.

After confirmation, the **student number is the permanent internal identity** ([Assumption A2]); later display-name changes do not unlink the match.

## 5. Name-normalization pipeline **[Recommended]**

The design must support (**[Confirmed]** capabilities), implemented as a normalization + comparison pipeline:

1. **Normalize** both names: trim, collapse whitespace, case-fold, strip/fold diacritics, remove punctuation, expand or standardize common separators.
2. **Handle name-order variants:** surname-first vs given-name-first; compare against both orderings.
3. **Handle middle names & initials:** match when one side has a middle name and the other an initial or nothing; treat initials as prefixes.
4. **Similarity scoring:** exact-normalized match; token-set match (order-independent); fuzzy distance for near-duplicates and typos.
5. **Classify outcome** into a match state (§6).

- **[Recommended]** The pipeline is deterministic and testable in isolation, with thresholds tuned conservatively toward "ask a teacher" rather than "auto-confirm."

## 6. Match outcomes → states

Outcomes map to `AccountMatch` states ([domain-model.md](domain-model.md#38-account-match-state)):

| Outcome | State | Handling |
|---------|-------|----------|
| Exactly one strong match | `Candidate` | Teacher confirms (teacher-confirm-all); or auto-confirm if [Open D2] approved. |
| Multiple similar/identical names | `Ambiguous` | **[Confirmed]** manual teacher confirmation required; teacher picks the correct record. |
| No plausible match | `Unmatched` | Held as **pending verification**, visible to the teacher for manual resolution; student has no section access until resolved. |
| Teacher-corrected an existing match | `Correction-pending` → `Confirmed` | See §7. |
| Rejected by teacher | `Rejected` | No binding; student cannot access as that record. |

- **[Recommended]** "Detecting identical or very similar names," "multiple possible matches," and "no match" are all first-class outcomes surfaced to the teacher, never silently resolved. This satisfies "preventing silent enrollment under uncertain matches" **[Confirmed]**.

## 7. Correction after verification **[Confirmed]**

- Teachers may correct a student-account mapping **after it has already been verified** (e.g. a wrong person was confirmed).
- **[Recommended]** Correction moves the match to `Correction-pending`, requires the teacher to select/confirm the correct `StudentRecord`, then returns to `Confirmed`. The prior and new bindings are captured in the audit log.

## 8. Audit **[Confirmed]**

Audit-log every: account-to-student match, manual match correction, and the confirming actor — with before/after bindings, actor, and timestamp ([domain-model.md](domain-model.md#audit-events)).

## 9. Class-list CSV import **[Confirmed]**

Teachers import official class lists via CSV. Required fields: **student number**, **full name**.

### 9.1 Import flow

1. **File validation** — format, encoding, required columns present.
2. **Column mapping** — map CSV columns to student number / full name.
3. **Duplicate detection** — within the file and against existing enrollment.
4. **Preview before confirmation** — show what will be created/updated/skipped.
5. **Row-level errors** — per-row problems surfaced, not a whole-file failure.
6. **Import summary** — counts of created/updated/skipped/errored.
7. **Safe re-import** — re-importing an updated list must not corrupt existing data.
8. **Audit logging** — an `ImportBatch` records the event.

### 9.2 Safety rules

- **[Confirmed]** Do **not** silently overwrite existing enrollment data.
- **[Recommended]** Re-import reconciles by student number: new rows create `StudentRecord`/`Enrollment`; matching rows update names only with a visible diff in preview; rows **absent** from the new list are **deactivated, not deleted** (data preserved). Whether deactivated students keep read access is [Open D10](open-decisions.md).
- **[Recommended]** Confirmed `AccountMatch`es survive re-import because they key on student number, not name.

## 10. Open decisions affecting matching

- [Open D2] Auto-confirm exact-unique matches vs teacher-confirm-all.
- [Open D9] Section join code / verification token as an extra factor.
- [Open D10] Deactivated-student access after roster re-import.

See [open-decisions.md](open-decisions.md).

## 11. Related documents

[domain-model.md](domain-model.md) · [roles-and-permissions.md](roles-and-permissions.md) · [product-requirements.md](product-requirements.md) · [legacy-question-import.md](legacy-question-import.md) · [open-decisions.md](open-decisions.md)
