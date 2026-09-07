-- Extra payment fields for AviatorPass-owned dynamic Stripe Checkout
ALTER TABLE IF EXISTS payments
  ADD COLUMN IF NOT EXISTS student_id TEXT,
  ADD COLUMN IF NOT EXISTS course_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_event_id TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_stripe_event ON payments (stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_payments_course ON payments (course_id);

ALTER TABLE IF EXISTS courses
  ADD COLUMN IF NOT EXISTS price_amount INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT;
