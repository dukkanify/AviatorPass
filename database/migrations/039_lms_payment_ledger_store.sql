-- =============================================================================
-- AviatorPass Migration 039 — Indexed student payment ledger
-- =============================================================================
-- Orders, invoices, and payment records used to live inside aep-payments.json,
-- so student billing and ATPL paid-order checks hydrated the whole blob.
-- These tables are the durable home keyed by student / order / payment.
-- Runtime also creates them on first use.

CREATE TABLE IF NOT EXISTS aep_lms_payment_orders (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  status TEXT NOT NULL,
  student_email TEXT,
  billing_email TEXT,
  idempotency_key TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_lms_payment_orders_student_idx
  ON aep_lms_payment_orders (student_id);
CREATE INDEX IF NOT EXISTS aep_lms_payment_orders_status_idx
  ON aep_lms_payment_orders (status);
CREATE INDEX IF NOT EXISTS aep_lms_payment_orders_email_idx
  ON aep_lms_payment_orders (student_email);
CREATE INDEX IF NOT EXISTS aep_lms_payment_orders_billing_idx
  ON aep_lms_payment_orders (billing_email);
CREATE INDEX IF NOT EXISTS aep_lms_payment_orders_idempotency_idx
  ON aep_lms_payment_orders (idempotency_key);

CREATE TABLE IF NOT EXISTS aep_lms_payment_invoices (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  payment_id TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_lms_payment_invoices_student_idx
  ON aep_lms_payment_invoices (student_id);
CREATE INDEX IF NOT EXISTS aep_lms_payment_invoices_payment_idx
  ON aep_lms_payment_invoices (payment_id);

CREATE TABLE IF NOT EXISTS aep_lms_payment_records (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  student_id TEXT,
  provider_payment_id TEXT,
  checkout_session_id TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_lms_payment_records_order_idx
  ON aep_lms_payment_records (order_id);
CREATE INDEX IF NOT EXISTS aep_lms_payment_records_provider_idx
  ON aep_lms_payment_records (provider_payment_id);
CREATE INDEX IF NOT EXISTS aep_lms_payment_records_session_idx
  ON aep_lms_payment_records (checkout_session_id);
