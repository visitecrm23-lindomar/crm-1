-- Migration: Add billing system schema extensions
-- These columns support the VisiteCRM payment system (PIX, Stripe, plan limits, trials)

-- Invoices: payment method tracking and PIX/Stripe fields
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pix_code text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pix_qr_code_url text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pix_expires_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_invoice_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount numeric(10,2);

-- Subscriptions: trial period and Stripe identifiers
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_start timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Plans: trial period configuration and payment gate
ALTER TABLE plans ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS payment_required boolean NOT NULL DEFAULT false;

-- Tenants: track pending plan selection (set on upgrade request, cleared on confirmation)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pending_plan_id text;

-- Usage tracking: persist usage snapshots per billing period
CREATE TABLE IF NOT EXISTS usage_tracking (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  subscription_id text,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  users_count integer NOT NULL DEFAULT 0,
  clients_count integer NOT NULL DEFAULT 0,
  trips_count integer NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_tracking_tenant_idx ON usage_tracking (tenant_id, period_start);

-- NOTE: Plan seed data (Starter/Pro/Enterprise) is NOT seeded here.
-- Run `pnpm --filter @workspace/scripts run seed:plans` after migrations
-- to populate or refresh plan rows. See scripts/src/seed-plans.ts.
