-- ============================================================================
-- R42 (Wave 13.2 hotfix) — RevertHtmlProcessing.sql
--
-- Undoes the Wave 13 upload-time HTML processing for rows already processed by
-- the legacy pipeline (sanitize → CSP-inject → "-ready" sibling swap).
--
-- Run MANUALLY on Neon AFTER the hotfix deploy (psql / Neon SQL editor).
-- Idempotent: rows without a "-ready" suffix are untouched by the WHERE clause,
-- so re-running is safe.
--
-- Semantics:
--   file_url                  → back to the ORIGINAL object key (the bytes the
--                               admin uploaded; with html.sanitize.enabled=false
--                               the backend never writes "-ready" siblings again).
--   content_processing_status → NULL (row is no longer tied to the retired
--                               processing pipeline; the player serves the
--                               original bytes directly and applies protection
--                               client-side: CSP prelude + sandbox + no-download).
--
-- Storage note (out of SQL scope): the "{key}-sanitized" / "{key}-ready"
-- sibling blobs of reverted rows remain in object storage as orphans. They are
-- harmless (unreachable: no row references them) and can be reaped later by a
-- storage-side lifecycle rule if desired.
-- ============================================================================

UPDATE library_files
   SET file_url = REPLACE(file_url, '-ready', ''),
       content_processing_status = NULL
 WHERE type = 'Html' AND file_url LIKE '%-ready';
