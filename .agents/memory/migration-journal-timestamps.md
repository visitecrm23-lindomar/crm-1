---
name: Migration journal timestamp ordering
description: Drizzle silently skips migrations whose _journal.json `when` is not newer than the last applied one; legacy chain squashed into one idempotent baseline
---

# History squashed into a single consolidated baseline

The legacy `0000`–`0072` chain could NOT rebuild a fresh database: 11 tables
(`email_logs`, `referral_settings`, `birthday_messages`, `calendar_events`,
`invites`, `platform_settings`, `referral_tracking`, `sales_goals`,
`trip_costs`, `usage_tracking`, `vehicle_layouts`) were only ever provisioned
via `drizzle-kit push`, never by a migration, so `migrate` hard-failed at `0015`
(`ALTER TABLE email_logs` on a non-existent table).

**Resolution:** squashed into one idempotent baseline `0000_squash_baseline`
(generated from current schema, then transformed: `CREATE TABLE/INDEX IF NOT
EXISTS` + `DO $$ … EXCEPTION WHEN duplicate_object $$` on every FK).

**Why a single baseline coexists safely with existing DBs:** the migrator reads
the single most-recently-applied migration once and only applies entries whose
`when` exceeds it. The baseline's `when` is set deliberately LOW
(`1745010000000`, below every existing DB watermark) so DBs with migration
history skip it, while empty DBs (no watermark) apply it. Verified: fresh DB →
93 tables; existing DB → skipped, untouched; idempotent on push-only DBs.

**How to apply going forward:**
- NEVER mutate `0000_squash_baseline` or its `when`. To change schema, edit
  `src/schema/` then `pnpm --filter @workspace/db generate` (new idx 1+).
- A truly empty DB never occurs in normal Replit use (checkpoints carry schema
  forward); to test fresh-rebuild, `CREATE DATABASE` a throwaway DB and point
  `DATABASE_URL` at it (build URL via bash param-expansion, don't print secret).

# Migration journal timestamps must strictly increase

Drizzle's node-postgres migrator applies entries from
`lib/db/drizzle/meta/_journal.json` in `when`-timestamp order and **silently
skips** any migration whose `when` is not greater than the most recent
already-applied migration. No error is raised — the migration just never runs.

**Why:** Migration 0071 (`referrals_crm_requires_reservation_id` CHECK
constraint) shipped with `when=1750291200000` (June 2025), earlier than 0070's
`1782800000000`. The migrator treated it as already-applied and skipped it, so
the constraint never existed in dev (and almost certainly not in production).
`drizzle-kit migrate` reported "applied successfully" while doing nothing.

**How to apply:**
- When hand-writing a migration + journal entry, set its `when` strictly
  greater than the previous entry's `when` (these project timestamps are in the
  ~1.78e12 range, not real epoch-now). The MEMORY entry "manual-migration"
  covers the write-SQL + update-journal flow.
- Symptom of this bug: `migrate` says success but the column/constraint is
  absent. Verify directly with psql against `information_schema` /
  `pg_constraint`, and check `drizzle.__drizzle_migrations` ordering.
- `pnpm --filter @workspace/db check` (schema drift) does NOT catch this — it
  compares schema files to migration SQL, not what's actually applied.
