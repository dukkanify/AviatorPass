-- =============================================================================
-- AviatorPass Migration 037 — Indexed live-class participants
-- =============================================================================
-- Participants used to live inside aep-classes.json, so student calendar and
-- join checks scanned every invite. This table is the durable home keyed by
-- live_class_id / user_id. Runtime also creates it on first use.

CREATE TABLE IF NOT EXISTS aep_lms_class_participants (
  id TEXT PRIMARY KEY,
  live_class_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_lms_class_participants_class_idx
  ON aep_lms_class_participants (live_class_id);

CREATE INDEX IF NOT EXISTS aep_lms_class_participants_user_idx
  ON aep_lms_class_participants (user_id);
