-- Migration: Add billing system schema extensions
-- These columns support the VisiteCRM payment system (PIX, Stripe, plan limits, trials)

-- Invoices: payment method tracking and PIX/Stripe fields
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pix_code text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pix_qr_code_url text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pix_expires_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

-- Subscriptions: trial period and Stripe identifiers
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_start timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Plans: trial period configuration
ALTER TABLE plans ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 0;

-- Seed default plans (Starter, Pro, Enterprise) if not already present
INSERT INTO plans (id, name, slug, description, monthly_price, annual_price, max_users, max_clients, max_trips, features, is_active, is_featured, sort_order, trial_days)
VALUES
  ('plan_starter',  'Starter',    'starter',    'Para agências iniciantes',   0.00,   0.00,   3,   500,   20,  '["Até 3 usuários","500 clientes","20 viagens"]'::json, true, false, 1, 0),
  ('plan_pro',      'Pro',        'pro',        'Para agências em crescimento', 97.00, 970.00, 10, 2000,  100,  '["Até 10 usuários","2000 clientes","100 viagens","Suporte prioritário"]'::json, true, true,  2, 14),
  ('plan_enterprise','Enterprise','enterprise', 'Para grandes operadoras',    397.00,3970.00, 50,10000,  500,  '["Usuários ilimitados","10000 clientes","500 viagens","Suporte dedicado"]'::json, true, false, 3, 14)
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  monthly_price = EXCLUDED.monthly_price,
  annual_price  = EXCLUDED.annual_price,
  max_users    = EXCLUDED.max_users,
  max_clients  = EXCLUDED.max_clients,
  max_trips    = EXCLUDED.max_trips,
  trial_days   = EXCLUDED.trial_days,
  is_active    = EXCLUDED.is_active,
  sort_order   = EXCLUDED.sort_order;
