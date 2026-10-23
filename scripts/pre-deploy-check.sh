#!/usr/bin/env bash
#
# pre-deploy-check.sh — Pre-push verification gate for cms-platform-manus
#
# MUST be run before any push to main. Simulates the CI environment (Vercel +
# Render) to catch issues that local builds miss (e.g. lockfile drift).
#
# Usage:
#   bash scripts/pre-deploy-check.sh
#   bash scripts/pre-deploy-check.sh --skip-backend   # if no backend changes
#   bash scripts/pre-deploy-check.sh --skip-tests     # fast check
#
# Exit codes:
#   0 = all checks passed, safe to push
#   1 = one or more checks failed, DO NOT push
#
# Created: 2026-10-22 (after ERR_PNPM_OUTDATED_LOCKFILE incident on 7e91f1f)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track failures
FAILURES=0
SKIP_BACKEND=0
SKIP_TESTS=0

# Parse args
for arg in "$@"; do
  case "$arg" in
    --skip-backend) SKIP_BACKEND=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} pre-deploy-check.sh${NC}"
echo -e "${BLUE} Pre-push verification gate${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# --- Determine package manager ---
if command -v pnpm &>/dev/null; then
  PM="pnpm"
elif command -v corepack &>/dev/null; then
  PM="corepack pnpm"
else
  echo -e "${RED}ERROR: neither pnpm nor corepack found${NC}"
  exit 1
fi
echo -e "Package manager: ${PM}"
echo ""

# --- Check 0: working tree must be clean OR only have intended changes ---
echo -e "${BLUE}[0/6] Working tree check${NC}"
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${YELLOW}  WARNING: working tree has uncommitted changes:${NC}"
  git status --short
  echo -e "${YELLOW}  Commit or stash before pushing. Continuing anyway (CI checks below)...${NC}"
else
  echo -e "${GREEN}  ✓ working tree clean${NC}"
fi
echo ""

# --- Check 1: frozen-lockfile (THE critical CI check) ---
echo -e "${BLUE}[1/6] pnpm install --frozen-lockfile (CI simulation)${NC}"
echo -e "  This is the EXACT command Vercel runs. If it fails, the deploy WILL fail."
if $PM install --frozen-lockfile 2>&1 | tail -5; then
  echo -e "${GREEN}  ✓ lockfile is in sync with package.json${NC}"
else
  echo -e "${RED}  ✗ LOCKFILE OUT OF SYNC${NC}"
  echo -e "${YELLOW}  Fix: run \`$PM install --lockfile-only\`, commit pnpm-lock.yaml, retry.${NC}"
  FAILURES=$((FAILURES + 1))
fi
echo ""

# --- Check 2: trailing whitespace / conflict markers ---
echo -e "${BLUE}[2/6] git diff --check (whitespace + conflict markers)${NC}"
if git diff --check HEAD 2>/dev/null; then
  echo -e "${GREEN}  ✓ no whitespace errors or conflict markers${NC}"
else
  echo -e "${RED}  ✗ whitespace errors or conflict markers found${NC}"
  FAILURES=$((FAILURES + 1))
fi
echo ""

# --- Check 3: build all packages ---
echo -e "${BLUE}[3/6] Build all packages ($PM -r build)${NC}"
if [ "$SKIP_TESTS" -eq 1 ]; then
  echo -e "${YELLOW}  SKIPPED (--skip-tests)${NC}"
else
  if $PM -r build 2>&1 | tail -10; then
    echo -e "${GREEN}  ✓ all packages built${NC}"
  else
    echo -e "${RED}  ✗ build failed${NC}"
    FAILURES=$((FAILURES + 1))
  fi
fi
echo ""

# --- Check 4: run tests ---
echo -e "${BLUE}[4/6] Run tests (student-web + admin-web vitest)${NC}"
if [ "$SKIP_TESTS" -eq 1 ]; then
  echo -e "${YELLOW}  SKIPPED (--skip-tests)${NC}"
else
  TEST_OK=1
  echo -e "  student-web vitest..."
  (cd apps/student-web && node_modules/.bin/vitest run 2>&1 | tail -4) || TEST_OK=0
  echo -e "  admin-web vitest..."
  (cd apps/admin-web && node_modules/.bin/vitest run 2>&1 | tail -4) || TEST_OK=0
  if [ "$TEST_OK" -eq 1 ]; then
    echo -e "${GREEN}  ✓ all tests passed${NC}"
  else
    echo -e "${RED}  ✗ some tests failed${NC}"
    FAILURES=$((FAILURES + 1))
  fi
fi
echo ""

# --- Check 5: backend build (if dotnet available and not skipped) ---
echo -e "${BLUE}[5/6] Backend build (dotnet)${NC}"
if [ "$SKIP_BACKEND" -eq 1 ]; then
  echo -e "${YELLOW}  SKIPPED (--skip-backend)${NC}"
elif ! command -v dotnet &>/dev/null; then
  echo -e "${YELLOW}  SKIPPED (dotnet not in PATH)${NC}"
  echo -e "${YELLOW}  If backend changed, install dotnet SDK and run manually:${NC}"
  echo -e "${YELLOW}    cd apps/api && dotnet build${NC}"
else
  if (cd apps/api && dotnet build 2>&1 | tail -5); then
    echo -e "${GREEN}  ✓ backend builds${NC}"
  else
    echo -e "${RED}  ✗ backend build failed${NC}"
    FAILURES=$((FAILURES + 1))
  fi
fi
echo ""

# --- Check 6: secret scan (basic — check for common secret patterns) ---
echo -e "${BLUE}[6/6] Secret scan (basic)${NC}"
SECRETS=$(git diff HEAD~5..HEAD --name-only 2>/dev/null | xargs grep -lE \
  '(github_pat_|rnd_|vcp_|napi_|sk-|AKIA[0-9A-Z]{16})' 2>/dev/null || true)
if [ -z "$SECRETS" ]; then
  echo -e "${GREEN}  ✓ no obvious secrets in recent changes${NC}"
else
  echo -e "${RED}  ✗ potential secrets found in:${NC}"
  echo "$SECRETS"
  FAILURES=$((FAILURES + 1))
fi
echo ""

# --- Summary ---
echo -e "${BLUE}========================================${NC}"
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN} ✓ ALL CHECKS PASSED — safe to push to main${NC}"
  echo -e "${BLUE}========================================${NC}"
  exit 0
else
  echo -e "${RED} ✗ $FAILURES CHECK(S) FAILED — DO NOT push to main${NC}"
  echo -e "${BLUE}========================================${NC}"
  exit 1
fi
