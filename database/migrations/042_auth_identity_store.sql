-- =============================================================================
-- AviatorPass Migration 042 — Indexed auth users and sessions
-- =============================================================================
-- Every signed-in request used to parse aep-auth.json (users + sessions +
-- tokens + logs) just to resolve one JWT. These tables are the durable home
-- keyed by id / email / session. Runtime also creates them on first use.

CREATE TABLE IF NOT EXISTS aep_auth_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_auth_users_email_idx ON aep_auth_users (email);
CREATE INDEX IF NOT EXISTS aep_auth_users_role_idx ON aep_auth_users (role);

CREATE TABLE IF NOT EXISTS aep_auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_auth_sessions_user_idx ON aep_auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS aep_auth_sessions_token_idx ON aep_auth_sessions (token_hash);
