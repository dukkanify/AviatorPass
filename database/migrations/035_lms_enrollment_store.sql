-- =============================================================================
-- AviatorPass Migration 035 — Indexed LMS enrollments (lifetime store speed)
-- =============================================================================
-- Production still hydrates the course catalog from aep_json_store. Enrollments
-- used to live inside that blob, so every student/admin dashboard read loaded
-- every row. This table is the durable home for LMS enrollments keyed by
-- student_id / course_id. Runtime also creates it on first use.

CREATE TABLE IF NOT EXISTS aep_lms_enrollments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_lms_enrollments_student_idx
  ON aep_lms_enrollments (student_id);

CREATE INDEX IF NOT EXISTS aep_lms_enrollments_course_idx
  ON aep_lms_enrollments (course_id);

CREATE INDEX IF NOT EXISTS aep_lms_enrollments_status_idx
  ON aep_lms_enrollments (status);
