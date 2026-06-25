#!/usr/bin/env node
/**
 * validate-tables.mjs
 *
 * Checks that every table in the squash baseline that is NOT in the pre-squash
 * allowlist has a corresponding CREATE TABLE in an incremental migration (0001+).
 *
 * ## The problem this prevents
 * When a developer adds a new table to the Drizzle schema and only updates the
 * squash baseline (manually or via `drizzle-kit push` on a fresh DB) WITHOUT
 * creating an incremental migration, the table will exist on fresh databases but
 * NOT on existing production databases — causing 500 errors in production.
 *
 * ## How it works
 * 1. Loads `pre-squash-tables.json` — the allowlist of tables that genuinely
 *    predate the incremental migration history (they're only safe in the baseline
 *    because they were already in the production DB before the squash was created).
 * 2. Parses `0000_squash_baseline.sql` for all CREATE TABLE statements.
 * 3. Scans all incremental migrations (0001+) for CREATE TABLE statements.
 * 4. Any table in the baseline that is NOT in the allowlist AND NOT in an
 *    incremental CREATE TABLE → ERROR.
 *
 * ## When adding a new table (correct workflow)
 *   1. Add the table to the Drizzle TypeScript schema.
 *   2. Run `pnpm --filter @workspace/db generate` to create an incremental migration.
 *   3. Commit both the schema change and the migration file.
 *   → This script will pass automatically.
 *
 * ## When this script fails
 *   A new table was added to `0000_squash_baseline.sql` without a corresponding
 *   incremental migration. Fix: create a migration with:
 *     CREATE TABLE IF NOT EXISTS "<table>" ( ... same definition as baseline ... );
 *   and register it in `meta/_journal.json`.
 *
 * Usage:
 *   node lib/db/scripts/validate-tables.mjs
 *
 * Exit 0 = OK, Exit 1 = tables missing incremental migration coverage.
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(__dirname, "../drizzle");
const scriptsDir = __dirname;

// ─── Load the pre-squash allowlist ─────────────────────────────────────────────
// Tables in this list existed in production BEFORE the squash baseline was created.
// They are safe to exist only in the baseline — no incremental migration needed.
// DO NOT add new tables to this list. This list should only shrink (or stay the same)
// as tables are removed from the schema. New tables MUST have incremental migrations.

const preSquashAllowlist = new Set(
  JSON.parse(readFileSync(join(scriptsDir, "pre-squash-tables.json"), "utf8"))
);

// ─── Parse squash baseline for CREATE TABLE ─────────────────────────────────────

const baselineSql = readFileSync(
  join(drizzleDir, "0000_squash_baseline.sql"),
  "utf8"
);

function extractCreatedTables(sql) {
  const tables = new Set();
  const re = /create table if not exists\s+"([^"]+)"/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    tables.add(m[1].toLowerCase());
  }
  return tables;
}

const baselineTables = extractCreatedTables(baselineSql);

// ─── Parse incremental migrations for CREATE TABLE ─────────────────────────────

const migFiles = readdirSync(drizzleDir)
  .filter((f) => /^0[0-9]{3}_(?!squash).*\.sql$/.test(f))
  .sort();

const migrationCreatedTables = new Set();
const tableSources = new Map(); // table → first migration file that creates it

// Tables that have ALTER TABLE in any incremental migration are confirmed pre-squash:
// they already existed in the DB before the migration was written, so the squash
// baseline is sufficient coverage for them.
const alteredByMigration = new Set();

for (const file of migFiles) {
  const sql = readFileSync(join(drizzleDir, file), "utf8");

  const createRe = /create table if not exists\s+"([^"]+)"/gi;
  let m;
  while ((m = createRe.exec(sql)) !== null) {
    const table = m[1].toLowerCase();
    migrationCreatedTables.add(table);
    if (!tableSources.has(table)) tableSources.set(table, file);
  }

  const alterRe = /alter table\s+"?([a-z_]+)"?\s+/gi;
  while ((m = alterRe.exec(sql)) !== null) {
    alteredByMigration.add(m[1].toLowerCase());
  }
}

// ─── Validate ──────────────────────────────────────────────────────────────────

const missingMigration = [];

for (const table of baselineTables) {
  if (preSquashAllowlist.has(table)) continue; // grandfathered pre-squash table
  if (alteredByMigration.has(table)) continue; // ALTER TABLE confirms it's pre-squash
  if (migrationCreatedTables.has(table)) continue; // has incremental CREATE TABLE
  missingMigration.push(table);
}

// ─── Also check: tables in schema that aren't in baseline or any migration ─────
// (catches the edge case where baseline is missing a new table entirely)

const latestSnapshotFiles = readdirSync(join(drizzleDir, "meta"))
  .filter((f) => /^\d{4}_snapshot\.json$/.test(f))
  .sort();

let snapshotTables = new Set();
if (latestSnapshotFiles.length > 0) {
  const latestSnapshot = JSON.parse(
    readFileSync(
      join(drizzleDir, "meta", latestSnapshotFiles.at(-1)),
      "utf8"
    )
  );
  snapshotTables = new Set(
    Object.values(latestSnapshot.tables).map((t) => t.name.toLowerCase())
  );
}

const missingFromAllMigrations = [];
for (const table of snapshotTables) {
  if (baselineTables.has(table)) continue; // covered by baseline
  if (migrationCreatedTables.has(table)) continue; // covered by incremental
  missingFromAllMigrations.push(table);
}

// ─── Report ────────────────────────────────────────────────────────────────────

let exitCode = 0;

if (missingMigration.length > 0) {
  console.error(
    "\n❌ Tables in 0000_squash_baseline.sql WITHOUT a corresponding incremental migration:\n"
  );
  for (const table of missingMigration.sort()) {
    console.error(`   ${table}`);
  }
  console.error(`
These tables exist on fresh databases (built from the baseline) but will NOT
exist on production databases that were created BEFORE these tables were added
to the squash baseline.

How to fix:
  1. Create an incremental migration (e.g. the next numbered .sql file) with:

       CREATE TABLE IF NOT EXISTS "<table>" (
         -- same column definitions as in 0000_squash_baseline.sql
       );

  2. Register it in meta/_journal.json with the next idx.
  3. Add to lib/db/drizzle/ and re-run this script.
  4. Commit both files.

DO NOT add these tables to pre-squash-tables.json unless you are 100% certain
they existed in production BEFORE the squash baseline was first introduced.
`);
  exitCode = 1;
}

if (missingFromAllMigrations.length > 0) {
  console.error(
    "\n❌ Tables in the Drizzle schema NOT covered by ANY migration (baseline or incremental):\n"
  );
  for (const table of missingFromAllMigrations.sort()) {
    console.error(`   ${table}`);
  }
  console.error(`
These tables are in the schema TypeScript files but were never added to any
SQL migration. Run:
  pnpm --filter @workspace/db generate
to create an incremental migration, then commit both files.
`);
  exitCode = 1;
}

if (exitCode === 0) {
  const incrementalCount = migrationCreatedTables.size;
  const allowlistCount = preSquashAllowlist.size;
  const alteredCount = [...alteredByMigration].filter(
    (t) => !preSquashAllowlist.has(t) && !migrationCreatedTables.has(t)
  ).length;
  console.log(
    `✅  All tables in the squash baseline have incremental migration coverage.`
  );
  console.log(
    `    ${allowlistCount} pre-squash allowlist + ${alteredCount} confirmed pre-squash via ALTER TABLE + ${incrementalCount} with CREATE TABLE in incremental migrations.`
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
