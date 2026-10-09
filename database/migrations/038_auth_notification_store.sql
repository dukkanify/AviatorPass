-- =============================================================================
-- AviatorPass Migration 038 — Indexed auth notifications
-- =============================================================================
-- In-app notifications used to live inside aep-auth.json, so every inbox and
-- unread-count read hydrated the whole auth blob. This table is the durable
-- home keyed by user_id. Runtime also creates it on first use.

CREATE TABLE IF NOT EXISTS aep_auth_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_auth_notifications_user_idx
  ON aep_auth_notifications (user_id);

CREATE INDEX IF NOT EXISTS aep_auth_notifications_unread_idx
  ON aep_auth_notifications (user_id, status);
