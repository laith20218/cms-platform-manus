#!/usr/bin/env bash
# ============================================================
# CMS Platform — Provider Credential Configuration Verifier
# Introduced by PR-0 (Gate A) of the Admin Command Center program.
#
# Reports per-provider and per-variable-name status ONLY:
#   configured | missing | invalid | unreachable
#
# SECURITY CONTRACT:
#   - Secret values are NEVER printed, logged, or written anywhere.
#   - Env-var API responses are filtered to NAMES ONLY at the jq layer.
#   - All provider calls are read-only GETs with fixed allowlisted routes.
#   - Credentials are read from environment variables (never from files
#     committed to the repository).
#
# Usage:
#   GITHUB_TOKEN=... RENDER_API_TOKEN=... RENDER_SERVICE_ID=... \
#   VERCEL_ADMIN_TOKEN=... VERCEL_STUDENT_TOKEN=... NEON_API_KEY=... \
#   bash scripts/ops/verify-provider-config.sh
#
# Any variable that is unset is simply reported as "missing" — the script
# never fails hard, it reports. Exit code is always 0 unless dependencies
# (curl, jq) are absent.
# ============================================================
set -uo pipefail

CURL_OPTS=(--silent --max-time 25)
GITHUB_API_BASE="${GITHUB_API_BASE:-https://api.github.com}"
RENDER_API_BASE="${RENDER_API_BASE:-https://api.render.com/v1}"
VERCEL_API_BASE="${VERCEL_API_BASE:-https://api.vercel.com}"
NEON_API_BASE="${NEON_API_BASE:-https://api.neon.tech/api/v2}"

GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_OWNER="${GITHUB_OWNER:-laith20218}"
GITHUB_REPO="${GITHUB_REPO:-cms-platform-manus}"
RENDER_API_TOKEN="${RENDER_API_TOKEN:-}"
RENDER_SERVICE_ID="${RENDER_SERVICE_ID:-}"
VERCEL_ADMIN_TOKEN="${VERCEL_ADMIN_TOKEN:-}"
VERCEL_STUDENT_TOKEN="${VERCEL_STUDENT_TOKEN:-}"
NEON_API_KEY="${NEON_API_KEY:-}"

for dep in curl jq; do
  command -v "$dep" >/dev/null 2>&1 || { echo "dependency missing: $dep"; exit 1; }
done

hdr() { printf '\n== %s ==\n' "$1"; }
status() { printf '  %-46s %s\n' "$1" "$2"; }

# ------------------------------------------------------------
# GitHub
# ------------------------------------------------------------
hdr "GitHub (repo: ${GITHUB_OWNER}/${GITHUB_REPO})"
if [ -z "$GITHUB_TOKEN" ]; then
  status "GITHUB_TOKEN" "missing"
else
  code=$(curl "${CURL_OPTS[@]}" -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    "${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}")
  case "$code" in
    200) status "GITHUB_TOKEN" "configured (valid, read verified)" ;;
    401|403) status "GITHUB_TOKEN" "invalid (HTTP ${code})" ;;
    000) status "GITHUB_TOKEN" "unreachable" ;;
    *) status "GITHUB_TOKEN" "invalid (HTTP ${code})" ;;
  esac
fi

# ------------------------------------------------------------
# Render (service status + env var NAME checks only)
# ------------------------------------------------------------
hdr "Render (service: ${RENDER_SERVICE_ID:-<unset>})"
if [ -z "$RENDER_API_TOKEN" ]; then
  status "RENDER_API_TOKEN" "missing"
elif [ -z "$RENDER_SERVICE_ID" ]; then
  status "RENDER_SERVICE_ID" "missing (required with RENDER_API_TOKEN)"
else
  code=$(curl "${CURL_OPTS[@]}" -o /tmp/.cms-render-svc.json -w '%{http_code}' \
    -H "Authorization: Bearer ${RENDER_API_TOKEN}" \
    "${RENDER_API_BASE}/services/${RENDER_SERVICE_ID}")
  case "$code" in
    200)
      status "RENDER_API_TOKEN" "configured (valid, read verified)"
      svc_name=$(jq -r '.name // "unknown"' /tmp/.cms-render-svc.json 2>/dev/null)
      suspended=$(jq -r '.suspended // "unknown"' /tmp/.cms-render-svc.json 2>/dev/null)
      status "service ${svc_name}" "reachable (suspended: ${suspended})"
      ;;
    401|403) status "RENDER_API_TOKEN" "invalid (HTTP ${code})" ;;
    000) status "RENDER_API_TOKEN" "unreachable" ;;
    *) status "RENDER_API_TOKEN" "invalid (HTTP ${code})" ;;
  esac

  # Env var names only — jq maps to .envVar.key; values never accessed.
  env_names=$(curl "${CURL_OPTS[@]}" \
    -H "Authorization: Bearer ${RENDER_API_TOKEN}" \
    "${RENDER_API_BASE}/services/${RENDER_SERVICE_ID}/env-vars?limit=100" \
    | jq -r '[.[]? | .envVar.key?] | sort | .[]' 2>/dev/null || true)

  if [ -n "$env_names" ]; then
    printf '  %s\n' "Render env names present (values never read):"
    while IFS= read -r name; do
      [ -z "$name" ] && continue
      status "${name}" "configured"
    done <<< "$env_names"
  else
    status "render env vars" "unavailable (API unreachable or token invalid)"
  fi

  # Required monitoring names (PR-8 preparation) — names only.
  printf '  %s\n' "MONITORING_* names (expected before PR-8; owner creates with values):"
  for mon in MONITORING_RENDER_API_KEY MONITORING_RENDER_WORKSPACE_ID MONITORING_RENDER_SERVICE_ID \
             MONITORING_VERCEL_ACCESS_TOKEN MONITORING_VERCEL_TEAM_ID \
             MONITORING_VERCEL_ADMIN_PROJECT_ID MONITORING_VERCEL_STUDENT_PROJECT_ID \
             MONITORING_NEON_API_KEY MONITORING_NEON_ORG_ID MONITORING_NEON_PROJECT_ID MONITORING_NEON_BRANCH_ID \
             MONITORING_GITHUB_TOKEN MONITORING_GITHUB_OWNER MONITORING_GITHUB_REPOSITORY; do
    if printf '%s\n' "$env_names" | grep -qx "$mon"; then
      status "${mon}" "configured"
    else
      status "${mon}" "missing"
    fi
  done
fi
rm -f /tmp/.cms-render-svc.json

# ------------------------------------------------------------
# Vercel (project scope per token)
# ------------------------------------------------------------
vercel_check() {
  local label="$1" token="$2" project_hint="$3"
  if [ -z "$token" ]; then
    status "${label}" "missing"
    return
  fi
  local body code
  body=$(curl "${CURL_OPTS[@]}" -H "Authorization: Bearer ${token}" \
    "${VERCEL_API_BASE}/v9/projects?limit=100")
  code=$(printf '%s' "$body" | jq -r '.error // empty' 2>/dev/null)
  if printf '%s' "$body" | jq -e '.projects' >/dev/null 2>&1; then
    local count names
    count=$(printf '%s' "$body" | jq -r '.projects | length')
    names=$(printf '%s' "$body" | jq -r '[.projects[]?.name] | join(", ")')
    status "${label}" "configured (valid; sees ${count} project(s): ${names:-none}${project_hint})"
  else
    status "${label}" "invalid or unreachable (${code:-no JSON})"
  fi
}
hdr "Vercel"
vercel_check "VERCEL_ADMIN_TOKEN" "$VERCEL_ADMIN_TOKEN" ""
vercel_check "VERCEL_STUDENT_TOKEN" "$VERCEL_STUDENT_TOKEN" ""

# ------------------------------------------------------------
# Neon (project list — status only, no connection strings)
# ------------------------------------------------------------
hdr "Neon"
if [ -z "$NEON_API_KEY" ]; then
  status "NEON_API_KEY" "missing"
else
  body=$(curl "${CURL_OPTS[@]}" -H "Authorization: Bearer ${NEON_API_KEY}" \
    "${NEON_API_BASE}/projects")
  if printf '%s' "$body" | jq -e '.projects' >/dev/null 2>&1; then
    count=$(printf '%s' "$body" | jq -r '.projects | length')
    status "NEON_API_KEY" "configured (valid; sees ${count} project(s))"
  elif [ -z "$body" ]; then
    status "NEON_API_KEY" "present / unreachable (api.neon.tech did not respond — check DNS/network; DB health is verifiable via the API /health/ready endpoint)"
  else
    err=$(printf '%s' "$body" | jq -r '.error // .message // "non-JSON or error response"' 2>/dev/null | cut -c1-60)
    status "NEON_API_KEY" "present / invalid or unreachable (${err})"
  fi
fi

# ------------------------------------------------------------
# Production surface liveness (no credentials required)
# ------------------------------------------------------------
hdr "Public production surfaces (read-only)"
for url in "https://cms-api-preview.onrender.com/health/live" \
           "https://cms-api-preview.onrender.com/health/ready" \
           "https://cms-platform-manus-admin-web.vercel.app" \
           "https://cms-platform-manus-student-web.vercel.app"; do
  code=$(curl "${CURL_OPTS[@]}" -o /dev/null -w '%{http_code}' "$url")
  status "${url}" "HTTP ${code}"
done

echo ""
echo "Done. Statuses only — no secret values were printed, stored, or transmitted."
