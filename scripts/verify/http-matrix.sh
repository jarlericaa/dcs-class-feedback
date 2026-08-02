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
# The three "unconfirmed student" assertions only hold before a teacher has
# confirmed that student's account match.
set -u
BASE=http://localhost:3000
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
check "/ redirects unauthenticated users to sign-in" \
  "$([ "$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/" | grep -c signin)" = "1" ] && echo 0 || echo 1)"
body=$(curl -s "$BASE/signin")
check "sign-in states the archive is not internet-public" \
  "$(grep -qc 'public internet' <<<"$body" && echo 0 || echo 1)"
check "sign-in offers development sign-in when enabled" \
  "$(grep -q 'Development sign in' <<<"$body" && echo 0 || echo 1)"

echo "== teacher =="
TJAR="$DIR/teacher.jar"; login teacher@up.edu.ph "$TJAR"
home=$(get "$TJAR" /)
check "teacher dashboard renders" "$(grep -q 'Teaching spaces' <<<"$home" && echo 0 || echo 1)"
SECTION=$(echo "$home" | grep -oE '/teach/sections/[0-9a-f-]{36}/review' | head -1 | cut -d/ -f4)
COURSE=$(get "$TJAR" /teach/courses | grep -oE '/teach/courses/[0-9a-f-]{36}/templates' | head -1 | cut -d/ -f4)
echo "  (section=$SECTION course=$COURSE)"
check "section id discovered from dashboard" "$([ -n "$SECTION" ] && echo 0 || echo 1)"

for path in "/teach/sections/$SECTION/review" "/teach/sections/$SECTION/setup" \
            "/teach/sections/$SECTION/matches" "/teach/sections/$SECTION/import" \
            "/teach/sections/$SECTION/participation" "/teach/sections/$SECTION/publications" \
            "/teach/sections/$SECTION/backlog" "/teach/sections/$SECTION/audit" \
            "/teach/courses" "/teach/courses/$COURSE/templates" "/sections/$SECTION/qa"; do
  check "teacher GET $path -> 200" "$([ "$(code "$TJAR" "$path")" = "200" ] && echo 0 || echo 1)"
done

review=$(get "$TJAR" "/teach/sections/$SECTION/review")
check "review inbox shows the staff-only cue" \
  "$(grep -q 'Staff only' <<<"$review" && echo 0 || echo 1)"
matches=$(get "$TJAR" "/teach/sections/$SECTION/matches")
check "matches page lists the pending student account" \
  "$(grep -q 'Juan Dela Cruz' <<<"$matches" && echo 0 || echo 1)"
check "matches page says nothing is verified automatically" \
  "$(grep -q 'Nothing is verified automatically' <<<"$matches" && echo 0 || echo 1)"
setup=$(get "$TJAR" "/teach/sections/$SECTION/setup")
check "setup exposes the TA permission catalog" \
  "$(grep -q 'Export participation CSVs' <<<"$setup" && echo 0 || echo 1)"
check "setup lists generated weekly cycles" \
  "$(grep -qE 'Week <!-- -->1' <<<"$setup" && echo 0 || echo 1)"
audit=$(get "$TJAR" "/teach/sections/$SECTION/audit")
check "audit history shows recorded actions" \
  "$(grep -qE 'cycle closed|cycle opened|roster imported|participation exported' <<<"$audit" && echo 0 || echo 1)"
csvcode=$(curl -s -o "$DIR/matrix.csv" -w '%{http_code}' -b "$TJAR" \
  "$BASE/teach/sections/$SECTION/participation/export?report=weekly_matrix")
check "participation CSV downloads (200)" "$([ "$csvcode" = "200" ] && echo 0 || echo 1)"
check "participation CSV has the student-number header" \
  "$(head -1 "$DIR/matrix.csv" | grep -q 'Student number' && echo 0 || echo 1)"

echo "== student (unconfirmed) =="
SJAR="$DIR/student.jar"; login student@up.edu.ph "$SJAR"
shome=$(get "$SJAR" /)
check "unconfirmed student sees the pending-confirmation state" \
  "$(grep -q 'waiting to be confirmed' <<<"$shome" && echo 0 || echo 1)"
check "unconfirmed student cannot open the section form" \
  "$(get "$SJAR" "/sections/$SECTION" | grep -q 'do not have access' && echo 0 || echo 1)"
check "unconfirmed student cannot open the Q&A archive" \
  "$(get "$SJAR" "/sections/$SECTION/qa" | grep -q 'do not have access' && echo 0 || echo 1)"
check "student cannot open the staff review inbox" \
  "$(get "$SJAR" "/teach/sections/$SECTION/review" | grep -q 'do not have access' && echo 0 || echo 1)"
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
