import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import cron from "node-cron";
import { runBirthdayCron } from "./lib/birthday";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runMigrations() {
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS boarding_points json DEFAULT '[]'::json;
    `);
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'feature_flags' AND column_name = 'enabled'
        ) THEN
          ALTER TABLE feature_flags RENAME COLUMN enabled TO is_enabled;
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        id text PRIMARY KEY,
        key text NOT NULL UNIQUE,
        value text,
        label text NOT NULL DEFAULT '',
        description text,
        type text NOT NULL DEFAULT 'string',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users_override integer;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_clients_override integer;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_trips_override integer;
    `);
    await client.query(`
      UPDATE trips SET available_seats = 0 WHERE available_seats < 0;
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'trips_available_seats_non_negative'
        ) THEN
          ALTER TABLE trips ADD CONSTRAINT trips_available_seats_non_negative CHECK (available_seats >= 0);
        END IF;
      END $$;
    `);
    await client.query(`
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
    `);
    // Rename plans columns to match Drizzle schema (price_monthly → monthly_price, price_yearly → annual_price)
    // Guard: only rename when OLD column exists AND NEW column does not, preventing errors in partial-state envs.
    await client.query(`
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
    `);
    // Migrate pipeline stages from 7-column layout to 5-column layout (idempotent)
    // Maps: Novos→Lead, Contato→(merge into Lead), Qualificados→Interessado,
    //       Reservados→Cliente, Proposta→(merge into Cliente), Em Viagem→unchanged, Pós-Venda→Pós-venda
    await client.query(`
      DO $$
      DECLARE
        r_novos RECORD;
        r_contato RECORD;
        r_qualificados RECORD;
        r_reservados RECORD;
        r_proposta RECORD;
        r_pos_venda RECORD;
      BEGIN
        -- Process each tenant that still has the old "Novos" stage
        FOR r_novos IN
          SELECT id, tenant_id, pipeline_id FROM pipeline_stages
          WHERE name = 'Novos'
        LOOP
          -- Find sibling stages scoped to same tenant AND pipeline
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

          -- Rename "Novos" → "Lead"
          UPDATE pipeline_stages SET name = 'Lead', color = '#6366F1', "order" = 1
            WHERE id = r_novos.id;

          -- Move "Contato" deals to "Lead", then delete "Contato"
          IF r_contato.id IS NOT NULL THEN
            UPDATE deals SET stage_id = r_novos.id WHERE stage_id = r_contato.id;
            DELETE FROM pipeline_stages WHERE id = r_contato.id;
          END IF;

          -- Rename "Qualificados" → "Interessado"
          IF r_qualificados.id IS NOT NULL THEN
            UPDATE pipeline_stages SET name = 'Interessado', color = '#F59E0B', "order" = 2
              WHERE id = r_qualificados.id;
          END IF;

          -- Rename "Reservados" → "Cliente"
          IF r_reservados.id IS NOT NULL THEN
            UPDATE pipeline_stages SET name = 'Cliente', color = '#10B981', "order" = 3
              WHERE id = r_reservados.id;
          END IF;

          -- Move "Proposta" deals to "Cliente", then delete "Proposta"
          IF r_proposta.id IS NOT NULL AND r_reservados.id IS NOT NULL THEN
            UPDATE deals SET stage_id = r_reservados.id WHERE stage_id = r_proposta.id;
            DELETE FROM pipeline_stages WHERE id = r_proposta.id;
          END IF;

          -- Fix "Em Viagem" order (scoped to same pipeline)
          UPDATE pipeline_stages SET "order" = 4
            WHERE tenant_id = r_novos.tenant_id AND pipeline_id = r_novos.pipeline_id AND name = 'Em Viagem';

          -- Rename "Pós-Venda" → "Pós-venda" and fix order
          IF r_pos_venda.id IS NOT NULL THEN
            UPDATE pipeline_stages SET name = 'Pós-venda', "order" = 5
              WHERE id = r_pos_venda.id;
          END IF;
        END LOOP;
      END $$;
    `);
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS musical_preferences text;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS food_preferences text;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS internal_rating integer;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_nps integer;
    `);
    await client.query(`
      ALTER TABLE passengers ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_passengers_one_primary_per_reservation
        ON passengers (reservation_id)
        WHERE is_primary = TRUE;
    `);
    await client.query(`
      ALTER TABLE notes ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'note';
      ALTER TABLE notes ADD COLUMN IF NOT EXISTS metadata text;
    `);
    await client.query(`
      ALTER TABLE deals ADD COLUMN IF NOT EXISTS reservation_id text;
    `);
    await client.query(`
      ALTER TABLE reservations ADD COLUMN IF NOT EXISTS seller_id text;
    `);

    // Referral system enhancements
    await client.query(`
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_name text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_email text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_phone text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_name text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_phone text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'percentage';
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS discount_value numeric(5,2) NOT NULL DEFAULT 5;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS discount_applied boolean NOT NULL DEFAULT false;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2);
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS bonus_paid_at TIMESTAMPTZ;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS cookie_id text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS ip_address text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS user_agent text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS landing_page text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS utm_source text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS utm_medium text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS utm_campaign text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS visits_count integer NOT NULL DEFAULT 0;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS first_visit TIMESTAMPTZ;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS last_visit TIMESTAMPTZ;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS reservation_id text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS notes text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    `);
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS referral_code text;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS referred_by_id text;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS total_referrals integer NOT NULL DEFAULT 0;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS successful_referrals integer NOT NULL DEFAULT 0;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS referral_earnings numeric(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS referral_code_generated_at TIMESTAMPTZ;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_referral_code_unique
        ON clients (tenant_id, referral_code)
        WHERE referral_code IS NOT NULL;
    `);
    await client.query(`
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
    `);
    await client.query(`
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
    `);

    // Pipeline: add is_default_web to stages, source + auto_created to deals
    await client.query(`
      ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS is_default_web boolean NOT NULL DEFAULT false;
      ALTER TABLE deals ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
      ALTER TABLE deals ADD COLUMN IF NOT EXISTS auto_created boolean NOT NULL DEFAULT false;
    `);

    // Pipeline: insert "Vitrine" stage (order=2) for existing tenants that don't have it yet,
    // and shift Interessado/Cliente/Em Viagem/Pós-venda orders up by 1.
    await client.query(`
      DO $$
      DECLARE
        r RECORD;
        vitrine_id text;
        lead_stage RECORD;
        interessado_stage RECORD;
      BEGIN
        FOR r IN
          SELECT DISTINCT tenant_id, pipeline_id FROM pipeline_stages
        LOOP
          -- Only process pipelines that don't already have a "Vitrine" stage
          IF NOT EXISTS (
            SELECT 1 FROM pipeline_stages
            WHERE tenant_id = r.tenant_id
              AND pipeline_id = r.pipeline_id
              AND name = 'Vitrine'
          ) THEN
            -- Find the current "Lead" stage order (should be 1)
            SELECT "order" INTO lead_stage FROM pipeline_stages
              WHERE tenant_id = r.tenant_id AND pipeline_id = r.pipeline_id AND name = 'Lead'
              LIMIT 1;

            -- Shift all stages with order >= 2 up by 1 to make room for Vitrine at order=2
            UPDATE pipeline_stages
              SET "order" = "order" + 1
              WHERE tenant_id = r.tenant_id
                AND pipeline_id = r.pipeline_id
                AND "order" >= 2;

            -- Insert the new Vitrine stage at order=2
            vitrine_id := gen_random_uuid()::text;
            INSERT INTO pipeline_stages (id, tenant_id, pipeline_id, name, color, "order", is_final, is_default_web, created_at)
            VALUES (vitrine_id, r.tenant_id, r.pipeline_id, 'Vitrine', '#3B82F6', 2, false, true, now());
          END IF;
        END LOOP;
      END $$;
    `);

    // Reservation numbering system
    await client.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reservation_prefix text;
      ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reservation_number text;
    `);
    await client.query(`
      DROP INDEX IF EXISTS reservations_reservation_number_unique;
      CREATE UNIQUE INDEX IF NOT EXISTS reservations_tenant_reservation_number_unique
        ON reservations (tenant_id, reservation_number)
        WHERE reservation_number IS NOT NULL;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS reservation_sequences (
        tenant_id text NOT NULL,
        year_month text NOT NULL,
        type_code text NOT NULL,
        last_num integer NOT NULL DEFAULT 0,
        PRIMARY KEY (tenant_id, year_month, type_code)
      );
    `);

    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT true;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_opt_in boolean NOT NULL DEFAULT true;
    `);

    await client.query(`
      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS client_id text;
      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_birthday boolean NOT NULL DEFAULT false;
    `);

    await client.query(`
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
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS birthday_messages_tenant_client_year_unique
        ON birthday_messages (tenant_id, client_id, birthday_year)
        WHERE is_manual = false;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_cpf_unique
        ON clients (tenant_id, cpf)
        WHERE cpf IS NOT NULL;
    `);

    await client.query(`
      DO $$
      DECLARE
        null_count bigint;
        already_not_null boolean;
      BEGIN
        SELECT is_nullable = 'NO' INTO already_not_null
          FROM information_schema.columns
          WHERE table_name = 'clients' AND column_name = 'cpf';
        IF already_not_null IS TRUE THEN
          RETURN;
        END IF;
        SELECT COUNT(*) INTO null_count FROM clients WHERE cpf IS NULL;
        IF null_count = 0 THEN
          ALTER TABLE clients ALTER COLUMN cpf SET NOT NULL;
        END IF;
      END $$;
    `);

    await client.query(`
      ALTER TABLE birthday_messages ADD COLUMN IF NOT EXISTS email_opened boolean NOT NULL DEFAULT false;
      ALTER TABLE birthday_messages ADD COLUMN IF NOT EXISTS email_opened_at TIMESTAMPTZ;
    `);

    await client.query(`
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
    `);

    await client.query(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS layout_id TEXT REFERENCES vehicle_layouts(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_type text NOT NULL DEFAULT 'percentage';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2) NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_fixed numeric(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_goal numeric(10,2);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_goals (
        id text PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        month text NOT NULL,
        goal_amount numeric(10,2) NOT NULL DEFAULT 0,
        achieved_amount numeric(10,2) NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS sales_goals_tenant_user_month_unique
        ON sales_goals (tenant_id, user_id, month)
        WHERE status = 'active';
    `);

    await client.query(`
      ALTER TABLE commissions ADD COLUMN IF NOT EXISTS commission_rate numeric(8,4);
      ALTER TABLE commissions ADD COLUMN IF NOT EXISTS commission_type text;
    `);

    await client.query(`
      ALTER TABLE sales_goals ALTER COLUMN month DROP NOT NULL;
    `);

    await client.query(`
      ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT 'monthly';
      ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS year integer;
      ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS month_int integer;
      ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS quarter integer;
      ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS goal_quantity numeric(10,0);
      ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS achieved_quantity numeric(10,0) DEFAULT 0;
      ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS progress_percentage numeric(5,2) DEFAULT 0;
      ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS bonus_amount numeric(10,2);
      ALTER TABLE sales_goals ADD COLUMN IF NOT EXISTS bonus_paid boolean NOT NULL DEFAULT false;
    `);

    await client.query(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS tour_guide text;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS trip_organizer text;
    `);

    await client.query(`
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
    `);

    // Idempotent seed: ensure Starter/Pro/Enterprise plans exist in the DB with correct limits.
    // ON CONFLICT (slug) DO UPDATE — re-applies correct values on every startup to prevent drift.
    await client.query(`
      INSERT INTO plans (id, name, slug, description, monthly_price, annual_price, max_users, max_clients, max_trips, features, is_active, is_featured, sort_order, trial_days, payment_required)
      VALUES
        ('plan_starter',   'Starter',    'starter',    'Para agências iniciantes',     0,   0,    3,   500,  20,  '["Até 3 usuários","500 clientes","20 viagens"]',                                       true,  false, 1, 0,  false),
        ('plan_pro',       'Pro',        'pro',        'Para agências em crescimento', 97,  970,  10,  500, 100, '["Até 10 usuários","500 clientes","100 viagens","Suporte prioritário"]',                true,  true,  2, 14, true),
        ('plan_enterprise','Enterprise', 'enterprise', 'Para grandes operadoras',     397, 3970, 50, 5000, 500, '["Usuários ilimitados","5000 clientes","500 viagens","Suporte dedicado"]',              true,  false, 3, 14, true)
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        monthly_price = EXCLUDED.monthly_price,
        annual_price = EXCLUDED.annual_price,
        max_users = EXCLUDED.max_users,
        max_clients = EXCLUDED.max_clients,
        max_trips = EXCLUDED.max_trips,
        features = EXCLUDED.features,
        is_active = EXCLUDED.is_active,
        is_featured = EXCLUDED.is_featured,
        sort_order = EXCLUDED.sort_order,
        trial_days = EXCLUDED.trial_days,
        payment_required = EXCLUDED.payment_required;
    `);

    logger.info("Startup migrations complete");
  } catch (err) {
    logger.error({ err }, "Startup migration failed");
  } finally {
    client?.release();
  }
}

runMigrations()
  .catch((err) => logger.error({ err }, "runMigrations threw unexpectedly"))
  .then(() => {
    cron.schedule("0 0 * * *", () => {
      logger.info("[birthday] Daily cron triggered");
      runBirthdayCron().catch((err) => logger.error({ err }, "[birthday] Cron failed"));
    }, { timezone: "America/Sao_Paulo" });

    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  });
