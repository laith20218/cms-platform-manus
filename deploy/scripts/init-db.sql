-- ============================================================
-- CMS Platform — Database Initialization Script
-- Run once on first container start (PostgreSQL 16)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Set timezone
SET TIMEZONE TO 'Asia/Riyadh';

-- Performance tuning (runtime)
SET shared_buffers = '256MB';
SET effective_cache_size = '1GB';
SET work_mem = '8MB';
SET maintenance_work_mem = '128MB';
SET random_page_cost = 1.1;
SET effective_io_concurrency = 200;

-- Log long queries (>1s)
SET log_min_duration_statement = 1000;
SET log_checkpoints = on;
SET log_connections = on;
SET log_disconnections = on;
SET log_lock_waits = on;
SET log_temp_files = 0;
SET log_autovacuum_min_duration = 0;

-- Done
SELECT 'CMS database initialized successfully.' AS status;
