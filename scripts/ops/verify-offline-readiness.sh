#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# verify-offline-readiness.sh — read-only readiness probe for the offline
# platform (Wave-6 ops artifact). No secrets, no state changes: it only
# checks that the API answers fail-closed the way the offline surfaces
# expect BEFORE a device acceptance run.
#
# Usage:
#   scripts/ops/verify-offline-readiness.sh https://<api-host>
#
# Checks (expected → PASS):
#   1. /health                                          → 200
#   2. /api/v1/offline/packages            (no auth)    → 401 (auth required,
#      NOT 403 — a 403 here would mean the offline flags are off server-side)
#   3. /api/v1/media/course-episode/<zero-uuid>/content (no auth) → 401
#
# NOTE: the six Features__Offline* flags and the three Security__Offline__*
# keys are Render env settings — verify them in the dashboard or via the
# Render API (names only); they are deliberately NOT probed here (keys are
# secrets). An authenticated 200/empty-list check needs a real student
# login and belongs to the manual acceptance
# (docs/OFFLINE-AIRPLANE-ACCEPTANCE.md §0 P2).
# ---------------------------------------------------------------------------
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 https://<api-host>" >&2
    exit 2
fi

BASE="${1%/}"
ZERO_GUID="00000000-0000-0000-0000-000000000000"
pass=0
fail=0

check() {
    local name="$1" expected="$2" url="$3"
    local status body
    body="$(mktemp)"
    status="$(curl -s -o "$body" -w '%{http_code}' --max-time 30 "$url" || echo 000)"
    if [ "$status" = "$expected" ]; then
        echo "PASS  $name (HTTP $status)"
        pass=$((pass + 1))
    else
        if [ "$status" = "403" ]; then
            echo "FAIL  $name — expected HTTP $expected, got 403 (offline flags OFF server-side?)"
        else
            echo "FAIL  $name — expected HTTP $expected, got $status"
        fi
        echo "      body: $(head -c 160 "$body")"
        fail=$((fail + 1))
    fi
    rm -f "$body"
}

echo "Probing $BASE (read-only, unauthenticated)…"
check "GET  /health"                                        "200" "$BASE/health"
check "GET  /api/v1/offline/packages (no auth)              " "401" "$BASE/api/v1/offline/packages"

# The W5 content endpoint only exists after the W5 merge is deployed to the
# API host: 404 = "route not deployed yet" (expected BEFORE that deploy);
# 401 = fail-closed-ready; 403 = flags off; anything else = investigate.
CONTENT_STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
    "$BASE/api/v1/media/course-episode/$ZERO_GUID/content" || echo 000)"
case "$CONTENT_STATUS" in
    401)
        echo "PASS  GET  /api/v1/media/course-episode/<zero>/content (HTTP 401)"
        pass=$((pass + 1))
        ;;
    404)
        echo "WARN  GET  /api/v1/media/course-episode/<zero>/content — HTTP 404: the W5 endpoint is not deployed on this host yet (expected before the W5 deploy; re-run after)."
        ;;
    *)
        echo "FAIL  GET  /api/v1/media/course-episode/<zero>/content — expected 401, got $CONTENT_STATUS"
        fail=$((fail + 1))
        ;;
esac

echo
if [ "$fail" -eq 0 ]; then
    echo "RESULT: $pass PASS, 0 FAIL — API is fail-closed-ready for the offline acceptance run (see any WARN lines)."
    exit 0
else
    echo "RESULT: $fail FAIL / $pass PASS — fix before the device acceptance run."
    exit 1
fi
