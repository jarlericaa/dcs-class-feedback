# ADR-0002 — Keep Public Q&A Section-Scoped and Source-Anonymous

- **Status:** Superseded by [ADR-0005](ADR-0005-course-scoped-teaching-workflow.md) (2026-09-12)
- **Date:** 2026-08-02
- **Owners:** product and technical owner

> **Superseded in part — read this before acting on it.**
>
> The **scope** decided here is no longer the design. Public Q&A is owned by the
> **course**, not by a class section: one publication, one entry, read by every
> student holding an active enrolment in any eligible section of the course. See
> [ADR-0005](ADR-0005-course-scoped-teaching-workflow.md).
>
> What this ADR decided that REMAINS in force: "public" never means the open
> internet; public question text is stored separately from the immutable
> original; internal source links tie a published answer to its originating
> submission(s); student-facing views expose no source identity, original
> private wording, staff notes, validity decisions or workflow metadata; private
> responses stay between the asker and authorized staff; and the anonymity
> warning sits beside the staff publish action. Course-wide reach makes those
> obligations stronger, not weaker.
>
> Retained as history. It records why "public" was bounded at all, and the
> alternatives weighed to get there — both of which ADR-0005 builds on.

## Context

Students need useful answers to recurring class questions, but public
publication must not expose who asked a question or turn sensitive class
feedback into an internet forum. Staff also need to reword a question before
publishing it while preserving the original wording for the source student and
internal audit.

## Decision

“Public” means visible to enrolled students and authorized staff in the
specific class section. **[Superseded by ADR-0005: the boundary is the course,
not the section.]** A published entry stores separate public question text
and answer text, with internal source links to the original submission or
submissions. Student-facing archive views never expose source identity,
original private wording, staff notes, validity decisions, or publication
workflow metadata.

Private responses remain visible only to the asker and authorized staff.
Anonymity and potential-identification warnings must appear next to the staff
publish action.

## Alternatives considered

- Internet-public Q&A: rejected because class feedback can contain sensitive
  personal or course-specific information.
- Preserve original wording as the public wording: rejected because staff need
  to correct typos, remove identifying detail, and recontextualize questions.
- Fully anonymous staff records: rejected because authorized staff need source
  context to respond privately and track participation.

## Consequences

The data model and UI must maintain source/public separation. Public Q&A needs
scoped authorization even though the UI may call it an archive —
**section-scoped as decided here, course-scoped since ADR-0005.**
Publishing requires an explicit staff action and audit trail. The system does
not need comments, reactions, voting, or open peer threads for this workflow.

## References

- [ADR-0005 — Course-scoped teaching workflow and public Q&A](ADR-0005-course-scoped-teaching-workflow.md) (supersedes this record)
- [Public Q&A and source linking](../domain/public-qa.md)
- [Security and privacy](../engineering/security.md)
- [Documentation index](../README.md)
