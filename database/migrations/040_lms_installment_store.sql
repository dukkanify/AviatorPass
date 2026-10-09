-- =============================================================================
-- AviatorPass Migration 040 — Indexed installment plans and schedule
-- =============================================================================
-- Plans and due dates used to live inside aep-payments.json, so student
-- installment reads and reminder crons hydrated the whole catalog. These
-- tables are the durable home keyed by student / plan / status.
-- Runtime also creates them on first use.

CREATE TABLE IF NOT EXISTS aep_lms_installment_plans (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_lms_installment_plans_student_idx
  ON aep_lms_installment_plans (student_id);
CREATE INDEX IF NOT EXISTS aep_lms_installment_plans_order_idx
  ON aep_lms_installment_plans (order_id);
CREATE INDEX IF NOT EXISTS aep_lms_installment_plans_status_idx
  ON aep_lms_installment_plans (status);

CREATE TABLE IF NOT EXISTS aep_lms_installment_schedule (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aep_lms_installment_schedule_plan_idx
  ON aep_lms_installment_schedule (plan_id);
CREATE INDEX IF NOT EXISTS aep_lms_installment_schedule_status_idx
  ON aep_lms_installment_schedule (status);
