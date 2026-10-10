-- =============================================================================
-- AviatorPass Migration 045 — Indexed course details
-- =============================================================================
-- Student course and lesson pages used to hydrate the 15MB aep-courses catalog
-- to open one subject. This table is the durable home for one course syllabus
-- keyed by id / code / stable id. Runtime also creates it on first use.

CREATE TABLE IF NOT EXISTS aep_lms_course_details (
  id TEXT PRIMARY KEY,
  code TEXT,
  stable_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_lms_course_details_code_idx ON aep_lms_course_details (code);
CREATE INDEX IF NOT EXISTS aep_lms_course_details_stable_idx ON aep_lms_course_details (stable_id);
