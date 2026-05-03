import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./connection.js";

/**
 * Applies all pending Drizzle migrations from the given folder.
 *
 * Migration 0000 uses CREATE TABLE IF NOT EXISTS throughout, so it is safe
 * to run against both fresh databases (creates all tables) and existing
 * databases that already have the schema (all CREATE TABLE statements are
 * no-ops). Migrations 0001–0010 use ALTER TABLE … IF NOT EXISTS and
 * DO $$ guards, so they are also fully idempotent.
 *
 * No custom bootstrap is required: on first use Drizzle creates the
 * drizzle.__drizzle_migrations tracking table and runs every unapplied
 * migration in journal order.
 */
export async function runMigrations(migrationsFolder: string): Promise<void> {
  await migrate(db, { migrationsFolder });
}
