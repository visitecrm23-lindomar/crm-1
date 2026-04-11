import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

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
  const client = await pool.connect();
  try {
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
    logger.info("Startup migrations complete");
  } catch (err) {
    logger.error({ err }, "Startup migration failed");
  } finally {
    client.release();
  }
}

runMigrations().then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
});
