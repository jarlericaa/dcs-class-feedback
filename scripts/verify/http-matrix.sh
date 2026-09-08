#!/usr/bin/env bash
# Manual verification matrix for the staff and student routes.
#
# Drives the running app over HTTP as seeded users and asserts on the rendered
# HTML, including the negative-authorization cases. Verification only: nothing
# is invented, every account comes from `npm run db:seed`.
#
# Requires DEV_AUTH_ENABLED=true and a seeded database:
#   npm run db:seed && npm run dev
#   bash scripts/verify/http-matrix.sh
#
# Override the base URL when the dev server picked a different port:
#   BASE=http://localhost:3002 bash scripts/verify/http-matrix.sh
#
# The seeded student's UP email is on the seeded class list, so they have access
# from their first sign-in — there is no claim or confirmation step to wait for.
set -u
BASE="${BASE:-http://localhost:3000}"
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT

pass=0; fail=0
check() { # check <label> <condition-result>
  if [ "$2" = "0" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1"; fail=$((fail+1)); fi
}

login() { # login <email> <jarfile>
  local email="$1" jar="$2"
  rm -f "$jar"
  local csrf
  csrf=$(curl -s -c "$jar" "$BASE/api/auth/csrf" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
  curl -s -o /dev/null -b "$jar" -c "$jar" -X POST \
    -d "email=$email" -d "csrfToken=$csrf" -d "callbackUrl=$BASE/" -d "json=true" \
    "$BASE/api/auth/callback/dev-login"
}

get() { curl -s -b "$1" -L "$BASE$2"; }
code() { curl -s -o /dev/null -w '%{http_code}' -b "$1" "$BASE$2"; }

echo "== anonymous =="
# The root is a finished entry screen rather than a redirect, so an anonymous
# visitor lands on something that explains the product and offers sign-in.
anon=$(curl -s "$BASE/")
check "/ serves the entry screen with a way in" \
  "$(grep -qE 'Sign in|sign in' <<<"$anon" && echo 0 || echo 1)"
check "/ shows an anonymous visitor no class content" \
  "$(grep -qv 'Juan Dela Cruz' <<<"$anon" && echo 0 || echo 1)"
body=$(curl -s "$BASE/signin")
check "sign-in states the archive is not internet-public" \
  "$(grep -qc 'public internet' <<<"$body" && echo 0 || echo 1)"
check "sign-in offers development sign-in when enabled" \
  "$(grep -q 'Development sign in' <<<"$body" && echo 0 || echo 1)"

echo "== teacher =="
TJAR="$DIR/teacher.jar"; login teacher@up.edu.ph "$TJAR"
home=$(get "$TJAR" /)
# The board is made of COURSES now: a section is who receives a form, not a thing
# a teacher works on, so the dashboard links to the course workspace.
check "teacher dashboard renders the courses they teach" \
  "$(grep -qE 'Open forms|Review responses|No courses yet' <<<"$home" && echo 0 || echo 1)"
# Pick the course that actually has a form, so the assertions below have
# something real to check. A teacher may own several.
COURSE=""
for cid in $(get "$TJAR" /teach/courses | grep -oE '/teach/courses/[0-9a-f-]{36}' | cut -d/ -f4 | sort -u); do
  if get "$TJAR" "/teach/courses/$cid" | grep -qE "/teach/courses/$cid/forms/[0-9a-f-]{36}"; then
    COURSE="$cid"; break
  fi
  [ -z "$COURSE" ] && COURSE="$cid"
done
# The class-list card links to the section ROOT and nothing else (issue #11):
# the four-column grid of the section's own destinations used to live here and
# duplicated the contextual column beside it, so `/import` is no longer on this
# page to key off.
SECTION=$(get "$TJAR" "/teach/courses/$COURSE/sections" | grep -oE '/teach/sections/[0-9a-f-]{36}' | head -1 | cut -d/ -f4)
FORM=$(get "$TJAR" "/teach/courses/$COURSE" | grep -oE "/teach/courses/$COURSE/forms/[0-9a-f-]{36}" | head -1 | rev | cut -d/ -f1 | rev)
echo "  (course=$COURSE section=$SECTION form=$FORM)"
check "course id discovered from My courses" "$([ -n "$COURSE" ] && echo 0 || echo 1)"
check "section id discovered from the course's class lists" "$([ -n "$SECTION" ] && echo 0 || echo 1)"
check "form id discovered from the course workspace" "$([ -n "$FORM" ] && echo 0 || echo 1)"

for path in "/teach/courses" "/teach/courses/$COURSE" \
            "/teach/courses/$COURSE/responses" "/teach/courses/$COURSE/sections" \
            "/teach/courses/$COURSE/forms/new" "/teach/courses/$COURSE/forms/$FORM" \
            "/teach/sections/$SECTION/setup" \
            "/teach/sections/$SECTION/roster" \
            "/teach/sections/$SECTION/participation" "/teach/sections/$SECTION/publications" \
            "/teach/sections/$SECTION/backlog" "/teach/sections/$SECTION/audit" \
            "/sections/$SECTION/qa"; do
  check "teacher GET $path -> 200" "$([ "$(code "$TJAR" "$path")" = "200" ] && echo 0 || echo 1)"
done

course=$(get "$TJAR" "/teach/courses/$COURSE")
# The <h1> is the course CODE; the title is metadata beneath it.
code=$(grep -oE '<h1[^>]*>[^<]+</h1>' <<<"$course" | head -1 | sed -E 's/<[^>]+>//g')
echo "  (course heading=\"$code\")"
check "course workspace leads with the course code, not the title" \
  "$([ -n "$code" ] && [ "${#code}" -le 24 ] && echo 0 || echo 1)"
check "course workspace makes forms the work objects" \
  "$(grep -qE 'New form|No forms yet' <<<"$course" && echo 0 || echo 1)"
check "course workspace keeps class lists as a separate destination" \
  "$(grep -q 'Class lists' <<<"$course" && echo 0 || echo 1)"

sectionsPage=$(get "$TJAR" "/teach/courses/$COURSE/sections")
check "class-list card enters the section" \
  "$(grep -qE "/teach/sections/$SECTION\"" <<<"$sectionsPage" && echo 0 || echo 1)"
# Issue #11.1: the card no longer reprints the contextual column beside it.
check "class-list card no longer duplicates the section nav" \
  "$(grep -qv 'section-links__heading' <<<"$sectionsPage" && echo 0 || echo 1)"
check "class-list card carries no destination list of its own" \
  "$(grep -qv 'section-links__list' <<<"$sectionsPage" && echo 0 || echo 1)"

# Issue #11.2/#11.3: inside a section, a reader with course standing keeps the
# course strip above the section's own groups, and Weekly review leads them.
insideSection=$(get "$TJAR" "/teach/sections/$SECTION/roster")
check "section keeps the course strip for course staff" \
  "$(grep -qE "/teach/courses/$COURSE/responses" <<<"$insideSection" && echo 0 || echo 1)"
check "section names the course strip so it is not an unlabelled row" \
  "$(grep -q 'Course' <<<"$insideSection" && echo 0 || echo 1)"
# Read the group headings themselves, in document order — grepping the whole
# page would also match the page title and the RSC payload.
groupOrder=$(grep -oE '<p class="ws-subnav__group-heading">[^<]*</p>' <<<"$insideSection" \
  | sed -E 's/<[^>]+>//g' | tr '\n' '|')
echo "  (section groups=$groupOrder)"
check "the course strip leads, then Forms, Weekly review, then Class list" \
  "$(grep -q '^Course|Forms|Weekly review|Class list|' <<<"$groupOrder" && echo 0 || echo 1)"

review=$(get "$TJAR" "/teach/courses/$COURSE/responses")
check "course response inbox renders" \
  "$(grep -q 'Responses' <<<"$review" && echo 0 || echo 1)"
# Issue #10: the review view renders the OCCURRENCE's authored questions, with
# their real prompts and types, through the one sanctioned renderer.
check "review renders an authored prompt as maths, not as its source" \
  "$(grep -q 'class="katex"' <<<"$review" && echo 0 || echo 1)"
check "review renders a prompt's help text as markup" \
  "$(grep -qE 'post__askdesc' <<<"$review" && echo 0 || echo 1)"
check "review names a question the student left blank" \
  "$(grep -q 'left this optional question blank' <<<"$review" && echo 0 || echo 1)"
check "review keeps the compact measurement rows" \
  "$(grep -q 'class="meter__label"' <<<"$review" && echo 0 || echo 1)"
# Authored order: the seeded form asks the two measurements first, so the first
# meter label is the first authored prompt rather than whatever sorted first.
firstMeter=$(grep -oE '<span class="meter__label">[^<]*</span>' <<<"$review" \
  | head -1 | sed -E 's/<[^>]+>//g')
echo "  (first meter=\"$firstMeter\")"
check "the first measurement is the first authored question" \
  "$(grep -q 'How was this week' <<<"$firstMeter" && echo 0 || echo 1)"
# Issue #9: nothing is hidden before hydration — the clamp is applied by the
# toggle's own component, so the server sends the whole answer.
check "a long answer is served whole, not clamped server-side" \
  "$(grep -qv 'post__words--clamped' <<<"$review" && echo 0 || echo 1)"
check "the long answer's text is actually present" \
  "$(grep -q 'when to unroll a recurrence' <<<"$review" && echo 0 || echo 1)"

# Issue #6: per-reader read state. A fresh seed has read nothing, so every
# seeded response starts in the unread pile.
check "review offers a read-state filter" \
  "$(grep -q 'id="feed-seen"' <<<"$review" && echo 0 || echo 1)"
check "review offers an Unread-only option" \
  "$(grep -q 'Unread only' <<<"$review" && echo 0 || echo 1)"
check "a freshly seeded week starts unread" \
  "$(grep -q 'feedbar__unread' <<<"$review" && echo 0 || echo 1)"
check "each unread post is marked as such" \
  "$(grep -q 'post--unread' <<<"$review" && echo 0 || echo 1)"
check "each post offers a per-response read toggle" \
  "$(grep -q '>Mark as read<' <<<"$review" && echo 0 || echo 1)"
# The button's label interleaves a JSX expression, so React emits
# `Mark <!-- -->2<!-- --> as read` and a plain phrase match would miss it. The
# form's own hidden field is the stable hook.
check "the column offers a mark-all escape hatch" \
  "$(grep -q 'feedbar__markall' <<<"$review" && grep -q 'name="ids"' <<<"$review" && echo 0 || echo 1)"
# The filter shows only unread posts. Counting posts by their anchor id, and
# `grep -o` rather than `-c`, because the rendered HTML is one long line so
# counting LINES always returns 1 — and a class name appears twice per post
# (once in the markup, once in the streamed payload), so classes cannot be
# counted either.
posts() { grep -o 'id="r-[0-9a-f-]\{36\}"' | sort -u | wc -l | tr -d ' '; }
unreadView=$(get "$TJAR" "/teach/courses/$COURSE/responses?seen=unread")
unreadShown=$(posts <<<"$unreadView")
allShown=$(posts <<<"$review")
echo "  (posts: all=$allShown, unread-only=$unreadShown)"
# A fresh seed has read nothing, so the two views agree — and both are real.
check "the Unread-only filter shows the unread posts" \
  "$([ "$unreadShown" = "$allShown" ] && [ "$unreadShown" != "0" ] && echo 0 || echo 1)"
# The invariant that holds at ANY read state: nothing in the unread view is
# already read, so no post there offers the un-read control.
check "nothing in the Unread-only view is already read" \
  "$(grep -qv '>Mark as unread<' <<<"$unreadView" && echo 0 || echo 1)"

check "the old per-section review URL still lands somewhere real" \
  "$([ "$(code "$TJAR" "/teach/sections/$SECTION/review")" = "307" ] && echo 0 || echo 1)"
check "the old templates URL still lands somewhere real" \
  "$([ "$(code "$TJAR" "/teach/courses/$COURSE/templates")" = "307" ] && echo 0 || echo 1)"

form=$(get "$TJAR" "/teach/courses/$COURSE/forms/$FORM")
check "form page separates audience, delivery and occurrences" \
  "$(grep -q 'Who gets it, and when' <<<"$form" && echo 0 || echo 1)"
check "form page offers the four delivery modes" \
  "$(grep -q 'Open manually' <<<"$form" && echo 0 || echo 1)"
INSTANCE=$(grep -oE "/instances/[0-9a-f-]{36}" <<<"$form" | head -1 | cut -d/ -f3)
if [ -n "$INSTANCE" ]; then
  inst=$(get "$TJAR" "/teach/courses/$COURSE/forms/$FORM/instances/$INSTANCE")
  check "the per-occurrence editor states its scope in one line" \
    "$(grep -qE 'Changes apply to .* only' <<<"$inst" && echo 0 || echo 1)"
  check "the per-occurrence editor offers a student preview" \
    "$(grep -q 'Preview as student' <<<"$inst" && echo 0 || echo 1)"
else
  check "an occurrence was found to edit" 1
fi

roster=$(get "$TJAR" "/teach/sections/$SECTION/roster")
check "class list shows the imported students" \
  "$(grep -q 'Juan Dela Cruz' <<<"$roster" && echo 0 || echo 1)"
check "class list shows the UP email that grants access" \
  "$(grep -q 'student@up.edu.ph' <<<"$roster" && echo 0 || echo 1)"
# Issue #12: the WHOLE student number, in the format it is written in, for the
# reader who holds viewStudentIdentities — and the mask is gone.
check "class list shows the whole student number" \
  "$(grep -q '2026-00001' <<<"$roster" && echo 0 || echo 1)"
check "class list no longer masks it to a tail" \
  "$(grep -qv 'Student number ending' <<<"$roster" && echo 0 || echo 1)"
# The two jammed figures became one phrase: "2 students (2 signed in)".
# React separates adjacent text nodes with an empty HTML comment, so those are
# stripped before matching — otherwise the pattern is reading markup artefacts
# rather than the sentence a teacher sees.
rosterText=$(sed 's/<!-- *-->//g' <<<"$roster")
check "the count reads as one phrase" \
  "$(grep -qE '<strong>[0-9]+</strong> students? \(<strong>[0-9]+</strong> signed in\)' <<<"$rosterText" && echo 0 || echo 1)"
check "the two jammed tallies are gone" \
  "$(grep -qv 'on the list' <<<"$roster" && echo 0 || echo 1)"
# The import is a modal on THIS page, not a destination.
check "class list carries the import control itself" \
  "$(grep -q 'Import the class list' <<<"$roster" && echo 0 || echo 1)"
check "class list links nowhere for the import" \
  "$(grep -qv "/teach/sections/$SECTION/import" <<<"$roster" && echo 0 || echo 1)"
check "the old import URL forwards to the class list (307)" \
  "$([ "$(code "$TJAR" "/teach/sections/$SECTION/import")" = "307" ] && echo 0 || echo 1)"
check "the section column offers no Import row" \
  "$(grep -qv '>Import<' <<<"$roster" && echo 0 || echo 1)"
# The whole point of the identity change: this page reports, it does not decide.
check "class list offers no confirm/reject/unlink control" \
  "$(grep -qvE 'Confirm match|Not this student|This is them|Unlink|Account match' <<<"$roster" && echo 0 || echo 1)"
check "class list never shows a name-similarity score" \
  "$(grep -qv 'name similarity' <<<"$roster" && echo 0 || echo 1)"
check "the removed account-matches URL is gone" \
  "$([ "$(code "$TJAR" "/teach/sections/$SECTION/matches")" = "404" ] && echo 0 || echo 1)"
setup=$(get "$TJAR" "/teach/sections/$SECTION/setup")
check "setup exposes the TA permission catalog" \
  "$(grep -q 'Export participation CSVs' <<<"$setup" && echo 0 || echo 1)"
# Delivery moved to the FORM, so section setup keeps only what is genuinely
# per-section: the teaching team and the section's own details.
#
# This assertion used to look for the sentence "Forms are set up on the course".
# That copy no longer exists anywhere in `src/` — it was removed before this
# pass, not by it — so the check was passing on nothing. Replaced with the
# property it was actually protecting: no delivery or schedule control here.
check "setup keeps only what is per-section" \
  "$(grep -q 'Section details' <<<"$setup" && grep -q 'Teaching team' <<<"$setup" && echo 0 || echo 1)"
check "setup offers no delivery or schedule control" \
  "$(grep -qvE 'Every week|Custom schedule|Open manually|Delivery mode' <<<"$setup" && echo 0 || echo 1)"
# Issue #13: the published question is the link to its Q&A entry; the
# live/scheduled stamp is a status marker, not the row's only affordance.
pubs=$(get "$TJAR" "/teach/sections/$SECTION/publications")
check "publication queue renders" \
  "$(grep -q 'Publication queue' <<<"$pubs" && echo 0 || echo 1)"
if grep -q 'Recently published' <<<"$pubs"; then
  check "a recently published question links into the class Q&A" \
    "$(grep -qE "/sections/$SECTION/qa\?selected=" <<<"$pubs" && echo 0 || echo 1)"
else
  echo "  SKIP  nothing published in the seed, so no Recently published row"
fi

# Issue #14: the archive says Anonymous, names the answering staff member, and
# no longer offers the earlier-semesters filter or the trailing explainer.
qa=$(get "$TJAR" "/sections/$SECTION/qa")
check "Q&A no longer offers the earlier-semesters filter" \
  "$(grep -qv 'Carried over from earlier semesters' <<<"$qa" && echo 0 || echo 1)"
check "Q&A no longer prints the trailing anonymity paragraph" \
  "$(grep -qv 'Staff wrote this wording for the whole class' <<<"$qa" && echo 0 || echo 1)"
check "Q&A no longer says 'Asked by a classmate, name not shown'" \
  "$(grep -qv 'Asked by a classmate' <<<"$qa" && echo 0 || echo 1)"
if grep -q 'Answered by' <<<"$qa"; then
  check "Q&A no longer bylines an answer to 'the teaching team'" \
    "$(grep -qv 'Answered by the teaching team' <<<"$qa" && echo 0 || echo 1)"
else
  echo "  SKIP  nothing published in the seed, so no answer byline to read"
fi

# Issue #16: every entry is one sentence, the payload is a named-field diff,
# and the raw shape waits behind a disclosure.
audit=$(get "$TJAR" "/teach/sections/$SECTION/audit")
check "audit history reads as sentences, not action codes" \
  "$(grep -qE '<strong>[A-Z][^<]+ (published|imported|opened|closed|replied|set) ' <<<"$audit" && echo 0 || echo 1)"
check "audit history names the object of a publication" \
  "$(grep -q 'published an answer to' <<<"$audit" && echo 0 || echo 1)"
check "audit history attributes a scheduler row to the system" \
  "$(grep -q 'The system closed a form' <<<"$audit" && echo 0 || echo 1)"
# The privacy rule: a student is named in neither position.
check "audit history does not name the student who submitted" \
  "$(grep -q 'A student submitted a form' <<<"$audit" && echo 0 || echo 1)"
check "audit history offers a named-field diff rather than a JSON blob" \
  "$(grep -q 'audit-diff__row' <<<"$audit" && echo 0 || echo 1)"
check "the raw payload is behind a disclosure" \
  "$(grep -q 'Technical details' <<<"$audit" && echo 0 || echo 1)"
# The four filters, all server-side and all in the URL.
for control in "audit-action" "audit-actor" "audit-from" "audit-to" "audit-scope"; do
  check "audit history offers the $control filter" \
    "$(grep -q "id=\"$control\"" <<<"$audit" && echo 0 || echo 1)"
done
# The action list comes from the ALLOWLIST, not from the visible page: an action
# with no rows in this section is still offered.
check "the action filter lists more than the page contains" \
  "$(grep -q 'Bonus period created' <<<"$audit" && echo 0 || echo 1)"
check "the action filter withholds the platform's own records" \
  "$(grep -qv '>Email sent<' <<<"$audit" && echo 0 || echo 1)"
check "the default view withholds system records" \
  "$(grep -qv 'Email queued' <<<"$audit" && echo 0 || echo 1)"
everything=$(get "$TJAR" "/teach/sections/$SECTION/audit?scope=all")
check "an explicit scope shows the system records too" \
  "$(grep -qE 'The system · Email (sent|queued)|Email sent|Email queued' <<<"$everything" && echo 0 || echo 1)"
# A withheld action inside the default scope is refused, never widened.
refused=$(get "$TJAR" "/teach/sections/$SECTION/audit?action=email.sent")
check "asking for a withheld action shows nothing rather than everything" \
  "$(grep -q 'Nothing matches these filters' <<<"$refused" && echo 0 || echo 1)"
# Dates narrow server-side.
narrowed=$(get "$TJAR" "/teach/sections/$SECTION/audit?from=1999-01-01&to=1999-01-02")
check "a date range with nothing in it says so" \
  "$(grep -q 'Nothing matches these filters' <<<"$narrowed" && echo 0 || echo 1)"
csvcode=$(curl -s -o "$DIR/matrix.csv" -w '%{http_code}' -b "$TJAR" \
  "$BASE/teach/sections/$SECTION/participation/export?report=weekly_matrix")
check "participation CSV downloads (200)" "$([ "$csvcode" = "200" ] && echo 0 || echo 1)"
check "participation CSV has the student-number header" \
  "$(head -1 "$DIR/matrix.csv" | grep -q 'Student number' && echo 0 || echo 1)"

# Issue #15: the page is built around the week and answer filters, and the old
# aggregate figures are gone.
part=$(get "$TJAR" "/teach/sections/$SECTION/participation")
check "participation offers a week selector" \
  "$(grep -q 'id="part-week"' <<<"$part" && echo 0 || echo 1)"
check "participation offers an explicit all-weeks choice" \
  "$(grep -q 'All weeks' <<<"$part" && echo 0 || echo 1)"
check "participation offers a question selector" \
  "$(grep -q 'id="part-question"' <<<"$part" && echo 0 || echo 1)"
check "the section average figure is gone" \
  "$(grep -qvi 'average weeks' <<<"$part" && echo 0 || echo 1)"
check "the participating-students figure is gone" \
  "$(grep -qv 'Participating students' <<<"$part" && echo 0 || echo 1)"
# Defaults to the last week anybody answered, so the page opens on real work.
check "participation opens on a single week, not the whole term" \
  "$(grep -qv 'The whole term' <<<"$part" && echo 0 || echo 1)"
check "the week list is genuinely paginated" \
  "$(grep -q 'class="pagination"' <<<"$part" && echo 0 || echo 1)"

# The week and its first enumerable question, discovered from the page itself.
PWEEK=$(grep -oE '<option value="[0-9a-f-]{36}"' <<<"$part" | head -1 \
  | sed -E 's/.*value="([^"]+)".*/\1/')
pq=$(get "$TJAR" "/teach/sections/$SECTION/participation?week=$PWEEK")
PQUESTION=$(grep -oE 'id="part-question"[^§]*' <<<"$pq" | grep -oE '<option value="[0-9a-f-]{36}"' \
  | head -1 | sed -E 's/.*value="([^"]+)".*/\1/')
echo "  (participation week=$PWEEK question=$PQUESTION)"
check "a week and one of its questions were discovered" \
  "$([ -n "$PWEEK" ] && [ -n "$PQUESTION" ] && echo 0 || echo 1)"

# Issue #15: choosing a question offers its answers; choosing one narrows the
# list and reports each student's answer back.
pa=$(get "$TJAR" "/teach/sections/$SECTION/participation?week=$PWEEK&question=$PQUESTION")
check "choosing a question offers its answers" \
  "$(grep -q 'id="part-answer"' <<<"$pa" && echo 0 || echo 1)"
PANSWER=$(grep -oE 'id="part-answer"[^§]*' <<<"$pa" \
  | grep -oE '<option value="[a-z0-9-]+"' | grep -v 'value=""' | head -1 \
  | sed -E 's/.*value="([^"]+)".*/\1/')
filtered=$(get "$TJAR" "/teach/sections/$SECTION/participation?week=$PWEEK&question=$PQUESTION&answer=$PANSWER")
echo "  (answer=$PANSWER)"
check "filtering by an answer reports what each student said" \
  "$(grep -q 'Their answer' <<<"$filtered" && echo 0 || echo 1)"
check "the filtered view says how many gave that answer" \
  "$(grep -qE 'students? answered' <<<"$filtered" && echo 0 || echo 1)"

# Issue #8: the responder export, one click, in the encoding columns.
rcode=$(curl -s -o "$DIR/responded.csv" -w '%{http_code}' -b "$TJAR" \
  "$BASE/teach/sections/$SECTION/participation/export?report=responders&week=$PWEEK")
check "responder CSV downloads (200)" "$([ "$rcode" = "200" ] && echo 0 || echo 1)"
check "responder CSV carries the encoding columns, in order" \
  "$(head -1 "$DIR/responded.csv" | tr -d '\r' | grep -q '^Student number,Student name,UP email,Submitted at$' && echo 0 || echo 1)"
check "responder CSV carries the whole student number" \
  "$(grep -q '2026-00001' "$DIR/responded.csv" && echo 0 || echo 1)"
ecode=$(curl -s -o "$DIR/everyone.csv" -w '%{http_code}' -b "$TJAR" \
  "$BASE/teach/sections/$SECTION/participation/export?report=responders&week=$PWEEK&include=all")
check "the everyone-or-not variant adds a Responded column" \
  "$([ "$ecode" = "200" ] && head -1 "$DIR/everyone.csv" | grep -q 'Responded,Enrolment' && echo 0 || echo 1)"
xcode=$(curl -s -o "$DIR/responded.xlsx" -w '%{http_code}' -b "$TJAR" \
  "$BASE/teach/sections/$SECTION/participation/export?report=responders&week=$PWEEK&format=xlsx")
check "the responder list also downloads as a spreadsheet" \
  "$([ "$xcode" = "200" ] && head -c 2 "$DIR/responded.xlsx" | grep -q 'PK' && echo 0 || echo 1)"
# The filtered export follows the filter rather than dumping the week.
fcode=$(curl -s -o "$DIR/filtered.csv" -w '%{http_code}' -b "$TJAR" \
  "$BASE/teach/sections/$SECTION/participation/export?report=week&week=$PWEEK&question=$PQUESTION&answer=$PANSWER")
check "the filtered export carries an Answer column" \
  "$([ "$fcode" = "200" ] && head -1 "$DIR/filtered.csv" | tr -d '\r' | grep -q ',Answer$' && echo 0 || echo 1)"
check "a responder export without a week is refused (400)" \
  "$([ "$(code "$TJAR" "/teach/sections/$SECTION/participation/export?report=responders&week=all")" = "400" ] && echo 0 || echo 1)"
check "a responder export for an unknown week is refused (404)" \
  "$([ "$(code "$TJAR" "/teach/sections/$SECTION/participation/export?report=responders&week=00000000-0000-0000-0000-000000000000")" = "404" ] && echo 0 || echo 1)"

echo "== student =="
SJAR="$DIR/student.jar"; login student@up.edu.ph "$SJAR"
shome=$(get "$SJAR" /)
# The seeded roster carries student@up.edu.ph, so this is unconditional now:
# access follows from the email being on the class list, with nothing to claim.
check "rostered student sees forms, not sections" \
  "$(grep -qE 'Fill in form|Review my answers|Nothing open' <<<"$shome" && echo 0 || echo 1)"
check "rostered student sees no claim or confirmation state" \
  "$(grep -qvE 'waiting to be confirmed|could not match you|Claim your place|student number' <<<"$shome" && echo 0 || echo 1)"
check "student navigation carries no claim control" \
  "$(grep -qv 'href="/claim"' <<<"$shome" && echo 0 || echo 1)"
check "/claim no longer serves a claim form" \
  "$(curl -s -b "$SJAR" -L "$BASE/claim" | grep -qv 'Claim your place' && echo 0 || echo 1)"
check "rostered student can open their class section" \
  "$([ "$(code "$SJAR" "/sections/$SECTION")" != "500" ] && echo 0 || echo 1)"
check "rostered student can open the Q&A archive" \
  "$([ "$(code "$SJAR" "/sections/$SECTION/qa")" = "200" ] && echo 0 || echo 1)"
FORMLINK=$(grep -oE '/forms/[0-9a-f-]{36}' <<<"$shome" | head -1)
if [ -n "$FORMLINK" ]; then
  sform=$(get "$SJAR" "$FORMLINK")
  check "the student form names the course code" \
    "$(grep -qE '<h1|panel-title' <<<"$sform" && echo 0 || echo 1)"
  check "the student form never exposes staff-only review state" \
    "$(grep -qvE 'Marked invalid|needs review|Identity hidden' <<<"$sform" && echo 0 || echo 1)"
fi
check "student cannot open the staff response inbox" \
  "$(get "$SJAR" "/teach/courses/$COURSE/responses" | grep -q 'do not have access' && echo 0 || echo 1)"
check "student cannot open the course workspace" \
  "$(get "$SJAR" "/teach/courses/$COURSE" | grep -q 'do not have access' && echo 0 || echo 1)"
check "student cannot open participation" \
  "$(get "$SJAR" "/teach/sections/$SECTION/participation" | grep -q 'do not have access' && echo 0 || echo 1)"
check "student cannot download the participation CSV (403)" \
  "$([ "$(code "$SJAR" "/teach/sections/$SECTION/participation/export?report=weekly_matrix")" = "403" ] && echo 0 || echo 1)"
check "student cannot download the responder list (403)" \
  "$([ "$(code "$SJAR" "/teach/sections/$SECTION/participation/export?report=responders&week=$PWEEK")" = "403" ] && echo 0 || echo 1)"

check "student cannot open the audit history" \
  "$(get "$SJAR" "/teach/sections/$SECTION/audit" | grep -q 'do not have access' && echo 0 || echo 1)"

check "student cannot open platform admin" \
  "$(get "$SJAR" /admin | grep -q 'do not have access' && echo 0 || echo 1)"
check "student cannot open course management" \
  "$(get "$SJAR" /teach/courses | grep -q 'do not have access' && echo 0 || echo 1)"
check "student cannot read the class list or any roster identity" \
  "$(get "$SJAR" "/teach/sections/$SECTION/roster" | grep -q 'do not have access' && echo 0 || echo 1)"
# Issue #6 stays staff-only: a student is never told whether staff have opened
# their submission, and has no control that could set it.
shist=$(get "$SJAR" "/sections/$SECTION/history")
check "student history carries no read state" \
  "$(grep -qvE 'Mark as read|Mark as unread|post--unread|unread' <<<"$shist" && echo 0 || echo 1)"
check "student Q&A carries no read state" \
  "$(get "$SJAR" "/sections/$SECTION/qa" | grep -qvE 'Mark as read|post--unread' && echo 0 || echo 1)"

check "student is never shown a whole student number" \
  "$(grep -qv '2026-00001' <<<"$shome" && echo 0 || echo 1)"

check "student is never shown another student's UP email" \
  "$(grep -qv 'maria.santos@up.edu.ph' <<<"$shome" && echo 0 || echo 1)"

echo
echo "passed=$pass failed=$fail"
[ "$fail" = "0" ]
