-- Migration 0010: All inline startup migrations extracted from index.ts
-- Every statement is idempotent (IF NOT EXISTS / IF EXISTS guards preserved).
-- Safe to run on both fresh databases (base tables created by 0000) and
-- existing databases that had these changes applied as inline startup SQL.

-- trips.boarding_points: added by old inline migration for pre-0000 databases
-- (0000's CREATE TABLE already includes it, so this is a no-op on fresh DBs)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS boarding_points json DEFAULT '[]'::json;
--> statement-breakpoint
-- feature_flags: rename enabled → is_enabled (guard: only if old column still exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'feature_flags' AND column_name = 'enabled'
  ) THEN
    ALTER TABLE feature_flags RENAME COLUMN enabled TO is_enabled;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_settings (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text,
  label text NOT NULL DEFAULT '',
  description text,
  type text NOT NULL DEFAULT 'string',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users_override integer;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_clients_override integer;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_trips_override integer;
--> statement-breakpoint
UPDATE trips SET available_seats = 0 WHERE available_seats < 0;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trips_available_seats_non_negative'
  ) THEN
    ALTER TABLE trips ADD CONSTRAINT trips_available_seats_non_negative CHECK (available_seats >= 0);
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS invites (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'vendedor',
  invited_by text,
  token text NOT NULL UNIQUE,
  accepted boolean NOT NULL DEFAULT false,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- plans: rename price_monthly → monthly_price and price_yearly → annual_price
-- (guard: only if old columns exist and new ones don't yet)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'price_monthly'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'monthly_price'
  ) THEN
    ALTER TABLE plans RENAME COLUMN price_monthly TO monthly_price;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'price_yearly'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'annual_price'
  ) THEN
    ALTER TABLE plans RENAME COLUMN price_yearly TO annual_price;
  END IF;
END $$;
--> statement-breakpoint
-- pipeline stages: migrate 7-column layout → 5-column layout (idempotent via name guards)
DO $$
DECLARE
  r_novos RECORD;
  r_contato RECORD;
  r_qualificados RECORD;
  r_reservados RECORD;
  r_proposta RECORD;
  r_pos_venda RECORD;
BEGIN
  FOR r_novos IN
    SELECT id, tenant_id, pipeline_id FROM pipeline_stages
    WHERE name = 'Novos'
  LOOP
    SELECT id INTO r_contato FROM pipeline_stages
      WHERE tenant_id = r_novos.tenant_id AND pipeline_id = r_novos.pipeline_id AND name = 'Contato' LIMIT 1;
    SELECT id INTO r_qualificados FROM pipeline_stages
      WHERE tenant_id = r_novos.tenant_id AND pipeline_id = r_novos.pipeline_id AND name = 'Qualificados' LIMIT 1;
    SELECT id INTO r_reservados FROM pipeline_stages
      WHERE tenant_id = r_novos.tenant_id AND pipeline_id = r_novos.pipeline_id AND name = 'Reservados' LIMIT 1;
    SELECT id INTO r_proposta FROM pipeline_stages
      WHERE tenant_id = r_novos.tenant_id AND pipeline_id = r_novos.pipeline_id AND name = 'Proposta' LIMIT 1;
    SELECT id INTO r_pos_venda FROM pipeline_stages
      WHERE tenant_id = r_novos.tenant_id AND pipeline_id = r_novos.pipeline_id AND name = 'Pós-Venda' LIMIT 1;
    UPDATE pipeline_stages SET name = 'Lead', color = '#6366F1', "order" = 1 WHERE id = r_novos.id;
    IF r_contato.id IS NOT NULL THEN
      UPDATE deals SET stage_id = r_novos.id WHERE stage_id = r_contato.id;
      DELETE FROM pipeline_stages WHERE id = r_contato.id;
    END IF;
    IF r_qualificados.id IS NOT NULL THEN
      UPDATE pipeline_stages SET name = 'Interessado', color = '#F59E0B', "order" = 2 WHERE id = r_qualificados.id;
    END IF;
    IF r_reservados.id IS NOT NULL THEN
      UPDATE pipeline_stages SET name = 'Cliente', color = '#10B981', "order" = 3 WHERE id = r_reservados.id;
    END IF;
    IF r_proposta.id IS NOT NULL AND r_reservados.id IS NOT NULL THEN
      UPDATE deals SET stage_id = r_reservados.id WHERE stage_id = r_proposta.id;
      DELETE FROM pipeline_stages WHERE id = r_proposta.id;
    END IF;
    UPDATE pipeline_stages SET "order" = 4
      WHERE tenant_id = r_novos.tenant_id AND pipeline_id = r_novos.pipeline_id AND name = 'Em Viagem';
    IF r_pos_venda.id IS NOT NULL THEN
      UPDATE pipeline_stages SET name = 'Pós-venda', "order" = 5 WHERE id = r_pos_venda.id;
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN IF NOT EXISTS musical_preferences text;
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN IF NOT EXISTS food_preferences text;
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN IF NOT EXISTS internal_rating integer;
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_nps integer;
--> statement-breakpoint
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_passengers_one_primary_per_reservation
  ON passengers (reservation_id)
  WHERE is_primary = TRUE;
--> statement-breakpoint
ALTER TABLE notes ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'note';
--> statement-breakpoint
ALTER TABLE notes ADD COLUMN IF NOT EXISTS metadata text;
--> statement-breakpoint
ALTER TABLE deals ADD COLUMN IF NOT EXISTS reservation_id text;
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS seller_id text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_name text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_email text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_phone text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_name text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_phone text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'percentage';
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS discount_value numeric(5,2) NOT NULL DEFAULT 5;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS discount_applied boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2);
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS bonus_paid_at TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS cookie_id text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS ip_address text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS user_agent text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS landing_page text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS utm_source text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS utm_medium text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS utm_campaign text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS visits_count integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS first_visit TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS last_visit TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS reservation_id text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS notes text;
--> statement-breakpoint
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referral_code text;
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referred_by_id text;
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN IF NOT EXISTS total_referrals integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN IF NOT EXISTS successful_referrals integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referral_earnings numeric(10,2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referral_code_generated_at TIMESTAMPTZ;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_referral_code_unique
  ON clients (tenant_id, referral_code)
  WHERE referral_code IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS referral_tracking (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  cookie_id text NOT NULL UNIQUE,
  referral_code text NOT NULL,
  ip_address text,
  user_agent text,
  device_type text,
  browser text,
  os text,
  first_visit TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_visit TIMESTAMPTZ NOT NULL DEFAULT now(),
  visits_count integer NOT NULL DEFAULT 1,
  pages_visited json,
  converted boolean NOT NULL DEFAULT false,
  converted_at TIMESTAMPTZ,
  reservation_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS referral_settings (
  id text PRIMARY KEY,
  tenant_id text NOT NULL UNIQUE,
  is_enabled boolean NOT NULL DEFAULT true,
  discount_type text NOT NULL DEFAULT 'percentage',
  discount_value numeric(5,2) NOT NULL DEFAULT 5,
  bonus_type text NOT NULL DEFAULT 'credit',
  bonus_value numeric(10,2) NOT NULL DEFAULT 10,
  expiration_days integer NOT NULL DEFAULT 30,
  allow_self_referral boolean NOT NULL DEFAULT false,
  require_first_purchase boolean NOT NULL DEFAULT true,
  share_message text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS is_default_web boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE deals ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE deals ADD COLUMN IF NOT EXISTS auto_created boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- pipeline: insert "Vitrine" stage at order=2 for tenants that don't have it
DO $$
DECLARE
  r RECORD;
  vitrine_id text;
BEGIN
  FOR r IN
    SELECT DISTINCT tenant_id, pipeline_id FROM pipeline_stages
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pipeline_stages
      WHERE tenant_id = r.tenant_id AND pipeline_id = r.pipeline_id AND name = 'Vitrine'
    ) THEN
      UPDATE pipeline_stages
        SET "order" = "order" + 1
        WHERE tenant_id = r.tenant_id AND pipeline_id = r.pipeline_id AND "order" >= 2;
      vitrine_id := gen_random_uuid()::text;
      INSERT INTO pipeline_stages (id, tenant_id, pipeline_id, name, color, "order", is_final, is_default_web, created_at)
      VALUES (vitrine_id, r.tenant_id, r.pipeline_id, 'Vitrine', '#3B82F6', 2, false, true, now());
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reservation_prefix text;
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reservation_number text;
--> statement-breakpoint
DROP INDEX IF EXISTS reservations_reservation_number_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS reservations_tenant_reservation_number_unique
  ON reservations (tenant_id, reservation_number)
  WHERE reservation_number IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reservation_sequences (
  tenant_id text NOT NULL,
  year_month text NOT NULL,
  type_code text NOT NULL,
  last_num integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year_month, type_code)
);
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_opt_in boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS client_id text;
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_birthday boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS birthday_messages (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  client_id text NOT NULL,
  birthday_year integer NOT NULL,
  sent_whatsapp boolean NOT NULL DEFAULT false,
  sent_email boolean NOT NULL DEFAULT false,
  whatsapp_sent_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  whatsapp_error text,
  email_error text,
  coupon_id text,
  coupon_code text,
  converted boolean NOT NULL DEFAULT false,
  is_manual boolean NOT NULL DEFAULT false,
  sent_by_id text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS birthday_messages_tenant_client_year_unique
  ON birthday_messages (tenant_id, client_id, birthday_year)
  WHERE is_manual = false;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_cpf_unique
  ON clients (tenant_id, cpf)
  WHERE cpf IS NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'cpf' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE clients ALTER COLUMN cpf DROP NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE birthday_messages ADD COLUMN IF NOT EXISTS email_opened boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE birthday_messages ADD COLUMN IF NOT EXISTS email_opened_at TIMESTAMPTZ;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS vehicle_layouts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  vehicle_type TEXT,
  rows INTEGER NOT NULL DEFAULT 12,
  cols INTEGER NOT NULL DEFAULT 4,
  floors INTEGER NOT NULL DEFAULT 1,
  numbering_type TEXT NOT NULL DEFAULT 'sequential',
  cells JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
ALTER TABLE trips ADD COLUMN IF NOT EXISTS layout_id TEXT REFERENCES vehicle_layouts(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_type text NOT NULL DEFAULT 'percentage';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_fixed numeric(10,2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_goal numeric(10,2);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sales_goals (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month text,
  goal_amount numeric(10,2) NOT NULL DEFAULT 0,
  achieved_amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS sales_goals_tenant_user_month_unique
  ON sales_goals (tenant_id, user_id, month)
  WHERE status = 'active';
--> statement-breakpoint
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS commission_rate numeric(8,4);
--> statement-breakpoint
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS commission_type text;
--> statement-breakpoint
-- sales_goals.month: drop NOT NULL if it was created with NOT NULL constraint in old inline migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_goals' AND column_name = 'month' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE sales_goals ALTER COLUMN month DROP NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT 'monthly';
--> statement-breakpoint
ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS year integer;
--> statement-breakpoint
ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS month_int integer;
--> statement-breakpoint
ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS quarter integer;
--> statement-breakpoint
ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS goal_quantity numeric(10,0);
--> statement-breakpoint
ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS achieved_quantity numeric(10,0) DEFAULT 0;
--> statement-breakpoint
ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS progress_percentage numeric(5,2) DEFAULT 0;
--> statement-breakpoint
ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS bonus_amount numeric(10,2);
--> statement-breakpoint
ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS bonus_paid boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE trips ADD COLUMN IF NOT EXISTS tour_guide text;
--> statement-breakpoint
ALTER TABLE trips ADD COLUMN IF NOT EXISTS trip_organizer text;
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS commission_sync_status text;
--> statement-breakpoint
-- trips: convert fixed_costs and variable_costs from numeric to json (guard: only if still numeric)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'fixed_costs' AND data_type = 'numeric'
  ) THEN
    ALTER TABLE trips ALTER COLUMN fixed_costs TYPE json USING '[]'::json;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'variable_costs' AND data_type = 'numeric'
  ) THEN
    ALTER TABLE trips ALTER COLUMN variable_costs TYPE json USING '[]'::json;
  END IF;
END $$;
