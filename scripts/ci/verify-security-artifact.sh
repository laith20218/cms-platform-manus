#!/usr/bin/env bash
set -euo pipefail

# Fails closed when a production secret file or a recognisable private credential
# is present in the checked-out source or Docker build context. The allowlist is
# deliberately limited to documented template markers.
ROOT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT_DIR"

failures=0
fail() {
  printf 'SECURITY CHECK FAILED: %s\n' "$1" >&2
  failures=$((failures + 1))
}

# Production credential files must never be committed or copied into a release.
while IFS= read -r -d '' file; do
  case "$file" in
    */.env.example|*/.env.production.example|*/.env.test.example) ;;
    *) fail "forbidden environment or credential file: ${file#./}" ;;
  esac
done < <(find . \
  -path './.git' -prune -o -path './node_modules' -prune -o \
  -type f \( -name '.env' -o -name '.env.production' -o -name '*.secret' -o -iname 'credentials*' \) \
  -print0)

# Catch high-confidence secrets; placeholder values in documented templates are
# intentionally not matched by these patterns.
secret_patterns=(
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
  'AKIA[0-9A-Z]{16}'
  'ghp_[A-Za-z0-9]{36,}'
  'github_pat_[A-Za-z0-9_]{20,}'
  'xox[baprs]-[A-Za-z0-9-]{20,}'
  'sk_(live|test)_[A-Za-z0-9]{16,}'
)

for pattern in "${secret_patterns[@]}"; do
  if grep -RInE --exclude-dir=.git --exclude-dir=node_modules --exclude='*.example' -- "$pattern" .; then
    fail "high-confidence credential pattern detected"
  fi
done

# Reject values that are structurally secrets even when they do not match a
# provider-specific prefix. Documentation and declared templates are not
# runtime artifacts, but client-secret variables remain forbidden in source.
assignment_patterns=(
  '^[[:space:]]*(JWT(_|__)?(SECRET|SIGNING(_)?KEY)|R2_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)|REDIS(_|__)?PASSWORD|DATABASE(_|__)?URL|CONNECTIONSTRINGS__[^=]+)[[:space:]]*[:=][[:space:]]*[^[:space:]#].*'
  '^[[:space:]]*VITE_[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE|ACCESS_KEY|API_KEY)[A-Z0-9_]*[[:space:]]*='
  '"private_key"[[:space:]]*:[[:space:]]*"-----BEGIN'
  '(postgres(ql)?|redis)://[^[:space:]/:]+:[^@[:space:]]+@'
  '(Host|Server)=[^;[:space:]]+;[^\n]*(Password|Pwd)=[^;[:space:]]+'
)
for pattern in "${assignment_patterns[@]}"; do
  if grep -RInE --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude='*.map' --exclude='*.md' --exclude='*.example' -- "$pattern" . | grep -vE '\$\{[^}]+\}'; then
    fail "credential-like assignment or client-secret variable detected"
  fi
done

# No VITE variable may be named as a secret. VITE values are bundled into
# browser code and must stay limited to public configuration.
if grep -RInE --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude='*.md' -- \
  '^[[:space:]]*VITE_[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE|ACCESS_KEY|API_KEY)[A-Z0-9_]*[[:space:]]*=' .; then
  fail "secret-bearing VITE variable detected"
fi

# Docker build arguments and image environment variables are public image
# metadata. They must never be named after a secret-bearing value.
if find . -path './node_modules' -prune -o -type f \( -name 'Dockerfile*' -o -name 'docker-compose*.yml' -o -name 'docker-compose*.yaml' \) -print0 | \
  xargs -0 -r grep -nE '^[[:space:]]*(ARG|ENV)[[:space:]]+[^[:space:]]*(SECRET|TOKEN|PASSWORD|PRIVATE|ACCESS_KEY|API_KEY)[^[:space:]]*'; then
  fail "secret-bearing Docker ARG or ENV detected"
fi

# Prevent mutable action references in CI. Exact SHA pinning is preferred.
if find .github/workflows -type f -name '*.yml' -o -name '*.yaml' | xargs -r grep -nE 'uses: .+@(main|master|latest)\b'; then
  fail "mutable GitHub Action reference detected"
fi

# A pnpm workspace must include its lockfile for reproducible builds.
if [ -f package.json ] && [ ! -f pnpm-lock.yaml ]; then
  fail "pnpm-lock.yaml is required for reproducible builds"
fi

if [ "$failures" -gt 0 ]; then
  printf '%s security gate violation(s) found.\n' "$failures" >&2
  exit 1
fi

printf 'Security artifact verification passed.\n'
