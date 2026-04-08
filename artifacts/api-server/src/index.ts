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
