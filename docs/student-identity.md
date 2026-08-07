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
5. **Shipped policy: teacher-confirm-all** — a teacher confirms every match before a student is
   bound, even exact-unique matches. Safest; higher teacher effort.
6. **Auto-confirm is implemented but disabled.** High-confidence unique matches can be
   auto-confirmed, gated by the `ROSTER_CLAIM_AUTO_CONFIRM` configuration flag (default **off**)
   and a configurable minimum name score (default: the strong-match threshold). Enabling it later
   is a configuration change, not a code change. **[D2 — closed](open-decisions.md).**
7. **Optional extra factor (open):** a section join code / teacher-provided verification token the student enters at first login, as a second factor beyond name. **[Open D9](open-decisions.md)** — not an approved requirement; documented as an option.

After confirmation, the **student number is the permanent internal identity** ([Assumption A2]); later display-name changes do not unlink the match.

## 4A. Student-initiated roster claim **[Confirmed — project-specs.md §6.1]**

The CRS class list carries no email address, so the student initiates the link:

1. The student signs in with a school Google account. Sign-in grants no course access.
2. The student enters **their student number** on the claim page.
3. The system compares the Google account display name against that single unclaimed roster entry
   using the pipeline in §5.
4. Under the default policy the claim is recorded as pending and surfaced to staff. With
   auto-confirm enabled, a unique high-confidence match links immediately.
5. Mismatches, ambiguous names, duplicate claims, already-claimed entries, and unknown numbers all
   go to staff review.
6. A roster entry can never be linked to two accounts — enforced by a partial unique index, not
   only by service logic.

**Non-disclosure rule.** Every outcome that is not an immediate auto-confirm returns the **same**
response to the student. An unknown number, a number belonging to someone else, a mismatched name,
and an ambiguous name are indistinguishable, so the claim page cannot be used to enumerate student
numbers or discover another student's name. The precise reason is recorded for staff only.

Claim attempts are rate-limited per account, and a new claim supersedes the account's pending one.

## 4B. Unlinking **[Confirmed]**

Staff may **unlink** a confirmed match, with a required reason. Unlinking releases the roster
record and the account so either can be re-linked, revokes the student's section access
immediately, and **deletes nothing**: responses stay attached to the roster record, so a
re-link restores the student's own history intact. Unlinking is audited with before/after bindings.

## 4C. Student numbers at rest **[Confirmed — project-specs.md §11]**

A student number is stored as AES-256-GCM ciphertext (bound to its own row so a ciphertext cannot
be moved between records) plus a keyed HMAC-SHA256 lookup hash that carries the uniqueness
constraint and serves every lookup, plus the last four characters in clear for staff list views.
Normalization strips punctuation and case but **preserves leading zeroes**. Full plaintext is
revealed only behind `view_student_identities`, and producing a file that contains it is audited.
Key configuration, rotation, and the backfill procedure are in [SECURITY.md](SECURITY.md) and
[DEPLOYMENT.md](DEPLOYMENT.md).

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

## 9. Class-list import **[Confirmed — project-specs.md §6.1]**

Teachers upload the official **CRS-style XLSX** class list. Pasted **CSV** remains supported as a
fallback. Required fields: **student number** and a name.

### 9.0 Fields the importer stores

Student number, family name, first name, lived/preferred name, preferred pronoun, program,
enrollment status (both the verbatim spreadsheet value and a normalized status), and enlistment
date.

**`Sex Assigned at Birth` is never persisted.** It is on an explicit column denylist and is not
mapped into a row at all, so it cannot reach the database; the preview reports it among the ignored
columns.

Student numbers are identifiers, not numbers. An `.xlsx` numeric cell has already lost any leading
zero at the file level, so the importer prefers the cell's formatted text, and where it can only
see a bare number it **flags the row for correction rather than zero-padding silently**.

### 9.1 Import flow

1. **File validation** — extension, size cap, ZIP signature, required columns present.
2. **Column mapping** — CRS header synonyms are recognized; unmapped and denied columns are reported.
3. **Course-metadata detection** — code, title, section, term, units, instructor, shown for confirmation.
4. **Row validation** — malformed and duplicate student numbers (with the first line each was seen
   on), unknown and non-enrolled statuses, missing required fields, and conflicts with existing
   records are all flagged.
5. **Editable preview before confirmation** — staff correct rows in place and see exactly what will
   be created, enrolled, reactivated, renamed, or deactivated. Edited rows are re-validated as
   untrusted input at commit time and re-resolved against live data inside the commit transaction.
6. **Row-level errors** — per-row problems surfaced, never a whole-file failure.
7. **Import summary** — counts of created/updated/skipped/errored/warned/edited.
8. **Safe re-import** — re-importing an updated list must not corrupt existing data.
9. **Audit logging** — an `ImportBatch` records the event, and preview edits are audited separately.

### 9.2 Safety rules

- **[Confirmed]** Do **not** silently overwrite existing enrollment data.
- **[Recommended]** Re-import reconciles by student number: new rows create `StudentRecord`/`Enrollment`; matching rows update names only with a visible diff in preview; rows **absent** from the new list are **deactivated, not deleted** (data preserved). Whether deactivated students keep read access is [Open D10](open-decisions.md).
- **[Recommended]** Confirmed `AccountMatch`es survive re-import because they key on student number, not name.

## 10. Decisions affecting matching

- **D2 — closed:** teacher-confirm-all is the default; auto-confirm ships behind a configuration flag.
- **D10 — closed:** a dropped student's enrollment is deactivated and their own history stays readable.
- [Open D9] Section join code / verification token as an extra factor.
- **Deferred, needs the registrar's code list:** the exact CRS enrollment-status → normalized-status
  mapping (`project-specs.md` §14). Until it is filled in, an unlisted code is normalized to
  `unknown` and every such row is flagged for review — safe, but noisy.

See [open-decisions.md](open-decisions.md).

## 11. Related documents

[domain-model.md](domain-model.md) · [roles-and-permissions.md](roles-and-permissions.md) · [product-requirements.md](product-requirements.md) · [legacy-question-import.md](legacy-question-import.md) · [open-decisions.md](open-decisions.md)
