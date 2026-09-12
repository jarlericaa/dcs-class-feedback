# ADR-0005 — The Course Is the Collaborative Teaching-Work Boundary

- **Status:** Accepted
- **Date:** 2026-09-12
- **Owners:** product and technical owner
- **Supersedes:** [ADR-0002 — Keep public Q&A section-scoped and source-anonymous](ADR-0002-section-scoped-public-qa.md) (its anonymity and source-linking rules are retained; only its SCOPE is replaced)

## Context

CS 33 runs several laboratory sections with different lab instructors. Under the
previous model, a `ClassSection` owned the publication queue and the public Q&A
archive, so the same teaching team operated three miniature copies of one
course:

- one useful answer had to be drafted, checked for anonymity and published
  **three times**, once per lab;
- a Lab B student could not read an answer that had originated in Lab A, even
  though the question was about the course they are both taking;
- staff had to enter a *section* workspace to manage *course* teaching content,
  and the same backlog item had to be exposed to each section separately;
- "which section should see this?" was asked at publish time, a question the
  teaching team does not actually have an answer to.

The owner clarified the intended model on 2026-09-12: **teaching staff
collaborate on one course, rather than operating independent miniature copies of
the course per section.**

## Decision

**The course is the collaborative teaching-work boundary. A section is an
enrolment, roster, staff-delegation, response-attribution, participation and
analytical-filter context.**

Course-owned, collaborative:

- form definitions and form delivery/instances;
- Responses, as a course-wide inbox and analysis surface;
- the question backlog;
- the publication queue;
- public-answer drafting, rewording, scheduling and publishing;
- Class Q&A;
- the topics and categories those resources use.

`PublicAnswer` is therefore **owned by `Course`**, not by `ClassSection`. One
publication is one row, visible to every student holding an active enrolment in
any eligible section of the course.

Section-scoped, and deliberately unchanged:

- enrolment, rosters and class lists;
- student access;
- `SectionStaff` delegation and the Student Assistant permission catalog;
- **response attribution** — a `FormResponse` still records its section;
- response filtering and analytics;
- private replies, which stay tied to the asker's own source response;
- participation attribution and exports;
- section administration.

**Responses is the one place a teacher intentionally narrows by section.** Its
default scope is *all sections the actor is authorized to review*, with an
optional single-section filter. Class Q&A has no section filter: which class a
question came from is not part of navigating a shared archive, and offering it
as a facet would invite the very inference the anonymity rules exist to prevent.

### Authorization

Making the OUTPUTS course-wide did **not** make SOURCE DATA course-wide.

- Course owners and course staff retain full capability across the course.
- A section-scoped assistant reads exactly the sections they hold the permission
  on. Default "all sections" means *their* sections; naming another in a URL
  yields nothing rather than widening scope, and that section contributes
  nothing to any aggregate they can read.
- A publishing permission held on **any** section of the course admits its
  holder to the course's shared queue — the queue is the object the flag
  advertises now that there is one per course. What they may do to an entry is
  still gated per action.
- Drafting from a source submission still requires the permission **on that
  submission's own section**. A merge spanning Lab A and Lab B requires it on
  both, so a merge cannot become a permission bypass.
- Identity masking is unchanged and remains all-or-nothing per read.

### Scheduling timezone

Publication is course-owned, so "which timezone does this publish at?" can no
longer be answered by reading a section — and picking "the first section"
wherever a timezone was needed would give one course different answers depending
on which query ran. `resolveCourseTimezone` is the single rule: if every section
of the course agrees on a timezone, that is the course's timezone; otherwise (or
with no sections yet) the configured `INSTITUTION_TIMEZONE` wins. There is one
institution timezone in the current product (decision D7), so disagreement means
a per-section override, and a course-level object must not silently inherit one
section's override as though it applied to the whole course.

### Data migration

`drizzle/0008_course_scoped_public_qa.sql`:

- adds `public_answers.course_id`, backfills it from the owning section's
  course, then makes it `NOT NULL`;
- renames `public_answers.section_id` to **`origin_section_id`** and makes it
  nullable — explicitly provenance, never ownership: not a visibility key, not a
  publishing target, and never used to build a separate archive. It is renamed
  rather than kept so no query can go on treating it as authority;
- moves the archive, course and idempotency-token indexes onto `course_id`;
- does the same for `public_answer_comments`, whose subject moved;
- renames `section_backlog_visibility` to `backlog_section_exposure_history`,
  retaining every row as history while removing it as a live mechanism.

**No deduplication.** Historical data may contain the same answer published
separately to two sections. Text equality is not identity, so every existing row
is preserved as its own course-level entry with its provenance intact. Merging
duplicates is a later, explicit domain operation.

Old section URLs (`/teach/sections/[id]/publications`, `.../backlog`,
`/sections/[id]/qa`) resolve the section's course and redirect to the canonical
course route, preserving the selected entry, search, category and filter. They
do not carry the section forward in any form.

## Alternatives considered

- **Keep section ownership and publish in a loop / duplicate rows behind the
  scenes:** rejected. It preserves the defect in the data (N rows for one
  answer), makes edits and unpublishing diverge per section, and leaves the
  archive unable to say what one answer is.
- **Choose an arbitrary "primary section" per course:** rejected. It makes
  correctness depend on which section sorts first, and silently inherits one
  section's timezone and audience as the course's.
- **Keep `section_id` authoritative and hide it from the UI:** rejected
  explicitly. The domain, not merely the presentation, had to become
  course-scoped; a hidden authoritative key is the bug still present.
- **Delete `ClassSection` from the publishing story entirely:** rejected.
  Attribution, delegation, rosters and participation are genuinely
  section-shaped, and removing the attribution section would destroy both
  participation and the per-section authorization boundary.
- **Give Class Q&A a section filter:** rejected. It re-creates the inference
  risk the archive's anonymity depends on.
- **Course-wide response access for every assistant:** rejected. It would have
  made the change trivially simple and would have broken deny-by-default.

## Consequences

- A useful answer is published **once** and reaches the whole course.
- `PublicAnswer`, `PublicAnswerComment` and the publication workflow key on
  `course_id`; scheduler, outbox links, cache invalidation and audit scope
  follow.
- Staff no longer enter a section to manage course teaching content. Course
  navigation carries Forms, Responses, Publication queue, Question backlog and
  Class Q&A; section navigation keeps the roster, delegation and participation.
- The anonymity obligation is **stronger**, because a published entry now
  reaches a larger audience: the student-facing projection carries no source
  link, no identity, and no origin section.
- `backlog_section_exposure_history` exists but is read by nothing. It is
  retained for provenance and should not be revived.
- Unpublishing (decision D6, approved and still unbuilt) becomes simpler: there
  is one row to unpublish rather than one per section.

## Follow-up

- The Student Assistant **approval-before-publication** workflow remains
  schema-only (`public_answer_approvals`, and the approval enqueues in the email
  outbox). It matters more now that publication reaches the whole course, and is
  tracked in [engineering/current-state.md](../engineering/current-state.md).
  This ADR does not weaken it; it does not yet implement it either.

## References

- [Public Q&A and source linking](../domain/public-qa.md)
- [Forms and audiences](../domain/forms-and-audiences.md)
- [Question backlog](../domain/question-backlog.md)
- [Roles and permissions](../domain/roles-and-permissions.md)
- [Domain model](../domain/domain-model.md)
- [Security and privacy](../engineering/security.md)
