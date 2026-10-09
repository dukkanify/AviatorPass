-- =============================================================================
-- AviatorPass Migration 044 — Indexed leftover auth catalog
-- =============================================================================
-- Activity, audit, notification prefs, and security settings used to live
-- inside aep-auth.json, so login / inbox / recent-activity parsed ~1 MB of
-- leftover catalog. These tables are the durable home. Runtime also creates
-- them on first use. Activity / audit stay capped at 400 newest rows.

CREATE TABLE IF NOT EXISTS aep_auth_activity_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_auth_activity_actor_idx ON aep_auth_activity_logs (actor_id);
CREATE INDEX IF NOT EXISTS aep_auth_activity_created_idx ON aep_auth_activity_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS aep_auth_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_auth_audit_created_idx ON aep_auth_audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS aep_auth_notification_prefs (
  user_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aep_auth_security_settings (
  user_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
