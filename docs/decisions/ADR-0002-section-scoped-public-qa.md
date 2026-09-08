# ADR-0002 — Keep Public Q&A Section-Scoped and Source-Anonymous

- **Status:** Accepted
- **Date:** 2026-08-02
- **Owners:** product and technical owner

## Context

Students need useful answers to recurring class questions, but public
publication must not expose who asked a question or turn sensitive class
feedback into an internet forum. Staff also need to reword a question before
publishing it while preserving the original wording for the source student and
internal audit.

## Decision

“Public” means visible to enrolled students and authorized staff in the
specific class section. A published entry stores separate public question text
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
section-scoped authorization even though the UI may call it an archive.
Publishing requires an explicit staff action and audit trail. The system does
not need comments, reactions, voting, or open peer threads for this workflow.

## References

- [Public Q&A and source linking](../domain/public-qa.md)
- [Security and privacy](../engineering/security.md)
- [Documentation index](../README.md)
