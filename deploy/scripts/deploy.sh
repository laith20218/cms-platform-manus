#!/usr/bin/env bash
# ============================================================
# CMS Platform — Controlled deployment helper
# Deploys the API and student web only after local gates pass.
# Usage: ./deploy.sh staging [version]
# Production requires CONFIRM_PRODUCTION_DEPLOY=YES.
# ============================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

ENVIRONMENT="${1:-staging}"
VERSION="${2:-$(date -u +%Y%m%d-%H%M%S)}"

case "$ENVIRONMENT" in
  staging)
    API_PUBLIC_URL="${CMS_API_URL:-https://staging-api.cms.example.com}"
    WEB_PUBLIC_URL="${CMS_WEB_URL:-https://staging-app.cms.example.com}"
    ;;
  production)
    if [ "${CONFIRM_PRODUCTION_DEPLOY:-}" != "YES" ]; then
      echo "Refusing production deployment: set CONFIRM_PRODUCTION_DEPLOY=YES after explicit release approval."
      exit 64
    fi
    API_PUBLIC_URL="${CMS_API_URL:-https://api.cms.example.com}"
    WEB_PUBLIC_URL="${CMS_WEB_URL:-https://app.cms.example.com}"
    ;;
  *)
    echo "Usage: $0 {staging|production} [version]"
    exit 64
    ;;
esac

for command in railway vercel docker; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Missing required deployment CLI: $command"
    exit 69
  }
done

printf 'Deploy target: %s\nVersion: %s\nAPI: %s\nWeb: %s\n' "$ENVIRONMENT" "$VERSION" "$API_PUBLIC_URL" "$WEB_PUBLIC_URL"

# The source gates run before any image is built or deployment is attempted.
DOTNET_ROLL_FORWARD=Major dotnet test apps/api/CMS.sln -c Release --verbosity minimal
pnpm --filter @cms/student-web test -- --run
pnpm --filter @cms/student-web build
bash scripts/ci/verify-security-artifact.sh

# Docker runtime/build evidence is a separate release gate. This helper performs
# image builds, but compose/Nginx smoke must be completed independently where TLS
# certificates and production-like dependencies are available.
docker build -t "cms-api:$VERSION" -t cms-api:latest ./apps/api
docker build -t "cms-web:$VERSION" -t cms-web:latest \
  --build-arg "VITE_API_URL=$API_PUBLIC_URL/api/v1" \
  --build-arg "VITE_APP_ENV=$ENVIRONMENT" \
  --build-arg "VITE_APP_VERSION=$VERSION" \
  -f ./apps/student-web/Dockerfile .

railway up --service "cms-api-$ENVIRONMENT" --detach

for _ in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 10 "$API_PUBLIC_URL/health/ready" | grep -q "Healthy"; then
    break
  fi
  sleep 5
done
curl --fail --silent --show-error --max-time 10 "$API_PUBLIC_URL/health/ready" | grep -q "Healthy" || {
  echo "API readiness did not become healthy within five minutes."
  exit 70
}

pushd apps/student-web >/dev/null
if [ "$ENVIRONMENT" = "production" ]; then
  vercel --prod --yes
else
  vercel --yes
fi
popd >/dev/null

CMS_API_URL="$API_PUBLIC_URL" CMS_WEB_URL="$WEB_PUBLIC_URL" \
  ./deploy/scripts/smoke-tests.sh "$ENVIRONMENT"

printf 'Deployment and smoke completed: environment=%s version=%s api=%s web=%s\n' \
  "$ENVIRONMENT" "$VERSION" "$API_PUBLIC_URL" "$WEB_PUBLIC_URL"
