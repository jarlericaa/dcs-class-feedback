# Student Identity & Class-List Import

> **Status:** Product/security specification, implemented.
> Current route and service coverage is tracked in
> [engineering/current-state.md](../engineering/current-state.md).
> This document **owns** authentication, how an authenticated account becomes a student, and the class-list import flow.
> Label key as in [product/requirements.md](../product/requirements.md).
>
> **Renamed from `account-matching.md` (2026-08-07).** Name-based account matching, the student roster-claim flow, and teacher confirmation of suggested matches were **removed**, not disabled. See [§10 What was removed](#10-what-was-removed-and-what-happened-to-the-data).

## 0. The rule **[Confirmed — owner-approved 2026-08-07]**

> **Student access is determined by exact normalized UP email matching against teacher-uploaded class lists.**

Nothing else grants a student access. Not a name, not a similarity score, not a student number typed into a form, not a teacher pressing Confirm.

```
authenticated user email
  → normalize (trim + lowercase)
  → student_records.roster_email          (exact equality, unique)
  → active enrollments
  → sections
```

## 1. Authentication **[Confirmed]**

- Google SSO restricted to the domains in `ALLOWED_EMAIL_DOMAINS`.
- Signing in creates or updates a `User` (Google subject, university email, display name) and **nothing else**. There is no linking row to create and no state to reconcile.
- The email is normalized **once, at the boundary** (`src/auth.ts`), so every later comparison is a plain equality with both sides already normalized.

Whether that user is a student is not a stored fact — it is answered on every read by looking the email up against the class lists (`getStudentRecordForUser`, `src/modules/authz`).

## 2. Normalization **[Confirmed]**

Trim surrounding whitespace, lowercase. That is the entire transformation, on both sides, always.

Deliberately **not** done: stripping dots, removing `+tags`, or any other canonicalization that maps two distinct mailboxes onto one. Collapsing addresses would hand one student another's classes, which is exactly the failure the old name matching was prone to.

The database enforces it too: `roster_email_normalized` is a `CHECK` constraint, so an unnormalized value cannot be stored even by a code path that forgets.

## 3. Uniqueness **[Confirmed]**

`student_records_roster_email_unique` is a partial unique index on `roster_email`. Two student records can never carry the same address, so a lookup returns at most one record and "who is this?" has exactly one answer. The constraint lives in the database, not only in service logic.

`roster_email` is nullable only for rows imported before the column existed. A record with no email matches nobody and grants nothing.

## 4. Why this is safer than what it replaced

The old scheme compared Google **display names** — user-editable, frequently nicknames, and shared between people — against roster names, then asked a teacher to adjudicate. That put a human in the loop for every student and still turned on a judgement call about two similar strings.

The teacher now supplies the identity directly, in the class list, in a field the university already controls. There is no uncertain case to adjudicate because there is no similarity: an address either is on the list or is not.

**What is still true:** a teacher who imports the wrong email gives the wrong person access. That risk did not go away — it moved into the import, where it is visible, checkable before commit, and audited. §7 is how the importer defends it.

## 5. What a student sees **[Confirmed]**

- **On a class list:** their forms, immediately, on first sign-in. No claim page, no waiting state, no "pending confirmation" banner.
- **Not on any class list:** *"No classes are associated with this UP email yet. Ask your teacher to check that your UP email is included in the class list."*

The empty state says nothing about whether another address or student number exists, whether the email nearly matched something, or whose it might be. A signed-in stranger learns only about their own address.

## 6. Student numbers at rest **[Confirmed — product/specification.md §11]**

Unchanged by this work. A student number is stored as AES-256-GCM ciphertext (bound to its own row so a ciphertext cannot be moved between records) plus a keyed HMAC-SHA256 lookup hash that carries the uniqueness constraint and serves every lookup, plus the last four characters in clear for staff list views. Normalization strips punctuation and case but **preserves leading zeroes**. Full plaintext is revealed only behind `view_student_identities`, and producing a file that contains it is audited.

The student number remains the **permanent internal identity** ([Assumption A2]) and the re-import key. The email is the *access* key. They are different jobs: a student's address can be corrected without minting a new record, and a record survives an address change with its submissions intact.

Key configuration, rotation, and the backfill procedure: [engineering/security.md](../engineering/security.md), [engineering/deployment.md](../engineering/deployment.md).

<a id="7-class-list-import-confirmed-project-specsmd-61"></a>

## 7. Class-list import **[Confirmed — product/specification.md §6.1]**

Teachers upload the official **CRS-style XLSX** class list. Pasted **CSV** remains supported as a fallback. Required columns: **student number**, a **name**, and a **UP email**.

Recognized email headers: `email`, `e-mail`, `email address`, `upmail`, `up mail`, `up email`, `up_mail`, `university email`, `school email`, `student email`, `institutional email`. A file with no email column is refused outright, naming what to add — importing a list without addresses would create records nobody can reach.

### 7.1 Fields the importer stores

Student number, **UP email**, family name, first name, lived/preferred name, preferred pronoun, program, enrollment status (both the verbatim spreadsheet value and a normalized status), and enlistment date.

**`Sex Assigned at Birth` is never persisted.** It is on an explicit column denylist and is not mapped into a row at all, so it cannot reach the database; the preview reports it among the ignored columns.

Student numbers are identifiers, not numbers. An `.xlsx` numeric cell has already lost any leading zero at the file level, so the importer prefers the cell's formatted text, and where it can only see a bare number it **refuses the row for correction rather than zero-padding silently**.

### 7.2 Import flow

1. **File validation** — extension, size cap, ZIP signature, required columns present (including the email column).
2. **Column mapping** — CRS header synonyms are recognized; unmapped and denied columns are reported.
3. **Course-metadata detection** — code, title, section, term, units, instructor, shown for confirmation.
4. **Row validation** — see §7.3.
5. **Outcome after applying** — **[Confirmed 2026-09-07 — GitHub issue #12]** the class-list screen imports in one step and then reports what happened: the counts, the file lines it refused and why, and the students the file no longer lists (now dropped, never deleted). It does **not** walk the teacher through an editable preview first. Nothing about correctness rested on that preview — `commitRosterImport` re-derives every decision from live data inside its own transaction and refuses any row whose UP email it cannot trust — so what changed is when the teacher is told, not what is enforced. `previewRosterImport` remains the planner the tests hold to account, and `applyPreviewEdits` remains for a caller that wants the older two-step flow.
6. **Row-level errors** — per-row problems surfaced, never a whole-file failure.
7. **Import summary** — created / enrolled / reactivated / names updated / **emails linked** / **blocked** / deactivated / unchanged / warned / edited / errored.
8. **Safe re-import** — re-importing an unchanged list is a no-op; nothing is created, relinked, or dropped.
9. **Audit logging** — an `ImportBatch` records the event; see §8.

<a id="73-email-rules-blocking-not-advisory"></a>

### 7.3 Email rules — blocking, not advisory

Anything wrong with an email **blocks its row**. The row is not imported, the reason is audited, and the rest of the file proceeds. Guessing is never an option, because the email is the access itself.

| Condition | Warning code | Outcome |
|---|---|---|
| Cell empty | `missing_email` | Row refused |
| Not an email address | `invalid_email` | Row refused |
| Domain not in `ALLOWED_EMAIL_DOMAINS` | `disallowed_email_domain` | Row refused |
| Same address twice in one file | `duplicate_email` | Second row refused |
| Address already held by a **different** student record | `email_belongs_to_another_record` | Row refused |
| Student is enrolled only in **another** section and the address differs | `cross_section_email_conflict` | Row refused — see §7.5 |
| Same address, same record (a re-import) | — | Idempotent, no change |

The existing full-name validation is unchanged. Duplicate, malformed, and uncertain numeric student numbers block a row, because none can safely establish identity. Everything else — unrecognized enrollment status, a field differing from stored data — remains an advisory warning the teacher decides on.

The two live-data checks (`email_belongs_to_another_record`, `cross_section_email_conflict`) are **re-derived inside the commit transaction** and never inherited from the preview, in either direction: a stale finding cannot block an import, and a stale absence cannot let one through.

### 7.5 Section-scoped import is not global identity authority

`roster_email` is global; import authority is per-section. Without a boundary, a teacher entitled to import their own class list could type any student number, supply a different address, and move that student's access in a class they have no standing on.

The rule:

| The student is… | …and the imported email | Outcome |
|---|---|---|
| already enrolled in **this** section | differs from stored | **Allowed** — this is the ordinary "fix a typo" correction, audited as `roster.email_linked` |
| enrolled only in **another** section | matches stored exactly | **Allowed** — adds the enrolment, identity untouched. One record, several sections: the reuse the model is built for |
| enrolled only in **another** section | differs from stored (including a stored `NULL`) | **Refused.** Changing it here would change their access everywhere |
| in **no** section at all | anything | **Allowed** — the record is nobody else's to protect |

A refused row names the conflict without naming the other student, their section, or their address. Resolving it is an authorized identity correction by staff who actually hold that student, not a side effect of uploading a file.

Deliberately **not** done: falling back to a name, or minting a second student record for the same student number. Either would trade a visible refusal for a silent wrong answer.

### 7.6 A refused row is not an absent student

Deactivation and import success are different questions, and conflating them is how a class quietly loses somebody.

An enrolment is deactivated only when the uploaded file **does not mention that student number at all**. A row that was refused for an email still proves the teacher listed that student, so it counts as present and that student stays exactly as they were — record untouched, enrolment untouched. A malformed or uncertain number instead makes the whole deactivation pass wait for a trustworthy file, because it cannot safely establish which student was listed.

Two consequences worth stating:

- A file whose every row was refused imported nothing, so it tells us nothing reliable about who left: it deactivates **nobody**, even students it never mentions.
- Preview and commit compute this from the **same helper**, so the deactivation list the teacher approves is the one that runs.

### 7.4 Safety rules

- **[Confirmed]** Do **not** silently overwrite existing enrollment data.
- Re-import reconciles by **student number**: new rows create `StudentRecord`/`Enrollment`; matching rows update the name and email with a visible diff in preview; rows **absent** from the new list are **deactivated, not deleted** (data preserved). Whether deactivated students keep read access is [D10 — closed](../decisions/open-decisions.md): they do, for their own history.
- Deactivation is keyed on the rows actually **imported**. A file whose every row was refused deactivates nobody — treating "all rejected" as "an empty class list" would drop a whole section over a bad email column.
- The canonical name updates freely and is audited. It is a label, never an identity key, so there is nothing to protect it from.

## 8. Audit **[Confirmed]**

| Action | When |
|---|---|
| `roster.imported` | An import batch was committed, with its summary |
| `roster.row_added` | A new student record was created from a class list |
| `roster.row_rejected` | A row was refused, with machine-readable reasons |
| `roster.row_deactivated` | An enrolment was deactivated because the student left the list |
| `roster.email_linked` | A record's UP email was set or changed — **this is the access grant** |
| `student_record.name_corrected` | Canonical name changed, with before/after |
| `student_record.fields_updated` | CRS detail fields filled in |
| `roster.preview_edited` | Staff corrected rows in the preview, by row key and count |
| `student_number.revealed` | Full plaintext was produced for a staff member |

**Never in audit metadata:** full student numbers, and no personal data beyond what the event is *about*. A rejected row records its line, row key, and reasons — not the name or the address that failed. A linkage change records the addresses, because the addresses are the change.

Historical `claim.*` and `match.*` rows are **kept**: the log is append-only. They render with a "(historical)" label ([src/lib/audit-labels.ts](../../src/lib/audit-labels.ts)).

## 9. Teacher experience

The **Class list** page (`/teach/sections/[id]/roster`, formerly "Account matches") shows the imported students behind `view_student_identities`: name, UP email, the **whole student number**, dropped state, and whether an account has signed in with that address yet.

**[Confirmed 2026-09-07 — GitHub issue #12]** The number is shown in full, not masked to its last four. It is decrypted per render by the read model, which requires `view_student_identities` — so nobody without that capability can open the page at all, let alone read a number. The stored plaintext is normalized and therefore has no separator; `src/lib/student-number.ts` restores it for reading, and **only** for the one shape it is known to belong to (four-digit entry year, five-digit serial). A value of any other shape is printed exactly as stored rather than split on a guess.

Viewing is deliberately **not** audited, consistently with the participation dashboard: the capability that permits it is granted and revoked under audit, and one log row per page view — per reload, per search — would bury the events the log exists for. Producing a **file** that carries the number is audited, because that is what leaves the building.

It has **no approve, reject, confirm, correct, or unlink control**, because there is no decision to take. The only thing that changes the list is an import. "Signed in" is reporting, not gating: a rostered student who has never logged in already has their classes waiting.

The list is paginated and searchable by name, email, or the student number — with or without its separator, since the stored form has none either.

## 10. What was removed, and what happened to the data

Removed entirely — backend, UI, data model, navigation, seed data, and tests:

`/claim` · `rosterClaims` · `accountMatches` · `generateMatchCandidates` · name normalization and similarity scoring · teacher confirm/reject/correct/unlink of matches · claim throttling · the `ROSTER_CLAIM_*` configuration · "claim your place", "waiting for confirmation", "students asking to be linked", and "waiting for your decision" messaging · `claim.*` and `match.*` audit actions.

`/claim` survives as a redirect to the overview so a pilot bookmark is not a dead end.

**Migration behaviour** ([drizzle/0004](../../drizzle/0004_email_identity_add.sql), [0005](../../drizzle/0005_drop_account_matching.sql)):

- A **confirmed** account match becomes the student record's `roster_email`. That student keeps their enrollments, submissions, private threads, history, and participation, and needs **no second login** — their next request resolves through the new column.
- **Candidate, ambiguous, unmatched, rejected, and correction-pending** rows are **discarded**. They were proposals, never access, and there is no honest way to turn a name-similarity guess into an identity. Those students are rostered again the next time their teacher imports a class list carrying their UP email.
- **Roster claims** are discarded on the same reasoning; the typed numbers in them were encrypted guesses that nothing downstream read.
- **Student records are untouched**, so nothing any student wrote is lost on either path.
- If two accounts differ only in case, the email-normalizing `UPDATE` **fails loudly** and the migration rolls back. Which of the two is the real person is a human decision.

## 11. Decisions

- **The rule in §0 — [Confirmed] 2026-08-07.** Supersedes D2 entirely.
- **D2 — removed, not closed.** "Teacher-confirm-all vs auto-confirm" was a question about name matching. There is no name matching, so the question no longer exists.
- **D9 — removed.** A section join code was proposed as a second factor *because* names were weak evidence. The email is supplied by the teacher from an authoritative list, so there is no weak first factor to shore up.
- **D10 — closed:** a dropped student's enrolment is deactivated and their own history stays readable.
- **Deferred, needs the registrar's code list:** the exact CRS enrollment-status → normalized-status mapping (`product/specification.md` §14). Until it is filled in, an unlisted code is normalized to `unknown` and every such row is flagged for review — safe, but noisy.

See [decisions/open-decisions.md](../decisions/open-decisions.md).

## 12. Related documents

[domain/domain-model.md](domain-model.md) · [domain/roles-and-permissions.md](roles-and-permissions.md) · [product/requirements.md](../product/requirements.md) · [domain/legacy-question-import.md](legacy-question-import.md) · [decisions/open-decisions.md](../decisions/open-decisions.md)
