-- W14.5 (Phase B) — idempotent SQL mirror of the EF migration
-- 20261117120000_DropQuestionExamId (Neon / Postgres).
--
-- Drops the legacy questions.exam_id column (dormant since W14.2: exam composition
-- is authoritative through the exam_questions join, backfilled by Phase53).
-- Postgres automatically drops the dependent FK (fk_questions_exams_exam_id) and
-- the conventional index (ix_questions_exam_id) with the column, so the single
-- DROP COLUMN IF EXISTS is both sufficient and safe to re-run.
--
-- Apply ONLY with supervisor authorization (deploy gate, §2) — NOT part of the
-- W14.5 branch rollout.

ALTER TABLE questions DROP COLUMN IF EXISTS exam_id;

-- Verification (after applying):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'questions' AND column_name = 'exam_id';  -- must return 0 rows
--   SELECT indexname FROM pg_indexes WHERE tablename = 'questions'
--    AND indexname = 'ix_questions_exam_id';                       -- must return 0 rows
