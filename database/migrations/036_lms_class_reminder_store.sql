-- =============================================================================
-- AviatorPass Migration 036 — Indexed live-class reminder queue
-- =============================================================================
-- Reminders used to live inside aep-classes.json, so every dashboard class
-- read hydrated tens of thousands of sent rows. This table is the durable
-- home for the reminder queue. Runtime also creates it on first use.
-- Finished (sent/cancelled/failed) history is capped in application code.

CREATE TABLE IF NOT EXISTS aep_lms_class_reminders (
  id TEXT PRIMARY KEY,
  live_class_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_lms_class_reminders_class_idx
  ON aep_lms_class_reminders (live_class_id);

CREATE INDEX IF NOT EXISTS aep_lms_class_reminders_due_idx
  ON aep_lms_class_reminders (status, scheduled_for);
