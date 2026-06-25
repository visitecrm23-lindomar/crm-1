#!/usr/bin/env node
/**
 * validate-tables.mjs
 *
 * Two-part inverse coverage check for the Drizzle migration history:
 *
 * CHECK 1 — TABLES
 * Every table in 0000_squash_baseline.sql that is NOT in the pre-squash allowlist
 * (pre-squash-tables.json) must have a corresponding CREATE TABLE in an incremental
 * migration (0001+). Tables confirmed pre-squash via ALTER TABLE references are
 * also accepted.
 *
 * CHECK 2 — COLUMNS
 * Every column that exists in 0000_squash_baseline.sql for a pre-squash table but
 * is NOT in the per-table allowlist (pre-squash-columns.json) must have a
 * corresponding ALTER TABLE ... ADD COLUMN in an incremental migration (0001+).
 *
 * ## The problem these checks prevent
 * When a developer adds a new table or column to the Drizzle schema and only
 * updates the squash baseline WITHOUT creating an incremental migration, the
 * table/column will exist on fresh databases but NOT on existing production
 * databases — causing 500 errors in production.
 *
 * Real examples caught retroactively:
 *   - Tables: ai_integrations, club_config, tenant_integrations (and 5 others)
 *     → fixed by migration 0021_production_missing_schema.sql
 *   - Column: clients.expo_push_token
 *     → also fixed by migration 0021_production_missing_schema.sql
 *
 * ## Correct workflow for adding a new table or column
 *   1. Edit the Drizzle TypeScript schema.
 *   2. Run `pnpm --filter @workspace/db generate` to create an incremental migration.
 *   3. Commit BOTH the schema change and the migration file.
 *   → Both checks will pass automatically.
 *
 * ## When these checks fail
 *   Create a migration with CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
 *   (same definition as in the baseline) and register it in meta/_journal.json.
 *   DO NOT add new items to the allowlist files — those files should never grow.
 *
 * Usage:
 *   node lib/db/scripts/validate-tables.mjs
 *
 * Exit 0 = OK, Exit 1 = tables or columns missing incremental migration coverage.
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(__dirname, "../drizzle");
const scriptsDir = __dirname;

// ─── Load allowlists ────────────────────────────────────────────────────────────
// pre-squash-tables.json: tables that genuinely predate the incremental migration
// history. Safe to be only in the baseline — no incremental migration needed.
// DO NOT add new tables here. New tables MUST have incremental migrations.
const preSquashTableAllowlist = new Set(
  JSON.parse(readFileSync(join(scriptsDir, "pre-squash-tables.json"), "utf8"))
);

// pre-squash-columns.json: per-table map of columns that are known-safe baseline-only
// (they existed in production before the squash was introduced). Any NEW column added
// to the squash baseline for a pre-squash table that is NOT in this map MUST have an
// ADD COLUMN in an incremental migration.
// DO NOT add new columns here. New columns MUST have incremental migrations.
const preSquashColumnAllowlist = JSON.parse(
  readFileSync(join(scriptsDir, "pre-squash-columns.json"), "utf8")
); // { [table]: string[] }

// ─── Parse squash baseline ──────────────────────────────────────────────────────

const baselineSql = readFileSync(
  join(drizzleDir, "0000_squash_baseline.sql"),
  "utf8"
);

// Build table → Set<column> from baseline CREATE TABLE blocks
function buildBaselineMap(sql) {
  const map = new Map(); // table → Set<column>
  const blockRe = /create table if not exists\s+"([^"]+)"\s*\(([\s\S]*?)\);;/gi;
  const colRe =
    /"([a-z_]+)"\s+(?:text|integer|boolean|numeric|json|jsonb|timestamp|timestamptz|uuid|bigint|smallint|real|double)/gi;
  let m;
  while ((m = blockRe.exec(sql)) !== null) {
    const table = m[1].toLowerCase();
    const body = m[2];
    const cols = new Set();
    let cm;
    while ((cm = colRe.exec(body)) !== null) cols.add(cm[1]);
    map.set(table, cols);
  }
  return map;
}

const baselineMap = buildBaselineMap(baselineSql.toLowerCase());

// ─── Parse incremental migrations ──────────────────────────────────────────────

const migFiles = readdirSync(drizzleDir)
  .filter((f) => /^0[0-9]{3}_(?!squash).*\.sql$/.test(f))
  .sort();

const migrationCreatedTables = new Set();
const tableSources = new Map(); // table → first migration file that creates it

// Tables with ALTER TABLE in incremental migrations are confirmed pre-squash:
// they existed in the DB before the migration was written.
const alteredByMigration = new Set();

// Columns added via ADD COLUMN in incremental migrations: table → Set<col>
const migrationAddedColumns = new Map();

for (const file of migFiles) {
  const sql = readFileSync(join(drizzleDir, file), "utf8");

  // CREATE TABLE
  const createRe = /create table if not exists\s+"([^"]+)"/gi;
  let m;
  while ((m = createRe.exec(sql)) !== null) {
    const table = m[1].toLowerCase();
    migrationCreatedTables.add(table);
    if (!tableSources.has(table)) tableSources.set(table, file);
  }

  // ALTER TABLE (for pre-squash confirmation)
  const alterRe = /alter table\s+"?([a-z_]+)"?\s+/gi;
  while ((m = alterRe.exec(sql)) !== null) {
    alteredByMigration.add(m[1].toLowerCase());
  }

  // ADD COLUMN
  const addColRe =
    /alter table\s+"?([a-z_]+)"?\s+add column\s+(?:if not exists\s+)?"?([a-z_]+)"?/gi;
  while ((m = addColRe.exec(sql)) !== null) {
    const table = m[1].toLowerCase();
    const col = m[2].toLowerCase();
    if (!migrationAddedColumns.has(table)) migrationAddedColumns.set(table, new Set());
    migrationAddedColumns.get(table).add(col);
  }
}

// ─── CHECK 1: Tables ───────────────────────────────────────────────────────────

const missingTableMigration = [];

for (const table of baselineMap.keys()) {
  if (preSquashTableAllowlist.has(table)) continue; // grandfathered pre-squash table
  if (alteredByMigration.has(table)) continue; // ALTER TABLE confirms it's pre-squash
  if (migrationCreatedTables.has(table)) continue; // has incremental CREATE TABLE
  missingTableMigration.push(table);
}

// ─── CHECK 2: Columns (for all pre-squash tables — allowlist + ALTER TABLE confirmed)
// For every table in the squash baseline that is considered "pre-squash" (in the
// table allowlist OR confirmed via ALTER TABLE), any column present in the baseline
// but NOT in the per-table column allowlist (pre-squash-columns.json) MUST have an
// ALTER TABLE ... ADD COLUMN in an incremental migration.
//
// Note: tables that were created by incremental migrations (migrationCreatedTables)
// are excluded here — their columns are implicitly covered by their CREATE TABLE.

const missingColumnMigration = []; // { table, col }

for (const [table, baselineCols] of baselineMap) {
  // Skip tables that were properly created by incremental migrations — they're new
  // tables and their full column set is defined in their CREATE TABLE migration.
  if (migrationCreatedTables.has(table)) continue;

  const allowedCols = new Set(preSquashColumnAllowlist[table] ?? []);
  const migCols = migrationAddedColumns.get(table) ?? new Set();

  for (const col of baselineCols) {
    if (allowedCols.has(col)) continue; // grandfathered baseline-only column
    if (migCols.has(col)) continue; // has an ADD COLUMN migration
    missingColumnMigration.push({ table, col });
  }
}

// ─── Also check: tables in Drizzle snapshot not covered by any migration ───────

const latestSnapshotFiles = readdirSync(join(drizzleDir, "meta"))
  .filter((f) => /^\d{4}_snapshot\.json$/.test(f))
  .sort();

let snapshotTables = new Set();
if (latestSnapshotFiles.length > 0) {
  const latestSnapshot = JSON.parse(
    readFileSync(join(drizzleDir, "meta", latestSnapshotFiles.at(-1)), "utf8")
  );
  snapshotTables = new Set(
    Object.values(latestSnapshot.tables).map((t) => t.name.toLowerCase())
  );
}

const missingFromAllMigrations = [];
for (const table of snapshotTables) {
  if (baselineMap.has(table)) continue;
  if (migrationCreatedTables.has(table)) continue;
  missingFromAllMigrations.push(table);
}

// ─── Report ────────────────────────────────────────────────────────────────────

let exitCode = 0;

if (missingTableMigration.length > 0) {
  console.error(
    "\n❌ Tables in 0000_squash_baseline.sql WITHOUT a corresponding incremental migration:\n"
  );
  for (const table of missingTableMigration.sort()) {
    console.error(`   ${table}`);
  }
  console.error(`
These tables exist on fresh databases (built from the baseline) but will NOT
exist on production databases that were created BEFORE these tables were added
to the squash baseline.

How to fix:
  1. Create the next incremental migration (.sql file) with:

       CREATE TABLE IF NOT EXISTS "<table>" (
         -- same column definitions as in 0000_squash_baseline.sql
       );

  2. Register it in meta/_journal.json with the next idx.
  3. Re-run this script — it must exit 0 before merging.

DO NOT add these to pre-squash-tables.json unless you are 100% certain they
existed in production BEFORE the squash baseline was first introduced.
`);
  exitCode = 1;
}

if (missingColumnMigration.length > 0) {
  console.error(
    "\n❌ Columns in 0000_squash_baseline.sql (pre-squash tables) WITHOUT a corresponding ADD COLUMN migration:\n"
  );
  for (const { table, col } of missingColumnMigration.sort(
    (a, b) => a.table.localeCompare(b.table) || a.col.localeCompare(b.col)
  )) {
    console.error(`   ${table}.${col}`);
  }
  console.error(`
These columns exist on fresh databases (built from the baseline) but will NOT
exist on production databases where that column was never applied via migration.

How to fix:
  1. Create the next incremental migration (.sql file) with:

       ALTER TABLE "<table>" ADD COLUMN IF NOT EXISTS "<col>" <type> <default>;

     Use the same type and default as in 0000_squash_baseline.sql.

  2. Register it in meta/_journal.json with the next idx.
  3. Re-run this script — it must exit 0 before merging.

DO NOT add these to pre-squash-columns.json unless you are 100% certain the
column existed in production BEFORE the squash baseline was first introduced.
`);
  exitCode = 1;
}

if (missingFromAllMigrations.length > 0) {
  console.error(
    "\n❌ Tables in the Drizzle schema snapshot NOT covered by ANY migration (baseline or incremental):\n"
  );
  for (const table of missingFromAllMigrations.sort()) {
    console.error(`   ${table}`);
  }
  console.error(`
These tables are in the schema but were never added to any SQL migration. Run:
  pnpm --filter @workspace/db generate
to create an incremental migration, then commit both files.
`);
  exitCode = 1;
}

if (exitCode === 0) {
  const incrementalCount = migrationCreatedTables.size;
  const tableAllowlistCount = preSquashTableAllowlist.size;
  const alteredCount = [...alteredByMigration].filter(
    (t) => !preSquashTableAllowlist.has(t) && !migrationCreatedTables.has(t)
  ).length;
  const totalAllowlistCols = Object.values(preSquashColumnAllowlist).reduce(
    (s, cols) => s + cols.length,
    0
  );
  const totalMigCols = [...migrationAddedColumns.values()].reduce(
    (s, cols) => s + cols.size,
    0
  );
  console.log(
    `✅  CHECK 1 — Tables: all baseline tables have incremental migration coverage.`
  );
  console.log(
    `    ${tableAllowlistCount} pre-squash allowlist + ${alteredCount} confirmed pre-squash via ALTER TABLE + ${incrementalCount} tables with CREATE TABLE migrations.`
  );
  console.log(
    `✅  CHECK 2 — Columns: all new columns in pre-squash tables have ADD COLUMN migrations.`
  );
  console.log(
    `    ${totalAllowlistCols} grandfathered baseline-only columns + ${totalMigCols} columns with ADD COLUMN migrations.`
  );
  if (snapshotTables.size > 0) {
    console.log(
      `    ${snapshotTables.size} total tables in the Drizzle schema snapshot — all covered.`
    );
  }
}

if (migrationCreatedTables.size > 0) {
  console.log(
    `\nℹ️   ${migrationCreatedTables.size} table(s) properly covered by incremental migrations:`
  );
  [...migrationCreatedTables]
    .sort()
    .forEach((t) => console.log(`    ${t}  ← ${tableSources.get(t)}`));
}

process.exit(exitCode);
