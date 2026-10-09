-- =============================================================================
-- AviatorPass Migration 043 — Indexed refund requests
-- =============================================================================
-- Refunds used to live inside aep-payments.json, so finance and student
-- refund reads hydrated the catalog. This table is the durable home keyed
-- by student / status. Runtime also creates it on first use.

CREATE TABLE IF NOT EXISTS aep_lms_refunds (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_lms_refunds_student_idx ON aep_lms_refunds (student_id);
CREATE INDEX IF NOT EXISTS aep_lms_refunds_status_idx ON aep_lms_refunds (status);
