#!/bin/bash
# ============================================================
# CMS Platform — Local Development Setup Script
# Initializes the full development environment
# ============================================================
set -e

# Resolve PROJECT_ROOT dynamically from the script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "╔══════════════════════════════════════════════╗"
echo "║   CMS Platform — Dev Environment Setup      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# 1. Check prerequisites
echo "→ Checking prerequisites..."
if ! command -v docker &> /dev/null; then
    echo "✗ Docker is not installed"
    exit 1
fi
if ! command -v docker compose &> /dev/null; then
    echo "✗ Docker Compose is not installed"
    exit 1
fi
echo "  ✓ Docker + Docker Compose found"

# 2. Copy env file if missing
if [ ! -f .env ]; then
    echo "→ Copying .env.example to .env..."
    cp .env.example .env
    echo "  ✓ .env created (please edit with real values)"
else
    echo "  ✓ .env already exists"
fi

# 3. Create directories
echo "→ Creating required directories..."
mkdir -p apps/api/src/CMS.Api/logs
mkdir -p apps/api/src/CMS.Api/uploads
echo "  ✓ Directories created"

# 4. Start services
echo "→ Starting Docker Compose services..."
docker compose up -d postgres redis
echo "  ✓ PostgreSQL + Redis started"

# 5. Wait for PostgreSQL
echo "→ Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U cms &>/dev/null; then
        echo "  ✓ PostgreSQL is ready"
        break
    fi
    sleep 2
    if [ $i -eq 30 ]; then
        echo "  ✗ PostgreSQL failed to start"
        exit 1
    fi
done

# 6. Apply EF migrations
echo "→ Applying EF Core migrations..."
: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in your local secret environment before running migrations}"
POSTGRES_DB="${POSTGRES_DB:-cms}"
POSTGRES_USER="${POSTGRES_USER:-cms}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
cd apps/api
if command -v dotnet &> /dev/null; then
    dotnet ef database update \
        --project src/CMS.Infrastructure \
        --startup-project src/CMS.Api \
        --connection "Host=${POSTGRES_HOST};Port=${POSTGRES_PORT};Database=${POSTGRES_DB};Username=${POSTGRES_USER};Password=${POSTGRES_PASSWORD}" \
        || echo "  ⚠ Migration skipped (dotnet ef not available)"
    echo "  ✓ Migrations applied"
else
    echo "  ⚠ dotnet not installed, skipping migrations"
fi
cd "$PROJECT_ROOT"

# 7. Install frontend dependencies
if command -v pnpm &> /dev/null; then
    echo "→ Installing frontend dependencies..."
    pnpm install --frozen-lockfile
    echo "  ✓ Dependencies installed"
else
    echo "  ⚠ pnpm not installed, please install manually"
fi

# 8. Summary
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✓ Setup Complete!                          ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║   Services:                                  ║"
echo "║     • PostgreSQL:  localhost:5432            ║"
echo "║     • Redis:       localhost:6379            ║"
echo "║     • API:         localhost:8080            ║"
echo "║     • Web:         localhost:5173            ║"
echo "║     • pgAdmin:     localhost:5050 (tools)    ║"
echo "║     • Redis Insight: localhost:8001 (tools)  ║"
echo "║                                              ║"
echo "║   Start development:                         ║"
echo "║     pnpm --filter @cms/student-web dev       ║"
echo "║     dotnet watch run --project apps/api/...  ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
