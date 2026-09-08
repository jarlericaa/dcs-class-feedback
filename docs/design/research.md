# Design Research and Comparable Products

**Research date:** 2026-08-02  
**Purpose:** identify interaction patterns for a university feedback + Q&A
workflow. These sources are inspiration, not product requirements.

## Comparable products

| Product | Why it is relevant | Pattern worth borrowing | What not to import automatically |
|---|---|---|---|
| [Ed Discussion](https://edstem.org/) | Course-scoped threaded questions, categories, staff/private interaction, and anonymous student posts | A course feed organized by categories with pinned/high-priority items and a focused thread view | Open-ended threads, reactions, rich collaboration, and peer-answer complexity are outside the current MVP |
| [Piazza](https://piazza.com/product/overview) | Course Q&A with anonymous posting, instructor responses, unresolved-question awareness, and search | A compact question list plus selected-question workspace; make unanswered work visible to staff | Student voting, wiki-style collaboration, and complex notification behavior are not current requirements |
| [Slido Live Q&A](https://www.slido.com/features-live-qa) | Anonymous questions, popular/recent sorting, and a clear host triage queue | Make privacy choice and “what needs attention” obvious; separate student submission from staff handling | Slido is optimized for live events, so live presentation controls and voting are not needed |
| [Top Hat Discussion](https://tophat.com/features/discussion-tools/) | Anonymous classroom questions and visible progress through a question queue | A simple queue with clear answered/pending progress and low-friction question entry | Real-time polling, classroom gamification, and response counters are not in scope |
| [Watermark Course Evaluations & Surveys](https://www.watermarkinsights.com/solutions/course-evaluation-survey-software/) | Higher-education course feedback collection, reporting, response-rate monitoring, and instructor dashboards | Teacher overview cards for response rate, unanswered items, recent cycles, and recurring themes | AI summaries/sentiment analysis and institutional reporting complexity are deferred |

## Design conclusions for Class Feedback

### 1. Use a two-level workspace

Students need a short, focused completion flow. Teachers need an inbox and
operational overview. A single universal dashboard would make one of these
experiences unnecessarily dense.

### 2. Make anonymity a visible interaction state

The product should never rely on the word “anonymous” alone. Before publishing,
the teacher should see who will be able to view the answer, the reworded public
text, and a warning when the text may identify the asker.

### 3. Organize staff work around attention, not raw records

Counts such as “12 new items,” “3 pending matches,” and “1 scheduled answer”
are more useful than a database-shaped list. The underlying record remains
available, but the first screen should prioritize what needs action.

### 4. Keep the archive searchable and calm

The student archive should feel like a reliable knowledge base: search, topic or
category filters, readable answer cards, and a clear published date. Avoid social
ranking or popularity mechanics in the first release.

### 5. Preserve source/context separation

The teacher view can show original wording and identity; the public composer
must show editable public wording separately. That visual separation reduces
accidental privacy leaks.

## Recommended visual reference mix

The strongest combination is:

- Ed Discussion's course-context organization;
- Piazza's compact Q&A navigation;
- Slido's explicit anonymous-question handling;
- Watermark's restrained instructor summary cards;
- an original warm-neutral/green visual system rather than copying any one
  brand.

## Research limitations

Product pages and screenshots show intended interaction patterns, not necessarily
every current capability or accessibility behavior. The team should validate the
chosen direction with at least one teacher and one student before locking the
design system.
