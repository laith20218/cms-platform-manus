#!/bin/bash
# ============================================================
# CMS Platform — Production Smoke Tests
# Validates all critical paths after deployment
# Usage: ./smoke-tests.sh [environment]
#   environment: staging (default) | production
# ============================================================
set -e

# ============================================================
# CONFIGURATION
# ============================================================
ENVIRONMENT="${1:-staging}"

if [ "$ENVIRONMENT" = "production" ]; then
    DEFAULT_API_URL="https://api.cms.example.com"
    DEFAULT_WEB_URL="https://app.cms.example.com"
    DEFAULT_ADMIN_URL="https://admin.cms.example.com"
    DEFAULT_CDN_URL="https://cdn.cms.example.com"
else
    DEFAULT_API_URL="https://staging-api.cms.example.com"
    DEFAULT_WEB_URL="https://staging-app.cms.example.com"
    DEFAULT_ADMIN_URL="https://staging-admin.cms.example.com"
    DEFAULT_CDN_URL="https://staging-cdn.cms.example.com"
fi

# CI or the deployment owner may supply the actual verified environment URLs.
API_URL="${CMS_API_URL:-$DEFAULT_API_URL}"
WEB_URL="${CMS_WEB_URL:-$DEFAULT_WEB_URL}"
ADMIN_URL="${CMS_ADMIN_URL:-$DEFAULT_ADMIN_URL}"
CDN_URL="${CMS_CDN_URL:-$DEFAULT_CDN_URL}"
API_HOST=$(printf '%s' "$API_URL" | sed -E 's#https?://([^/]+).*#\1#')

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASS=0
FAIL=0
WARN=0
TOTAL=0

# Test result tracking
log_pass() { echo -e "  ${GREEN}✓ PASS${NC} — $1"; PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); }
log_fail() { echo -e "  ${RED}✗ FAIL${NC} — $1"; FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); }
log_warn() { echo -e "  ${YELLOW}⚠ WARN${NC} — $1"; WARN=$((WARN+1)); TOTAL=$((TOTAL+1)); }
log_info() { echo -e "  ${BLUE}→${NC} $1"; }

echo "╔══════════════════════════════════════════════╗"
echo "║   CMS Platform — Smoke Tests                 ║"
echo "║   Environment: $ENVIRONMENT                    ║"
echo "║   Started: $(date -u '+%Y-%m-%d %H:%M:%S UTC') ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ============================================================
# SECTION 1: API Health Checks
# ============================================================
echo "── Section 1: API Health Checks ──"
echo ""

# Test 1.1: API Live health check
log_info "Testing API /health/live..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_URL/health/live")
if [ "$STATUS" = "200" ]; then
    log_pass "API live check (HTTP 200)"
else
    log_fail "API live check (got HTTP $STATUS, expected 200)"
fi

# Test 1.2: API Ready health check (DB + Redis)
log_info "Testing API /health/ready (DB + Redis)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_URL/health/ready")
if [ "$STATUS" = "200" ]; then
    log_pass "API ready check (DB + Redis connected)"
else
    log_fail "API ready check (got HTTP $STATUS, DB or Redis may be down)"
fi

# Test 1.3: API Comprehensive health
log_info "Testing API /health (comprehensive)..."
HEALTH_RESPONSE=$(curl -s --max-time 10 "$API_URL/health")
if echo "$HEALTH_RESPONSE" | grep -q "Healthy"; then
    log_pass "API comprehensive health (Healthy)"
else
    log_warn "API health response unexpected: $HEALTH_RESPONSE"
fi

# Test 1.4: API Response Time
log_info "Testing API response time..."
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 "$API_URL/health/live")
RESPONSE_TIME_INT=$(echo "$RESPONSE_TIME" | awk '{print int($1 * 1000)}')
if [ "$RESPONSE_TIME_INT" -lt 500 ]; then
    log_pass "API response time ${RESPONSE_TIME_INT}ms (< 500ms)"
elif [ "$RESPONSE_TIME_INT" -lt 2000 ]; then
    log_warn "API response time ${RESPONSE_TIME_INT}ms (acceptable but slow)"
else
    log_fail "API response time ${RESPONSE_TIME_INT}ms (too slow > 2000ms)"
fi

echo ""

# ============================================================
# SECTION 2: Frontend Health Checks
# ============================================================
echo "── Section 2: Frontend Health Checks ──"
echo ""

# Test 2.1: Student Web homepage
log_info "Testing Student Web homepage..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$WEB_URL/")
if [ "$STATUS" = "200" ]; then
    log_pass "Student Web accessible (HTTP 200)"
else
    log_fail "Student Web accessible (got HTTP $STATUS)"
fi

# Test 2.2: Admin Web homepage
log_info "Testing Admin Web homepage..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$ADMIN_URL/")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "302" ]; then
    log_pass "Admin Web accessible (HTTP $STATUS)"
else
    log_warn "Admin Web accessible (got HTTP $STATUS, may not be deployed yet)"
fi

# Test 2.3: PWA Manifest
log_info "Testing PWA manifest.webmanifest..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$WEB_URL/manifest.webmanifest")
if [ "$STATUS" = "200" ]; then
    log_pass "PWA manifest accessible"
else
    log_fail "PWA manifest accessible (got HTTP $STATUS)"
fi

# Test 2.4: Service Worker
log_info "Testing Service Worker (sw.js)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$WEB_URL/sw.js")
if [ "$STATUS" = "200" ]; then
    log_pass "Service Worker accessible"
else
    log_fail "Service Worker accessible (got HTTP $STATUS)"
fi

# Test 2.5: Frontend Security Headers
log_info "Testing Frontend security headers..."
HEADERS=$(curl -s -I --max-time 10 "$WEB_URL/")
if echo "$HEADERS" | grep -qi "strict-transport-security"; then
    log_pass "HSTS header present"
else
    log_fail "HSTS header missing"
fi

if echo "$HEADERS" | grep -qi "x-content-type-options: nosniff"; then
    log_pass "X-Content-Type-Options header present"
else
    log_fail "X-Content-Type-Options header missing"
fi

if echo "$HEADERS" | grep -qi "x-frame-options"; then
    log_pass "X-Frame-Options header present"
else
    log_fail "X-Frame-Options header missing"
fi

# Test 2.6: Frontend Response Time
log_info "Testing Frontend response time..."
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 "$WEB_URL/")
RESPONSE_TIME_INT=$(echo "$RESPONSE_TIME" | awk '{print int($1 * 1000)}')
if [ "$RESPONSE_TIME_INT" -lt 1000 ]; then
    log_pass "Frontend response time ${RESPONSE_TIME_INT}ms (< 1s)"
elif [ "$RESPONSE_TIME_INT" -lt 3000 ]; then
    log_warn "Frontend response time ${RESPONSE_TIME_INT}ms (acceptable)"
else
    log_fail "Frontend response time ${RESPONSE_TIME_INT}ms (too slow)"
fi

echo ""

# ============================================================
# SECTION 3: SSL/TLS Verification
# ============================================================
echo "── Section 3: SSL/TLS Verification ──"
echo ""

# Test 3.1: SSL Certificate validity
log_info "Checking SSL certificate for $API_URL..."
EXPIRY=$(echo | openssl s_client -servername "$API_HOST" -connect "$API_HOST:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$EXPIRY" ]; then
    EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s 2>/dev/null || echo 0)
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
    if [ "$DAYS_LEFT" -gt 7 ]; then
        log_pass "SSL cert valid ($DAYS_LEFT days remaining)"
    else
        log_fail "SSL cert expiring soon ($DAYS_LEFT days)"
    fi
else
    log_fail "SSL certificate not found"
fi

# Test 3.2: HTTP → HTTPS redirect
log_info "Testing HTTP → HTTPS redirect..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://$API_HOST/health")
if [ "$STATUS" = "301" ] || [ "$STATUS" = "302" ]; then
    log_pass "HTTP redirects to HTTPS (HTTP $STATUS)"
else
    log_fail "HTTP does not redirect (got HTTP $STATUS)"
fi

# Test 3.3: TLS Version check
log_info "Checking TLS version support..."
TLS_13=$(echo | openssl s_client -connect "$API_HOST:443" -tls1_3 2>/dev/null | grep -c "Protocol.*TLSv1.3")
if [ "$TLS_13" -gt 0 ]; then
    log_pass "TLS 1.3 supported"
else
    log_warn "TLS 1.3 not detected (TLS 1.2 minimum required)"
fi

echo ""

# ============================================================
# SECTION 4: API Endpoints Smoke Tests
# ============================================================
echo "── Section 4: API Endpoint Smoke Tests ──"
echo ""

# Test 4.1: Get universities (public endpoint)
log_info "Testing GET /api/v1/universities..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_URL/api/v1/universities?page=1&pageSize=1")
if [ "$STATUS" = "200" ]; then
    log_pass "Universities endpoint (HTTP 200)"
else
    log_fail "Universities endpoint (got HTTP $STATUS)"
fi

# Test 4.2: Get subjects
log_info "Testing GET /api/v1/universities/{id} is deferred to authenticated Browser E2E..."
log_warn "Academic hierarchy navigation requires a seeded university ID and is validated in the authenticated/browser suite, not anonymous smoke."


# Test 4.3: Get questions
log_info "Testing GET /api/v1/questions..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_URL/api/v1/questions")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ]; then
    log_pass "Questions endpoint (HTTP $STATUS — auth required as expected)"
else
    log_fail "Questions endpoint (got HTTP $STATUS)"
fi

# Test 4.4: Auth endpoint (should reject without credentials)
log_info "Testing POST /api/v1/auth/login (no credentials)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST "$API_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{}')
if [ "$STATUS" = "400" ]; then
    log_pass "Auth login rejects invalid request (HTTP 400)"
else
    log_fail "Auth login should return 400 (got HTTP $STATUS)"
fi

# Test 4.5: Rate limiting on auth endpoint
log_info "Testing auth rate limiting..."
RATE_LIMITED=0
for i in $(seq 1 7); do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST "$API_URL/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"phone":"0000000000","password":"wrong"}')
    if [ "$STATUS" = "429" ]; then
        RATE_LIMITED=1
        break
    fi
done
if [ "$RATE_LIMITED" -eq 1 ]; then
    log_pass "Rate limiting works (HTTP 429 after 5 attempts)"
else
    log_warn "Rate limiting may not be enforced"
fi

# Test 4.6: Swagger not exposed in production
log_info "Testing Swagger is NOT exposed..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_URL/swagger/index.html")
if [ "$STATUS" = "404" ]; then
    log_pass "Swagger hidden in production (HTTP 404)"
else
    log_warn "Swagger may be exposed (HTTP $STATUS)"
fi

echo ""

# ============================================================
# SECTION 5: CDN + Storage Verification
# ============================================================
echo "── Section 5: CDN + Storage Verification ──"
echo ""

# Test 5.1: CDN accessible
log_info "Testing CDN accessibility..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$CDN_URL/")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "403" ] || [ "$STATUS" = "404" ]; then
    log_pass "CDN accessible (HTTP $STATUS)"
else
    log_fail "CDN accessible (got HTTP $STATUS)"
fi

echo ""

# ============================================================
# SECTION 6: Database Verification (via API)
# ============================================================
echo "── Section 6: Database Verification ──"
echo ""

# Test 6.1: Universities count (should have seeded data)
log_info "Verifying seed data (universities)..."
UNIVERSITIES_COUNT=$(curl -s --max-time 10 "$API_URL/api/v1/universities?page=1&pageSize=50" | jq '.items | length' 2>/dev/null || echo "0")
if [ "$UNIVERSITIES_COUNT" -gt 0 ] 2>/dev/null; then
    log_pass "Database has $UNIVERSITIES_COUNT universities seeded"
else
    log_warn "Universities count: $UNIVERSITIES_COUNT (may be API response format issue)"
fi

# Subject and lecture data require a concrete academic ID and valid student entitlement.
# They are intentionally covered by authenticated Browser E2E rather than anonymous smoke.
log_info "Subject and lecture data are covered by the authenticated Browser E2E gate."


echo ""

# ============================================================
# SECTION 7: Performance Benchmarks
# ============================================================
echo "── Section 7: Performance Benchmarks ──"
echo ""

# Test 7.1: API p50 latency
log_info "Measuring API p50 latency (10 requests)..."
TOTAL_TIME=0
for i in $(seq 1 10); do
    TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 5 "$API_URL/health/live")
    TOTAL_TIME=$(echo "$TOTAL_TIME + $TIME" | bc)
done
AVG_TIME=$(echo "scale=3; $TOTAL_TIME / 10" | bc)
AVG_MS=$(echo "$AVG_TIME * 1000" | bc | awk '{print int($1)}')
if [ "$AVG_MS" -lt 200 ]; then
    log_pass "API avg latency: ${AVG_MS}ms (< 200ms, excellent)"
elif [ "$AVG_MS" -lt 500 ]; then
    log_warn "API avg latency: ${AVG_MS}ms (acceptable)"
else
    log_fail "API avg latency: ${AVG_MS}ms (too slow)"
fi

# Test 7.2: Frontend TTFB
log_info "Measuring Frontend TTFB..."
TTFB=$(curl -s -o /dev/null -w "%{time_starttransfer}" --max-time 10 "$WEB_URL/")
TTFB_MS=$(echo "$TTFB * 1000" | bc | awk '{print int($1)}')
if [ "$TTFB_MS" -lt 600 ]; then
    log_pass "Frontend TTFB: ${TTFB_MS}ms (< 600ms, excellent)"
elif [ "$TTFB_MS" -lt 1500 ]; then
    log_warn "Frontend TTFB: ${TTFB_MS}ms (acceptable)"
else
    log_fail "Frontend TTFB: ${TTFB_MS}ms (too slow)"
fi

echo ""

# ============================================================
# SECTION 8: Mobile PWA Verification
# ============================================================
echo "── Section 8: PWA Verification ──"
echo ""

# Test 8.1: Manifest has correct theme color
log_info "Verifying PWA manifest content..."
MANIFEST=$(curl -s --max-time 10 "$WEB_URL/manifest.webmanifest")
if echo "$MANIFEST" | grep -q "1976D2"; then
    log_pass "PWA theme color correct (#1976D2)"
else
    log_warn "PWA theme color may be incorrect"
fi

# Test 8.2: RTL direction in manifest
if echo "$MANIFEST" | grep -q '"dir":"rtl"'; then
    log_pass "PWA direction is RTL (Arabic)"
else
    log_warn "PWA direction may not be RTL"
fi

# Test 8.3: Icons exist
if echo "$MANIFEST" | grep -q "icon-192.png" && echo "$MANIFEST" | grep -q "icon-512.png"; then
    log_pass "PWA icons declared"
else
    log_fail "PWA icons missing in manifest"
fi

echo ""

# ============================================================
# SUMMARY
# ============================================================
echo "╔══════════════════════════════════════════════╗"
echo "║              SMOKE TEST SUMMARY              ║"
echo "╠══════════════════════════════════════════════╣"
echo -e "║  ${GREEN}Passed:${NC}    $PASS"
echo -e "║  ${YELLOW}Warnings:${NC}  $WARN"
echo -e "║  ${RED}Failed:${NC}    $FAIL"
echo "║  Total:     $TOTAL"
echo "║  Pass Rate: $(( PASS * 100 / TOTAL ))%"
echo "╠══════════════════════════════════════════════╣"

if [ $FAIL -eq 0 ] && [ $WARN -eq 0 ]; then
    echo -e "║  ${GREEN}STATUS: ALL SMOKE TESTS PASSED ✓${NC}        ║"
    echo "╚══════════════════════════════════════════════╝"
    echo ""
    echo "→ Smoke evidence is complete; evaluate the remaining release gates separately."
    exit 0
elif [ $FAIL -eq 0 ]; then
    echo -e "║  ${YELLOW}STATUS: INCOMPLETE — WARNINGS REMAIN ⚠${NC}  ║"
    echo "╚══════════════════════════════════════════════╝"
    echo ""
    echo "→ Resolve or formally disposition every warning before treating this as release evidence."
    exit 2
else
    echo -e "║  ${RED}STATUS: TESTS FAILED ✗${NC}                  ║"
    echo "╚══════════════════════════════════════════════╝"
    echo ""
    echo "→ Fix failing tests before going live!"
    echo "→ See: deploy/runbooks/emergency-runbook.md"
    exit 1
fi
