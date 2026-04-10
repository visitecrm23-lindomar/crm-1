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
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'plans' AND column_name = 'price_monthly'
        ) THEN
          ALTER TABLE plans RENAME COLUMN price_monthly TO monthly_price;
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'plans' AND column_name = 'price_yearly'
        ) THEN
          ALTER TABLE plans RENAME COLUMN price_yearly TO annual_price;
        END IF;
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
