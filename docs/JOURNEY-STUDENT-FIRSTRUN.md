# Journey — Student First Run (Sign-in to Submitting)

**Status:** **[Confirmed]** — describes the shipped flow.
**Owns:** the journey from a student's first sign-in to being able to submit.
**Routes:** `/signin`, `/`, `/forms/[id]` —
[signin/page.tsx](../src/app/signin/page.tsx), [page.tsx](../src/app/page.tsx),
[modules/identity/email.ts](../src/modules/identity/email.ts),
[modules/authz/index.ts](../src/modules/authz/index.ts).

**Companions:** [JOURNEY-STUDENT-SUBMIT.md](JOURNEY-STUDENT-SUBMIT.md) (strictly
downstream of this) · [student-identity.md](student-identity.md) (owns the rules)
· [INTENT-CONTEXT.md](INTENT-CONTEXT.md).

> **Rewritten 2026-08-07.** The previous version of this document audited a
> journey that no longer exists: sign in → name matching → wait for a teacher to
> confirm → submit. That whole middle was removed. Its analysis of the blocked
> and stranded states, the "student has no lever" problem, and the proposed fixes
> (F1–F4) are obsolete — they were solutions to a problem the identity change
> deleted rather than mitigated. Git history has the original.

---

## 1. The journey, in full

1. The student signs in with their UP Google account.
2. The system normalizes their email and looks it up against the class lists.
3. If it is on one, their forms are on the overview. They submit.

There is no step 4. There is no waiting state, no pending banner, no claim page,
and nothing for a teacher to approve.

## 2. Why the old journey is gone

The registrar's class list used to carry only a student number and a full name,
so binding an account to a roster row meant comparing a **user-editable Google
display name** against a roster name. That produced *candidates*, never
certainty, so a human had to confirm each one.

That gave the journey its defining problem: **the student could not act.** They
signed in and then waited for a teacher to notice them. Every design lever
available was cosmetic — better copy for the waiting state, better prompting for
the teacher — because the underlying uncertainty was real and could not be
designed away.

The class list now carries the **UP email**. The teacher supplies the identity
directly, from a field the university controls, at import time. There is no
uncertain case left to adjudicate, so there is no queue, no waiting, and no
blocked state to design copy for.

## 3. The one remaining failure, and what it looks like

A student's email is not on any class list — because their teacher has not
imported one yet, imported one without their address, or typed it wrong.

They see one thing:

> **No classes yet**
> No classes are associated with this UP email yet. Ask your teacher to check
> that your UP email is included in the class list.

This names the only person who can fix it and the exact thing to check. It says
nothing about whether another address or student number exists, whether anything
nearly matched, or whose it might be — a signed-in stranger learns only about
their own address ([student-identity.md §5](student-identity.md#5-what-a-student-sees-confirmed)).

**Recovery needs no action from the student.** When the teacher imports the
corrected list, access resolves on the student's next request. They do not sign
out, sign in again, or revisit anything: the identity lookup is live, not a
stored binding made at login ([student-identity.md §1](student-identity.md#1-authentication-confirmed)).

## 4. Where the risk moved

It did not vanish. A teacher who imports the wrong email gives the wrong person
access to a class. That is now a **class-list import** problem rather than a
first-run problem, and it is defended there: the importer refuses a row whose
email is missing, malformed, off an allowed domain, duplicated within the file,
or already held by a different student record, shows every one of those in the
preview before commit, and audits both the refusals and every linkage change
([student-identity.md §7.3](student-identity.md#73-email-rules-blocking-not-advisory)).

The teacher-side journey is [JOURNEY-TEACHER-SETUP.md](JOURNEY-TEACHER-SETUP.md).
