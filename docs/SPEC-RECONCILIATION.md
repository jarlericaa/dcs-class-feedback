# Specification Reconciliation

**Date:** 2026-08-02  
**Purpose:** reconcile the original planning documents with the implementation
that now exists in the repository.

## Findings

### 1. Documentation status is stale

Several documents still say “planning / pre-implementation,” “no code exists,”
or “conceptual model only.” That was accurate before the foundation pass. It is
not accurate for this checkout, which contains migrations, services, routes,
tests, and seeded local workflows.

**Change:** retain the detailed product rules, but treat
[CURRENT_STATE.md](CURRENT_STATE.md), the source code, migrations, and passing
tests as the source of truth for current behavior.

### 2. The TypeScript stack is already the implementation baseline

The repository is already Next.js + React + TypeScript + Drizzle + PostgreSQL +
Auth.js + Vitest. The old architecture text presents that stack as a
recommendation gated by “Fable.”

**Change:** continue with the existing stack for the web-app build. The only
stack question that still blocks future work is whether “Fable” was intended to
mean an F#/Fable implementation. If yes, stop before expanding the UI and make
a deliberate migration decision. If no, D1 can be closed in favor of the
current TypeScript baseline.

### 3. The poller should be the current scheduler contract

The code implements a reconciliation poller and does not depend on `pg-boss`.
The poller already covers cycle state transitions and due-publication recovery.

**Change:** treat the poller as the MVP scheduler. Defer a queue until actual
workload or operational evidence justifies it; do not add `pg-boss` merely to
match an older recommendation.

### 4. “MVP” needs a delivery split

The product MVP scope is broad: setup, forms, matching, review, publishing,
backlog, legacy import, exports, auditing, and multiple roles. The repository
currently implements the foundation of that product but not all user-facing
surfaces.

**Change:** use two labels in planning:

- **MVP foundation:** current auth, identity, schema, core services, scheduler,
  tests, and first functional routes.
- **First usable pilot release:** the complete student + teacher loop plus
  enough setup, roster, participation, and privacy controls for one real
  section.

This is a delivery clarification, not a silent reduction of the product scope.

### 5. The UI is underspecified, not the domain model

The domain docs define the important states and privacy rules, but they did not
define the page hierarchy, role-specific navigation, review ergonomics, or
visual language needed to build the web app consistently.

**Change:** use [WEB-APP-BUILD-PLAN.md](WEB-APP-BUILD-PLAN.md) and
[UX-DESIGN-BRIEF.md](UX-DESIGN-BRIEF.md) as the design/build handoff.

## Decisions that can be made now

| Decision | Working answer | Blocks first UI slice? |
|---|---|---|
| Web stack | Continue current TypeScript stack | Only if F#/Fable is actually required |
| ORM | Continue Drizzle; it is already implemented | No |
| Scheduler | Continue reconciliation poller | No |
| Q&A visibility | Section-enrolled students and authorized staff only | No |
| Matching policy | Teacher-confirm-all remains the safest current behavior | No |
| MVP design direction | Warm neutral canvas, campus green, calm workspace/inbox model | Needs design review, but not technical blocking |

## Questions that still need answers

### Blocking before more implementation

1. **Fable meaning:** Is the target stack F#/Fable, or was Fable only a coding
   tool/model reference?

### Required before a pilot

2. **Teacher onboarding:** Which admin or process grants `Teacher`, and how does
   the first teacher create a course and section?
3. **Notifications:** Is the pilot acceptable without email/in-app updates, or
   must students be notified when a private/public response is available?
4. **Retention:** How long may identities, responses, private replies, and audit
   records remain stored? Who approves deletion or archival?
5. **Deactivated students:** After roster removal, may the student read their
   own historical submissions, or is all section access revoked?

### Can be deferred

- per-section timezone overrides;
- join codes as a second matching factor;
- unpublish;
- a background-job queue;
- LMS integration;
- AI-assisted drafting.

## Recommended owner response

For the fastest safe start, confirm: “Continue with the existing TypeScript
stack, Drizzle, and poller for the first pilot.” Then answer the four pilot
questions before production data is introduced. The UI can be built now using
the existing domain behavior and clearly labeled placeholders for unresolved
setup/admin flows.
