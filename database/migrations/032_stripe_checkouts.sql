-- Stripe hosted Checkout sessions (lifecycle: pending | paid | failed | refunded)
CREATE TABLE IF NOT EXISTS stripe_checkouts (
  id TEXT PRIMARY KEY,
  stripe_session_id TEXT UNIQUE NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_connect_account_id TEXT,
  mode TEXT NOT NULL DEFAULT 'payment',
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  course_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  instructor_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL,
  amount INTEGER NOT NULL,
  enrollment_id TEXT,
  order_id TEXT,
  payment_id TEXT,
  checkout_url TEXT,
  success_url TEXT NOT NULL,
  cancel_url TEXT NOT NULL,
  failure_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stripe_checkouts_student ON stripe_checkouts (student_id);
CREATE INDEX IF NOT EXISTS idx_stripe_checkouts_course ON stripe_checkouts (course_id);
CREATE INDEX IF NOT EXISTS idx_stripe_checkouts_status ON stripe_checkouts (status);
