# Class Feedback Platform — Product Specification

**Status:** Product definition for implementation  
**Primary release:** Core pilot (MVP)  
**AI features:** Parked; not part of the MVP

## 1. Project context

The current workflow uses Google Forms for weekly class feedback. Students answer teacher-defined prompts and may ask questions. Teaching staff then skim a spreadsheet, decide which questions to answer, compile answers into a separate file, and send that file to the class.

Google Forms is adequate for collecting responses but weak for triaging questions, collaborating on answers, publishing anonymized responses, linking published answers back to askers, and tracking feedback-based bonus credit.

This project replaces that fragmented workflow with a course-scoped feedback and Q&A platform.

## 2. Product goals

1. Let instructors create reusable weekly feedback forms and release them automatically.
2. Make form responses easy to review by prompt and by student.
3. Separate student questions from general feedback and give staff a clear triage workflow.
4. Let staff answer privately or publish an anonymized, reworded question and answer to the class.
5. Preserve a private link between the original asker and any published version.
6. Track valid feedback submissions toward configurable bonus requirements for each long-exam period.
7. Support instructors and Student Assistants without exposing student identities to classmates.
8. Preserve course records and allow reuse across semesters.

## 3. Non-goals for the core pilot

- AI-generated answers, style adaptation, or AI fact-checking
- Legacy Typst/CSV/XLSX question import
- Reactions and public comment threads
- Student file attachments
- Public access outside the enrolled course

The legacy import and discussion features remain required backlog stories after the core pilot. AI is parked until the main workflow is stable.

## 4. Roles and permissions

### 4.1 Instructor

Instructors can:

- Create and archive courses.
- Add other instructors and Student Assistants.
- Import and review a class roster.
- Resolve uncertain roster-account matches.
- Create templates, schedules, forms, and bonus periods.
- View all student identities and responses.
- Review and invalidate submissions directly.
- Confirm invalidity flags raised by Student Assistants.
- Decide whether questions will or will not be answered.
- Confirm additions to or removals from the Question Backlog.
- Write and send private answers.
- Write, approve, publish, edit, unpublish, and version public answers.
- Export responses and bonus records.

All instructors assigned to a course have equal permissions.

### 4.2 Student Assistant

Student Assistants can:

- View student identities and submitted content.
- Review feedback and form responses.
- Flag a submission as potentially invalid, with a required reason.
- Recommend that a question be added to or removed from the backlog.
- Take ownership of backlog questions.
- Write answers and reword public questions.
- Send manually written private answers without instructor approval.
- Submit public-answer drafts for instructor approval.
- Help resolve uncertain student-to-roster matches.

Student Assistants cannot directly invalidate a submission, confirm backlog membership, publish a public answer, or export identity/bonus records unless this permission is later expanded.

### 4.3 Student

Students can:

- Sign in with a school Google account and claim their roster entry.
- View active forms and submit one response per form.
- Edit that response until the form deadline.
- Add zero or more separately tracked questions and a general comment.
- See whether their form submission is valid and whether it counted toward bonus credit.
- See a student-visible invalidity reason.
- Track their bonus progress per long-exam period.
- See each submitted question as `Received` until it is answered.
- Receive private answers and send private follow-ups.
- See when their question was answered publicly and compare their original question with the published rewording.
- Browse the course-only public Q&A archive.

Students cannot hide their identity from instructors or Student Assistants. Their identity is never shown to classmates as the source of a public question.

## 5. Core concepts

### 5.1 Course

A semester-specific space containing its roster, staff, forms, responses, questions, Q&A archive, bonus periods, and exports.

At semester end, the course is archived rather than reset or deleted. Instructors can clone templates and settings into a new course without copying student accounts, submissions, or bonus progress.

### 5.2 Feedback template

A reusable definition of a form. It may include:

- Short or long written response
- Multiple choice
- Checkboxes
- Rating scale
- Required or optional fields
- Repeatable `Ask a Question` entries
- General comments

Templates support rich text, Markdown, code blocks, links, images, and LaTeX math. Students cannot attach files in the MVP.

### 5.3 Feedback form instance

A released snapshot of a template with its own release time, deadline, bonus period, and responses. Later template edits do not change historical instances.

A recurring schedule can automatically create and publish weekly instances. Staff can pause, skip, or override a scheduled release.

### 5.4 Feedback submission

One student's response to one form instance. A student may edit it until the deadline. The form closes at the deadline and does not accept late submissions.

One valid submission contributes at most one bonus credit, regardless of the number of questions or non-empty fields it contains.

### 5.5 Student question

An individually tracked question created inside a feedback submission. Multiple questions in the same form become separate question records.

Student-visible states:

- `Received`
- `Answered Privately`
- `Answered Publicly`

Internal states:

- `Pending`
- `Answered`
- `Will Not Answer`

`Received` only confirms that the question was recorded. A question internally marked `Will Not Answer` continues to appear as `Received` to the student.

### 5.6 Question Backlog

A private staff-only list containing questions the teaching team has confirmed it intends to answer. It is not a list of every unanswered submission.

Each backlog item contains:

- Original question and asker
- Source form or legacy source
- Topic/tags
- Priority
- Assigned staff member
- Date added
- Optional target date
- Linked duplicate questions and askers
- Draft answer and approval state

Student Assistants may recommend backlog changes; an instructor confirms them.

### 5.7 Public Q&A entry

A course-only published entry with:

- An anonymized and staff-editable displayed question
- A published answer
- Topic/tags and source period
- Published and last-updated timestamps
- Version history
- Private links to every original question merged into the entry

Staff may edit the displayed question for grammar, wording, clarity, and context. Original questions remain unchanged and privately visible to their askers and staff.

## 6. Detailed workflows

### 6.1 Course creation and roster import

1. An Instructor creates a course.
2. The Instructor uploads a CRS-style XLSX class list.
3. The system detects course metadata and student columns.
4. A confirmation screen lets the Instructor edit course details and review roster warnings.
5. The importer stores student number, family name, first name, lived name, preferred pronoun, program, enrollment status, and enlistment date.
6. `Sex Assigned at Birth` is ignored because it is unnecessary for this product.
7. All rows are imported, but statuses not considered enrolled by the spreadsheet legend are flagged for review.
8. Student numbers are stored as identifiers/text, not numeric values.

The provided sample does not contain email addresses. Account claiming therefore works as follows:

1. The student signs in with a school Google account.
2. The student enters their student number.
3. The system compares the Google-account name with the unclaimed roster entry.
4. A unique high-confidence match links automatically.
5. Mismatches, ambiguous names, duplicate claims, or already-claimed entries require staff review.
6. A roster entry cannot be linked to two accounts.
7. Linking and unlinking are audit logged.

### 6.2 Template scheduling and form release

1. Staff creates a template using the form builder.
2. The Instructor configures a weekly schedule, release time, deadline, and default bonus period.
3. The system automatically creates and publishes each form instance.
4. Staff can skip or pause a release for holidays or weeks without class.
5. A released form is a snapshot; historical questions never change when the template changes.
6. Students receive an email when a form opens and before its deadline.

### 6.3 Student submission

1. The student opens an active form.
2. Existing work is saved as a draft where practical.
3. The student answers teacher prompts, optionally adds multiple questions, and may add a general comment.
4. The student submits once and may edit until the deadline.
5. On deadline, the latest submitted version is locked.
6. The system records the submission under the form's bonus period.

### 6.4 Response analysis

The staff dashboard has a `Response Analysis` view separate from the question workflow.

For each teacher-created prompt, staff can:

- View aggregate counts/charts for structured responses.
- Review all written responses and create staff-authored summary/theme notes; automated AI summarization is not part of the MVP.
- Expand the prompt to see every student's answer and name.
- Filter by form, section, long-exam period, validity, and student.
- Export raw responses to CSV/XLSX.
- Produce a shareable PDF summary that does not expose identities unless explicitly configured by an Instructor.

### 6.5 Submission validity and bonus credit

1. A submitted form initially counts as valid.
2. A Student Assistant may flag the entire submission as potentially invalid and must give a reason.
3. An Instructor may confirm the flag, reject it, or invalidate a submission directly.
4. An invalid submission contributes zero bonus credit.
5. The student sees which form was invalidated and the reason.
6. Every change to validity records the actor, timestamp, previous value, and reason.

Bonus periods are configurable grading buckets, normally one per long exam. Each period has:

- Name, such as `Long Exam 1`
- Required number of valid submissions
- Start and end dates
- Included form instances
- Per-student valid and invalid counts

New recurring forms are assigned to the active bonus period automatically, with staff override.

### 6.6 Question triage

The `Question Inbox` lists every individually submitted student question and shows the student name to staff.

Staff actions include:

- `Will Answer`
- `Will Not Answer`
- `Answer Privately`
- `Publish Publicly`
- `Merge Duplicate`
- `Mark/Flag Invalid Submission`

Choosing `Will Answer` creates a recommendation to add the question to the backlog. An Instructor confirms the backlog addition. `Will Not Answer` remains private and does not change the student's `Received` status.

Related questions may be merged into one backlog/public item while preserving every original question and asker.

### 6.7 Answering privately

1. Staff writes a private answer.
2. A Student Assistant may send a manually written private answer directly.
3. The asker receives the answer by email and can view it in the platform.
4. The question becomes `Answered Privately` for the student.
5. The student may send a private follow-up linked to the original question.
6. Staff may later publish a generalized public answer while retaining the private thread.

### 6.8 Publishing publicly

1. Staff selects one or more original questions.
2. Staff writes an anonymized displayed question and may correct grammar, wording, and context.
3. Staff writes the public answer.
4. Public drafts written by Student Assistants require Instructor approval.
5. An Instructor publishes the entry to enrolled course members.
6. Every linked asker receives an email and sees the relationship between their original question and the public wording.
7. Staff may attach a private follow-up to any individual asker.
8. Published entries may be edited later, retain version history, and show an updated timestamp.

The archive is searchable and filterable by topic, date, source form, and long-exam period.

### 6.9 Email notifications

The MVP uses email rather than a separate in-app notification center. Email events include:

- Form opened
- Deadline reminder
- Private answer received
- Public answer linked to the student's question
- Submission invalidated or restored
- Staff-facing approval or assignment events where useful

Every email links to the corresponding authenticated page. Emails must not expose private feedback content in their subject line.

### 6.10 Exports

Staff exports include:

- Raw responses in CSV/XLSX
- Student number, name, school account, valid count, invalid count, and per-form bonus breakdown
- Question/backlog status export
- PDF response summaries

Identity and bonus exports are Instructor-only in the MVP.

## 7. User stories and acceptance criteria

### Epic A — Authentication, courses, and roster

#### A1. School Google sign-in

As a course member, I want to sign in with my school Google account so that I do not need a separate password.

**Acceptance criteria**

- Only configured school domains are accepted.
- Sign-in does not grant course access until a role or roster entry is linked.
- A user cannot assume another role by changing client-side data.

#### A2. Instructor-created course

As an Instructor, I want to create a semester-specific course so that I can manage feedback independently from other courses.

**Acceptance criteria**

- An Instructor can create a course and add equal-permission co-instructors.
- Course data is isolated from other courses.
- The creator can add Student Assistants.

#### A3. CRS roster import

As an Instructor, I want to upload the existing class-list XLSX so that I do not manually encode the class.

**Acceptance criteria**

- The sample class-list structure is recognized.
- Course metadata and supported student columns are previewed before import.
- Unneeded sensitive fields are not persisted.
- Non-enrolled statuses and malformed/duplicate student numbers are flagged.

#### A4. Student roster claim

As a student, I want to link my school account to my roster entry so that my submissions and bonus credit are recorded correctly.

**Acceptance criteria**

- Only an unclaimed roster record may be linked.
- High-confidence unique matches may auto-link.
- Ambiguous or conflicting claims require staff review.
- All claim decisions are audit logged.

### Epic B — Templates and scheduled forms

#### B1. Reusable template builder

As staff, I want to create reusable feedback templates so that weekly forms do not need to be rebuilt.

**Acceptance criteria**

- The supported field types and required/optional settings work.
- A template may include repeatable questions and general comments.
- Rich content and LaTeX render safely.

#### B2. Automatic weekly release

As an Instructor, I want a template released automatically each week so that routine feedback collection requires little manual work.

**Acceptance criteria**

- Each release is a dated form-instance snapshot.
- Release and deadline use the course timezone.
- Staff can pause, skip, or override a scheduled occurrence.
- Students receive release and reminder emails.

#### B3. Single editable response

As a student, I want to edit my single response until the deadline so that I can correct mistakes.

**Acceptance criteria**

- A student cannot create multiple responses for the same form.
- The latest submitted version is used at the deadline.
- No edits or late submissions are accepted after closing.

### Epic C — Analysis, validity, and bonus tracking

#### C1. Per-prompt response review

As staff, I want every answer grouped under its teacher-created prompt with student names so that reviewing feedback is efficient.

**Acceptance criteria**

- Structured prompts show aggregate charts and individual responses.
- Written prompts list every response with its student.
- Filters and raw-data exports preserve form and student attribution.

#### C2. Submission invalidation

As an Instructor, I want to invalidate a non-qualifying submission so that it does not earn bonus credit.

**Acceptance criteria**

- Student Assistants can flag but not finalize invalidity.
- Instructors can confirm a flag or invalidate directly.
- A reason is required and visible to the student.
- Invalidity removes the form's credit and is fully audit logged.

#### C3. Per-long-exam bonus progress

As a student, I want to see my valid feedback count for each long exam so that I know whether I met the requirement.

**Acceptance criteria**

- Each bonus period has its own requirement and included forms.
- Each valid form contributes at most one credit.
- Students see counted and invalid submissions and invalidity reasons.
- Instructors can export a per-student and per-form breakdown.

### Epic D — Question triage and backlog

#### D1. Separate question records

As a student, I want to submit multiple separate questions in one feedback form so that each may be handled independently.

**Acceptance criteria**

- Every added question creates a separate record.
- The question remains linked to its form submission and student.
- Students initially see `Received`.

#### D2. Question Inbox

As staff, I want to see all submitted questions with student names and triage actions so that I can decide what to answer.

**Acceptance criteria**

- Inbox filters include form, period, topic, status, and student.
- `Will Not Answer` is never revealed to the asker.
- Triage actions are audit logged.

#### D3. Instructor-confirmed backlog

As staff, I want a private list of questions we intend to answer so that ownership and priority are clear.

**Acceptance criteria**

- Student Assistants can recommend backlog changes.
- Only an Instructor confirms addition/removal.
- Backlog items support topic, priority, assignee, source, and target date.

#### D4. Merge related questions

As staff, I want to merge duplicate questions so that one answer can serve multiple students.

**Acceptance criteria**

- Originals remain unchanged and individually attributable.
- Every linked asker is notified when the shared answer is published.
- Unmerging does not lose original question data.

### Epic E — Private and public answers

#### E1. Private answer and follow-up

As staff, I want to answer one student privately so that personal or narrow concerns are not announced to the class.

**Acceptance criteria**

- Instructors and Student Assistants can send manual private answers.
- Only the asker and course staff can see the thread.
- The student may send a linked private follow-up.

#### E2. Anonymized public answer

As staff, I want to publish a reworded question and answer so that the whole class benefits without exposing the asker.

**Acceptance criteria**

- The public question may be edited without changing the private original.
- No asker identity or identifying metadata is exposed to students.
- Student Assistant drafts require Instructor approval.
- Linked askers see their original-to-published relationship.

#### E3. Searchable Q&A archive

As a student, I want to search previous public answers so that I can find answers without asking again.

**Acceptance criteria**

- Only enrolled course members can access the archive.
- Search and filters cover topic, date, form, and bonus period.
- Updated answers show a timestamp and retain version history.

### Epic F — Operations

#### F1. Email notifications

As a course member, I want relevant email reminders and answer notifications so that I do not need to keep checking the site.

#### F2. Exports

As an Instructor, I want raw-response, bonus, and summary exports so that records can be reviewed and submitted elsewhere.

#### F3. Course archive and clone

As an Instructor, I want to archive a finished course and clone its templates/settings so that a new semester starts cleanly without losing history.

## 8. Post-pilot required stories

### P1. Legacy question import

Support:

- Typst files
- CSV/XLSX feedback-sheet exports
- Manual copy-paste
- Import preview and field mapping
- Existing question-answer pairs
- Answered and unanswered items
- Anonymous legacy source by default, with optional preservation of a reliable identifier

Imported records first enter a private review area. Confirmed questions move into the Question Backlog; existing answer pairs become drafts requiring staff review before publication.

### P2. Reactions and moderated comments

Published Q&A entries gain reactions and public course comments.

Rules:

- Commenters are anonymous to classmates but identifiable to staff.
- Comments require staff approval before publication.
- Staff may lock discussion while leaving existing approved comments visible.
- Moderation actions are audit logged.

### P3. AI assistance — parked

Potential later capabilities include answer drafting, teacher-style adaptation, and fact-checking. No AI output may be sent or published without explicit Instructor approval. Detailed AI requirements must be designed only after the human workflow has been validated.

## 9. Conceptual data model

| Entity | Purpose |
| --- | --- |
| User | Google-authenticated identity |
| PlatformRole | Identifies users permitted to act as Instructors |
| Course | Semester-specific course space |
| CourseMembership | User's Instructor, Student Assistant, or Student role |
| RosterEntry | Imported student identity and enrollment metadata |
| AccountClaim | Links a Google account to a roster entry with review state |
| FeedbackTemplate | Reusable form definition |
| RecurrenceSchedule | Automatic form-release configuration |
| FormInstance | Immutable released snapshot with deadline |
| FormPrompt | Teacher-created question inside an instance |
| Submission | One student's response to one form |
| PromptResponse | Student answer to a teacher-created prompt |
| StudentQuestion | Individually triaged question from a submission |
| BonusPeriod | Long-exam-specific feedback requirement |
| SubmissionValidity | Valid/invalid decision and reason |
| BacklogItem | Instructor-confirmed question to answer |
| QuestionLink | Duplicate/related link between originals and a shared item |
| PrivateThread | Private answer and follow-up conversation |
| PublicQAEntry | Anonymized displayed question and public answer |
| PublicQARevision | Version history for published content |
| EmailEvent | Notification request and delivery state |
| AuditEvent | Actor, action, target, timestamp, and reason |

## 10. State rules

### Form instance

`Scheduled → Open → Closed → Archived`

### Submission

`Draft → Submitted → Locked`

Validity is a separate dimension: `Valid`, `Flagged`, or `Invalid`.

### Student question

Internal: `Pending → Answered` or `Pending → Will Not Answer`  
Student-visible: `Received → Answered Privately/Publicly`

### Backlog item

`Recommended → Confirmed → Assigned → Drafting → Awaiting Approval → Answered`

A simple UI may hide intermediate states while retaining them internally for collaboration.

### Public Q&A

`Draft → Awaiting Approval → Published → Updated/Unpublished`

## 11. Security, privacy, and integrity requirements

- Every read and write is authorized by course membership and role on the server.
- Student identities never appear in the student-facing public Q&A payload.
- Original questions and public rewordings are stored separately.
- Bonus validity, publication, roster claims, role changes, and exports are audit logged.
- Rich content is sanitized to prevent script injection.
- Student numbers are encrypted or otherwise protected at rest according to deployment capabilities.
- Export endpoints are Instructor-only and generate short-lived files.
- Course data is not reused to train external AI systems in the MVP.
- Archived courses become read-only except for authorized export and restoration operations.
- The UI must clearly distinguish public content from staff-only notes before sending.

## 12. Non-functional requirements

- Mobile-friendly student forms and dashboards
- Keyboard-accessible form builder and response workflow
- Course timezone used consistently for schedules and deadlines
- Idempotent scheduled releases and email jobs
- Safe retry behavior that does not duplicate forms, answers, or credit
- Searchable audit trail for sensitive actions
- Pagination and filtering for large response/question lists
- Regular backups and tested restoration procedure
- Useful empty, loading, error, and permission-denied states

## 13. Recommended implementation phases

### Phase 0 — Foundation

- Google authentication
- Role and course authorization
- Instructor course creation
- CRS roster parser and account claiming
- Audit-event foundation

### Phase 1 — Feedback collection

- Template builder
- Recurring schedules
- Form snapshots and deadlines
- Student drafts/submissions/edits
- Email release and reminder notifications

### Phase 2 — Review and bonus records

- Response Analysis dashboard
- Validity flags and Instructor decisions
- Long-exam bonus periods and student progress
- CSV/XLSX and PDF exports

### Phase 3 — Question workflow

- Individual student questions
- Question Inbox
- Instructor-confirmed backlog
- Assignment, priority, tags, and duplicate merging

### Phase 4 — Answer delivery

- Private answers and follow-ups
- Public rewording and Instructor approval
- Searchable course Q&A archive
- Version history and email notifications

### Pilot exit criteria

The core pilot is ready when one real course can:

1. Import its roster and link student accounts safely.
2. Run at least two scheduled feedback cycles without manual data repair.
3. Correctly calculate per-long-exam valid counts, including invalidations.
4. Triage questions into `Will Answer` and `Will Not Answer` without leaking internal decisions.
5. Send private answers and publish anonymized answers with correct permissions.
6. Export bonus and response records that reconcile with the website.
7. Preserve an audit trail for every sensitive workflow.

### Phase 5 — Required post-pilot stories

- Legacy import (`P1`)
- Reactions and moderated comments (`P2`)

### Phase 6 — Optional future research

- AI assistance (`P3`), only after a separate privacy, accuracy, cost, and approval design

## 14. Deferred decisions

These do not block core product planning but must be chosen before implementation reaches the affected area:

- Exact method for granting the initial platform-level Instructor role
- Exact school Google domain(s)
- Automatic account-name match threshold and normalization rules
- Email provider and reminder timing
- Default form release/deadline schedule
- Exact enrollment-status mapping for every CRS code
- Data-retention duration after course archival
- Deployment, hosting, database, and backup stack