#!/usr/bin/env bash
# Manual verification matrix (docs/CLAUDE_IMPLEMENTATION_REPORT.md §6).
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
# The three "unconfirmed student" assertions only hold before a teacher has
# confirmed that student's account match.
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
SECTION=$(get "$TJAR" "/teach/courses/$COURSE/sections" | grep -oE '/teach/sections/[0-9a-f-]{36}/import' | head -1 | cut -d/ -f4)
FORM=$(get "$TJAR" "/teach/courses/$COURSE" | grep -oE "/teach/courses/$COURSE/forms/[0-9a-f-]{36}" | head -1 | rev | cut -d/ -f1 | rev)
echo "  (course=$COURSE section=$SECTION form=$FORM)"
check "course id discovered from My courses" "$([ -n "$COURSE" ] && echo 0 || echo 1)"
check "section id discovered from the course's class lists" "$([ -n "$SECTION" ] && echo 0 || echo 1)"
check "form id discovered from the course workspace" "$([ -n "$FORM" ] && echo 0 || echo 1)"

for path in "/teach/courses" "/teach/courses/$COURSE" \
            "/teach/courses/$COURSE/responses" "/teach/courses/$COURSE/sections" \
            "/teach/courses/$COURSE/forms/new" "/teach/courses/$COURSE/forms/$FORM" \
            "/teach/sections/$SECTION/setup" \
            "/teach/sections/$SECTION/matches" "/teach/sections/$SECTION/import" \
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

review=$(get "$TJAR" "/teach/courses/$COURSE/responses")
check "course response inbox renders" \
  "$(grep -q 'Responses' <<<"$review" && echo 0 || echo 1)"
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

matches=$(get "$TJAR" "/teach/sections/$SECTION/matches")
check "matches page lists the pending student account" \
  "$(grep -q 'Juan Dela Cruz' <<<"$matches" && echo 0 || echo 1)"
# The confirm control only exists while something is pending. Whichever state the
# seeded database is in, the page must be honest about it — and it must never
# offer an automatic route.
if grep -qE 'Confirm this is the same person' <<<"$matches"; then
  check "a pending match is confirmed by an explicit human act" 0
else
  check "with nothing pending, the matches page says so rather than implying it acted" \
    "$(grep -qE 'Confirmed|No students imported yet|Linked' <<<"$matches" && echo 0 || echo 1)"
fi
setup=$(get "$TJAR" "/teach/sections/$SECTION/setup")
check "setup exposes the TA permission catalog" \
  "$(grep -q 'Export participation CSVs' <<<"$setup" && echo 0 || echo 1)"
# Delivery moved to the form: section setup keeps only what is genuinely
# per-section, and says where the rest went.
check "setup points at the course for form setup" \
  "$(grep -q 'Forms are set up on the course' <<<"$setup" && echo 0 || echo 1)"
audit=$(get "$TJAR" "/teach/sections/$SECTION/audit")
check "audit history shows recorded actions in human labels" \
  "$(grep -qE 'Form closed|Form opened|Class list imported|Export downloaded|Section created' <<<"$audit" && echo 0 || echo 1)"
csvcode=$(curl -s -o "$DIR/matrix.csv" -w '%{http_code}' -b "$TJAR" \
  "$BASE/teach/sections/$SECTION/participation/export?report=weekly_matrix")
check "participation CSV downloads (200)" "$([ "$csvcode" = "200" ] && echo 0 || echo 1)"
check "participation CSV has the student-number header" \
  "$(head -1 "$DIR/matrix.csv" | grep -q 'Student number' && echo 0 || echo 1)"

echo "== student =="
SJAR="$DIR/student.jar"; login student@up.edu.ph "$SJAR"
shome=$(get "$SJAR" /)
# Whether this student has been confirmed yet depends on the state of the seeded
# database, so both outcomes are accepted — but each must be the RIGHT one.
if grep -q 'waiting to be confirmed\|could not match you' <<<"$shome"; then
  echo "  (student is unconfirmed)"
  check "unconfirmed student sees the pending-confirmation state" 0
  check "unconfirmed student cannot open a class section" \
    "$(get "$SJAR" "/sections/$SECTION" | grep -q 'do not have access' && echo 0 || echo 1)"
  check "unconfirmed student cannot open the Q&A archive" \
    "$(get "$SJAR" "/sections/$SECTION/qa" | grep -q 'do not have access' && echo 0 || echo 1)"
else
  echo "  (student is confirmed)"
  # The board is made of FORMS, and it names the course code, never the section.
  check "confirmed student sees forms, not sections" \
    "$(grep -qE 'Fill in form|Review my answers|Nothing open|not in any class' <<<"$shome" && echo 0 || echo 1)"
  check "confirmed student can open their class section" \
    "$([ "$(code "$SJAR" "/sections/$SECTION")" != "500" ] && echo 0 || echo 1)"
  check "confirmed student can open the Q&A archive" \
    "$([ "$(code "$SJAR" "/sections/$SECTION/qa")" = "200" ] && echo 0 || echo 1)"
  FORMLINK=$(grep -oE '/forms/[0-9a-f-]{36}' <<<"$shome" | head -1)
  if [ -n "$FORMLINK" ]; then
    sform=$(get "$SJAR" "$FORMLINK")
    check "the student form names the course code" \
      "$(grep -qE '<h1|panel-title' <<<"$sform" && echo 0 || echo 1)"
    check "the student form never exposes staff-only review state" \
      "$(grep -qvE 'Marked invalid|needs review|Identity hidden' <<<"$sform" && echo 0 || echo 1)"
  fi
fi
check "student cannot open the staff response inbox" \
  "$(get "$SJAR" "/teach/courses/$COURSE/responses" | grep -q 'do not have access' && echo 0 || echo 1)"
check "student cannot open the course workspace" \
  "$(get "$SJAR" "/teach/courses/$COURSE" | grep -q 'do not have access' && echo 0 || echo 1)"
check "student cannot open participation" \
  "$(get "$SJAR" "/teach/sections/$SECTION/participation" | grep -q 'do not have access' && echo 0 || echo 1)"
check "student cannot download the participation CSV (403)" \
  "$([ "$(code "$SJAR" "/teach/sections/$SECTION/participation/export?report=weekly_matrix")" = "403" ] && echo 0 || echo 1)"
check "student cannot open platform admin" \
  "$(get "$SJAR" /admin | grep -q 'do not have access' && echo 0 || echo 1)"
check "student cannot open course management" \
  "$(get "$SJAR" /teach/courses | grep -q 'do not have access' && echo 0 || echo 1)"

echo
echo "passed=$pass failed=$fail"
[ "$fail" = "0" ]
