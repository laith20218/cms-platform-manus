-- ============================================================================
-- W14.1 — AddWave14ExamsRework — IDEMPOTENT SQL MIRROR (Neon / PostgreSQL 16)
-- Migration twin: 20261116120000_AddWave14ExamsRework (hand-authored, no Designer)
--
-- PURPOSE: supervisor-run application/review on Neon (psql or Neon SQL editor).
-- REPO POLICY (WIP_STATUS §3 ruling, unchanged): the CI/deploy path applies the
-- EF migration automatically — this file is the manual mirror + audit trail,
-- exactly like Phase60AddFileAnnotations.sql before it.
--
-- IDEMPOTENT: every statement is guarded (IF NOT EXISTS / IF EXISTS). Re-running
-- is safe and converges to the same schema state.
-- ============================================================================

START TRANSACTION;

-- ── D1: exam-course bundles ("الدورات الامتحانية") ─────────────────────────
CREATE TABLE IF NOT EXISTS exam_courses (
    id uuid NOT NULL,
    subject_id uuid NOT NULL,
    name_ar character varying(200) NOT NULL,
    name_en character varying(200) NULL,
    description text NULL,
    cover_url character varying(500) NULL,
    year integer NOT NULL,
    semester integer NOT NULL,
    course_type integer NOT NULL,
    free_or_paid boolean NOT NULL,
    sort_order integer NOT NULL,
    status integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT pk_exam_courses PRIMARY KEY (id),
    CONSTRAINT fk_exam_courses_subjects_subject_id FOREIGN KEY (subject_id)
        REFERENCES subjects (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_exam_courses_subject_id_year_semester
    ON exam_courses (subject_id, year, semester);

-- ── D1/D6: bundle ↔ exam join (unique pair) ────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_course_items (
    id uuid NOT NULL,
    exam_course_id uuid NOT NULL,
    exam_id uuid NOT NULL,
    sort_order integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT pk_exam_course_items PRIMARY KEY (id),
    CONSTRAINT fk_exam_course_items_exam_courses_exam_course_id FOREIGN KEY (exam_course_id)
        REFERENCES exam_courses (id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_course_items_exams_exam_id FOREIGN KEY (exam_id)
        REFERENCES exams (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_exam_course_items_exam_course_id_exam_id
    ON exam_course_items (exam_course_id, exam_id);

CREATE INDEX IF NOT EXISTS ix_exam_course_items_exam_id
    ON exam_course_items (exam_id);

-- ── D13: DB-backed practice tracking ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS practice_sessions (
    id uuid NOT NULL,
    student_id uuid NOT NULL,
    exam_model_id uuid NOT NULL,
    started_at timestamp with time zone NOT NULL,
    last_accessed_at timestamp with time zone NOT NULL,
    score numeric NULL,
    status integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT pk_practice_sessions PRIMARY KEY (id),
    CONSTRAINT fk_practice_sessions_students_student_id FOREIGN KEY (student_id)
        REFERENCES students (id) ON DELETE CASCADE,
    CONSTRAINT fk_practice_sessions_exams_exam_model_id FOREIGN KEY (exam_model_id)
        REFERENCES exams (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_practice_sessions_student_id_status
    ON practice_sessions (student_id, status);

CREATE INDEX IF NOT EXISTS ix_practice_sessions_exam_model_id
    ON practice_sessions (exam_model_id);

CREATE TABLE IF NOT EXISTS practice_answers (
    id uuid NOT NULL,
    practice_session_id uuid NOT NULL,
    question_id uuid NOT NULL,
    selected_answer text NULL,
    is_correct boolean NULL,
    answered_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT pk_practice_answers PRIMARY KEY (id),
    CONSTRAINT fk_practice_answers_practice_sessions_practice_session_id FOREIGN KEY (practice_session_id)
        REFERENCES practice_sessions (id) ON DELETE CASCADE,
    CONSTRAINT fk_practice_answers_questions_question_id FOREIGN KEY (question_id)
        REFERENCES questions (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_practice_answers_practice_session_id_question_id
    ON practice_answers (practice_session_id, question_id);

CREATE INDEX IF NOT EXISTS ix_practice_answers_question_id
    ON practice_answers (question_id);

-- ── D3: question usage — 2 = Both (legacy rows keep working everywhere) ────
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_usage integer NOT NULL DEFAULT 2;

-- ── D7: model-paper letter (A/B/C), NULL for normal exams ──────────────────
ALTER TABLE exams ADD COLUMN IF NOT EXISTS model_letter character(1) NULL;

-- ── D12: report classification — 3 = Other (legacy meaning preserved) ──────
ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS report_type integer NOT NULL DEFAULT 3;

-- ── D10: per-question report table ─────────────────────────────────────────
-- The composite supersedes the conventional single-column FK index (EF
-- ForeignKeyIndexConvention drops it — same leading column).
DROP INDEX IF EXISTS ix_error_reports_question_id;
CREATE INDEX IF NOT EXISTS ix_error_reports_question_id_status
    ON error_reports (question_id, status);

-- ── history bookkeeping (keeps `dotnet ef database update` a no-op after) ──
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
SELECT '20261116120000_AddWave14ExamsRework', '9.0.0'
WHERE NOT EXISTS (
    SELECT 1 FROM "__EFMigrationsHistory"
    WHERE "MigrationId" = '20261116120000_AddWave14ExamsRework'
);

COMMIT;
