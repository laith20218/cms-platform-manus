#!/usr/bin/env bash
# verify-range.sh — HTTP Range support check for a presigned media URL (Upstash Blob / R2).
#
# Push 10.0b Task 2-Fallback. The sandbox has no Upstash credentials, so no presigned
# URL could be minted for an automated live test. The OPERATOR must run this script
# manually with a freshly-issued presigned URL:
#
#   bash docs/ops/verify-range.sh "<PRESIGNED_URL>"
#
# The URL is read from $1 ONLY — never hardcode a signed URL in this file (it embeds
# credentials and expires within minutes).
#
# What it does:
#   1. Ranged request:   GET with "Range: bytes=0-1023"   → expects 206 + Content-Range
#   2. Control request:  GET without Range                → expects 200 + full Content-Length
#   2b. Informational:    GET with an Origin header        → reports Access-Control-* headers
#                         (CORS diagnostics only — not part of the PASS/FAIL verdict; override
#                          the origin with VERIFY_RANGE_ORIGIN=<url>)
#   3. Compares lengths and prints a verdict:
#        PASS             206 + Content-Range + body length 1024 → Range works
#        FAIL             200 + full length on the ranged call  → Range ignored
#        ERROR            403/401 (signature/TTL) or transport failure — inconclusive
#   4. On PASS it hex-dumps the first 16 bytes so you can confirm real media data
#      (e.g. MP4 "ftyp" box or ID3/MP3 sync bits), not an error page.
#
# Output hygiene: only the scheme://host/path of the URL is echoed — the query string
# (which carries the signature) is stripped from every printed line.

set -uo pipefail

if [[ $# -ne 1 || -z "${1:-}" ]]; then
  echo "usage: bash docs/ops/verify-range.sh \"<PRESIGNED_URL>\"" >&2
  echo "       The presigned URL must be passed as the first argument (fresh, within its TTL)." >&2
  exit 2
fi

URL="$1"
# Redacted display form: drop the query string (signature) from anything we print.
SAFE_URL="$(printf '%s' "$URL" | sed -E 's/\?.*$//')"

command -v curl >/dev/null 2>&1 || { echo "ERROR: curl is required"; exit 2; }
# xxd preferred, od as fallback for the first-bytes hex dump.
hexdump_cmd() {
  if command -v xxd >/dev/null 2>&1; then xxd; else od -A x -t x1z; fi
}

echo "== verify-range.sh =="
echo "target (redacted): ${SAFE_URL}"
echo

# ---------- 1) Ranged request ----------
RANGE_HEADERS="$(mktemp)"
if ! curl -sS -D "$RANGE_HEADERS" -o /dev/null --max-time 30 -H "Range: bytes=0-1023" "$URL"; then
  echo "ERROR: ranged request failed at transport level (network/TLS/DNS). Inconclusive."
  rm -f "$RANGE_HEADERS"
  exit 3
fi
RANGE_STATUS="$(awk 'NR==1 {print $2}' "$RANGE_HEADERS")"
RANGE_CONTENT_RANGE="$(awk 'tolower($1)=="content-range:" {sub(/^[^ ]* /,""); print; exit}' "$RANGE_HEADERS")"
RANGE_CONTENT_LENGTH="$(awk 'tolower($1)=="content-length:" {sub(/^[^ ]* /,""); gsub(/\r/,""); print; exit}' "$RANGE_HEADERS")"
RANGE_ACCEPT_RANGES="$(awk 'tolower($1)=="accept-ranges:" {sub(/^[^ ]* /,""); gsub(/\r/,""); print; exit}' "$RANGE_HEADERS")"

echo "-- ranged request (Range: bytes=0-1023) --"
echo "status:            ${RANGE_STATUS}"
echo "content-range:     ${RANGE_CONTENT_RANGE:-<absent>}"
echo "content-length:    ${RANGE_CONTENT_LENGTH:-<absent>}"
echo "accept-ranges:     ${RANGE_ACCEPT_RANGES:-<absent>}"
echo

# ---------- 2) Control request (no Range) ----------
CTRL_HEADERS="$(mktemp)"
if ! curl -sS -D "$CTRL_HEADERS" -o /dev/null --max-time 30 "$URL"; then
  echo "ERROR: control request failed at transport level. Inconclusive."
  rm -f "$RANGE_HEADERS" "$CTRL_HEADERS"
  exit 3
fi
CTRL_STATUS="$(awk 'NR==1 {print $2}' "$CTRL_HEADERS")"
CTRL_CONTENT_LENGTH="$(awk 'tolower($1)=="content-length:" {sub(/^[^ ]* /,""); gsub(/\r/,""); print; exit}' "$CTRL_HEADERS")"

echo "-- control request (no Range header) --"
echo "status:            ${CTRL_STATUS}"
echo "content-length:    ${CTRL_CONTENT_LENGTH:-<absent>}"
echo

rm -f "$RANGE_HEADERS" "$CTRL_HEADERS"

# ---------- 2b) Informational: CORS presence check (not part of PASS/FAIL) ----------
# Sends a GET with an Origin header, like a browser would. Storage only returns
# Access-Control-* headers when the request carries Origin (per Cloudflare R2 docs:
# "If you are testing directly or using a command-line tool such as curl, you will not
# see CORS Access-Control-* response headers unless the Origin request header is
# included in the request"). This stands in for Task 3.4's preflight, which could not
# be run from the credential-free sandbox. Override the origin with VERIFY_RANGE_ORIGIN.
ORIGIN="${VERIFY_RANGE_ORIGIN:-https://cms-platform-manus-student-web.vercel.app}"
CORS_HEADERS="$(mktemp)"
if curl -sS -D "$CORS_HEADERS" -o /dev/null --max-time 30 -H "Origin: ${ORIGIN}" "$URL"; then
  CORS_STATUS="$(awk 'NR==1 {print $2}' "$CORS_HEADERS")"
  ACAO="$(awk 'tolower($1)=="access-control-allow-origin:" {sub(/^[^ ]* /,""); gsub(/\r/,""); print; exit}' "$CORS_HEADERS")"
  ACAM="$(awk 'tolower($1)=="access-control-allow-methods:" {sub(/^[^ ]* /,""); gsub(/\r/,""); print; exit}' "$CORS_HEADERS")"
  ACAH="$(awk 'tolower($1)=="access-control-allow-headers:" {sub(/^[^ ]* /,""); gsub(/\r/,""); print; exit}' "$CORS_HEADERS")"
  AEAR="$(awk 'tolower($1)=="access-control-expose-headers:" {sub(/^[^ ]* /,""); gsub(/\r/,""); print; exit}' "$CORS_HEADERS")"
  echo "-- informational: GET with 'Origin: ${ORIGIN}' (CORS diagnostics) --"
  echo "status:                        ${CORS_STATUS}"
  echo "access-control-allow-origin:   ${ACAO:-<absent>}"
  echo "access-control-allow-methods:  ${ACAM:-<absent>}"
  echo "access-control-allow-headers:  ${ACAH:-<absent>}"
  echo "access-control-expose-headers: ${AEAR:-<absent>}"
  if [[ -z "${ACAO:-}" ]]; then
    echo "NOTE: no Access-Control-Allow-Origin on an Origin-bearing GET — a browser"
    echo "      fetch()/XHR of this URL cross-origin WILL fail. Plain <video>/<audio>"
    echo "      element playback may still work (no-cors media fetch), but fetch()-based"
    echo "      Range requests and error-body reading will not."
  fi
else
  echo "-- informational: Origin-bearing GET failed at transport level (skipped) --"
fi
echo
rm -f "$CORS_HEADERS"

# ---------- 3) Verdict ----------
case "$RANGE_STATUS" in
  403|401)
    echo "ERROR: presigned URL rejected (HTTP ${RANGE_STATUS}) — signature invalid or TTL expired."
    echo "       Re-issue a fresh URL and re-run. Range verdict: INCONCLUSIVE."
    exit 3
    ;;
  206)
    if [[ -n "$RANGE_CONTENT_RANGE" ]]; then
      echo "VERDICT: PASS — RANGE SUPPORTED (206 Partial Content + Content-Range present)."
      if [[ "${RANGE_CONTENT_LENGTH:-}" == "1024" ]]; then
        echo "         ranged Content-Length is exactly 1024 bytes, as requested."
      else
        echo "         NOTE: ranged Content-Length is ${RANGE_CONTENT_LENGTH:-?} (requested 1024)."
        echo "         If the object is smaller than 1024 bytes this is still correct behavior."
      fi
      echo "-- first 16 bytes of the ranged body (confirm real media, not an error page) --"
      curl -sS --max-time 30 -H "Range: bytes=0-1023" "$URL" | head -c 16 | hexdump_cmd
      exit 0
    else
      echo "VERDICT: FAIL — status 206 but Content-Range header absent; treat as BROKEN."
      exit 1
    fi
    ;;
  200)
    if [[ -n "${CTRL_CONTENT_LENGTH:-}" && "${RANGE_CONTENT_LENGTH:-}" == "$CTRL_CONTENT_LENGTH" ]]; then
      echo "VERDICT: FAIL — RANGE NOT SUPPORTED."
      echo "         The ranged request returned the FULL object (status 200, length equals"
      echo "         control length ${CTRL_CONTENT_LENGTH}). The server ignored the Range header."
      exit 1
    else
      echo "VERDICT: FAIL — ranged request returned 200 (full object, not a partial body)."
      exit 1
    fi
    ;;
  *)
    echo "VERDICT: INCONCLUSIVE — unexpected status ${RANGE_STATUS}."
    exit 3
    ;;
esac
