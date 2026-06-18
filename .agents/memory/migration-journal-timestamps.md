---
name: Migration journal timestamp ordering
description: Drizzle silently skips migrations whose _journal.json `when` is not newer than the last applied one
---

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
