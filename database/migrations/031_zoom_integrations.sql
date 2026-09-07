-- =============================================================================
-- AEP Migration 031 — Instructor Zoom General OAuth integrations
-- One connected Zoom account per instructor. Tokens stored encrypted at rest.
-- =============================================================================

CREATE TABLE IF NOT EXISTS zoom_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  zoom_user_id TEXT NOT NULL,
  zoom_email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'reconnect_required', 'disconnected')),
  scopes TEXT NOT NULL DEFAULT '',
  cached_profile JSONB,
  profile_cached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id),
  UNIQUE (zoom_user_id)
);

CREATE INDEX IF NOT EXISTS idx_zoom_integrations_email ON zoom_integrations(zoom_email);
CREATE INDEX IF NOT EXISTS idx_zoom_integrations_status ON zoom_integrations(status);

ALTER TABLE zoom_meetings
  ADD COLUMN IF NOT EXISTS host_id TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS duration_minutes INT,
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meeting_status TEXT,
  ADD COLUMN IF NOT EXISTS oauth_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS participant_count INT;

ALTER TABLE zoom_integrations ENABLE ROW LEVEL SECURITY;

INSERT INTO settings (key, value, category, description)
VALUES
  ('features.zoom_oauth', 'true', 'features', 'Instructor Zoom General OAuth')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
