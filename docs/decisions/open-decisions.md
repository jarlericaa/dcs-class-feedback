# Open Decisions

> **Status:** Active decision register. The repository has an implementation
> baseline, but unresolved product, privacy, and operational choices remain.
> Every unresolved product/technical decision. **Agents must read this before any implementation work** ([AGENTS.md](../../AGENTS.md)) and must not resolve a "wait for owner" item on their own.
> Each entry: **Question · Options · Trade-offs · Recommended choice · Wait for owner approval?**

> ## Resolved 2026-08-03 by the approval of [product/specification.md](../product/specification.md)
>
> `product/specification.md` is now the acceptance target. The following entries are **closed**;
> their resolutions are recorded inline below and in the owning documents.
>
> | # | Resolution |
> |---|---|
> | D1 | **Closed — TypeScript baseline.** "Fable" referred to Claude tooling. The Next.js + Drizzle + Auth.js stack is the approved implementation. |
> | D2 | **Superseded and REMOVED 2026-08-07** — see the block below. Name matching no longer exists, so neither does the question. |
> | D4 | **Closed — (a).** Structural edits lock once a cycle has a non-draft response; per-occurrence open/deadline overrides are allowed and audited. |
> | D5 | **Closed — (a) hard deadline, no grace.** `reopenCycle` remains the audited teacher escape hatch and now also unlocks locked responses (`manage_weekly_cycles`). |
> | D6 | **Closed — unpublish is APPROVED.** Instructor-only, reason required, audited, and reversible via restore. An unpublished entry leaves the class archive *and* the linked asker's history (D16). **Approved, not yet built** — [engineering/current-state.md](../engineering/current-state.md) E2 is `schema only`. |
> | D7 | **Closed — single institution timezone,** repository default `Asia/Manila`, stored per section and used consistently. |
> | D8 | **Closed — (a).** Merge is within a section and may span cycles; cross-section reuse goes through the course backlog. Merging never alters per-cycle participation. |
> | D10 | **Closed — (a).** A dropped student's enrollment is deactivated and their own history stays readable; no data is deleted. |
> | D11 | **Closed — Drizzle.** |
>
> ### New decisions recorded 2026-08-03
>
> | # | Question | Decision |
> |---|---|---|
> | D14 | Are bonus periods course- or section-scoped? | **Course-scoped** (`bonus_periods.course_id`). Section-scoped cycles carry a nullable `bonus_period_id` plus an assignment source so a staff override is never overwritten by a later automatic pass. |
> | D15 | Does a `Flagged` submission keep bonus credit while an Instructor decides? | **Yes, and the flag is invisible to the student.** Only Instructor-confirmed `Invalid` removes credit, so credit changes exactly once and internal staff process never leaks. |
> | D16 | What does a linked asker see after an entry is unpublished? | **Nothing** — it leaves their history too. The private thread and their immutable original question survive. |
> | D17 | Are all exports Instructor-only, per `product/specification.md` §11? | **Partially — a knowing deviation.** The three pre-existing participation CSVs keep honouring the `export_participation` TA flag (removing a shipped capability was judged worse than the deviation). Every **new** export — bonus records, XLSX, PDF summaries, backlog status — is Instructor-only. Recorded in [domain/roles-and-permissions.md](../domain/roles-and-permissions.md). |

> ### New decisions recorded 2026-08-06 (course-level forms and audiences)
>
> Model, rationale and migration: [domain/forms-and-audiences.md](../domain/forms-and-audiences.md).
>
> | # | Question | Decision |
> |---|---|---|
> | D18 | Is a form owned by a section or by a course? | **By the course.** A form definition belongs to a Course; an explicit **audience** (`form_instance_sections`) says which sections receive each instance. Sections remain the access/roster/permission context and are no longer the primary object in the form workflow. |
> | D19 | Can one form instance target several sections? | **Yes**, and it is the ordinary case. One instance, one window, one question snapshot, one review queue. Response uniqueness stays `(instance, student_record)` — the attribution section is recorded separately and is deliberately NOT in that key, so a student in two targeted sections still has exactly one response. |
> | D20 | May a published answer reach several sections at once? | **No — the existing section-scoped rule stands.** A publication goes to the **asker's own** section only, enforced in `draftPublicAnswer` and covered by a test. Sharing a form does not widen an archive; cross-section reuse continues to go through the course backlog (D8). Allowing an explicit multi-section publish would be a privacy-surface change and needs owner approval before it is built. |


> ### Decision recorded 2026-08-07 (student identity)
>
> Rule, import validation and migration behaviour: [domain/student-identity.md](../domain/student-identity.md).
>
> | # | Question | Decision |
> |---|---|---|
> | D23 | How does an authenticated account become a student? | **Exact normalized UP email matching against teacher-uploaded class lists.** The class list carries student number, full name, and UP email. A signed-in user is the student record whose `roster_email` equals their trimmed, lowercased email — nothing else. Name similarity, roster claims, claim throttling, and teacher confirm/reject/unlink of matches are **removed** (D2, D9). A roster email is unique across all records, enforced in the database, so two students can never resolve to one another. Class-list rows with a missing, malformed, off-domain, duplicated, or already-taken email are **refused** at import rather than guessed at. |

> ### Design-system decisions recorded 2026-09-11
>
> Raised in [DESIGN-TODO.md](../../DESIGN-TODO.md) §1 and §10.1, answered by the owner.
> These govern the visual system only; the owning document is
> [DESIGN.md](../../DESIGN.md), which has been corrected in the same pass.
>
> | # | Question | Decision |
> |---|---|---|
> | D-A | Corner radius — DESIGN.md said 2 / 3 / 0 (control / stamp / panel), the code shipped 6 / 5 / 12. | **The code wins: 6 / 5 / 12.** DESIGN.md §5 and its `rounded` token map were wrong, not the implementation, and they are amended. The three steps are now closed: no fourth radius, nothing above 12px, and no pills. A panel is a sheet with a softened corner — the flat-at-rest rule is what keeps it from reading as a card, and that rule is untouched. Unblocks DESIGN-TODO 11.1 (toggle shape). |
> | D-B | Is dark mode in scope? | **Yes — approved, and built last.** The palette in DESIGN-TODO §6A is the approved one (warm charcoal ground, the three UP hues re-derived at lower saturation, all eighteen pairings measured). It lands after the token set has stopped moving, so later token edits are not two-place edits. Two carve-outs: 6A.2 (`--color-on-accent` replacing the literal `text-white` in `buttonClass`) is done early because a hard-coded button text colour is wrong in a light-only app too, and D-E.5 must be reconciled first — the rail's `#123a28` and §6A's `#161719` are two dark grounds and only one may survive. |
> | D-C | Stamp tones: named by appearance (`green \| amber \| red \| neutral`) or by role (`positive \| attention \| problem \| quiet`)? | **The colour names, confirmed twice.** *Correction, same day:* the question was first put to the owner on the basis that the code used colour names — which [DESIGN-TODO.md](../../DESIGN-TODO.md) §1 asserted and which was **stale**. An earlier pass had already renamed `Tone` to the role vocabulary at 32 call sites. Re-asked with the true state, the owner confirmed the colour names, so the rename was **reverted**: 48 tone references, the `Tone` type, the shape map and the four `.stamp--*` rules. Two costs are accepted knowingly and are recorded in `src/components/ui/status.tsx` so they are not rediscovered: this is the one API in the system named by appearance rather than role, and after D-D repainted the palette the names no longer describe their colours (`green` is UP Forest Green, `red` is UP Maroon). What is unaffected is the rule that protects legibility — `Stamp` renders **word + shape + tone**, so no status has ever depended on its colour being read. Note `tone="neutral"` and a button's `variant="quiet"` are deliberately separate vocabularies. |
> | 10.1b | The owner asked for "1-2 fonts, modern font style sana". Does Charter stay? | **Two families is the ceiling; no new family is added.** The app already ships exactly two (self-hosted XCharter + the platform sans), so the request is satisfied by fixing **placement**, not by swapping a face: the document register is confined to prose and titles, and chrome — nav, list rows, excerpts, counts, labels — moves to the sans (DESIGN-TODO 10.1a). `src/app/fonts/` survives and no webfont is added. If a *named* modern sans is still wanted afterwards, it replaces the platform stack rather than joining it, and that is a separate call with a webfont cost. |

> ### Loading-state decisions recorded 2026-09-11 (skeletons and spinners)
>
> Raised against [DESIGN-TODO.md](../../DESIGN-TODO.md) §5.2 and §12i, answered
> by the owner. **Both are built** (2026-09-11).
> [engineering/current-state.md](../engineering/current-state.md) remains the
> authority on what runs.
>
> | # | Question | Decision |
> |---|---|---|
> | L-1 | Does the app get spinners? [DESIGN.md](../../DESIGN.md) §9 said "never a shimmer, never a spinner" and DESIGN-TODO §11.5 listed one as *forbidden*. | **Yes, and DESIGN.md §9 is amended rather than contradicted.** Both prohibitions were **[Recommended]** verdicts of the implementing agent, and an owner request outranks them. What mattered was *not* shipping a component the design document forbids while leaving the document standing — that is the failure that let a button sit 3px off its declared height for months (§12h.2c). So the rule moved, in writing, and the original objection survives as the line between the two: a **skeleton** for content whose shape is known (a route, a list, a table), a **spinner** only for a wait with no shape to predict (a submit in flight, an export being generated). Three constraints came with it — never a spinner where a skeleton fits; never a spinner alone, because motion is not a message; static under `prefers-reduced-motion`. The spinner is **paired with** `SubmitButton`'s relabel rather than replacing it: the glyph is the immediate acknowledgement, the word is the meaning. |
> | L-2 | A skeleton should "follow the layout of the current page". What does the placeholder for a route include? | **The app's chrome for real, plus that route's own shape.** Twelve route-level `loading.tsx` files replaced one generic five-bar block that stood in for all 26 routes. Two consequences are decisions rather than details. First, the chrome (top bar, rail) is **drawn and never pulsed** — `AppShell` is rendered by each page rather than by a layout, so a `loading.tsx` replaces the shell too, and without drawing it every slow navigation would flash the whole window; pulsing it would claim the chrome was waiting when it is not. Second, the rail is drawn **expanded** even for a reader who collapsed it: a Suspense fallback renders synchronously and cannot read the cookie, and a client component that could would flash for everyone. The shape of each skeleton is enforced by `tests/unit/skeleton.test.tsx` rather than reviewed, because a placeholder of the wrong shape fails silently — it looks correct on its own and only misbehaves in the transition. |

> ### Course-creation decisions recorded 2026-09-11 (the create-course modal)
>
> Raised against [modal.md](../../modal.md) and
> [DESIGN-TODO.md](../../DESIGN-TODO.md) §10.3b and §12h, answered by the owner.
> **All three are built** (2026-09-11).
> [engineering/current-state.md](../engineering/current-state.md) remains the
> authority on what runs.
>
> | # | Question | Decision |
> |---|---|---|
> | C-1 | `modal.md` requires a **Semester \*** field when a course is created, but `courses` had no term column — a term lived only on `class_sections.term`. Where does the answer land? | **A nullable `term` column on `courses`, by migration** (`drizzle/0007_course_term.sql`). This is the domain-correct place and `src/lib/term.ts` already pointed at it in prose: a term describes an *offering of a course*, not one class list inside it, so holding it per section made a teacher retype the same academic year per class list and left a course with no class lists showing no term at all. **[AGENTS.md](../../AGENTS.md) §13 normally forbids adding a migration unasked; this one was explicitly approved.** Two alternatives were put and declined: creating the course's first class list as a side effect of course creation (no migration, but every new course would silently arrive with a class list nobody asked for), and dropping the Semester field for now (ships immediately, does not match the reference). Nullable is part of the decision, not a shortcut — every pre-existing course has no value, inventing one would fabricate a fact about somebody's course, and readers fall back to the sections exactly as before, which is what keeps the change additive and `DROP COLUMN` a complete rollback. It also narrows a flagged **[Assumption]**: `fallbackTerm` used to guess a first section's term from the calendar, and now reads the teacher's own answer. |
> | C-2 | Is **Course title** required? The reference image shows `Course title *`. | **Optional — the spec's text wins over its own picture.** `modal.md`'s field list says three separate times that an empty title must still create the course, carry no asterisk, and raise no error. It also agrees with the app as built: the **code** is a course's identity (`CS 33` is what a teacher and a student both call it, and every heading and breadcrumb leads with it), so a title is a gloss on the code rather than a second required name for it. `courses.title` stays `NOT NULL` and holds the empty string; `MetaList` already drops empty facts, so a titleless course renders one line rather than a line with a gap. This **closes DESIGN-TODO §10.3b**, which had been open on exactly this question. |
> | C-3 | Inline panel or modal? | **A centred modal, on the shared `Dialog`.** The inline form appeared above the course cards on `?new=1` and pushed the whole list down the page, so the courses you were about to compare against scrolled out of view. Reusing `Dialog` rather than styling a new modal was the spec's own stated priority ("not a separately designed component"), and it is what makes the radius, elevation, scrim, Escape, focus trap and focus return identical to every other dialog in the app. One consequence accepted knowingly: a dialog has no URL, so the cross-page "New course" link on the home screen now points at the courses **list** rather than at a form — a button that lands you somewhere other than where it says is worse than one extra click. |

> ### Navigation decisions recorded 2026-09-11 (the rail, and "where am I")
>
> Raised against [DESIGN-TODO.md](../../DESIGN-TODO.md) §10.4.2, §11.4 and §12,
> with a reference image supplied by the owner (a dark rail that collapses to
> icons with a flyout submenu). **N-1, N-2 and N-3 are built** (2026-09-11);
> **N-4 is answered and not yet built**.
> [engineering/current-state.md](../engineering/current-state.md) remains the
> authority on what runs.
>
> **One amendment to N-3, forced by CSS and recorded rather than quietly
> substituted.** The reference image's *per-row* flyout cannot be built here: a
> flyout is a child of a rail row, so it must paint outside the rail's right
> edge while the rail keeps scrolling vertically for an account with many
> courses — and CSS forbids that pair (`overflow-x: visible` beside
> `overflow-y: auto` computes back to `auto`; `overflow-x: clip` computes to
> `hidden`, which `overflow-clip-margin` cannot reopen). Both were measured in a
> browser. What shipped instead is the **rail expanding as an overlay** on hover
> or focus — 60px in the layout, painting 216px over the page via a negative
> flex margin, so nothing reflows. The decision's intent is intact (labels
> appear on hover from a collapsed rail) and the result suits this app better:
> the rows that share a glyph are courses, so revealing every label at once is
> what lets a reader tell CS 33 from CS 21.
>
> | # | Question | Decision |
> |---|---|---|
> | N-1 | What collapses the workspace rail — the route, or the reader? | **The reader, with a manual toggle.** A chevron at the top of the rail, as in the reference image. §10.4.2's literal wording ("when you are inside a course, the rail should collapse") was **not** taken: a rail that changes shape on navigation is the instability §12 spent its effort removing, and the owner chose the control over the automation. The route never alters the rail's shape. |
> | N-2 | Does the collapsed state survive a navigation? | **Yes — a cookie, read on the server.** This app re-renders per navigation, so the shell reads the cookie and the rail paints in the right shape first time, with no flash and no post-hydration snap. The cost is a request-time read in the shell. This is the same trade §6.5 recommends for the dark-mode toggle, so the app will have one answer to "where does a viewer preference live" rather than two. `localStorage` was rejected for exactly the flash it causes here. |
> | N-3 | Collapsed, what does the rail show? | **Icons, with a flyout on hover and focus.** The reference image's pattern, and here it is a **necessity rather than a flourish**: that image's top-level items are distinct concepts (Dashboard, Analytics, Settings), while this rail is mostly *instances of one kind* — "My courses" lists CS 33, CS 21, CS 11, all carrying the same `course` glyph. Icon-only, three courses are three identical squares. The label has to live somewhere, and the flyout is where. Built as CSS `:hover` / `:focus-within`, so it needs no JavaScript. |
> | N-4 | **D 11.4b** — the app answers "where am I / how do I get back" three ways (`Breadcrumbs`, the list pane's `.pane-head__back`, and the shell's `selection.backHref`). Which survive? | **Breadcrumbs, everywhere; the other two go.** One mechanism, on every route including top-level ones. This **overrides 11.4d**, which said a top-level route gets no trail and that a one-crumb trail is chrome — that item is superseded and says so. One thing the decision cannot do on its own: in the two-pane layout the list and a selected row **share a route**, so a trail has no crumb that returns to the list, and dropping `backHref` outright would strand a phone reader in a detail view. The return is therefore folded into the trail as its final crumb when a selection is active — still one mechanism, and no dead end. |

---

## D1. What does "Fable" mean? (gates the stack)

- **Question:** Does "using Fable" refer to the Claude Fable model/tooling, or does the owner want the implementation stack to use F#/Fable?
- **Options:** (a) Claude tooling only → keep TypeScript recommendation; (b) F#/Fable stack → change/extend the architecture to an F# option (e.g. SAFE-stack).
- **Trade-offs:** TS = larger help/hiring pool, strong Claude Code familiarity; F#/Fable = owner preference if intended, but steeper learning curve and smaller ecosystem for a student team.
- **Status: CLOSED 2026-08-03 — (a) TypeScript baseline.** “Fable” referred to
  Claude tooling, not an F#/Fable implementation stack, so the condition that
  gated this never applied. The Next.js + Drizzle + Auth.js monolith is the
  approved implementation, recorded in
  [ADR-0001](ADR-0001-current-stack-and-scheduler.md). Nothing here
  awaits approval.

## D2. Account-match auto-confirm policy — **REMOVED, not deferred**

- **Original question:** auto-confirm exact-unique name matches, or require teacher confirmation
  for all of them?
- **Status: REMOVED 2026-08-07, owner-approved.** The question was about how much to trust a
  similarity score between a Google display name and a roster name. **There is no name matching**,
  so there is nothing to tune and nothing to confirm.
- **Replaced by [Confirmed]:** *student access is determined by exact normalized UP email matching
  against teacher-uploaded class lists.* The class list now carries the UP email, so identity comes
  from the teacher rather than from a guess about two strings.
- Name similarity, roster claims, claim throttling, teacher confirm/reject/unlink, and the
  `ROSTER_CLAIM_*` configuration are **deleted**, not disabled. Migration behaviour for existing
  data: [domain/student-identity.md §10](../domain/student-identity.md#10-what-was-removed-and-what-happened-to-the-data).
- **Wait for owner approval?** No — resolved.

## D3. Who grants the Teacher role?

- **Question:** How does a user become a Teacher?
- **Options:** (a) platform admin grants; (b) self-service request + approval; (c) domain/group-based.
- **Trade-offs:** (a) controlled, low complexity; (b) more onboarding UX; (c) risks over-granting.
- **Recommended choice:** (a) platform admin grants; teachers self-serve courses/sections thereafter.
- **Wait for owner approval?** **Yes.**

## D4. Edit-lock rule after first submission

- **Question:** What exactly is restricted once ≥1 student submits a cycle?
- **Options:** (a) lock structural edits (add/remove/retype questions, required flags, choices), allow audited cosmetic text fixes; (b) lock everything; (c) allow all with warnings.
- **Trade-offs:** (a) balances data integrity with fixing typos; (b) safest but rigid; (c) risks invalidating collected answers.
- **Status: CLOSED 2026-08-03 — (a).** Structural edits lock once a cycle has a
  non-draft response; per-occurrence open/deadline overrides remain allowed and
  audited. See [domain/form-workflow.md](../domain/form-workflow.md#3-preview-modify-and-the-edit-lock-rule).

## D5. Grace period / cycle reopen policy

- **Question:** Any grace period after deadline, and rules for reopening a closed cycle?
- **Options:** (a) hard deadline, no grace; teacher can reopen (audited); (b) fixed grace window; (c) per-section configurable grace.
- **Trade-offs:** (a) simple, predictable; (b)/(c) more flexible, more complexity and participation edge cases.
- **Status: CLOSED 2026-08-03 — (a) hard deadline, no grace.** `reopenCycle`
  remains the audited teacher escape hatch and also unlocks locked responses
  (`manage_weekly_cycles`). It is discretionary staff recovery, not a student
  entitlement, so student-facing copy names the path without promising it. See
  [domain/form-workflow.md](../domain/form-workflow.md).

## D6. Unpublish support

- **Question:** Should published public answers be unpublishable, and if so when?
- **Options:** (a) not in MVP; reserve `Unpublished` state only; (b) support in MVP.
- **Trade-offs:** (a) matches "if later supported"; (b) scope creep beyond stated MVP.
- **Status: CLOSED 2026-08-03 — (b) support it.** `product/specification.md` §10 defines
  `Published → Updated/Unpublished`, so unpublish is a required state transition. It is
  Instructor-only, requires a reason, is audited, and is reversible via restore. An unpublished
  entry leaves both the class archive and the linked asker's history (D16). See
  [domain/public-qa.md](../domain/public-qa.md).
- **Approved, not yet built.** The decision is settled; the service and UI are
  not implemented — [engineering/current-state.md](../engineering/current-state.md) `E2` is `schema only`.
  Publishing is therefore still effectively irreversible in the running app.

## D7. Timezone: institution-wide vs per-section

- **Question:** One institution timezone, or per-section override?
- **Options:** (a) single institution timezone (MVP); (b) per-section override.
- **Trade-offs:** (a) simplest and correct for one campus; (b) needed only for multi-timezone offerings.
- **Status: CLOSED 2026-08-03 — (a) single institution timezone.** Stored on
  each section and used consistently; per-section overrides are **deferred**. The
  repository default is `Asia/Manila`.
- **Residual operational step, not an open decision:** confirm the configured
  value before pilot/production if the institution does not run on `Asia/Manila`.
  That is a deployment check on `INSTITUTION_TIMEZONE`; the model itself is
  settled and needs no further approval.

## D8. Merge scope

- **Question:** May a merged public answer combine submissions across cycles (and only within a section)?
- **Options:** (a) within a section, across cycles allowed; (b) within a single cycle only; (c) across sections (via backlog).
- **Trade-offs:** (a) practical for recurring questions, must preserve per-cycle participation; (b) most restrictive; (c) already covered by course backlog.
- **Status: CLOSED 2026-08-03 — (a).** Merge is within a section and **may span
  cycles**; cross-section reuse goes through the course backlog. Merging never
  alters per-cycle participation. The merge **UI** is a separate, unbuilt item
  ([engineering/current-state.md](../engineering/current-state.md) `D3`). See
  [domain/public-qa.md](../domain/public-qa.md#5-merging-multiple-submissions).

## D9. Section join code / verification token as extra matching factor — **REMOVED**

- **Original question:** add a teacher-provided join code as a second factor beyond the name?
- **Status: REMOVED 2026-08-07.** It was proposed *because* an editable display name was weak
  evidence of identity (Risk R1). With the UP email supplied by the teacher from an authoritative
  class list, there is no weak first factor to shore up.
- **Wait for owner approval?** No — resolved with D2.

## D10. Deactivated-student access after roster re-import

- **Question:** When a student is dropped from a re-imported roster, what access remains?
- **Options:** (a) deactivate enrollment, keep read-only history; (b) deactivate and revoke access; (c) keep active.
- **Trade-offs:** (a) preserves data + student's own history; (b) cleaner cutoff; (c) wrong (they left).
- **Status: CLOSED 2026-08-03 — (a).** A dropped student's enrolment is
  deactivated and their own history stays readable; no data is deleted, matching
  the "no silent overwrite" rule. See
  [domain/student-identity.md](../domain/student-identity.md#74-safety-rules).

## D11. ORM: Drizzle vs Prisma

- **Question:** Which ORM if the recommended Drizzle is not preferred?
- **Options:** (a) Drizzle (recommended); (b) Prisma.
- **Trade-offs:** Drizzle = SQL-transparent, teaches DB concepts; Prisma = higher-level, faster start, hides SQL. See [engineering/architecture-history.md](../engineering/architecture-history.md#31-prisma-vs-drizzle-the-orm-decision).
- **Status: CLOSED 2026-08-03 — (a) Drizzle.** It is the repository's ORM and
  migration source of truth. Replacing it with Prisma would be a **new**
  decision with a migration cost, not a reopening of this one — and never a
  prerequisite for starting UI work.

## D12. Deployment target

- **Question:** Where does the app run in production?
- **Options:** (a) single container + managed Postgres; (b) PaaS with Postgres add-on.
- **Trade-offs:** both keep the monolith simple; differences are ops preference and cost.
- **Recommended choice:** Defer; either works. Decide near implementation.
- **Wait for owner approval?** No (low-stakes, revisit later).

## D21. Physical rename of `weekly_cycles` → `form_instances`

- **Question:** Should the table now called `weekly_cycles` be renamed to match the domain concept it holds?
- **Options:** (a) rename now (`ALTER TABLE … RENAME TO`, plus column renames); (b) keep the physical name and rename only in the domain layer.
- **Trade-offs:** (a) removes the last trace of weekly-only naming, but drizzle-kit's rename detection is interactive, so the migration and its snapshot must be hand-authored against fifteen dependent foreign keys; (b) costs nothing a user can see — the Drizzle export is `formInstances`, `cycleIndex` is presented as a sequence number, and no UI string says "cycle".
- **Current working choice:** (b). Recorded as a deliberate deferral in [domain/forms-and-audiences.md](../domain/forms-and-audiences.md#61-physical-names), available at any time.
- **Wait for owner approval?** No — internal naming only.

## D22. Per-section windows for one shared form

- **Question:** Should a form shared by several sections be able to open or close at different times per section?
- **Options:** (a) one window per instance (today): a course needing different deadlines gives each timezone or schedule its own form with a selected-sections audience; (b) per-section window overrides on a shared instance.
- **Trade-offs:** (a) keeps "the deadline" a single unambiguous moment, which every participation, locking and reminder rule depends on; (b) is more flexible and multiplies the edge cases in locking and in the reminder scheduler. Sections in different timezones are refused outright today rather than silently resolved.
- **Current working choice:** (a).
- **Wait for owner approval?** **Yes if** a real offering needs staggered deadlines across sections of one course.

## D13. Data retention / end-of-semester

- **Question:** How long is data kept, and what happens at semester end?
- **Options:** (a) archive in place indefinitely; (b) retention window then purge/anonymize; (c) export-then-archive.
- **Trade-offs:** privacy vs continuity vs institutional policy.
- **Recommended choice:** Archive in place for MVP; define a retention policy with the institution before launch.
- **Wait for owner approval?** **Yes** (institutional/legal input needed).

## D24. Staff invitations for an address with no account

- **Question:** When staff are added by email and one address has no account yet, should the platform invite that person or hold a pending grant, instead of refusing the address?
- **Options:** (a) refuse the address by name and tell the owner the person must sign in once first — **the current behaviour**; (b) write a pending staff row that activates on that person's first sign-in; (c) send an email invitation that provisions the account.
- **Trade-offs:** (a) never provisions access for an address nobody has proven they control, and keeps one rule for staff and students alike — the account exists, or it does not. Its cost is a two-step dance when a new assistant has not logged in yet. (b) and (c) remove that friction but add an account-provisioning path, a pending state that must be shown, expired, and audited, and a window in which a mistyped address holds a real grant. (c) additionally makes the platform an email sender to non-members.
- **Current working choice:** (a). Refusal is per address, with the reason stated (`no_account` / `inactive_account`), and the whole request is refused atomically so a typo grants nobody anything. This follows [ADR-0003](ADR-0003-course-owner-controls-staff-permissions.md) §3, which decided the same thing for section assignment, and is restated in [ADR-0004](ADR-0004-course-wide-staff-standing.md) for course-wide standing.
- **Wait for owner approval?** **Yes** before building (b) or (c). Raised as item 1 of issue #17 and deliberately not resolved there.

---

## Related documents

[product/requirements.md](../product/requirements.md) · [domain/student-identity.md](../domain/student-identity.md) · [domain/form-workflow.md](../domain/form-workflow.md) · [domain/public-qa.md](../domain/public-qa.md) · [engineering/architecture-history.md](../engineering/architecture-history.md) · [product/scope.md](../product/scope.md)
