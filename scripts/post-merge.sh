#!/bin/bash
set -e
pnpm install --no-frozen-lockfile
pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/scripts seed:plans

# Schema-drift validation — catches columns/tables added to the Drizzle schema
# without a corresponding incremental migration (the silent cause of 500 errors
# on login when a required column is missing from the live DB after a merge).
#
# All four checks are static file analysis; they do not need a live DB connection.
#
#   check            — verifies migration-file hashes are consistent with _journal.json
#   validate-coverage — every ADD COLUMN migration is reflected in the squash baseline
#   validate-columns  — every snapshot column has a corresponding ADD COLUMN migration
#   validate-tables   — every table/column in baseline is explained by a migration
#
# If any check fails the post-merge is aborted and the developer must add the
# missing migration before the merge can proceed.
pnpm --filter @workspace/db run check
pnpm --filter @workspace/db run validate-coverage
pnpm --filter @workspace/db run validate-columns
pnpm --filter @workspace/db run validate-tables
