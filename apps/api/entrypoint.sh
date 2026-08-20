#!/bin/sh
# ============================================================
# CMS API — Docker Entrypoint Script
# Handles DB migrations + seed + graceful startup
# ============================================================
set -e

echo "============================================="
echo "  CMS API — Starting container..."
echo "  Environment: $ASPNETCORE_ENVIRONMENT"
echo "  Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================="

# Wait for PostgreSQL to be ready
if [ -n "$WAIT_FOR_POSTGRES" ] && [ "$WAIT_FOR_POSTGRES" = "true" ]; then
  echo "→ Waiting for PostgreSQL..."
  POSTGRES_HOST=$(echo "$ConnectionStrings__PostgreSQL" | sed -n 's/.*Host=\([^;]*\).*/\1/p')
  POSTGRES_PORT=$(echo "$ConnectionStrings__PostgreSQL" | sed -n 's/.*Port=\([^;]*\).*/\1/p')
  POSTGRES_PORT=${POSTGRES_PORT:-5432}

  for i in $(seq 1 30); do
    if nc -z "$POSTGRES_HOST" "$POSTGRES_PORT" 2>/dev/null; then
      echo "  ✓ PostgreSQL is reachable at $POSTGRES_HOST:$POSTGRES_PORT"
      break
    fi
    echo "  Attempt $i/30: PostgreSQL not ready yet, retrying in 2s..."
    sleep 2
    if [ $i -eq 30 ]; then
      echo "  ✗ ERROR: PostgreSQL is not reachable after 60 seconds"
      exit 1
    fi
  done
fi

# Wait for Redis to be ready
if [ -n "$WAIT_FOR_REDIS" ] && [ "$WAIT_FOR_REDIS" = "true" ]; then
  echo "→ Waiting for Redis..."
  REDIS_HOST=$(echo "$ConnectionStrings__Redis" | sed -n 's/^\([^:,]*\).*/\1/p')
  REDIS_PORT=$(echo "$ConnectionStrings__Redis" | sed -n 's/.*:\([0-9]*\).*/\1/p')
  REDIS_PORT=${REDIS_PORT:-6379}

  for i in $(seq 1 30); do
    if nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; then
      echo "  ✓ Redis is reachable at $REDIS_HOST:$REDIS_PORT"
      break
    fi
    echo "  Attempt $i/30: Redis not ready yet, retrying in 2s..."
    sleep 2
    if [ $i -eq 30 ]; then
      echo "  ✗ ERROR: Redis is not reachable after 60 seconds"
      exit 1
    fi
  done
fi

# Apply EF Core migrations (if enabled)
if [ -z "$SKIP_MIGRATIONS" ] || [ "$SKIP_MIGRATIONS" = "false" ]; then
  echo "→ Applying EF Core migrations..."
  if dotnet CMS.Api.dll --migrate 2>/dev/null || true; then
    echo "  ✓ Migrations applied (or skipped)"
  else
    echo "  ⚠ Migration command not available, will use auto-migrate on startup"
  fi
fi

# Run as main process
echo "→ Starting CMS API..."
exec dotnet CMS.Api.dll
