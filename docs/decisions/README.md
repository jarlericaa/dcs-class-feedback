# Architecture Decision Records

This directory records significant, durable technical choices. It is separate
from [open-decisions.md](../open-decisions.md), which tracks owner questions
that are unresolved or provisional.

## When to add an ADR

Add an ADR when a choice changes a long-lived boundary, such as:

- application stack or runtime topology;
- database, scheduler, or persistence strategy;
- authentication or authorization boundary;
- privacy/publication model;
- deployment or retention policy;
- a deliberate rejection of a plausible alternative.

Do not add an ADR for a small styling decision or an implementation detail that
can be safely changed without architectural consequences.

## Status vocabulary

- **Proposed** — under review; do not treat as binding.
- **Accepted** — current decision for implementation.
- **Accepted / provisional** — current working decision with a named follow-up.
- **Superseded** — replaced by another ADR; retain the history.
- **Rejected** — considered and intentionally not selected.

## ADR format

Each ADR should contain: status, date, context, decision, alternatives,
consequences, and follow-up actions. Link to the owning product or architecture
document instead of copying its full rules.

## Current records

- [ADR-0001 — Continue the existing TypeScript modular monolith](ADR-0001-current-stack-and-scheduler.md)
- [ADR-0002 — Keep public Q&A section-scoped and source-anonymous](ADR-0002-section-scoped-public-qa.md)
- [ADR-0003 — The course owner alone controls staff assignment and TA permissions](ADR-0003-course-owner-controls-staff-permissions.md)
