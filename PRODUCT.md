# Product

<!-- impeccable:product-schema 1 -->

> **Label discipline** (inherited from [AGENTS.md](AGENTS.md), which this file does
> not override): **[Confirmed]** = owner-stated, **[Implemented]** = evidenced by
> the repository, **[Recommended]** = proposed but not approved, **[Assumption]** =
> inferred and needs validation, **[Open]** = unresolved (see
> [docs/open-decisions.md](docs/open-decisions.md)). A recommendation is never a
> requirement. Design work must respect these labels: do not harden a
> [Recommended] or [Open] item into product truth without owner sign-off.

## Platform

web

Native mobile apps are an explicit non-goal ([docs/mvp-scope.md](docs/mvp-scope.md)).
Students will nonetheless submit on phones during or right after class, so mobile
web is a primary case, not a fallback. **[Confirmed]** non-goal; **[Assumption]**
on phone-heavy student usage.

## Users

**[Confirmed]** Four roles, fully specified in
[docs/roles-and-permissions.md](docs/roles-and-permissions.md).

- **Students** — enrolled in one or more class sections. Job: complete one weekly
  feedback form per section, raise a question or concern they may not want to ask
  aloud, and later find whether it was answered. They are doing this alongside
  coursework, under a hard deadline, often on a phone, and they need to understand
  who can see what before they type. They never see other students' identities,
  cannot edit after submitting, cannot submit late, and in MVP cannot see their own
  participation totals or any internal staff state.
- **Teachers** — own the courses and sections they teach. Job: make sense of a
  week's submissions, reply privately where needed, publish anonymized Q&A to the
  class, and know what still needs attention. They are the administrator of their
  own courses: rosters, schedules, templates, staff, backlog, exports.
- **Teaching assistants / co-teachers** — hold a per-section, owner-configured
  subset of teacher capabilities (13 independent flags). A TA without
  `view_student_identities` must be able to do real review work with identities
  masked, so identity exposure is a UI-level concern, not only a data-level one.
- **Platform administrators** — grant the Teacher role and handle access, account,
  and system troubleshooting. Platform-admin capability is deliberately separate
  from teaching capability; neither implies the other.

## Product Purpose

**[Confirmed]** Replace a Google Forms + manually-compiled answer-document
workflow at a real teaching unit. The incumbent process is:

1. students submit via Google Forms; 2. teacher reads the linked spreadsheet row
by row; 3. teacher decides which questions to answer; 4. teacher hand-compiles
selected Q&A into a separate document; 5. teacher sends that document to the class.

That process is fine at collecting and bad at everything after: reviewing,
answering, anonymizing, publishing, tracking weekly participation, reusing
templates, searching past Q&A, keeping answerable-but-unanswered questions from
being lost, and preserving the link between a published answer and its original
submission.

**Success** = a real pilot semester in which teachers stop maintaining the manual
answer document, and students trust the anonymity enough to keep asking. This is a
production pilot with real students and real rosters, not a demo — reliability,
privacy guarantees, and staff efficiency outrank expressiveness everywhere they
conflict.

## Positioning

The mechanism a neighboring product cannot truthfully copy: **one weekly form that
simultaneously produces private replies, anonymous public Q&A, and participation
records — with a permanent internal, audited link from each published answer back
to the submissions that produced it.**

- Google Forms collects but cannot answer, anonymize, publish, or track.
- Discussion tools (Ed, Piazza) host Q&A but do not originate from a recurring
  per-section form, and do not produce participation records.
- Live Q&A tools (Slido) anonymize in the moment but keep no durable archive tied
  to a class roster and schedule.

Two invariants carry the position and must never be traded away: **published text
carries no source identity**, and **the original student wording is never
destroyed by rewording or merging**.

## Operating Context

- **Rhythm is weekly and schedule-driven.** A teacher configures a recurring
  schedule; cycles are materialized ahead of time (14-day horizon) and transition
  `scheduled → open → closed` by wall-clock time, not by anyone clicking. Late
  transitions are audit-flagged rather than hidden. **[Implemented]**
- **Deadlines are hard.** No grace period; a staff reopen is possible and audited.
  **[Confirmed]** feature, **[Open D5]** on the exact policy.
- **Single institution timezone**, `Asia/Manila` via `INSTITUTION_TIMEZONE`.
  Owner-confirmed value; single-timezone-for-MVP is **[Assumption A3]** /
  **[Open D7]**.
- **Enrollment arrives as a registrar export whose format is largely fixed.** The
  import must bend to the file: CRS-style XLSX, with pasted CSV as a fallback.
  **[Confirmed]**
- **Identity is the UP email on that class list.** The list carries student
  number, full name, and UP email; a signed-in account is the student whose
  stored roster email equals their normalized email, exactly. There is no
  claiming step and no teacher confirmation. A full name is a label and is never
  an identity key. **[Confirmed 2026-08-07]** — this replaced name matching
  outright; see [docs/student-identity.md](docs/student-identity.md).
- **A teacher who mistypes an email gives the wrong person a class.** The risk did
  not disappear with name matching, it moved into the import — where the file is
  checked before commit, bad rows are refused rather than guessed at, and every
  linkage change is audited. That makes the import preview a security surface,
  not a convenience. **[Confirmed]**
- **Class sizes can be small.** In a small section a single asker, or a
  sufficiently specific question, stays identifiable after "anonymization." This
  is a design-level obligation, not just a policy one: staff need to be warned at
  publish time.
- **Roles are resource-scoped and deny-by-default.** A teacher has no ambient
  authority over courses or sections they do not manage. Every screen must assume
  the viewer's capabilities are narrower than their role name suggests.

## Capabilities and Constraints

**Confirmed MVP surface** (full boundary in [docs/mvp-scope.md](docs/mvp-scope.md)):
Google SSO limited to approved university domains; exact normalized UP-email
student access; courses and sections; roster import with validation,
column mapping, duplicate detection, preview, row-level errors, summary, safe
re-import, and audit; four roles with per-section TA flags; recurring schedules and
auto-opening weekly cycles; reusable templates that snapshot on apply; common
form question types with required/optional; one submission per student per section
per cycle (DB-enforced); an always-present student-originated question/feedback
section; teacher review dashboard; private responses; anonymous public answers;
rewording with the original preserved; merge with all source links preserved;
immediate and scheduled publication; searchable class Q&A archive; course-level
question backlog with explicit per-section publish; legacy import that is
anonymous-by-default and never counts toward participation; participation validity,
weekly tracking, and three CSV exports; student submission history; audit history
with actor, action, timestamp, entity, and before/after values.

**Terminology** (use these words in UI; they are the domain's, not decoration):
Course → Class Section → Weekly Feedback Cycle. "Automatically generated" means
schedule-driven, **never** AI-generated. Participation *validity* is an internal
staff decision. *Backlog* is course-level and separate from the weekly dashboard.

**Technical constraints** **[Implemented]**: one Next.js App Router modular
monolith; modules under `src/modules/` mirror the documented domains; PostgreSQL +
Drizzle; Auth.js with Google; Zod-validated env; server-side validation is
required, not optional. No pg-boss, Redis, message broker, microservice, or vector
database. Scheduling is a DB-backed idempotent reconciliation poller
([src/modules/scheduling/index.ts](src/modules/scheduling/index.ts)); production
hosting, domain, secret manager, and backup service are **[Open]**.

**Explicit non-goals** **[Confirmed]**: student file attachments; editing a
submitted form; multiple submissions per student per cycle; student comments;
discussion threads; question voting; native mobile apps; any automatic AI reply or
publication; PDF/Word export of published answers; public access for unenrolled
users; per-staff task assignment of submissions. Unpublishing is not promised in
MVP (**[Open D6]**). Course-material *management* is post-MVP; only the data model
stays compatible. All AI features are post-MVP and, when built, require human
approval and never receive student identity.

**Known implementation gaps** (services exist, UI does not): richer template and
cycle editing with the enforced post-submission edit lock (**[Open D4]**), backlog
management UI, Playwright e2e coverage.

## Brand Commitments

- **Product name:** Class Feedback Platform. **[Implemented]**
- **Institution:** University of the Philippines, Department of Computer Science.
  Named in copy as the operating unit. Their official visual identity is **not**
  binding on this product — no UP marks, logos, or official color system are to be
  reproduced or approximated. **[Confirmed]**
- **Voice:** plain, calm, and precise. This product handles anonymity promises and
  a hard deadline; overstated or playful copy in those moments reads as untrustworthy.
  Never imply an anonymity guarantee stronger than the system actually provides.
- **Anti-reference:** Ed Discussion, Piazza, and Slido are studied for interaction
  patterns in [docs/ED_DISCUSSION_REFERENCE_PACK.md](docs/ED_DISCUSSION_REFERENCE_PACK.md)
  and [docs/DESIGN-RESEARCH.md](docs/DESIGN-RESEARCH.md). Their logos, brand
  identity, exact copy, proprietary assets, and layouts must not be copied. The
  result must read as Class Feedback Platform, not as one of those with the logo
  removed. **[Confirmed]**
- The palette and visual direction in
  [docs/UX-DESIGN-BRIEF.md](docs/UX-DESIGN-BRIEF.md) are **[Recommended]**, not an
  approved brand. `src/app/globals.css` is the incumbent implementation and the
  current de facto authority; whether to preserve or replace it is a design
  decision, not a product fact, and is out of scope for this file.

## Evidence on Hand

- **Real:** an extensive owner-reviewed specification set in [docs/](docs/) —
  product requirements, MVP boundary, domain model, roles and TA permission
  catalog, weekly-form workflow, participation rules, student identity, public-QA
  and source-linking rules, question backlog, legacy import, security register,
  and an open-decisions register. A working implementation foundation under
  `src/`. An idempotent demo seed (`npm run db:seed`) with a course, section,
  roster, schedule, and four users covering each role.
- **Absent — must not be fabricated:** no testimonials, quotes, case studies,
  press, adoption numbers, benchmarks, uptime figures, pricing, or licensing
  claims. No real student submissions. No sample of the registrar's fixed CSV
  export is in the repository, so its exact columns are known only as
  "student number + full name" — do not invent a specific header set beyond what
  [src/modules/roster-import/index.ts](src/modules/roster-import/index.ts) already
  accepts. No logo or illustration assets exist yet.

## Product Principles

1. **Anonymity is a promise the interface has to keep.** Every surface that
   touches publishing must make the identity boundary visible and make the unsafe
   action harder than the safe one. Small-class de-anonymization is the default
   risk, not an edge case.
2. **Show people only their own truth.** Students see student projections; a TA
   sees exactly their granted flags; a teacher sees only what they manage.
   Internal state — validity, no-response decisions, drafts, notes, audit — never
   leaks into a student view. Deny-by-default in the UI, not just the query.
3. **Never destroy the original.** Rewording, merging, invalidating, and
   re-importing are all additive and audited. Any interface implying otherwise is
   wrong.
4. **Weekly work should feel like finishing, not administering.** A student's job
   is one form under a deadline; a teacher's is a triage pass that ends. Both
   should have an obvious end state, not an open-ended surface.
5. **The rhythm is the product.** Time — open, deadline, closed, scheduled to
   publish — is the primary organizing fact of every screen, ahead of category,
   author, or type.

## Accessibility & Inclusion

No external mandate. **[Confirmed]** good practice, no required standard, and no
specific named user needs on record.

Treat WCAG 2.1 AA as the working floor anyway — contrast, full keyboard paths,
visible focus, correct semantics for the review queue and form controls, and
respect for reduced-motion. Two product-specific reasons this matters more than
the mandate level suggests: submissions happen under a hard deadline where a
blocked interaction means lost participation, and the anonymity model depends on
students *correctly understanding* what is public, which is a legibility and
plain-language problem as much as a contrast one.
