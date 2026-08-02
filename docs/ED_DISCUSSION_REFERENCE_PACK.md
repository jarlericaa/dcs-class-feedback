# Ed Discussion UI Reference Pack

**Purpose:** visual study material for the Class Feedback implementation.  
**Research date:** 2026-08-02.  
**Primary target:** Ed Discussion’s course workspace, queue, categories, search,
thread/detail relationship, state indicators, and privacy controls.

This pack is for design and implementation reference. Do not copy vendor logos,
brand identity, exact wording, proprietary assets, or source code into the
Class Feedback app. Use the interaction patterns to create an original
warm-neutral/campus-green system.

## How to use this pack with Claude

Ask Claude to open the source pages and direct screenshot links below before
implementing the shell. The direct image links are useful when a documentation
page hides an image below the fold. If Claude cannot access an image, the
source-page descriptions and the local UX brief are sufficient.

For each reference, study:

- layout and information hierarchy;
- density and row height;
- how selection is communicated;
- where search and filters sit;
- how status is encoded with icon + text + color;
- how a composer is entered;
- what is visible to students versus staff;
- which patterns should be rejected for this product’s MVP.

Do not add these external screenshots as production assets or hotlink them from
the app. They are research material only.

## Ed Discussion: primary references

### 1. Main course discussion workspace

- [Official Ed Discussion site](https://edstem.org/)
- [Official Ed Discussion help entry](https://edstem.org/help/using-ed-discussion)
- [Ed Discussion sample UI — direct screenshot](<https://s3.amazonaws.com/cdn.freshdesk.com/data/helpdesk/attachments/production/42069847643/original/ye4CoRmmxlcHppkT4BO1Rjli3BKd6fHqEA.png?1626205096=>)
- [Penn student guide — source page](https://sas-lps.freshdesk.com/support/solutions/articles/42000087902-ed-discussion-for-students)

Inspect the course context, compact thread list, selected content, top actions,
and how the product makes an unread/resolved item easy to scan.

### 2. Thread state icon language

- [Penn unread indicator — direct image](<https://lh4.googleusercontent.com/1Rvsz9HzCjVSNW8u8mDuk7YU0GRKnutE39EVFzM9dOMZgqqKxWlvpqEAr-VsALQqh4zazH69buY0KDJR3sk6umf94_KU66IA5djF2UZrNH3Y_huR6TsHaXIesVtszGFOuaf6CI1h>)
- [Penn resolved indicator — direct image](<https://lh3.googleusercontent.com/cA_Gs_JHGD9p_mhTx9nhiL2zN43_I5HNLlNprb87wbP_Ci7I_4k3cBvcfrBj4wK4oILyUidceKXeFGXYm3R7R4vciTkxHo3mY4Yy1rpXh99OPYU52Hp-koIek4AEVESIjyKtq6JM>)
- [Penn pinned indicator — direct image](<https://lh4.googleusercontent.com/aaEH9iVbWxF0xeRw2qm6KSaLKE41qd3rUI6BVco-NSK8V8nFiqNXj9rJgxfij9rE-jIiJCD_i9em0nce66y4EhiRAYn5UV69HKAbP8HsBvCXtyPdlmUte2nkK7Py2fuu8lCSOe7p>)
- [Penn instructor-answer indicator — direct image](<https://lh6.googleusercontent.com/B31QdcmW7TwOArMvubmWmgyqcpVz2j_o6KOxGyKtTiOV6D4iTaWC0WTPGmlGbMCPlJSuNfy2sD-I77e3HbH_BY12N3SGYGjjYDnO5VLVtHGhH5olL_RwCLlY1yuA3osUcxhUiFn2>)
- [Penn guide with all thread states explained](https://infocanvas.upenn.edu/tools/ed-discussion-for-students/)

Use icon + label, not color alone. Class Feedback should translate these ideas
into states such as New, Under review, Submitted, Answered, Published, and
Pending match. Do not import hearts, stars, endorsements, or subscriptions into
the MVP.

### 3. Student notifications, settings, and density

- [Penn sample interface screenshot](<https://s3.amazonaws.com/cdn.freshdesk.com/data/helpdesk/attachments/production/42069847643/original/ye4CoRmmxlcHppkT4BO1Rjli3BKd6fHqEA.png?1626205096=>)
- [Penn notifications screenshot](<https://s3.amazonaws.com/cdn.freshdesk.com/data/helpdesk/attachments/production/42098402755/original/jFn-GP57vtEaHmZDEKRobzOKNyoqIZas_Q.jpeg?1662570326=>)
- [Penn account/settings screenshot](<https://s3.amazonaws.com/cdn.freshdesk.com/data/helpdesk/attachments/production/42098402758/original/t9-_7kVyjsKnek4_ULI_Vy1vSNttbLGrzw.jpeg?1662570326=>)
- [Penn notification preferences screenshot](<https://s3.amazonaws.com/cdn.freshdesk.com/data/helpdesk/attachments/production/42098402759/original/96bsQ1kFuMSQpKkOskeUP0sbrVemnuhZmA.jpeg?1662570326=>)
- [Penn guide — source page](https://sas-lps.freshdesk.com/support/solutions/articles/42000087902-ed-discussion-for-students)

Study how a mature product keeps the course view compact and how settings
remain separate from the main learning task. For this MVP, keep notifications
out of scope; use the reference only for density and account-menu placement.

### 4. Instructor setup and category organization

- [University of Chicago quick-start guide](https://uchicago.service-now.com/it?id=kb_article_view&sysparm_article=KB06001750)
- [UChicago category/settings screenshot](https://uchicago.service-now.com/sys_attachment.do?sys_id=136795f3473c7250c91ae0f1516d43db)
- [UChicago thread creation/grouping screenshot](https://uchicago.service-now.com/sys_attachment.do?sys_id=076795f3473c7250c91ae0f1516d439a)
- [Yale Ed Discussion feature summary](https://poorvucenter.yale.edu/teaching/canvas-yale/instructional-tools/ed-discussion)

Study category hierarchy, staff setup, and how thread types are distinguished.
For Class Feedback, categories should support Q&A archive scanning and staff
triage; do not add a general-purpose social discussion model.

### 5. Composer, visibility, and staff controls

- [Stanford Ed Discussion guide](https://canvashelp.stanford.edu/hc/en-us/articles/4402081717011-Getting-Started-with-Ed-Discussion)
- [Stanford thread options screenshot](https://canvashelp.stanford.edu/hc/article_attachments/4402075210771)
- [Stanford post visibility screenshot](https://canvashelp.stanford.edu/hc/article_attachments/4402075215251)
- [UCI Ed Discussion guide](https://edtechtools.eee.uci.edu/ed-discussion-using-ed-discussion/)
- [Wharton Ed Discussion faculty guide](https://support.wharton.upenn.edu/help/ed-discussion-for-faculty)

Study the placement of visibility controls and staff-only actions. Class
Feedback must use a much stricter model:

- private response: asker + authorized staff;
- public answer: enrolled section + authorized staff;
- original wording: staff-only;
- source identity: staff-only;
- no peer comments, reactions, votes, or open thread replies in MVP.

## Comparable products

These are secondary references for individual patterns, not models to copy
wholesale.

### Piazza — compact Q&A queue and selected question

- [Piazza product overview](https://piazza.com/product/overview)
- [Columbia Piazza interface screenshot and analysis](https://ccnmtl.columbia.edu/enhanced/solutions/piazza_for_class-based_q-n-a.html)
- [Piazza product introduction PDF](https://piazza.com/pdfs/piazza_product_introduction.pdf)
- [Piazza student interface in an LMS](https://support.piazza.com/support/solutions/articles/48001156123-piazza-student-interface-within-an-lms)

Borrow: compact question list, selected question pane, unresolved/answered
awareness, course switcher, and search placement. Exclude: student voting,
wiki-style collaboration, peer-answer complexity, and notification behavior.

### Slido — explicit anonymous Q&A and triage

- [Slido live Q&A](https://www.slido.com/features-live-qa)
- [Slido Q&A session screenshot/reference](https://community.slido.com/running-your-q-a-216/run-a-q-a-session-404)
- [Slido host reply workflow](https://community.slido.com/live-q-a-management-216/reply-as-a-host-to-q-a-questions-497)
- [Slido Q&A product home](https://www.slido.com/)

Borrow: clear question entry, recent/popular-style triage inspiration, and a
visible privacy choice. Exclude: live-event controls, upvotes, presenter mode,
and real-time polling.

### Top Hat — low-friction classroom question flow

- [Top Hat discussion tools](https://tophat.com/features/discussion-tools/)
- [Top Hat educator discussion guide](https://support.tophat.com/article/Educator-Creating-Discussions)
- [Top Hat student question guide](https://support.tophat.com/article/Student-Answering-Questions)

Borrow: short question-entry flow, clear progress, and simple question states.
Exclude: gamification, live polling, and interactive classroom controls.

### Watermark Course Evaluations — staff summary and response-rate language

- [Watermark course evaluation software](https://www.watermarkinsights.com/solutions/course-evaluation-survey-software/)
- [Watermark dashboard widgets](https://support.watermarkinsights.com/hc/en-us/articles/4454454730139-Manage-Dashboard-and-Dashboard-Widgets)
- [Watermark response-rate tracker](https://support.watermarkinsights.com/hc/en-us/articles/4454432291995-Response-Rate-Tracker)
- [Watermark Canvas user experience](https://support.watermarkinsights.com/hc/en-us/articles/4454417370139-Canvas-User-Experience)
- [Watermark dashboard screenshot reference](https://support.canvas.fsu.edu/kb/article/1041-how-to-add-custom-questions-to-your-evaluations-using-watermark-course-evaluations-surveys-formerly-evaluationkit/)

Borrow: restrained staff summary cards, response-rate language, and clear
project/status periods. Exclude: institutional reporting complexity, sentiment
analysis, and AI-generated summaries.

## Screenshot checklist for the implementation pass

If screenshot capture is available, capture or inspect at least these views:

| # | Reference view | What Claude should learn | Class Feedback surface |
|---:|---|---|---|
| 1 | Ed main course workspace | course context + list/detail split | student Q&A archive |
| 2 | Ed unread/resolved/pinned rows | scan-friendly state language | archive and review queue |
| 3 | Ed search/category controls | filter placement and hierarchy | Q&A search and staff filters |
| 4 | Ed composer/visibility controls | action placement and privacy cue | student question area + public composer |
| 5 | Ed staff/private settings | role-specific controls | teacher review and staff-only fields |
| 6 | Piazza selected question | compact queue + focused detail | staff selected submission |
| 7 | Slido anonymous Q&A | low-friction anonymous entry | student-originated question explanation |
| 8 | Watermark response dashboard | useful attention summaries | teacher dashboard cards |
| 9 | mobile Ed/Penn view if available | responsive density | student mobile shell |
| 10 | empty/no-result state | calm recovery path | no open cycle / no Q&A results |

## Translation rules for this app

Use this mapping while implementing:

| Ed-style pattern | Class Feedback translation |
|---|---|
| Course list | section/workspace switcher |
| Category list | section Q&A topics or staff review filters |
| Thread list | published Q&A entries or review items |
| Selected thread | selected answer or selected submission |
| Unread marker | new/pending/needs review state |
| Resolved marker | answered/published state |
| Anonymous post | source-anonymous public question |
| Private post | private response or staff-only note surface |
| New Thread | Ask a question / add feedback |
| Pin/announcement | pinned course guidance only if later approved |
| Search/filter | section archive search and staff triage |

Do not make the translation literal where the product rules differ. A
course-feedback form is not an open discussion forum, and a section archive is
not internet-public.

## References used for the written conclusions

- [Ed Discussion official site](https://edstem.org/)
- [University of Chicago Ed Discussion guide](https://uchicago.service-now.com/it?id=kb_article_view&sysparm_article=KB06001750)
- [Penn Ed Discussion student guide](https://infocanvas.upenn.edu/tools/ed-discussion-for-students/)
- [Stanford Ed Discussion guide](https://canvashelp.stanford.edu/hc/en-us/articles/4402081717011-Getting-Started-with-Ed-Discussion)
- [Yale Ed Discussion guide](https://poorvucenter.yale.edu/teaching/canvas-yale/instructional-tools/ed-discussion)
- [Piazza product overview](https://piazza.com/product/overview)
- [Slido live Q&A](https://www.slido.com/features-live-qa)
- [Top Hat discussion tools](https://tophat.com/features/discussion-tools/)
- [Watermark course evaluation software](https://www.watermarkinsights.com/solutions/course-evaluation-survey-software/)
