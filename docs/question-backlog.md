# Course-Level Question Backlog

> **Status:** Product rule specification; implementation is partial and tracked
> in [CURRENT_STATE.md](CURRENT_STATE.md).
> This document **owns** the course-level backlog concept and its per-section publish flow. Backlog states: [domain-model.md](domain-model.md#37-backlog-question-state). Legacy sourcing detail: [legacy-question-import.md](legacy-question-import.md).
> Label key as in [product-requirements.md](product-requirements.md).

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

Live vs legacy provenance is tracked on each `BacklogQuestion` (see [domain-model.md](domain-model.md) and [legacy-question-import.md](legacy-question-import.md)).

## 3. Getting questions into the backlog

- **From current submissions:** during review, staff **copy or move** a `StudentSubmissionItem` into the course backlog. This sets the item's review state to `Moved to backlog` ([domain-model.md](domain-model.md#34-student-question-review-state)) and creates a `BacklogQuestion`. Whether the source link is preserved follows the same rules as legacy import (only when intentional/appropriate) — see [legacy-question-import.md](legacy-question-import.md).
- **From legacy sources:** via the import flows in [legacy-question-import.md](legacy-question-import.md).

## 4. Backlog lifecycle **[Confirmed]** states

`Imported → Needs review → Answerable → Drafting → Scheduled → Published`, plus `Archived` and `Not suitable`. Transitions in [domain-model.md](domain-model.md#37-backlog-question-state).

## 5. Publishing from the backlog **[Confirmed]**

- Backlog questions do **not** automatically appear in any public Q&A archive.
- Teachers must **explicitly choose** which backlog questions to publish to a class section.
- **[Recommended]** Publishing to a section records a `SectionBacklogVisibility` (which section, by whom) and creates a `PublicAnswer` in that section, following the rewording, anonymity, source-link, and scheduling rules in [public-qa-and-source-linking.md](public-qa-and-source-linking.md).
- Because the backlog is course-level and publishing is per-section, the same backlog question can be published to different sections independently.

## 6. Relationship to participation

Backlog and legacy questions never count toward current participation ([participation-rules.md](participation-rules.md#3-participation-derivation)). Moving a *current* submission to the backlog does not remove the original submission's participation credit — the `FormResponse` still stands.

## 7. Open decisions affecting the backlog

- [Open D8] Cross-cycle/cross-section merge scope (affects consolidating backlog items into one public answer).

See [open-decisions.md](open-decisions.md).

## 8. Related documents

[domain-model.md](domain-model.md) · [legacy-question-import.md](legacy-question-import.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [participation-rules.md](participation-rules.md) · [open-decisions.md](open-decisions.md)
