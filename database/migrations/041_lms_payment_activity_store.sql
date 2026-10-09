-- =============================================================================
-- AviatorPass Migration 041 — Indexed wallet transactions and payment logs
-- =============================================================================
-- Instructor earnings and payment audit used to live inside aep-payments.json,
-- so wallet and ledger reads hydrated the whole catalog. These tables are the
-- durable home. Wallet rows are never capped. Logs stay at the newest 400.
-- Runtime also creates them on first use.

CREATE TABLE IF NOT EXISTS aep_lms_wallet_transactions (
  id TEXT PRIMARY KEY,
  instructor_id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  order_id TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_lms_wallet_transactions_instructor_idx
  ON aep_lms_wallet_transactions (instructor_id);
CREATE INDEX IF NOT EXISTS aep_lms_wallet_transactions_wallet_idx
  ON aep_lms_wallet_transactions (wallet_id);

CREATE TABLE IF NOT EXISTS aep_lms_transaction_logs (
  id TEXT PRIMARY KEY,
  student_id TEXT,
  instructor_id TEXT,
  kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_lms_transaction_logs_student_idx
  ON aep_lms_transaction_logs (student_id);
CREATE INDEX IF NOT EXISTS aep_lms_transaction_logs_created_idx
  ON aep_lms_transaction_logs (created_at DESC);
