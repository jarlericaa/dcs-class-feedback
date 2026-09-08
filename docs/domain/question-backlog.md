# Course-Level Question Backlog

> **Status:** Product rule specification; implementation is partial and tracked
> in [engineering/current-state.md](../engineering/current-state.md).
> This document **owns** the course-level backlog concept and its per-section publish flow. Backlog states: [domain/domain-model.md](domain-model.md#37-backlog-question-state). Legacy sourcing detail: [domain/legacy-question-import.md](legacy-question-import.md).
> Label key as in [product/requirements.md](../product/requirements.md).

## 1. Purpose **[Confirmed]**

A separate **course-level** question backlog area for collecting questions that may be answered publicly later. It is **separate from the normal weekly response dashboard**.

- The backlog belongs to the **course**, not a single class section.
- Teachers choose which backlog questions become visible to a specific **current** class section.

## 2. What the backlog may contain **[Confirmed]**

- Imported questions from previous semesters
- Unanswered questions from old Typst files
- Already-answered questions from old Typst files
- Questions from Google Forms response sheets
- Questions from weekly feedback response sheets
- Questions previously marked "will answer"
- Unread feedback later identified by staff as answerable
- Questions copied or moved from current weekly submissions for later answering

Live vs legacy provenance is tracked on each `BacklogQuestion` (see [domain/domain-model.md](domain-model.md) and [domain/legacy-question-import.md](legacy-question-import.md)).

## 3. Getting questions into the backlog

The backlog is **not** a list of every unanswered submission — it holds only what the teaching team
has *confirmed* it intends to answer (`product/specification.md` §5.6).

- **From the Question Inbox:** choosing `Will Answer` on a student question creates a
  **recommendation**, not a backlog entry. See §3A.
- **From current submissions:** on approval, staff **copy or move** a `StudentSubmissionItem` into the course backlog. This sets the item's review state to `Moved to backlog` ([domain/domain-model.md](domain-model.md#34-student-question-review-state)) and creates a `BacklogQuestion`. Whether the source link is preserved follows the same rules as legacy import (only when intentional/appropriate) — see [domain/legacy-question-import.md](legacy-question-import.md).
- **From legacy sources:** via the import flows in [domain/legacy-question-import.md](legacy-question-import.md).

## 3A. Instructor-confirmed membership **[Confirmed — product/specification.md §6.6, §7 D3]**

- A **Student Assistant may recommend** an addition or a removal, with an optional reason.
- **Only an Instructor confirms** an addition or a removal. A TA holding `manage_backlog_imports`
  can recommend but is refused when confirming — the capability is non-delegable
  ([domain/roles-and-permissions.md](roles-and-permissions.md)).
- Recommending the same item twice is idempotent: at most one pending recommendation exists per
  item per kind, enforced by a partial unique index.
- Confirmation records the deciding Instructor and the timestamp; rejection records a note.
  Every recommendation and decision is audited.

## 3B. Backlog item fields **[Confirmed — product/specification.md §5.6]**

Original question and asker (when a source link is preserved) · source form or legacy source ·
topic and free-form tags · priority · assigned staff member · date added · optional target date ·
linked duplicate questions and their askers · draft answer · recommendation state · approval state.

Staff may **take ownership** of an item or reassign it to another staff member on the course.
The backlog stays **course-scoped** and is reachable both from a section and from its own
course-level route.

## 4. Backlog lifecycle **[Confirmed]** states

`Imported → Needs review → Answerable → Drafting → Scheduled → Published`, plus `Archived` and
`Not suitable`. Transitions in [domain/domain-model.md](domain-model.md#37-backlog-question-state).
Membership confirmation is an **independent** dimension: an item cannot leave `Imported`/`Needs
review` until an Instructor has confirmed it belongs in the backlog.

## 4A. Merging duplicates **[Confirmed — product/specification.md §6.6, §7 D4]**

- Staff select several questions and produce **one** merged backlog item and/or public answer.
- Every original question and its asker are preserved and remain individually attributable —
  merging changes handling, never content.
- Each linked asker sees the published relationship between their own question and the shared
  answer, without learning who else asked.
- **Unmerging loses nothing.** Members are never deleted; each records its pre-merge state, which is
  what the unmerge restores. Unmerging an already-published answer keeps each asker's "answered"
  relationship rather than silently retracting something they have already seen.
- Merge and unmerge are transactional and audited, and submitting the same merge twice returns the
  existing merge rather than creating a second one.

## 5. Publishing from the backlog **[Confirmed]**

- Backlog questions do **not** automatically appear in any public Q&A archive.
- Teachers must **explicitly choose** which backlog questions to publish to a class section.
- **[Recommended]** Publishing to a section records a `SectionBacklogVisibility` (which section, by whom) and creates a `PublicAnswer` in that section, following the rewording, anonymity, source-link, and scheduling rules in [public-qa.md](public-qa.md).
- Because the backlog is course-level and publishing is per-section, the same backlog question can be published to different sections independently.

## 6. Relationship to participation

Backlog and legacy questions never count toward current participation ([participation.md](participation.md#3-participation-derivation)). Moving a *current* submission to the backlog does not remove the original submission's participation credit — the `FormResponse` still stands.

## 7. Decisions affecting the backlog

- **D8 — closed:** merge is within a section and may span cycles; cross-section consolidation goes
  through this course-level backlog. Merging never alters per-cycle participation.

See [decisions/open-decisions.md](../decisions/open-decisions.md).

## 8. Related documents

[domain/domain-model.md](domain-model.md) · [domain/legacy-question-import.md](legacy-question-import.md) · [public-qa.md](public-qa.md) · [participation.md](participation.md) · [decisions/open-decisions.md](../decisions/open-decisions.md)
