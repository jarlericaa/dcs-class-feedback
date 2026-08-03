# Initial QA Report — Teacher and Student Experiences

**Status:** Initial observations frozen before remediation<br>
**Test date:** 2026-08-03<br>
**Scope:** Implemented teacher and student MVP workflows<br>
**Data:** Repository-provided synthetic local seed only; account identifiers and credentials are intentionally omitted

## 1. Executive summary

The implemented core is functionally strong and its highest-risk privacy and authorization invariants passed both database integration tests and Chromium exploration. Three reproducible defects remain before release: two medium-priority interaction/accessibility defects and one low-priority network/cosmetic defect. No critical or high-severity security, privacy, corruption, or workflow-blocking defect was reproduced.

Initial disposition:

| Result | Count / summary |
|---|---|
| Automated unit tests | **41 passed, 0 failed** |
| Automated integration tests | **114 passed, 0 failed** |
| Build/lint/typecheck | **Passed** when executed sequentially |
| Chromium exploratory assertions | Core journey: **21 passed, 1 confirmed product failure, 2 phase-replay blocks**; post-flow matrix: **34 passed, 0 product failures, 2 phase-replay blocks** |
| Confirmed defects | **3** — 0 critical, 0 high, 2 medium, 1 low |
| Blocked scenarios | Production Google OAuth and production deployment behavior; see §7 |
| Unimplemented/partial confirmed surfaces | Merge UI, match-correction UI, generated-cycle question editing, live-submission-to-backlog UI; see §7 |

The core journey was executed across sequential browser phases because account confirmation and one-submission-only behavior intentionally change the synthetic account's state. “Phase-replay blocked” means an earlier browser phase completed the scenario and made it non-repeatable without destructive fixture reset; it does not mean the original scenario was untested.

## 2. Environment and commands

### Environment

| Item | Value |
|---|---|
| Host | Ubuntu under WSL, repository workspace |
| Node / npm | Node 24.16.0 / npm 11.13.0 |
| Application | Next.js 15.5.20 development server on localhost |
| Database | PostgreSQL 16 development and isolated test containers via Docker Compose |
| Browser | Chromium 150.0.7871.187, isolated headless profile |
| Desktop viewport | 1440 × 1000 CSS px |
| Mobile viewport | 390 × 844 CSS px, device scale factor 3, touch emulation |
| Timezone | Repository-configured institution timezone; value not reproduced here |

### Commands executed

```text
docker compose up -d
npm run db:migrate
DATABASE_URL=<isolated-test-database> npm run db:migrate
npm run db:seed
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run dev
```

Additional local Chromium/CDP scripts in `/tmp` drove the UI, inspected the accessibility tree, checked viewport overflow and target sizes, and captured console/network events. Aggregate sanitized results are in [browser-results.json](artifacts/initial/browser-results.json) and [postflow-results.json](artifacts/initial/postflow-results.json).

One concurrent baseline invocation of `npm run typecheck` overlapped `npm run build` and temporarily reported missing generated `.next/types` files. A sequential rerun passed. This was a test-orchestration artifact, not classified as a repository defect.

Two simultaneous `next dev` processes briefly caused stale server-action identifiers. Testing stopped, the duplicate process and generated cache were isolated, and every affected mutation was repeated against one clean server. Those stale-build errors are excluded from product results.

## 3. Risk-based test plan and execution

| Risk area and scenarios | Classification | Result |
|---|---|---|
| Authentication; anonymous redirects; seeded teacher/student login; pending identity state | Both | Passed with local dev auth; production Google OAuth blocked |
| Role separation; direct URL access; student-to-staff denial; platform-admin no implicit content access | Both | Passed |
| Resource-scoped authorization; cross-student, cross-section, cross-course reads and writes | Both | Passed; browser cross-section checks plus integration authz/catalog tests |
| Account match candidate creation; no automatic verification; teacher confirmation | Both | Passed |
| Weekly cycle state, open window, required/optional questions, supported answer shapes | Both | Passed except QA-001 |
| Server-side validation, typed-value preservation, invalid/tampered values | Both | Passed except QA-001 invalid-state announcement |
| One submission per student/section/cycle; duplicate prevention; no post-submit edit; deadline rejection | Both | Passed; duplicate/deadline races primarily integration-tested |
| Teacher queue/detail, immutable original wording, review state | Both | Passed |
| Validity change and reason; immediate participation removal/restoration; student invisibility | Both | Passed |
| Private reply visibility and cross-student isolation | Both | Passed |
| Public rewording, anonymity warning/acknowledgment, publication, source linking, archive isolation | Both | Privacy behavior passed; QA-002 loses draft values at warning |
| Merged sources and scheduled publication retry/idempotency | Automated | Service integration tests passed; merge browser UI unimplemented |
| Derived participation, active-student totals, three staff-only CSVs, CSV injection protection | Both | Passed; export contents/access covered by integration tests and rendered links |
| Loading, empty, validation-error, success, unauthorized, closed/submitted, and no-result states | Both | Passed where implemented; skeleton loading state unimplemented by design |
| Semantic landmarks, headings, accessible names, error associations, keyboard order/focus, skip link | Exploratory | Passed except QA-001 |
| Contrast scan on visible mobile student content | Exploratory | Passed computed WCAG thresholds |
| Desktop/mobile overflow, collapsible navigation, readability, touch targets | Exploratory | Passed at tested viewports |
| Browser console, failed requests, and server logs | Exploratory | No clean-run application exceptions/5xx; QA-003 favicon 404 |
| Staff operations routes: review, publications, matches, import, participation, backlog, setup, audit | Exploratory | All rendered without application/server error; no desktop overflow |

## 4. Passed scenarios

- An unconfirmed signed-in account saw an explicit pending state and could not reach a student form, another section archive, or staff review by direct URL.
- The match appeared as a candidate awaiting teacher action; confirmation enabled only the enrolled section.
- A confirmed student saw the open cycle, received server-returned required-field errors, retained typed text, completed the form once, and could not edit or submit it again through the UI.
- The teacher saw the response and immutable original wording, sent a private reply, and changed validity with immediate participation recalculation.
- The student saw the private reply but not validity, invalidation reason, internal disposition, drafts, or audit data.
- Publication required explicit anonymity acknowledgment. Once re-entered and acknowledged, the reworded question and answer appeared in the section archive without source wording, source identity, or student number.
- The asker's own history showed the internally source-linked “Answered” state and reworded public text.
- Student access to a second section remained denied after confirmation; the second section was absent from student navigation.
- All implemented staff routes rendered at desktop width. The empty section review showed a designed empty state.
- Staff and student mobile views had no horizontal document overflow, exposed keyboard-accessible `<details>/<summary>` navigation, met the WCAG 24 px minimum target scan, and retained readable content.
- Tested mobile history controls had accessible names. Tab traversal exposed a visible focus indicator and included the skip link.
- Lint, sequential type checking, production build, all unit tests, and all integration tests passed.

## 5. Defects

### QA-001 — Required radio groups do not expose an invalid state

| Field | Detail |
|---|---|
| Severity / priority | **Medium / P1** |
| Role / page / feature | Student · current weekly form · required-field validation/accessibility |
| Preconditions | Confirmed synthetic student; open cycle containing required multiple-choice and linear-scale questions |
| Sanitized data | Optional text populated with a unique non-identifying QA marker; required choice groups left empty |
| Reproduction | 1. Open the current weekly form. 2. Enter optional text. 3. Leave the required choice and scale groups unanswered. 4. Submit. 5. Inspect the rendered groups and accessibility attributes. |
| Expected | The submission is rejected; values remain; each failed group is associated with its error and programmatically exposes an invalid state to assistive technology. |
| Actual | The rejection, summary, inline messages, and value preservation work. Each group references its error using `aria-describedby`, but neither the group nor its radio controls has `aria-invalid="true"`. |
| Evidence | [browser-results.json](artifacts/initial/browser-results.json), browser assertion `required-fields-inline`; pre-remediation screenshot was captured but withheld because the authenticated chrome included account identifiers. |
| Likely root cause | `WeeklyForm` applies `aria-invalid` to text/select/date controls but only `aria-describedby` to `role="group"` choice and scale containers. |
| Recommended fix | Apply `aria-invalid` to every failed `role="group"` (multiple choice, checkboxes, scale, yes/no) and re-test the accessibility tree. |
| Initial status | **Open / reproducible** |

### QA-002 — Anonymity warning discards the teacher's drafted public answer

| Field | Detail |
|---|---|
| Severity / priority | **Medium / P1** |
| Role / page / feature | Teacher · review detail · public-answer composition |
| Preconditions | Reviewed response with a student-originated item; teacher has draft/publish permission |
| Sanitized data | A generalized public question and a short synthetic answer with no identifying content |
| Reproduction | 1. Enter a reworded public question. 2. Enter the public answer. 3. Leave “I have checked the public wording” unchecked. 4. Select “Publish to this section.” |
| Expected | Publication is blocked and the teacher's reworded question and answer remain available for correction/acknowledgment. |
| Actual | Publication is correctly blocked and a warning appears, but the redirect resets the public question to the original student wording and clears the answer. The teacher must recreate both fields. |
| Evidence | [browser-results.json](artifacts/initial/browser-results.json), assertion `anonymity-warning-preserves-draft`. Privacy was not breached because nothing published until the fields were re-entered and acknowledged. |
| Likely root cause | The server action redirects before writing a draft in order to avoid orphan/duplicate drafts; the uncontrolled form values are therefore lost on the new request. |
| Recommended fix | Prevent the unacknowledged publish in the client while preserving form state, retain the service-level acknowledgment check as the authoritative backstop, and show an accessible inline warning/focus target. |
| Initial status | **Open / reproducible** |

### QA-003 — Missing favicon generates a browser network error

| Field | Detail |
|---|---|
| Severity / priority | **Low / P3** |
| Role / page / feature | All roles · all pages · application metadata/network cleanliness |
| Preconditions | Clean browser profile; local application running |
| Sanitized data | None |
| Reproduction | 1. Open `/signin` in Chromium. 2. Inspect browser network/log entries. 3. Request `/favicon.ico` directly. |
| Expected | The application icon request returns a valid image response and creates no browser error. |
| Actual | `/favicon.ico` returns HTTP 404 and Chromium logs “Failed to load resource.” |
| Evidence | Clean direct request returned `404`; initial Chromium console/network capture reproduced the same response. |
| Likely root cause | No App Router icon/favicon asset exists under `src/app`. |
| Recommended fix | Add a small repository-native application icon through Next.js metadata conventions and verify a 200 response. |
| Initial status | **Open / reproducible** |

## 6. Existing automated coverage and gaps

### Existing coverage

- Unit tests cover name normalization, answer validation, environment safety including production dev-auth disablement, cycle windows, and roster CSV parsing.
- Integration tests cover authorization and resource scoping; catalog/staff permissions; schedules and retry behavior; form validation and uniqueness; matching and correction services; roster reconciliation; review, validity, private/public responses, source links and merge behavior; participation and exports; operations read models; anonymity enforcement; timezone conversion; and CSV formula neutralization.

### Meaningful gaps

- No checked-in browser end-to-end harness; the highest-risk teacher→student journey can regress while unit/integration tests remain green.
- No automated DOM/accessibility regression test for grouped question errors (QA-001), keyboard focus, mobile overflow, or accessible names.
- No automated browser regression for preserving public-answer fields when acknowledgment or other validation blocks submission (QA-002).
- No browser-level race test that submits the same cycle from two tabs; database/service coverage exists.
- No browser-level scheduler/poller timing test for auto-open, auto-close, scheduled publish, and surfaced retry failure; service integration coverage exists.
- No systematic coverage instrumentation/threshold is configured, so this review reports scenario coverage rather than line/branch percentages.
- CSV download bytes and headers are integration-tested; only the rendered download links and authorization surface were explored in Chromium.

## 7. Blocked, unimplemented, and limited scenarios

- **Blocked:** Real Google OAuth, university-domain behavior at Google's screens, and OAuth callback configuration were not executed because local OAuth credentials are intentionally absent. Local development auth was used; its production disablement passed unit coverage.
- **Blocked:** Production deployment, TLS, reverse-proxy headers, retention/backups, and institutional operational controls were outside this local repository test.
- **Blocked:** Real student data and external services were intentionally not used.
- **Unimplemented/partial:** Browser merge UI; correction of an already-confirmed match in the UI; generated-cycle question editing; live-submission move/copy into backlog; standalone course backlog route. Service coverage exists for several of these, as documented in `CURRENT_STATE.md`.
- **Unimplemented by design:** Loading skeletons/optimistic states, browser E2E suite, notifications, AI, unpublish, course materials, attachments, LMS, and native clients.
- **Open decision limitations:** D2/D3/D4/D5/D7/D8/D10/D13 remain provisional or require owner/institution sign-off. Testing verified the implemented provisional behavior but does not promote it to a confirmed requirement.
- Chromium was tested at two representative viewports, not across every device density, browser engine, localization, zoom level, reduced-motion preference, or forced-colors mode.

## 8. Residual risk before remediation

The privacy/security core appears suitable for continued pilot hardening, but QA-001 impairs assistive-technology error recognition and QA-002 risks teacher work loss at a critical privacy checkpoint. QA-003 adds avoidable console/network noise. Release readiness is therefore **conditional / not yet ready for an accessibility-conscious pilot** until the three confirmed defects are fixed and the affected journeys are re-run. Production use also remains blocked on the repository's documented owner/institution decisions and OAuth/operations checklist.
